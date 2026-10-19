import { describe, expect, test } from "vitest";
import { FrameDrawList } from "../src/index.js";
import { orderedZIndexes, rangesByZIndex, sortedByZIndex, zIndexesOf } from "../src/draw-order.js";

type Keyed = { readonly zIndex: number; readonly id: string };
const keyed = (id: string, zIndex: number): Keyed => ({ id, zIndex });

describe("zIndex recording", () => {
  test("defaults both 2D primitives and text to one key", () => {
    const frame = new FrameDrawList();
    frame.d2.line([0, 0], [1, 0]);
    frame.d2.point([0, 0]);
    frame.d2.circle([0, 0], 4);
    frame.text([0, 0, 0], "label");

    expect(frame.d2.lines[0]?.zIndex).toBe(0);
    expect(frame.d2.points[0]?.zIndex).toBe(0);
    expect(frame.d2.shapes[0]?.zIndex).toBe(0);
    expect(frame.texts[0]?.zIndex).toBe(0);
  });

  test("keeps an explicit key on every kind, including the joint a strip emits", () => {
    const frame = new FrameDrawList();
    frame.d2.point([0, 0], { zIndex: -2 });
    frame.d2.line([0, 0], [10, 0], { zIndex: 3 });
    frame.d2.circle([0, 0], 4, { zIndex: 1 });
    frame.d2.lineStrip([[0, 0], [10, 0], [10, 10]], { joint: "round", zIndex: 2 });
    frame.text([0, 0, 0], "label", { zIndex: -1 });

    expect(frame.d2.points[0]?.zIndex).toBe(-2);
    expect(frame.d2.lines[0]?.zIndex).toBe(3);
    expect(frame.d2.shapes[0]?.zIndex).toBe(1);
    expect(frame.d2.joints[0]?.zIndex).toBe(2);
    expect(frame.texts[0]?.zIndex).toBe(-1);
  });

  test("a text default reaches a block that names no key of its own", () => {
    const frame = new FrameDrawList({ text: { zIndex: 5 } });
    frame.text([0, 0, 0], "label");
    expect(frame.texts[0]?.zIndex).toBe(5);
  });

  test("rejects a non-integer key", () => {
    const frame = new FrameDrawList();
    expect(() => frame.d2.line([0, 0], [1, 0], { zIndex: 0.5 })).toThrow("zIndex must be an integer");
    expect(() => frame.text([0, 0, 0], "label", { zIndex: 0.5 })).toThrow("zIndex must be an integer");
  });

  test("rejects a key outside the documented range", () => {
    const frame = new FrameDrawList();
    expect(() => frame.d2.point([0, 0], { zIndex: 9 })).toThrow("zIndex must be between -8 and 8");
    expect(() => frame.d2.point([0, 0], { zIndex: -9 })).toThrow("zIndex must be between -8 and 8");
    expect(() => frame.text([0, 0, 0], "label", { zIndex: 9 })).toThrow("zIndex must be between -8 and 8");
  });

  test("validates a text default at construction time", () => {
    expect(() => new FrameDrawList({ text: { zIndex: 100 } })).toThrow("zIndex must be between -8 and 8");
  });
});

describe("segment ordering", () => {
  test("sorts by key and keeps recording order inside a key", () => {
    const sorted = sortedByZIndex([keyed("a", 2), keyed("b", 0), keyed("c", 2), keyed("d", 0)]);
    expect(sorted.map((command) => command.id)).toEqual(["b", "d", "a", "c"]);
  });

  test("does not mutate the caller's array", () => {
    const commands = [keyed("a", 2), keyed("b", 0)];
    sortedByZIndex(commands);
    expect(commands.map((command) => command.id)).toEqual(["a", "b"]);
  });

  test("assigns one contiguous instance run per key", () => {
    const sorted = sortedByZIndex([keyed("a", 1), keyed("b", 0), keyed("c", 1), keyed("d", 2)]);
    expect(rangesByZIndex(sorted, [0, 1, 2])).toEqual([
      { start: 0, count: 1 },
      { start: 1, count: 2 },
      { start: 3, count: 1 },
    ]);
  });

  test("gives a list that a key does not use an empty run, keeping the alignment", () => {
    const sorted = sortedByZIndex([keyed("a", 1)]);
    expect(rangesByZIndex(sorted, [0, 1, 2])).toEqual([
      { start: 0, count: 0 },
      { start: 0, count: 1 },
      { start: 1, count: 0 },
    ]);
  });

  test("collects keys ascending and deduplicated across groups", () => {
    expect(orderedZIndexes([[2, 0], [1, 2]])).toEqual([0, 1, 2]);
    expect(zIndexesOf([[keyed("a", 1)], [keyed("b", 1), keyed("c", 0)]])).toEqual([0, 1]);
    expect(orderedZIndexes([[], []])).toEqual([]);
  });
});
