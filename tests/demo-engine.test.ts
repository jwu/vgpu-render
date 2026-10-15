import { describe, expect, it } from "vitest";
import { backgroundToHex, hexToRgb, resolveInitialConfig } from "../src/demo-engine.js";
import { DEFAULT_DEMO_CONFIG, GODOT_CLEAR_COLOR, REFERENCE_DEMO_CONFIG, SCREENSHOT_DEMO_CONFIG } from "../src/demo-config.js";

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
    expect(DEFAULT_DEMO_CONFIG.view.background).toEqual([...GODOT_CLEAR_COLOR]);
    expect(backgroundToHex(DEFAULT_DEMO_CONFIG.view.background)).toBe("#1e1e1e");
  });

  it("matches the screenshot preset so both modes agree", () => {
    expect(SCREENSHOT_DEMO_CONFIG.view.background).toEqual([...GODOT_CLEAR_COLOR]);
  });

  it("keeps defaults isolated from clones", () => {
    const clone = [...DEFAULT_DEMO_CONFIG.view.background];
    clone[3] = 0;
    expect(DEFAULT_DEMO_CONFIG.view.background[3]).toBe(1);
    expect(DEFAULT_DEMO_CONFIG.view.background).not.toBe(GODOT_CLEAR_COLOR);
  });
});
