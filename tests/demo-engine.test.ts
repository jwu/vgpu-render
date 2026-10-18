import { describe, expect, it } from "vitest";
import { backgroundToHex, camera2DKeyPan, cameraPoseFor, fpsMoveSpeed, hexToRgb, resolveInitialConfig } from "../src/demo-engine.js";
import { orbitBasis, orbitEye } from "../src/demo-camera.js";
import { DEFAULT_DEMO_CONFIG, FRONT_DEMO_CONFIG, SCENE_CLEAR_COLOR, OBLIQUE_DEMO_CONFIG, REFERENCE_DEMO_CONFIG, SCREENSHOT_DEMO_CONFIG } from "../src/demo-config.js";

describe("hexToRgb", () => {
  it("parses six-digit hex with and without a leading hash", () => {
    expect(hexToRgb("#1e1e1e")).toEqual([30, 30, 30]);
    expect(hexToRgb("1e1e1e")).toEqual([30, 30, 30]);
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
  });

  it("expands three-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("08f")).toEqual([0, 136, 255]);
  });

  it("trims surrounding whitespace", () => {
    expect(hexToRgb("  #000000  ")).toEqual([0, 0, 0]);
  });

  it("rejects malformed input instead of guessing", () => {
    for (const bad of ["", "#", "#12", "#12345", "12g45f", "#1234567", "rgb(0,0,0)"]) {
      expect(hexToRgb(bad)).toBeUndefined();
    }
  });
});

describe("2D keyboard pan", () => {
  it("maps WASD to the world2d axes", () => {
    expect(camera2DKeyPan(new Set(), 1, 0.5, 1)).toEqual([0, 0]);
    const w = camera2DKeyPan(new Set(["w"]), 1, 0.5, 1);
    expect(w[0]).toBe(0);
    expect(w[1]).toBeGreaterThan(0);
    const s = camera2DKeyPan(new Set(["s"]), 1, 0.5, 1);
    expect(s[1]).toBeLessThan(0);
    const d = camera2DKeyPan(new Set(["d"]), 1, 0.5, 1);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[1]).toBe(0);
    const a = camera2DKeyPan(new Set(["a"]), 1, 0.5, 1);
    expect(a[0]).toBeLessThan(0);
  });

  it("normalises diagonals and scales with zoom, time and pixel ratio", () => {
    const single = camera2DKeyPan(new Set(["w"]), 1, 0.5, 1);
    const diagonal = camera2DKeyPan(new Set(["w", "d"]), 1, 0.5, 1);
    expect(Math.hypot(diagonal[0], diagonal[1])).toBeCloseTo(Math.hypot(single[0], single[1]), 12);
    // A larger zoom shows less world per pixel, so the same on-screen speed covers fewer units.
    const zoomed = camera2DKeyPan(new Set(["w"]), 2, 0.5, 1);
    expect(zoomed[1] * 2).toBeCloseTo(single[1], 12);
    const longer = camera2DKeyPan(new Set(["w"]), 1, 1, 1);
    expect(longer[1]).toBeCloseTo(single[1] * 2, 12);
    // `zoom` is physical pixels per world unit, so a HiDPI frame needs the larger step.
    const hdpi = camera2DKeyPan(new Set(["w"]), 1, 0.5, 2);
    expect(hdpi[1]).toBeCloseTo(single[1] * 2, 12);
    expect(camera2DKeyPan(new Set(["w"]), 1, 0, 1)).toEqual([0, 0]);
  });
});

describe("camera presets", () => {
  it("reproduces the reference FreeCamera pose", () => {
    const { yaw, pitch, distance, fov } = REFERENCE_DEMO_CONFIG.camera;
    // `examples/line.tscn` places FreeCamera at (3, 3, 3) with `initial_distance = 5.196`
    // and the engine-default 75 degree vertical FOV, looking at the origin.
    expect(distance).toBeCloseTo(Math.hypot(3, 3, 3), 12);
    expect(fov).toBeCloseTo((75 * Math.PI) / 180, 12);
    expect(Math.cos(yaw) * Math.cos(pitch) * distance).toBeCloseTo(3, 12);
    expect(Math.sin(pitch) * distance).toBeCloseTo(3, 12);
    expect(Math.sin(yaw) * Math.cos(pitch) * distance).toBeCloseTo(3, 12);
  });

  it("keeps the gallery view and grid settings", () => {
    expect(REFERENCE_DEMO_CONFIG.view).toEqual(DEFAULT_DEMO_CONFIG.view);
    expect(REFERENCE_DEMO_CONFIG.grid).toEqual(DEFAULT_DEMO_CONFIG.grid);
  });

  it("applies ?camera=reference outside compare mode only", () => {
    const reference = resolveInitialConfig(false, new URLSearchParams("camera=reference"));
    expect(reference.camera.yaw).toBeCloseTo(REFERENCE_DEMO_CONFIG.camera.yaw, 12);
    expect(reference.camera.distance).toBeCloseTo(REFERENCE_DEMO_CONFIG.camera.distance, 12);
    const fallback = resolveInitialConfig(false, new URLSearchParams(""));
    expect(fallback.camera.yaw).toBeCloseTo(DEFAULT_DEMO_CONFIG.camera.yaw, 12);
    // Paired screenshots keep their deterministic capture pose.
    const compare = resolveInitialConfig(true, new URLSearchParams("camera=reference"));
    expect(compare.camera).toEqual(SCREENSHOT_DEMO_CONFIG.camera);
  });

  it("puts the two 45° poses at one elevation, on the diagonal and on the +Z axis", () => {
    const oblique = resolveInitialConfig(false, new URLSearchParams("camera=oblique")).camera;
    const front = resolveInitialConfig(false, new URLSearchParams("camera=front")).camera;
    const eyes = [oblique, front].map((camera) => orbitEye(camera.target, orbitBasis(camera.yaw, camera.pitch), camera.distance));
    // A 45° elevation means the eye is exactly as high above the pivot as it is far from it.
    for (const eye of eyes) expect(Math.atan2(eye[1]!, Math.hypot(eye[0]!, eye[2]!))).toBeCloseTo(Math.PI / 4, 12);
    // `oblique` looks in off the +X/+Z diagonal, `front` square on to the origin from the +Z axis alone.
    expect(eyes[0]![0]).toBeCloseTo(eyes[0]![2]!, 12);
    expect(eyes[0]![0]).toBeGreaterThan(0);
    expect(eyes[1]![0]).toBeCloseTo(0, 12);
    expect(eyes[1]![2]).toBeGreaterThan(0);
    // Both keep the gallery's distance, FOV and projection: a preset is a change of angle, nothing else.
    expect(front.distance).toBeCloseTo(DEFAULT_DEMO_CONFIG.camera.distance, 12);
    expect(front.fov).toBeCloseTo(DEFAULT_DEMO_CONFIG.camera.fov, 12);
    expect(front.projection).toBe(DEFAULT_DEMO_CONFIG.camera.projection);
  });

  it("ignores an unknown camera preset instead of guessing", () => {
    const config = resolveInitialConfig(false, new URLSearchParams("camera=nope"));
    expect(config.camera.yaw).toBeCloseTo(DEFAULT_DEMO_CONFIG.camera.yaw, 12);
  });

  it("recognises the named poses, which is what pins the camera against example framing", () => {
    expect(cameraPoseFor("front")).toBe(FRONT_DEMO_CONFIG);
    expect(cameraPoseFor("oblique")).toBe(OBLIQUE_DEMO_CONFIG);
    expect(cameraPoseFor("reference")).toBe(REFERENCE_DEMO_CONFIG);
    expect(cameraPoseFor("default")).toBe(DEFAULT_DEMO_CONFIG);
    expect(cameraPoseFor(null)).toBeUndefined();
    expect(cameraPoseFor("nope")).toBeUndefined();
  });
});

describe("backgroundToHex", () => {
  it("round-trips with hexToRgb", () => {
    expect(backgroundToHex([30 / 255, 30 / 255, 30 / 255, 1])).toBe("#1e1e1e");
    expect(hexToRgb(backgroundToHex([1, 0.5, 0, 1]))).toEqual([255, 128, 0]);
  });

  it("clamps out-of-range channels", () => {
    expect(backgroundToHex([-1, 2, 0.5, 1])).toBe("#00ff80");
  });
});

describe("default background", () => {
  it("uses Godot's default_clear_color", () => {
    expect(DEFAULT_DEMO_CONFIG.view.background).toEqual([...SCENE_CLEAR_COLOR]);
    expect(backgroundToHex(DEFAULT_DEMO_CONFIG.view.background)).toBe("#1e1e1e");
  });

  it("matches the screenshot preset so both modes agree", () => {
    expect(SCREENSHOT_DEMO_CONFIG.view.background).toEqual([...SCENE_CLEAR_COLOR]);
  });

  it("keeps defaults isolated from clones", () => {
    const clone = [...DEFAULT_DEMO_CONFIG.view.background];
    clone[3] = 0;
    expect(DEFAULT_DEMO_CONFIG.view.background[3]).toBe(1);
    expect(DEFAULT_DEMO_CONFIG.view.background).not.toBe(SCENE_CLEAR_COLOR);
  });
});

describe("fps camera movement", () => {
  it("walks at the reference free-camera speed", () => {
    expect(fpsMoveSpeed(new Set<string>())).toBe(5);
    expect(fpsMoveSpeed(new Set(["w", "d"]))).toBe(5);
  });

  it("sprints three times as fast while shift is held", () => {
    expect(fpsMoveSpeed(new Set(["w", "shift"]))).toBe(15);
    expect(fpsMoveSpeed(new Set(["shift"]))).toBe(15);
  });
});
