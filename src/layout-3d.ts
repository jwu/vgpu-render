/**
 * Layout and drawing specifications ported from `~/src/godot-debug-draw@hardpixel/examples`.
 *
 * Every reference scene shares the same layout contract, which is why it lives here rather
 * than being re-derived per scene:
 *
 * ```
 * column_x(column) = column * COLUMN_SPACING + 0.5      // COLUMN_SPACING is 2.0, axes 2.2
 * row_z(row)       = SAMPLE_START_Z - row * spacing     // START_Z is -0.45, rows go along -Z
 * ```
 *
 * Each scene has its own `SAMPLE_SPACING`, and some columns override it (radius, size,
 * angle, height). Coordinates are local to the scene root; the reference capture harness
 * translates the whole root by `REFERENCE_OFFSET` without rescaling any geometry, so the
 * same translation is applied here.
 */

import type { Color, Vec3 } from "./frame-recorder.js";

/** `scene.position = Vector3(-10, 0, 1.5)` from `scripts/capture-godot.gd`. */
export const REFERENCE_OFFSET: Vec3 = [-10, 0, 1.5];

export function referenceOffset(p: Vec3): Vec3 {
  return [p[0] + REFERENCE_OFFSET[0], p[1] + REFERENCE_OFFSET[1], p[2] + REFERENCE_OFFSET[2]];
}

/** Shared value tables used by the reference scenes. */
export const WIDTH_VALUES = [1, 2, 5.5, 10] as const;
export const ALPHA_VALUES = [1, 0.65, 0.35, 0.1] as const;
export const DASH_VALUES: readonly (readonly [number, number])[] = [[0.1, 0.1], [0.2, 0.1], [0.4, 0.15], [0.04, 0.12]];
export const JOINT_VALUES = ["none", "round", "bevel", "miter"] as const;
export const RADIUS_VALUES = [0.18, 0.28, 0.38, 0.5] as const;
export const SEGMENT_VALUES = [8, 16, 32, 64] as const;
export const ROTATION_SAMPLE_COUNT = 8;
export const NORMAL_SAMPLE_COUNT = 4;

export const WHITE: Color = [1, 1, 1, 1];
export const CYAN: Color = [0.15, 0.85, 1, 0.95];
export const LIME: Color = [0.7, 1, 0.25, 1];
export const ORANGE: Color = [1, 0.45, 0.2, 1];
export const ORANGE_SOFT: Color = [1, 0.45, 0.2, 0.95];
export const VIOLET: Color = [0.75, 0.45, 1, 1];
export const TEAL: Color = [0.25, 0.95, 0.9, 1];
export const PINK: Color = [1, 0.3, 0.6, 1];
export const GOLD: Color = [1, 0.75, 0.25, 1];

/** Reference `_get_normal_sample_color` / `_get_normal_sample_width`, shared by most scenes. */
export function normalSampleColor(row: number): Color {
  if (row === 1) return [0.25, 0.95, 0.9, 0.35];
  if (row === 2) return [1, 0.45, 0.2, 1];
  return [0.25, 0.95, 0.9, 1];
}

export function normalSampleWidth(row: number, baseWidth: number): number {
  return row === 3 ? 10 : baseWidth;
}

/**
 * Godot `Color.from_hsv(h, s, v, a)`. The reference solid samples use this, so a fixed
 * palette color cannot reproduce them. `h` is in `[0, 1]`, matching Godot.
 */
export function fromHsv(h: number, s: number, v: number, a: number): Color {
  const hue = ((h % 1) + 1) % 1;
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return [v, t, p, a];
    case 1: return [q, v, p, a];
    case 2: return [p, v, t, a];
    case 3: return [p, q, v, a];
    case 4: return [t, p, v, a];
    default: return [v, p, q, a];
  }
}

export function normalizeVector(p: Vec3): Vec3 {
  const length = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / length, p[1] / length, p[2] / length];
}

export function crossVector(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Godot `Vector3.rotated(axis, angle)` equivalent (right-handed Rodrigues). */
export function rotateAroundAxis(p: Vec3, axis: Vec3, angle: number): Vec3 {
  const a = normalizeVector(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
  const cross = crossVector(a, p);
  return [
    p[0] * cos + cross[0] * sin + a[0] * dot * (1 - cos),
    p[1] * cos + cross[1] * sin + a[1] * dot * (1 - cos),
    p[2] * cos + cross[2] * sin + a[2] * dot * (1 - cos),
  ];
}

export type CircleBasis = { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };

/** Port of `_get_circle_rotation(normal, angle)` from `circle.gd`. */
export function circleBasis(normal: Vec3, angle: number): CircleBasis {
  const n = normalizeVector(normal);
  const reference: Vec3 = Math.abs(n[0]) > 0.95 ? [0, 0, 1] : [1, 0, 0];
  const projection = reference[0] * n[0] + reference[1] * n[1] + reference[2] * n[2];
  const planar: Vec3 = [reference[0] - n[0] * projection, reference[1] - n[1] * projection, reference[2] - n[2] * projection];
  const widthAxis = normalizeVector(rotateAroundAxis(normalizeVector(planar), n, angle));
  const heightAxis = normalizeVector(crossVector(n, widthAxis));
  return { x: widthAxis, y: heightAxis, z: n };
}

/** Points on a circle in the plane spanned by a Godot rotation basis. */
export function basisCirclePoints(centerLocal: Vec3, radius: number, segments: number, basis: CircleBasis): Vec3[] {
  const center = referenceOffset(centerLocal);
  const points: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;
    points.push([
      center[0] + basis.x[0] * cos + basis.y[0] * sin,
      center[1] + basis.x[1] * cos + basis.y[1] * sin,
      center[2] + basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return points;
}

/**
 * Column/row placement shared by every reference scene.
 *
 * The reference files re-implement the same three lines per scene, differing only in the
 * spacing constants. Modelling that here keeps each scene a small table of numbers instead
 * of another copy of the coordinate math:
 *
 * - `columnX(column) = column * columnSpacing + columnOffset`
 * - `rowZ(row) = sampleStartZ - row * rowSpacing` (rows advance along **-Z**)
 * - a per-column override covers the scenes whose radius/size/angle/height columns use a
 *   wider spacing than the rest (for example `circle` radius 1.15 vs 0.82).
 */
export type SceneLayout = {
  /** Distance between adjacent columns; `2.0` for every scene except `axes` (2.2). */
  readonly columnSpacing: number;
  /** Added to `column * columnSpacing`; `0.5` for every ported scene. */
  readonly columnOffset: number;
  readonly sampleSpacing: number;
  readonly sampleStartZ: number;
  /** Row spacing for specific columns, overriding `sampleSpacing`. */
  readonly perColumnSpacing?: Readonly<Record<number, number>>;
  /** Column-specific Y offset, used by scenes that lift a tunnel or grow by radius. */
  readonly columnY?: (column: number, row: number, baseY: number) => number;
};

export function createLayout(layout: SceneLayout, baseY: number) {
  const columnX = (column: number): number => column * layout.columnSpacing + layout.columnOffset;
  const rowSpacing = (column: number): number => layout.perColumnSpacing?.[column] ?? layout.sampleSpacing;
  const rowZ = (column: number, row: number): number => layout.sampleStartZ - row * rowSpacing(column);
  const at = (column: number, row: number): Vec3 => {
    const y = layout.columnY === undefined ? baseY : layout.columnY(column, row, baseY);
    return referenceOffset([columnX(column), y, rowZ(column, row)]);
  };
  /** Local (untranslated) centre, for functions that must offset before the scene shift. */
  const atLocal = (column: number, row: number): Vec3 => {
    const y = layout.columnY === undefined ? baseY : layout.columnY(column, row, baseY);
    return [columnX(column), y, rowZ(column, row)];
  };
  return { columnX, rowZ, rowSpacing, at, atLocal };
}

export type ScenePositions = ReturnType<typeof createLayout>;

/** Reference `circle.gd` layout: radius column uses 1.15 row spacing, the rest 0.82. */
export const CIRCLE_REFERENCE_LAYOUT: SceneLayout = {
  columnSpacing: 2,
  columnOffset: 0.5,
  sampleSpacing: 0.82,
  sampleStartZ: -0.45,
  perColumnSpacing: { 1: 1.15 },
};

/**
 * Per-scene layouts, copied from the constants at the top of each `examples/*.gd`.
 *
 * Every reference scene differs only in these numbers, so they are data here rather than
 * duplicated coordinate math. `columnSpacing` is 2.0 everywhere except `axes` (2.2).
 */
export const SCENE_LAYOUTS = {
  /** `index.gd`: absolute origin, its own row spacing, samples lifted to y = 0.55. */
  index: { columnSpacing: 2, columnOffset: 1, sampleSpacing: 1.25, sampleStartZ: -1, baseY: 0.55 },
  arrow: { columnSpacing: 2, columnOffset: 0.5, sampleSpacing: 0.78, sampleStartZ: -0.45, baseY: 0.1 },
  axes: {
    columnSpacing: 2.2,
    columnOffset: 0.5,
    sampleSpacing: 0.86,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 0: 1.05, 3: 1.05 },
  },
  grid: { columnSpacing: 2, columnOffset: 0.5, sampleSpacing: 0.72, sampleStartZ: -0.45, baseY: 0.06 },
  rect: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.62,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 1: 0.9 },
  },
  box: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.82,
    sampleStartZ: -0.45,
    baseY: 0.08,
    perColumnSpacing: { 1: 1.05 },
  },
  arc: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.92,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 1: 1.15, 2: 1.08 },
  },
  // `curve.gd`: rows start at EXAMPLE_START_Z = -2.0; the transform and closed
  // columns widen their row spacing to 0.85x and 1.05x of SAMPLE_SPACING.
  curve: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.82,
    sampleStartZ: -2,
    baseY: 0.1,
    perColumnSpacing: { 2: 0.82 * 0.85, 4: 0.82 * 1.05 },
  },
  sphere: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.86,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 1: 1.08 },
  },
  cone: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.84,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 1: 1.05, 2: 1.08 },
  },
  cylinder: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.84,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 1: 1.05, 2: 1.08 },
  },
  capsule: {
    columnSpacing: 2,
    columnOffset: 0.5,
    sampleSpacing: 0.86,
    sampleStartZ: -0.45,
    baseY: 0.1,
    perColumnSpacing: { 1: 1.02, 2: 1.02 },
  },
  world_space_width: { columnSpacing: 2, columnOffset: 1, sampleSpacing: 1.25, sampleStartZ: -1, baseY: 0.55 },
} as const satisfies Record<string, SceneLayout & { baseY: number }>;

export type SceneLayoutId = keyof typeof SCENE_LAYOUTS;
