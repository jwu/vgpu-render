import { describe, expect, test } from "vitest";
import { arc, box, capsule, cone, cylinder, disc, rect, sphere } from "../src/geometry-generators.js";

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
