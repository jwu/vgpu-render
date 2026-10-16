import { describe, expect, test } from "vitest";
import { colorOutlineEdges, flattenOutline, msdfFromOutline, type OutlineSegment } from "../src/text-msdf.js";

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
