import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameCommand } from "../src/frame-draw-list.js";
import type { Shape2DCommand } from "../src/frame-draw-list-2d.js";
import type { Camera2D } from "../src/camera-2d.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WIDTH = 256;
const HEIGHT = 128;
const DEFAULT_CAMERA: Camera2D = { pan: [0, 0], zoom: 1 };
const white = [1, 1, 1, 1] as const;

/** Canvas pixel of a `world2d` point under the default camera: 1 unit = 1 pixel, +y up. */
function pixel(x: number, y: number): [number, number] {
  return [WIDTH / 2 + x, HEIGHT / 2 - y];
}

function channel(pixels: Uint8Array, x: number, y: number, component: number): number {
  return pixels[(y * WIDTH + x) * 4 + component]!;
}

function lit(pixels: Uint8Array, [x, y]: readonly [number, number]): boolean {
  return channel(pixels, x, y, 0) > 10 || channel(pixels, x, y, 1) > 10 || channel(pixels, x, y, 2) > 10;
}

/** How many canvas pixels carry any coverage. */
function litCount(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index]! > 10 || pixels[index + 1]! > 10 || pixels[index + 2]! > 10) count++;
  }
  return count;
}

/** Pixels on an anti-aliased SDF rim: lit, but nowhere near full intensity. */
function softCount(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 1; index < pixels.length; index += 4) {
    const value = pixels[index]!;
    if (value > 10 && value < 240) count++;
  }
  return count;
}

/** `zIndex` stays optional for the same reason every command defaults it: one segment is the
 * pre-`zIndex` order, which is what these cases exercise. */
function shape(partial: Omit<Shape2DCommand, "kind" | "zIndex"> & { zIndex?: number }): FrameCommand {
  return { kind: "shape2d", zIndex: 0, ...partial };
}

/** Shared defaults so each case only spells out the parameters it is about. */
const base = {
  vertexB: [0, 0] as const,
  vertexC: [0, 0] as const,
  cornerRadius: 0,
  thickness: 1,
  filled: true,
  rotation: 0,
  startAngle: 0,
  sweep: 0,
  sides: 0,
  color: white,
  space: "world2d" as const,
  zIndex: 0,
  layer: 1,
};

test("real GPU renders the 2D shape primitives", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4, joints: 4 });
    const shot = async (commands: readonly FrameCommand[], camera: Camera2D = DEFAULT_CAMERA): Promise<Uint8Array> => {
      renderer.prepare(commands, { viewProjection: identity, view: identity }, camera);
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    // Filled disc, stroked disc, ring band and sector, side by side.
    const fills = await shot([
      shape({ ...base, shape: "circle", center: [-80, 0], size: [20, 20] }),
      shape({ ...base, shape: "circle", center: [-20, 0], size: [20, 20], thickness: 6, filled: false }),
      shape({ ...base, shape: "annulus", center: [40, 0], size: [20, 10] }),
      shape({ ...base, shape: "sector", center: [100, 0], size: [20, 20], sweep: Math.PI / 2 }),
    ]);
    // Filled disc: solid inside, empty past the rim.
    expect(lit(fills, pixel(-80, 0))).toBe(true);
    expect(lit(fills, pixel(-80, 18))).toBe(true);
    expect(lit(fills, pixel(-80, 30))).toBe(false);
    // Anti-aliased rim: some pixels are lit without being fully opaque.
    expect(softCount(fills)).toBeGreaterThan(0);
    // Unfilled disc: a band around r = 20 with an empty centre.
    expect(lit(fills, pixel(-20, 0))).toBe(false);
    expect(lit(fills, pixel(-20, 20))).toBe(true);
    expect(lit(fills, pixel(-20, 10))).toBe(false);
    expect(lit(fills, pixel(-20, 30))).toBe(false);
    // Ring band keeps its hole.
    expect(lit(fills, pixel(40, 0))).toBe(false);
    expect(lit(fills, pixel(40, 15))).toBe(true);
    expect(lit(fills, pixel(40, 25))).toBe(false);
    // A sector sweeps anticlockwise from +x, so only its upper-right quadrant is filled.
    expect(lit(fills, pixel(110, 10))).toBe(true);
    expect(lit(fills, pixel(90, -10))).toBe(false);

    // Hexagon, right triangle and diamond.
    const outlines = await shot([
      shape({ ...base, shape: "polygon", center: [-80, 0], size: [20, 20], sides: 6 }),
      // Triangle vertices relative to its centroid, which lands at (-20, -20).
      shape({ ...base, shape: "triangle", center: [-20, -20], size: [-20, -20], vertexB: [40, -20], vertexC: [-20, 40] }),
      shape({ ...base, shape: "rhombus", center: [80, 0], size: [20, 10] }),
    ]);
    // Hexagon: a vertex sits on +x, the corners between vertices are cut off.
    expect(lit(outlines, pixel(-80, 0))).toBe(true);
    expect(lit(outlines, pixel(-61, 0))).toBe(true);
    expect(lit(outlines, pixel(-66, 14))).toBe(false);
    // Triangle: inside the legs, outside the hypotenuse.
    expect(lit(outlines, pixel(-20, -20))).toBe(true);
    expect(lit(outlines, pixel(10, -20))).toBe(false);
    // Rhombus: wide along x, narrowing fast along y.
    expect(lit(outlines, pixel(80, 0))).toBe(true);
    expect(lit(outlines, pixel(98, 0))).toBe(true);
    expect(lit(outlines, pixel(95, 9))).toBe(false);

    // Rotation, ellipse axes and the capsule's round caps.
    const curved = await shot([
      shape({ ...base, shape: "rect", center: [-90, 0], size: [10, 30] }),
      // The same box turned a quarter turn: a 30 half-height becomes a 30 half-width.
      shape({ ...base, shape: "rect", center: [-50, 0], size: [30, 10], rotation: Math.PI / 2 }),
      shape({ ...base, shape: "ellipse", center: [10, 0], size: [30, 10] }),
      shape({ ...base, shape: "capsule", center: [80, 0], size: [10, 20] }),
    ]);
    expect(lit(curved, pixel(-90, 24))).toBe(true);
    expect(lit(curved, pixel(-90, 34))).toBe(false);
    expect(lit(curved, pixel(-50, 24))).toBe(true);
    expect(lit(curved, pixel(-50, 34))).toBe(false);
    expect(lit(curved, pixel(10, 8))).toBe(true);
    expect(lit(curved, pixel(10, 13))).toBe(false);
    expect(lit(curved, pixel(28, 0))).toBe(true);
    expect(lit(curved, pixel(48, 0))).toBe(false);
    expect(lit(curved, pixel(80, 0))).toBe(true);
    expect(lit(curved, pixel(80, 24))).toBe(true);
    expect(lit(curved, pixel(80, 34))).toBe(false);

    // An arc keeps only the swept part of its rim: the ring is clipped to the wedge, so the three
    // quadrants past the 90° sweep stay empty instead of drawing a full circle.
    const arcs = await shot([
      shape({
        ...base,
        shape: "arc",
        center: [0, 0],
        size: [20, 20],
        thickness: 4,
        filled: false,
        startAngle: 0,
        sweep: Math.PI / 2,
      }),
    ]);
    expect(lit(arcs, pixel(20, 0))).toBe(true);
    expect(lit(arcs, pixel(14, 14))).toBe(true);
    expect(lit(arcs, pixel(0, 20))).toBe(true);
    expect(lit(arcs, pixel(-20, 0))).toBe(false);
    expect(lit(arcs, pixel(0, -20))).toBe(false);
    expect(lit(arcs, pixel(0, 0))).toBe(false);

    // Past half a turn an arc is drawn as the complement of the uncovered wedge. That complement
    // test must stay purely angular: a radius term in it would clamp the far side to zero and
    // paint the uncovered part of the ring.
    const wideArc = await shot([
      shape({
        ...base,
        shape: "arc",
        center: [0, 0],
        size: [20, 20],
        thickness: 4,
        filled: false,
        startAngle: 0,
        sweep: Math.PI * 1.2,
      }),
    ]);
    // 108 degrees is inside the 216 degree sweep; 288 degrees is the uncovered wedge.
    expect(lit(wideArc, pixel(-6, 19))).toBe(true);
    expect(lit(wideArc, pixel(6, -19))).toBe(false);

    // Screen space starts at the top-left corner instead of the canvas centre.
    const screen = await shot([
      shape({ ...base, shape: "rect", center: [20, 15], size: [10, 5], space: "screen" }),
    ]);
    expect(lit(screen, [20, 15])).toBe(true);
    expect(lit(screen, [12, 12])).toBe(true);
    expect(lit(screen, [35, 15])).toBe(false);
    expect(lit(screen, [20, 25])).toBe(false);
    expect(lit(screen, [128, 64])).toBe(false);

    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});

test("real GPU cuts every dashed outline into dashes", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4, joints: 4 });
    const shot = async (commands: readonly FrameCommand[]): Promise<Uint8Array> => {
      renderer.prepare(commands, { viewProjection: identity, view: identity }, DEFAULT_CAMERA);
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    const cases: readonly Omit<Shape2DCommand, "kind">[] = [
      { ...base, shape: "rect", center: [0, 0], size: [30, 20] },
      { ...base, shape: "rounded-rect", center: [0, 0], size: [30, 20], cornerRadius: 8 },
      { ...base, shape: "circle", center: [0, 0], size: [24, 24] },
      { ...base, shape: "ellipse", center: [0, 0], size: [30, 18] },
      { ...base, shape: "arc", center: [0, 0], size: [24, 24], startAngle: 0, sweep: Math.PI * 1.2 },
      { ...base, shape: "annulus", center: [0, 0], size: [26, 14] },
      { ...base, shape: "capsule", center: [0, 0], size: [14, 20] },
      { ...base, shape: "polygon", center: [0, 0], size: [24, 24], sides: 6 },
      { ...base, shape: "triangle", center: [0, 0], size: [0, 24], vertexB: [-20, -12], vertexC: [20, -12] },
      { ...base, shape: "rhombus", center: [0, 0], size: [24, 16] },
      { ...base, shape: "sector", center: [0, 0], size: [24, 24], startAngle: -Math.PI / 2, sweep: Math.PI * 1.2 },
      { ...base, shape: "segment", center: [0, 0], size: [24, 24], startAngle: -Math.PI / 2, sweep: Math.PI * 1.2 },
    ];

    for (const spec of cases) {
      const outline = { ...base, ...spec, filled: false, thickness: 4 };
      const solid = await shot([shape(outline)]);
      const dashed = await shot([shape({ ...outline, dash: [10, 10, 0] })]);
      const solidPixels = litCount(solid);
      const dashedPixels = litCount(dashed);
      expect(solidPixels, `${spec.shape} drew nothing`).toBeGreaterThan(0);
      expect(dashedPixels, `${spec.shape} has no visible dashes`).toBeGreaterThan(0);
      // A 50% duty cycle leaves noticeably fewer lit pixels than the unbroken outline.
      expect(dashedPixels, `${spec.shape} has no gaps`).toBeLessThan(solidPixels * 0.85);
    }

    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});

test("real GPU keeps each end of a dashed arc on that end's dash phase", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4, joints: 4 });
    const shot = async (commands: readonly FrameCommand[]): Promise<Uint8Array> => {
      renderer.prepare(commands, { viewProjection: identity, view: identity }, DEFAULT_CAMERA);
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    // An arc of radius 24 over 1.2 turns is 90.48 long, so with a [8, 12] pattern its two ends sit
    // 10.48 apart in pattern space: one phase leaves the start inside a gap while the end sits well
    // inside a dash, the other swaps them. The stroke is half a width wide past each end, and that
    // stub has to read its own end's phase instead of being clamped to the far end.
    const outline = {
      ...base,
      shape: "arc" as const,
      center: [0, 0] as const,
      size: [24, 24] as const,
      thickness: 4,
      filled: false,
      startAngle: 0,
      sweep: Math.PI * 1.2,
    };
    // Just outside the start (359 degrees) and just outside the end (216.4 degrees).
    const beforeStart = pixel(24, -1);
    const pastEnd = pixel(-19, -14);

    const startInGap = await shot([shape({ ...outline, dash: [8, 12, 16] })]);
    expect(lit(startInGap, beforeStart), "the stub before the start inherits the end's dash").toBe(false);
    expect(lit(startInGap, pastEnd), "the stub past the end lost its dash").toBe(true);

    const startInDash = await shot([shape({ ...outline, dash: [8, 12, 4] })]);
    expect(lit(startInDash, beforeStart), "the stub before the start lost its dash").toBe(true);
    expect(lit(startInDash, pastEnd), "the stub past the end inherits the start's dash").toBe(false);

    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});

test("real GPU closes the dashed annulus on each ring", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4, joints: 4 });
    const shot = async (commands: readonly FrameCommand[]): Promise<Uint8Array> => {
      renderer.prepare(commands, { viewProjection: identity, view: identity }, DEFAULT_CAMERA);
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };
    /**
     * Lengths of the lit runs walking around one ring, in samples. A ring whose pattern does not
     * close at the +x seam leaves one run cut short, or a leftover stub between two dashes.
     */
    const runs = (pixels: Uint8Array, radius: number, steps = 1440): number[] => {
      const flags: boolean[] = [];
      for (let index = 0; index < steps; index++) {
        const theta = (index / steps) * Math.PI * 2;
        const x = Math.round(WIDTH / 2 + radius * Math.cos(theta));
        const y = Math.round(HEIGHT / 2 - radius * Math.sin(theta));
        // The sampled circle lands up to a pixel off the stroke centre, so take the brightest
        // neighbour: the ring is two pixels wide and the pattern, not the coverage, is in question.
        let best = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            best = Math.max(best, channel(pixels, x + dx, y + dy, 1));
          }
        }
        flags.push(best > 128);
      }
      const start = flags.indexOf(false);
      if (start < 0) return flags.length === 0 ? [] : [flags.length];
      const lengths: number[] = [];
      let run = 0;
      for (let index = 0; index < steps; index++) {
        if (flags[(start + index) % steps]!) {
          run++;
        } else if (run > 0) {
          lengths.push(run);
          run = 0;
        }
      }
      if (run > 0) lengths.push(run);
      return lengths;
    };

    const outline = {
      ...base,
      shape: "annulus" as const,
      center: [0, 0] as const,
      size: [34, 16] as const,
      thickness: 2,
      filled: false,
    };
    // Both boundaries stroke their own circle, so each one has to carry an even pattern all the
    // way around; a phase jump at the seam shows up as an uneven run length at some phase.
    for (let phase = 0; phase < 32; phase += 4) {
      const pixels = await shot([shape({ ...outline, dash: [24, 8, phase] })]);
      for (const radius of [16, 34]) {
        // Ignore runs under a sample and a half: the dash boundary at the seam is anti-aliased and
        // can flicker a single pixel either way.
        const lengths = runs(pixels, radius).filter((length) => length > 8);
        expect(lengths.length, `${radius} ring has no dashes at phase ${phase}`).toBeGreaterThan(0);
        const shortest = Math.min(...lengths);
        const longest = Math.max(...lengths);
        expect(shortest, `${radius} ring has a stub at phase ${phase}: ${lengths.join("/")}`).toBeGreaterThan(longest * 0.6);
      }
    }

    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});

test("real GPU keeps a closing arc and sector on their own side of the ring", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4, joints: 4 });
    const shot = async (commands: readonly FrameCommand[]): Promise<Uint8Array> => {
      renderer.prepare(commands, { viewProjection: identity, view: identity }, DEFAULT_CAMERA);
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    /** Lit pixels in the half of the canvas the sweep never reaches. */
    const litOnFarSide = (pixels: Uint8Array): number => {
      let count = 0;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH / 2 - 6; x++) {
          const index = (y * WIDTH + x) * 4;
          if (pixels[index]! > 10 || pixels[index + 1]! > 10 || pixels[index + 2]! > 10) count++;
        }
      }
      return count;
    };

    // A shrinking arc spends its last frames with a sweep smaller than strokeWidth / radius. The
    // wedge that clips the ring used to be the intersection of two half-planes, which collapses
    // onto a line through the centre as the sweep closes: the far side of the ring then read a
    // distance of radius * sweep (a pixel or two) and a sliver appeared 180 degrees from the start.
    // A short sweep is under a pixel tall, so sample one pixel above the axis, inside the wedge.
    const near = pixel(19, 1);
    for (const sweep of [0.05, 0.01, 0]) {
      const arc = await shot([
        shape({ ...base, shape: "arc", center: [0, 0], size: [20, 20], thickness: 4, filled: false, sweep }),
      ]);
      // A closed arc has no length left to stroke; any sweep still shorter than a pixel of
      // stroke width keeps its stub at the start.
      expect(lit(arc, near), `the closing arc vanished at sweep ${sweep}`).toBe(sweep > 0);
      expect(litOnFarSide(arc), `the closing arc leaked across the ring at sweep ${sweep}`).toBe(0);
    }

    // The same clip bounds a sector's fill, so it has to hold there as well.
    const sector = await shot([
      shape({ ...base, shape: "sector", center: [0, 0], size: [20, 20], filled: true, sweep: 0.05 }),
    ]);
    expect(lit(sector, near)).toBe(true);
    expect(litOnFarSide(sector)).toBe(0);

    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});
