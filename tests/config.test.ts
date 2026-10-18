import { describe, expect, test } from "vitest";
import { DebugDraw3D, FrameDrawList, type LineCommand, type PointCommand } from "../src/index.js";
import {
  applyDisplayConfig,
  cloneDemoConfig,
  DEFAULT_DEMO_CONFIG,
  DEMO_DISPLAY_CONFIG_KEY,
  displayConfigFor,
  displayConfigFrom,
  loadDemoConfig,
  loadDisplayConfigs,
  parseDemoConfig,
  parseDisplayConfig,
  saveDemoConfig,
  saveDisplayConfig,
  SCREENSHOT_DEMO_CONFIG,
  serializeDemoConfig,
  type ConfigStorage,
} from "../gallery/demo-config.js";

describe("FrameDrawList default styles", () => {
  test("keeps built-in defaults when no style defaults are given", () => {
    const frame = new FrameDrawList();
    frame.line([0, 0, 0], [1, 0, 0]);
    frame.point([0, 0, 0]);
    expect(frame.lines[0]!.color).toEqual([1, 1, 1, 1]);
    expect(frame.lines[0]!.width).toBe(1);
    expect(frame.lines[0]!.widthMode).toBe("screen");
    expect(frame.lines[0]!.layer).toBe(1);
    expect(frame.points[0]!.size).toBe(1);
    expect(frame.points[0]!.layer).toBe(1);
  });

  test("applies default line style when options omit fields", () => {
    const frame = new FrameDrawList({
      line: { color: [1, 0, 0, 1], width: 4, widthMode: "world", joint: "round", layer: 2 },
    });
    frame.line([0, 0, 0], [1, 0, 0]);
    const line = frame.lines[0]!;
    expect(line.color).toEqual([1, 0, 0, 1]);
    expect(line.colorEnd).toEqual([1, 0, 0, 1]);
    expect(line.width).toBe(4);
    expect(line.widthMode).toBe("world");
    expect(line.joint).toBe("round");
    expect(line.layer).toBe(2);
  });

  test("explicit line options override drawList defaults", () => {
    const frame = new FrameDrawList({ line: { color: [1, 0, 0, 1], width: 4, layer: 2 } });
    frame.line([0, 0, 0], [1, 0, 0], { color: [0, 1, 0, 1], width: 9, layer: 8 });
    const line = frame.lines[0]!;
    expect(line.color).toEqual([0, 1, 0, 1]);
    expect(line.colorEnd).toEqual([0, 1, 0, 1]);
    expect(line.width).toBe(9);
    expect(line.layer).toBe(8);
  });

  test("colorEnd prefers explicit color and default colorEnd in order", () => {
    const frame = new FrameDrawList({ line: { color: [1, 0, 0, 1], colorEnd: [0, 0, 1, 1] } });
    frame.line([0, 0, 0], [1, 0, 0]);
    expect(frame.lines[0]!.colorEnd).toEqual([0, 0, 1, 1]);
    frame.line([0, 0, 0], [2, 0, 0], { color: [0, 1, 0, 1] });
    expect(frame.lines[1]!.colorEnd).toEqual([0, 1, 0, 1]);
    frame.line([0, 0, 0], [3, 0, 0], { colorEnd: [1, 1, 0, 1] });
    expect(frame.lines[2]!.colorEnd).toEqual([1, 1, 0, 1]);
  });

  test("applies default point style and lets options override it", () => {
    const frame = new FrameDrawList({ point: { color: [0, 0, 1, 1], size: 6, sizeMode: "world", layer: 4 } });
    frame.point([0, 0, 0]);
    expect(frame.points[0]!.color).toEqual([0, 0, 1, 1]);
    expect(frame.points[0]!.size).toBe(6);
    expect(frame.points[0]!.sizeMode).toBe("world");
    expect(frame.points[0]!.layer).toBe(4);
    frame.point([1, 0, 0], { size: 2, layer: 1 });
    expect(frame.points[1]!.size).toBe(2);
    expect(frame.points[1]!.layer).toBe(1);
  });

  test("line joints inherit the resolved line style", () => {
    const frame = new FrameDrawList({ line: { color: [0.5, 0.5, 0.5, 1], width: 3, layer: 8 } });
    frame.lineStrip([[0, 0, 0], [1, 0, 0], [2, 0, 0]], { joint: "round" });
    expect(frame.points).toHaveLength(0);
    expect(frame.joints).toHaveLength(1);
    const joint = frame.joints[0]!;
    expect(joint.center).toEqual([1, 0, 0]);
    expect(joint.previous).toEqual([0, 0, 0]);
    expect(joint.next).toEqual([2, 0, 0]);
    expect(joint.joint).toBe("round");
    expect(joint.color).toEqual([0.5, 0.5, 0.5, 1]);
    expect(joint.width).toBe(3);
    expect(joint.layer).toBe(8);
  });

  test("applies line defaults to derived primitives", () => {
    const frame = new FrameDrawList({ line: { color: [0.2, 0.4, 0.6, 1], width: 3 } });
    frame.ray([0, 0, 0], [1, 0, 0]);
    frame.grid([0, 0, 0], [2, 2], [0.5, 0.5]);
    expect(frame.lines.length).toBeGreaterThan(0);
    for (const line of frame.lines) {
      expect(line.color).toEqual([0.2, 0.4, 0.6, 1]);
      expect(line.width).toBe(3);
    }
  });

  test("rejects invalid style defaults at construction", () => {
    expect(() => new FrameDrawList({ line: { width: 0 } })).toThrow(/greater than zero/);
    expect(() => new FrameDrawList({ line: { width: Number.NaN } })).toThrow(/finite/);
    expect(() => new FrameDrawList({ point: { size: -1 } })).toThrow(/greater than zero/);
    expect(() => new FrameDrawList({ line: { layer: -1 } })).toThrow(/non-negative/);
    expect(() => new FrameDrawList({ line: { color: [1, 1, 1] as unknown as [number, number, number, number] } })).toThrow(/four values/);
    expect(() => new FrameDrawList({ line: { color: [1, 1, 1, Number.NaN] } })).toThrow(/finite/);
    expect(() => new FrameDrawList({ line: { widthMode: "screenish" as unknown as "screen" } })).toThrow(/screen/);
    expect(() => new FrameDrawList({ line: { joint: "zig" as unknown as "round" } })).toThrow(/joint/);
    expect(() => new FrameDrawList({ line: { normal: [0, 0] as unknown as [number, number, number] } })).toThrow(/three values/);
  });

  test("layer filtering still applies to defaulted commands", () => {
    const frame = new FrameDrawList({ line: { layer: 2 }, point: { layer: 2 } });
    frame.line([0, 0, 0], [1, 0, 0]);
    frame.point([0, 0, 0]);
    expect(frame.commands(1)).toHaveLength(0);
    expect(frame.commands(2)).toHaveLength(2);
  });

  test("sealed drawLists reject defaulted commands too", () => {
    const frame = new FrameDrawList({ line: { color: [1, 1, 1, 1] } });
    frame.seal();
    expect(() => frame.line([0, 0, 0], [1, 0, 0])).toThrow("sealed");
  });
});

describe("DebugDraw3D default styles", () => {
  test("forwards default point and line styles into frames", () => {
    const debug = new DebugDraw3D({
      defaultLineStyle: { color: [1, 0, 0, 1], width: 3 },
      defaultPointStyle: { size: 5, color: [0, 1, 0, 1] },
    });
    const frame = debug.beginFrame();
    frame.line([0, 0, 0], [1, 0, 0]);
    frame.point([0, 0, 0]);
    const commands = debug.finishFrame(frame);

    const lines = commands.filter((command): command is LineCommand => command.kind === "line");
    const points = commands.filter((command): command is PointCommand => command.kind === "point");
    expect(lines).toHaveLength(1);
    expect(points).toHaveLength(1);
    expect(lines[0]!.color).toEqual([1, 0, 0, 1]);
    expect(lines[0]!.width).toBe(3);
    expect(points[0]!.size).toBe(5);
    expect(points[0]!.color).toEqual([0, 1, 0, 1]);
  });

  test("explicit per-primitive options override debug defaults", () => {
    const debug = new DebugDraw3D({ defaultLineStyle: { color: [1, 0, 0, 1], width: 3 } });
    const frame = debug.beginFrame();
    frame.line([0, 0, 0], [1, 0, 0], { color: [0, 0, 1, 1], width: 7 });
    const commands = debug.finishFrame(frame);
    expect(commands[0]).toMatchObject({ color: [0, 0, 1, 1], width: 7 });
  });

  test("validates default styles eagerly", () => {
    expect(() => new DebugDraw3D({ defaultLineStyle: { width: -1 } })).toThrow(/greater than zero/);
    expect(() => new DebugDraw3D({ defaultPointStyle: { size: 0 } })).toThrow(/greater than zero/);
  });

  test("keeps validating layer masks and nested frames", () => {
    expect(() => new DebugDraw3D({ defaultVisibleLayers: -1 })).toThrow(/non-negative/);
    const debug = new DebugDraw3D({ defaultVisibleLayers: 1, defaultLineStyle: { layer: 2 } });
    const frame = debug.beginFrame();
    frame.line([0, 0, 0], [1, 0, 0]);
    frame.line([0, 0, 0], [0, 1, 0], { layer: 1 });
    const commands = debug.finishFrame(frame);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.layer).toBe(1);
    const nested = debug.beginFrame();
    expect(() => debug.beginFrame()).toThrow("already active");
    debug.finishFrame(nested);
  });
});

describe("demo config", () => {
  test("returns defaults for empty input", () => {
    expect(parseDemoConfig({})).toEqual(DEFAULT_DEMO_CONFIG);
    expect(parseDemoConfig()).toEqual(DEFAULT_DEMO_CONFIG);
  });

  test("merges partial patches over defaults", () => {
    const config = parseDemoConfig({ camera: { distance: 20 }, view: { showGrid: false } });
    expect(config.camera.distance).toBe(20);
    expect(config.camera.yaw).toBe(DEFAULT_DEMO_CONFIG.camera.yaw);
    expect(config.view.showGrid).toBe(false);
    expect(config.view.lineWidthScale).toBe(DEFAULT_DEMO_CONFIG.view.lineWidthScale);
    expect(config.grid).toEqual(DEFAULT_DEMO_CONFIG.grid);
  });

  test("grid defaults match the reference addon export values", () => {
    const grid = parseDemoConfig({}).grid;
    expect(grid.gridSize).toBe(2000);
    expect(grid.cellSize).toBe(1);
    expect(grid.lineWidthPixels).toBe(1);
    expect(grid.lodFinerLevels).toBe(3);
    expect(grid.lodTotalLevels).toBe(8);
    expect(grid.edgeFadeStartRatio).toBe(0);
    expect(grid.edgeFadeEndRatio).toBe(1);
    expect(grid.enableGrazingOpacity).toBe(true);
    expect(grid.grazingFadeStart).toBe(3);
    expect(grid.grazingFadeEnd).toBe(20);
    expect(grid.enableStippleDiscard).toBe(false);
    expect(grid.enableLodCenterFade).toBe(true);
    expect(grid.lodCenterFadeLineCount).toBe(151);
    expect(grid.thinLineColor).toEqual([0.42, 0.42, 0.42, 0.45]);
    expect(grid.thickLineColor).toEqual([0.62, 0.62, 0.62, 0.65]);
    expect(grid.debugLodColors).toBe(false);
  });

  test("merges partial grid patches over the defaults", () => {
    const config = parseDemoConfig({ grid: { cellSize: 0.5, debugLodColors: true } });
    expect(config.grid.cellSize).toBe(0.5);
    expect(config.grid.debugLodColors).toBe(true);
    expect(config.grid.lodFinerLevels).toBe(DEFAULT_DEMO_CONFIG.grid.lodFinerLevels);
  });

  test("rejects grid values the reference setters would clamp away", () => {
    expect(() => parseDemoConfig({ grid: { gridSize: 0 } })).toThrow(/grid.gridSize/);
    expect(() => parseDemoConfig({ grid: { cellSize: 0 } })).toThrow(/grid.cellSize/);
    expect(() => parseDemoConfig({ grid: { lineWidthPixels: 0.1 } })).toThrow(/grid.lineWidthPixels/);
    expect(() => parseDemoConfig({ grid: { lodFinerLevels: -1 } })).toThrow(/grid.lodFinerLevels/);
    expect(() => parseDemoConfig({ grid: { lodFinerLevels: 1.5 } })).toThrow(/integer/);
    expect(() => parseDemoConfig({ grid: { lodTotalLevels: 2 } })).toThrow(/grid.lodTotalLevels/);
    expect(() => parseDemoConfig({ grid: { edgeFadeStartRatio: 2 } })).toThrow(/grid.edgeFadeStartRatio/);
    expect(() => parseDemoConfig({ grid: { grazingFadeEnd: 91 } })).toThrow(/grid.grazingFadeEnd/);
    expect(() => parseDemoConfig({ grid: { thinLineColor: [1, 1, 1] } })).toThrow(/thinLineColor/);
    expect(() => parseDemoConfig({ grid: { debugLodColors: "yes" } })).toThrow(/debugLodColors/);
    expect(() => parseDemoConfig({ grid: { enableLodCenterFade: 1 } })).toThrow(/enableLodCenterFade/);
  });

  test("rejects structurally invalid and out-of-range values", () => {
    expect(() => parseDemoConfig(null)).toThrow(TypeError);
    expect(() => parseDemoConfig([])).toThrow(TypeError);
    expect(() => parseDemoConfig({ camera: 5 })).toThrow(TypeError);
    expect(() => parseDemoConfig({ camera: { distance: 0 } })).toThrow(/camera.distance/);
    expect(() => parseDemoConfig({ camera: { distance: Number.NaN } })).toThrow(/finite/);
    expect(() => parseDemoConfig({ camera: { pitch: 5 } })).toThrow(/camera.pitch/);
    expect(() => parseDemoConfig({ camera: { projection: "isometric" } })).toThrow(/projection/);
    expect(() => parseDemoConfig({ camera: { target: [0, 0] } })).toThrow(/camera.target/);
    expect(() => parseDemoConfig({ camera: { fov: 0 } })).toThrow(/camera.fov/);
    expect(() => parseDemoConfig({ camera: { near: 2, far: 1 } })).toThrow(/far must be greater/);
    expect(() => parseDemoConfig({ camera: { orthographicHeight: -1 } })).toThrow(/orthographicHeight/);
    expect(() => parseDemoConfig({ view: { gridOpacity: 2 } })).toThrow(/gridOpacity/);
    expect(() => parseDemoConfig({ view: { lineWidthScale: -1 } })).toThrow(/lineWidthScale/);
    expect(() => parseDemoConfig({ view: { background: [0, 0, 0] } })).toThrow(/background/);
    expect(() => parseDemoConfig({ view: { showGrid: "yes" } })).toThrow(/showGrid/);
  });

  test("serialize round-trips through parse", () => {
    const config = parseDemoConfig({ camera: { yaw: 1.5 }, view: { animate: false } });
    expect(parseDemoConfig(JSON.parse(serializeDemoConfig(config)))).toEqual(config);
  });

  test("load and save use injected storage", () => {
    const store = new Map<string, string>();
    const storage: ConfigStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { store.set(key, value); },
    };
    expect(loadDemoConfig(storage)).toEqual(DEFAULT_DEMO_CONFIG);
    saveDemoConfig(parseDemoConfig({ camera: { distance: 42 } }), storage);
    expect(loadDemoConfig(storage).camera.distance).toBe(42);
    expect(loadDemoConfig(storage, "other-key")).toEqual(DEFAULT_DEMO_CONFIG);
  });

  test("load tolerates missing, malformed, invalid, and absent storage", () => {
    const storageOf = (value: string | null): ConfigStorage => ({ getItem: () => value, setItem: () => {} });
    expect(loadDemoConfig(null)).toEqual(DEFAULT_DEMO_CONFIG);
    expect(loadDemoConfig()).toEqual(DEFAULT_DEMO_CONFIG);
    expect(loadDemoConfig(storageOf(null))).toEqual(DEFAULT_DEMO_CONFIG);
    expect(loadDemoConfig(storageOf("{ not json"))).toEqual(DEFAULT_DEMO_CONFIG);
    expect(loadDemoConfig(storageOf(JSON.stringify({ camera: { distance: -5 } })))).toEqual(DEFAULT_DEMO_CONFIG);
    expect(loadDemoConfig({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} })).toEqual(DEFAULT_DEMO_CONFIG);
  });

  test("screenshot preset is deterministic and independent of storage", () => {
    const storage: ConfigStorage = {
      getItem: () => JSON.stringify({ view: { animate: true, showGrid: true, gridOpacity: 0.1 } }),
      setItem: () => {},
    };
    expect(SCREENSHOT_DEMO_CONFIG.view.animate).toBe(false);
    expect(SCREENSHOT_DEMO_CONFIG.camera.projection).toBe("perspective");
    expect(SCREENSHOT_DEMO_CONFIG.camera.fov).toBeCloseTo((75 * Math.PI) / 180, 12);
    expect(SCREENSHOT_DEMO_CONFIG.camera.pitch).toBeCloseTo(Math.atan2(16, Math.hypot(8, 21.5)), 12);
    expect(SCREENSHOT_DEMO_CONFIG.camera.yaw).toBeCloseTo(Math.atan2(21.5, 8), 12);
    expect(SCREENSHOT_DEMO_CONFIG.camera.distance).toBeCloseTo(Math.hypot(8, 16, 21.5), 12);
    // Loading a different stored config must not mutate the preset.
    loadDemoConfig(storage);
    expect(SCREENSHOT_DEMO_CONFIG.view.animate).toBe(false);
    expect(SCREENSHOT_DEMO_CONFIG.view.gridOpacity).toBe(1);
    expect(parseDemoConfig(SCREENSHOT_DEMO_CONFIG)).toEqual(SCREENSHOT_DEMO_CONFIG);
  });

  test("cloneDemoConfig deep-copies arrays", () => {
    const copy = cloneDemoConfig(DEFAULT_DEMO_CONFIG);
    expect(copy).not.toBe(DEFAULT_DEMO_CONFIG);
    copy.camera.target[0] = 9;
    copy.view.background[3] = 0;
    copy.grid.thinLineColor[0] = 0.9;
    copy.grid.thickLineColor[3] = 0;
    expect(DEFAULT_DEMO_CONFIG.camera.target[0]).toBe(0);
    expect(DEFAULT_DEMO_CONFIG.view.background[3]).toBe(1);
    expect(DEFAULT_DEMO_CONFIG.grid.thinLineColor[0]).toBeCloseTo(0.42, 12);
    expect(DEFAULT_DEMO_CONFIG.grid.thickLineColor[3]).toBeCloseTo(0.65, 12);
  });

  test("serialize round-trips grid overrides through parse", () => {
    const config = parseDemoConfig({ grid: { gridSize: 500, debugLodColors: true } });
    expect(parseDemoConfig(JSON.parse(serializeDemoConfig(config)))).toEqual(config);
  });
});

/** The sidebar's display group is the part of the config remembered per example. */
describe("per-example display config", () => {
  const withStorage = () => {
    const store = new Map<string, string>();
    const storage: ConfigStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => { store.set(key, value); },
    };
    return { store, storage };
  };

  test("displayConfigFrom copies the display group without aliasing arrays", () => {
    const config = parseDemoConfig({ view: { background: [0.1, 0.2, 0.3, 1], showGrid: false, animate: false, gridOpacity: 0.25 } });
    const display = displayConfigFrom(config);
    expect(display).toEqual({ background: [0.1, 0.2, 0.3, 1], projection: "perspective", animate: false, showGrid: false, gridOpacity: 0.25 });
    display.background[0] = 0.9;
    expect(config.view.background[0]).toBeCloseTo(0.1, 12);
  });

  test("applyDisplayConfig writes only the display fields", () => {
    const config = cloneDemoConfig(DEFAULT_DEMO_CONFIG);
    applyDisplayConfig(config, { background: [1, 0, 0, 1], projection: "orthographic", animate: false, showGrid: false, gridOpacity: 0.5 });
    expect(config.view.background).toEqual([1, 0, 0, 1]);
    expect(config.camera.projection).toBe("orthographic");
    expect(config.view.animate).toBe(false);
    expect(config.view.showGrid).toBe(false);
    expect(config.view.gridOpacity).toBe(0.5);
    // Everything else, camera pose included, keeps the value shared by all examples.
    expect(config.view.lineWidthScale).toBe(DEFAULT_DEMO_CONFIG.view.lineWidthScale);
    expect(config.view.lineJoint).toBe(DEFAULT_DEMO_CONFIG.view.lineJoint);
    expect(config.camera.yaw).toBe(DEFAULT_DEMO_CONFIG.camera.yaw);
    expect(config.grid.gridSize).toBe(DEFAULT_DEMO_CONFIG.grid.gridSize);
  });

  test("displayConfigFor starts from the defaults plus the scene's hideGrid", () => {
    expect(displayConfigFor({}).showGrid).toBe(DEFAULT_DEMO_CONFIG.view.showGrid);
    expect(displayConfigFor({ hideGrid: true }).showGrid).toBe(false);
    expect(displayConfigFor({ hideGrid: false }).showGrid).toBe(true);
    expect(displayConfigFor({ hideGrid: true }).background).toEqual(DEFAULT_DEMO_CONFIG.view.background);
    expect(displayConfigFor({ hideGrid: true }).animate).toBe(DEFAULT_DEMO_CONFIG.view.animate);
  });

  test("parseDisplayConfig falls back per field and rejects invalid values", () => {
    const base = displayConfigFrom(DEFAULT_DEMO_CONFIG);
    // `grid2d` is the one field that does not fall back to `base`: an absent marker means the
    // record predates the 2D grid, which the migration needs to be able to tell apart.
    expect(parseDisplayConfig({}, base)).toEqual(base);
    expect(parseDisplayConfig({ grid2d: true }, base)).toEqual(base);
    expect(parseDisplayConfig({ animate: false }, base).animate).toBe(false);
    expect(() => parseDisplayConfig({ animate: "yes" }, base)).toThrow();
    expect(() => parseDisplayConfig({ gridOpacity: 5 }, base)).toThrow();
    expect(() => parseDisplayConfig({ projection: "isometric" }, base)).toThrow();
    expect(() => parseDisplayConfig({ background: [0, 0, 0] }, base)).toThrow();
  });

  test("records are stored per example and keep their siblings", () => {
    const { storage } = withStorage();
    const circle = { ...displayConfigFrom(DEFAULT_DEMO_CONFIG), animate: false };
    saveDisplayConfig("circle", circle, storage);
    saveDisplayConfig("text-scale", { ...displayConfigFrom(DEFAULT_DEMO_CONFIG), showGrid: false, gridOpacity: 0.3 }, storage);

    const restored = loadDisplayConfigs(storage);
    expect(restored.circle).toEqual(circle);
    expect(restored["text-scale"]?.showGrid).toBe(false);
    expect(restored["text-scale"]?.gridOpacity).toBe(0.3);
    expect(restored["text-scale"]?.animate).toBe(DEFAULT_DEMO_CONFIG.view.animate);
    expect(loadDisplayConfigs(storage, "other-key")).toEqual({});
  });

  test("loadDisplayConfigs drops a damaged record instead of the whole map", () => {
    const raw = JSON.stringify({ circle: { animate: false }, broken: { gridOpacity: 42 } });
    expect(loadDisplayConfigs({ getItem: () => raw, setItem: () => {} })).toEqual({
      circle: { ...displayConfigFrom(DEFAULT_DEMO_CONFIG), animate: false },
    });
    expect(loadDisplayConfigs({ getItem: () => "{ not json", setItem: () => {} })).toEqual({});
    expect(loadDisplayConfigs({ getItem: () => JSON.stringify([1, 2]), setItem: () => {} })).toEqual({});
    expect(loadDisplayConfigs({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} })).toEqual({});
    expect(loadDisplayConfigs(null)).toEqual({});
    expect(loadDisplayConfigs()).toEqual({});
  });

  test("display records live under their own storage key", () => {
    const { store, storage } = withStorage();
    saveDisplayConfig("circle", displayConfigFrom(DEFAULT_DEMO_CONFIG), storage);
    expect([...store.keys()]).toEqual([DEMO_DISPLAY_CONFIG_KEY]);
  });
});

describe("2D camera config", () => {
  test("defaults to the 3D camera", () => {
    expect(DEFAULT_DEMO_CONFIG.camera.mode).toBe("3d");
    expect(DEFAULT_DEMO_CONFIG.camera.pan).toEqual([0, 0]);
    expect(DEFAULT_DEMO_CONFIG.camera.zoom).toBe(1);
  });

  test("parses mode, pan and zoom", () => {
    const config = parseDemoConfig({ camera: { mode: "2d", pan: [12, -4], zoom: 2.5 } });
    expect(config.camera.mode).toBe("2d");
    expect(config.camera.pan).toEqual([12, -4]);
    expect(config.camera.zoom).toBe(2.5);
  });

  test("rejects an invalid mode, pan or zoom", () => {
    expect(() => parseDemoConfig({ camera: { mode: "isometric" } })).toThrow('"3d" or "2d"');
    expect(() => parseDemoConfig({ camera: { pan: [1] } })).toThrow("must contain 2 numbers");
    expect(() => parseDemoConfig({ camera: { zoom: 0 } })).toThrow("greater than zero");
  });

  test("clones the pan array instead of sharing it", () => {
    const config = cloneDemoConfig(DEFAULT_DEMO_CONFIG);
    config.camera.pan[0] = 5;
    expect(DEFAULT_DEMO_CONFIG.camera.pan[0]).toBe(0);
  });

  test("parses the 2D grid's minimum pixel spacing", () => {
    expect(DEFAULT_DEMO_CONFIG.grid.minPixelsBetweenCells).toBe(20);
    expect(parseDemoConfig({ grid: { minPixelsBetweenCells: 12 } }).grid.minPixelsBetweenCells).toBe(12);
    expect(() => parseDemoConfig({ grid: { minPixelsBetweenCells: 0 } })).toThrow("at least 0.1");
  });
});
