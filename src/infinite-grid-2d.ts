/**
 * Shader-driven infinite 2D grid, ported from `infinite_grid_2d.gdshader`
 * (`hardalex/godot-infinite-grid`, the same addon `InfiniteGrid3D` comes from).
 *
 * The reference is a full-viewport `ColorRect` in a canvas layer: the fragment shader maps screen
 * pixels back to `Camera2D` world coordinates, so there is no geometry to run out of and no
 * projection involved. The LOD ladder is the reference's: one decimal level per zoom octave, three
 * layers (finer, current, coarser) blended with de-duplicated alpha, so overlapping levels cannot
 * stack brightness.
 *
 * Unlike the Godot shader, `world2d` has +y up while the framebuffer's y points down, so
 * `screen_to_world` mirrors the y offset. Everything else — cell size, pixel width, LOD range,
 * colors and the debug palette — mirrors the reference uniforms one to one.
 */

import { draw, geometry, type Draw, type FramePass, type Gpu } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { linearGridColor } from "./color-space.js";

const GRID_2D_SHADER = prepareShader(`
struct Grid2DUniforms {
  viewportSize: vec2f,
  cameraPosition: vec2f,
  cameraZoom: f32,
  cameraRotation: f32,
  gridOrigin: vec2f,
  cellSize: f32,
  minPixelsBetweenCells: f32,
  lineWidthPixels: f32,
  minLodPower: f32,
  maxLodPower: f32,
  debugLodColors: u32,
  thinLineColor: vec4f,
  thickLineColor: vec4f,
}
@group(0) @binding(0) var<uniform> grid: Grid2DUniforms;

struct In { @location(0) position: vec3f }
struct Out { @builtin(position) clip: vec4f }

@vertex fn vs_main(input: In) -> Out {
  var out: Out;
  // The geometry is already a clip-space quad; z 0 is the near plane the 2D layer pins to.
  out.clip = vec4f(input.position.xy, 0.0, 1.0);
  return out;
}

fn rotate_2d(value: vec2f, angle: f32) -> vec2f {
  let s = sin(angle);
  let c = cos(angle);
  return vec2f(c * value.x - s * value.y, s * value.x + c * value.y);
}

fn screen_to_world(screen: vec2f) -> vec2f {
  let safeZoom = max(abs(grid.cameraZoom), 0.00001);
  let centered = screen - grid.viewportSize * 0.5;
  // +y up in world2d while the framebuffer's y points down, so the offset is mirrored.
  let offset = vec2f(centered.x, -centered.y) / safeZoom;
  return grid.cameraPosition + rotate_2d(offset, grid.cameraRotation);
}

// Line coverage in pixel units so lines keep a stable screen-space width.
fn grid_line_alpha(uv: vec2f, currentCellSize: f32) -> f32 {
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

@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let worldPosition = screen_to_world(input.clip.xy);
  let uv = worldPosition - grid.gridOrigin;

  let safeCellSize = max(grid.cellSize, 0.00001);
  let minPower = min(grid.minLodPower, grid.maxLodPower - 2.0);
  let maxPower = max(grid.maxLodPower, minPower + 2.0);
  let worldPerPixel = 1.0 / max(abs(grid.cameraZoom), 0.00001);
  let lodLevel = log(max((worldPerPixel * grid.minPixelsBetweenCells) / safeCellSize, 0.000001)) / log(10.0) + 1.0;
  let currentLodPower = clamp(floor(lodLevel), minPower, maxPower);
  let lodFade = fract(clamp(lodLevel, minPower, maxPower));

  let lod0CellSize = safeCellSize * pow(10.0, clamp(currentLodPower, minPower, maxPower));
  let lod1CellSize = safeCellSize * pow(10.0, clamp(currentLodPower + 1.0, minPower, maxPower));
  let lod2CellSize = safeCellSize * pow(10.0, clamp(currentLodPower + 2.0, minPower, maxPower));

  let lod0Alpha = grid_line_alpha(uv, lod0CellSize) * (1.0 - lodFade);
  let lod1Alpha = grid_line_alpha(uv, lod1CellSize);
  let lod2Alpha = grid_line_alpha(uv, lod2CellSize);

  // De-duplicate: a coarser layer owns the pixels it covers, so the sum never exceeds 1.
  let lod2VisibleAlpha = lod2Alpha;
  let lod1VisibleAlpha = lod1Alpha * (1.0 - lod2VisibleAlpha);
  let lod0VisibleAlpha = lod0Alpha * (1.0 - lod1Alpha) * (1.0 - lod2VisibleAlpha);

  var lod0Color = grid.thinLineColor;
  var lod1Color = mix(grid.thickLineColor, grid.thinLineColor, lodFade);
  var lod2Color = grid.thickLineColor;
  if (grid.debugLodColors != 0u) {
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

  if (lineAlpha <= 0.001) { discard; }
  return vec4f(lineColor, lineAlpha);
}
`);

export type InfiniteGrid2DOptions = {
  /** World units per base cell. The LOD ladder multiplies this by powers of ten. */
  readonly cellSize?: number;
  /** Screen pixels the finest visible cell must span before the LOD steps up. */
  readonly minPixelsBetweenCells?: number;
  readonly lineWidthPixels?: number;
  /** How many decimal LOD levels exist below the current one. */
  readonly lodFinerLevels?: number;
  /** Total decimal LOD levels, including the current one. */
  readonly lodTotalLevels?: number;
  readonly thinLineColor?: readonly [number, number, number, number];
  readonly thickLineColor?: readonly [number, number, number, number];
  readonly debugLodColors?: boolean;
};

export type ResolvedGrid2DOptions = {
  readonly cellSize: number;
  readonly minPixelsBetweenCells: number;
  readonly lineWidthPixels: number;
  readonly lodFinerLevels: number;
  readonly lodTotalLevels: number;
  readonly thinLineColor: readonly [number, number, number, number];
  readonly thickLineColor: readonly [number, number, number, number];
  readonly debugLodColors: boolean;
};

/** Reference defaults from `infinite_grid_2d.gd`, which differs from the 3D shader on purpose. */
export const DEFAULT_GRID_2D_OPTIONS: ResolvedGrid2DOptions = {
  cellSize: 10,
  minPixelsBetweenCells: 2,
  lineWidthPixels: 1,
  lodFinerLevels: 3,
  lodTotalLevels: 8,
  thinLineColor: [0.3, 0.3, 0.3, 0.5],
  thickLineColor: [0.42, 0.42, 0.42, 0.7],
  debugLodColors: false,
};

/** The 2D camera state the shader reads, in `world2d` units and canvas pixels per unit. */
export type Grid2DCamera = {
  readonly position: readonly [number, number];
  /** Canvas pixels per world unit. */
  readonly zoom: number;
  /** Camera rotation in radians; the gallery keeps it at 0. */
  readonly rotation?: number;
};

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function positive(value: number, name: string): number {
  const resolved = finite(value, name);
  if (resolved <= 0) throw new RangeError(`${name} must be greater than zero`);
  return resolved;
}

function colorValue(value: readonly [number, number, number, number], name: string): readonly [number, number, number, number] {
  if (value.length !== 4) throw new RangeError(`${name} must contain four values`);
  return [finite(value[0], `${name}[0]`), finite(value[1], `${name}[1]`), finite(value[2], `${name}[2]`), finite(value[3], `${name}[3]`)];
}

/** Validates and freezes the options; the shader's own clamps then only guard the LOD range. */
export function resolveGrid2DOptions(options: InfiniteGrid2DOptions = {}): ResolvedGrid2DOptions {
  const finer = Math.trunc(finite(options.lodFinerLevels ?? DEFAULT_GRID_2D_OPTIONS.lodFinerLevels, "lodFinerLevels"));
  if (finer < 0 || finer > 12) throw new RangeError("lodFinerLevels must be between 0 and 12");
  const total = Math.trunc(finite(options.lodTotalLevels ?? DEFAULT_GRID_2D_OPTIONS.lodTotalLevels, "lodTotalLevels"));
  if (total < 3 || total > 24) throw new RangeError("lodTotalLevels must be between 3 and 24");
  return {
    cellSize: positive(options.cellSize ?? DEFAULT_GRID_2D_OPTIONS.cellSize, "cellSize"),
    minPixelsBetweenCells: positive(options.minPixelsBetweenCells ?? DEFAULT_GRID_2D_OPTIONS.minPixelsBetweenCells, "minPixelsBetweenCells"),
    lineWidthPixels: positive(options.lineWidthPixels ?? DEFAULT_GRID_2D_OPTIONS.lineWidthPixels, "lineWidthPixels"),
    lodFinerLevels: finer,
    lodTotalLevels: total,
    thinLineColor: colorValue(options.thinLineColor ?? DEFAULT_GRID_2D_OPTIONS.thinLineColor, "thinLineColor"),
    thickLineColor: colorValue(options.thickLineColor ?? DEFAULT_GRID_2D_OPTIONS.thickLineColor, "thickLineColor"),
    debugLodColors: options.debugLodColors ?? DEFAULT_GRID_2D_OPTIONS.debugLodColors,
  };
}

/**
 * The decimal power range the shader may pick from: `lodFinerLevels` below the current level and
 * `lodTotalLevels` in total, matching `_apply_lod_range_parameters`.
 */
export function grid2dLodPowers(options: Pick<ResolvedGrid2DOptions, "lodFinerLevels" | "lodTotalLevels">): { min: number; max: number } {
  // `0 - n` rather than `-n` so a zero finer count yields +0, not -0.
  const min = 0 - options.lodFinerLevels;
  return { min, max: min + Math.max(options.lodTotalLevels, 3) - 1 };
}

/** Clip-space quad covering the whole viewport; the fragment stage does the rest. */
function buildFullScreenQuad(gpu: Gpu) {
  return geometry(gpu, {
    buffers: [{
      attributes: { position: "float32x3" },
      data: new Float32Array([
        -1, -1, 0, 1, -1, 0, -1, 1, 0,
        -1, 1, 0, 1, -1, 0, 1, 1, 0,
      ]),
    }],
    vertexCount: 6,
  });
}

function buildDraw(gpu: Gpu, quad: ReturnType<typeof buildFullScreenQuad>): Draw {
  return draw(gpu, {
    shader: GRID_2D_SHADER,
    geometry: quad,
    blend: "alpha",
    cull: "none",
    // Same overlay contract as the 2D primitives: near plane, no depth write.
    depth: { write: false, compare: "less-equal" },
  });
}

export class InfiniteGrid2D {
  readonly #gpu: Gpu;
  readonly #geometry: ReturnType<typeof buildFullScreenQuad>;
  readonly #draw: Draw;
  #options: ResolvedGrid2DOptions;
  #opacity = 1;

  constructor(gpu: Gpu, options: InfiniteGrid2DOptions = {}) {
    this.#gpu = gpu;
    this.#options = resolveGrid2DOptions(options);
    this.#geometry = buildFullScreenQuad(gpu);
    this.#draw = buildDraw(gpu, this.#geometry);
  }

  /** Reference-style property updates: every field is a per-frame uniform. */
  setOptions(options: InfiniteGrid2DOptions): void {
    this.#options = resolveGrid2DOptions({ ...this.#options, ...options });
  }

  /** Demo extension: scales both line alphas without discarding their reference ratio. */
  setOpacity(opacity: number): void {
    this.#opacity = Math.min(Math.max(opacity, 0), 1);
  }

  /**
   * Draws the grid for one frame. `viewportSize` is the target size in canvas pixels, the same
   * space the 2D projection uses, so the grid and the 2D primitives stay aligned.
   */
  draw(pass: FramePass, camera: Grid2DCamera, viewportSize: readonly [number, number]): void {
    const options = this.#options;
    const powers = grid2dLodPowers(options);
    this.#draw.set({
      grid: {
        viewportSize: [viewportSize[0], viewportSize[1]],
        cameraPosition: [camera.position[0], camera.position[1]],
        cameraZoom: Math.max(camera.zoom, 1e-5),
        cameraRotation: camera.rotation ?? 0,
        gridOrigin: [0, 0],
        cellSize: options.cellSize,
        minPixelsBetweenCells: options.minPixelsBetweenCells,
        lineWidthPixels: options.lineWidthPixels,
        minLodPower: powers.min,
        maxLodPower: powers.max,
        debugLodColors: options.debugLodColors ? 1 : 0,
        thinLineColor: linearGridColor(options.thinLineColor, options.thinLineColor[3] * this.#opacity),
        thickLineColor: linearGridColor(options.thickLineColor, options.thickLineColor[3] * this.#opacity),
      },
    });
    pass.draw(this.#draw);
  }

  destroy(): void {
    this.#draw.dispose();
    this.#geometry.destroy();
  }
}
