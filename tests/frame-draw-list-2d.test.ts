import { describe, expect, test } from "vitest";
import { DebugDraw3D, FrameDrawList } from "../src/index.js";

describe("FrameDrawList2D", () => {
  test("records lines in world2d by default", () => {
    const frame = new FrameDrawList();
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
    const frame = new FrameDrawList();
    frame.d2.line([0, 0], [1, 0], { color: [0, 1, 0, 1] });
    expect(frame.d2.lines[0]?.colorEnd).toEqual([0, 1, 0, 1]);
  });

  test("inherits the drawList's 3D point/line style defaults", () => {
    const frame = new FrameDrawList({ line: { width: 3, color: [0, 0, 1, 1] }, point: { size: 5 } });
    frame.d2.line([0, 0], [1, 0]);
    frame.d2.point([0, 0]);

    expect(frame.d2.lines[0]).toMatchObject({ width: 3, color: [0, 0, 1, 1] });
    expect(frame.d2.points[0]).toMatchObject({ size: 5 });
  });

  test("keeps the requested space and rejects unknown ones", () => {
    const frame = new FrameDrawList();
    frame.d2.line([0, 0], [1, 0], { space: "screen" });
    expect(frame.d2.lines[0]?.space).toBe("screen");

    expect(() => frame.d2.line([0, 0], [1, 0], { space: "world" as never })).toThrow('space must be "world2d" or "screen"');
  });

  test("ignores zero-length lines and validates sizes", () => {
    const frame = new FrameDrawList();
    frame.d2.line([2, 2], [2, 2]);
    expect(frame.d2.lines).toHaveLength(0);

    expect(() => frame.d2.line([0, 0], [1, 0], { width: 0 })).toThrow("greater than zero");
    expect(() => frame.d2.point([0, 0], { size: -1 })).toThrow("greater than zero");
    expect(() => frame.d2.line([0, Number.NaN], [1, 0])).toThrow("must be finite");
  });

  test("accumulates dash distance across a strip and emits joined vertices", () => {
    const frame = new FrameDrawList();
    frame.d2.lineStrip_d([[0, 0], [3, 0], [3, 4]], [0.5, 0.5, 0], { joint: "round" });

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
    const frame = new FrameDrawList();
    frame.d2.lineStrip([[0, 0], [4, 0], [4, 4]], { joint: "bevel" }, true);

    expect(frame.d2.lines).toHaveLength(3);
    expect(frame.d2.joints).toHaveLength(3);
    expect(frame.d2.lines[2]?.end).toEqual([0, 0]);
  });

  test("filters 2D commands by layer mask together with the 3D ones", () => {
    const frame = new FrameDrawList();
    frame.line([0, 0, 0], [1, 0, 0], { layer: 1 });
    frame.d2.line([0, 0], [1, 0], { layer: 2 });
    frame.d2.point([0, 0], { layer: 2 });

    expect(frame.commands(1).map((command) => command.kind)).toEqual(["line"]);
    expect(frame.commands(2).map((command) => command.kind)).toEqual(["point2d", "line2d"]);
    expect(frame.commands()).toHaveLength(3);
  });

  test("seals the 2D layer with its parent", () => {
    const frame = new FrameDrawList();
    frame.seal();
    expect(() => frame.d2).toThrow("sealed");
  });
});

describe("FrameDrawList2D shapes", () => {
  test("maps each shape's arguments onto the command fields", () => {
    const frame = new FrameDrawList();
    frame.d2.rect([1, 2], [40, 20]);
    frame.d2.rect_r([1, 2], [40, 20], 6);
    frame.d2.circle([1, 2], 10);
    frame.d2.ellipse([1, 2], [10, 4]);
    frame.d2.arc([1, 2], 10, { startAngle: 0.5, sweep: Math.PI / 2, strokeWidth: 3 });
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
    expect(shapes[0]).toMatchObject({ size: [20, 10], center: [1, 2], filled: false, thickness: 1, space: "world2d", layer: 1 });
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
    const frame = new FrameDrawList();
    frame.d2.triangle([0, 0], [30, 0], [0, 30]);
    const [triangle] = frame.d2.shapes;
    expect(triangle?.shape).toBe("triangle");
    expect(triangle?.center[0]).toBeCloseTo(10);
    expect(triangle?.center[1]).toBeCloseTo(10);
    expect(triangle?.size).toEqual([-10, -10]);
    expect(triangle?.vertexB).toEqual([20, -10]);
    expect(triangle?.vertexC).toEqual([-10, 20]);
  });

  test("maps the rect trio onto outline, solid and dashed commands", () => {
    const frame = new FrameDrawList();
    frame.d2.rect([0, 0], [10, 4], { rotation: 1.25, strokeWidth: 2.5, space: "screen", layer: 4 });
    frame.d2.rect_s([0, 0], [10, 4], { rotation: 1.25 });
    frame.d2.rect_d([0, 0], [10, 4], [6, 3, 1], { strokeWidth: 2 });
    const [outline, solid, dashed] = frame.d2.shapes;
    expect(outline).toMatchObject({ shape: "rect", filled: false, thickness: 2.5, rotation: 1.25, space: "screen", layer: 4 });
    expect(solid).toMatchObject({ shape: "rect", filled: true, thickness: 1, rotation: 1.25 });
    expect(solid?.dash).toBeUndefined();
    expect(dashed).toMatchObject({ shape: "rect", filled: false, thickness: 2, dash: [6, 3, 1] });
  });

  test("rejects degenerate shapes", () => {
    const frame = new FrameDrawList();
    expect(() => frame.d2.rect([0, 0], [0, 10])).toThrow("greater than zero");
    expect(() => frame.d2.circle([0, 0], -1)).toThrow("greater than zero");
    expect(() => frame.d2.ellipse([0, 0], [10, 0])).toThrow("greater than zero");
    expect(() => frame.d2.rect_r([0, 0], [10, 10], -1)).toThrow("must not be negative");
    expect(() => frame.d2.annulus([0, 0], 10, 10)).toThrow("smaller than outerRadius");
    expect(() => frame.d2.polygon([0, 0], 10, 2.5)).toThrow("integer of at least 3");
    expect(() => frame.d2.arc([0, 0], 10, { sweep: 0 })).toThrow("non-zero angle");
    expect(() => frame.d2.sector([0, 0], 10, { sweep: Math.PI * 3 })).toThrow("at most one full turn");
    expect(() => frame.d2.rect([0, 0], [10, 10], { strokeWidth: 0 })).toThrow("greater than zero");
    expect(() => frame.d2.rect([0, 0], [10, 10], { rotation: Number.NaN })).toThrow("must be finite");
    expect(() => frame.d2.rect_d([0, 0], [10, 10], [0, 4, 0])).toThrow("dash visible");
    expect(() => frame.d2.rect_d([0, 0], [10, 10], [6, 0, 0])).toThrow("dash gap");
  });

  test("maps the hatch variant onto a filled command with a stripe pattern", () => {
    const frame = new FrameDrawList();
    frame.d2.rect_h([0, 0], [10, 4], { hatch: { spacing: 6 }, color: [1, 0, 0, 1] });
    const [hatched] = frame.d2.shapes;
    expect(hatched).toMatchObject({ shape: "rect", filled: true, color: [1, 0, 0, 1] });
    // Defaults: 45 degrees, a third of the spacing, no phase.
    expect(hatched?.hatch?.[0]).toBe(6);
    expect(hatched?.hatch?.[1]).toBeCloseTo(Math.PI / 4);
    expect(hatched?.hatch?.[2]).toBe(2);
    expect(hatched?.hatch?.[3]).toBe(0);
    expect(hatched?.dash).toBeUndefined();
  });

  test("keeps the requested hatch angle, width and phase", () => {
    const frame = new FrameDrawList();
    frame.d2.polygon_h([0, 0], 10, 6, { hatch: { spacing: 8, angle: Math.PI / 2, width: 1.5, phase: 3 } });
    expect(frame.d2.shapes[0]?.hatch).toEqual([8, Math.PI / 2, 1.5, 3]);
  });

  test("strokes an arc with stripes instead of a flat band", () => {
    const frame = new FrameDrawList();
    frame.d2.arc_h([0, 0], 10, { strokeWidth: 6, hatch: { spacing: 4, width: 2 } });
    const [arc] = frame.d2.shapes;
    expect(arc).toMatchObject({ shape: "arc", filled: false, thickness: 6 });
    expect(arc?.hatch).toEqual([4, Math.PI / 4, 2, 0]);
    expect(arc?.dash).toBeUndefined();
  });

  test("draws the hatch background as a solid command underneath the stripes", () => {
    const frame = new FrameDrawList();
    frame.d2.circle_h([0, 0], 5, { hatch: { spacing: 4, background: [0, 0, 1, 1] }, color: [1, 1, 1, 1] });
    const [base, stripes] = frame.d2.shapes;
    expect(base).toMatchObject({ shape: "circle", filled: true, color: [0, 0, 1, 1] });
    expect(base?.hatch).toBeUndefined();
    expect(stripes).toMatchObject({ shape: "circle", filled: true, color: [1, 1, 1, 1] });
    expect(stripes?.hatch?.[0]).toBe(4);
  });

  test("rejects a degenerate hatch", () => {
    const frame = new FrameDrawList();
    expect(() => frame.d2.rect_h([0, 0], [10, 10], { hatch: { spacing: 0 } })).toThrow("hatch.spacing");
    expect(() => frame.d2.rect_h([0, 0], [10, 10], { hatch: { spacing: 4, width: -1 } })).toThrow("hatch.width");
    expect(() => frame.d2.rect_h([0, 0], [10, 10], { hatch: { spacing: 4, angle: Number.NaN } })).toThrow("hatch.angle");
    expect(() => frame.d2.rect_h([0, 0], [10, 10], { hatch: { spacing: 4, background: [1, 1, 1] as never } })).toThrow(
      "hatch.background",
    );
  });

  test("filters shapes by layer mask and seals with the frame", () => {
    const frame = new FrameDrawList();
    frame.d2.circle([0, 0], 5, { layer: 1 });
    frame.d2.rect([0, 0], [4, 4], { layer: 2 });
    expect(frame.commands(2).map((command) => command.kind)).toEqual(["shape2d"]);

    const sealed = new FrameDrawList();
    sealed.seal();
    expect(() => sealed.d2.circle([0, 0], 5)).toThrow("sealed");
  });
});

describe("FrameDrawList2D grid", () => {
  test("keeps interior lines by default and adds outer edges on request", () => {
    const none = new FrameDrawList();
    none.d2.grid([0, 0], [2, 2], [10, 10]);
    expect(none.d2.lines).toHaveLength(2);

    const x = new FrameDrawList();
    x.d2.grid([0, 0], [2, 2], [10, 10], { outer: "x" });
    expect(x.d2.lines).toHaveLength(4);

    const both = new FrameDrawList();
    both.d2.grid([0, 0], [2, 2], [10, 10], { outer: "xy" });
    expect(both.d2.lines).toHaveLength(6);
  });

  test("rotates the grid around its centre", () => {
    const frame = new FrameDrawList();
    frame.d2.grid([0, 0], [1, 1], [10, 10], { outer: "xy", rotation: Math.PI / 2 });
    expect(frame.d2.lines).toHaveLength(4);
    expect(frame.d2.lines[0]).toMatchObject({ start: [5, -5], end: [5, 5] });
  });

  test("skews the line families", () => {
    const frame = new FrameDrawList();
    frame.d2.grid([0, 0], [1, 1], [10, 10], { outer: "xy", skew: [Math.PI / 4, 0] });
    const [bottom, , diagonal] = frame.d2.lines;
    expect(bottom!.start[0]).toBeCloseTo(-10);
    expect(bottom!.start[1]).toBeCloseTo(-5);
    expect(bottom!.end[1]).toBeCloseTo(-5);
    expect(diagonal!.start[0]).toBeCloseTo(-10);
    expect(diagonal!.start[1]).toBeCloseTo(-5);
    expect(diagonal!.end[1]).toBeCloseTo(5);
  });

  test("rejects invalid grid parameters", () => {
    const frame = new FrameDrawList();
    expect(() => frame.d2.grid([0, 0], [0, 2], [10, 10])).toThrow("positive integers");
    expect(() => frame.d2.grid([0, 0], [2, 2], [10, 10], { rotation: Number.NaN })).toThrow("rotation");
    expect(() => frame.d2.grid([0, 0], [2, 2], [10, 10], { skew: [Infinity, 0] })).toThrow("skew x");
    expect(() => frame.d2.grid([0, 0], [2, 2], [10, 10], { outer: "z" as never })).toThrow("grid outer");
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
