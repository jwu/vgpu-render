import { describe, expect, test } from "vitest";
import {
  arc,
  arcNormals,
  box,
  boxEdgeNormals,
  capsule,
  capsuleOutlineNormals,
  capsuleWire,
  circleNormals,
  circlePoints,
  cone,
  coneBaseBasis,
  coneSideLineNormals,
  coneWire,
  cylinder,
  cylinderSideLineNormals,
  cylinderWire,
  disc,
  rect,
  rectNormals,
  sphere,
  sphereRingNormals,
  sphereWire,
  type ShapeWire,
} from "../src/geometry-generators.js";
import type { CircleBasis } from "../src/godot-layout.js";

const ORIGIN = [0, 0, 0] as const;
const IDENTITY_BASIS: CircleBasis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

describe("geometry generators", () => {
  test("generate expected rect and box topology", () => {
    expect(rect([2, 1]).triangles).toHaveLength(2);
    expect(rect([2, 1]).segments).toHaveLength(4);
    expect(box([1, 1, 1]).triangles).toHaveLength(12);
    expect(box([1, 1, 1]).segments).toHaveLength(12);
  });

  test("respect segment counts", () => {
    expect(disc(1, 8).triangles).toHaveLength(8);
    expect(arc(1, Math.PI, 16).segments).toHaveLength(16);
    expect(cylinder(1, 1, 12).segments).toHaveLength(36);
    expect(cone(1, 2, 12).segments).toHaveLength(24);
  });

  test("generate volumetric meshes", () => {
    expect(sphere(1, 16, 8).triangles.length).toBeGreaterThan(100);
    expect(capsule(0.5, 1, 16, 6).triangles.length).toBeGreaterThan(cylinder(0.5, 1, 16).triangles.length);
  });
});

/** Every loop of a wireframe holds `segments` points and closes back on the first one. */
function loopPointCounts(wire: ShapeWire): number[] {
  return wire.loops.map((loop) => loop.length);
}

describe("reference wireframe generators", () => {
  test("circlePoints follows the reference basis columns", () => {
    const points = circlePoints([0, 0, 0], 2, 4, IDENTITY_BASIS);
    expect(points).toHaveLength(4);
    expect(points[0]![0]).toBeCloseTo(2, 12);
    expect(points[0]![1]).toBeCloseTo(0, 12);
    expect(points[1]![0]).toBeCloseTo(0, 12);
    expect(points[1]![1]).toBeCloseTo(2, 12);
    // Below `CIRCLE_SEGMENT_COUNT_MIN` (3) the reference emits nothing.
    expect(circlePoints([0, 0, 0], 2, 2, IDENTITY_BASIS)).toHaveLength(0);
    expect(circlePoints([0, 0, 0], 0, 4, IDENTITY_BASIS)).toHaveLength(0);
  });

  test("sphere emits latitude rings plus meridian great circles", () => {
    // y = 2 draws the equator only; z = 2 draws two perpendicular great circles.
    const basic = sphereWire(1, 32, 2, 2, ORIGIN, IDENTITY_BASIS);
    expect(loopPointCounts(basic)).toEqual([32, 32, 32]);
    expect(basic.lines).toHaveLength(0);
    // The equator sits in the XZ plane; the great circles are vertical (YZ, then XY).
    const equator = basic.loops[0]!;
    expect(equator.every((point) => Math.abs(point[1]) < 1e-12)).toBe(true);
    const vertical = basic.loops[1]!;
    expect(vertical.some((point) => Math.abs(point[0]) > 0.9)).toBe(false);
    // y = 0 and z = 0 disable their axis entirely.
    expect(sphereWire(1, 32, 0, 2, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(2);
    expect(sphereWire(1, 32, 2, 0, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(1);
    // y = 6 yields five latitude rings (`radius * (-1 + 2i / 6)` for i in 1..5),
    // and the ring at offset 0 de-duplicates nothing because its normal differs.
    const many = sphereWire(1, 16, 6, 2, ORIGIN, IDENTITY_BASIS);
    expect(many.loops).toHaveLength(5 + 2);
    const ringRadii = many.loops.slice(0, 5).map((loop) => Math.hypot(loop[0]![0], loop[0]![2]));
    expect(ringRadii[0]!).toBeCloseTo(Math.sqrt(1 - (2 / 3) ** 2), 12);
    expect(ringRadii[2]!).toBeCloseTo(1, 12);
    // Great circles keep the full radius and advance by PI / z.
    expect(Math.hypot(...many.loops[5]![0]!)).toBeCloseTo(1, 12);
  });

  test("sphere de-duplicates rings that share a canonical normal", () => {
    // z = 4 advances by PI / 4: 0, PI/4, PI/2, 3PI/4. The 0 and PI/2 pair are the
    // X and Z great circles; the PI/4 and 3PI/4 pair are distinct planes, so all four
    // survive. z = 6 + opposite-plane folding must still keep six distinct keys here.
    const zAxis = sphereWire(1, 16, 2, 4, ORIGIN, IDENTITY_BASIS);
    expect(zAxis.loops).toHaveLength(1 + 4);
  });

  test("capsule emits two rings plus closed side silhouettes", () => {
    const wire = capsuleWire(0.5, 0.25, 32, 2, ORIGIN, IDENTITY_BASIS);
    // arc segment count = ceil(32 * 0.5) = 16, so each silhouette holds 2 * 17 points.
    expect(loopPointCounts(wire)).toEqual([32, 32, 34, 34]);
    expect(wire.lines).toHaveLength(0);
    // halfHeight = 0 collapses the two rings into one.
    expect(capsuleWire(0.5, 0, 32, 2, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(3);
    // side_segment_count = 0 removes the silhouettes but keeps the rings.
    expect(capsuleWire(0.5, 0.25, 32, 0, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(2);
    // Silhouettes reach one radius above/below the cap centres.
    const silhouette = wire.loops[2]!;
    const maxY = Math.max(...silhouette.map((point) => point[1]));
    expect(maxY).toBeCloseTo(0.75, 12);
  });

  test("cone emits a base ring plus apex side lines", () => {
    const wire = coneWire(0.4, 0.8, 16, 8, ORIGIN, IDENTITY_BASIS);
    expect(loopPointCounts(wire)).toEqual([16]);
    expect(wire.lines).toHaveLength(8);
    for (const [apex, base] of wire.lines) {
      expect(apex[1]).toBeCloseTo(0.4, 12);
      expect(base[1]).toBeCloseTo(-0.4, 12);
      expect(Math.hypot(base[0], base[2])).toBeCloseTo(0.4, 12);
    }
    // Zero height is rejected by the reference (`_get_cone_base_points`).
    expect(coneWire(0.4, 0, 16, 8, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(0);
  });

  test("cylinder emits two rings plus vertical side lines", () => {
    const wire = cylinderWire(0.4, 0.3, 16, 8, ORIGIN, IDENTITY_BASIS);
    expect(loopPointCounts(wire)).toEqual([16, 16]);
    expect(wire.lines).toHaveLength(8);
    for (const [bottom, top] of wire.lines) {
      expect(top[1]).toBeCloseTo(0.3, 12);
      expect(bottom[1]).toBeCloseTo(-0.3, 12);
    }
    // Zero half height is rejected by `_get_cylinder_ring_points`.
    expect(cylinderWire(0.4, 0, 16, 8, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(0);
  });

  test("radius-0 shapes emit nothing", () => {
    expect(sphereWire(0, 16, 2, 2, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(0);
    expect(capsuleWire(0, 0.2, 16, 2, ORIGIN, IDENTITY_BASIS).loops).toHaveLength(0);
    expect(coneWire(0, 0.5, 16, 8, ORIGIN, IDENTITY_BASIS).lines).toHaveLength(0);
    expect(cylinderWire(0, 0.5, 16, 8, ORIGIN, IDENTITY_BASIS).lines).toHaveLength(0);
  });
});

describe("reference normal helpers", () => {
  test("circleNormals samples half a segment ahead of each point", () => {
    const normals = circleNormals(4, IDENTITY_BASIS);
    expect(normals).toHaveLength(4);
    // Angles 45/135/225/315 degrees for a four-segment circle.
    expect(normals[0]![0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(normals[0]![1]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(normals[2]![0]).toBeCloseTo(-Math.SQRT1_2, 12);
    for (const normal of normals) expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
    // Below the reference minimum the helper emits nothing.
    expect(circleNormals(2, IDENTITY_BASIS)).toHaveLength(0);
  });

  test("sphereRingNormals point from the centre through each segment midpoint", () => {
    // A unit ring in the XZ plane around the origin: normals are the ring radials.
    const points = circlePoints([0, 0, 0], 1, 4, { x: [1, 0, 0], y: [0, 0, 1], z: [0, 1, 0] });
    const normals = sphereRingNormals([0, 0, 0], points);
    expect(normals).toHaveLength(4);
    for (const normal of normals) {
      expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
      expect(normal[1]).toBeCloseTo(0, 12);
    }
  });

  test("capsuleOutlineNormals reproduces the ring normals on cap rings", () => {
    const ringBasis = coneBaseBasis(IDENTITY_BASIS);
    const wire = capsuleWire(0.5, 0.25, 8, 2, ORIGIN, IDENTITY_BASIS);
    const bottomRing = wire.loops[0]!;
    const outline = capsuleOutlineNormals([0, -0.25, 0], [0, 0.25, 0], [0, 1, 0], bottomRing);
    const ring = circleNormals(8, ringBasis);
    expect(outline).toHaveLength(ring.length);
    outline.forEach((normal, index) => {
      expect(normal[0]).toBeCloseTo(ring[index]![0], 12);
      expect(normal[1]).toBeCloseTo(ring[index]![1], 12);
      expect(normal[2]).toBeCloseTo(ring[index]![2], 12);
    });
  });

  test("cone and cylinder side line normals", () => {
    const cone = coneSideLineNormals(0.4, 0.8, 4, IDENTITY_BASIS);
    expect(cone).toHaveLength(4);
    const baseBasis = coneBaseBasis(IDENTITY_BASIS);
    // Reference: normalize(radial * height + axis * radius).
    const radial = baseBasis.x;
    const expected = [radial[0] * 0.8, radial[1] * 0.8 + 1 * 0.4, radial[2] * 0.8];
    const length = Math.hypot(...expected);
    cone[0]!.forEach((value, index) => expect(value).toBeCloseTo(expected[index]! / length, 12));

    const cylinder = cylinderSideLineNormals(0.4, 0.3, 4, IDENTITY_BASIS);
    expect(cylinder).toHaveLength(4);
    // Cylinder walls use the pure radial direction, independent of radius/half height.
    cylinder[0]!.forEach((value, index) => expect(value).toBeCloseTo(baseBasis.x[index]!, 12));

    expect(coneSideLineNormals(0, 0.8, 4, IDENTITY_BASIS)).toHaveLength(0);
    expect(cylinderSideLineNormals(0.4, 0, 4, IDENTITY_BASIS)).toHaveLength(0);
  });
});

describe("flat primitive normals", () => {
  test("arcNormals samples the midpoint angle of every segment", () => {
    const normals = arcNormals(Math.PI, 4, IDENTITY_BASIS);
    expect(normals).toHaveLength(4);
    // Segment midpoints of a half circle: 22.5, 67.5, 112.5, 157.5 degrees.
    expect(normals[0]![0]).toBeCloseTo(Math.cos(Math.PI / 8), 12);
    expect(normals[0]![1]).toBeCloseTo(Math.sin(Math.PI / 8), 12);
    for (const normal of normals) expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
    // The reference guards a zero sweep and too few segments by emitting nothing.
    expect(arcNormals(0, 8, IDENTITY_BASIS)).toHaveLength(0);
    expect(arcNormals(Math.PI, 2, IDENTITY_BASIS)).toHaveLength(0);
  });

  test("rectNormals follows the rect loop corner order", () => {
    // `rect.gd`'s flat basis: the rect lies in the XZ plane, so its corner normals point along
    // that plane (`-basis.y`, `basis.x`, `basis.y`, `-basis.x`).
    const flat: CircleBasis = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };
    const rounded = rectNormals(flat).map((normal) => normal.map((component) => Math.round(component * 1e6) / 1e6 + 0));
    expect(rounded).toEqual([[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]]);
  });

  test("boxEdgeNormals reproduces the reference list regardless of edge order", () => {
    const normals = boxEdgeNormals(box([1, 1, 1]).segments, ORIGIN, IDENTITY_BASIS);
    expect(normals).toHaveLength(12);
    // `_get_box_line_normals(identity)`: each edge normal is the sum of the two face normals it
    // joins, which for a unit box is one of these twelve directions.
    const expected = [
      [0, -1, -1], [1, 0, -1], [0, 1, -1], [-1, 0, -1],
      [0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1],
      [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0],
    ].map((v) => v.map((component) => component / Math.hypot(...v)));
    const key = (v: readonly number[]): string => v.map((component) => Math.round(component * 1e6) / 1e6).join(",");
    expect(new Set(normals.map(key))).toEqual(new Set(expected.map(key)));
  });
});
