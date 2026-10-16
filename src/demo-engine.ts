/**
 * Framework-agnostic gallery engine.
 *
 * Owns the WebGPU surface, the render loop, camera interaction, and config
 * persistence. React only renders chrome and calls the setters below; no React
 * state participates in the animation loop.
 */

import { effect, frame, init, sampler, surface, target } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { BakedMsdfRasterizer, CanvasGlyphRasterizer, DebugDraw3D, GpuDebugDraw3D, FrameRecorder, InfiniteGrid3D, loadDefaultFont, OutlineGlyphRasterizer, type FrameCommand, type InfiniteGridOptions, type TextFontSource, type TextSources, type Vec3 } from "./index.js";
import { GODOT_EXAMPLES, type GodotExample } from "./godot-examples.js";
import { buildScene } from "./godot-scenes.js";
import { linearClearColor } from "./color-space.js";
import {
  frameBounds,
  boundsOfPoints,
  fpsBasis,
  glideVelocityFor,
  integrateGlide,
  integrateGlideVec3,
  orbitBasis,
  orbitEye,
  PITCH_LIMIT,
  viewMatrix,
  worldUnitsPerPixel,
  type Bounds,
} from "./demo-camera.js";
import {
  cloneDemoConfig,
  DEFAULT_DEMO_CONFIG,
  loadDemoConfig,
  parseDemoConfig,
  REFERENCE_DEMO_CONFIG,
  saveDemoConfig,
  SCREENSHOT_DEMO_CONFIG,
  type CameraPreset,
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
  /**
   * Frames each selected example (pivot + distance) when it changes. Disabled when the URL pins
   * the camera to the reference pose, since that comparison needs the pose left alone.
   */
  readonly autoFrame?: boolean;
};

type PointerMode = "rotate" | "pan" | "fps";
type PointerState = { x: number; y: number; mode: PointerMode };
type FpsCamera = { position: [number, number, number]; yaw: number; pitch: number };

/**
 * Camera feel, aligned with the reference `entities/free_camera.gd` (the Godot 3D editor
 * defaults) and layered with the velocity model from `demo-camera.ts`: a drag feeds a velocity,
 * releasing leaves it to glide, and only the glide decays.
 */
const FPS_SPEED = 5; // FREELOOK_BASE_SPEED
/** `ORBIT_SENSITIVITY_DEGREES` / `FREELOOK_SENSITIVITY_DEGREES`: 0.25° per mouse pixel. */
const LOOK_SENSITIVITY = (0.25 * Math.PI) / 180;
/** `TRANSLATION_SENSITIVITY` as screen pixels per dragged pixel (see `worldUnitsPerPixel`). */
const PAN_SCREEN_RATIO = 0.75;
/** `ZOOM_FACTOR`: one wheel notch scales the orbit distance (or the ortho height) by 1.08. */
const ZOOM_FACTOR = 1.08;
/** Chromium reports 100 `deltaY` units per notch; one notch is `log2(1.08)` doublings. */
const ZOOM_DOUBLINGS_PER_DELTA = Math.log2(ZOOM_FACTOR) / 100;
const FPS_KEYS = ["w", "a", "s", "d", "q", "e"];
const ORIGIN: Vec3 = [0, 0, 0];

/**
 * Inertia. A released drag keeps a velocity that halves every `GLIDE_HALFLIFE` seconds; the caps
 * are budgets of leftover travel (degrees, screens, doublings) rather than velocities, so a flick
 * cannot throw the view further than that at any frame rate — see `glideVelocityFor`.
 */
const GLIDE_HALFLIFE = 0.14;
const GLIDE_MAX_ANGLE = (60 * Math.PI) / 180;
const GLIDE_MAX_PAN_SCREENS = 0.5;
const GLIDE_MAX_ZOOM_DOUBLINGS = 0.75;
/** Pointer samples are averaged over this window (ms) to estimate a release velocity. */
const DRAG_TAIL_WINDOW = 120;
/** A flick needs at least this much sample span (ms); a burst inside one millisecond says nothing. */
const DRAG_MIN_SPAN = 6;
/** Releasing this long (ms) after the last sample counts as a stop, not a flick. */
const DRAG_STOP_GAP = 90;
/** Below this a glide is over, the velocities are zeroed and the camera is persisted. */
const GLIDE_EPSILON = 1e-3;
/** A running glide writes its pose at most this often. */
const GLIDE_PERSIST_INTERVAL = 200;

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
  // The capture preset owns the camera in compare mode so paired screenshots stay
  // deterministic; the reference pose is an interactive-gallery override only.
  if (!compareMode && params.get("camera") === "reference") base.camera = cloneDemoConfig(REFERENCE_DEMO_CONFIG).camera;
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
  /** World-to-view matrix; the normal-aware stroke fade reads it like Godot's `VIEW_MATRIX`. */
  private view: Float32Array = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  /** Last rendered canvas height in CSS pixels, the reference for pointer-drag scaling. */
  private canvasHeight = 1;
  /** Canvas aspect from the last frame, used when framing a selected example. */
  private canvasAspect = 16 / 9;
  private readonly autoFrame: boolean;
  /** Interactive camera velocities (rad/s, world units/s, log₂ doublings/s). */
  private cameraVelocity: { yaw: number; pitch: number; zoom: number; pan: Vec3 } = { yaw: 0, pitch: 0, zoom: 0, pan: [0, 0, 0] };
  /** Last drag samples, used to estimate the velocity a release hands to the glide. */
  private dragTail: { time: number; yaw: number; pitch: number; pan: Vec3 }[] = [];
  /** Timestamp of the last mid-glide persist. */
  private glidePersistedAt = 0;
  private destroyed = false;

  constructor(options: DemoEngineOptions) {
    this.compareMode = options.compareMode;
    this.config = options.config;
    this.autoFrame = options.autoFrame ?? true;
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
    if (this.autoFrame) {
      this.frameSelectedExample();
      this.persist();
    }
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

  /**
   * Switches the orbit pose between the gallery default and the pose the reference
   * examples run with (`examples/*.tscn` `FreeCamera`). Free orbiting afterwards leaves
   * the preset in place as a starting point rather than tracking the change.
   */
  setCameraPreset(preset: CameraPreset): void {
    this.stopGlide();
    this.update(() => {
      this.config.camera = cloneDemoConfig(preset === "reference" ? REFERENCE_DEMO_CONFIG : DEFAULT_DEMO_CONFIG).camera;
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

    // The bundled font is inlined, so registering it with the document is the only setup step.
    // A failure is not fatal: Canvas2D falls back to another face and the scene still renders.
    const params = new URLSearchParams(location.search);
    const textSources = await createTextSources(params);
    // The page has to hold every glyph the scene drew at its own raster scale, and 4x rasterisation
    // costs sixteen times the area of 1x.
    const renderer = new GpuDebugDraw3D(gpu, { points: 16384, lines: 65536, triangles: 65536, joints: 65536, text: { sources: textSources, atlasSize: 1024 } });
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
      this.canvasHeight = height;
      this.canvasAspect = width / height;
      this.integrateCamera(delta);
      const c = this.config.camera;
      const basis = this.fpsCamera === undefined
        ? orbitBasis(c.yaw, c.pitch)
        : fpsBasis(this.fpsCamera.yaw, this.fpsCamera.pitch);
      const eye: Vec3 = this.fpsCamera === undefined ? orbitEye(c.target, basis, c.distance) : this.fpsCamera.position;
      // The view matrix comes from the camera's own axes rather than a world-up `lookAt`, so the
      // pitch limit no longer exists to dodge a degenerate basis (see `demo-camera`).
      this.view = viewMatrix(eye, basis);
      this.viewProjection = multiply(
        c.projection === "orthographic"
          ? orthographic(c.orthographicHeight, width / height, c.near, c.far)
          : perspective(c.fov, width / height, c.near, c.far),
        this.view,
      );

      const recorder = debug.beginFrame();
      buildScene(this.selected.id, recorder, this.time, this.config.view.lineJoint);
      const raw = debug.finishFrame(recorder);
      // The width scale must cover joints as well: they are the same stroke as the segments
      // they join, so scaling only `line` commands would leave the wedges at full size.
      const scale = this.config.view.lineWidthScale;
      const commands: readonly FrameCommand[] = raw.map((command) =>
        command.kind === "line" || command.kind === "joint" ? { ...command, width: command.width * scale } : command,
      );

      renderer.prepare(commands, { viewProjection: this.viewProjection, view: this.view });
      grid.setOpacity(this.config.view.gridOpacity);
      grid.setOptions(this.gridOptions());
      grid.prepare({
        viewProjection: this.viewProjection,
        cameraPosition: eye,
        // The basis forward is already unit length, which is what the grid's LOD rules expect.
        cameraForward: basis.forward,
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
    return orbitEye(c.target, orbitBasis(c.yaw, c.pitch), c.distance);
  }

  /** Drops any glide: a fresh grab, a preset, or a re-frame owns the camera again. */
  private stopGlide(): void {
    this.cameraVelocity = { yaw: 0, pitch: 0, zoom: 0, pan: [0, 0, 0] };
    this.dragTail = [];
    this.glidePersistedAt = 0;
  }

  /**
   * Advances the camera by one frame of glide: rotation in the orbit chart, translation of the
   * pivot, and zoom as a scalar velocity in log₂ space.
   *
   * While a pointer owns the camera the values are positioned directly instead, so the tracked
   * velocity only decays there and a flick cannot double up on the live drag delta.
   */
  private integrateCamera(delta: number): void {
    const c = this.config.camera;
    const velocity = this.cameraVelocity;
    const frame = Math.min(Math.max(delta, 0), 0.1);
    if (frame === 0) return;

    if (this.pointer !== undefined) {
      velocity.yaw = integrateGlide(0, velocity.yaw, GLIDE_HALFLIFE, frame).velocity;
      velocity.pitch = integrateGlide(0, velocity.pitch, GLIDE_HALFLIFE, frame).velocity;
      velocity.zoom = integrateGlide(0, velocity.zoom, GLIDE_HALFLIFE, frame).velocity;
      velocity.pan = integrateGlideVec3([0, 0, 0], velocity.pan, GLIDE_HALFLIFE, frame).velocity;
      return;
    }

    if (velocity.yaw !== 0 || velocity.pitch !== 0) {
      const yaw = integrateGlide(c.yaw, velocity.yaw, GLIDE_HALFLIFE, frame);
      const pitch = integrateGlide(c.pitch, velocity.pitch, GLIDE_HALFLIFE, frame);
      const clamped = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch.value));
      c.yaw = yaw.value;
      c.pitch = clamped;
      velocity.yaw = yaw.velocity;
      // Stop dead at the pole: letting the velocity keep pushing there would flip the view over.
      velocity.pitch = clamped === pitch.value ? pitch.velocity : 0;
    }

    if (velocity.pan[0] !== 0 || velocity.pan[1] !== 0 || velocity.pan[2] !== 0) {
      const pan = integrateGlideVec3(c.target, velocity.pan, GLIDE_HALFLIFE, frame);
      c.target = [pan.value[0], pan.value[1], pan.value[2]];
      velocity.pan = [pan.velocity[0], pan.velocity[1], pan.velocity[2]];
    }

    if (velocity.zoom !== 0) {
      const step = integrateGlide(0, velocity.zoom, GLIDE_HALFLIFE, frame);
      const factor = 2 ** step.value;
      if (c.projection === "orthographic") {
        const next = clampFinite(c.orthographicHeight * factor, 1, 100, c.orthographicHeight);
        velocity.zoom = next === c.orthographicHeight ? 0 : step.velocity;
        c.orthographicHeight = next;
      } else {
        const next = clampFinite(c.distance * factor, 3, 100, c.distance);
        velocity.zoom = next === c.distance ? 0 : step.velocity;
        c.distance = next;
      }
    }

    const moving = velocity.yaw !== 0 || velocity.pitch !== 0 || velocity.zoom !== 0
      || velocity.pan[0] !== 0 || velocity.pan[1] !== 0 || velocity.pan[2] !== 0;
    const settled = Math.abs(velocity.yaw) < GLIDE_EPSILON && Math.abs(velocity.pitch) < GLIDE_EPSILON
      && Math.abs(velocity.zoom) < GLIDE_EPSILON && Math.abs(velocity.pan[0]) < GLIDE_EPSILON
      && Math.abs(velocity.pan[1]) < GLIDE_EPSILON && Math.abs(velocity.pan[2]) < GLIDE_EPSILON;
    if (moving && settled) {
      this.stopGlide();
      this.persist();
      return;
    }
    // A running glide is persisted too (throttled), so a reload in the middle of it keeps the
    // same pose instead of snapping back to wherever the drag had got to.
    if (moving) {
      const now = performance.now();
      if (now - this.glidePersistedAt > GLIDE_PERSIST_INTERVAL) {
        this.glidePersistedAt = now;
        this.persist();
      }
    }
  }

  /**
   * Feeds one drag sample into the release-velocity estimate.
   *
   * Samples are kept as deltas in a short window and averaged on release, which stays stable when
   * the browser delivers several pointer samples inside the same millisecond (per-event rates
   * would divide by zero there and lose the flick entirely).
   */
  private trackDrag(event: PointerEvent, yaw: number, pitch: number, pan: Vec3): void {
    const now = event.timeStamp;
    this.dragTail.push({ time: now, yaw, pitch, pan });
    const cutoff = now - DRAG_TAIL_WINDOW;
    while (this.dragTail.length > 1 && this.dragTail[0]!.time < cutoff) this.dragTail.shift();
  }

  /**
   * Average drag velocity over the sample window, in the units the glide expects.
   *
   * Returns zero when the release was too long after the last sample (the user stopped moving, so
   * there is nothing to fling) or when the window is too short to judge.
   */
  private dragVelocity(releasedAt: number): { yaw: number; pitch: number; pan: Vec3 } {
    const tail = this.dragTail;
    const last = tail[tail.length - 1];
    const stopped = { yaw: 0, pitch: 0, pan: ORIGIN };
    if (tail.length < 2 || last === undefined) return stopped;
    if (!(releasedAt - last.time <= DRAG_STOP_GAP)) return stopped;
    const span = (last.time - tail[0]!.time) / 1000;
    if (!(span >= DRAG_MIN_SPAN / 1000)) return stopped;
    let yaw = 0;
    let pitch = 0;
    let panX = 0;
    let panY = 0;
    let panZ = 0;
    for (const sample of tail) {
      yaw += sample.yaw;
      pitch += sample.pitch;
      panX += sample.pan[0];
      panY += sample.pan[1];
      panZ += sample.pan[2];
    }
    return { yaw: yaw / span, pitch: pitch / span, pan: [panX / span, panY / span, panZ / span] };
  }

  /** Caps an estimated drag velocity into the glide budgets when the pointer is released. */
  private launchGlide(releasedAt: number): void {
    const drag = this.dragVelocity(releasedAt);
    const angular = glideVelocityFor(GLIDE_MAX_ANGLE, GLIDE_HALFLIFE);
    const spin = Math.hypot(drag.yaw, drag.pitch);
    const scale = spin > angular ? angular / spin : 1;
    const panBudget = GLIDE_MAX_PAN_SCREENS * this.canvasHeight
      * worldUnitsPerPixel(this.config.camera, this.canvasHeight);
    const travel = glideVelocityFor(panBudget, GLIDE_HALFLIFE);
    const speed = Math.hypot(drag.pan[0], drag.pan[1], drag.pan[2]);
    const panScale = speed > travel && speed > 0 ? travel / speed : 1;
    this.cameraVelocity.yaw = drag.yaw * scale;
    this.cameraVelocity.pitch = drag.pitch * scale;
    this.cameraVelocity.pan = [drag.pan[0] * panScale, drag.pan[1] * panScale, drag.pan[2] * panScale];
  }

  /**
   * Frames the selected example: the orbit pivot moves to the scene's bounding box centre and the
   * distance/height fit the bounding sphere, so rotating turns around the geometry instead of the
   * origin and the wide matrices (up to 34 units across) fit without manual panning. Only the
   * pose's position changes — the current yaw/pitch is kept.
   */
  private frameSelectedExample(): void {
    const bounds = this.selectedBounds();
    if (bounds === undefined) return;
    const c = this.config.camera;
    const fit = frameBounds(bounds, { basis: orbitBasis(c.yaw, c.pitch), fovY: c.fov, aspect: this.canvasAspect });
    c.target = [fit.pivot[0], fit.pivot[1], fit.pivot[2]];
    c.distance = clampFinite(fit.distance, 3, 100, c.distance);
    c.orthographicHeight = clampFinite(fit.orthographicHeight, 1, 100, c.orthographicHeight);
    this.stopGlide();
  }

  /** Measures one frame of the selected example; scene geometry is static per example. */
  private selectedBounds(): Bounds | undefined {
    const recorder = new FrameRecorder();
    buildScene(this.selected.id, recorder, 0, this.config.view.lineJoint);
    return boundsOfPoints(recorder.commands().flatMap(commandPoints));
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
    // Grabbing the camera ends any glide that is still running.
    this.stopGlide();
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
      const previousPitch = c.pitch;
      const yawStep = dx * LOOK_SENSITIVITY;
      const nextPitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, previousPitch + dy * LOOK_SENSITIVITY));
      c.yaw += yawStep;
      c.pitch = nextPitch;
      // A drag that runs into the pole contributes no further pitch velocity, so releasing there
      // cannot fling the view back the other way.
      this.trackDrag(event, yawStep, nextPitch - previousPitch, ORIGIN);
    } else {
      const { right, up } = orbitBasis(c.yaw, c.pitch);
      const pan = worldUnitsPerPixel(c, this.canvasHeight) * PAN_SCREEN_RATIO;
      const step: Vec3 = [
        (right[0] * -dx + up[0] * dy) * pan,
        (right[1] * -dx + up[1] * dy) * pan,
        (right[2] * -dx + up[2] * dy) * pan,
      ];
      c.target = [c.target[0] + step[0], c.target[1] + step[1], c.target[2] + step[2]];
      this.trackDrag(event, 0, 0, step);
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
    // Hand the drag's average velocity to the glide, then persist once it settles.
    this.launchGlide(event.timeStamp);
    this.persist();
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.compareMode) return;
    event.preventDefault();
    // A notch is a scalar velocity in log₂ space (see `demo-camera`): it feeds its doublings into
    // the glide instead of jumping the distance, so a fast scroll accumulates smoothly and a
    // single notch eases out. Reference `FreeCamera` maps wheel **up** to
    // `_scale_distance(1 / 1.08)`, and a DOM wheel-up is a negative `deltaY`, so the sign is
    // straight through: negative deltaY shrinks `log2(distance)` and the view moves closer.
    const doublings = event.deltaY * ZOOM_DOUBLINGS_PER_DELTA;
    const budget = glideVelocityFor(GLIDE_MAX_ZOOM_DOUBLINGS, GLIDE_HALFLIFE);
    const next = this.cameraVelocity.zoom + glideVelocityFor(doublings, GLIDE_HALFLIFE);
    this.cameraVelocity.zoom = Math.min(budget, Math.max(-budget, next));
  };
}

/**
 * Registers the glyph sources the gallery can draw text with.
 *
 * The whole set is always registered, so the comparison scene can put every encoding next to every
 * raster scale. Nothing is rasterised until a block actually names a source, and a source that is
 * never named never builds an atlas. `?text=<name>` narrows the set to one.
 */
async function createTextSources(params: URLSearchParams): Promise<TextSources> {
  const only = params.get("text");
  if (only !== null) return { [only]: await createTextSource(only) };

  await registerFont();
  const baked = new BakedMsdfRasterizer();
  await baked.load();
  // First, because blocks that name no source use it, and it is the best default: no runtime encoder,
  // no `opentype.js`, and corners the single-channel field would round off.
  return {
    baked,
    bitmap: new CanvasGlyphRasterizer({ encoding: "bitmap" }),
    bitmap4x: new CanvasGlyphRasterizer({ encoding: "bitmap", rasterScale: 4 }),
    sdf: new CanvasGlyphRasterizer({ encoding: "sdf" }),
    sdf4x: new CanvasGlyphRasterizer({ encoding: "sdf", rasterScale: 4 }),
    msdf: new OutlineGlyphRasterizer(),
  };
}

async function createTextSource(name: string): Promise<TextFontSource> {
  switch (name) {
    case "bitmap":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "bitmap" });
    case "bitmap4x":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "bitmap", rasterScale: 4 });
    case "sdf":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "sdf" });
    case "sdf4x":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "sdf", rasterScale: 4 });
    case "msdf":
      return new OutlineGlyphRasterizer();
    case "baked":
    default: {
      const font = new BakedMsdfRasterizer();
      await font.load();
      return font;
    }
  }
}

async function registerFont(): Promise<void> {
  try {
    await loadDefaultFont();
  } catch (error) {
    // Not fatal: Canvas2D falls back to another face and the scene still renders.
    console.warn("the bundled text font could not be registered", error);
  }
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

/** Advance of the bundled monospaced font, as a fraction of the font size. */
const TEXT_ADVANCE_RATIO = 0.6;

/** Every point a command touches, for measuring a scene's bounds. */
function commandPoints(command: FrameCommand): readonly Vec3[] {
  if (command.kind === "point") return [command.position];
  if (command.kind === "line") return [command.start, command.end];
  if (command.kind === "triangle") return [command.a, command.b, command.c];
  if (command.kind === "text") {
    // Screen text is not part of the world bounds at all. World text contributes the corners of
    // its block: the glyphs are only laid out at draw time, so the estimate here uses the
    // monospaced advance the bundled font is built on rather than asking a measurer.
    if (command.space === "screen") return [];
    const advances = command.spans.reduce((total, span) => total + span.text.length * span.fontSize, 0);
    const lines = 1 + command.spans.reduce((total, span) => total + (span.text.match(/\n/g)?.length ?? 0), 0);
    const width = advances * TEXT_ADVANCE_RATIO * command.pixelSize;
    const height = lines * command.lineHeight * command.pixelSize;
    const corners: Vec3[] = [];
    for (const x of [-width / 2, width / 2]) {
      for (const y of [-height / 2, height / 2]) {
        corners.push([command.position[0] + x, command.position[1] + y, command.position[2]]);
      }
    }
    return corners;
  }
  return [command.previous, command.center, command.next];
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
