import { describe, expect, test } from "vitest";
import { DebugDraw3D, FrameDrawList } from "../src/index.js";

describe("FrameDrawList", () => {
  test("collects points and lines without CPU expansion", () => {
    const frame = new FrameDrawList();
    frame.point([0, 1, 2], { size: 4 });
    frame.line([0, 0, 0], [1, 0, 0], { width: 2 });

    expect(frame.points).toHaveLength(1);
    expect(frame.lines).toHaveLength(1);
    expect(frame.commands()).toHaveLength(2);
  });

  test("filters commands by layer mask", () => {
    const frame = new FrameDrawList();
    frame.point([0, 0, 0], { layer: 1 });
    frame.point([1, 0, 0], { layer: 2 });

    expect(frame.commands(1)).toHaveLength(1);
    expect(frame.commands(2)[0]?.layer).toBe(2);
  });

  test("ignores zero-length lines", () => {
    const frame = new FrameDrawList();
    frame.line([0, 0, 0], [0, 0, 0]);
    expect(frame.lines).toHaveLength(0);
  });

  test("per-vertex normals follow the reference strip/loop arity", () => {
    const frame = new FrameDrawList();
    // `draw_line_strip_n` accepts one normal per *segment*.
    frame.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { normals: [[1, 0, 0], [0, 1, 0]] });
    expect(frame.lines.map((line) => line.normal)).toEqual([[1, 0, 0], [0, 1, 0]]);

    const loop = new FrameDrawList();
    expect(() => loop.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { normals: [[1, 0, 0], [0, 1, 0]] }, true))
      .toThrow("at least 3 entries");
    const short = new FrameDrawList();
    expect(() => short.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { normals: [[1, 0, 0]] }))
      .toThrow("at least 2 entries");
  });

  test("resolves a text block's plane rotation, defaulting to the facing plane", () => {
    const frame = new FrameDrawList();
    frame.text([0, 0, 0], "A");
    frame.text([0, 0, 0], "A", { rotation: [-Math.PI / 2, 0, 0] });

    expect(frame.texts[0]?.rotation).toEqual([0, 0, 0]);
    expect(frame.texts[1]?.rotation).toEqual([-Math.PI / 2, 0, 0]);
  });

  test("rejects a non-finite text rotation", () => {
    const frame = new FrameDrawList();
    expect(() => frame.text([0, 0, 0], "A", { rotation: [Number.NaN, 0, 0] })).toThrow("rotation[0]");
    expect(() => frame.text([0, 0, 0], "A", { rotation: [0, 0] as unknown as readonly [number, number, number] })).toThrow("three values");
  });

  test("seals the drawList", () => {
    const frame = new FrameDrawList();
    frame.seal();
    expect(() => frame.point([0, 0, 0])).toThrow("sealed");
  });
});

describe("DebugDraw3D", () => {
  test("owns one active drawList and finishes it", () => {
    const debug = new DebugDraw3D({ defaultVisibleLayers: 1 });
    const frame = debug.beginFrame();
    frame.point([0, 0, 0], { layer: 1 });
    frame.point([1, 0, 0], { layer: 2 });

    expect(debug.finishFrame(frame)).toHaveLength(1);
    expect(() => debug.finishFrame(frame)).toThrow("does not belong");
  });

  test("rejects nested frames", () => {
    const debug = new DebugDraw3D();
    debug.beginFrame();
    expect(() => debug.beginFrame()).toThrow("already active");
  });
});
