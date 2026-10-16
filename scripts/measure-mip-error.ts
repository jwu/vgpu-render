// Measure how well a distance field's mip chain minifies.
//
// Usage:
//   bun scripts/measure-mip-error.ts
//
// A level of the chain is sampled where one of its texels lands on one screen pixel, and there the
// fragment shader has a single texel to report what the whole block it came from covered. The
// coverage of the shape, box-averaged the same way, is that ideal answer — it is exactly what a
// coverage mask's own mip chain produces — so it is the reference everything below is compared to.
//
// Two choices can deviate from it, and this script separates them:
//
//   mip      how a level is built. The shipped chain (`downsamplePage`) averages stored distances;
//            the alternative here reads each stored value as the coverage it implies, averages
//            that, and encodes the result back.
//   shader   the range a level is decoded against. The shipped shader uses the level-0 range and
//            lets the hardware choose the level; the alternative scales the range by that level
//            (`2^lod`) and samples it explicitly.
//
// Both alternatives are implemented here rather than imported, because they are the thing being
// evaluated: `src/` holds whichever one won.
//
// The result is the reason `src/` holds what it holds: the shipped pair is already within the noise
// of the best pair measured, and mismatching a mip with a range costs an order of magnitude more
// than either choice alone. Re-run this before changing how the chain is filtered.
//
// The shader sums the derivative of both uv axes (`dot`), so its range is twice the per-axis value,
// and it never lets the range fall below one pixel. Both are reproduced here: a measurement that
// skips either reports an error the renderer does not have.

import type { MipLevel } from "../src/text-atlas.js";
import { msdfFromOutline, type OutlineSegment } from "../src/text-msdf.js";
import { DEFAULT_SDF_RANGE } from "../src/text-sdf.js";

/** Page edge, in texels. A power of two so every level blocks up evenly. */
const SIZE = 64;
const RANGE = DEFAULT_SDF_RANGE;
/** Sub-samples per texel edge when building the reference coverage. */
const SUB = 8;
/** Levels of the chain, level 0 included. */
const LEVELS = 5;
/** Deepest level the shader samples: the default 512 px page with four mip levels. */
const MAX_LOD = 3;

type Point = readonly [number, number];

function polygon(points: readonly Point[]): readonly OutlineSegment[] {
  return points.map((from, index) => ({ from, to: points[(index + 1) % points.length]! }));
}

function rect(x: number, y: number, width: number, height: number): readonly OutlineSegment[] {
  return polygon([
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]);
}

/** A regular polygon approximation of a circle. */
function circle(cx: number, cy: number, radius: number): readonly OutlineSegment[] {
  const sides = 48;
  return polygon(
    Array.from({ length: sides }, (_unused, index): Point => {
      const angle = (index / sides) * Math.PI * 2;
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    }),
  );
}

const SHAPES: readonly { readonly name: string; readonly segments: readonly OutlineSegment[] }[] = [
  // Thin ink is where an averaged distance and an averaged coverage part ways: a stem narrower than
  // the block it falls into is only as wide as the coverage says it is.
  { name: "stem 1px", segments: rect(32, 8, 1, 48) },
  { name: "stem 1.5px", segments: rect(32, 8, 1.5, 48) },
  { name: "stem 3px", segments: rect(32, 8, 3, 48) },
  { name: "diagonal 2px", segments: polygon([[12, 24], [30, 12], [52, 40], [34, 52]]) },
  { name: "solid disc", segments: circle(32, 32, 22) },
  { name: "ring", segments: [...circle(32, 32, 22), ...circle(32, 32, 17)] },
];

type Line = { readonly from: Point; readonly to: Point };

function inside(px: number, py: number, lines: readonly Line[]): boolean {
  let isInside = false;
  for (const line of lines) {
    const [ax, ay] = line.from;
    const [bx, by] = line.to;
    if (ay > py !== by > py) {
      const crossing = ax + ((py - ay) / (by - ay)) * (bx - ax);
      if (px < crossing) isInside = !isInside;
    }
  }
  return isInside;
}

const median3 = (r: number, g: number, b: number): number => Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Coverage each level-0 texel carries, sampled from the geometry rather than from the field. */
function referenceCoverage(lines: readonly Line[]): Float64Array {
  const coverage = new Float64Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let covered = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          if (inside(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB, lines)) covered++;
        }
      }
      coverage[y * SIZE + x] = covered / (SUB * SUB);
    }
  }
  return coverage;
}

/** The same block average a coverage mask's mip chain performs. */
function boxAverage(field: Float64Array, size: number, level: number): Float64Array {
  const block = 1 << level;
  const out = Math.max(1, size >> level);
  const result = new Float64Array(out * out);
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      let sum = 0;
      for (let dy = 0; dy < block; dy++) {
        for (let dx = 0; dx < block; dx++) {
          sum += field[Math.min(y * block + dy, size - 1) * size + Math.min(x * block + dx, size - 1)]!;
        }
      }
      result[y * out + x] = sum / (block * block);
    }
  }
  return result;
}

/** The 2×2 average both chains share, with `distance` channels carried through coverage. */
function resample(data: Uint8Array, size: number, distance: boolean): Uint8Array {
  const half = Math.max(1, size >> 1);
  const result = new Uint8Array(half * half * 4);
  const read = (value: number): number => (distance ? clamp01((value / 255 - 0.5) * 2 * RANGE + 0.5) : value);
  const write = (mean: number): number => {
    if (!distance) return Math.round(mean);
    const value = Math.round(((mean - 0.5) / (2 * RANGE) + 0.5) * 255);
    return value < 0 ? 0 : value > 255 ? 255 : value;
  };
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const sums = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) {
        const sourceY = Math.min(y * 2 + dy, size - 1);
        for (let dx = 0; dx < 2; dx++) {
          const sourceX = Math.min(x * 2 + dx, size - 1);
          const index = (sourceY * size + sourceX) * 4;
          // RGB holds the three distances, alpha whatever the encoding put there.
          for (let channel = 0; channel < 4; channel++) {
            sums[channel] += read(data[index + channel]!);
          }
        }
      }
      const target = (y * half + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        result[target + channel] = write(sums[channel]! / 4);
      }
    }
  }
  return result;
}

/** Builds a page's chain with one of the two filters. */
function chain(data: Uint8Array, size: number, levels: number, distance: boolean): readonly MipLevel[] {
  const result: MipLevel[] = [{ size, data }];
  let current = data;
  let currentSize = size;
  while (result.length < levels && currentSize > 1) {
    current = resample(current, currentSize, distance);
    currentSize = Math.max(1, currentSize >> 1);
    result.push({ size: currentSize, data: current });
  }
  return result;
}

/** What the fragment shader reads out of one level: median of RGB, decoded to coverage. */
function decode(level: MipLevel, screenPxRange: number): Float64Array {
  const out = new Float64Array(level.size * level.size);
  for (let index = 0; index < out.length; index++) {
    const base = index * 4;
    const value = median3(level.data[base]!, level.data[base + 1]!, level.data[base + 2]!);
    out[index] = clamp01(screenPxRange * (value / 255 - 0.5) + 0.5);
  }
  return out;
}

function compare(actual: Float64Array, reference: Float64Array): { readonly mae: number; readonly worst: number } {
  let sum = 0;
  let worst = 0;
  for (let index = 0; index < actual.length; index++) {
    const error = Math.abs(actual[index]! - reference[index]!);
    sum += error;
    if (error > worst) worst = error;
  }
  return { mae: sum / actual.length, worst };
}

type Combination = { readonly mip: "distance" | "coverage"; readonly shader: "level-0 range" | "level range" };

const COMBINATIONS: readonly Combination[] = [
  { mip: "distance", shader: "level-0 range" },
  { mip: "distance", shader: "level range" },
  { mip: "coverage", shader: "level-0 range" },
  { mip: "coverage", shader: "level range" },
];

const key = (combination: Combination): string => `${combination.mip} mip + ${combination.shader}`;
const rows: string[] = [];
const totals = new Map<string, number>(COMBINATIONS.map((combination) => [key(combination), 0]));
let samples = 0;

for (const shape of SHAPES) {
  const lines: Line[] = shape.segments.map((segment) => ({ from: segment.from, to: segment.to }));
  const field = msdfFromOutline(shape.segments, SIZE, SIZE, RANGE);
  const chains = {
    distance: chain(field, SIZE, LEVELS, false),
    coverage: chain(field, SIZE, LEVELS, true),
  };
  const coverage = referenceCoverage(lines);
  for (let level = 1; level < LEVELS; level++) {
    const ideal = boxAverage(coverage, SIZE, level);
    // One level-L texel lands on one screen pixel, which is where the chain is meant to be sampled.
    const pixelsPerTexel = 1 << level;
    const cells: string[] = [];
    for (const combination of COMBINATIONS) {
      const lod = combination.shader === "level range" ? Math.min(level, MAX_LOD) : 0;
      const screenPxRange = Math.max((2 * 2 * RANGE * 2 ** lod) / pixelsPerTexel, 1);
      const stats = compare(decode(chains[combination.mip][level]!, screenPxRange), ideal);
      cells.push(`${stats.mae.toFixed(3)}/${stats.worst.toFixed(3)}`);
      totals.set(key(combination), totals.get(key(combination))! + stats.mae);
    }
    samples++;
    rows.push(`${shape.name.padEnd(13)} L${level} | ${cells.join(" | ")}`);
  }
}

console.log(`synthetic shapes, ${SIZE}px page, range ${RANGE}, ${SUB}x${SUB} sub-samples, reference = coverage box-averaged`);
console.log(`columns: ${COMBINATIONS.map((combination) => key(combination)).join(" | ")}`);
console.log("cells are mean/worst |error| against the reference, in alpha units\n");
console.log(rows.join("\n"));
console.log("");
for (const combination of COMBINATIONS) {
  console.log(`${key(combination).padEnd(34)} mean over all levels ${(totals.get(key(combination))! / samples).toFixed(4)}`);
}
