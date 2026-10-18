/**
 * Framework-agnostic gallery engine.
 *
 * Owns the WebGPU surface, the render loop, camera interaction, and config
 * persistence. React only renders chrome and calls the setters below; no React
 * state participates in the animation loop.
 */

import { effect, frame, init, sampler, surface, target } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { BakedMsdfRasterizer, CanvasGlyphRasterizer, DebugDraw3D, GpuDebugDraw3D, FrameRecorder, InfiniteGrid2D, InfiniteGrid3D, loadDefaultFont, loadFontFaces, OutlineGlyphRasterizer, world2dProjection, type Camera2D, type FrameCommand, type InfiniteGrid2DOptions, type InfiniteGridOptions, type TextFontSource, type TextSources, type Vec3 } from "./index.js";
import { SCENE_EXAMPLES, type SceneExample } from "./scene-examples.js";
import { buildScene } from "./scenes-3d.js";
import { linearClearColor } from "./color-space.js";
import { scaleScreenCommands } from "./screen-scale.js";
import { MULTI_WEIGHT_SANS_FAMILY } from "./font-families.js";
import { VGPU_SANS_FACES } from "./assets/vgpu-sans-faces.js";
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
  applyDisplayConfig,
  cloneDemoConfig,
  DEFAULT_DEMO_CONFIG,
  displayConfigFor,
  displayConfigFrom,
  FRONT_DEMO_CONFIG,
  loadDemoConfig,
  loadDisplayConfigs,
  OBLIQUE_DEMO_CONFIG,
  parseDemoConfig,
  REFERENCE_DEMO_CONFIG,
  saveDemoConfig,
  saveDisplayConfig,
  SCREENSHOT_DEMO_CONFIG,
  type CameraPreset,
  type DemoConfig,
  type DemoDisplayConfig,
  type DemoGridConfig,
  type LineJoint,
  type ProjectionMode,
} from "./demo-config.js";

export type EngineStatus = "requesting" | "ready" | "error";

export type DemoSnapshot = {
  readonly selected: SceneExample;
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
  /** Display fields the URL pins; see {@link displayOverridesFrom}. */
  readonly displayOverrides?: DisplayOverrides;
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
/**
 * Held with the movement keys, shift sprints the right-drag FPS camera. It is tracked in the same
 * set as the movement keys, so releasing the drag (which clears the set) also drops a sprint that
 * was still held down.
 */
const FPS_SPRINT_KEY = "shift";
/** How much faster the FPS camera moves while shift is held. */
const FPS_SPRINT_SCALE = 3;
const ORIGIN: Vec3 = [0, 0, 0];

/** Movement speed for the FPS camera, given the keys held right now. */
export function fpsMoveSpeed(keys: ReadonlySet<string>): number {
  return keys.has(FPS_SPRINT_KEY) ? FPS_SPEED * FPS_SPRINT_SCALE : FPS_SPEED;
}

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
 * `world2d` zoom bounds, in canvas pixels per world unit. The lower end still fits bevy's
 * thousand-unit shape matrices into a few hundred pixels; the upper end stops a runaway wheel.
 */
const CAMERA_2D_ZOOM_MIN = 0.05;
const CAMERA_2D_ZOOM_MAX = 40;
/** How much of the fitted `view2d` extent a 2D page leaves as margin. */
const CAMERA_2D_FIT_MARGIN = 0.94;

/**
 * Stand-in view matrix for a 2D page. `world-plane` and `world-billboard` text read it, and a 2D
 * page draws neither: its labels are placed by the 2D projection alone.
 */
const IDENTITY_VIEW = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

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

/** Poses the sidebar can switch to. */
const CAMERA_PRESETS: Record<CameraPreset, DemoConfig> = {
  default: DEFAULT_DEMO_CONFIG,
  oblique: OBLIQUE_DEMO_CONFIG,
  front: FRONT_DEMO_CONFIG,
};

/**
 * Poses `?camera=` accepts. `reference` is URL-only: it exists so a paired capture can stand on the
 * reference scene's own pose, which is not something the interactive gallery needs a button for.
 */
const URL_CAMERA_PRESETS: Record<string, DemoConfig> = {
  ...CAMERA_PRESETS,
  reference: REFERENCE_DEMO_CONFIG,
};

/**
 * The pose `?camera=` names, when it names one the gallery knows.
 *
 * A named pose also pins the camera: it turns example framing off (`DemoEngine`'s `autoFrame`), because
 * framing re-fits the distance and pivot around the selected scene and would otherwise undo the pose
 * the URL asked for.
 */
export function cameraPoseFor(value: string | null): DemoConfig | undefined {
  return value !== null && value in URL_CAMERA_PRESETS ? URL_CAMERA_PRESETS[value] : undefined;
}

/** Resolves the initial config from URL params, cloning shared presets. */
/**
 * Display fields the URL pins, which must outlive an example switch: a capture like `?grid=0` has to
 * stay deterministic whichever example was visited before it.
 */
export type DisplayOverrides = {
  readonly showGrid?: boolean;
  readonly projection?: ProjectionMode;
};

/** Reads the display overrides the gallery accepts in the URL. */
export function displayOverridesFrom(params: URLSearchParams): DisplayOverrides {
  const overrides: { showGrid?: boolean; projection?: ProjectionMode } = {};
  if (params.get("grid") === "0") overrides.showGrid = false;
  if (params.get("projection") === "orthographic") overrides.projection = "orthographic";
  return overrides;
}

function applyDisplayOverrides(config: DemoConfig, overrides: DisplayOverrides): void {
  if (overrides.showGrid !== undefined) config.view.showGrid = overrides.showGrid;
  if (overrides.projection !== undefined) config.camera.projection = overrides.projection;
}

/**
 * Gallery storage, or `undefined` when the host blocks it (private mode, blocked
 * cookies). Reads and writes both go through here so a blocked store cannot throw
 * out of the render loop.
 */
function galleryStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/** Resolves the initial config from URL params, cloning shared presets. */
export function resolveInitialConfig(compareMode: boolean, params: URLSearchParams, storage?: Storage): DemoConfig {
  const base = compareMode ? cloneDemoConfig(SCREENSHOT_DEMO_CONFIG) : loadDemoConfig(storage ?? null);
  applyDisplayOverrides(base, displayOverridesFrom(params));
  // The capture preset owns the camera in compare mode so paired screenshots stay deterministic; every
  // `?camera=` pose is an interactive-gallery override only.
  const pose = cameraPoseFor(params.get("camera"));
  if (!compareMode && pose !== undefined) base.camera = cloneDemoConfig(pose).camera;
  return base;
}

export class DemoEngine {
  private readonly compareMode: boolean;

  private canvas: HTMLCanvasElement | undefined;
  private config: DemoConfig;
  private selected: SceneExample;
  private readonly displayOverrides: DisplayOverrides;
  /** Per-example display groups, mirrored into storage by `persist`. */
  private readonly displayConfigs: Record<string, DemoDisplayConfig>;
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
  /** Set when a 2D page asked for its fit before the canvas had a layout size. */
  private pending2DFit = false;
  private destroyed = false;

  constructor(options: DemoEngineOptions) {
    this.compareMode = options.compareMode;
    this.config = options.config;
    this.autoFrame = options.autoFrame ?? true;
    this.displayOverrides = options.displayOverrides ?? {};
    // Compare mode is deterministic by design: it neither reads nor writes records.
    this.displayConfigs = this.compareMode ? {} : loadDisplayConfigs(galleryStorage());
    this.selected = SCENE_EXAMPLES[0]!;
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
    const match = SCENE_EXAMPLES.find((example) => example.id === id);
    if (match) {
      this.selectExample(match, false);
      return;
    }
    // Without a scene in the URL the first example is already selected, so only its
    // display group is still pending.
    this.restoreDisplayConfig(this.selected);
  }

  selectExample(example: SceneExample, updateHash = true): void {
    this.selected = example;
    this.time = 0;
    // The page owns the camera mode: a 2D page pans and zooms, every other page orbits.
    this.config.camera.mode = example.family === "2d" ? "2d" : "3d";
    this.pending2DFit = false;
    // The display group is remembered per example, so switching back restores what this
    // scene was set up with. `hideGrid` is only the starting point for an example that
    // has no record yet.
    this.restoreDisplayConfig(example);
    if (updateHash) location.hash = example.id;
    if (this.autoFrame) {
      this.frameSelectedExample();
      this.persist();
    }
    this.emit();
  }

  /**
   * Applies the selected example's display group: its own record when there is one,
   * otherwise the gallery defaults with the scene's `hideGrid` preference. URL-pinned
   * fields are layered on top, since a capture must not depend on visit history.
   */
  private restoreDisplayConfig(example: SceneExample): void {
    // Compare mode is the screenshot path: it keeps the preset's display fields so paired
    // captures stay deterministic, whichever example the page happens to open.
    if (this.compareMode) return;
    applyDisplayConfig(this.config, this.displayConfigs[example.id] ?? displayConfigFor(example));
    applyDisplayOverrides(this.config, this.displayOverrides);
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
   * Switches the orbit pose between the gallery default and the two 45° views: `oblique` off the
   * +X/+Z diagonal, `front` square on to the origin from the +Z axis. Free orbiting afterwards leaves
   * the preset in place as a starting point rather than tracking the change.
   */
  setCameraPreset(preset: CameraPreset): void {
    // The presets describe the 3D orbit chart; a 2D page has no yaw or pitch to set.
    if (this.config.camera.mode === "2d") return;
    this.stopGlide();
    this.update(() => {
      this.config.camera = cloneDemoConfig(CAMERA_PRESETS[preset]).camera;
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
      // The page still owns the camera mode after a reset.
      this.config.camera.mode = this.selected.family === "2d" ? "2d" : "3d";
      this.time = 0;
    });
    if (this.config.camera.mode === "2d") this.frameSelectedExample();
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
    // A screen-driven raster ladder holds several rungs per character, and a CJK frame draws hundreds
    // of characters at once; the default single 1024 px page is sized for latin debug text.
    const renderer = new GpuDebugDraw3D(gpu, { points: 16384, lines: 65536, triangles: 65536, joints: 65536, text: { sources: textSources, atlasSize: 1024, pages: 4 } });
    const debug = new DebugDraw3D({ defaultLineStyle: { width: 2 } });
    const grid = new InfiniteGrid3D(gpu, this.gridOptions());
    // The 2D grid is a full-screen quad in the same overlay layer as the 2D primitives.
    const grid2d = new InfiniteGrid2D(gpu, this.grid2dOptions());

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
      // The backing store is `width × pixelRatio` wide, so that ratio is what turns the CSS-pixel
      // authoring space of the screen pages into the target pixels the shaders work in.
      const pixelRatio = output.size[0] / width;
      if (this.pending2DFit) this.frameSelectedExample(pixelRatio);
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
      // The 2D pages place `screen` content in top-left CSS pixels, so they need the size of the
      // viewport they are authored against; 3D pages ignore it.
      buildScene(this.selected.id, recorder, this.time, this.config.view.lineJoint, [width, height]);
      const raw = debug.finishFrame(recorder);
      // The width scale must cover joints as well: they are the same stroke as the segments
      // they join, so scaling only `line` commands would leave the wedges at full size.
      const scale = this.config.view.lineWidthScale;
      const scaled: readonly FrameCommand[] = raw.map((command) =>
        command.kind === "line" || command.kind === "joint" || command.kind === "line2d" || command.kind === "joint2d"
          ? { ...command, width: command.width * scale }
          : command,
      );
      // Screen pages are authored in CSS pixels (an 18 px label is 18 CSS px on any display); the
      // shaders want target pixels, so one multiplication bridges them.
      const commands = scaleScreenCommands(scaled, pixelRatio);

      // The 2D camera is independent from the 3D one: the projection comes from pan/zoom and the
      // viewport, while the 3D matrices above only feed the grid and any world-space text. On a 2D
      // page the world-plane text must share the primitives' projection instead: its labels are
      // placed in `world2d` units, so the 2D matrix is what makes them pan and zoom with the
      // strokes they annotate. The 3D grid, the other consumer of these matrices, is off there.
      const camera2d: Camera2D = { pan: [c.pan[0], c.pan[1]], zoom: c.zoom };
      renderer.prepare(
        commands,
        {
          viewProjection: c.mode === "2d" ? world2dProjection(camera2d, output.size) : this.viewProjection,
          view: c.mode === "2d" ? IDENTITY_VIEW : this.view,
        },
        camera2d,
      );
      const showGrid3D = c.mode !== "2d" && this.config.view.showGrid;
      // The 2D grid is part of what a 2D page shows rather than an optional overlay: the pages
      // exist to demonstrate it, and there is no 3D grid on them to confuse it with. The opacity
      // slider remains the way to tone it down.
      const showGrid2D = c.mode === "2d";
      if (showGrid3D) {
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
      }
      if (showGrid2D) {
        grid2d.setOptions(this.grid2dOptions());
        grid2d.setOpacity(this.config.view.gridOpacity);
      }

      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        // The clear color is an sRGB-authored value, so it decodes like every other color.
        f.pass({ target: scene, clear: linearClearColor(this.config.view.background), clearDepth: 1 }, (pass) => {
          if (showGrid3D) grid.draw(pass);
          // The 2D grid is background for the 2D primitives, so it draws before them.
          if (showGrid2D) grid2d.draw(pass, { position: [c.pan[0], c.pan[1]], zoom: c.zoom }, pass.target.size);
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
    const storage = galleryStorage();
    if (storage === undefined) return;
    try {
      saveDemoConfig(this.config, storage);
      this.rememberDisplayConfig(storage);
    } catch {
      /* Storage can be unavailable. */
    }
  }

  /**
   * Records the current example's display group, so switching back restores it. A
   * field the URL pinned is a capture override rather than a user choice, so the
   * record keeps the value it already had instead of the pinned one.
   */
  private rememberDisplayConfig(storage: Storage): void {
    const display = displayConfigFrom(this.config);
    const base = this.displayConfigs[this.selected.id] ?? displayConfigFor(this.selected);
    if (this.displayOverrides.showGrid !== undefined) display.showGrid = base.showGrid;
    if (this.displayOverrides.projection !== undefined) display.projection = base.projection;
    this.displayConfigs[this.selected.id] = display;
    saveDisplayConfig(this.selected.id, display, storage);
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

  /** The 2D grid reads the same panel, minus the fields only the 3D addon has. */
  private grid2dOptions(): InfiniteGrid2DOptions {
    const grid = this.config.grid;
    return {
      cellSize: grid.cellSize,
      minPixelsBetweenCells: grid.minPixelsBetweenCells,
      lineWidthPixels: grid.lineWidthPixels,
      lodFinerLevels: grid.lodFinerLevels,
      lodTotalLevels: grid.lodTotalLevels,
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
    if (this.config.camera.mode === "2d") {
      this.integrateCamera2D(delta);
      return;
    }
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
   * Advances the 2D pan/zoom glide. The pan is a world-space velocity and the zoom is a scalar one
   * in log₂ space, exactly like the 3D distance; only the sign differs, because `zoom` multiplies
   * where `distance` divides.
   */
  private integrateCamera2D(delta: number): void {
    const c = this.config.camera;
    const velocity = this.cameraVelocity;
    const frame = Math.min(Math.max(delta, 0), 0.1);
    if (frame === 0) return;

    if (this.pointer !== undefined) {
      velocity.pan = integrateGlideVec3([0, 0, 0], velocity.pan, GLIDE_HALFLIFE, frame).velocity;
      velocity.zoom = integrateGlide(0, velocity.zoom, GLIDE_HALFLIFE, frame).velocity;
      return;
    }

    if (velocity.pan[0] !== 0 || velocity.pan[1] !== 0) {
      const pan = integrateGlideVec3([c.pan[0], c.pan[1], 0], velocity.pan, GLIDE_HALFLIFE, frame);
      c.pan = [pan.value[0], pan.value[1]];
      velocity.pan = [pan.velocity[0], pan.velocity[1], 0];
    }

    if (velocity.zoom !== 0) {
      const step = integrateGlide(0, velocity.zoom, GLIDE_HALFLIFE, frame);
      const next = clampFinite(c.zoom * 2 ** -step.value, CAMERA_2D_ZOOM_MIN, CAMERA_2D_ZOOM_MAX, c.zoom);
      velocity.zoom = next === c.zoom ? 0 : step.velocity;
      c.zoom = next;
    }

    const moving = velocity.zoom !== 0 || velocity.pan[0] !== 0 || velocity.pan[1] !== 0;
    const settled = Math.abs(velocity.zoom) < GLIDE_EPSILON
      && Math.abs(velocity.pan[0]) < GLIDE_EPSILON
      && Math.abs(velocity.pan[1]) < GLIDE_EPSILON;
    if (moving && settled) {
      this.stopGlide();
      this.persist();
      return;
    }
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
    if (this.config.camera.mode === "2d") {
      // A 2D fling is capped by a screen distance, converted into world units at the current zoom,
      // so the same flick travels the same distance on screen whatever the magnification.
      const budget = (GLIDE_MAX_PAN_SCREENS * this.canvasHeight) / Math.max(this.config.camera.zoom, 1e-4);
      const travel = glideVelocityFor(budget, GLIDE_HALFLIFE);
      const speed = Math.hypot(drag.pan[0], drag.pan[1]);
      const scale = speed > travel && speed > 0 ? travel / speed : 1;
      this.cameraVelocity.yaw = 0;
      this.cameraVelocity.pitch = 0;
      this.cameraVelocity.pan = [drag.pan[0] * scale, drag.pan[1] * scale, 0];
      return;
    }
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
  private frameSelectedExample(pixelRatio = window.devicePixelRatio || 1): void {
    const c = this.config.camera;
    if (c.mode === "2d") {
      const canvas = this.canvas;
      if (canvas === undefined || canvas.clientWidth <= 1) {
        // Switching to a 2D page before the canvas is laid out (first load) has no size to fit
        // to; the first frame retries once the layout reports one.
        this.pending2DFit = true;
        this.stopGlide();
        return;
      }
      const view = this.selected.view2d;
      if (view !== undefined) {
        // Fit the page's declared extent: a bevy shape matrix spans a thousand-odd units, so a
        // 1:1 scale at default zoom would show only one shape. The fit is in physical pixels,
        // the same space the 2D projection and the grid use, so a HiDPI canvas does not halve it.
        // The ratio comes from the backing store rather than `window.devicePixelRatio`, so the fit
        // and the screen-space scaling below agree even if the two ever diverge.
        const width = canvas.clientWidth * pixelRatio;
        const height = Math.max(canvas.clientHeight, 1) * pixelRatio;
        const zoom = Math.min(width / view.width, height / view.height) * CAMERA_2D_FIT_MARGIN;
        c.zoom = clampFinite(zoom, CAMERA_2D_ZOOM_MIN, CAMERA_2D_ZOOM_MAX, c.zoom);
      }
      c.pan = [0, 0];
      this.pending2DFit = false;
      this.stopGlide();
      return;
    }
    const bounds = this.selectedBounds();
    if (bounds === undefined) return;
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
    const step = (fpsMoveSpeed(this.keys) * delta) / length;
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
    const match = SCENE_EXAMPLES.find((example) => example.id === location.hash.slice(1));
    if (match) this.selectExample(match, false);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.compareMode) return;
    const key = event.key.toLowerCase();
    if (key === FPS_SPRINT_KEY) {
      this.keys.add(key);
      return;
    }
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
    const mode: PointerMode = this.config.camera.mode === "2d" || event.button === 1
      ? "pan"
      : event.button === 0 ? "rotate" : "fps";
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
    } else if (this.config.camera.mode === "2d") {
      // Drag to pan: the content follows the pointer, so the view centre moves the other way, and
      // `world2d` has +y up while the pointer's `dy` grows downwards.
      const zoom = Math.max(c.zoom, 1e-4);
      const step: Vec3 = [-dx / zoom, dy / zoom, 0];
      c.pan = [c.pan[0] + step[0], c.pan[1] + step[1]];
      this.trackDrag(event, 0, 0, step);
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
  // First, because blocks that name no source use it: the renderer rasterises each glyph at the size
  // it covers on screen, which is the shape bevy's `FontAtlas` has — one atlas per size, rasterised
  // at the physical pixel size it will be shown at. The ladder in `text-raster` is what keeps that
  // from costing one atlas per font size, which a continuously resized block could not afford.
  return {
    auto: new CanvasGlyphRasterizer({ encoding: "bitmap" }),
    baked,
    // The comparison sources keep the fixed raster they were built with: they exist to put one
    // encoding next to another at a known raster size, which the screen-driven ladder would remove.
    bitmap: new CanvasGlyphRasterizer({ encoding: "bitmap", dynamicRaster: false }),
    bitmap4x: new CanvasGlyphRasterizer({ encoding: "bitmap", rasterScale: 4, dynamicRaster: false }),
    sdf: new CanvasGlyphRasterizer({ encoding: "sdf", dynamicRaster: false }),
    sdf4x: new CanvasGlyphRasterizer({ encoding: "sdf", rasterScale: 4, dynamicRaster: false }),
    msdf: new OutlineGlyphRasterizer({ dynamicRaster: false }),
    // The same encoder at twice the raster, with the range scaled to keep the 1/6 ratio the 24 px
    // baked page uses — the lever against a magnified block showing its own raster.
    msdf2x: new OutlineGlyphRasterizer({ rasterScale: 2, distanceRange: 8, dynamicRaster: false }),
  };
}

async function createTextSource(name: string): Promise<TextFontSource> {
  switch (name) {
    case "auto":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "bitmap" });
    case "bitmap":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "bitmap", dynamicRaster: false });
    case "bitmap4x":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "bitmap", rasterScale: 4, dynamicRaster: false });
    case "sdf":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "sdf", dynamicRaster: false });
    case "sdf4x":
      await registerFont();
      return new CanvasGlyphRasterizer({ encoding: "sdf", rasterScale: 4, dynamicRaster: false });
    case "msdf":
      return new OutlineGlyphRasterizer({ dynamicRaster: false });
    case "msdf2x":
      return new OutlineGlyphRasterizer({ rasterScale: 2, distanceRange: 8, dynamicRaster: false });
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
  try {
    // The font-query page needs real weights, and Canvas2D only gets those from separate faces.
    await loadFontFaces(MULTI_WEIGHT_SANS_FAMILY, VGPU_SANS_FACES);
  } catch (error) {
    console.warn("the multi-weight sans family could not be registered", error);
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
  if (command.kind === "joint") return [command.previous, command.center, command.next];
  // 2D primitives live in their own spaces and never contribute to a 3D scene's bounds.
  return [];
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
