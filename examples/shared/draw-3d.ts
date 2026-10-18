/**
 * Shared drawing helpers and reference layout data for the 3D example pages.
 */

export * from "./base-3d.js";
import { AXIS_BLUE, AXIS_GREEN, AXIS_RED, IDENTITY_BASIS, curve, offsetAlong, rotateBasis, scaleVec, transformMeshByBasis, type Basis3 } from "./base-3d.js";

import { CAPSULE_BASE_Y, CAPSULE_LAYOUT, CAPSULE_ROTATION_TUNNEL_DEPTH_STEP, CAPSULE_ROTATION_TUNNEL_Y, CONE_BASE_Y, CONE_JOINT_SEGMENT_COUNT, CONE_JOINT_SIDE_SEGMENT_COUNT, CONE_LAYOUT, CONE_ROTATION_TUNNEL_DEPTH_STEP, CONE_ROTATION_TUNNEL_Y, CONE_SEGMENT_COUNT, CONE_SIDE_SEGMENT_COUNT, CONE_S_TUNNEL_DEPTH_STEP, CONE_S_TUNNEL_Y, CYLINDER_BASE_Y, CYLINDER_JOINT_SEGMENT_COUNT, CYLINDER_JOINT_SIDE_SEGMENT_COUNT, CYLINDER_LAYOUT, CYLINDER_ROTATION_TUNNEL_DEPTH_STEP, CYLINDER_ROTATION_TUNNEL_Y, CYLINDER_SEGMENT_COUNT, CYLINDER_SIDE_SEGMENT_COUNT, CYLINDER_S_TUNNEL_DEPTH_STEP, CYLINDER_S_TUNNEL_Y, SHAPE_SEGMENT_VALUES, SPHERE_BASE_Y, SPHERE_LAYOUT, SPHERE_ROTATION_TUNNEL_DEPTH_STEP, SPHERE_ROTATION_TUNNEL_Y, SPHERE_S_TUNNEL_DEPTH_STEP, SPHERE_S_TUNNEL_Y, capsuleCenter, capsuleColumnHalfHeight, capsuleColumnRadius, capsuleTunnelBasis, capsuleTunnelCenter, coneCenter, coneColumnHeight, coneColumnRadius, coneTunnelBasis, coneTunnelCenter, cylinderCenter, cylinderColumnHalfHeight, cylinderColumnRadius, cylinderTunnelBasis, cylinderTunnelCenter, sphereCenter, sphereColumnRadius, sphereTunnelBasis, sphereTunnelCenter } from "./shapes-3d.js";
import type { Color, FrameDrawList, LineOptions, Vec3 } from "../../src/frame-draw-list.js";
import { box, type MeshData } from "../../src/geometry-generators.js";
import { RADIUS_VALUES, REFERENCE_OFFSET, SCENE_LAYOUTS, SEGMENT_VALUES, WIDTH_VALUES, circleBasis, createLayout, crossVector, normalizeVector, referenceOffset, rotateAroundAxis, type CircleBasis } from "./layout-3d.js";
import { rotatePoint, sampleCurve, type Curve3D } from "../../src/curve.js";
import { INDEX_LABEL_PLACEMENT, LABEL_PLACEMENT, SCENE_LABELS, type SceneLabelSpec, type SceneLabels } from "./labels-3d.js";



// ---------------------------------------------------------------------------
// Faithful Circle/Line reference port.
//
// These two scenes mirror `examples/circle.gd` and `examples/line.gd` exactly:
// real column/row coordinates, colors, widths, dash offsets and the rotation
// tunnel basis. The capture harness translates the Godot scene root by
// (-10, 0, 1.5) without rescaling geometry, so the same world offset is applied
// here.
// ---------------------------------------------------------------------------

export const LINE_Y = 0.1;

export const LINE_SAMPLE_LENGTH = 1.1;

export const LINE_COLUMN_SPACING = 2;

export const LINE_ROW_SPACING = 0.78;

export const LINE_SAMPLE_START_Z = -0.45;

export const CIRCLE_Y = 0.1;

export const CIRCLE_RADIUS = 0.32;

export const CIRCLE_COLUMN_SPACING = 2;

export const CIRCLE_ROW_SPACING = 0.82;

export const CIRCLE_RADIUS_ROW_SPACING = 1.15;

export const CIRCLE_SAMPLE_START_Z = -0.45;

export const CIRCLE_TUNNEL_RADIUS = 0.42;

export const CIRCLE_TUNNEL_DEPTH_STEP = 0.16;

export function lineColumnX(column: number): number {
  return column * LINE_COLUMN_SPACING;
}

export function lineRowZ(row: number): number {
  return LINE_SAMPLE_START_Z - row * LINE_ROW_SPACING;
}

export function circleColumnX(column: number): number {
  return column * CIRCLE_COLUMN_SPACING + 0.5;
}

export function circleRowSpacing(column: number): number {
  return column === 1 ? CIRCLE_RADIUS_ROW_SPACING : CIRCLE_ROW_SPACING;
}



// ---------------------------------------------------------------------------
// Faithful Arrow reference port (`examples/arrow.gd`).
//
// `draw_arrow` emits only a head (two perpendicular V strips); `draw_arrow_line`
// adds a shaft. Both are reproduced here instead of using `FrameDrawList.arrow`,
// which always emits a shaft and a single flat V head with different proportions.
// ---------------------------------------------------------------------------

export const ARROW_LAYOUT = createLayout(SCENE_LAYOUTS.arrow, SCENE_LAYOUTS.arrow.baseY);

export const ARROW_Y = SCENE_LAYOUTS.arrow.baseY;

export const ARROW_LENGTH = 1.1;

export const ARROW_HEAD_LENGTH = 0.22;

export const ARROW_JOINT_HEAD_LENGTH = 0.34;

export const ARROW_BASE_HEAD_ANGLE = Math.PI / 6;

export const ARROW_JOINT_HEAD_ANGLE = Math.PI / 4;

export const ARROW_TUNNEL_Y = 0.32;

export const ARROW_TUNNEL_DEPTH_STEP = 0.16;

export const ARROW_TUNNEL_SCALE_STEP = 0.05;

export const ARROW_DIR_ANGLE_VALUES: readonly number[] = [-Math.PI * 0.35, -Math.PI * 0.12, Math.PI * 0.12, Math.PI * 0.35];

export const ARROW_HEAD_LENGTH_VALUES: readonly number[] = [0.12, 0.22, 0.34, 0.46];

export const ARROW_HEAD_ANGLE_VALUES: readonly number[] = [Math.PI / 9, Math.PI / 6, Math.PI / 4, Math.PI * 0.42];

export type ArrowHeadOptions = {
  readonly color: Color;
  readonly width: number;
  readonly widthMode?: NonNullable<LineOptions["widthMode"]>;
  readonly headAngle: number;
  readonly joint?: NonNullable<LineOptions["joint"]>;
  readonly normal?: Vec3;
};



/** Reference `_get_perpendicular_unit(direction)`. */
export function perpendicularUnit(direction: Vec3): Vec3 {
  const reference: Vec3 = Math.abs(direction[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  return normalizeVector(crossVector(direction, reference));
}



/** Reference `_get_projected_perpendicular_unit(direction, vector)`. */
export function projectedPerpendicularUnit(direction: Vec3, vector: Vec3): Vec3 {
  const dot = direction[0] * vector[0] + direction[1] * vector[1] + direction[2] * vector[2];
  const perpendicular: Vec3 = [vector[0] - direction[0] * dot, vector[1] - direction[1] * dot, vector[2] - direction[2] * dot];
  const lengthSquared = perpendicular[0] ** 2 + perpendicular[1] ** 2 + perpendicular[2] ** 2;
  return lengthSquared <= 0 ? perpendicularUnit(direction) : normalizeVector(perpendicular);
}



/**
 * Reference `_emit_arrow`: an X made of two perpendicular V strips with the tip at
 * `tip` and the head axis along `dir` (`|dir|` is the head length). Normal-aware
 * draws collapse the per-vertex surface normals into the single `normal` option.
 */
export function drawArrowHead(drawList: FrameDrawList, tip: Vec3, dir: Vec3, options: ArrowHeadOptions): void {
  const headLength = Math.hypot(dir[0], dir[1], dir[2]);
  if (headLength <= 0) return;
  const forward = scaleVec(dir, 1 / headLength);
  const normalAware = options.normal !== undefined;
  // `_emit_arrow_with_normal` only uses the caller's normal to pick the head's tangent plane;
  // the segments themselves are shaded from the cone surface (see `surfaceNormal` below).
  const tangent = normalAware ? projectedPerpendicularUnit(forward, options.normal!) : perpendicularUnit(forward);
  const bitangent = normalizeVector(crossVector(forward, tangent));
  const headAngle = Math.min(Math.max(options.headAngle, 0.001), Math.PI * 0.49);
  const headRadius = Math.tan(headAngle) * headLength;
  const headCenter = offsetAlong(tip, forward, -headLength);
  const wingOptions: LineOptions = {
    color: options.color,
    width: options.width,
    ...(options.widthMode === undefined ? {} : { widthMode: options.widthMode }),
    ...(options.joint === undefined ? {} : { joint: options.joint }),
  };
  /** `_get_arrow_surface_normal`: `normalize(radial * headLength + direction * headRadius)`. */
  const surfaceNormal = (radial: Vec3): Vec3 => normalizeVector(offsetAlong(scaleVec(radial, headLength), forward, headRadius));
  const wing = (radial: Vec3): void => {
    const points: Vec3[] = [offsetAlong(headCenter, radial, headRadius), tip, offsetAlong(headCenter, radial, -headRadius)];
    // `_emit_normal_line_strip` carries one normal per segment, each the surface normal of the
    // wing that segment starts from.
    drawList.lineStrip(
      points,
      normalAware ? { ...wingOptions, normals: [surfaceNormal(radial), surfaceNormal(scaleVec(radial, -1))] } : wingOptions,
      false,
    );
  };
  wing(tangent);
  wing(bitangent);
}



/** `_get_arrow_tip`: head-only column tips sit half a sample (a full one for `dir`) ahead. */
export function arrowTip(column: number, row: number): Vec3 {
  const offset = column === 1 ? ARROW_LENGTH : ARROW_LENGTH * 0.5;
  return referenceOffset([ARROW_LAYOUT.columnX(column) + offset, ARROW_Y, ARROW_LAYOUT.rowZ(column, row)]);
}



/** `_get_arrow_dir`: `RIGHT.rotated(BACK, angle) * ARROW_HEAD_LENGTH`. */
export function arrowDirection(row: number): Vec3 {
  return scaleVec(rotateAroundAxis([1, 0, 0], [0, 0, 1], ARROW_DIR_ANGLE_VALUES[row]), ARROW_HEAD_LENGTH);
}



/** `_get_line_start`: the rotation column lifts and recesses each row. */
export function arrowLineStart(column: number, row: number): Vec3 {
  const local = ARROW_LAYOUT.atLocal(column, row);
  if (column === 9) {
    return referenceOffset([local[0], local[1] + ARROW_TUNNEL_Y, local[2] - row * ARROW_TUNNEL_DEPTH_STEP]);
  }
  return referenceOffset(local);
}



/** `_get_rotation_vector`: shrunk, then yawed around UP and pitched around BACK. */
export function arrowLineVector(row: number): Vec3 {
  const vector = scaleVec([1, 0, 0], ARROW_LENGTH * (1 - row * ARROW_TUNNEL_SCALE_STEP));
  const yawed = rotateAroundAxis(vector, [0, 1, 0], row * Math.PI * 0.08);
  return rotateAroundAxis(yawed, [0, 0, 1], -Math.PI * 0.18 + row * Math.PI * 0.08);
}

export function arrowLineEnd(column: number, row: number): Vec3 {
  const start = arrowLineStart(column, row);
  const vector: Vec3 = column === 9 ? arrowLineVector(row) : [ARROW_LENGTH, 0, 0];
  return [start[0] + vector[0], start[1] + vector[1], start[2] + vector[2]];
}

export type ArrowLineOptions = ArrowHeadOptions & { readonly headLength: number; readonly dash?: readonly [number, number, number] };



/** Reference `draw_arrow_line*`: a plain shaft plus the head at `end`. */
export function drawArrowLine(drawList: FrameDrawList, start: Vec3, end: Vec3, options: ArrowLineOptions): void {
  // Both `draw_arrow_line` and `draw_arrow_line_n` emit the shaft with `_emit_line`, which carries
  // no normal: the caller's normal only orients the head's tangent plane.
  drawList.line(start, end, {
    color: options.color,
    width: options.width,
    ...(options.widthMode === undefined ? {} : { widthMode: options.widthMode }),
    ...(options.dash === undefined ? {} : { dash: options.dash }),
  });
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (length <= 0) return;
  const scale = options.headLength / length;
  drawArrowHead(drawList, end, [dx * scale, dy * scale, dz * scale], options);
}



// --- Rect -----------------------------------------------------------------

export const RECT_LAYOUT = createLayout(SCENE_LAYOUTS.rect, SCENE_LAYOUTS.rect.baseY);

export const RECT_WIDTH = 0.95;

export const RECT_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const RECT_S_TUNNEL_WIDTH = 1.1;

export const RECT_S_TUNNEL_DEPTH_STEP = 0.15;



/** `_get_rect_points`: four corners in the plane spanned by `basis.x`/`basis.y`. */
export function rectLoop(center: Vec3, basis: Basis3, width: number, height: number): Vec3[] {
  const halfWidth = scaleVec(basis.x, width * 0.5);
  const halfHeight = scaleVec(basis.y, height * 0.5);
  const corner = (sx: number, sy: number): Vec3 => [
    center[0] + halfWidth[0] * sx + halfHeight[0] * sy,
    center[1] + halfWidth[1] * sx + halfHeight[1] * sy,
    center[2] + halfWidth[2] * sx + halfHeight[2] * sy,
  ];
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

export function rectMesh(center: Vec3, basis: Basis3, width: number, height: number): MeshData {
  const p = rectLoop(center, basis, width, height);
  return {
    triangles: [[p[0]!, p[1]!, p[2]!], [p[0]!, p[2]!, p[3]!]],
    segments: [[p[0]!, p[1]!], [p[1]!, p[2]!], [p[2]!, p[3]!], [p[3]!, p[0]!]],
  };
}



// --- Box ------------------------------------------------------------------

export const BOX_LAYOUT = createLayout(SCENE_LAYOUTS.box, SCENE_LAYOUTS.box.baseY);

export const BOX_BASE_Y = SCENE_LAYOUTS.box.baseY;

export const BOX_SIZE: Vec3 = [0.72, 0.46, 0.46];

export const BOX_SIZE_VALUES: readonly Vec3[] = [[0.72, 0.46, 0.46], [1, 0.46, 0.46], [0.72, 0.72, 0.46], [0.72, 0.46, 0.76]];

export const BOX_ROTATION_TUNNEL_SIZE: Vec3 = [0.82, 0.52, 0.52];

export const BOX_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const BOX_ROTATION_TUNNEL_SCALE_STEP = 0.05;

export const BOX_ROTATION_TUNNEL_Y = 0.35;

export const BOX_S_TUNNEL_SIZE: Vec3 = [0.82, 0.52, 0.52];

export const BOX_S_TUNNEL_DEPTH_STEP = 0.16;

export const BOX_S_TUNNEL_SCALE_STEP = 0.05;

export const BOX_S_TUNNEL_Y = 0.35;



/** `_get_column_size`: per-column box size, including the shrinking tunnels. */
export function boxColumnSize(column: number, row: number): Vec3 {
  if (column === 1) return BOX_SIZE_VALUES[row]!;
  if (column === 2) return scaleVec(BOX_ROTATION_TUNNEL_SIZE, 1 - row * BOX_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 6) return scaleVec(BOX_S_TUNNEL_SIZE, 1 - row * BOX_S_TUNNEL_SCALE_STEP);
  return BOX_SIZE;
}



/** `_get_box_center`: boxes sit with their base at `BOX_BASE_Y`. */
export function boxCenter(column: number, row: number): Vec3 {
  const size = boxColumnSize(column, row);
  return referenceOffset([BOX_LAYOUT.columnX(column), BOX_BASE_Y + size[1] * 0.5, BOX_LAYOUT.rowZ(column, row)]);
}

export function boxTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = boxCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}

export function boxRotationTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.24);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

export function boxSolidBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.20);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

export function drawBox(drawList: FrameDrawList, center: Vec3, basis: Basis3, size: Vec3, options: LineOptions): void {
  const mesh = transformMeshByBasis(box(size), center, basis);
  for (const [a, b] of mesh.segments) drawList.line(a, b, options);
}



// --- Axes -----------------------------------------------------------------

export const AXES_LAYOUT = createLayout(SCENE_LAYOUTS.axes, SCENE_LAYOUTS.axes.baseY);

export const AXES_LENGTH = 0.75;

export const AXES_LENGTH_VALUES: readonly number[] = [0.35, 0.55, 0.75, 1];

export const AXES_ROTATION_TUNNEL_LENGTH = 0.9;

export const AXES_ROTATION_TUNNEL_DEPTH_STEP = 0.16;

export const AXES_ROTATION_TUNNEL_SCALE_STEP = 0.05;

export const AXES_ROTATION_TUNNEL_Y = 0.35;

export function axesTunnelPos(column: number, row: number): Vec3 {
  const pos = AXES_LAYOUT.atLocal(column, row);
  return referenceOffset([pos[0], pos[1] + AXES_ROTATION_TUNNEL_Y, pos[2] - row * AXES_ROTATION_TUNNEL_DEPTH_STEP]);
}

export function axesRotationTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.26);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.11);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

export function drawAxes(drawList: FrameDrawList, origin: Vec3, basis: Basis3, length: number, width: number, widthMode?: NonNullable<LineOptions["widthMode"]>): void {
  const mode = widthMode === undefined ? {} : { widthMode };
  drawList.line(origin, offsetAlong(origin, basis.x, length), { color: AXIS_RED, width, ...mode });
  drawList.line(origin, offsetAlong(origin, basis.y, length), { color: AXIS_GREEN, width, ...mode });
  drawList.line(origin, offsetAlong(origin, basis.z, length), { color: AXIS_BLUE, width, ...mode });
}

export function drawAxesN(drawList: FrameDrawList, origin: Vec3, basis: Basis3, length: number, width: number, widthMode?: NonNullable<LineOptions["widthMode"]>): void {
  const mode = widthMode === undefined ? {} : { widthMode };
  drawList.line(origin, offsetAlong(origin, basis.x, length), { color: AXIS_RED, width, normal: basis.x, ...mode });
  drawList.line(origin, offsetAlong(origin, basis.y, length), { color: AXIS_GREEN, width, normal: basis.y, ...mode });
  drawList.line(origin, offsetAlong(origin, basis.z, length), { color: AXIS_BLUE, width, normal: basis.z, ...mode });
}



// ---------------------------------------------------------------------------
// Faithful Grid reference port (`examples/grid.gd`).
//
// Unlike every other scene, the grid columns are laid out from their own
// measured bounds: `_get_column_x` chains half widths and `COLUMN_GAP`, while
// `_get_row_z` stacks each row's z size plus `SAMPLE_SPACING_GAP`. The bounds
// math is ported from `_get_grid_bounds`; the rendered `skew` and `outer_edges`
// reuse the library grid (see the notes in `docs/reference-parity.md`).
// ---------------------------------------------------------------------------

export const GRID_SCENE_Y = 0.06;

export const GRID_SCENE_CELL_COUNT: readonly [number, number] = [6, 4];

export const GRID_SCENE_SPACING: readonly [number, number] = [0.28, 0.28];

export const GRID_SCENE_START_Z = -0.45;

export const GRID_SCENE_COLUMN_GAP = 1;

export const GRID_SCENE_SAMPLE_GAP = 0.55;

export const GRID_SCENE_WIDTH_VALUES = WIDTH_VALUES;

export const GRID_SCENE_CELL_VALUES: readonly (readonly [number, number])[] = [[4, 4], [6, 4], [10, 3], [3, 8]];

export const GRID_SCENE_SPACING_VALUES: readonly (readonly [number, number])[] = [[0.2, 0.2], [0.28, 0.28], [0.42, 0.22], [0.55, 0.28]];

export const GRID_SCENE_SKEW_VALUES: readonly (readonly [number, number])[] = [[0, 0], [0.28, 0], [-0.28, 0], [0.28, -0.18]];

export const GRID_SCENE_OUTER_VALUES = ["none", "x", "z", "xz"] as const;

export const GRID_SCENE_ROTATION_COUNT = 6;

export const GRID_SCENE_COLOR_COUNT = 4;

export const GRID_SCENE_NORMAL_COUNT = 4;

export function gridSceneCellCount(column: number, row: number): readonly [number, number] {
  return column === 1 ? GRID_SCENE_CELL_VALUES[row]! : GRID_SCENE_CELL_COUNT;
}

export function gridSceneSpacing(column: number, row: number): readonly [number, number] {
  return column === 2 ? GRID_SCENE_SPACING_VALUES[row]! : GRID_SCENE_SPACING;
}

export function gridSceneSkew(column: number, row: number): readonly [number, number] {
  return column === 3 ? GRID_SCENE_SKEW_VALUES[row]! : [0, 0];
}



/** `_get_grid_rotation`: identity except the rotation column's yaw-then-pitch basis. */
export function gridSceneRotation(column: number, row: number): readonly [number, number, number] {
  if (column !== 5) return [0, 0, 0];
  return [-row * Math.PI * 0.035, row * Math.PI * 0.07, 0];
}



/** `_get_grid_bounds` in the XY/Z plane, returned as min/max so callers derive size and x bounds. */
export function gridSceneBounds(column: number, row: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const [cx, cz] = gridSceneCellCount(column, row);
  const [sx, sz] = gridSceneSpacing(column, row);
  const [skewX, skewZ] = gridSceneSkew(column, row);
  const dx: Vec3 = [sx, 0, sx * Math.tan(skewZ)];
  const dz: Vec3 = [sz * Math.tan(skewX), 0, sz];
  const start: Vec3 = [-(dx[0] * cx + dz[0] * cz) * 0.5, 0, -(dx[2] * cx + dz[2] * cz) * 0.5];
  const corners: readonly Vec3[] = [
    start,
    [start[0] + dx[0] * cx, start[1], start[2] + dx[2] * cx],
    [start[0] + dz[0] * cz, start[1], start[2] + dz[2] * cz],
    [start[0] + dx[0] * cx + dz[0] * cz, start[1], start[2] + dx[2] * cx + dz[2] * cz],
  ];
  const rotation = gridSceneRotation(column, row);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const corner of corners) {
    const p = rotatePoint(corner, rotation);
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  return { minX, maxX, minZ, maxZ };
}

export function gridSceneColumnWidth(column: number): number {
  let width = 0;
  for (let row = 0; row < gridSceneRowCount(column); row++) {
    const bounds = gridSceneBounds(column, row);
    width = Math.max(width, bounds.maxX - bounds.minX);
  }
  return width;
}

export function gridSceneColumnX(column: number): number {
  let x = gridSceneColumnWidth(0) * 0.5 + 0.5;
  for (let index = 0; index < column; index++) {
    x += gridSceneColumnWidth(index) * 0.5 + GRID_SCENE_COLUMN_GAP + gridSceneColumnWidth(index + 1) * 0.5;
  }
  return x;
}

export function gridSceneRowZ(column: number, row: number): number {
  let z = GRID_SCENE_START_Z;
  for (let index = 0; index < row; index++) {
    const bounds = gridSceneBounds(column, index);
    z -= bounds.maxZ - bounds.minZ + GRID_SCENE_SAMPLE_GAP;
  }
  return z;
}



/** `_get_column_sample_count`: the per-column row table. */
export function gridSceneRowCount(column: number): number {
  if (column === 0) return GRID_SCENE_WIDTH_VALUES.length;
  if (column === 1) return GRID_SCENE_CELL_VALUES.length;
  if (column === 2) return GRID_SCENE_SPACING_VALUES.length;
  if (column === 3) return GRID_SCENE_SKEW_VALUES.length;
  if (column === 4) return GRID_SCENE_OUTER_VALUES.length;
  if (column === 5) return GRID_SCENE_ROTATION_COUNT;
  if (column === 6) return GRID_SCENE_COLOR_COUNT;
  if (column === 7) return GRID_SCENE_NORMAL_COUNT;
  return 0;
}

export function gridSceneCenter(column: number, row: number): Vec3 {
  return referenceOffset([gridSceneColumnX(column), GRID_SCENE_Y, gridSceneRowZ(column, row)]);
}



// ---------------------------------------------------------------------------
// Faithful Curve reference port (`examples/curve.gd`).
//
// The 3D curves are CubicBezier `Curve3D`s. `FrameDrawList.curve` only accepts a
// center + euler rotation, so the reference `Basis` transforms are baked into each
// curve's control points before recording.
// ---------------------------------------------------------------------------

export const CURVE_LAYOUT = createLayout(SCENE_LAYOUTS.curve, SCENE_LAYOUTS.curve.baseY);

export const CURVE_Y = SCENE_LAYOUTS.curve.baseY;

export const CURVE_TOLERANCE_LENGTH = 0.08;

export const CURVE_JOINT_TOLERANCE_LENGTH = 0.35;

export const CONSTRUCTION_SAMPLE_Z = -0.45;

export const CURVE_TUNNEL_DEPTH_STEP = 0.16;

export const CURVE_TUNNEL_SCALE_STEP = 0.06;

export const CURVE_TUNNEL_TWIST_STEP = Math.PI * 0.12;

export const CURVE_SHAPE_VALUES: readonly number[] = [0.25, 0.65, 1, 1.35];

export const CURVE_TOLERANCE_VALUES: readonly number[] = [0.04, 0.08, 0.16, 0.32];



// `_create_*_curve` constructors, ported point-for-point (handles are relative offsets).
export function straightCurve(): Curve3D {
  return curve([
    { position: [-0.5, 0, 0.18] },
    { position: [0, 0, -0.18] },
    { position: [0.5, 0, 0.18] },
  ]);
}

export function smoothSymmetricCurve(shapeScale = 1): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.2 * shapeScale], out: [0.28, 0, -0.35 * shapeScale] },
    { position: [0, 0, -0.2 * shapeScale], in: [-0.28, 0, 0.35 * shapeScale], out: [0.28, 0, -0.35 * shapeScale] },
    { position: [0.55, 0, 0.2 * shapeScale], in: [-0.28, 0, 0.35 * shapeScale] },
  ]);
}

export function flatHandleCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0], out: [0.32, 0, 0] },
    { position: [0.55, 0, 0], in: [-0.32, 0, 0] },
  ]);
}

export function brokenCornerCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.18], out: [0.28, 0, -0.08] },
    { position: [0, 0, -0.24], in: [-0.18, 0, 0.34], out: [0.12, 0, 0.34] },
    { position: [0.55, 0, 0.18], in: [-0.28, 0, -0.08] },
  ]);
}

export function oneSidedCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.18], out: [0.38, 0, -0.48] },
    { position: [0, 0, -0.16] },
    { position: [0.55, 0, 0.18], in: [-0.38, 0, -0.48] },
  ]);
}

export function yCurve(): Curve3D {
  return curve([
    { position: [-0.55, -0.18, 0.18], out: [0.28, 0.36, -0.34] },
    { position: [0, 0.22, -0.18], in: [-0.28, -0.34, 0.34], out: [0.28, -0.34, -0.34] },
    { position: [0.55, -0.18, 0.18], in: [-0.28, 0.36, 0.34] },
  ]);
}

export function cornerCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.24] },
    { position: [-0.15, 0, -0.24] },
    { position: [0.18, 0, 0.24] },
    { position: [0.55, 0, -0.24] },
  ]);
}

export function closedCurve(shapeScale: number): Curve3D {
  const xRadius = 0.45 * shapeScale;
  const zRadius = 0.35 * shapeScale;
  const xHandle = 0.28 * shapeScale;
  const zHandle = 0.24 * shapeScale;
  return curve([
    { position: [-xRadius, 0, 0], in: [0, 0, zHandle], out: [0, 0, -zHandle] },
    { position: [0, 0, -zRadius], in: [-xHandle, 0, 0], out: [xHandle, 0, 0] },
    { position: [xRadius, 0, 0], in: [0, 0, -zHandle], out: [0, 0, zHandle] },
    { position: [0, 0, zRadius], in: [xHandle, 0, 0], out: [-xHandle, 0, 0] },
  ], true);
}

export const CURVE_BASE = smoothSymmetricCurve();

export const CURVE_CORNER = cornerCurve();

export const CURVE_SHAPES: readonly Curve3D[] = CURVE_SHAPE_VALUES.map((shapeScale) => smoothSymmetricCurve(shapeScale));

export const CURVE_CLOSED: readonly Curve3D[] = [smoothSymmetricCurve(), closedCurve(1), closedCurve(0.75), closedCurve(1.25)];

export const CURVE_CONSTRUCTION: readonly Curve3D[] = [straightCurve(), smoothSymmetricCurve(), flatHandleCurve(), brokenCornerCurve(), oneSidedCurve(), yCurve(), closedCurve(1)];



/** Godot `_get_curve_rotation`: `Basis(width_axis, normal, depth_axis)`. */
export function curveRotationBasis(normal: Vec3, angle: number): Basis3 {
  const n = normalizeVector(normal);
  const reference: Vec3 = Math.abs(n[0]) > 0.95 ? [0, 0, 1] : [1, 0, 0];
  const projection = reference[0] * n[0] + reference[1] * n[1] + reference[2] * n[2];
  const planar: Vec3 = [reference[0] - n[0] * projection, reference[1] - n[1] * projection, reference[2] - n[2] * projection];
  const widthAxis = normalizeVector(rotateAroundAxis(normalizeVector(planar), n, angle));
  const depthAxis = normalizeVector(crossVector(widthAxis, n));
  return { x: widthAxis, y: n, z: depthAxis };
}



/** `_get_rotation_tunnel_rotation(row)`. */
export function curveTunnelBasis(row: number): Basis3 {
  const tilted = rotateAroundAxis([0, 1, 0], [1, 0, 0], -Math.PI * 0.38);
  const normal = normalizeVector(rotateAroundAxis(tilted, [0, 0, 1], row * CURVE_TUNNEL_TWIST_STEP));
  return curveRotationBasis(normal, row * Math.PI * 0.08);
}



/** Bakes a uniform scale + `Basis` into control points; only the translation is passed to `record`. */
export function scaleCurve(shape: Curve3D, scale: number, basis: Basis3): Curve3D {
  const map = (p: Vec3): Vec3 => [
    (basis.x[0] * p[0] + basis.y[0] * p[1] + basis.z[0] * p[2]) * scale,
    (basis.x[1] * p[0] + basis.y[1] * p[1] + basis.z[1] * p[2]) * scale,
    (basis.x[2] * p[0] + basis.y[2] * p[1] + basis.z[2] * p[2]) * scale,
  ];
  const points = shape.points.map((point) => ({
    position: map(point.position),
    ...(point.in === undefined ? {} : { in: map(point.in) }),
    ...(point.out === undefined ? {} : { out: map(point.out) }),
  }));
  return { points, ...(shape.closed === undefined ? {} : { closed: shape.closed }) };
}



// ---------------------------------------------------------------------------
// Faithful Arc reference port (`examples/arc.gd`).
// ---------------------------------------------------------------------------

export const ARC_LAYOUT = createLayout(SCENE_LAYOUTS.arc, SCENE_LAYOUTS.arc.baseY);

export const ARC_RADIUS = 0.34;

export const ARC_ANGLE = Math.PI * 1.5;

export const ARC_SEGMENT_COUNT = 64;

export const ARC_JOINT_SEGMENT_COUNT = 12;

export const ARC_ANGLE_VALUES: readonly number[] = [Math.PI * 0.5, Math.PI, Math.PI * 1.5, Math.PI * 2];

export const ARC_TUNNEL_RADIUS = 0.44;

export const ARC_TUNNEL_DEPTH_STEP = 0.16;

export const ARC_TUNNEL_SCALE_STEP = 0.06;

export const ARC_TUNNEL_TWIST_STEP = Math.PI * 0.12;

export const FLAT_BASIS: CircleBasis = circleBasis([0, 1, 0], 0);



/** `_get_rotation_tunnel_rotation(row)`. */
export function arcTunnelBasis(row: number): CircleBasis {
  const tilted = rotateAroundAxis([0, 1, 0], [1, 0, 0], -Math.PI * 0.38);
  const normal = normalizeVector(rotateAroundAxis(tilted, [0, 0, 1], row * ARC_TUNNEL_TWIST_STEP));
  return circleBasis(normal, row * Math.PI * 0.08);
}



/** `_get_rotation_tunnel_center`: lift the row, then recess it along -Z. */
export function arcTunnelCenter(column: number, row: number): Vec3 {
  const center = ARC_LAYOUT.atLocal(column, row);
  return referenceOffset([center[0], center[1] + 0.35, center[2] - row * ARC_TUNNEL_DEPTH_STEP]);
}



// ---------------------------------------------------------------------------
// Faithful Index / World Space Width reference ports (`examples/index.gd`,
// `examples/world_space_width.gd`).
//
// Both scenes drive the same 17-column API matrix. `world_space_width` keeps the
// layout but converts every line width from screen pixels to world units
// (`_world_width(px) = px * 0.01`) and drops the `*_s` solid columns, so the two
// share one implementation that differs only in width conversion, width mode and
// whether solid columns are included.
//
// Approximations (also noted in `docs/reference-parity.md`):
// - `draw_curve` uses a fixed `tolerance` instead of adaptive `max_stages` sampling.
// - Arrow heads keep the flat X-strip approximation shared with `arrow.gd`.
// - `draw_grid`/`draw_grid_n` use the library grid, whose skew shear and outer
//   edge semantics are the port's own (see the grid scene note).
// - Normal-aware columns pass one representative normal; cone/cylinder/capsule
//   use one segment count for the base ring and the side lines.
// ---------------------------------------------------------------------------

export const INDEX_LAYOUT = createLayout(SCENE_LAYOUTS.index, SCENE_LAYOUTS.index.baseY);

export const INDEX_DASH_WIDTH = 0.16;

export const INDEX_DASH_SPACE = 0.09;

export const INDEX_DASH_OFFSET = 0;

export const INDEX_UP: Vec3 = [0, 1, 0];

export const INDEX_BRIGHT_CYAN: Color = [0.35, 1, 1, 1];

export const INDEX_GOLD: Color = [1, 0.75, 0.25, 1];

export const INDEX_MINT: Color = [0.5, 1, 0.65, 1];

export const INDEX_MAGENTA: Color = [1, 0.45, 1, 1];

export const INDEX_LAVENDER: Color = [0.7, 0.7, 1, 1];



/** `index.gd` `_p(column, row, x_offset, z_offset, y)` with the capture translation applied. */
export function indexPath(column: number, row: number, xOffset = 0, zOffset = 0, y: number = SCENE_LAYOUTS.index.baseY): Vec3 {
  const local = INDEX_LAYOUT.atLocal(column, row);
  return referenceOffset([local[0] + xOffset, y, local[2] + zOffset]);
}



/** `index.gd`'s `_curve` control points (three cubic Bezier anchors). */
export const INDEX_CURVE: Curve3D = curve([
  { position: [-0.45, -0.15, 0], in: [0, 0, 0], out: [0.25, 0.4, 0] },
  { position: [0.15, 0.25, 0.25], in: [-0.25, 0.35, 0], out: [0.25, -0.35, 0] },
  { position: [0.65, -0.15, 0.45], in: [-0.25, -0.35, 0], out: [0, 0, 0] },
]);



/**
 * `draw_line_list`: independent segments taken as consecutive point pairs. `normals`, when given,
 * is one normal per pair, matching the reference `_emit_normal_line_list`.
 */
export function drawLineList(
  drawList: FrameDrawList,
  points: readonly Vec3[],
  options: LineOptions,
  normals?: readonly Vec3[],
): void {
  for (let index = 0; index + 1 < points.length; index += 2) {
    const normal = normals?.[index / 2];
    drawList.line(points[index]!, points[index + 1]!, normal === undefined ? options : { ...options, normal });
  }
}

export type ApiMatrixConfig = {
  readonly width: (pixels: number) => number;
  readonly widthMode: NonNullable<LineOptions["widthMode"]>;
  readonly solids: boolean;
};



// ---------------------------------------------------------------------------
// 3D labels.
//
// Every reference example owns one `Label3D` per column title and one per sample. They are not
// addon output, but they are part of the picture the example defines, so the port draws them with
// vgpu's own text renderer at the reference coordinates: a centred title in front of the column and
// a right-aligned label beside each row, both lying flat on the ground plane
// (`label.rotation.x = -PI/2`) at `LABEL_Y = <scene>_Y + 0.01`.
//
// A row label's right edge sits at its sample's x bounds minus `SAMPLE_LABEL_GAP`, which is why each
// scene needs its own bounds function: the reference measures what the geometry actually spans, so
// a rotated or shrinking tunnel column keeps its labels clear of the shape.
// ---------------------------------------------------------------------------

export const LABEL_GAP = LABEL_PLACEMENT.sampleGap;



/** `LABEL_Y := <scene>_Y + 0.01`. */
export function labelHeight(baseY: number): number {
  return baseY + LABEL_PLACEMENT.labelYOffset;
}



/** A local X before the capture harness translates the scene root. */
export function sceneX(localX: number): number {
  return localX + REFERENCE_OFFSET[0];
}



/** A local Z before the capture harness translates the scene root. */
export function sceneZ(localZ: number): number {
  return localZ + REFERENCE_OFFSET[2];
}

export function boundsX(points: readonly Vec3[]): readonly [number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
  }
  return [minX, maxX];
}



/** `LABEL_Y` of the two all-API matrices is a literal, not `<scene>_Y + 0.01`. */
export const MATRIX_LABEL_Y = 0.08;



/** `index.gd` / `world_space_width.gd`: `_column_x(column) + 0.5` over `ORIGIN_X = 1`. */
export const MATRIX_LABELS: SceneLabelSpec = {
  placement: INDEX_LABEL_PLACEMENT,
  titlePosition: (column) => [sceneX(INDEX_LAYOUT.columnX(column) + 0.5), MATRIX_LABEL_Y, sceneZ(INDEX_LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [sceneX(INDEX_LAYOUT.columnX(column) - LABEL_GAP), MATRIX_LABEL_Y, sceneZ(INDEX_LAYOUT.rowZ(column, row))],
};



/** `line.gd`: titles centre over the 1.1-long sample, labels sit `SAMPLE_LABEL_OFFSET_X` left of the column. */
export const LINE_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [sceneX(lineColumnX(column) + LINE_SAMPLE_LENGTH * 0.5), labelHeight(LINE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [sceneX(lineColumnX(column) - LABEL_GAP), labelHeight(LINE_Y), sceneZ(lineRowZ(row))],
};



export const RECT_SIZE_VALUES: readonly (readonly [number, number])[] = [[0.95, 0.45], [1.25, 0.45], [0.95, 0.75], [0.55, 0.55]];


/** `rect.gd` `_get_column_max_rect_width`: the widest rect of the column. */
export function rectColumnMaxWidth(column: number): number {
  if (column === 1) return Math.max(...RECT_SIZE_VALUES.map(([width]) => width));
  if (column === 9) return RECT_S_TUNNEL_WIDTH;
  return RECT_WIDTH;
}

export const RECT_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [sceneX(RECT_LAYOUT.columnX(column)), labelHeight(SCENE_LAYOUTS.rect.baseY), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => {
    const depthStep = column === 2 ? RECT_ROTATION_TUNNEL_DEPTH_STEP : column === 9 ? RECT_S_TUNNEL_DEPTH_STEP : 0;
    const localZ = RECT_LAYOUT.rowZ(column, row) - row * depthStep;
    return [sceneX(RECT_LAYOUT.columnX(column) - rectColumnMaxWidth(column) * 0.5 - LABEL_GAP), labelHeight(SCENE_LAYOUTS.rect.baseY), sceneZ(localZ)];
  },
};



/** `box.gd` `_get_box_x_bounds`: the eight rotated corners, projected onto x. */
export function boxLabelBounds(column: number, row: number): readonly [number, number] {
  const center = boxCenter(column, row);
  const size = boxColumnSize(column, row);
  const basis = column === 2 ? boxRotationTunnelBasis(row) : column === 6 ? boxSolidBasis(row) : IDENTITY_BASIS;
  const points: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        points.push([
          center[0] + (basis.x[0] * x * size[0] + basis.y[0] * y * size[1] + basis.z[0] * z * size[2]) * 0.5,
          center[1],
          center[2],
        ]);
      }
    }
  }
  return boundsX(points);
}

export function boxLabelZ(column: number, row: number): number {
  if (column === 2) return boxTunnelCenter(2, row, BOX_ROTATION_TUNNEL_Y, BOX_ROTATION_TUNNEL_DEPTH_STEP)[2];
  if (column === 6) return boxTunnelCenter(6, row, BOX_S_TUNNEL_Y, BOX_S_TUNNEL_DEPTH_STEP)[2];
  return sceneZ(BOX_LAYOUT.rowZ(column, row));
}

export const BOX_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(boxLabelTitleX(column)), labelHeight(BOX_BASE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [boxLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(BOX_BASE_Y), boxLabelZ(column, row)],
};

export function boxLabelTitleX(column: number): number {
  const rowCount = SCENE_LABELS.box!.columns[column]!.samples.length;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let row = 0; row < rowCount; row++) {
    const [min, max] = boxLabelBounds(column, row);
    minX = Math.min(minX, min);
    maxX = Math.max(maxX, max);
  }
  return (minX + maxX) * 0.5;
}



/** `axes.gd` `_get_column_length`: the length row plus the shrinking rotation tunnel. */
export function axesColumnLength(column: number, row: number): number {
  if (column === 0 || column === 3) return AXES_LENGTH_VALUES[row]!;
  if (column === 2 || column === 5) return AXES_ROTATION_TUNNEL_LENGTH * (1 - row * AXES_ROTATION_TUNNEL_SCALE_STEP);
  return AXES_LENGTH;
}

export function axesLabelBounds(column: number, row: number): readonly [number, number] {
  const tunnel = column === 2 || column === 5;
  const origin = tunnel ? axesTunnelPos(column, row) : AXES_LAYOUT.at(column, row);
  const basis = tunnel ? axesRotationTunnelBasis(row) : IDENTITY_BASIS;
  const length = axesColumnLength(column, row);
  return boundsX([origin, offsetAlong(origin, basis.x, length), offsetAlong(origin, basis.y, length), offsetAlong(origin, basis.z, length)]);
}

export function axesLabelZ(column: number, row: number): number {
  if (column === 2 || column === 5) return axesTunnelPos(column, row)[2];
  return sceneZ(AXES_LAYOUT.rowZ(column, row));
}

export const AXES_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(axesLabelTitleX(column)), labelHeight(SCENE_LAYOUTS.axes.baseY), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [axesLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(SCENE_LAYOUTS.axes.baseY), axesLabelZ(column, row)],
};

export function axesLabelTitleX(column: number): number {
  const rowCount = SCENE_LABELS.axes!.columns[column]!.samples.length;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let row = 0; row < rowCount; row++) {
    const [min, max] = axesLabelBounds(column, row);
    minX = Math.min(minX, min);
    maxX = Math.max(maxX, max);
  }
  return (minX + maxX) * 0.5;
}

export const GRID_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(gridLabelTitleX(column)), labelHeight(GRID_SCENE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => {
    const bounds = gridSceneBounds(column, row);
    const center = gridSceneCenter(column, row);
    return [center[0] + bounds.minX - LABEL_GAP, labelHeight(GRID_SCENE_Y), center[2]];
  },
};

export function gridLabelTitleX(column: number): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let row = 0; row < gridSceneRowCount(column); row++) {
    const bounds = gridSceneBounds(column, row);
    const center = gridSceneCenter(column, row);
    minX = Math.min(minX, center[0] + bounds.minX);
    maxX = Math.max(maxX, center[0] + bounds.maxX);
  }
  return (minX + maxX) * 0.5;
}



/** `circle.gd` `_get_column_max_radius`. */
export function circleColumnMaxRadius(column: number): number {
  if (column === 1) return Math.max(...RADIUS_VALUES);
  if (column === 3) return CIRCLE_TUNNEL_RADIUS;
  return CIRCLE_RADIUS;
}

export const CIRCLE_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [sceneX(circleColumnX(column)), labelHeight(CIRCLE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => {
    const depthStep = column === 3 ? CIRCLE_TUNNEL_DEPTH_STEP : 0;
    const localZ = CIRCLE_SAMPLE_START_Z - row * circleRowSpacing(column) - row * depthStep;
    return [sceneX(circleColumnX(column) - circleColumnMaxRadius(column) - LABEL_GAP), labelHeight(CIRCLE_Y), sceneZ(localZ)];
  },
};



/** `arc.gd` `_get_column_radius`. */
export function arcColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 4) return ARC_TUNNEL_RADIUS * (1 - row * ARC_TUNNEL_SCALE_STEP);
  return ARC_RADIUS;
}



/** `arc.gd` `_get_column_angle`. */
export function arcColumnAngle(column: number, row: number): number {
  return column === 2 ? ARC_ANGLE_VALUES[row]! : ARC_ANGLE;
}



/** `arc.gd` `_get_column_segment_count`. */
export function arcColumnSegments(column: number, row: number): number {
  if (column === 3) return SEGMENT_VALUES[row]!;
  if (column === 5 || column === 7 || column === 10) return ARC_JOINT_SEGMENT_COUNT;
  return ARC_SEGMENT_COUNT;
}

export function arcLabelBounds(column: number, row: number): readonly [number, number] {
  const tunnel = column === 4;
  const center = tunnel ? arcTunnelCenter(column, row) : ARC_LAYOUT.at(column, row);
  const basis = tunnel ? arcTunnelBasis(row) : FLAT_BASIS;
  const radius = arcColumnRadius(column, row);
  const angle = arcColumnAngle(column, row);
  const steps = Math.max(8, arcColumnSegments(column, row));
  const points: Vec3[] = [];
  for (let step = 0; step <= steps; step++) {
    const sweep = angle * step / steps;
    const cos = Math.cos(sweep) * radius;
    const sin = Math.sin(sweep) * radius;
    points.push([
      center[0] + basis.x[0] * cos + basis.y[0] * sin,
      center[1],
      center[2] + basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return boundsX(points);
}

export function arcLabelZ(column: number, row: number): number {
  if (column === 4) return arcTunnelCenter(column, row)[2];
  return sceneZ(ARC_LAYOUT.rowZ(column, row));
}

export const ARC_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(arcLabelTitleX(column)), labelHeight(SCENE_LAYOUTS.arc.baseY), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [arcLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(SCENE_LAYOUTS.arc.baseY), arcLabelZ(column, row)],
};

export function arcLabelTitleX(column: number): number {
  const rowCount = SCENE_LABELS.arc!.columns[column]!.samples.length;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let row = 0; row < rowCount; row++) {
    const [min, max] = arcLabelBounds(column, row);
    minX = Math.min(minX, min);
    maxX = Math.max(maxX, max);
  }
  return (minX + maxX) * 0.5;
}



/** `curve.gd` `_get_sample_curve`. */
export function curveSampleShape(column: number, row: number): Curve3D {
  if (column === 1) return CURVE_SHAPES[row]!;
  if (column === 4) return CURVE_CLOSED[row]!;
  if (column === 5 || column === 7) return CURVE_CORNER;
  return CURVE_BASE;
}



/** `curve.gd` `_get_sample_tolerance`. */
export function curveSampleTolerance(column: number, row: number): number {
  if (column === 3) return CURVE_TOLERANCE_VALUES[row]!;
  if (column === 5 || column === 7) return CURVE_JOINT_TOLERANCE_LENGTH;
  return CURVE_TOLERANCE_LENGTH;
}



/** `curve.gd` `_get_curve_x_bounds`, sampled the same way the renderer tessellates the curve. */
export function curveLabelBounds(column: number, row: number): readonly [number, number] {
  const shape = curveSampleShape(column, row);
  const tolerance = curveSampleTolerance(column, row);
  if (column === 2) {
    const local = CURVE_LAYOUT.atLocal(2, row);
    const center: Vec3 = [local[0], local[1] + 0.35, local[2] - row * CURVE_TUNNEL_DEPTH_STEP];
    const scale = 1 - row * CURVE_TUNNEL_SCALE_STEP;
    return boundsX(sampleCurve(scaleCurve(shape, scale, curveTunnelBasis(row)), tolerance, { center }));
  }
  return boundsX(sampleCurve(shape, tolerance, { center: CURVE_LAYOUT.atLocal(column, row) }));
}

export function curveLabelZ(column: number, row: number): number {
  if (column === 2) return sceneZ(CURVE_LAYOUT.rowZ(column, row) - row * CURVE_TUNNEL_DEPTH_STEP);
  return sceneZ(CURVE_LAYOUT.rowZ(column, row));
}



/** `curve.gd` uses `EXAMPLE_TITLE_Z = -1.2`, ahead of the example rows that start at -2. */
export const CURVE_EXAMPLE_TITLE_Z = -1.2;

export const CURVE_CONSTRUCTION_TITLE_Z = 0.35;

export const CURVE_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(curveLabelTitleX(column)), labelHeight(CURVE_Y), sceneZ(CURVE_EXAMPLE_TITLE_Z)],
  samplePosition: (column, row) => [sceneX(curveLabelBounds(column, row)[0] - LABEL_GAP), labelHeight(CURVE_Y), curveLabelZ(column, row)],
  constructionPosition: (index) => {
    const center: Vec3 = [CURVE_LAYOUT.columnX(index), CURVE_Y, CONSTRUCTION_SAMPLE_Z];
    const [min, max] = boundsX(sampleCurve(CURVE_CONSTRUCTION[index]!, CURVE_TOLERANCE_LENGTH, { center }));
    return [sceneX((min + max) * 0.5), labelHeight(CURVE_Y), sceneZ(CURVE_CONSTRUCTION_TITLE_Z)];
  },
};

export function curveLabelTitleX(column: number): number {
  const rowCount = SCENE_LABELS.curve!.columns[column]!.samples.length;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let row = 0; row < rowCount; row++) {
    const [min, max] = curveLabelBounds(column, row);
    minX = Math.min(minX, min);
    maxX = Math.max(maxX, max);
  }
  return sceneX((minX + maxX) * 0.5);
}



/** `sphere.gd` `_get_sphere_x_bounds`: a rotated sphere spans ±radius on every basis axis. */
export function sphereLabelBounds(column: number, row: number): readonly [number, number] {
  const tunnel = column === 5 || column === 13;
  const center = column === 5
    ? sphereTunnelCenter(column, row, SPHERE_ROTATION_TUNNEL_Y, SPHERE_ROTATION_TUNNEL_DEPTH_STEP)
    : column === 13
      ? sphereTunnelCenter(column, row, SPHERE_S_TUNNEL_Y, SPHERE_S_TUNNEL_DEPTH_STEP)
      : sphereCenter(column, row);
  const basis = tunnel ? sphereTunnelBasis(row) : IDENTITY_BASIS;
  const radius = sphereColumnRadius(column, row);
  const points: Vec3[] = [];
  for (const axis of [basis.x, basis.y, basis.z]) {
    points.push(offsetAlong(center, axis, radius), offsetAlong(center, axis, -radius));
  }
  return boundsX(points);
}

export function sphereLabelZ(column: number, row: number): number {
  if (column === 5) return sphereTunnelCenter(column, row, SPHERE_ROTATION_TUNNEL_Y, SPHERE_ROTATION_TUNNEL_DEPTH_STEP)[2];
  if (column === 13) return sphereTunnelCenter(column, row, SPHERE_S_TUNNEL_Y, SPHERE_S_TUNNEL_DEPTH_STEP)[2];
  return sceneZ(SPHERE_LAYOUT.rowZ(column, row));
}

export const SPHERE_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(shapeLabelTitleX(SCENE_LABELS.sphere!, column, sphereLabelBounds)), labelHeight(SPHERE_BASE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [sphereLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(SPHERE_BASE_Y), sphereLabelZ(column, row)],
};



/** `cone.gd` `_get_column_segment_count` / `_get_column_side_segment_count`. */
export function coneColumnSegments(column: number, row: number): number {
  if (column === 3) return SHAPE_SEGMENT_VALUES[row]!;
  if (column === 6 || column === 8) return CONE_JOINT_SEGMENT_COUNT;
  return CONE_SEGMENT_COUNT;
}

export function coneColumnSideSegments(column: number, row: number): number {
  if (column === 4) return SHAPE_SEGMENT_VALUES[row]!;
  if (column === 6 || column === 8) return CONE_JOINT_SIDE_SEGMENT_COUNT;
  return CONE_SIDE_SEGMENT_COUNT;
}

export function coneTunnelValues(column: number): { readonly y: number; readonly depth: number } {
  return column === 9
    ? { y: CONE_S_TUNNEL_Y, depth: CONE_S_TUNNEL_DEPTH_STEP }
    : { y: CONE_ROTATION_TUNNEL_Y, depth: CONE_ROTATION_TUNNEL_DEPTH_STEP };
}

export function coneLabelBounds(column: number, row: number): readonly [number, number] {
  const tunnel = column === 5 || column === 9;
  const values = coneTunnelValues(column);
  const center = tunnel ? coneTunnelCenter(column, row, values.y, values.depth) : coneCenter(column, row);
  const basis = tunnel ? coneTunnelBasis(row) : IDENTITY_BASIS;
  const radius = coneColumnRadius(column, row);
  const height = coneColumnHeight(column, row);
  const apex = offsetAlong(center, basis.y, height * 0.5);
  const baseCenter = offsetAlong(center, basis.y, -height * 0.5);
  const points: Vec3[] = [apex];
  const ring = (count: number): void => {
    for (let index = 0; index < count; index++) {
      const angle = Math.PI * 2 * index / count;
      const cos = Math.cos(angle) * radius;
      const sin = Math.sin(angle) * radius;
      points.push([
        baseCenter[0] + basis.x[0] * cos + basis.z[0] * sin,
        baseCenter[1],
        baseCenter[2] + basis.x[2] * cos + basis.z[2] * sin,
      ]);
    }
  };
  ring(Math.max(8, coneColumnSegments(column, row)));
  ring(Math.max(1, coneColumnSideSegments(column, row)));
  return boundsX(points);
}

export function coneLabelZ(column: number, row: number): number {
  if (column === 5 || column === 9) {
    const values = coneTunnelValues(column);
    return coneTunnelCenter(column, row, values.y, values.depth)[2];
  }
  return sceneZ(CONE_LAYOUT.rowZ(column, row));
}

export const CONE_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(shapeLabelTitleX(SCENE_LABELS.cone!, column, coneLabelBounds)), labelHeight(CONE_BASE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [coneLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(CONE_BASE_Y), coneLabelZ(column, row)],
};



/** `cylinder.gd` `_get_column_segment_count` / `_get_column_side_segment_count`. */
export function cylinderColumnSegments(column: number, row: number): number {
  if (column === 3) return SHAPE_SEGMENT_VALUES[row]!;
  if (column === 6 || column === 8) return CYLINDER_JOINT_SEGMENT_COUNT;
  return CYLINDER_SEGMENT_COUNT;
}

export function cylinderColumnSideSegments(column: number, row: number): number {
  if (column === 4) return SHAPE_SEGMENT_VALUES[row]!;
  if (column === 6 || column === 8) return CYLINDER_JOINT_SIDE_SEGMENT_COUNT;
  return CYLINDER_SIDE_SEGMENT_COUNT;
}

export function cylinderTunnelValues(column: number): { readonly y: number; readonly depth: number } {
  return column === 9
    ? { y: CYLINDER_S_TUNNEL_Y, depth: CYLINDER_S_TUNNEL_DEPTH_STEP }
    : { y: CYLINDER_ROTATION_TUNNEL_Y, depth: CYLINDER_ROTATION_TUNNEL_DEPTH_STEP };
}

export function cylinderLabelBounds(column: number, row: number): readonly [number, number] {
  const tunnel = column === 5 || column === 9;
  const values = cylinderTunnelValues(column);
  const center = tunnel ? cylinderTunnelCenter(column, row, values.y, values.depth) : cylinderCenter(column, row);
  const basis = tunnel ? cylinderTunnelBasis(row) : IDENTITY_BASIS;
  const radius = cylinderColumnRadius(column, row);
  const halfHeight = cylinderColumnHalfHeight(column, row);
  const bottom = offsetAlong(center, basis.y, -halfHeight);
  const top = offsetAlong(center, basis.y, halfHeight);
  const points: Vec3[] = [];
  const ring = (ringCenter: Vec3, count: number): void => {
    for (let index = 0; index < count; index++) {
      const angle = Math.PI * 2 * index / count;
      const cos = Math.cos(angle) * radius;
      const sin = Math.sin(angle) * radius;
      points.push([
        ringCenter[0] + basis.x[0] * cos + basis.z[0] * sin,
        ringCenter[1],
        ringCenter[2] + basis.x[2] * cos + basis.z[2] * sin,
      ]);
    }
  };
  ring(bottom, Math.max(8, cylinderColumnSegments(column, row)));
  ring(top, Math.max(8, cylinderColumnSegments(column, row)));
  ring(bottom, Math.max(1, cylinderColumnSideSegments(column, row)));
  ring(top, Math.max(1, cylinderColumnSideSegments(column, row)));
  return boundsX(points);
}

export function cylinderLabelZ(column: number, row: number): number {
  if (column === 5 || column === 9) {
    const values = cylinderTunnelValues(column);
    return cylinderTunnelCenter(column, row, values.y, values.depth)[2];
  }
  return sceneZ(CYLINDER_LAYOUT.rowZ(column, row));
}

export const CYLINDER_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(shapeLabelTitleX(SCENE_LABELS.cylinder!, column, cylinderLabelBounds)), labelHeight(CYLINDER_BASE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [cylinderLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(CYLINDER_BASE_Y), cylinderLabelZ(column, row)],
};



/** `capsule.gd` `_get_capsule_x_bounds`: the two cap centres, widened by the radius. */
export function capsuleLabelBounds(column: number, row: number): readonly [number, number] {
  const tunnel = column === 5;
  const center = tunnel
    ? capsuleTunnelCenter(column, row, CAPSULE_ROTATION_TUNNEL_Y, CAPSULE_ROTATION_TUNNEL_DEPTH_STEP)
    : capsuleCenter(column, row);
  const basis = tunnel ? capsuleTunnelBasis(row) : IDENTITY_BASIS;
  const radius = capsuleColumnRadius(column, row);
  const halfHeight = capsuleColumnHalfHeight(column, row);
  const bottom = offsetAlong(center, basis.y, -halfHeight);
  const top = offsetAlong(center, basis.y, halfHeight);
  return [Math.min(bottom[0], top[0]) - radius, Math.max(bottom[0], top[0]) + radius];
}

export function capsuleLabelZ(column: number, row: number): number {
  if (column === 5) return capsuleTunnelCenter(column, row, CAPSULE_ROTATION_TUNNEL_Y, CAPSULE_ROTATION_TUNNEL_DEPTH_STEP)[2];
  return sceneZ(CAPSULE_LAYOUT.rowZ(column, row));
}

export const CAPSULE_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(shapeLabelTitleX(SCENE_LABELS.capsule!, column, capsuleLabelBounds)), labelHeight(CAPSULE_BASE_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [capsuleLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(CAPSULE_BASE_Y), capsuleLabelZ(column, row)],
};



/** Union of a column's bounds, centred like the reference `_get_column_label_x`. */
export function shapeLabelTitleX(labels: SceneLabels, column: number, bounds: (column: number, row: number) => readonly [number, number]): number {
  const rowCount = labels.columns[column]!.samples.length;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let row = 0; row < rowCount; row++) {
    const [min, max] = bounds(column, row);
    minX = Math.min(minX, min);
    maxX = Math.max(maxX, max);
  }
  return (minX + maxX) * 0.5;
}



/** `arrow.gd` `_get_column_head_length` / `_get_column_head_angle` / `_get_column_dir_length`. */
export function arrowColumnDirLength(column: number): number {
  return column === 3 || column === 5 ? ARROW_JOINT_HEAD_LENGTH : ARROW_HEAD_LENGTH;
}

export function arrowColumnHeadLength(column: number, row: number): number {
  if (column === 7) return ARROW_HEAD_LENGTH_VALUES[row]!;
  if (column === 10 || column === 12 || column === 14 || column === 16) return ARROW_JOINT_HEAD_LENGTH;
  return ARROW_HEAD_LENGTH;
}

export function arrowColumnHeadAngle(column: number, row: number): number {
  if (column === 2 || column === 8) return ARROW_HEAD_ANGLE_VALUES[row]!;
  if (column === 3 || column === 5 || column === 10 || column === 12 || column === 14 || column === 16) return ARROW_JOINT_HEAD_ANGLE;
  return ARROW_BASE_HEAD_ANGLE;
}



/** `arrow.gd` `_get_sample_x_bounds`. */
export function arrowLabelBounds(column: number, row: number): readonly [number, number] {
  if (column <= 5) {
    const tip = arrowTip(column, row);
    const dir: Vec3 = column === 1 ? arrowDirection(row) : [arrowColumnDirLength(column), 0, 0];
    const headLength = Math.hypot(dir[0], dir[1], dir[2]);
    const forward = scaleVec(dir, 1 / headLength);
    const reference: Vec3 = Math.abs(forward[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    const tangent = normalizeVector(crossVector(forward, reference));
    const bitangent = normalizeVector(crossVector(forward, tangent));
    const headRadius = Math.tan(arrowColumnHeadAngle(column, row)) * headLength;
    const headCenter = offsetAlong(tip, forward, -headLength);
    return boundsX([
      tip,
      offsetAlong(headCenter, tangent, headRadius),
      offsetAlong(headCenter, tangent, -headRadius),
      offsetAlong(headCenter, bitangent, headRadius),
      offsetAlong(headCenter, bitangent, -headRadius),
    ]);
  }
  const start = arrowLineStart(column, row);
  const end = arrowLineEnd(column, row);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  const forward = scaleVec([dx, dy, dz], 1 / length);
  const headLength = arrowColumnHeadLength(column, row);
  const headRadius = Math.tan(arrowColumnHeadAngle(column, row)) * headLength;
  const headCenter = offsetAlong(end, forward, -headLength);
  return [
    Math.min(start[0], end[0], headCenter[0] - headRadius),
    Math.max(start[0], end[0], headCenter[0] + headRadius),
  ];
}

export function arrowLabelZ(column: number, row: number): number {
  return column === 9 ? arrowLineStart(column, row)[2] : sceneZ(ARROW_LAYOUT.rowZ(column, row));
}

export const ARROW_LABELS: SceneLabelSpec = {
  placement: LABEL_PLACEMENT,
  titlePosition: (column) => [(shapeLabelTitleX(SCENE_LABELS.arrow!, column, arrowLabelBounds)), labelHeight(ARROW_Y), sceneZ(LABEL_PLACEMENT.titleZ)],
  samplePosition: (column, row) => [arrowLabelBounds(column, row)[0] - LABEL_GAP, labelHeight(ARROW_Y), arrowLabelZ(column, row)],
};

export const SCENE_LABEL_SPECS: Readonly<Record<string, SceneLabelSpec>> = {
  index: MATRIX_LABELS,
  world_space_width: MATRIX_LABELS,
  line: LINE_LABELS,
  arrow: ARROW_LABELS,
  axes: AXES_LABELS,
  grid: GRID_LABELS,
  rect: RECT_LABELS,
  box: BOX_LABELS,
  circle: CIRCLE_LABELS,
  arc: ARC_LABELS,
  curve: CURVE_LABELS,
  sphere: SPHERE_LABELS,
  cone: CONE_LABELS,
  cylinder: CYLINDER_LABELS,
  capsule: CAPSULE_LABELS,
};

