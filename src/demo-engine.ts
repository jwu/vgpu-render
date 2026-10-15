/**
 * Framework-agnostic gallery engine.
 *
 * Owns the WebGPU surface, the render loop, camera interaction, and config
 * persistence. React only renders chrome and calls the setters below; no React
 * state participates in the animation loop.
 */

import { effect, frame, init, sampler, surface, target } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { DebugDraw3D, GpuDebugDraw3D, InfiniteGrid3D, type FrameCommand, type InfiniteGridOptions, type Vec3 } from "./index.js";
import { GODOT_EXAMPLES, type GodotExample } from "./godot-examples.js";
import { buildScene } from "./godot-scenes.js";
import { linearClearColor } from "./color-space.js";
import {
  cloneDemoConfig,
  DEFAULT_DEMO_CONFIG,
  loadDemoConfig,
  parseDemoConfig,
  saveDemoConfig,
  SCREENSHOT_DEMO_CONFIG,
  type DemoConfig,
  type DemoGridConfig,
  type LineJoint,
  type ProjectionMode,
} from "./demo-config.js";

export type EngineStatus = "requesting" | "ready" | "error";

export type DemoSnapshot = {
  readonly selected: GodotExample;
  readonly config: DemoConfig;
  readonly status: EngineStatus;
  readonly statusDetail: string;
  readonly counts: string;
};

export type DemoEngineOptions = {
  readonly compareMode: boolean;
  /** Config resolved from URL params and storage, before the first render. */
  readonly config: DemoConfig;
};

type PointerMode = "rotate" | "pan" | "fps";
type PointerState = { x: number; y: number; mode: PointerMode };
type FpsCamera = { position: [number, number, number]; yaw: number; pitch: number };

const FPS_SPEED = 8;
const LOOK_SENSITIVITY = 0.008;
const PAN_SENSITIVITY = 0.0015;
const FPS_KEYS = ["w", "a", "s", "d", "q", "e"];

/**
 * Presentation shader for the linear scene pass.
 *
 * Debug geometry blends in the linear working space on an `rgba16float` target. This is the
 * final encode step: it writes the linear values back to the sRGB-encoded canvas, which is the
 * same "linear blend, encode on output" contract Godot's `blend_mix` and Bevy's
 * `add_srgb_suffix` swapchain view provide. Only RGB is encoded; alpha passes through.
 */
const PRESENT_SHADER = prepareShader(`
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;

fn encode_srgb(value: vec3f) -> vec3f {
  let low = value * 12.92;
  let high = 1.055 * pow(max(value, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, value <= vec3f(0.0031308));
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(sceneTexture));
  let uv = position.xy / dims;
  let scene = textureSample(sceneTexture, sceneSampler, uv);
  return vec4f(encode_srgb(scene.rgb), scene.a);
}
`);

/** Resolves the initial config from URL params, cloning shared presets. */
export function resolveInitialConfig(compareMode: boolean, params: URLSearchParams, storage?: Storage): DemoConfig {
  const base = compareMode ? cloneDemoConfig(SCREENSHOT_DEMO_CONFIG) : loadDemoConfig(storage ?? null);
  if (params.get("projection") === "orthographic") base.camera.projection = "orthographic";
  if (params.get("grid") === "0") base.view.showGrid = false;
  return base;
}

export class DemoEngine {
  private readonly compareMode: boolean;

  private canvas: HTMLCanvasElement | undefined;
  private config: DemoConfig;
  private selected: GodotExample;
  private status: EngineStatus = "requesting";
  private statusDetail = "正在请求 WebGPU";
  private counts = "";

  private readonly listeners = new Set<(snapshot: DemoSnapshot) => void>();
  private current: DemoSnapshot;
  private pointer: PointerState | undefined;
  private fpsCamera: FpsCamera | undefined;
  private readonly keys = new Set<string>();
  private time = 0;
  private previousTimestamp: number | undefined;
  private viewProjection: Float32Array = new Float32Array(16);
  private destroyed = false;

  constructor(options: DemoEngineOptions) {
    this.compareMode = options.compareMode;
    this.config = options.config;
    this.selected = GODOT_EXAMPLES[0]!;
    this.current = this.buildSnapshot();

    window.addEventListener("error", this.onWindowError);
    window.addEventListener("unhandledrejection", this.onUnhandledRejection);
    window.addEventListener("hashchange", this.onHashChange);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointerlockchange", this.onPointerLockChange);
  }

  subscribe(listener: (snapshot: DemoSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Returns a cached snapshot so `useSyncExternalStore` sees a stable reference. */
  snapshot(): DemoSnapshot {
    return this.current;
  }

  /** Applies the example encoded in the URL hash or `?scene=`, if present. */
  selectInitialFromLocation(params: URLSearchParams): void {
    const id = params.get("scene") ?? location.hash.slice(1);
    const match = GODOT_EXAMPLES.find((example) => example.id === id);
    if (match) this.selectExample(match, false);
  }

  selectExample(example: GodotExample, updateHash = true): void {
    this.selected = example;
    this.time = 0;
    if (updateHash) location.hash = example.id;
    this.emit();
  }

  setAnimate(animate: boolean): void {
    this.update(() => {
      this.config.view.animate = animate;
    });
  }

  setShowGrid(showGrid: boolean): void {
    this.update(() => {
      this.config.view.showGrid = showGrid;
    });
  }

  setLineWidthScale(scale: number): void {
    this.update(() => {
      this.config.view.lineWidthScale = clampFinite(scale, 0.25, 3, this.config.view.lineWidthScale);
    });
  }

  setGridOpacity(opacity: number): void {
    this.update(() => {
      this.config.view.gridOpacity = clampFinite(opacity, 0, 1, this.config.view.gridOpacity);
    });
  }

  /**
   * Merges a partial grid patch into the config. Invalid entries are rejected by
   * a parse round-trip, matching how the rest of the gallery validates input.
   */
  setGridOptions(patch: Partial<DemoGridConfig>): void {
    this.update(() => {
      this.config = parseDemoConfig({ ...this.config, grid: { ...this.config.grid, ...patch } });
    });
  }

  /**
   * Sets one line color from a `#rrggbb` input. Alpha keeps the current value so
   * changing a hue never silently changes line opacity.
   */
  setGridLineColor(target: "thin" | "thick", hex: string): void {
    const rgb = hexToRgb(hex);
    if (rgb === undefined) return;
    const alpha = target === "thin" ? this.config.grid.thinLineColor[3] : this.config.grid.thickLineColor[3];
    const color: [number, number, number, number] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, alpha];
    this.setGridOptions(target === "thin" ? { thinLineColor: color } : { thickLineColor: color });
  }

  setProjection(projection: ProjectionMode): void {
    this.update(() => {
      this.config.camera.projection = projection;
    });
  }

  setLineJoint(joint: LineJoint): void {
    this.update(() => {
      this.config.view.lineJoint = joint;
    });
  }

  /** Sets the background from a `#rrggbb` color input value. */
  setBackgroundHex(hex: string): void {
    const rgb = hexToRgb(hex);
    if (rgb === undefined) return;
    this.update(() => {
      this.config.view.background = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1];
    });
  }

  resetConfig(): void {
    this.update(() => {
      this.config = cloneDemoConfig(DEFAULT_DEMO_CONFIG);
      this.time = 0;
    });
  }

  /**
   * Boots WebGPU on the given canvas and starts the render loop. The canvas is
   * injected here (rather than in the constructor) so React can create the
   * engine during render and hand over the element after it mounts.
   */
  async start(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    let output: ReturnType<typeof surface>;
    let gpu: Awaited<ReturnType<typeof init>>;
    try {
      gpu = await init();
      output = surface(gpu, canvas);
    } catch (error) {
      this.setError(`error: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    // Linear working-space target, mirroring bevy's `Rgba16Float` view target: debug colors
    // arrive already decoded, alpha blending happens in linear light, and the present pass
    // below re-encodes once. Rendering straight to the canvas cannot do this, because
    // Chromium rejects an `-srgb` canvas format.
    const scene = target(gpu, { size: output.size, format: "rgba16float", depth: true, msaa: 4 });
    const present = effect(gpu, PRESENT_SHADER, { set: { sceneTexture: scene, sceneSampler: sampler(gpu) } });
    output.onResize(({ width, height }) => scene.resize([width, height]));

    const renderer = new GpuDebugDraw3D(gpu, { points: 16384, lines: 65536, triangles: 65536 });
    const debug = new DebugDraw3D({ defaultLineStyle: { width: 2 } });
    const grid = new InfiniteGrid3D(gpu, this.gridOptions());

    this.status = "ready";
    this.statusDetail = "WebGPU 就绪 · 部分对齐";
    document.documentElement.dataset.renderReady = "true";
    this.emit();

    const render = (timestamp: number): void => {
      if (this.destroyed) return;
      const delta = this.previousTimestamp === undefined ? 0 : Math.min((timestamp - this.previousTimestamp) / 1000, 0.1);
      if (this.config.view.animate) this.time += delta;
      this.applyFpsMovement(delta);
      this.previousTimestamp = timestamp;

      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      const c = this.config.camera;
      const eye = this.fpsCamera?.position ?? this.orbitCameraPosition();
      const target: Vec3 = this.fpsCamera
        ? [
            eye[0] + Math.sin(this.fpsCamera.yaw) * Math.cos(this.fpsCamera.pitch),
            eye[1] + Math.sin(this.fpsCamera.pitch),
            eye[2] - Math.cos(this.fpsCamera.yaw) * Math.cos(this.fpsCamera.pitch),
          ]
        : c.target;

      this.viewProjection = multiply(
        c.projection === "orthographic"
          ? orthographic(c.orthographicHeight, width / height, c.near, c.far)
          : perspective(c.fov, width / height, c.near, c.far),
        lookAt(eye, target),
      );

      const recorder = debug.beginFrame();
      buildScene(this.selected.id, recorder, this.time, this.config.view.lineJoint);
      const raw = debug.finishFrame(recorder);
      const commands: readonly FrameCommand[] = raw.map((command) =>
        command.kind === "line" ? { ...command, width: command.width * this.config.view.lineWidthScale } : command,
      );

      renderer.prepare(commands, { viewProjection: this.viewProjection });
      grid.setOpacity(this.config.view.gridOpacity);
      grid.setOptions(this.gridOptions());
      const forward: Vec3 = [
        target[0] - eye[0],
        target[1] - eye[1],
        target[2] - eye[2],
      ];
      const forwardLength = Math.hypot(forward[0], forward[1], forward[2]) || 1;
      grid.prepare({
        viewProjection: this.viewProjection,
        cameraPosition: eye,
        cameraForward: [forward[0] / forwardLength, forward[1] / forwardLength, forward[2] / forwardLength],
        projection: c.projection,
        orthographicSize: c.orthographicHeight,
        farClip: c.far,
      });

      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        // The clear color is an sRGB-authored value, so it decodes like every other color.
        f.pass({ target: scene, clear: linearClearColor(this.config.view.background), clearDepth: 1 }, (pass) => {
          if (this.config.view.showGrid) grid.draw(pass);
          renderer.draw(pass);
        });
        f.pass({ target: output }, (pass) => pass.draw(present));
      });

      const nextCounts = `${commands.length} 条命令 · ${this.selected.columns.length} 列`;
      if (nextCounts !== this.counts) {
        this.counts = nextCounts;
        this.emit();
      }
      document.documentElement.dataset.renderReady = "true";
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    window.removeEventListener("error", this.onWindowError);
    window.removeEventListener("unhandledrejection", this.onUnhandledRejection);
    window.removeEventListener("hashchange", this.onHashChange);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerlockchange", this.onPointerLockChange);
    const canvas = this.canvas;
    if (canvas === undefined) return;
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
  }

  private buildSnapshot(): DemoSnapshot {
    return {
      selected: this.selected,
      config: this.config,
      status: this.status,
      statusDetail: this.statusDetail,
      counts: this.counts,
    };
  }

  private emit(): void {
    this.current = this.buildSnapshot();
    for (const listener of this.listeners) listener(this.current);
  }

  /** Mutates the config, persists it, and notifies subscribers exactly once. */
  private update(mutate: () => void): void {
    mutate();
    this.emit();
    this.persist();
  }

  private setError(message: string): void {
    this.status = "error";
    this.statusDetail = message;
    this.emit();
  }

  private persist(): void {
    if (this.compareMode) return;
    try {
      saveDemoConfig(this.config, localStorage);
    } catch {
      /* Storage can be unavailable. */
    }
  }

  /** Maps the gallery grid config onto the library option names. */
  private gridOptions(): InfiniteGridOptions {
    const grid = this.config.grid;
    return {
      size: grid.gridSize,
      cellSize: grid.cellSize,
      lineWidthPixels: grid.lineWidthPixels,
      lodFinerLevels: grid.lodFinerLevels,
      lodTotalLevels: grid.lodTotalLevels,
      edgeFadeStartRatio: grid.edgeFadeStartRatio,
      edgeFadeEndRatio: grid.edgeFadeEndRatio,
      enableGrazingOpacity: grid.enableGrazingOpacity,
      grazingFadeStart: grid.grazingFadeStart,
      grazingFadeEnd: grid.grazingFadeEnd,
      enableStippleDiscard: grid.enableStippleDiscard,
      enableLodCenterFade: grid.enableLodCenterFade,
      lodCenterFadeLineCount: grid.lodCenterFadeLineCount,
      thinLineColor: grid.thinLineColor,
      thickLineColor: grid.thickLineColor,
      debugLodColors: grid.debugLodColors,
    };
  }

  private orbitCameraPosition(): Vec3 {
    const c = this.config.camera;
    return [
      c.target[0] + Math.cos(c.yaw) * Math.cos(c.pitch) * c.distance,
      c.target[1] + Math.sin(c.pitch) * c.distance,
      c.target[2] + Math.sin(c.yaw) * Math.cos(c.pitch) * c.distance,
    ];
  }

  private cameraBasis(): { right: Vec3; up: Vec3 } {
    const c = this.config.camera;
    const right: Vec3 = [Math.sin(c.yaw), 0, -Math.cos(c.yaw)];
    const up: Vec3 = [
      -Math.sin(c.pitch) * Math.cos(c.yaw),
      Math.cos(c.pitch),
      -Math.sin(c.pitch) * Math.sin(c.yaw),
    ];
    return { right, up };
  }

  private enterFpsCamera(): void {
    const position = this.orbitCameraPosition();
    const c = this.config.camera;
    this.fpsCamera = {
      position: [position[0], position[1], position[2]],
      yaw: Math.atan2(c.target[0] - position[0], -(c.target[2] - position[2])),
      pitch: Math.asin((c.target[1] - position[1]) / c.distance),
    };
  }

  private exitFpsCamera(): void {
    if (!this.fpsCamera) return;
    const c = this.config.camera;
    c.target = [
      this.fpsCamera.position[0] + Math.sin(this.fpsCamera.yaw) * Math.cos(this.fpsCamera.pitch) * c.distance,
      this.fpsCamera.position[1] + Math.sin(this.fpsCamera.pitch) * c.distance,
      this.fpsCamera.position[2] - Math.cos(this.fpsCamera.yaw) * Math.cos(this.fpsCamera.pitch) * c.distance,
    ];
    c.yaw = this.fpsCamera.yaw + Math.PI / 2;
    c.pitch = -this.fpsCamera.pitch;
    this.fpsCamera = undefined;
  }

  private applyFpsMovement(delta: number): void {
    if (this.compareMode || !this.fpsCamera || this.keys.size === 0) return;
    const forward: Vec3 = [
      Math.sin(this.fpsCamera.yaw) * Math.cos(this.fpsCamera.pitch),
      Math.sin(this.fpsCamera.pitch),
      -Math.cos(this.fpsCamera.yaw) * Math.cos(this.fpsCamera.pitch),
    ];
    const right: Vec3 = [Math.cos(this.fpsCamera.yaw), 0, Math.sin(this.fpsCamera.yaw)];
    const up: Vec3 = [
      -Math.sin(this.fpsCamera.yaw) * Math.sin(this.fpsCamera.pitch),
      Math.cos(this.fpsCamera.pitch),
      Math.cos(this.fpsCamera.yaw) * Math.sin(this.fpsCamera.pitch),
    ];
    const forwardAmount = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0);
    const rightAmount = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0);
    const upAmount = (this.keys.has("e") ? 1 : 0) - (this.keys.has("q") ? 1 : 0);
    const move: Vec3 = [
      forward[0] * forwardAmount + right[0] * rightAmount + up[0] * upAmount,
      forward[1] * forwardAmount + right[1] * rightAmount + up[1] * upAmount,
      forward[2] * forwardAmount + right[2] * rightAmount + up[2] * upAmount,
    ];
    const length = Math.hypot(move[0], move[1], move[2]);
    if (length < 1e-6) return;
    const step = (FPS_SPEED * delta) / length;
    this.fpsCamera.position[0] += move[0] * step;
    this.fpsCamera.position[1] += move[1] * step;
    this.fpsCamera.position[2] += move[2] * step;
  }

  private onWindowError = (event: ErrorEvent): void => {
    this.setError(`error: ${event.message}`);
  };

  private onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.setError(`error: ${String(event.reason)}`);
  };

  private onHashChange = (): void => {
    const match = GODOT_EXAMPLES.find((example) => example.id === location.hash.slice(1));
    if (match) this.selectExample(match, false);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.compareMode) return;
    const key = event.key.toLowerCase();
    if (!FPS_KEYS.includes(key)) return;
    this.keys.add(key);
    if (this.pointer?.mode === "fps") event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas && this.pointer?.mode === "fps") {
      this.pointer = undefined;
      this.keys.clear();
      this.exitFpsCamera();
      this.persist();
    }
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.compareMode || this.canvas === undefined) return;
    if (event.button > 2) return;
    const mode: PointerMode = event.button === 0 ? "rotate" : event.button === 1 ? "pan" : "fps";
    this.pointer = { x: event.clientX, y: event.clientY, mode };
    if (mode === "fps") {
      this.enterFpsCamera();
      void this.canvas.requestPointerLock();
    } else {
      this.canvas.setPointerCapture(event.pointerId);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointer || this.compareMode || this.canvas === undefined) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    const c = this.config.camera;
    if (this.pointer.mode === "fps") {
      if (!this.fpsCamera) return;
      const lookX = document.pointerLockElement === this.canvas ? event.movementX : dx;
      const lookY = document.pointerLockElement === this.canvas ? event.movementY : dy;
      this.fpsCamera.yaw += lookX * LOOK_SENSITIVITY;
      this.fpsCamera.pitch = Math.max(-1.35, Math.min(1.35, this.fpsCamera.pitch - lookY * LOOK_SENSITIVITY));
    } else if (this.pointer.mode === "rotate") {
      c.yaw += dx * LOOK_SENSITIVITY;
      c.pitch = Math.max(-1.35, Math.min(1.35, c.pitch + dy * LOOK_SENSITIVITY));
    } else {
      const { right, up } = this.cameraBasis();
      const pan = c.distance * PAN_SENSITIVITY;
      c.target[0] += (right[0] * -dx + up[0] * dy) * pan;
      c.target[1] += (right[1] * -dx + up[1] * dy) * pan;
      c.target[2] += (right[2] * -dx + up[2] * dy) * pan;
    }
    this.pointer = { x: event.clientX, y: event.clientY, mode: this.pointer.mode };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointer === undefined || this.canvas === undefined) return;
    this.pointer = undefined;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    if (event.pointerId >= 0 && this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (event.button === 2 || this.fpsCamera) this.exitFpsCamera();
    this.keys.clear();
    this.persist();
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.compareMode) return;
    const factor = Math.exp(event.deltaY * 0.001);
    if (this.config.camera.projection === "orthographic") {
      this.config.camera.orthographicHeight = Math.max(1, Math.min(100, this.config.camera.orthographicHeight * factor));
    } else {
      this.config.camera.distance = Math.max(3, Math.min(100, this.config.camera.distance * factor));
    }
    this.persist();
    event.preventDefault();
  };
}

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ]);
}

function orthographic(height: number, aspect: number, near: number, far: number): Float32Array {
  return new Float32Array([
    2 / (height * aspect), 0, 0, 0,
    0, 2 / height, 0, 0,
    0, 0, 1 / (near - far), 0,
    0, 0, near / (near - far), 1,
  ]);
}

function lookAt(eye: Vec3, target: Vec3): Float32Array {
  const length = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
  const z: Vec3 = [(eye[0] - target[0]) / length, (eye[1] - target[1]) / length, (eye[2] - target[2]) / length];
  const xLength = Math.hypot(z[2], z[0]);
  const x: Vec3 = xLength < 1e-6 ? [1, 0, 0] : [z[2] / xLength, 0, -z[0] / xLength];
  const y: Vec3 = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row]! * b[col * 4]! +
        a[4 + row]! * b[col * 4 + 1]! +
        a[8 + row]! * b[col * 4 + 2]! +
        a[12 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

/** Converts a normalized RGBA background into the `#rrggbb` form a color input needs. */
export function backgroundToHex(background: readonly number[]): string {
  return (
    "#" +
    background
      .slice(0, 3)
      .map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Parses `#rgb` / `#rrggbb` (with or without `#`) into 0-255 channels. */
export function hexToRgb(hex: string): [number, number, number] | undefined {
  const raw = hex.trim().replace(/^#/, "");
  const expanded = raw.length === 3 ? raw.replace(/./g, (digit) => digit + digit) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(expanded) === false) return undefined;
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
}

/** Coerces a possibly-invalid numeric control value into a clamped, finite number. */
function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
