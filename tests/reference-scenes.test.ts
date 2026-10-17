import { describe, expect, test } from "vitest";
import { FrameRecorder, type JointCommand, type LineCommand, type TriangleCommand, type Vec3 } from "../src/frame-recorder.js";
import { buildScene, CIRCLE_REFERENCE, LINE_REFERENCE } from "../src/scenes-3d.js";

function commandsFor(id: string): readonly (LineCommand | JointCommand | TriangleCommand | { kind: "point" })[] {
  const recorder = new FrameRecorder();
  buildScene(id, recorder, 0);
  return recorder.commands() as never;
}

function linesOf(id: string): LineCommand[] {
  return commandsFor(id).filter((command): command is LineCommand => command.kind === "line");
}

function trianglesOf(id: string): TriangleCommand[] {
  return commandsFor(id).filter((command): command is TriangleCommand => command.kind === "triangle");
}

function jointsOf(id: string): JointCommand[] {
  return commandsFor(id).filter((command): command is JointCommand => command.kind === "joint");
}

function near(actual: readonly number[], expected: readonly number[], epsilon = 1e-6): boolean {
  return actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]!) < epsilon);
}

describe("Circle reference scene", () => {
  test("uses the source column and row coordinates", () => {
    expect(CIRCLE_REFERENCE.columns).toBe(11);
    expect(CIRCLE_REFERENCE.columnX(0)).toBe(0.5);
    expect(CIRCLE_REFERENCE.columnX(10)).toBe(20.5);
    // Row spacing differs for the radius column (1.15) versus the others (0.82).
    expect(near(CIRCLE_REFERENCE.center(0, 0), [-9.5, 0.1, 1.05])).toBe(true);
    expect(near(CIRCLE_REFERENCE.center(0, 1), [-9.5, 0.1, 0.23])).toBe(true);
    expect(near(CIRCLE_REFERENCE.center(1, 1), [-7.5, 0.1, -0.1])).toBe(true);
  });

  test("emits solid discs with the reference blue alpha", () => {
    const triangles = trianglesOf("circle");
    // SEGMENT_VALUES = [8, 16, 32, 64] triangles per disc.
    expect(triangles).toHaveLength(8 + 16 + 32 + 64);
    for (const triangle of triangles) {
      expect(triangle.color).toEqual([0.25, 0.65, 1, 0.45]);
    }
    const center = CIRCLE_REFERENCE.center(10, 0);
    expect(triangles.some((triangle) => near(triangle.a, center))).toBe(true);
  });

  test("keeps the wide normal row and the tilted rotation tunnel", () => {
    const lines = linesOf("circle");
    // `draw_circle_n` shades every segment with the radial normal of its own midpoint
    // (`_get_circle_normals`), so the wide row's normals fan out inside the ring's plane
    // instead of sharing one direction.
    const wideRow = lines.filter((line) => near(line.color, [0.25, 0.95, 0.9, 1]) && line.width === 10);
    expect(wideRow.length).toBeGreaterThan(2);
    for (const line of wideRow) {
      expect(line.normal).toBeDefined();
      expect(Math.hypot(...(line.normal as Vec3))).toBeCloseTo(1, 6);
      // The circle's flat basis spans XZ, so the radials have no vertical component.
      expect(line.normal![1]).toBeCloseTo(0, 6);
    }
    expect(new Set(wideRow.map((line) => (line.normal as Vec3).join(","))).size).toBeGreaterThan(2);
    // Rotation tunnel lifts the first row above the ground plane.
    const tunnel = lines.filter((line) => near(line.color, [0.95, 0.75, 0.25, 1], 1e-3) && Math.abs(line.start[1] - 0.45) < 1e-6);
    expect(tunnel.length).toBeGreaterThan(0);
  });

  test("keeps dashed circles as dashed rather than continuous", () => {
    const dashed = linesOf("circle").filter((line) => line.dash !== undefined && line.color[1] > 0.4 && line.color[1] < 0.5);
    expect(dashed.length).toBeGreaterThan(0);
    expect(dashed[0]!.dash![0]).toBeGreaterThan(0);
  });
});

describe("Curve reference scene", () => {
  test("draws the construction band with the reference anchor and control markers", () => {
    const lines = linesOf("curve");
    const anchors = lines.filter((line) => near(line.color, [1, 0.25, 0.85, 1]) && line.width === 2);
    const controlRings = lines.filter((line) => near(line.color, [1, 0.75, 0.15, 1]) && line.width === 2);
    const controlEdges = lines.filter((line) => near(line.color, [1, 0.75, 0.15, 0.85]) && line.width === 1);
    // 16 segments per closed marker ring; across the 7 construction curves there are 21
    // Bezier anchors and 24 non-zero in/out handles (`_draw_curve_control_points`).
    expect(anchors).toHaveLength(21 * 16);
    expect(controlRings).toHaveLength(24 * 16);
    expect(controlEdges).toHaveLength(24);
    // `_get_curve_marker_rotation` swaps the basis columns, so every ring is a horizontal
    // (XZ-plane) circle around its anchor instead of standing up in the curve's own plane.
    for (const line of [...anchors, ...controlRings]) expect(line.start[1]).toBeCloseTo(line.end[1], 9);
    // The straight curve has three handle-less anchors; the first sits at local (-0.5, 0, 0.18),
    // which the scene translation (-10, 0, 1.5) moves to (-10, 0.1, 1.23).
    const anchorCenter: Vec3 = [-10, 0.1, 1.23];
    const onFirstRing = anchors.filter((line) => Math.abs(Math.hypot(line.start[0] - anchorCenter[0], line.start[2] - anchorCenter[2]) - 0.045) < 1e-4);
    expect(onFirstRing.length).toBeGreaterThan(0);
    // Handle edges keep the reference handle lengths (`smoothSymmetricCurve` uses |(0.28, 0, -0.35)|).
    const edges = controlEdges.map((line) => Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1], line.end[2] - line.start[2]));
    expect(edges.filter((length) => Math.abs(length - Math.hypot(0.28, 0.35)) < 1e-6).length).toBeGreaterThan(0);
  });
});

describe("Sphere reference scene", () => {
  test("y-axis column selects latitude rings and z-axis column the meridian circles", () => {
    const lines = linesOf("sphere");
    const gold = lines.filter((line) => near(line.color, [0.95, 0.75, 0.25, 1]));
    // sphere(y axis) rows use Y_AXIS_SEGMENT_VALUES = [0, 1, 2, 6] with z = 2, so the
    // loops per row are 2, 2, 3 and 7: each is a 48-point ring, giving 96 + 96 + 144 + 336.
    // The rotation column's first row shares the same color (alpha 1 - 0 * 0.07) and adds
    // its own 3 rings, hence 816.
    expect(gold).toHaveLength(672 + 144);
    // sphere(z axis) rows use Z_AXIS_SEGMENT_VALUES = [0, 1, 2, 6], so a z value of n emits
    // n great circles that all survive de-duplication: 48 + 96 + 144 + 336. The dashed
    // column shares the orange color (4 rows x 3 rings x 48) as does the normal row 2.
    const orange = lines.filter((line) => near(line.color, [1, 0.45, 0.2, 1]));
    expect(orange).toHaveLength(624 + 576 + 144);
    // sphere(segments) keeps y = z = 2, so each row draws three rings of `seg` points.
    const lime = lines.filter((line) => near(line.color, [0.7, 1, 0.25, 1]));
    expect(lime).toHaveLength(3 * (8 + 16 + 32 + 64));
  });
});

describe("Capsule reference scene", () => {
  test("emits rings plus side silhouettes and no solid geometry", () => {
    const lines = linesOf("capsule");
    expect(trianglesOf("capsule")).toHaveLength(0);
    // capsule(side segments) uses SIDE_SEGMENT_VALUES = [1, 2, 4, 8] with 32 segments:
    // 2 rings x 32 plus `side` closed silhouettes of 2 * (16 + 1) points each.
    const pink = lines.filter((line) => near(line.color, [1, 0.3, 0.6, 1]));
    expect(pink).toHaveLength([1, 2, 4, 8].reduce((total, side) => total + 64 + side * 34, 0));
    // capsule(segments) uses SEGMENT_VALUES = [8, 16, 32, 64] with two silhouettes, so each
    // row is `2 * seg` ring segments plus `4 * (ceil(seg / 2) + 1)` silhouette segments.
    const gold = lines.filter((line) => near(line.color, [0.95, 0.75, 0.25, 1]));
    const segmentRows = [8, 16, 32, 64].reduce((total, seg) => total + 2 * seg + 4 * (Math.ceil(seg / 2) + 1), 0);
    expect(gold).toHaveLength(segmentRows + 2 * 32 + 4 * (16 + 1));
  });
});

describe("Cone and cylinder reference scenes", () => {
  test("the side-segment column is independent of the base-segment column", () => {
    // cone(segments) rows draw a `seg`-point base ring plus 8 side lines; cone(side segments)
    // rows keep 16 base segments and vary only the side line count.
    const coneGold = linesOf("cone").filter((line) => near(line.color, [0.95, 0.75, 0.25, 1]));
    expect(coneGold).toHaveLength([3, 4, 8, 16].reduce((total, seg) => total + seg + 8, 0) + 16 + 8);
    const coneOrange = linesOf("cone").filter((line) => near(line.color, [1, 0.45, 0.2, 1]));
    expect(coneOrange).toHaveLength([3, 4, 8, 16].reduce((total, side) => total + 16 + side, 0) + 16 + 8);

    // cylinder(segments) draws two rings per row; cylinder(side segments) keeps 16 and
    // varies the vertical wall lines.
    const cylinderGold = linesOf("cylinder").filter((line) => near(line.color, [0.95, 0.75, 0.25, 1]));
    expect(cylinderGold).toHaveLength([3, 4, 8, 16].reduce((total, seg) => total + 2 * seg + 8, 0) + 2 * 16 + 8);
    const cylinderOrange = linesOf("cylinder").filter((line) => near(line.color, [1, 0.45, 0.2, 1]));
    expect(cylinderOrange).toHaveLength([3, 4, 8, 16].reduce((total, side) => total + 2 * 16 + side, 0) + 2 * 16 + 8);
  });
});

describe("Arrow reference scene", () => {
  test("normal-aware heads shade each segment from the cone surface, and shafts stay plain", () => {
    const withNormal = linesOf("arrow").filter((line) => line.normal !== undefined);
    // Six normal-aware columns x four rows x (two wings x two segments) = 96 head segments; the
    // shafts of `draw_arrow_line_n*` are `_emit_line` calls and carry no normal at all.
    expect(withNormal).toHaveLength(96);
    for (const line of withNormal) expect(Math.hypot(...(line.normal as Vec3))).toBeCloseTo(1, 6);
    // `draw_arrow_n` passes NORMAL = (0, 0, 1) only as the tangent-plane hint. Every segment gets
    // `_get_arrow_surface_normal(direction, ±radial, headLength, headRadius)` instead, so the hint
    // never appears and the two head shapes contribute four normals each.
    const normals = new Set(withNormal.map((line) => (line.normal as Vec3).join(",")));
    expect(normals.has("0,0,1")).toBe(false);
    expect(normals.size).toBe(8);
  });
});

describe("Line reference scene", () => {
  test("uses the source column and row coordinates", () => {
    expect(LINE_REFERENCE.columns).toBe(7);
    expect(LINE_REFERENCE.columnX(0)).toBe(0);
    expect(LINE_REFERENCE.columnX(6)).toBe(12);
    expect(near(LINE_REFERENCE.start(0, 0), [-10, 0.1, 1.05])).toBe(true);
    expect(near(LINE_REFERENCE.end(0, 0), [-8.9, 0.1, 1.05])).toBe(true);
  });

  test("emits the exact strip and loop point sets", () => {
    const strip = LINE_REFERENCE.strip(0, 0);
    expect(near(strip[0]!, [-10, 0.1, 1.23])).toBe(true);
    expect(near(strip[1]!, [-9.637, 0.1, 0.87])).toBe(true);
    expect(near(strip[2]!, [-9.274, 0.1, 1.23])).toBe(true);
    expect(near(strip[3]!, [-8.9, 0.1, 0.87])).toBe(true);
    const loop = LINE_REFERENCE.loop(4, 0);
    expect(near(loop[0]!, [-2, 0.1, 1.3])).toBe(true);
    expect(near(loop[1]!, [-0.9, 0.1, 1.3])).toBe(true);
    expect(near(loop[2]!, [-0.9, 0.1, 0.8])).toBe(true);
    expect(near(loop[3]!, [-2, 0.1, 0.8])).toBe(true);
    // Loop column draws a closed 4-segment path per row.
    const loops = linesOf("line").filter((line) => near(line.color, [1, 0.45, 0.2, 0.95]) && line.width === 8);
    expect(loops).toHaveLength(16);
  });

  test("accumulates dash distance across polyline segments", () => {
    const dashed = linesOf("line").filter((line) => line.dash !== undefined && near(line.color, [0.75, 0.45, 1, 1]));
    const offsets = dashed.map((line) => line.dash![2]);
    expect(new Set(offsets).size).toBeGreaterThanOrEqual(3);
    // First row segment lengths are 0.511..., 0.511..., 0.519...
    expect(Math.max(...offsets)).toBeCloseTo(1.022, 2);
  });

  test("single dashed lines keep the animated offset but a zero phase at t=0", () => {
    const single = linesOf("line").filter((line) => line.dash !== undefined && near(line.color, [0.7, 1, 0.25, 1]));
    expect(single).toHaveLength(4);
    for (const line of single) expect(line.dash![2]).toBe(0);
  });

  test("normal samples use the reference normal vectors", () => {
    const normals = linesOf("line").filter((line) => line.normal !== undefined && near(line.color, [0.25, 0.95, 0.9, 1]));
    expect(normals.length).toBe(4);
    expect(normals.map((line) => line.normal)).toEqual([
      [0, 0, 1],
      [0, 0.70710677, 0.70710677],
      [0, 1, 0],
      [0, 0, -1],
    ]);
  });
});

describe("Normal-aware reference columns", () => {
  test("shape *_n columns carry the reference per-vertex normals", () => {
    const joints = jointsOf("sphere");
    const withNormals = joints.filter((joint) => joint.previousNormal !== undefined && joint.nextNormal !== undefined);
    // sphere(joint) draws plain joints; sphere_n(joint) and sphere_n_d(joint) carry normals.
    expect(withNormals.length).toBeGreaterThan(0);
    expect(withNormals.length).toBeLessThan(joints.length);
    // Per-vertex normals vary around every ring, so the seam blends many distinct directions.
    const distinct = new Set(withNormals.map((joint) => (joint.previousNormal as Vec3).join(",")));
    expect(distinct.size).toBeGreaterThan(8);

    const normals = linesOf("sphere").filter((line) => line.normal !== undefined);
    expect(new Set(normals.map((line) => (line.normal as Vec3).join(","))).size).toBeGreaterThan(8);
  });

  test("capsule silhouettes and cap rings carry distinct normals", () => {
    const normals = linesOf("capsule").filter((line) => line.normal !== undefined);
    expect(normals.length).toBeGreaterThan(0);
    expect(new Set(normals.map((line) => (line.normal as Vec3).join(","))).size).toBeGreaterThan(8);
    expect(jointsOf("capsule").some((joint) => joint.previousNormal !== undefined)).toBe(true);
  });

  test("flat primitives shade with per-vertex normals too", () => {
    // `draw_circle_n` / `draw_arc_n` / `draw_rect_n` / `draw_box_n` all derive a normal per
    // segment or corner instead of one normal for the whole path.
    for (const id of ["circle", "arc", "rect", "box"]) {
      const normals = linesOf(id).filter((line) => line.normal !== undefined);
      expect(normals.length, `${id} has no normal-aware lines`).toBeGreaterThan(0);
      expect(new Set(normals.map((line) => (line.normal as Vec3).join(","))).size, `${id} reuses one normal`).toBeGreaterThan(2);
    }
    // The box and rect columns take their normals from the basis, so they fan out around the
    // shape rather than all pointing at the camera.
    const boxNormals = new Set(linesOf("box").filter((line) => line.normal !== undefined).map((line) => (line.normal as Vec3).join(",")));
    expect(boxNormals.size).toBeGreaterThanOrEqual(4);
  });

  test("cone and cylinder normal columns shade rings and side lines separately", () => {
    for (const id of ["cone", "cylinder"]) {
      const normals = linesOf(id).filter((line) => line.normal !== undefined);
      expect(normals.length, `${id} has no normal-aware lines`).toBeGreaterThan(0);
      // Ring normals are perpendicular to the axis while side-line normals are radial/tilted,
      // so the column mixes both families.
      expect(new Set(normals.map((line) => (line.normal as Vec3).join(","))).size).toBeGreaterThan(4);
    }
  });
});
