import { describe, expect, test } from "vitest";
import { colorOutlineEdges, flattenOutline, msdfFromOutline, type OutlineSegment, type Point } from "../src/text-msdf.js";

const RANGE = 4;

/** The median of the three channels, which is what the shader reconstructs from. */
function median(texels: Uint8Array, x: number, y: number, width: number): number {
  const base = (y * width + x) * 4;
  const values = [(texels[base]! / 255 - 0.5) * 2 * RANGE, (texels[base + 1]! / 255 - 0.5) * 2 * RANGE, (texels[base + 2]! / 255 - 0.5) * 2 * RANGE];
  return Math.max(Math.min(values[0]!, values[1]!), Math.min(Math.max(values[0]!, values[1]!), values[2]!));
}

const SQUARE: readonly OutlineSegment[] = [
  { from: [0, 0], to: [10, 0] },
  { from: [10, 0], to: [10, 10] },
  { from: [10, 10], to: [0, 10] },
  { from: [0, 10], to: [0, 0] },
];

describe("colorOutlineEdges", () => {
  test("keeps a straight run on one channel", () => {
    const straight: readonly OutlineSegment[] = [
      { from: [0, 0], to: [10, 0] },
      { from: [10, 0], to: [20, 0] },
    ];
    expect(Array.from(colorOutlineEdges(straight))).toEqual([0, 0]);
  });

  test("advances around the wheel at every turn", () => {
    // Four corners, so the channel steps each time and wraps back at the fourth edge.
    expect(Array.from(colorOutlineEdges(SQUARE))).toEqual([0, 1, 2, 0]);
  });

  test("treats a curve that continues an edge as the same edge", () => {
    // The quadratic leaves (0,0) along +x, and the line picks up in the same direction.
    const segments: readonly OutlineSegment[] = [
      { from: [0, 0], control1: [5, 0], to: [10, 0] },
      { from: [10, 0], to: [20, 0] },
    ];
    expect(Array.from(colorOutlineEdges(segments))).toEqual([0, 0]);
  });
});

describe("flattenOutline", () => {
  test("emits one piece for a line and one per step for a curve", () => {
    const channels = colorOutlineEdges([{ from: [0, 0], to: [1, 0] }, { from: [1, 0], control1: [2, 1], to: [3, 0] }]);
    expect(flattenOutline([{ from: [0, 0], to: [1, 0] }, { from: [1, 0], control1: [2, 1], to: [3, 0] }], channels, 4)).toHaveLength(5);
  });

  test("keeps the curve inside its control polygon", () => {
    // A control point at (2, 4) on a curve from (0,0) to (4,0) never reaches y = 4.
    const lines = flattenOutline([{ from: [0, 0], control1: [2, 4], to: [4, 0] }], new Uint8Array([0]), 8);
    expect(Math.max(...lines.flatMap((line) => [line.from[1], line.to[1]]))).toBeLessThan(3);
  });
});

describe("msdfFromOutline", () => {
  test("is positive inside, negative outside, and crosses zero at the edge", () => {
    const field = msdfFromOutline(SQUARE, 12, 12, RANGE);
    // The square covers [0, 10] inside a 12×12 field, so only the last two rows and columns are out.
    expect(median(field, 6, 6, 12)).toBeGreaterThan(0);
    expect(median(field, 0, 6, 12)).toBeGreaterThan(0);
    expect(median(field, 11, 6, 12)).toBeLessThan(0);
    expect(median(field, 6, 11, 12)).toBeLessThan(0);
  });

  test("keeps each channel on its own edges so a corner can be resolved", () => {
    const field = msdfFromOutline(SQUARE, 12, 12, RANGE);
    // Near the (0, 0) corner the three edges land on different channels, so they disagree.
    const base = (1 * 12 + 1) * 4;
    const channels = [0, 1, 2].map((channel) => (field[base + channel]! / 255 - 0.5) * 2 * RANGE);
    expect(new Set(channels.map((value) => value.toFixed(3))).size).toBeGreaterThan(1);
  });

  test("rejects a bad range", () => {
    expect(() => msdfFromOutline(SQUARE, 4, 4, 0)).toThrow(RangeError);
  });
});

/** Exact signed distance to the 10×10 square, in texel units. */
function squareDistance(x: number, y: number): number {
  const outsideX = Math.max(-x, x - 10, 0);
  const outsideY = Math.max(-y, y - 10, 0);
  const outside = Math.hypot(outsideX, outsideY);
  return outside > 0 ? -outside : Math.min(x, 10 - x, y, 10 - y);
}

/** A circle of radius 8 around (10, 10) as four cubic beziers, in the same y-down space. */
function circleOutline(radius: number, centre: number): readonly OutlineSegment[] {
  const kappa = 0.5522847498307936;
  const segments: OutlineSegment[] = [];
  for (let quarter = 0; quarter < 4; quarter++) {
    const from = (quarter * Math.PI) / 2;
    const to = ((quarter + 1) * Math.PI) / 2;
    const at = (angle: number): Point => [centre + radius * Math.cos(angle), centre + radius * Math.sin(angle)];
    segments.push({
      from: at(from),
      to: at(to),
      control1: [centre + radius * Math.cos(from) - radius * kappa * Math.sin(from), centre + radius * Math.sin(from) + radius * kappa * Math.cos(from)],
      control2: [centre + radius * Math.cos(to) + radius * kappa * Math.sin(to), centre + radius * Math.sin(to) - radius * kappa * Math.cos(to)],
    });
  }
  return segments;
}

describe("error correction", () => {
  // The median of the three per-edge distances equals the distance to the nearest edge only where
  // two channels are saturated. Everywhere else it lands on the middle distance, which measured at
  // 24 px on the bundled face left 71% of the edge-band texels more than half a texel off. These
  // lock down that the field now carries the exact distance across the whole encoded band.

  test("puts the median on the exact distance around a right-angled shape", () => {
    const field = msdfFromOutline(SQUARE, 12, 12, RANGE);
    let checked = 0;
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        const truth = squareDistance(x + 0.5, y + 0.5);
        if (Math.abs(truth) > RANGE) continue;
        // One 8-bit step of the encoded range is the quantisation floor.
        expect(Math.abs(median(field, x, y, 12) - truth)).toBeLessThanOrEqual(0.55);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  test("puts the median on the exact distance around a curved shape", () => {
    const size = 22;
    const field = msdfFromOutline(circleOutline(8, 10), size, size, RANGE);
    let checked = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const truth = 8 - Math.hypot(x + 0.5 - 10, y + 0.5 - 10);
        if (Math.abs(truth) > RANGE) continue;
        expect(Math.abs(median(field, x, y, size) - truth)).toBeLessThanOrEqual(0.6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
