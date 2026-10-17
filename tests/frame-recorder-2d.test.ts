import { describe, expect, test } from "vitest";
import { DebugDraw3D, FrameRecorder } from "../src/index.js";

describe("FrameRecorder2D", () => {
  test("records lines in world2d by default", () => {
    const frame = new FrameRecorder();
    frame.d2.line([0, 0], [10, 0], { width: 2, color: [1, 0, 0, 1] });

    expect(frame.d2.lines).toHaveLength(1);
    const [line] = frame.commands();
    expect(line).toMatchObject({
      kind: "line2d",
      start: [0, 0],
      end: [10, 0],
      width: 2,
      widthMode: "screen",
      space: "world2d",
      layer: 1,
      color: [1, 0, 0, 1],
    });
  });

  test("defaults the end color to the start color", () => {
    const frame = new FrameRecorder();
    frame.d2.line([0, 0], [1, 0], { color: [0, 1, 0, 1] });
    expect(frame.d2.lines[0]?.colorEnd).toEqual([0, 1, 0, 1]);
  });

  test("inherits the recorder's 3D point/line style defaults", () => {
    const frame = new FrameRecorder({ line: { width: 3, color: [0, 0, 1, 1] }, point: { size: 5 } });
    frame.d2.line([0, 0], [1, 0]);
    frame.d2.point([0, 0]);

    expect(frame.d2.lines[0]).toMatchObject({ width: 3, color: [0, 0, 1, 1] });
    expect(frame.d2.points[0]).toMatchObject({ size: 5 });
  });

  test("keeps the requested space and rejects unknown ones", () => {
    const frame = new FrameRecorder();
    frame.d2.line([0, 0], [1, 0], { space: "screen" });
    expect(frame.d2.lines[0]?.space).toBe("screen");

    expect(() => frame.d2.line([0, 0], [1, 0], { space: "world" as never })).toThrow('space must be "world2d" or "screen"');
  });

  test("ignores zero-length lines and validates sizes", () => {
    const frame = new FrameRecorder();
    frame.d2.line([2, 2], [2, 2]);
    expect(frame.d2.lines).toHaveLength(0);

    expect(() => frame.d2.line([0, 0], [1, 0], { width: 0 })).toThrow("greater than zero");
    expect(() => frame.d2.point([0, 0], { size: -1 })).toThrow("greater than zero");
    expect(() => frame.d2.line([0, Number.NaN], [1, 0])).toThrow("must be finite");
  });

  test("accumulates dash distance across a strip and emits joined vertices", () => {
    const frame = new FrameRecorder();
    frame.d2.lineStrip([[0, 0], [3, 0], [3, 4]], { dash: [0.5, 0.5, 0], joint: "round" });

    expect(frame.d2.lines).toHaveLength(2);
    expect(frame.d2.lines[0]?.dash).toEqual([0.5, 0.5, 0]);
    expect(frame.d2.lines[1]?.dash).toEqual([0.5, 0.5, 3]);
    expect(frame.d2.joints).toHaveLength(1);
    expect(frame.d2.joints[0]).toMatchObject({
      kind: "joint2d",
      previous: [0, 0],
      center: [3, 0],
      next: [3, 4],
      joint: "round",
      space: "world2d",
    });
  });

  test("closes a strip and joins both seam vertices", () => {
    const frame = new FrameRecorder();
    frame.d2.lineStrip([[0, 0], [4, 0], [4, 4]], { joint: "bevel" }, true);

    expect(frame.d2.lines).toHaveLength(3);
    expect(frame.d2.joints).toHaveLength(3);
    expect(frame.d2.lines[2]?.end).toEqual([0, 0]);
  });

  test("filters 2D commands by layer mask together with the 3D ones", () => {
    const frame = new FrameRecorder();
    frame.line([0, 0, 0], [1, 0, 0], { layer: 1 });
    frame.d2.line([0, 0], [1, 0], { layer: 2 });
    frame.d2.point([0, 0], { layer: 2 });

    expect(frame.commands(1).map((command) => command.kind)).toEqual(["line"]);
    expect(frame.commands(2).map((command) => command.kind)).toEqual(["point2d", "line2d"]);
    expect(frame.commands()).toHaveLength(3);
  });

  test("seals the 2D layer with its parent", () => {
    const frame = new FrameRecorder();
    frame.seal();
    expect(() => frame.d2).toThrow("sealed");
  });
});

describe("FrameRecorder2D shapes", () => {
  test("maps each shape's arguments onto the command fields", () => {
    const frame = new FrameRecorder();
    frame.d2.rect([1, 2], [40, 20]);
    frame.d2.roundedRect([1, 2], [40, 20], 6);
    frame.d2.circle([1, 2], 10);
    frame.d2.ellipse([1, 2], [10, 4]);
    frame.d2.arc([1, 2], 10, { startAngle: 0.5, sweep: Math.PI / 2, fill: false, strokeWidth: 3 });
    frame.d2.annulus([1, 2], 4, 10);
    frame.d2.capsule([1, 2], 5, 20);
    frame.d2.polygon([1, 2], 10, 6);
    frame.d2.rhombus([1, 2], [20, 10]);
    frame.d2.sector([1, 2], 10, { sweep: Math.PI });
    frame.d2.segment([1, 2], 10, { sweep: Math.PI / 2 });

    const shapes = frame.d2.shapes;
    expect(shapes.map((shape) => shape.shape)).toEqual([
      "rect", "rounded-rect", "circle", "ellipse", "arc", "annulus", "capsule", "polygon", "rhombus", "sector", "segment",
    ]);
    // Box half extents, radii and polygons all land in `size`; annulus is [outer, inner] and
    // capsule is [radius, halfLength].
    expect(shapes[0]).toMatchObject({ size: [20, 10], center: [1, 2], filled: true, thickness: 1, space: "world2d", layer: 1 });
    expect(shapes[1]).toMatchObject({ size: [20, 10], cornerRadius: 6 });
    expect(shapes[2]).toMatchObject({ size: [10, 10] });
    expect(shapes[3]).toMatchObject({ size: [10, 4] });
    expect(shapes[4]).toMatchObject({ size: [10, 10], startAngle: 0.5, sweep: Math.PI / 2, filled: false, thickness: 3 });
    expect(shapes[5]).toMatchObject({ size: [10, 4] });
    expect(shapes[6]).toMatchObject({ size: [5, 10] });
    expect(shapes[7]).toMatchObject({ size: [10, 10], sides: 6 });
    expect(shapes[8]).toMatchObject({ size: [10, 5] });
    expect(shapes[9]).toMatchObject({ size: [10, 10], sweep: Math.PI });
    expect(shapes[10]).toMatchObject({ size: [10, 10], sweep: Math.PI / 2 });
  });

  test("stores triangle vertices relative to the centroid", () => {
    const frame = new FrameRecorder();
    frame.d2.triangle([0, 0], [30, 0], [0, 30]);
    const [triangle] = frame.d2.shapes;
    expect(triangle?.shape).toBe("triangle");
    expect(triangle?.center[0]).toBeCloseTo(10);
    expect(triangle?.center[1]).toBeCloseTo(10);
    expect(triangle?.size).toEqual([-10, -10]);
    expect(triangle?.vertexB).toEqual([20, -10]);
    expect(triangle?.vertexC).toEqual([-10, 20]);
  });

  test("honours rotation, fill and space", () => {
    const frame = new FrameRecorder();
    frame.d2.rect([0, 0], [10, 4], { rotation: 1.25, fill: false, strokeWidth: 2.5, space: "screen", layer: 4 });
    expect(frame.d2.shapes[0]).toMatchObject({ rotation: 1.25, filled: false, thickness: 2.5, space: "screen", layer: 4 });
  });

  test("rejects degenerate shapes", () => {
    const frame = new FrameRecorder();
    expect(() => frame.d2.rect([0, 0], [0, 10])).toThrow("greater than zero");
    expect(() => frame.d2.circle([0, 0], -1)).toThrow("greater than zero");
    expect(() => frame.d2.ellipse([0, 0], [10, 0])).toThrow("greater than zero");
    expect(() => frame.d2.roundedRect([0, 0], [10, 10], -1)).toThrow("must not be negative");
    expect(() => frame.d2.annulus([0, 0], 10, 10)).toThrow("smaller than outerRadius");
    expect(() => frame.d2.polygon([0, 0], 10, 2.5)).toThrow("integer of at least 3");
    expect(() => frame.d2.arc([0, 0], 10, { sweep: 0 })).toThrow("non-zero angle");
    expect(() => frame.d2.sector([0, 0], 10, { sweep: Math.PI * 3 })).toThrow("at most one full turn");
    expect(() => frame.d2.rect([0, 0], [10, 10], { strokeWidth: 0 })).toThrow("greater than zero");
    expect(() => frame.d2.rect([0, 0], [10, 10], { rotation: Number.NaN })).toThrow("must be finite");
  });

  test("filters shapes by layer mask and seals with the frame", () => {
    const frame = new FrameRecorder();
    frame.d2.circle([0, 0], 5, { layer: 1 });
    frame.d2.rect([0, 0], [4, 4], { layer: 2 });
    expect(frame.commands(2).map((command) => command.kind)).toEqual(["shape2d"]);

    const sealed = new FrameRecorder();
    sealed.seal();
    expect(() => sealed.d2.circle([0, 0], 5)).toThrow("sealed");
  });
});

describe("DebugDraw3D 2D layer", () => {
  test("finishes a frame containing 2D commands", () => {
    const debug = new DebugDraw3D({ defaultVisibleLayers: 3 });
    const frame = debug.beginFrame();
    frame.d2.line([0, 0], [1, 1], { layer: 1 });
    frame.d2.point([5, 5], { layer: 4 });

    const commands = debug.finishFrame(frame);
    expect(commands.map((command) => command.kind)).toEqual(["line2d"]);
  });
});
