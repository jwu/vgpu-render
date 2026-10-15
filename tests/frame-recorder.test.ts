import { describe, expect, test } from "vitest";
import { DebugDraw3D, FrameRecorder } from "../src/index.js";

describe("FrameRecorder", () => {
  test("collects points and lines without CPU expansion", () => {
    const frame = new FrameRecorder();
    frame.point([0, 1, 2], { size: 4 });
    frame.line([0, 0, 0], [1, 0, 0], { width: 2 });

    expect(frame.points).toHaveLength(1);
    expect(frame.lines).toHaveLength(1);
    expect(frame.commands()).toHaveLength(2);
  });

  test("filters commands by layer mask", () => {
    const frame = new FrameRecorder();
    frame.point([0, 0, 0], { layer: 1 });
    frame.point([1, 0, 0], { layer: 2 });

    expect(frame.commands(1)).toHaveLength(1);
    expect(frame.commands(2)[0]?.layer).toBe(2);
  });

  test("ignores zero-length lines", () => {
    const frame = new FrameRecorder();
    frame.line([0, 0, 0], [0, 0, 0]);
    expect(frame.lines).toHaveLength(0);
  });

  test("per-vertex normals follow the reference strip/loop arity", () => {
    const frame = new FrameRecorder();
    // `draw_line_strip_n` accepts one normal per *segment*.
    frame.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { normals: [[1, 0, 0], [0, 1, 0]] });
    expect(frame.lines.map((line) => line.normal)).toEqual([[1, 0, 0], [0, 1, 0]]);

    const loop = new FrameRecorder();
    expect(() => loop.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { normals: [[1, 0, 0], [0, 1, 0]] }, true))
      .toThrow("at least 3 entries");
    const short = new FrameRecorder();
    expect(() => short.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { normals: [[1, 0, 0]] }))
      .toThrow("at least 2 entries");
  });

  test("seals the recorder", () => {
    const frame = new FrameRecorder();
    frame.seal();
    expect(() => frame.point([0, 0, 0])).toThrow("sealed");
  });
});

describe("DebugDraw3D", () => {
  test("owns one active recorder and finishes it", () => {
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
