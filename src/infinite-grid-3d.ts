/**
 * Shader-driven infinite ground grid, ported from the Godot reference addon
 * `~/src/godot-infinite-grid@hardpixel/addons/infinite_grid`.
 *
 * The port keeps the reference algorithm and parameters:
 * - a finite XZ quad is drawn once and faded near its bounds, so it reads as endless;
 * - lines are computed in the fragment shader from world XZ coordinates;
 * - three decimal LOD layers (finer / current / coarser) are combined, and their
 *   alphas are de-duplicated so overlapping layers do not stack brightness;
 * - the LOD distance follows the reference camera-state rules from
 *   `infinite_grid_3d.gd::_update_camera_lod_distance`.
 *
 * Everything else (`grid_size`, `cell_size`, `line_width_pixels`, LOD ranges,
 * center/grazing/edge/far fades, stipple discard and line colors) mirrors the
 * reference uniforms one to one. `setOpacity` is the only demo-side extension:
 * it scales the two reference line alphas instead of replacing them.
 */

import { draw, geometry, type Draw, type FramePass, type Gpu } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";

const GRID_SHADER = prepareShader(`
struct GridUniforms {
  viewProjection: mat4x4f,
  cameraPosition: vec3f,
  cellSize: f32,
  viewGridCenter: vec2f,
  gridCenter: vec2f,
  lineWidthPixels: f32,
  gridSize: f32,
  edgeFadeStartRatio: f32,
  edgeFadeEndRatio: f32,
  minLodPower: f32,
  maxLodPower: f32,
  cameraLodDistance: f32,
  cameraFarClip: f32,
  grazingFadeStartFactor: f32,
  grazingFadeEndFactor: f32,
  lodCenterFadeLineCount: f32,
  optionsA: vec4<u32>,
  optionsB: vec4<u32>,
  thinLineColor: vec4f,
  thickLineColor: vec4f,
}
@group(0) @binding(0) var<uniform> grid: GridUniforms;

// optionsA: x = camera_is_orthogonal, y = debug_lod_colors, z = enable_grazing_opacity,
//           w = enable_stipple_discard.
// optionsB: x = enable_lod_center_fade.

struct In { @location(0) position: vec3f }
struct Out {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
}

@vertex fn vs_main(input: In) -> Out {
  var out: Out;
  let world = input.position + vec3f(grid.gridCenter.x, 0.0, grid.gridCenter.y);
  out.world = world;
  out.clip = grid.viewProjection * vec4f(world, 1.0);
  return out;
}

// Line coverage in pixel units so lines keep a stable screen-space width.
fn gridLineAlpha(uv: vec2f, currentCellSize: f32) -> f32 {
  let coord = uv / currentCellSize;
  let pixelSize = max(abs(dpdx(coord)) + abs(dpdy(coord)), vec2f(0.00001));
  let distanceToLine = min(fract(coord), 1.0 - fract(coord));
  let distancePixels = distanceToLine / pixelSize;
  // 1 px AA transition avoids hard edges and flicker on thin lines.
  let halfLineWidthPixels = max(grid.lineWidthPixels, 0.25) * 0.5;
  let coverage = 1.0 - smoothstep(
    vec2f(max(halfLineWidthPixels - 0.5, 0.0)),
    vec2f(halfLineWidthPixels + 0.5),
    distancePixels
  );
  return max(coverage.x, coverage.y);
}

fn lodCenterFade(uv: vec2f, currentCellSize: f32) -> f32 {
  if (grid.optionsB.x == 0u) {
    return 1.0;
  }
  let halfLineCount = max(grid.lodCenterFadeLineCount * 0.5, 1.0);
  let snappedCenter = round(grid.viewGridCenter / currentCellSize) * currentCellSize;
  let levelCoord = (uv - snappedCenter) / max(currentCellSize * halfLineCount, 0.00001);
  if (grid.optionsA.x != 0u) {
    let edge = 1.0 - min(1.0, dot(levelCoord, levelCoord));
    return edge * edge;
  }
  return 1.0 - min(1.0, length(levelCoord));
}

@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let uv = input.world.xz;

  let safeCellSize = max(grid.cellSize, 0.00001);
  let minPower = min(grid.minLodPower, grid.maxLodPower - 2.0);
  let maxPower = max(grid.maxLodPower, minPower + 2.0);
  let minLodCellSize = safeCellSize * pow(10.0, minPower);
  let lodDistance = max(grid.cameraLodDistance, minLodCellSize);
  let currentLodPower = clamp(
    floor(log(lodDistance / safeCellSize) / log(10.0)),
    minPower,
    maxPower
  );

  // Select the current decimal LOD and fade toward the next coarser cell size.
  let currentLodCellSize = safeCellSize * pow(10.0, currentLodPower);
  let nextLodCellSize = currentLodCellSize * 10.0;
  let lodFade = clamp(
    (lodDistance - currentLodCellSize) / max(nextLodCellSize - currentLodCellSize, 0.00001),
    0.0,
    1.0
  );

  // Three neighboring LOD layers: fine lines fade out while major lines remain.
  let lod0Power = clamp(currentLodPower - 1.0, minPower, maxPower);
  let lod1Power = clamp(currentLodPower, minPower, maxPower);
  let lod2Power = clamp(currentLodPower + 1.0, minPower, maxPower);
  let lod0CellSize = safeCellSize * pow(10.0, lod0Power);
  let lod1CellSize = safeCellSize * pow(10.0, lod1Power);
  let lod2CellSize = safeCellSize * pow(10.0, lod2Power);

  let lod0Alpha = gridLineAlpha(uv, lod0CellSize) * lodCenterFade(uv, lod0CellSize) * (1.0 - lodFade);
  let lod1Alpha = gridLineAlpha(uv, lod1CellSize) * lodCenterFade(uv, lod1CellSize);
  let lod2Alpha = gridLineAlpha(uv, lod2CellSize) * lodCenterFade(uv, lod2CellSize);

  // Prevent overlapping LOD layers from stacking alpha and causing brightness jumps.
  let lod2VisibleAlpha = lod2Alpha;
  let lod1VisibleAlpha = lod1Alpha * (1.0 - lod2VisibleAlpha);
  let lod0VisibleAlpha = lod0Alpha * (1.0 - lod1Alpha) * (1.0 - lod2VisibleAlpha);

  // Blend minor/current/major line colors across the active LOD transition.
  var lod0Color = grid.thinLineColor;
  var lod1Color = mix(grid.thickLineColor, grid.thinLineColor, lodFade);
  var lod2Color = grid.thickLineColor;
  if (grid.optionsA.y != 0u) {
    // Debug layers: blue = lower/finer, green = current, red = upper/coarser.
    // Only RGB is replaced so alpha stays directly comparable with debug off.
    lod0Color = vec4f(0.1, 0.35, 1.0, lod0Color.a);
    lod1Color = vec4f(0.1, 1.0, 0.25, lod1Color.a);
    lod2Color = vec4f(1.0, 0.15, 0.1, lod2Color.a);
  }

  let lod0LayerAlpha = lod0VisibleAlpha * lod0Color.a;
  let lod1LayerAlpha = lod1VisibleAlpha * lod1Color.a;
  let lod2LayerAlpha = lod2VisibleAlpha * lod2Color.a;
  let lineAlpha = clamp(lod0LayerAlpha + lod1LayerAlpha + lod2LayerAlpha, 0.0, 1.0);
  let lineColor = (
    lod0Color.rgb * lod0LayerAlpha +
    lod1Color.rgb * lod1LayerAlpha +
    lod2Color.rgb * lod2LayerAlpha
  ) / max(lineAlpha, 0.00001);

  // Fade out near the finite mesh bounds so the grid appears endless.
  let halfGridSize = max(grid.gridSize * 0.5, 0.00001);
  let normalizedGridCoord = (uv - grid.gridCenter) / halfGridSize;
  let edgeStart = clamp(grid.edgeFadeStartRatio, 0.0, 1.0);
  let edgeEnd = max(clamp(grid.edgeFadeEndRatio, 0.0, 1.0), edgeStart + 0.00001);
  let edgeProgress = clamp(
    (length(normalizedGridCoord) - edgeStart) / (edgeEnd - edgeStart),
    0.0,
    1.0
  );
  var edgeOpacity = 1.0 - edgeProgress;
  if (grid.optionsA.x != 0u) {
    edgeOpacity = pow(1.0 - edgeProgress * edgeProgress, 2.0);
  }

  // Fade at grazing view angles to reduce distant transparent trails.
  var grazingOpacity = 1.0;
  if (grid.optionsA.z != 0u) {
    let viewDir = normalize(grid.cameraPosition - input.world);
    let viewFloorFactor = abs(dot(viewDir, vec3f(0.0, 1.0, 0.0)));
    let grazingStart = min(grid.grazingFadeStartFactor, grid.grazingFadeEndFactor);
    let grazingEnd = max(grid.grazingFadeStartFactor, grid.grazingFadeEndFactor);
    var grazingProgress = step(grazingStart, viewFloorFactor);
    if (grazingEnd - grazingStart > 0.00001) {
      grazingProgress = clamp(
        (viewFloorFactor - grazingStart) / (grazingEnd - grazingStart),
        0.0,
        1.0
      );
    }
    grazingOpacity = smoothstep(0.0, 1.0, grazingProgress);
  }

  // Fade near the camera far clip before the grid is clipped by depth.
  let farClip = max(grid.cameraFarClip, 0.00001);
  let cameraDistance = length(grid.cameraPosition - input.world);
  let distanceOpacity = 1.0 - smoothstep(0.0, 0.5 * farClip, cameraDistance - 0.5 * farClip);

  let alpha = lineAlpha * edgeOpacity * distanceOpacity * grazingOpacity;

  // Stipple discard below 0.1 alpha avoids muddy trails from transparent depth blending.
  if (grid.optionsA.w != 0u) {
    let dashCoord = uv / lod1CellSize;
    let dashDistanceToLine = min(fract(dashCoord), 1.0 - fract(dashCoord));
    let dashAxis = select(input.clip.x, input.clip.y, dashDistanceToLine.x < dashDistanceToLine.y);
    if (alpha < 0.1 && alpha / 0.1 < fract(dashAxis / 4.0)) {
      discard;
    }
  }

  if (alpha <= 0.001) {
    discard;
  }

  return vec4f(lineColor, alpha);
}
`);

/** Projection taken from the reference `Camera3D.PROJECTION_*` modes. */
export type GridProjection = "perspective" | "orthographic";

/** Reference `Color` values; alpha participates in the layer compositing. */
export type GridColor = readonly [number, number, number, number];

export type InfiniteGridOptions = {
  /** Reference `grid_size`: side length of the finite quad. Default 2000. */
  size?: number;
  /** Reference `edge_fade_start_ratio`. Default 0. */
  edgeFadeStartRatio?: number;
  /** Reference `edge_fade_end_ratio`. Default 1. */
  edgeFadeEndRatio?: number;
  /** Reference `cell_size`: base world-space cell size. Default 1. */
  cellSize?: number;
  /** Reference `line_width_pixels`. Default 1. */
  lineWidthPixels?: number;
  /** Reference `lod_finer_levels`: decimal levels below `cellSize`. Default 3. */
  lodFinerLevels?: number;
  /** Reference `lod_total_levels`, minimum 3. Default 8. */
  lodTotalLevels?: number;
  /** Reference `enable_grazing_opacity`. Default true. */
  enableGrazingOpacity?: boolean;
  /** Reference `grazing_fade_start`, in degrees above the grid plane. Default 3. */
  grazingFadeStart?: number;
  /** Reference `grazing_fade_end`, in degrees above the grid plane. Default 20. */
  grazingFadeEnd?: number;
  /** Reference `enable_stipple_discard`. Default false. */
  enableStippleDiscard?: boolean;
  /** Reference `enable_lod_center_fade`. Default true. */
  enableLodCenterFade?: boolean;
  /** Reference `lod_center_fade_line_count`. Default 151. */
  lodCenterFadeLineCount?: number;
  /** Reference `thin_line_color`. Default [0.42, 0.42, 0.42, 0.45]. */
  thinLineColor?: GridColor;
  /** Reference `thick_line_color`. Default [0.62, 0.62, 0.62, 0.65]. */
  thickLineColor?: GridColor;
  /** Reference `debug_lod_colors`. Default false. */
  debugLodColors?: boolean;
};

/**
 * Per-frame camera state. `cameraForward` and `farClip` drive the reference LOD
 * distance rules, so they are required rather than derived from the matrix.
 */
export type GridCameraState = {
  readonly viewProjection: ArrayLike<number>;
  readonly cameraPosition: readonly [number, number, number];
  /** Normalized view direction (camera to focus). */
  readonly cameraForward: readonly [number, number, number];
  readonly projection: GridProjection;
  /** Reference `Camera3D.size`; only read in orthographic projection. */
  readonly orthographicSize?: number;
  readonly farClip: number;
};

const REFERENCE_THIN_LINE_COLOR: GridColor = [0.42, 0.42, 0.42, 0.45];
const REFERENCE_THICK_LINE_COLOR: GridColor = [0.62, 0.62, 0.62, 0.65];
const MIN_LOD_CELL_SIZE = 0.0001;

type ResolvedGridOptions = {
  size: number;
  edgeFadeStartRatio: number;
  edgeFadeEndRatio: number;
  cellSize: number;
  lineWidthPixels: number;
  lodFinerLevels: number;
  lodTotalLevels: number;
  enableGrazingOpacity: boolean;
  grazingFadeStart: number;
  grazingFadeEnd: number;
  enableStippleDiscard: boolean;
  enableLodCenterFade: boolean;
  lodCenterFadeLineCount: number;
  thinLineColor: GridColor;
  thickLineColor: GridColor;
  debugLodColors: boolean;
};

/** Mirrors the reference property setters, including their clamps. */
export function resolveGridOptions(options: InfiniteGridOptions): ResolvedGridOptions {
  return {
    size: Math.max(options.size ?? 2000, 1),
    edgeFadeStartRatio: clamp(options.edgeFadeStartRatio ?? 0, 0, 1),
    edgeFadeEndRatio: clamp(options.edgeFadeEndRatio ?? 1, 0, 1),
    cellSize: Math.max(options.cellSize ?? 1, 0.0001),
    lineWidthPixels: Math.max(options.lineWidthPixels ?? 1, 0.25),
    lodFinerLevels: Math.max(Math.trunc(options.lodFinerLevels ?? 3), 0),
    lodTotalLevels: Math.max(Math.trunc(options.lodTotalLevels ?? 8), 3),
    enableGrazingOpacity: options.enableGrazingOpacity ?? true,
    grazingFadeStart: clamp(options.grazingFadeStart ?? 3, 0, 90),
    grazingFadeEnd: clamp(options.grazingFadeEnd ?? 20, 0, 90),
    enableStippleDiscard: options.enableStippleDiscard ?? false,
    enableLodCenterFade: options.enableLodCenterFade ?? true,
    lodCenterFadeLineCount: options.lodCenterFadeLineCount ?? 151,
    thinLineColor: options.thinLineColor ?? REFERENCE_THIN_LINE_COLOR,
    thickLineColor: options.thickLineColor ?? REFERENCE_THICK_LINE_COLOR,
    debugLodColors: options.debugLodColors ?? false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Reference `_get_min_lod_cell_size()`. */
export function minLodCellSize(options: ResolvedGridOptions): number {
  return Math.max(options.cellSize * 10 ** -options.lodFinerLevels, MIN_LOD_CELL_SIZE);
}

/** Reference `_apply_lod_range_parameters()`. */
export function lodPowers(options: ResolvedGridOptions): { min: number; max: number } {
  const min = -options.lodFinerLevels;
  return { min, max: min + options.lodTotalLevels - 1 };
}

/** Reference `_apply_grazing_fade_parameters()`. */
export function grazingFactors(options: ResolvedGridOptions): { start: number; end: number } {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  return { start: Math.sin(toRadians(options.grazingFadeStart)), end: Math.sin(toRadians(options.grazingFadeEnd)) };
}

export type LodState = {
  lodDistance: number;
  viewGridCenter: readonly [number, number];
  cameraIsOrthogonal: boolean;
};

/**
 * Reference `_update_camera_lod_distance()` with the grid plane at y = 0: the
 * distance to the view floor drives the LOD, falling back to camera height near
 * grazing angles so the LOD distance cannot blow up.
 */
export function gridLodState(camera: GridCameraState, options: InfiniteGridOptions = {}): LodState {
  const resolved = resolveGridOptions(options);
  const minimum = minLodCellSize(resolved);
  const [forwardX, forwardY, forwardZ] = camera.cameraForward;
  const [cameraX, cameraY, cameraZ] = camera.cameraPosition;
  const gridY = 0;

  if (camera.projection === "orthographic") {
    const size = Math.max(camera.orthographicSize ?? 0, minimum);
    let center: readonly [number, number] = [cameraX, cameraZ];
    if (Math.abs(forwardY) > 0.0001) {
      const rayDistance = (gridY - cameraY) / forwardY;
      center = [cameraX + forwardX * rayDistance, cameraZ + forwardZ * rayDistance];
    }
    return { lodDistance: size, viewGridCenter: center, cameraIsOrthogonal: true };
  }

  const height = Math.abs(cameraY - gridY);
  const viewFloorFactor = Math.abs(forwardY);
  const rayFloorDistance = height / Math.max(viewFloorFactor, 0.0001);
  // Match Blender: blend view-to-ground distance toward camera height near grazing angles.
  const lodDistance = Math.max(
    rayFloorDistance + (height - rayFloorDistance) * (1 - viewFloorFactor),
    minimum,
  );
  return {
    lodDistance,
    viewGridCenter: [cameraX + forwardX * lodDistance, cameraZ + forwardZ * lodDistance],
    cameraIsOrthogonal: false,
  };
}

/** The quad is centered on the camera XZ, matching `follow_viewport_camera`. */
export class InfiniteGrid3D {
  #gpu: Gpu;
  #draw: Draw;
  #geometry: ReturnType<typeof geometry>;
  #options: ResolvedGridOptions;
  #opacity = 1;
  #camera: GridCameraState = {
    viewProjection: new Float32Array(16),
    cameraPosition: [0, 5, 8],
    cameraForward: [0, -1, 0],
    projection: "perspective",
    farClip: 100,
  };

  constructor(gpu: Gpu, options: InfiniteGridOptions = {}) {
    this.#gpu = gpu;
    this.#options = resolveGridOptions(options);
    this.#geometry = buildGeometry(gpu, this.#options.size);
    this.#draw = buildDraw(gpu, this.#geometry);
  }

  prepare(camera: GridCameraState): void {
    this.#camera = camera;
  }

  /**
   * Applies reference-style property updates. Only `size` rebuilds the quad;
   * every other field is a per-frame uniform, exactly like the addon setters.
   */
  setOptions(options: InfiniteGridOptions): void {
    const previousSize = this.#options.size;
    this.#options = resolveGridOptions({ ...this.#currentOptions(), ...options });
    if (this.#options.size !== previousSize) this.#rebuild();
  }

  /** Reference `set_grid_size()`: rebuilds the finite quad. */
  setSize(size: number): void {
    this.#options.size = Math.max(size, 1);
    this.#rebuild();
  }

  /**
   * Demo extension over the reference addon: scales `thin_line_color.a` and
   * `thick_line_color.a` without discarding their reference ratio.
   */
  setOpacity(opacity: number): void {
    this.#opacity = clamp(opacity, 0, 1);
  }

  draw(pass: FramePass): void {
    const options = this.#options;
    const lod = gridLodState(this.#camera, options);
    const powers = lodPowers(options);
    const grazing = grazingFactors(options);
    const [thinR, thinG, thinB, thinA] = options.thinLineColor;
    const [thickR, thickG, thickB, thickA] = options.thickLineColor;

    this.#draw.set({
      grid: {
        viewProjection: this.#camera.viewProjection,
        cameraPosition: this.#camera.cameraPosition,
        cellSize: options.cellSize,
        viewGridCenter: lod.viewGridCenter,
        gridCenter: [this.#camera.cameraPosition[0], this.#camera.cameraPosition[2]],
        lineWidthPixels: options.lineWidthPixels,
        gridSize: options.size,
        edgeFadeStartRatio: options.edgeFadeStartRatio,
        edgeFadeEndRatio: options.edgeFadeEndRatio,
        minLodPower: powers.min,
        maxLodPower: powers.max,
        cameraLodDistance: lod.lodDistance,
        cameraFarClip: this.#camera.farClip,
        grazingFadeStartFactor: grazing.start,
        grazingFadeEndFactor: grazing.end,
        lodCenterFadeLineCount: options.lodCenterFadeLineCount,
        optionsA: [
          lod.cameraIsOrthogonal ? 1 : 0,
          options.debugLodColors ? 1 : 0,
          options.enableGrazingOpacity ? 1 : 0,
          options.enableStippleDiscard ? 1 : 0,
        ],
        optionsB: [options.enableLodCenterFade ? 1 : 0, 0, 0, 0],
        thinLineColor: [thinR, thinG, thinB, thinA * this.#opacity],
        thickLineColor: [thickR, thickG, thickB, thickA * this.#opacity],
      },
    });
    pass.draw(this.#draw);
  }

  destroy(): void {
    this.#draw.dispose();
    this.#geometry.destroy();
  }

  #rebuild(): void {
    this.#draw.dispose();
    this.#geometry.destroy();
    this.#geometry = buildGeometry(this.#gpu, this.#options.size);
    this.#draw = buildDraw(this.#gpu, this.#geometry);
  }

  #currentOptions(): InfiniteGridOptions {
    return { ...this.#options, thinLineColor: this.#options.thinLineColor, thickLineColor: this.#options.thickLineColor };
  }
}

function buildGeometry(gpu: Gpu, size: number) {
  const half = size * 0.5;
  return geometry(gpu, {
    buffers: [{
      attributes: { position: "float32x3" },
      data: new Float32Array([
        -half, 0, -half, half, 0, -half, half, 0, half,
        -half, 0, -half, half, 0, half, -half, 0, half,
      ]),
    }],
    vertexCount: 6,
  });
}

/**
 * Reference shader uses `render_mode unshaded, blend_mix, depth_draw_always,
 * cull_disabled`: unlit, straight-alpha blending, two-sided, and depth writes on.
 */
function buildDraw(gpu: Gpu, quad: ReturnType<typeof geometry>): Draw {
  return draw(gpu, {
    shader: GRID_SHADER,
    geometry: quad,
    blend: "alpha",
    cull: "none",
    depth: { write: true, compare: "less-equal" },
  });
}
