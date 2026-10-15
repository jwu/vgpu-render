import { describe, expect, it } from "vitest";
import { backgroundToHex, hexToRgb } from "../src/demo-engine.js";
import { DEFAULT_DEMO_CONFIG, GODOT_CLEAR_COLOR, SCREENSHOT_DEMO_CONFIG } from "../src/demo-config.js";

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
