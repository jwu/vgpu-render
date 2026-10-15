/**
 * Gallery/screenshot configuration for the examples page.
 *
 * This module is intentionally free of `window`, `localStorage`, and `location`
 * access so it can run in tests and in any host. Callers inject a storage-like
 * object when they want persistence.
 */

export type ProjectionMode = "perspective" | "orthographic";
export type LineJoint = "none" | "round" | "bevel" | "miter";

export type DemoCameraConfig = {
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

export type DemoConfig = {
  camera: DemoCameraConfig;
  view: DemoViewConfig;
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
export const GODOT_CLEAR_COLOR: readonly [number, number, number, number] = [0.11764706, 0.11764706, 0.11764706, 1];

export const DEFAULT_DEMO_CONFIG: DemoConfig = {
  camera: {
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
    background: [...GODOT_CLEAR_COLOR],
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
    background: [...GODOT_CLEAR_COLOR],
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

function readLineJoint(value: unknown): LineJoint {
  if (value !== "none" && value !== "round" && value !== "bevel" && value !== "miter") {
    throw new RangeError('config.view.lineJoint must be "none", "round", "bevel", or "miter"');
  }
  return value;
}

/** Deep-copies a config so callers cannot mutate shared constants. */
export function cloneDemoConfig(config: DemoConfig): DemoConfig {
  return {
    camera: {
      ...config.camera,
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
  const background = view.background === undefined ? base.view.background : readNumberTuple(view.background, "config.view.background", 4);

  return {
    camera: {
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
