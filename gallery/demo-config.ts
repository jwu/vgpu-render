/**
 * Gallery/screenshot configuration for the examples page.
 *
 * This module is intentionally free of `window`, `localStorage`, and `location`
 * access so it can run in tests and in any host. Callers inject a storage-like
 * object when they want persistence.
 */

export type ProjectionMode = "perspective" | "orthographic";
/** Which camera the selected example drives: the gallery's 3D orbit/FPS camera, or the 2D pan/zoom one. */
export type CameraMode = "3d" | "2d";
export type LineJoint = "none" | "round" | "bevel" | "miter";
/** Named camera poses the gallery can switch to. */
export type CameraPreset = "default" | "oblique" | "front";

export type DemoCameraConfig = {
  /**
   * `2d` pages pan and zoom instead of orbiting, and skip the infinite grid. The 3D fields below
   * stay in the config so switching back to a 3D page restores its pose untouched.
   */
  mode: CameraMode;
  /** `world2d` view centre, in world units. Ignored by the 3D camera. */
  pan: [number, number];
  /** Canvas pixels per `world2d` unit. Ignored by the 3D camera. */
  zoom: number;
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
  orthographicHeight: number;
  projection: ProjectionMode;
};

export type DemoViewConfig = {
  showGrid: boolean;
  gridOpacity: number;
  animate: boolean;
  lineWidthScale: number;
  lineJoint: LineJoint;
  background: [number, number, number, number];
};

/**
 * Infinite grid overrides exposed in the gallery. Field names mirror the
 * reference addon properties so the panel maps one to one onto the shader
 * uniforms; `gridSize` is the reference `grid_size`.
 */
export type DemoGridConfig = {
  gridSize: number;
  cellSize: number;
  lineWidthPixels: number;
  /** Screen pixels the finest visible cell must span before the 2D grid steps up a level. */
  minPixelsBetweenCells: number;
  lodFinerLevels: number;
  lodTotalLevels: number;
  edgeFadeStartRatio: number;
  edgeFadeEndRatio: number;
  enableGrazingOpacity: boolean;
  grazingFadeStart: number;
  grazingFadeEnd: number;
  enableStippleDiscard: boolean;
  enableLodCenterFade: boolean;
  lodCenterFadeLineCount: number;
  thinLineColor: [number, number, number, number];
  thickLineColor: [number, number, number, number];
  debugLodColors: boolean;
};

export type DemoConfig = {
  camera: DemoCameraConfig;
  view: DemoViewConfig;
  grid: DemoGridConfig;
};

export type ConfigStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const DEMO_CONFIG_KEY = "vgpu-render:demo-config";

const HALF_PI = Math.PI / 2;

/**
 * Godot's `renderer/defaults/default_clear_color` from the reference project
 * (`project.godot`), which every reference screenshot is captured against.
 */
export const SCENE_CLEAR_COLOR: readonly [number, number, number, number] = [0.11764706, 0.11764706, 0.11764706, 1];

/**
 * Reference addon defaults (`addons/infinite_grid/infinite_grid_3d.gd` export
 * values), kept in one place so gallery and library defaults cannot drift.
 */
export const REFERENCE_THIN_LINE_COLOR: readonly [number, number, number, number] = [0.42, 0.42, 0.42, 0.45];
export const REFERENCE_THICK_LINE_COLOR: readonly [number, number, number, number] = [0.62, 0.62, 0.62, 0.65];

/**
 * Grid colors every reference scene overrides on its `EndlessGrid3D` node
 * (`examples/*.tscn`), which differ from the addon export defaults above. The comparison
 * preset uses them so the grid matches the reference captures rather than the addon
 * defaults.
 */
export const SCENE_THIN_LINE_COLOR: readonly [number, number, number, number] = [0.33847278, 0.33847293, 0.33847287, 0.5019608];
export const SCENE_THICK_LINE_COLOR: readonly [number, number, number, number] = [0.46034712, 0.46034718, 0.460347, 0.7019608];

/** Deep-copies the reference grid defaults for each preset. */
export function defaultGridConfig(): DemoGridConfig {
  return {
    gridSize: 2000,
    cellSize: 1,
    lineWidthPixels: 1,
    // The addon default is 2, which suits a 1-unit-per-pixel world. The 2D pages draw bevy's
    // pixel-scale matrices at roughly 0.7 px per unit, where 2 would put a visible line every
    // 3-7 pixels; 20 makes the finest level about 70 px apart instead.
    minPixelsBetweenCells: 20,
    lodFinerLevels: 3,
    lodTotalLevels: 8,
    edgeFadeStartRatio: 0,
    edgeFadeEndRatio: 1,
    enableGrazingOpacity: true,
    grazingFadeStart: 3,
    grazingFadeEnd: 20,
    enableStippleDiscard: false,
    enableLodCenterFade: true,
    lodCenterFadeLineCount: 151,
    thinLineColor: [...REFERENCE_THIN_LINE_COLOR],
    thickLineColor: [...REFERENCE_THICK_LINE_COLOR],
    debugLodColors: false,
  };
}

export const DEFAULT_DEMO_CONFIG: DemoConfig = {
  camera: {
    mode: "3d",
    pan: [0, 0],
    zoom: 1,
    yaw: 0.62,
    pitch: 0.5,
    distance: 12,
    target: [0, 0, 0],
    fov: 1.05,
    near: 0.05,
    far: 100,
    orthographicHeight: 7,
    projection: "perspective",
  },
  view: {
    showGrid: true,
    gridOpacity: 1,
    animate: true,
    lineWidthScale: 1,
    lineJoint: "round",
    background: [...SCENE_CLEAR_COLOR],
  },
  grid: defaultGridConfig(),
};

/**
 * The two 45° presets: the same 45° elevation, seen from two azimuths, with the gallery's own distance,
 * FOV and clipping — only the angle differs, so switching between the three presets is purely a change
 * of view.
 *
 * `oblique` sits off the +X/+Z diagonal, which is how a 3D gizmo is usually read: all three axes
 * foreshorten equally and nothing sits edge-on. `front` sits on the **+Z axis itself** — square on to
 * the origin, at the same 45° — so the X/Y plane reads straight off the screen and depth runs away
 * along one axis instead of two.
 *
 * Orbit angles come from `orbitBasis`: `yaw = 0` is the +X axis and `yaw = π/2` is +Z, while `eye`
 * sits `sin(pitch) · distance` above the pivot, so 45° means the eye is exactly as high as it is far.
 */
export const OBLIQUE_CAMERA: DemoCameraConfig = {
  ...DEFAULT_DEMO_CONFIG.camera,
  yaw: Math.PI / 4,
  pitch: Math.PI / 4,
};

export const FRONT_CAMERA: DemoCameraConfig = {
  ...OBLIQUE_CAMERA,
  yaw: Math.PI / 2,
};

export const OBLIQUE_DEMO_CONFIG: DemoConfig = {
  ...cloneDemoConfig(DEFAULT_DEMO_CONFIG),
  camera: { ...OBLIQUE_CAMERA, target: [OBLIQUE_CAMERA.target[0], OBLIQUE_CAMERA.target[1], OBLIQUE_CAMERA.target[2]] },
};

export const FRONT_DEMO_CONFIG: DemoConfig = {
  ...cloneDemoConfig(DEFAULT_DEMO_CONFIG),
  camera: { ...FRONT_CAMERA, target: [FRONT_CAMERA.target[0], FRONT_CAMERA.target[1], FRONT_CAMERA.target[2]] },
};

/**
 * Camera matching the reference scene camera itself: `examples/line.tscn` places `FreeCamera`
 * at (3, 3, 3) with `initial_distance = 5.196` and the engine-default 75° vertical FOV,
 * looking at the origin. `yaw = PI/4` and `pitch = asin(1 / sqrt(3))` are the orbit angles
 * that reproduce that eye position at `distance = sqrt(27)`, so the gallery can be switched
 * to the pose the reference examples actually run with — as opposed to the far capture preset.
 */
export const REFERENCE_CAMERA: DemoCameraConfig = {
  mode: "3d",
  pan: [0, 0],
  zoom: 1,
  yaw: Math.PI / 4,
  pitch: Math.asin(1 / Math.sqrt(3)),
  distance: Math.sqrt(27),
  target: [0, 0, 0],
  fov: (75 * Math.PI) / 180,
  near: 0.05,
  far: 100,
  orthographicHeight: 7,
  projection: "perspective",
};

/** Default view/grid settings with the reference scene camera. */
export const REFERENCE_DEMO_CONFIG: DemoConfig = {
  ...cloneDemoConfig(DEFAULT_DEMO_CONFIG),
  camera: {
    ...REFERENCE_CAMERA,
    target: [REFERENCE_CAMERA.target[0], REFERENCE_CAMERA.target[1], REFERENCE_CAMERA.target[2]],
  },
};

/**
 * Deterministic preset for paired screenshots. It disables time-varying state.
 * The capture harness centers the Godot scene with translation (-10, 0, 1.5),
 * uses camera eye (8, 16, 21.5) looking at the origin, 75 degree vertical FOV,
 * and the reference project clear color. No geometry is rescaled.
 */
export const SCREENSHOT_DEMO_CONFIG: DemoConfig = {
  camera: {
    mode: "3d",
    pan: [0, 0],
    zoom: 1,
    yaw: Math.atan2(21.5, 8),
    pitch: Math.atan2(16, Math.hypot(8, 21.5)),
    distance: Math.hypot(8, 16, 21.5),
    target: [0, 0, 0],
    fov: (75 * Math.PI) / 180,
    near: 0.05,
    far: 100,
    orthographicHeight: 7,
    projection: "perspective",
  },
  view: {
    showGrid: true,
    gridOpacity: 1,
    animate: false,
    lineWidthScale: 1,
    lineJoint: "round",
    background: [...SCENE_CLEAR_COLOR],
  },
  grid: {
    ...defaultGridConfig(),
    // Every reference scene overrides these two colors in its `.tscn`.
    thinLineColor: [...SCENE_THIN_LINE_COLOR],
    thickLineColor: [...SCENE_THICK_LINE_COLOR],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }
  return value;
}

function readPositive(value: unknown, path: string): number {
  const result = readNumber(value, path);
  if (result <= 0) throw new RangeError(`${path} must be greater than zero`);
  return result;
}

function readBounded(value: unknown, path: string, min: number, max: number): number {
  const result = readNumber(value, path);
  if (result < min || result > max) {
    throw new RangeError(`${path} must be between ${min} and ${max}`);
  }
  return result;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function readNumberTuple(value: unknown, path: string, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new RangeError(`${path} must contain ${length} numbers`);
  }
  return value.map((entry, index) => readNumber(entry, `${path}[${index}]`));
}

function readProjection(value: unknown): ProjectionMode {
  if (value !== "perspective" && value !== "orthographic") {
    throw new RangeError('config.camera.projection must be "perspective" or "orthographic"');
  }
  return value;
}

function readCameraMode(value: unknown): CameraMode {
  if (value !== "3d" && value !== "2d") {
    throw new RangeError('config.camera.mode must be "3d" or "2d"');
  }
  return value;
}

function readLineJoint(value: unknown): LineJoint {
  if (value !== "none" && value !== "round" && value !== "bevel" && value !== "miter") {
    throw new RangeError('config.view.lineJoint must be "none", "round", "bevel", or "miter"');
  }
  return value;
}

type NumberRule = { readonly min: number; readonly max?: number; readonly integer?: boolean };

/** Reads a bounded number with the same clamps the reference setters apply. */
function readGridNumber(value: unknown, path: string, rule: NumberRule): number {
  const result = readNumber(value, path);
  if (result < rule.min) throw new RangeError(`${path} must be at least ${rule.min}`);
  if (rule.max !== undefined && result > rule.max) throw new RangeError(`${path} must be at most ${rule.max}`);
  if (rule.integer === true && !Number.isInteger(result)) throw new RangeError(`${path} must be an integer`);
  return result;
}

/**
 * Reference-derived bounds for the grid overrides. `lodTotalLevels` uses the
 * reference minimum of 3, matching `infinite_grid_3d.gd` setters.
 */
export const GRID_NUMBER_RULES = {
  gridSize: { min: 1 },
  cellSize: { min: 0.0001 },
  lineWidthPixels: { min: 0.25 },
  minPixelsBetweenCells: { min: 0.1, max: 100 },
  lodFinerLevels: { min: 0, max: 12, integer: true },
  lodTotalLevels: { min: 3, max: 24, integer: true },
  edgeFadeStartRatio: { min: 0, max: 1 },
  edgeFadeEndRatio: { min: 0, max: 1 },
  grazingFadeStart: { min: 0, max: 90 },
  grazingFadeEnd: { min: 0, max: 90 },
  lodCenterFadeLineCount: { min: 1, max: 4096 },
} as const satisfies Record<string, NumberRule>;

function readGridColor(value: unknown, path: string): [number, number, number, number] {
  const tuple = readNumberTuple(value, path, 4);
  return [tuple[0]!, tuple[1]!, tuple[2]!, tuple[3]!];
}

function parseGridConfig(value: unknown, base: DemoGridConfig): DemoGridConfig {
  const grid = value === undefined ? {} : readRecord(value, "config.grid");
  const number = (key: keyof typeof GRID_NUMBER_RULES, fallback: number): number =>
    grid[key] === undefined ? fallback : readGridNumber(grid[key], `config.grid.${key}`, GRID_NUMBER_RULES[key]);
  return {
    gridSize: number("gridSize", base.gridSize),
    cellSize: number("cellSize", base.cellSize),
    lineWidthPixels: number("lineWidthPixels", base.lineWidthPixels),
    minPixelsBetweenCells: number("minPixelsBetweenCells", base.minPixelsBetweenCells),
    lodFinerLevels: number("lodFinerLevels", base.lodFinerLevels),
    lodTotalLevels: number("lodTotalLevels", base.lodTotalLevels),
    edgeFadeStartRatio: number("edgeFadeStartRatio", base.edgeFadeStartRatio),
    edgeFadeEndRatio: number("edgeFadeEndRatio", base.edgeFadeEndRatio),
    enableGrazingOpacity: grid.enableGrazingOpacity === undefined ? base.enableGrazingOpacity : readBoolean(grid.enableGrazingOpacity, "config.grid.enableGrazingOpacity"),
    grazingFadeStart: number("grazingFadeStart", base.grazingFadeStart),
    grazingFadeEnd: number("grazingFadeEnd", base.grazingFadeEnd),
    enableStippleDiscard: grid.enableStippleDiscard === undefined ? base.enableStippleDiscard : readBoolean(grid.enableStippleDiscard, "config.grid.enableStippleDiscard"),
    enableLodCenterFade: grid.enableLodCenterFade === undefined ? base.enableLodCenterFade : readBoolean(grid.enableLodCenterFade, "config.grid.enableLodCenterFade"),
    lodCenterFadeLineCount: number("lodCenterFadeLineCount", base.lodCenterFadeLineCount),
    thinLineColor: grid.thinLineColor === undefined ? base.thinLineColor : readGridColor(grid.thinLineColor, "config.grid.thinLineColor"),
    thickLineColor: grid.thickLineColor === undefined ? base.thickLineColor : readGridColor(grid.thickLineColor, "config.grid.thickLineColor"),
    debugLodColors: grid.debugLodColors === undefined ? base.debugLodColors : readBoolean(grid.debugLodColors, "config.grid.debugLodColors"),
  };
}

/** Deep-copies a config so callers cannot mutate shared constants. */
export function cloneDemoConfig(config: DemoConfig): DemoConfig {
  return {
    camera: {
      ...config.camera,
      pan: [config.camera.pan[0], config.camera.pan[1]],
      target: [config.camera.target[0], config.camera.target[1], config.camera.target[2]],
    },
    view: {
      ...config.view,
      background: [
        config.view.background[0],
        config.view.background[1],
        config.view.background[2],
        config.view.background[3],
      ],
    },
    grid: {
      ...config.grid,
      thinLineColor: [config.grid.thinLineColor[0], config.grid.thinLineColor[1], config.grid.thinLineColor[2], config.grid.thinLineColor[3]],
      thickLineColor: [config.grid.thickLineColor[0], config.grid.thickLineColor[1], config.grid.thickLineColor[2], config.grid.thickLineColor[3]],
    },
  };
}

/**
 * Validates a partial config and merges it over the defaults. Missing fields fall
 * back to `DEFAULT_DEMO_CONFIG`; present-but-invalid fields throw.
 */
export function parseDemoConfig(value: unknown = {}): DemoConfig {
  const root = value === undefined ? {} : readRecord(value, "config");
  const camera = root.camera === undefined ? {} : readRecord(root.camera, "config.camera");
  const view = root.view === undefined ? {} : readRecord(root.view, "config.view");
  const base = DEFAULT_DEMO_CONFIG;

  const near = camera.near === undefined ? base.camera.near : readPositive(camera.near, "config.camera.near");
  const far = camera.far === undefined ? base.camera.far : readPositive(camera.far, "config.camera.far");
  if (far <= near) {
    throw new RangeError("config.camera.far must be greater than config.camera.near");
  }

  const target = camera.target === undefined ? base.camera.target : readNumberTuple(camera.target, "config.camera.target", 3);
  const pan = camera.pan === undefined ? base.camera.pan : readNumberTuple(camera.pan, "config.camera.pan", 2);
  const background = view.background === undefined ? base.view.background : readNumberTuple(view.background, "config.view.background", 4);

  return {
    camera: {
      mode: camera.mode === undefined ? base.camera.mode : readCameraMode(camera.mode),
      pan: [pan[0]!, pan[1]!],
      zoom: camera.zoom === undefined ? base.camera.zoom : readPositive(camera.zoom, "config.camera.zoom"),
      yaw: camera.yaw === undefined ? base.camera.yaw : readNumber(camera.yaw, "config.camera.yaw"),
      pitch: camera.pitch === undefined ? base.camera.pitch : readBounded(camera.pitch, "config.camera.pitch", -HALF_PI, HALF_PI),
      distance: camera.distance === undefined ? base.camera.distance : readPositive(camera.distance, "config.camera.distance"),
      target: [target[0]!, target[1]!, target[2]!],
      fov: camera.fov === undefined ? base.camera.fov : readBounded(camera.fov, "config.camera.fov", Number.EPSILON, Math.PI),
      near,
      far,
      orthographicHeight: camera.orthographicHeight === undefined ? base.camera.orthographicHeight : readPositive(camera.orthographicHeight, "config.camera.orthographicHeight"),
      projection: camera.projection === undefined ? base.camera.projection : readProjection(camera.projection),
    },
    view: {
      showGrid: view.showGrid === undefined ? base.view.showGrid : readBoolean(view.showGrid, "config.view.showGrid"),
      gridOpacity: view.gridOpacity === undefined ? base.view.gridOpacity : readBounded(view.gridOpacity, "config.view.gridOpacity", 0, 1),
      animate: view.animate === undefined ? base.view.animate : readBoolean(view.animate, "config.view.animate"),
      lineWidthScale: view.lineWidthScale === undefined ? base.view.lineWidthScale : readPositive(view.lineWidthScale, "config.view.lineWidthScale"),
      lineJoint: view.lineJoint === undefined ? base.view.lineJoint : readLineJoint(view.lineJoint),
      background: [background[0]!, background[1]!, background[2]!, background[3]!],
    },
    grid: parseGridConfig(root.grid, base.grid),
  };
}

export function serializeDemoConfig(config: DemoConfig): string {
  return JSON.stringify(config);
}

/** Reads a config from injected storage; never throws, falls back to defaults. */
export function loadDemoConfig(storage?: ConfigStorage | null, key: string = DEMO_CONFIG_KEY): DemoConfig {
  if (storage === undefined || storage === null) return cloneDemoConfig(DEFAULT_DEMO_CONFIG);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return cloneDemoConfig(DEFAULT_DEMO_CONFIG);
  }
  if (raw === null) return cloneDemoConfig(DEFAULT_DEMO_CONFIG);
  try {
    return parseDemoConfig(JSON.parse(raw));
  } catch {
    return cloneDemoConfig(DEFAULT_DEMO_CONFIG);
  }
}

/** Validates and writes a config through injected storage. */
export function saveDemoConfig(config: DemoConfig, storage: ConfigStorage, key: string = DEMO_CONFIG_KEY): void {
  storage.setItem(key, serializeDemoConfig(parseDemoConfig(config)));
}

/**
 * The controls sidebar's display group: the only part of the config remembered per
 * example. Switching examples restores what that scene was set up with, while the
 * camera, line width, joints and grid options stay shared across examples.
 */
export type DemoDisplayConfig = {
  background: [number, number, number, number];
  projection: ProjectionMode;
  animate: boolean;
  showGrid: boolean;
  gridOpacity: number;
};

/** Storage key holding one display group per example id. */
export const DEMO_DISPLAY_CONFIG_KEY = "vgpu-render:display-configs";

/** Reads the display group out of a full config. */
export function displayConfigFrom(config: DemoConfig): DemoDisplayConfig {
  return {
    background: [config.view.background[0], config.view.background[1], config.view.background[2], config.view.background[3]],
    projection: config.camera.projection,
    animate: config.view.animate,
    showGrid: config.view.showGrid,
    gridOpacity: config.view.gridOpacity,
  };
}

/** Writes a display group into a config, leaving every other field alone. */
export function applyDisplayConfig(config: DemoConfig, display: DemoDisplayConfig): void {
  config.view.background = [display.background[0], display.background[1], display.background[2], display.background[3]];
  config.camera.projection = display.projection;
  config.view.animate = display.animate;
  config.view.showGrid = display.showGrid;
  config.view.gridOpacity = display.gridOpacity;
}

/**
 * The display group an example starts from before it has a record of its own: the
 * gallery defaults, with the scene's own grid preference (`hideGrid`) applied. That
 * preference is a scene property, so an example that hides the infinite grid opens
 * with the toggle off instead of inheriting whatever the previous example used.
 */
export function displayConfigFor(
  example: { readonly hideGrid?: boolean | undefined },
  fallback: DemoConfig = DEFAULT_DEMO_CONFIG,
): DemoDisplayConfig {
  const display = displayConfigFrom(fallback);
  if (example.hideGrid !== undefined) display.showGrid = !example.hideGrid;
  return display;
}

/** Validates a stored display group, falling back per missing field. */
export function parseDisplayConfig(
  value: unknown,
  base: DemoDisplayConfig = displayConfigFrom(DEFAULT_DEMO_CONFIG),
): DemoDisplayConfig {
  const root = value === undefined ? {} : readRecord(value, "display");
  const background = root.background === undefined ? base.background : readNumberTuple(root.background, "display.background", 4);
  return {
    background: [background[0]!, background[1]!, background[2]!, background[3]!],
    projection: root.projection === undefined ? base.projection : readProjection(root.projection),
    animate: root.animate === undefined ? base.animate : readBoolean(root.animate, "display.animate"),
    showGrid: root.showGrid === undefined ? base.showGrid : readBoolean(root.showGrid, "display.showGrid"),
    gridOpacity: root.gridOpacity === undefined ? base.gridOpacity : readBounded(root.gridOpacity, "display.gridOpacity", 0, 1),
  };
}

/**
 * Reads every example's display group. Never throws: a missing, unreadable or
 * corrupt store falls back to no records, and one bad record does not drop the
 * records next to it.
 */
export function loadDisplayConfigs(
  storage?: ConfigStorage | null,
  key: string = DEMO_DISPLAY_CONFIG_KEY,
): Record<string, DemoDisplayConfig> {
  let raw: string | null;
  try {
    raw = storage === undefined || storage === null ? null : storage.getItem(key);
  } catch {
    return {};
  }
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const configs: Record<string, DemoDisplayConfig> = {};
  for (const [id, value] of Object.entries(parsed)) {
    try {
      configs[id] = parseDisplayConfig(value);
    } catch {
      /* Skip the damaged record and keep the rest. */
    }
  }
  return configs;
}

/** Stores one example's display group, keeping every other record intact. */
export function saveDisplayConfig(
  id: string,
  display: DemoDisplayConfig,
  storage: ConfigStorage,
  key: string = DEMO_DISPLAY_CONFIG_KEY,
): void {
  const configs = loadDisplayConfigs(storage, key);
  configs[id] = parseDisplayConfig(display);
  storage.setItem(key, JSON.stringify(configs));
}
