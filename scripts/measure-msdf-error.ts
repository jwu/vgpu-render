// Measure the MSDF reconstruction error of the bundled glyph source.
//
// Usage:
//   bun scripts/measure-msdf-error.ts
//
// Reconstructs the coverage a fragment shader would read out of the generated field — bilinear
// filter each channel, then take the median — and compares it against a super-sampled reference
// coverage of the same outline. Reported per character:
//
//   as generated   the field `msdfFromOutline` produces today
//   edge band exact  an upper bound where every texel with |shape distance| <= range is made
//                    exactly right, i.e. the most any per-texel correction could recover
//   edge-band drift  texels whose median is more than half a texel away from the exact distance
//
// The gap between the two is what the error-correction pass in `src/text-msdf.ts` targets: it took
// the mean coverage error from 0.073 to 0.043 (edge band exact: 0.040). Unit tests in
// `tests/text-msdf.test.ts` lock the property itself; this script reports the magnitude, and is the
// measurement any change to the encoder should move.

import { parse } from "opentype.js";
import { decodeEmbeddedTrueTypeFont } from "../src/text-font.js";
import { commandsToSegments } from "../src/text-msdf-font.js";
import { colorOutlineEdges, flattenOutline, msdfFromOutline, type OutlineSegment } from "../src/text-msdf.js";
import { DEFAULT_SDF_RANGE } from "../src/text-sdf.js";

/** Rasterisation size and characters to measure. */
const SIZE = 24;
const RANGE = DEFAULT_SDF_RANGE;
const CHARS = ["A", "W", "g", "e", "1", "@", "8", "S"];
/** Sub-samples per texel edge when building the reference coverage and sampling the field. */
const SUB = 8;

type Line = { readonly from: readonly [number, number]; readonly to: readonly [number, number] };

function outlineLines(segments: readonly OutlineSegment[], steps: number): Line[] {
  return flattenOutline(segments, colorOutlineEdges(segments), steps).map((line) => ({ from: line.from, to: line.to }));
}

function distanceTo(px: number, py: number, lines: readonly Line[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const [ax, ay] = line.from;
    const [bx, by] = line.to;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

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

/** Bilinear sample of one scalar texel grid, clamped at the edges. */
function sample(field: Float64Array, width: number, height: number, px: number, py: number): number {
  const fx = Math.min(Math.max(px - 0.5, 0), width - 1);
  const fy = Math.min(Math.max(py - 0.5, 0), height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = field[y0 * width + x0]!;
  const b = field[y0 * width + x1]!;
  const c = field[y1 * width + x0]!;
  const d = field[y1 * width + x1]!;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

type Channels = readonly [Float64Array, Float64Array, Float64Array];

function decodeChannels(texels: Uint8Array, width: number, height: number): Channels {
  const fields: [Float64Array, Float64Array, Float64Array] = [
    new Float64Array(width * height),
    new Float64Array(width * height),
    new Float64Array(width * height),
  ];
  for (let index = 0; index < width * height; index++) {
    for (let channel = 0; channel < 3; channel++) {
      fields[channel]![index] = (texels[index * 4 + channel]! / 255 - 0.5) * 2 * RANGE;
    }
  }
  return fields;
}

/** Upper bound: every texel whose shape distance fits the encoded band is made exactly right. */
function exactBand(fields: Channels, distances: Float64Array): Channels {
  return fields.map((field) => {
    const out = field.slice();
    for (let index = 0; index < field.length; index++) {
      if (Math.abs(distances[index]!) <= RANGE) out[index] = distances[index]!;
    }
    return out;
  }) as unknown as Channels;
}

type Glyph = {
  readonly width: number;
  readonly height: number;
  readonly distances: Float64Array;
  readonly coverage: Float64Array;
  readonly subX: Float64Array;
  readonly subY: Float64Array;
  readonly texels: Uint8Array;
};

function prepare(character: string, font: ReturnType<typeof parse>): Glyph | undefined {
  const path = font.charToGlyph(character).getPath(0, 0, SIZE);
  if (path.commands.length === 0) return undefined;
  const box = path.getBoundingBox();
  const left = Number.isFinite(box.x1) ? box.x1 : 0;
  const top = Number.isFinite(box.y1) ? box.y1 : 0;
  const width = Math.max(1, Math.ceil(Number.isFinite(box.x2) ? box.x2 - left : 1));
  const height = Math.max(1, Math.ceil(Number.isFinite(box.y2) ? box.y2 - top : 1));
  const segments = commandsToSegments(path.commands as never, left, top);
  // Reference geometry is far denser than the 8-step flattening the encoder uses, so the reference
  // is the shape and not the encoder's own approximation of it.
  const lines = outlineLines(segments, 64);

  const distances = new Float64Array(width * height);
  const coverage = new Float64Array(width * height);
  const subX = new Float64Array(width * height * SUB * SUB);
  const subY = new Float64Array(width * height * SUB * SUB);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const d = distanceTo(x + 0.5, y + 0.5, lines);
      distances[index] = inside(x + 0.5, y + 0.5, lines) ? d : -d;
      let covered = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const sub = index * SUB * SUB + sy * SUB + sx;
          const px = x + (sx + 0.5) / SUB;
          const py = y + (sy + 0.5) / SUB;
          subX[sub] = px;
          subY[sub] = py;
          if (inside(px, py, lines)) covered++;
        }
      }
      coverage[index] = covered / (SUB * SUB);
    }
  }
  return { width, height, distances, coverage, subX, subY, texels: msdfFromOutline(segments, width, height, RANGE) };
}

type Stats = { readonly mae: number; readonly max: number };

/** Reconstructs coverage the way the fragment shader does and compares it with the reference. */
function reconstruct(glyph: Glyph, fields: Channels): Stats {
  let sum = 0;
  let max = 0;
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < glyph.width; x++) {
      const index = y * glyph.width + x;
      let reconstructed = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const sub = index * SUB * SUB + sy * SUB + sx;
          const px = glyph.subX[sub]!;
          const py = glyph.subY[sub]!;
          const d = median3(
            sample(fields[0], glyph.width, glyph.height, px, py),
            sample(fields[1], glyph.width, glyph.height, px, py),
            sample(fields[2], glyph.width, glyph.height, px, py),
          );
          reconstructed += Math.min(Math.max(d + 0.5, 0), 1);
        }
      }
      reconstructed /= SUB * SUB;
      const error = Math.abs(reconstructed - glyph.coverage[index]!);
      sum += error;
      if (error > max) max = error;
    }
  }
  return { mae: sum / (glyph.width * glyph.height), max };
}

const font = parse(decodeEmbeddedTrueTypeFont().buffer);
const rows: string[] = [];
let generatedMae = 0;
let generatedMax = 0;
let exactMae = 0;
let exactMax = 0;
let offBand = 0;
let bandTotal = 0;
let glyphCount = 0;

for (const character of CHARS) {
  const glyph = prepare(character, font);
  if (glyph === undefined) continue;
  glyphCount++;
  const fields = decodeChannels(glyph.texels, glyph.width, glyph.height);
  const generated = reconstruct(glyph, fields);
  const exact = reconstruct(glyph, exactBand(fields, glyph.distances));
  const medianField = new Float64Array(glyph.width * glyph.height);
  for (let index = 0; index < medianField.length; index++) {
    medianField[index] = median3(fields[0][index]!, fields[1][index]!, fields[2][index]!);
  }
  let off = 0;
  let band = 0;
  for (let index = 0; index < medianField.length; index++) {
    if (Math.abs(glyph.distances[index]!) > 1) continue;
    band++;
    if (Math.abs(medianField[index]! - glyph.distances[index]!) > 0.5) off++;
  }
  offBand += off;
  bandTotal += band;
  generatedMae += generated.mae;
  generatedMax = Math.max(generatedMax, generated.max);
  exactMae += exact.mae;
  exactMax = Math.max(exactMax, exact.max);
  rows.push(
    `${character} ${glyph.width}x${glyph.height} | coverage MAE ${generated.mae.toFixed(3)} vs ${exact.mae.toFixed(3)} | worst texel ${generated.max.toFixed(3)} vs ${exact.max.toFixed(3)} | edge-band texels off by >0.5 texel: ${off}/${band}`,
  );
}

console.log(`bundled face at ${SIZE}px, range ${RANGE}, ${SUB}x${SUB} sub-samples per texel`);
console.log(rows.join("\n"));
console.log(`mean coverage MAE: generated ${(generatedMae / glyphCount).toFixed(3)}, edge band exact ${(exactMae / glyphCount).toFixed(3)}`);
console.log(`worst texel:       generated ${generatedMax.toFixed(3)}, edge band exact ${exactMax.toFixed(3)}`);
console.log(`edge-band texels off by more than half a texel: ${offBand}/${bandTotal} (${((offBand / bandTotal) * 100).toFixed(1)}%)`);
