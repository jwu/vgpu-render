import type { FrameRecorder, LineOptions, Vec3, Color } from "./frame-recorder.js";
import { rotatePoint, type Curve3D } from "./curve.js";
import {
  arcNormals,
  box,
  boxEdgeNormals,
  capsuleOutlineNormals,
  capsuleWire,
  circleNormals,
  circlePoints,
  cone,
  coneBaseBasis,
  coneSideLineNormals,
  coneWire,
  cylinder,
  cylinderSideLineNormals,
  cylinderWire,
  disc,
  rectNormals,
  sphere,
  sphereRingNormals,
  sphereWire,
  type MeshData,
  type ShapeWire,
} from "./geometry-generators.js";
import {
  ALPHA_VALUES,
  basisCirclePoints,
  circleBasis,
  createLayout,
  crossVector,
  DASH_VALUES,
  fromHsv,
  JOINT_VALUES,
  NORMAL_SAMPLE_COUNT,
  normalSampleColor,
  normalSampleWidth,
  normalizeVector,
  RADIUS_VALUES,
  REFERENCE_OFFSET,
  referenceOffset,
  ROTATION_SAMPLE_COUNT,
  rotateAroundAxis,
  SCENE_LAYOUTS,
  SEGMENT_VALUES,
  WIDTH_VALUES,
  type CircleBasis,
} from "./godot-layout.js";

export type SceneContext = { readonly time: number; readonly lineJoint?: "none" | "round" | "bevel" | "miter" };

const WHITE: Color = [1, 1, 1, 1];
const CYAN: Color = [0.15, 0.85, 1, 0.95];
const LIME: Color = [0.7, 1, 0.25, 1];
const ORANGE: Color = [1, 0.45, 0.2, 0.95];
const VIOLET: Color = [0.75, 0.45, 1, 1];
const TEAL: Color = [0.25, 0.95, 0.9, 1];
const GOLD: Color = [0.95, 0.75, 0.25, 1];
const ORANGE_FULL: Color = [1, 0.45, 0.2, 1];
const PINK: Color = [1, 0.3, 0.6, 1];
const AXIS_RED: Color = [1, 0, 0, 1];
const AXIS_GREEN: Color = [0, 1, 0, 1];
const AXIS_BLUE: Color = [0, 0, 1, 1];

/** `draw_circle_n`: `_get_circle_normals` gives one radial normal per segment. */
function drawCircleNormals(recorder: FrameRecorder, points: readonly Vec3[], segments: number, basis: CircleBasis, options: LineOptions): void {
  recorder.lineStrip(points, { ...options, normals: circleNormals(segments, basis) }, true);
}

/** `draw_arc_n`: `_get_arc_normals` gives one radial normal per segment of the sweep. */
function drawArcNormals(recorder: FrameRecorder, points: readonly Vec3[], angle: number, segments: number, basis: CircleBasis, options: LineOptions): void {
  recorder.lineStrip(points, { ...options, normals: arcNormals(angle, segments, basis) }, false);
}

/** `draw_rect_n`: `_get_rect_normals` gives one corner normal per loop vertex. */
function drawRectNormals(recorder: FrameRecorder, points: readonly Vec3[], basis: CircleBasis, options: LineOptions): void {
  recorder.lineStrip(points, { ...options, normals: rectNormals(basis) }, true);
}

/** `draw_box_n`: `_get_box_line_normals` gives one normal per edge (see `boxEdgeNormals`). */
function drawBoxNormals(recorder: FrameRecorder, center: Vec3, basis: Basis3, size: Vec3, options: LineOptions): void {
  const mesh = transformMeshByBasis(box(size), center, basis);
  const normals = boxEdgeNormals(mesh.segments, center, basis);
  mesh.segments.forEach(([a, b], index) => recorder.line(a, b, { ...options, normal: normals[index]! }));
}

/** Reference `_emit_circle_s`: a fan in the circle's own basis, which `disc` builds in its XZ plane. */
function circleSolidMesh(radius: number, segments: number, center: Vec3, basis: CircleBasis): MeshData {
  const frame: Basis3 = { x: basis.x, y: normalizeVector(crossVector(basis.x, basis.y)), z: basis.y };
  return transformMeshByBasis(disc(radius, segments), center, frame);
}

/** Reference arc/`draw_arc` points: `center + (basis.x*cos + basis.y*sin) * radius`, `segments + 1` samples. */
function arcPoints(center: Vec3, radius: number, angle: number, segments: number, basis: CircleBasis): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = angle * i / segments;
    const cos = Math.cos(a) * radius;
    const sin = Math.sin(a) * radius;
    points.push([
      center[0] + basis.x[0] * cos + basis.y[0] * sin,
      center[1] + basis.x[1] * cos + basis.y[1] * sin,
      center[2] + basis.x[2] * cos + basis.y[2] * sin,
    ]);
  }
  return points;
}

function curve(points: readonly { position: Vec3; in?: Vec3; out?: Vec3 }[], closed = false): Curve3D {
  return { points, closed };
}

// ---------------------------------------------------------------------------
// Faithful Circle/Line reference port.
//
// These two scenes mirror `examples/circle.gd` and `examples/line.gd` exactly:
// real column/row coordinates, colors, widths, dash offsets and the rotation
// tunnel basis. The capture harness translates the Godot scene root by
// (-10, 0, 1.5) without rescaling geometry, so the same world offset is applied
// here.
// ---------------------------------------------------------------------------

const LINE_Y = 0.1;
const LINE_BASE_WIDTH = 2;
const LINE_SAMPLE_LENGTH = 1.1;
const LINE_COLUMN_SPACING = 2;
const LINE_ROW_SPACING = 0.78;
const LINE_SAMPLE_START_Z = -0.45;
const STRIP_HALF_DEPTH = 0.18;
const LOOP_HALF_DEPTH = 0.25;
const NORMAL_LINE_VALUES: readonly Vec3[] = [[0, 0, 1], [0, 0.70710677, 0.70710677], [0, 1, 0], [0, 0, -1]];

const CIRCLE_Y = 0.1;
const CIRCLE_RADIUS = 0.32;
const CIRCLE_BASE_WIDTH = 2;
const CIRCLE_SEGMENTS = 64;
const CIRCLE_JOINT_SEGMENTS = 12;
const CIRCLE_COLUMN_SPACING = 2;
const CIRCLE_ROW_SPACING = 0.82;
const CIRCLE_RADIUS_ROW_SPACING = 1.15;
const CIRCLE_SAMPLE_START_Z = -0.45;
const CIRCLE_ROTATION_SAMPLES = 8;
const CIRCLE_TUNNEL_RADIUS = 0.42;
const CIRCLE_TUNNEL_DEPTH_STEP = 0.16;
const CIRCLE_TUNNEL_SCALE_STEP = 0.06;
const CIRCLE_TUNNEL_TWIST_STEP = Math.PI * 0.12;
const CIRCLE_DASH_SPEED = 0.6;

function lineColumnX(column: number): number {
  return column * LINE_COLUMN_SPACING;
}

function lineRowZ(row: number): number {
  return LINE_SAMPLE_START_Z - row * LINE_ROW_SPACING;
}

function lineStart(column: number, row: number): Vec3 {
  return referenceOffset([lineColumnX(column), LINE_Y, lineRowZ(row)]);
}

function lineEnd(column: number, row: number): Vec3 {
  return referenceOffset([lineColumnX(column) + LINE_SAMPLE_LENGTH, LINE_Y, lineRowZ(row)]);
}

function referenceStripPoints(column: number, row: number): Vec3[] {
  const x = lineColumnX(column);
  const z = lineRowZ(row);
  return [
    referenceOffset([x, LINE_Y, z + STRIP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH * 0.33, LINE_Y, z - STRIP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH * 0.66, LINE_Y, z + STRIP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH, LINE_Y, z - STRIP_HALF_DEPTH]),
  ];
}

function referenceLoopPoints(column: number, row: number): Vec3[] {
  const x = lineColumnX(column);
  const z = lineRowZ(row);
  return [
    referenceOffset([x, LINE_Y, z + LOOP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH, LINE_Y, z + LOOP_HALF_DEPTH]),
    referenceOffset([x + LINE_SAMPLE_LENGTH, LINE_Y, z - LOOP_HALF_DEPTH]),
    referenceOffset([x, LINE_Y, z - LOOP_HALF_DEPTH]),
  ];
}

function circleColumnX(column: number): number {
  return column * CIRCLE_COLUMN_SPACING + 0.5;
}

function circleRowSpacing(column: number): number {
  return column === 1 ? CIRCLE_RADIUS_ROW_SPACING : CIRCLE_ROW_SPACING;
}

function circleCenterLocal(column: number, row: number): Vec3 {
  return [circleColumnX(column), CIRCLE_Y, CIRCLE_SAMPLE_START_Z - row * circleRowSpacing(column)];
}

/** Raw reference layout data, exported so tests and future 3D labels share one source. */
export const CIRCLE_REFERENCE = {
  columns: 11,
  columnSpacing: CIRCLE_COLUMN_SPACING,
  columnOffset: 0.5,
  rowSpacing: CIRCLE_ROW_SPACING,
  radiusRowSpacing: CIRCLE_RADIUS_ROW_SPACING,
  startZ: CIRCLE_SAMPLE_START_Z,
  radius: CIRCLE_RADIUS,
  baseWidth: CIRCLE_BASE_WIDTH,
  sceneOffset: REFERENCE_OFFSET,
  solidColor: [0.25, 0.65, 1, 0.45] as Color,
  columnX: circleColumnX,
  center: (column: number, row: number): Vec3 => referenceOffset(circleCenterLocal(column, row)),
} as const;

/** Raw reference layout data for the Line example. */
export const LINE_REFERENCE = {
  columns: 7,
  columnSpacing: LINE_COLUMN_SPACING,
  rowSpacing: LINE_ROW_SPACING,
  startZ: LINE_SAMPLE_START_Z,
  length: LINE_SAMPLE_LENGTH,
  stripHalfDepth: STRIP_HALF_DEPTH,
  loopHalfDepth: LOOP_HALF_DEPTH,
  sceneOffset: REFERENCE_OFFSET,
  columnX: lineColumnX,
  rowZ: lineRowZ,
  start: lineStart,
  end: lineEnd,
  strip: referenceStripPoints,
  loop: referenceLoopPoints,
} as const;

function lineMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = context.time * 0.35;

  WIDTH_VALUES.forEach((width, row) => recorder.line(lineStart(0, row), lineEnd(0, row), { color: WHITE, width }));
  ALPHA_VALUES.forEach((alpha, row) => recorder.line(lineStart(1, row), lineEnd(1, row), { color: [1, 0.85, 0.1, alpha], width: LINE_BASE_WIDTH }));
  DASH_VALUES.forEach(([dash, space], row) => recorder.line(lineStart(2, row), lineEnd(2, row), { color: LIME, width: LINE_BASE_WIDTH, dash: [dash, space, dashOffset] }));
  JOINT_VALUES.forEach((joint, row) => recorder.lineStrip(referenceStripPoints(3, row), { color: CYAN, width: 8, joint }, false));
  JOINT_VALUES.forEach((joint, row) => recorder.lineStrip(referenceLoopPoints(4, row), { color: ORANGE, width: 8, joint }, true));
  JOINT_VALUES.forEach((joint, row) => recorder.lineStrip(referenceStripPoints(5, row), { color: VIOLET, width: 8, joint, dash: [0.18, 0.1, dashOffset] }, false));
  NORMAL_LINE_VALUES.forEach((normal, row) => recorder.line(lineStart(6, row), lineEnd(6, row), { color: TEAL, width: LINE_BASE_WIDTH, normal }));
}

// ---------------------------------------------------------------------------
// Faithful Arrow reference port (`examples/arrow.gd`).
//
// `draw_arrow` emits only a head (two perpendicular V strips); `draw_arrow_line`
// adds a shaft. Both are reproduced here instead of using `FrameRecorder.arrow`,
// which always emits a shaft and a single flat V head with different proportions.
// ---------------------------------------------------------------------------

const ARROW_LAYOUT = createLayout(SCENE_LAYOUTS.arrow, SCENE_LAYOUTS.arrow.baseY);
const ARROW_Y = SCENE_LAYOUTS.arrow.baseY;
const ARROW_LENGTH = 1.1;
const ARROW_BASE_WIDTH = 2;
const ARROW_JOINT_WIDTH = 8;
const ARROW_HEAD_LENGTH = 0.22;
const ARROW_JOINT_HEAD_LENGTH = 0.34;
const ARROW_BASE_HEAD_ANGLE = Math.PI / 6;
const ARROW_JOINT_HEAD_ANGLE = Math.PI / 4;
const ARROW_NORMAL: Vec3 = [0, 0, 1];
const ARROW_TUNNEL_Y = 0.32;
const ARROW_TUNNEL_DEPTH_STEP = 0.16;
const ARROW_TUNNEL_SCALE_STEP = 0.05;
const ARROW_DIR_ANGLE_VALUES: readonly number[] = [-Math.PI * 0.35, -Math.PI * 0.12, Math.PI * 0.12, Math.PI * 0.35];
const ARROW_HEAD_LENGTH_VALUES: readonly number[] = [0.12, 0.22, 0.34, 0.46];
const ARROW_HEAD_ANGLE_VALUES: readonly number[] = [Math.PI / 9, Math.PI / 6, Math.PI / 4, Math.PI * 0.42];

type ArrowHeadOptions = {
  readonly color: Color;
  readonly width: number;
  readonly widthMode?: NonNullable<LineOptions["widthMode"]>;
  readonly headAngle: number;
  readonly joint?: NonNullable<LineOptions["joint"]>;
  readonly normal?: Vec3;
};

/** Reference `_get_perpendicular_unit(direction)`. */
function perpendicularUnit(direction: Vec3): Vec3 {
  const reference: Vec3 = Math.abs(direction[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  return normalizeVector(crossVector(direction, reference));
}

/** Reference `_get_projected_perpendicular_unit(direction, vector)`. */
function projectedPerpendicularUnit(direction: Vec3, vector: Vec3): Vec3 {
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
function drawArrowHead(recorder: FrameRecorder, tip: Vec3, dir: Vec3, options: ArrowHeadOptions): void {
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
    recorder.lineStrip(
      points,
      normalAware ? { ...wingOptions, normals: [surfaceNormal(radial), surfaceNormal(scaleVec(radial, -1))] } : wingOptions,
      false,
    );
  };
  wing(tangent);
  wing(bitangent);
}

/** `_get_arrow_tip`: head-only column tips sit half a sample (a full one for `dir`) ahead. */
function arrowTip(column: number, row: number): Vec3 {
  const offset = column === 1 ? ARROW_LENGTH : ARROW_LENGTH * 0.5;
  return referenceOffset([ARROW_LAYOUT.columnX(column) + offset, ARROW_Y, ARROW_LAYOUT.rowZ(column, row)]);
}

/** `_get_arrow_dir`: `RIGHT.rotated(BACK, angle) * ARROW_HEAD_LENGTH`. */
function arrowDirection(row: number): Vec3 {
  return scaleVec(rotateAroundAxis([1, 0, 0], [0, 0, 1], ARROW_DIR_ANGLE_VALUES[row]), ARROW_HEAD_LENGTH);
}

/** `_get_line_start`: the rotation column lifts and recesses each row. */
function arrowLineStart(column: number, row: number): Vec3 {
  const local = ARROW_LAYOUT.atLocal(column, row);
  if (column === 9) {
    return referenceOffset([local[0], local[1] + ARROW_TUNNEL_Y, local[2] - row * ARROW_TUNNEL_DEPTH_STEP]);
  }
  return referenceOffset(local);
}

/** `_get_rotation_vector`: shrunk, then yawed around UP and pitched around BACK. */
function arrowLineVector(row: number): Vec3 {
  const vector = scaleVec([1, 0, 0], ARROW_LENGTH * (1 - row * ARROW_TUNNEL_SCALE_STEP));
  const yawed = rotateAroundAxis(vector, [0, 1, 0], row * Math.PI * 0.08);
  return rotateAroundAxis(yawed, [0, 0, 1], -Math.PI * 0.18 + row * Math.PI * 0.08);
}

function arrowLineEnd(column: number, row: number): Vec3 {
  const start = arrowLineStart(column, row);
  const vector: Vec3 = column === 9 ? arrowLineVector(row) : [ARROW_LENGTH, 0, 0];
  return [start[0] + vector[0], start[1] + vector[1], start[2] + vector[2]];
}

type ArrowLineOptions = ArrowHeadOptions & { readonly headLength: number; readonly dash?: readonly [number, number, number] };

/** Reference `draw_arrow_line*`: a plain shaft plus the head at `end`. */
function drawArrowLine(recorder: FrameRecorder, start: Vec3, end: Vec3, options: ArrowLineOptions): void {
  // Both `draw_arrow_line` and `draw_arrow_line_n` emit the shaft with `_emit_line`, which carries
  // no normal: the caller's normal only orients the head's tangent plane.
  recorder.line(start, end, {
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
  drawArrowHead(recorder, end, [dx * scale, dy * scale, dz * scale], options);
}

function arrowMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = fposmod(context.time * DASH_OFFSET_SPEED, 10);
  const baseHead: Omit<ArrowHeadOptions, "color" | "width"> = { headAngle: ARROW_BASE_HEAD_ANGLE };
  const jointHead: Omit<ArrowHeadOptions, "color" | "width"> = { headAngle: ARROW_JOINT_HEAD_ANGLE };

  // arrow(width) / arrow(dir) / arrow(head angle) / arrow(joint)
  WIDTH_VALUES.forEach((width, row) => {
    drawArrowHead(recorder, arrowTip(0, row), [ARROW_HEAD_LENGTH, 0, 0], { color: WHITE, width, ...baseHead });
  });
  ARROW_DIR_ANGLE_VALUES.forEach((_angle, row) => {
    drawArrowHead(recorder, arrowTip(1, row), arrowDirection(row), { color: CYAN, width: ARROW_BASE_WIDTH, ...baseHead });
  });
  ARROW_HEAD_ANGLE_VALUES.forEach((headAngle, row) => {
    drawArrowHead(recorder, arrowTip(2, row), [ARROW_HEAD_LENGTH, 0, 0], { color: LIME, width: ARROW_BASE_WIDTH, headAngle });
  });
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowHead(recorder, arrowTip(3, row), [ARROW_JOINT_HEAD_LENGTH, 0, 0], { color: VIOLET, width: ARROW_JOINT_WIDTH, ...jointHead, joint });
  });

  // arrow_n / arrow_n(joint)
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawArrowHead(recorder, arrowTip(4, row), [ARROW_HEAD_LENGTH, 0, 0], { color: normalSampleColor(row), width: normalSampleWidth(row, ARROW_BASE_WIDTH), ...baseHead, normal: ARROW_NORMAL });
  }
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowHead(recorder, arrowTip(5, row), [ARROW_JOINT_HEAD_LENGTH, 0, 0], { color: TEAL, width: ARROW_JOINT_WIDTH, ...jointHead, joint, normal: ARROW_NORMAL });
  });

  // arrow_line(width)
  WIDTH_VALUES.forEach((width, row) => {
    drawArrowLine(recorder, arrowLineStart(6, row), arrowLineEnd(6, row), { color: WHITE, width, headLength: ARROW_HEAD_LENGTH, ...baseHead });
  });
  // arrow_line(head length)
  ARROW_HEAD_LENGTH_VALUES.forEach((headLength, row) => {
    drawArrowLine(recorder, arrowLineStart(7, row), arrowLineEnd(7, row), { color: GOLD, width: ARROW_BASE_WIDTH, headLength, ...baseHead });
  });
  // arrow_line(head angle)
  ARROW_HEAD_ANGLE_VALUES.forEach((headAngle, row) => {
    drawArrowLine(recorder, arrowLineStart(8, row), arrowLineEnd(8, row), { color: VIOLET, width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, headAngle });
  });
  // arrow_line(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    drawArrowLine(recorder, arrowLineStart(9, row), arrowLineEnd(9, row), { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, ...baseHead });
  }
  // arrow_line(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(recorder, arrowLineStart(10, row), arrowLineEnd(10, row), { color: VIOLET, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint });
  });
  // arrow_line_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawArrowLine(recorder, arrowLineStart(11, row), arrowLineEnd(11, row), { color: ORANGE_FULL, width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, ...baseHead, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // arrow_line_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(recorder, arrowLineStart(12, row), arrowLineEnd(12, row), { color: PINK, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] });
  });
  // arrow_line_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawArrowLine(recorder, arrowLineStart(13, row), arrowLineEnd(13, row), { color: normalSampleColor(row), width: normalSampleWidth(row, ARROW_BASE_WIDTH), headLength: ARROW_HEAD_LENGTH, ...baseHead, normal: ARROW_NORMAL });
  }
  // arrow_line_n(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(recorder, arrowLineStart(14, row), arrowLineEnd(14, row), { color: TEAL, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint, normal: ARROW_NORMAL });
  });
  // arrow_line_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawArrowLine(recorder, arrowLineStart(15, row), arrowLineEnd(15, row), { color: TEAL, width: ARROW_BASE_WIDTH, headLength: ARROW_HEAD_LENGTH, ...baseHead, normal: ARROW_NORMAL, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // arrow_line_n_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArrowLine(recorder, arrowLineStart(16, row), arrowLineEnd(16, row), { color: TEAL, width: ARROW_JOINT_WIDTH, headLength: ARROW_JOINT_HEAD_LENGTH, ...jointHead, joint, normal: ARROW_NORMAL, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] });
  });
}

// ---------------------------------------------------------------------------
// Faithful Rect / Box / Axes reference port.
//
// These three scenes mirror `examples/rect.gd`, `examples/box.gd` and
// `examples/axes.gd`: real column/row coordinates, `Basis` rotations, widths,
// dash offsets and normal-aware axes. `createLayout` applies the same
// `(-10, 0, 1.5)` root translation the capture harness uses.
// ---------------------------------------------------------------------------

const DASH_OFFSET_SPEED = 0.6;

/** A Godot `Basis` expressed as its three world-space column vectors. */
type Basis3 = { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };

const IDENTITY_BASIS: Basis3 = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function offsetAlong(origin: Vec3, axis: Vec3, amount: number): Vec3 {
  return [origin[0] + axis[0] * amount, origin[1] + axis[1] * amount, origin[2] + axis[2] * amount];
}

function scaleVec(v: Vec3, factor: number): Vec3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

function fposmod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** `Basis.rotated(axis, angle)` is `Basis(axis, angle) * basis`, so every column rotates. */
function rotateBasis(basis: Basis3, axis: Vec3, angle: number): Basis3 {
  return {
    x: rotateAroundAxis(basis.x, axis, angle),
    y: rotateAroundAxis(basis.y, axis, angle),
    z: rotateAroundAxis(basis.z, axis, angle),
  };
}

/** Places an origin-centred mesh through `Basis(basis.x, basis.y, basis.z)` at `position`. */
function transformMeshByBasis(mesh: MeshData, position: Vec3, basis: Basis3): MeshData {
  const apply = (p: Vec3): Vec3 => [
    position[0] + basis.x[0] * p[0] + basis.y[0] * p[1] + basis.z[0] * p[2],
    position[1] + basis.x[1] * p[0] + basis.y[1] * p[1] + basis.z[1] * p[2],
    position[2] + basis.x[2] * p[0] + basis.y[2] * p[1] + basis.z[2] * p[2],
  ];
  return {
    triangles: mesh.triangles.map(([a, b, c]) => [apply(a), apply(b), apply(c)] as const),
    segments: mesh.segments.map(([a, b]) => [apply(a), apply(b)] as const),
  };
}

// --- Rect -----------------------------------------------------------------

const RECT_LAYOUT = createLayout(SCENE_LAYOUTS.rect, SCENE_LAYOUTS.rect.baseY);
const RECT_WIDTH = 0.95;
const RECT_HEIGHT = 0.45;
const RECT_BASE_LINE_WIDTH = 2;
const RECT_EMPHASIS_LINE_WIDTH = 5.5;
const RECT_SIZE_VALUES: readonly (readonly [number, number])[] = [[0.95, 0.45], [1.25, 0.45], [0.95, 0.75], [0.55, 0.55]];
const RECT_ROTATION_TUNNEL_WIDTH = 1.15;
const RECT_ROTATION_TUNNEL_HEIGHT = 0.7;
const RECT_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const RECT_ROTATION_TUNNEL_SCALE_STEP = 0.07;
const RECT_ROTATION_TUNNEL_TWIST_STEP = Math.PI * 0.12;
const RECT_S_SAMPLE_COUNT = 8;
const RECT_S_TUNNEL_WIDTH = 1.1;
const RECT_S_TUNNEL_HEIGHT = 0.65;
const RECT_S_TUNNEL_DEPTH_STEP = 0.15;
const RECT_S_TUNNEL_SCALE_STEP = 0.06;
const RECT_S_TUNNEL_TWIST_STEP = Math.PI * 0.12;

/** `_get_rect_rotation(0.0, true)`: flat rect spanning the XZ plane. */
const RECT_FLAT_BASIS: Basis3 = { x: [1, 0, 0], y: normalizeVector(crossVector([0, 1, 0], [1, 0, 0])), z: [0, 1, 0] };

/** `_get_rect_points`: four corners in the plane spanned by `basis.x`/`basis.y`. */
function rectLoop(center: Vec3, basis: Basis3, width: number, height: number): Vec3[] {
  const halfWidth = scaleVec(basis.x, width * 0.5);
  const halfHeight = scaleVec(basis.y, height * 0.5);
  const corner = (sx: number, sy: number): Vec3 => [
    center[0] + halfWidth[0] * sx + halfHeight[0] * sy,
    center[1] + halfWidth[1] * sx + halfHeight[1] * sy,
    center[2] + halfWidth[2] * sx + halfHeight[2] * sy,
  ];
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

function rectMesh(center: Vec3, basis: Basis3, width: number, height: number): MeshData {
  const p = rectLoop(center, basis, width, height);
  return {
    triangles: [[p[0]!, p[1]!, p[2]!], [p[0]!, p[2]!, p[3]!]],
    segments: [[p[0]!, p[1]!], [p[1]!, p[2]!], [p[2]!, p[3]!], [p[3]!, p[0]!]],
  };
}

function rectTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = RECT_LAYOUT.atLocal(column, row);
  return referenceOffset([center[0], center[1] + yOffset, center[2] - row * depthStep]);
}

function rectRotationTunnelBasis(row: number): Basis3 {
  return rotateBasis(IDENTITY_BASIS, [0, 0, 1], row * RECT_ROTATION_TUNNEL_TWIST_STEP);
}

function rectSolidBasis(row: number): Basis3 {
  const twisted = rotateBasis(IDENTITY_BASIS, [0, 0, 1], row * RECT_S_TUNNEL_TWIST_STEP);
  return rotateBasis(twisted, [1, 0, 0], row * 0.08);
}

// --- Box ------------------------------------------------------------------

const BOX_LAYOUT = createLayout(SCENE_LAYOUTS.box, SCENE_LAYOUTS.box.baseY);
const BOX_BASE_Y = SCENE_LAYOUTS.box.baseY;
const BOX_SIZE: Vec3 = [0.72, 0.46, 0.46];
const BOX_BASE_LINE_WIDTH = 2;
const BOX_SIZE_VALUES: readonly Vec3[] = [[0.72, 0.46, 0.46], [1, 0.46, 0.46], [0.72, 0.72, 0.46], [0.72, 0.46, 0.76]];
const BOX_ROTATION_TUNNEL_SIZE: Vec3 = [0.82, 0.52, 0.52];
const BOX_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const BOX_ROTATION_TUNNEL_SCALE_STEP = 0.05;
const BOX_ROTATION_TUNNEL_Y = 0.35;
const BOX_S_SAMPLE_COUNT = 8;
const BOX_S_TUNNEL_SIZE: Vec3 = [0.82, 0.52, 0.52];
const BOX_S_TUNNEL_DEPTH_STEP = 0.16;
const BOX_S_TUNNEL_SCALE_STEP = 0.05;
const BOX_S_TUNNEL_Y = 0.35;

/** `_get_column_size`: per-column box size, including the shrinking tunnels. */
function boxColumnSize(column: number, row: number): Vec3 {
  if (column === 1) return BOX_SIZE_VALUES[row]!;
  if (column === 2) return scaleVec(BOX_ROTATION_TUNNEL_SIZE, 1 - row * BOX_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 6) return scaleVec(BOX_S_TUNNEL_SIZE, 1 - row * BOX_S_TUNNEL_SCALE_STEP);
  return BOX_SIZE;
}

/** `_get_box_center`: boxes sit with their base at `BOX_BASE_Y`. */
function boxCenter(column: number, row: number): Vec3 {
  const size = boxColumnSize(column, row);
  return referenceOffset([BOX_LAYOUT.columnX(column), BOX_BASE_Y + size[1] * 0.5, BOX_LAYOUT.rowZ(column, row)]);
}

function boxTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = boxCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}

function boxRotationTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.24);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

function boxSolidBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.20);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

function drawBox(recorder: FrameRecorder, center: Vec3, basis: Basis3, size: Vec3, options: LineOptions): void {
  const mesh = transformMeshByBasis(box(size), center, basis);
  for (const [a, b] of mesh.segments) recorder.line(a, b, options);
}

// --- Axes -----------------------------------------------------------------

const AXES_LAYOUT = createLayout(SCENE_LAYOUTS.axes, SCENE_LAYOUTS.axes.baseY);
const AXES_LENGTH = 0.75;
const AXES_BASE_WIDTH = 2;
const AXES_LENGTH_VALUES: readonly number[] = [0.35, 0.55, 0.75, 1];
const AXES_ROTATION_TUNNEL_LENGTH = 0.9;
const AXES_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const AXES_ROTATION_TUNNEL_SCALE_STEP = 0.05;
const AXES_ROTATION_TUNNEL_Y = 0.35;

function axesTunnelPos(column: number, row: number): Vec3 {
  const pos = AXES_LAYOUT.atLocal(column, row);
  return referenceOffset([pos[0], pos[1] + AXES_ROTATION_TUNNEL_Y, pos[2] - row * AXES_ROTATION_TUNNEL_DEPTH_STEP]);
}

function axesRotationTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.26);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.11);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

function drawAxes(recorder: FrameRecorder, origin: Vec3, basis: Basis3, length: number, width: number, widthMode?: NonNullable<LineOptions["widthMode"]>): void {
  const mode = widthMode === undefined ? {} : { widthMode };
  recorder.line(origin, offsetAlong(origin, basis.x, length), { color: AXIS_RED, width, ...mode });
  recorder.line(origin, offsetAlong(origin, basis.y, length), { color: AXIS_GREEN, width, ...mode });
  recorder.line(origin, offsetAlong(origin, basis.z, length), { color: AXIS_BLUE, width, ...mode });
}

function drawAxesN(recorder: FrameRecorder, origin: Vec3, basis: Basis3, length: number, width: number, widthMode?: NonNullable<LineOptions["widthMode"]>): void {
  const mode = widthMode === undefined ? {} : { widthMode };
  recorder.line(origin, offsetAlong(origin, basis.x, length), { color: AXIS_RED, width, normal: basis.x, ...mode });
  recorder.line(origin, offsetAlong(origin, basis.y, length), { color: AXIS_GREEN, width, normal: basis.y, ...mode });
  recorder.line(origin, offsetAlong(origin, basis.z, length), { color: AXIS_BLUE, width, normal: basis.z, ...mode });
}

function axesMatrix(recorder: FrameRecorder, context: SceneContext): void {
  AXES_LENGTH_VALUES.forEach((length, row) => {
    drawAxes(recorder, AXES_LAYOUT.at(0, row), IDENTITY_BASIS, length, AXES_BASE_WIDTH);
  });
  WIDTH_VALUES.forEach((width, row) => {
    drawAxes(recorder, AXES_LAYOUT.at(1, row), IDENTITY_BASIS, AXES_LENGTH, width);
  });
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * AXES_ROTATION_TUNNEL_SCALE_STEP;
    drawAxes(recorder, axesTunnelPos(2, row), axesRotationTunnelBasis(row), AXES_ROTATION_TUNNEL_LENGTH * scale, AXES_BASE_WIDTH);
  }
  AXES_LENGTH_VALUES.forEach((length, row) => {
    drawAxesN(recorder, AXES_LAYOUT.at(3, row), IDENTITY_BASIS, length, AXES_BASE_WIDTH);
  });
  WIDTH_VALUES.forEach((width, row) => {
    drawAxesN(recorder, AXES_LAYOUT.at(4, row), IDENTITY_BASIS, AXES_LENGTH, width);
  });
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * AXES_ROTATION_TUNNEL_SCALE_STEP;
    drawAxesN(recorder, axesTunnelPos(5, row), axesRotationTunnelBasis(row), AXES_ROTATION_TUNNEL_LENGTH * scale, AXES_BASE_WIDTH);
  }
  void context;
}

// ---------------------------------------------------------------------------
// Faithful Grid reference port (`examples/grid.gd`).
//
// Unlike every other scene, the grid columns are laid out from their own
// measured bounds: `_get_column_x` chains half widths and `COLUMN_GAP`, while
// `_get_row_z` stacks each row's z size plus `SAMPLE_SPACING_GAP`. The bounds
// math is ported from `_get_grid_bounds`; the rendered `skew` and `outer_edges`
// reuse the library grid (see the notes in `docs/godot-debug-draw-parity.md`).
// ---------------------------------------------------------------------------

const GRID_SCENE_Y = 0.06;
const GRID_SCENE_BASE_LINE_WIDTH = 2;
const GRID_SCENE_CELL_COUNT: readonly [number, number] = [6, 4];
const GRID_SCENE_SPACING: readonly [number, number] = [0.28, 0.28];
const GRID_SCENE_START_Z = -0.45;
const GRID_SCENE_COLUMN_GAP = 1;
const GRID_SCENE_SAMPLE_GAP = 0.55;
const GRID_SCENE_WIDTH_VALUES = WIDTH_VALUES;
const GRID_SCENE_CELL_VALUES: readonly (readonly [number, number])[] = [[4, 4], [6, 4], [10, 3], [3, 8]];
const GRID_SCENE_SPACING_VALUES: readonly (readonly [number, number])[] = [[0.2, 0.2], [0.28, 0.28], [0.42, 0.22], [0.55, 0.28]];
const GRID_SCENE_SKEW_VALUES: readonly (readonly [number, number])[] = [[0, 0], [0.28, 0], [-0.28, 0], [0.28, -0.18]];
const GRID_SCENE_OUTER_VALUES = ["none", "x", "z", "xz"] as const;
const GRID_SCENE_ROTATION_COUNT = 6;
const GRID_SCENE_COLOR_COUNT = 4;
const GRID_SCENE_NORMAL_COUNT = 4;

function gridSceneCellCount(column: number, row: number): readonly [number, number] {
  return column === 1 ? GRID_SCENE_CELL_VALUES[row]! : GRID_SCENE_CELL_COUNT;
}

function gridSceneSpacing(column: number, row: number): readonly [number, number] {
  return column === 2 ? GRID_SCENE_SPACING_VALUES[row]! : GRID_SCENE_SPACING;
}

function gridSceneSkew(column: number, row: number): readonly [number, number] {
  return column === 3 ? GRID_SCENE_SKEW_VALUES[row]! : [0, 0];
}

function gridSceneOuter(column: number, row: number): (typeof GRID_SCENE_OUTER_VALUES)[number] {
  return column === 4 ? GRID_SCENE_OUTER_VALUES[row]! : "none";
}

/** `_get_grid_rotation`: identity except the rotation column's yaw-then-pitch basis. */
function gridSceneRotation(column: number, row: number): readonly [number, number, number] {
  if (column !== 5) return [0, 0, 0];
  return [-row * Math.PI * 0.035, row * Math.PI * 0.07, 0];
}

/** `_get_grid_bounds` in the XY/Z plane, returned as min/max so callers derive size and x bounds. */
function gridSceneBounds(column: number, row: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
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

function gridSceneColumnWidth(column: number): number {
  let width = 0;
  for (let row = 0; row < gridSceneRowCount(column); row++) {
    const bounds = gridSceneBounds(column, row);
    width = Math.max(width, bounds.maxX - bounds.minX);
  }
  return width;
}

function gridSceneColumnX(column: number): number {
  let x = gridSceneColumnWidth(0) * 0.5 + 0.5;
  for (let index = 0; index < column; index++) {
    x += gridSceneColumnWidth(index) * 0.5 + GRID_SCENE_COLUMN_GAP + gridSceneColumnWidth(index + 1) * 0.5;
  }
  return x;
}

function gridSceneRowZ(column: number, row: number): number {
  let z = GRID_SCENE_START_Z;
  for (let index = 0; index < row; index++) {
    const bounds = gridSceneBounds(column, index);
    z -= bounds.maxZ - bounds.minZ + GRID_SCENE_SAMPLE_GAP;
  }
  return z;
}

/** `_get_column_sample_count`: the per-column row table. */
function gridSceneRowCount(column: number): number {
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

function gridSceneCenter(column: number, row: number): Vec3 {
  return referenceOffset([gridSceneColumnX(column), GRID_SCENE_Y, gridSceneRowZ(column, row)]);
}

/** `_get_color_sample_color`. */
function gridSceneColorSample(row: number): Color {
  if (row === 1) return [1, 0.85, 0.1, 0.35];
  if (row === 2) return [1, 0.45, 0.2, 1];
  if (row === 3) return [0.25, 0.6, 1, 1];
  return WHITE;
}

function gridSceneDraw(recorder: FrameRecorder, column: number, row: number, color: Color, width: number, normal?: Vec3): void {
  recorder.grid(gridSceneCenter(column, row), gridSceneCellCount(column, row), gridSceneSpacing(column, row), {
    color,
    width,
    rotation: gridSceneRotation(column, row),
    skew: gridSceneSkew(column, row),
    outer: gridSceneOuter(column, row),
    ...(normal === undefined ? {} : { normal }),
  });
}

function gridMatrix(recorder: FrameRecorder): void {
  drawAxes(recorder, referenceOffset([0, 0, 0]), IDENTITY_BASIS, 0.75, 2);

  // grid(width)
  GRID_SCENE_WIDTH_VALUES.forEach((width, row) => gridSceneDraw(recorder, 0, row, WHITE, width));
  // grid(cells)
  GRID_SCENE_CELL_VALUES.forEach((_cells, row) => gridSceneDraw(recorder, 1, row, [0.15, 0.85, 1, 0.95], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(spacing)
  GRID_SCENE_SPACING_VALUES.forEach((_spacing, row) => gridSceneDraw(recorder, 2, row, [0.7, 1, 0.25, 1], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(skew)
  GRID_SCENE_SKEW_VALUES.forEach((_skew, row) => gridSceneDraw(recorder, 3, row, [1, 0.45, 0.2, 1], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(outer)
  GRID_SCENE_OUTER_VALUES.forEach((_outer, row) => gridSceneDraw(recorder, 4, row, [1, 0.7, 0.2, 1], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(rotation)
  for (let row = 0; row < GRID_SCENE_ROTATION_COUNT; row++) gridSceneDraw(recorder, 5, row, [0.75, 0.45, 1, 1 - row * 0.08], GRID_SCENE_BASE_LINE_WIDTH);
  // grid(color)
  for (let row = 0; row < GRID_SCENE_COLOR_COUNT; row++) gridSceneDraw(recorder, 6, row, gridSceneColorSample(row), GRID_SCENE_BASE_LINE_WIDTH);
  // grid_n
  for (let row = 0; row < GRID_SCENE_NORMAL_COUNT; row++) gridSceneDraw(recorder, 7, row, normalSampleColor(row), normalSampleWidth(row, GRID_SCENE_BASE_LINE_WIDTH), [0, 1, 0]);
}

function translateMesh(mesh: MeshData, position: Vec3): MeshData {
  const move = (p: Vec3): Vec3 => [p[0] + position[0], p[1] + position[1], p[2] + position[2]];
  return { triangles: mesh.triangles.map(([a, b, c]) => [move(a), move(b), move(c)]), segments: mesh.segments.map(([a, b]) => [move(a), move(b)]) };
}

// ---------------------------------------------------------------------------
// Faithful Curve reference port (`examples/curve.gd`).
//
// The 3D curves are CubicBezier `Curve3D`s. `FrameRecorder.curve` only accepts a
// center + euler rotation, so the reference `Basis` transforms are baked into each
// curve's control points before recording.
// ---------------------------------------------------------------------------

const CURVE_LAYOUT = createLayout(SCENE_LAYOUTS.curve, SCENE_LAYOUTS.curve.baseY);
const CURVE_Y = SCENE_LAYOUTS.curve.baseY;
const CURVE_BASE_LINE_WIDTH = 2;
const CURVE_EMPHASIS_LINE_WIDTH = 8;
const CURVE_TOLERANCE_LENGTH = 0.08;
const CURVE_JOINT_TOLERANCE_LENGTH = 0.35;
const CONSTRUCTION_SAMPLE_Z = -0.45;
const CURVE_TUNNEL_DEPTH_STEP = 0.16;
const CURVE_TUNNEL_SCALE_STEP = 0.06;
const CURVE_TUNNEL_TWIST_STEP = Math.PI * 0.12;
const CURVE_SHAPE_VALUES: readonly number[] = [0.25, 0.65, 1, 1.35];
const CURVE_TOLERANCE_VALUES: readonly number[] = [0.04, 0.08, 0.16, 0.32];
const CURVE_CONSTRUCTION_COLOR: Color = [0.86, 0.94, 1, 1];
// `_draw_curve_control_points` marker constants from `curve.gd`.
const CURVE_ANCHOR_POINT_RADIUS = 0.045;
const CURVE_CONTROL_POINT_RADIUS = 0.032;
const CURVE_CONTROL_POINT_EDGE_WIDTH = 1;
const CURVE_CONTROL_POINT_SEGMENTS = 16;
const CURVE_ANCHOR_POINT_COLOR: Color = [1, 0.25, 0.85, 1];
const CURVE_CONTROL_POINT_COLOR: Color = [1, 0.75, 0.15, 1];
const CURVE_CONTROL_EDGE_COLOR: Color = [1, 0.75, 0.15, 0.85];
/**
 * `_get_curve_marker_rotation` for the identity construction transform: it swaps the Y and Z
 * basis columns (`Basis(x, z, y)`), which turns the circle's local XY plane into the world XZ
 * plane, so every marker is a horizontal ring around a point of the flat construction curve.
 */
const CURVE_MARKER_BASIS: CircleBasis = { x: [1, 0, 0], y: [0, 0, 1], z: [0, 1, 0] };

// `_create_*_curve` constructors, ported point-for-point (handles are relative offsets).
function straightCurve(): Curve3D {
  return curve([
    { position: [-0.5, 0, 0.18] },
    { position: [0, 0, -0.18] },
    { position: [0.5, 0, 0.18] },
  ]);
}

function smoothSymmetricCurve(shapeScale = 1): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.2 * shapeScale], out: [0.28, 0, -0.35 * shapeScale] },
    { position: [0, 0, -0.2 * shapeScale], in: [-0.28, 0, 0.35 * shapeScale], out: [0.28, 0, -0.35 * shapeScale] },
    { position: [0.55, 0, 0.2 * shapeScale], in: [-0.28, 0, 0.35 * shapeScale] },
  ]);
}

function flatHandleCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0], out: [0.32, 0, 0] },
    { position: [0.55, 0, 0], in: [-0.32, 0, 0] },
  ]);
}

function brokenCornerCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.18], out: [0.28, 0, -0.08] },
    { position: [0, 0, -0.24], in: [-0.18, 0, 0.34], out: [0.12, 0, 0.34] },
    { position: [0.55, 0, 0.18], in: [-0.28, 0, -0.08] },
  ]);
}

function oneSidedCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.18], out: [0.38, 0, -0.48] },
    { position: [0, 0, -0.16] },
    { position: [0.55, 0, 0.18], in: [-0.38, 0, -0.48] },
  ]);
}

function yCurve(): Curve3D {
  return curve([
    { position: [-0.55, -0.18, 0.18], out: [0.28, 0.36, -0.34] },
    { position: [0, 0.22, -0.18], in: [-0.28, -0.34, 0.34], out: [0.28, -0.34, -0.34] },
    { position: [0.55, -0.18, 0.18], in: [-0.28, 0.36, 0.34] },
  ]);
}

function cornerCurve(): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.24] },
    { position: [-0.15, 0, -0.24] },
    { position: [0.18, 0, 0.24] },
    { position: [0.55, 0, -0.24] },
  ]);
}

function closedCurve(shapeScale: number): Curve3D {
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

const CURVE_BASE = smoothSymmetricCurve();
const CURVE_CORNER = cornerCurve();
const CURVE_SHAPES: readonly Curve3D[] = CURVE_SHAPE_VALUES.map((shapeScale) => smoothSymmetricCurve(shapeScale));
const CURVE_CLOSED: readonly Curve3D[] = [smoothSymmetricCurve(), closedCurve(1), closedCurve(0.75), closedCurve(1.25)];
const CURVE_CONSTRUCTION: readonly Curve3D[] = [straightCurve(), smoothSymmetricCurve(), flatHandleCurve(), brokenCornerCurve(), oneSidedCurve(), yCurve(), closedCurve(1)];

/** Godot `_get_curve_rotation`: `Basis(width_axis, normal, depth_axis)`. */
function curveRotationBasis(normal: Vec3, angle: number): Basis3 {
  const n = normalizeVector(normal);
  const reference: Vec3 = Math.abs(n[0]) > 0.95 ? [0, 0, 1] : [1, 0, 0];
  const projection = reference[0] * n[0] + reference[1] * n[1] + reference[2] * n[2];
  const planar: Vec3 = [reference[0] - n[0] * projection, reference[1] - n[1] * projection, reference[2] - n[2] * projection];
  const widthAxis = normalizeVector(rotateAroundAxis(normalizeVector(planar), n, angle));
  const depthAxis = normalizeVector(crossVector(widthAxis, n));
  return { x: widthAxis, y: n, z: depthAxis };
}

/** `_get_rotation_tunnel_rotation(row)`. */
function curveTunnelBasis(row: number): Basis3 {
  const tilted = rotateAroundAxis([0, 1, 0], [1, 0, 0], -Math.PI * 0.38);
  const normal = normalizeVector(rotateAroundAxis(tilted, [0, 0, 1], row * CURVE_TUNNEL_TWIST_STEP));
  return curveRotationBasis(normal, row * Math.PI * 0.08);
}

/** `_get_rotation_tunnel_center`: lift the row, then recess it along -Z. */
function curveTunnelCenter(column: number, row: number): Vec3 {
  const center = CURVE_LAYOUT.atLocal(column, row);
  return referenceOffset([center[0], center[1] + 0.35, center[2] - row * CURVE_TUNNEL_DEPTH_STEP]);
}

/** Bakes a uniform scale + `Basis` into control points; only the translation is passed to `record`. */
function scaleCurve(shape: Curve3D, scale: number, basis: Basis3): Curve3D {
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

function placeCurve(
  recorder: FrameRecorder,
  shape: Curve3D,
  center: Vec3,
  options: LineOptions & { readonly tolerance: number },
  scale = 1,
  basis: Basis3 = IDENTITY_BASIS,
): void {
  recorder.curve(scaleCurve(shape, scale, basis), { ...options, transform: { center } });
}

/** Godot `Vector3.is_zero_approx`: every component under `CMP_EPSILON`. */
function isZeroApprox(value: Vec3): boolean {
  return Math.abs(value[0]) < 1e-5 && Math.abs(value[1]) < 1e-5 && Math.abs(value[2]) < 1e-5;
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Reference `_draw_curve_control_points` / `_draw_curve_control_handle`: for every Bezier
 * point of a construction curve, draw the incoming and outgoing handles as yellow edges with a
 * yellow ring at the tip, then the pink anchor ring on top. `localCenter` is untranslated
 * because `basisCirclePoints` applies the scene translation itself.
 */
function drawCurveControlPoints(recorder: FrameRecorder, shape: Curve3D, localCenter: Vec3): void {
  const ring = (local: Vec3, radius: number, color: Color): void => {
    recorder.lineStrip(
      basisCirclePoints(local, radius, CURVE_CONTROL_POINT_SEGMENTS, CURVE_MARKER_BASIS),
      { color, width: CURVE_BASE_LINE_WIDTH, joint: "round" },
      true,
    );
  };
  for (const point of shape.points) {
    const anchor = addVec3(localCenter, point.position);
    for (const handle of [point.in, point.out]) {
      if (handle === undefined || isZeroApprox(handle)) continue;
      const tip = addVec3(anchor, handle);
      recorder.line(referenceOffset(anchor), referenceOffset(tip), { color: CURVE_CONTROL_EDGE_COLOR, width: CURVE_CONTROL_POINT_EDGE_WIDTH });
      ring(tip, CURVE_CONTROL_POINT_RADIUS, CURVE_CONTROL_POINT_COLOR);
    }
    ring(anchor, CURVE_ANCHOR_POINT_RADIUS, CURVE_ANCHOR_POINT_COLOR);
  }
}

function curveMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = fposmod(context.time * DASH_OFFSET_SPEED, 10);

  // Construction band at CONSTRUCTION_SAMPLE_Z, including the reference control-point markers.
  CURVE_CONSTRUCTION.forEach((shape, index) => {
    const localCenter: Vec3 = [CURVE_LAYOUT.columnX(index), CURVE_Y, CONSTRUCTION_SAMPLE_Z];
    const center = referenceOffset(localCenter);
    recorder.curve(shape, { color: CURVE_CONSTRUCTION_COLOR, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH, joint: "round", transform: { center } });
    drawCurveControlPoints(recorder, shape, localCenter);
  });

  // curve(width)
  WIDTH_VALUES.forEach((width, row) => {
    placeCurve(recorder, CURVE_BASE, CURVE_LAYOUT.at(0, row), { color: WHITE, width, tolerance: CURVE_TOLERANCE_LENGTH });
  });
  // curve(shape)
  CURVE_SHAPES.forEach((shape, row) => {
    placeCurve(recorder, shape, CURVE_LAYOUT.at(1, row), { color: CYAN, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH });
  });
  // curve(transform)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CURVE_TUNNEL_SCALE_STEP;
    placeCurve(recorder, CURVE_BASE, curveTunnelCenter(2, row), { color: [0.7, 1, 0.25, 1 - row * 0.07], width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH }, scale, curveTunnelBasis(row));
  }
  // curve(tolerance)
  CURVE_TOLERANCE_VALUES.forEach((tolerance, row) => {
    placeCurve(recorder, CURVE_BASE, CURVE_LAYOUT.at(3, row), { color: GOLD, width: CURVE_BASE_LINE_WIDTH, tolerance });
  });
  // curve(closed)
  CURVE_CLOSED.forEach((shape, row) => {
    placeCurve(recorder, shape, CURVE_LAYOUT.at(4, row), { color: TEAL, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH, joint: "round" });
  });
  // curve(joint)
  JOINT_VALUES.forEach((joint, row) => {
    placeCurve(recorder, CURVE_CORNER, CURVE_LAYOUT.at(5, row), { color: VIOLET, width: CURVE_EMPHASIS_LINE_WIDTH, tolerance: CURVE_JOINT_TOLERANCE_LENGTH, joint });
  });
  // curve_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    placeCurve(recorder, CURVE_BASE, CURVE_LAYOUT.at(6, row), { color: ORANGE_FULL, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // curve_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    placeCurve(recorder, CURVE_CORNER, CURVE_LAYOUT.at(7, row), { color: PINK, width: CURVE_EMPHASIS_LINE_WIDTH, tolerance: CURVE_JOINT_TOLERANCE_LENGTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] });
  });
}

function circleMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = context.time * CIRCLE_DASH_SPEED;
  const flat = circleBasis([0, 1, 0], 0);
  const circle = (column: number, row: number, radius: number, segments: number, basis: CircleBasis = flat): Vec3[] =>
    basisCirclePoints(circleCenterLocal(column, row), radius, segments, basis);

  WIDTH_VALUES.forEach((width, row) => recorder.lineStrip(circle(0, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color: WHITE, width }, true));
  RADIUS_VALUES.forEach((radius, row) => recorder.lineStrip(circle(1, row, radius, CIRCLE_SEGMENTS), { color: CYAN, width: 2 }, true));
  SEGMENT_VALUES.forEach((segments, row) => recorder.lineStrip(circle(2, row, CIRCLE_RADIUS, segments), { color: LIME, width: 2 }, true));

  for (let row = 0; row < CIRCLE_ROTATION_SAMPLES; row++) {
    const tilted = rotateAroundAxis([0, 1, 0], [1, 0, 0], -Math.PI * 0.38);
    const normal = normalizeVector(rotateAroundAxis(tilted, [0, 0, 1], row * CIRCLE_TUNNEL_TWIST_STEP));
    const basis = circleBasis(normal, row * Math.PI * 0.08);
    const center: Vec3 = [circleColumnX(3), CIRCLE_Y + 0.35, CIRCLE_SAMPLE_START_Z - row * CIRCLE_ROW_SPACING - row * CIRCLE_TUNNEL_DEPTH_STEP];
    const scale = 1 - row * CIRCLE_TUNNEL_SCALE_STEP;
    recorder.lineStrip(basisCirclePoints(center, CIRCLE_TUNNEL_RADIUS * scale, CIRCLE_SEGMENTS, basis), { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: 2 }, true);
  }

  JOINT_VALUES.forEach((joint, row) => recorder.lineStrip(circle(4, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), { color: VIOLET, width: 8, joint }, true));
  DASH_VALUES.forEach(([dash, space], row) => recorder.lineStrip(circle(5, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color: ORANGE, width: 2, dash: [dash, space, dashOffset] }, true));
  JOINT_VALUES.forEach((joint, row) => recorder.lineStrip(circle(6, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), { color: [1, 0.3, 0.6, 1], width: 8, joint, dash: [0.18, 0.1, dashOffset] }, true));

  for (let row = 0; row < 4; row++) {
    const color: Color = row === 1 ? [0.25, 0.95, 0.9, 0.35] : row === 2 ? [1, 0.45, 0.2, 1] : TEAL;
    const width = row === 3 ? 10 : CIRCLE_BASE_WIDTH;
    drawCircleNormals(recorder, circle(7, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), CIRCLE_SEGMENTS, flat, { color, width, joint: "round" });
  }
  DASH_VALUES.forEach(([dash, space], row) => drawCircleNormals(recorder, circle(8, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), CIRCLE_SEGMENTS, flat, { color: TEAL, width: CIRCLE_BASE_WIDTH, dash: [dash, space, dashOffset], joint: "round" }));
  JOINT_VALUES.forEach((joint, row) => drawCircleNormals(recorder, circle(9, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), CIRCLE_JOINT_SEGMENTS, flat, { color: TEAL, width: 8, joint }));

  SEGMENT_VALUES.forEach((segments, row) => {
    const center = referenceOffset(circleCenterLocal(10, row));
    recorder.mesh(translateMesh(disc(CIRCLE_RADIUS, segments), center), { color: [0.25, 0.65, 1, 0.45], solid: true });
  });
}

// ---------------------------------------------------------------------------
// Faithful Arc reference port (`examples/arc.gd`).
// ---------------------------------------------------------------------------

const ARC_LAYOUT = createLayout(SCENE_LAYOUTS.arc, SCENE_LAYOUTS.arc.baseY);
const ARC_RADIUS = 0.34;
const ARC_ANGLE = Math.PI * 1.5;
const ARC_BASE_LINE_WIDTH = 2;
const ARC_EMPHASIS_LINE_WIDTH = 8;
const ARC_SEGMENT_COUNT = 64;
const ARC_JOINT_SEGMENT_COUNT = 12;
const ARC_ANGLE_VALUES: readonly number[] = [Math.PI * 0.5, Math.PI, Math.PI * 1.5, Math.PI * 2];
const ARC_TUNNEL_RADIUS = 0.44;
const ARC_TUNNEL_DEPTH_STEP = 0.16;
const ARC_TUNNEL_SCALE_STEP = 0.06;
const ARC_TUNNEL_TWIST_STEP = Math.PI * 0.12;
const FLAT_BASIS: CircleBasis = circleBasis([0, 1, 0], 0);

/** `_get_rotation_tunnel_rotation(row)`. */
function arcTunnelBasis(row: number): CircleBasis {
  const tilted = rotateAroundAxis([0, 1, 0], [1, 0, 0], -Math.PI * 0.38);
  const normal = normalizeVector(rotateAroundAxis(tilted, [0, 0, 1], row * ARC_TUNNEL_TWIST_STEP));
  return circleBasis(normal, row * Math.PI * 0.08);
}

/** `_get_rotation_tunnel_center`: lift the row, then recess it along -Z. */
function arcTunnelCenter(column: number, row: number): Vec3 {
  const center = ARC_LAYOUT.atLocal(column, row);
  return referenceOffset([center[0], center[1] + 0.35, center[2] - row * ARC_TUNNEL_DEPTH_STEP]);
}

function arcMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = fposmod(context.time * DASH_OFFSET_SPEED, 10);

  // arc(width)
  WIDTH_VALUES.forEach((width, row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(0, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: WHITE, width }, false);
  });
  // arc(radius)
  RADIUS_VALUES.forEach((radius, row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(1, row), radius, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: CYAN, width: ARC_BASE_LINE_WIDTH }, false);
  });
  // arc(angle)
  ARC_ANGLE_VALUES.forEach((angle, row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(2, row), ARC_RADIUS, angle, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: LIME, width: ARC_BASE_LINE_WIDTH }, false);
  });
  // arc(segments)
  SEGMENT_VALUES.forEach((segments, row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(3, row), ARC_RADIUS, ARC_ANGLE, segments, FLAT_BASIS), { color: GOLD, width: ARC_BASE_LINE_WIDTH }, false);
  });
  // arc(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * ARC_TUNNEL_SCALE_STEP;
    recorder.lineStrip(arcPoints(arcTunnelCenter(4, row), ARC_TUNNEL_RADIUS * scale, ARC_ANGLE, ARC_SEGMENT_COUNT, arcTunnelBasis(row)), { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: ARC_BASE_LINE_WIDTH }, false);
  }
  // arc(joint)
  JOINT_VALUES.forEach((joint, row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(5, row), ARC_RADIUS, ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS), { color: VIOLET, width: ARC_EMPHASIS_LINE_WIDTH, joint }, false);
  });
  // arc_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(6, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), { color: ORANGE_FULL, width: ARC_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] }, false);
  });
  // arc_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    recorder.lineStrip(arcPoints(ARC_LAYOUT.at(7, row), ARC_RADIUS, ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS), { color: PINK, width: ARC_EMPHASIS_LINE_WIDTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] }, false);
  });
  // arc_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawArcNormals(recorder, arcPoints(ARC_LAYOUT.at(8, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS, { color: normalSampleColor(row), width: normalSampleWidth(row, ARC_BASE_LINE_WIDTH), joint: "round" });
  }
  // arc_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawArcNormals(recorder, arcPoints(ARC_LAYOUT.at(9, row), ARC_RADIUS, ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS), ARC_ANGLE, ARC_SEGMENT_COUNT, FLAT_BASIS, { color: TEAL, width: ARC_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)], joint: "round" });
  });
  // arc_n(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawArcNormals(recorder, arcPoints(ARC_LAYOUT.at(10, row), ARC_RADIUS, ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS), ARC_ANGLE, ARC_JOINT_SEGMENT_COUNT, FLAT_BASIS, { color: TEAL, width: ARC_EMPHASIS_LINE_WIDTH, joint });
  });
}

function rectMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = context.time * DASH_OFFSET_SPEED;

  // rect(width)
  WIDTH_VALUES.forEach((width, row) => {
    recorder.lineStrip(rectLoop(RECT_LAYOUT.at(0, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: WHITE, width }, true);
  });
  // rect(size)
  RECT_SIZE_VALUES.forEach(([width, height], row) => {
    recorder.lineStrip(rectLoop(RECT_LAYOUT.at(1, row), RECT_FLAT_BASIS, width, height), { color: CYAN, width: RECT_BASE_LINE_WIDTH }, true);
  });
  // rect(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * RECT_ROTATION_TUNNEL_SCALE_STEP;
    const center = rectTunnelCenter(2, row, 0.35, RECT_ROTATION_TUNNEL_DEPTH_STEP);
    const basis = rectRotationTunnelBasis(row);
    const color: Color = [0.7, 1, 0.25, 1 - row * 0.07];
    recorder.lineStrip(rectLoop(center, basis, RECT_ROTATION_TUNNEL_WIDTH * scale, RECT_ROTATION_TUNNEL_HEIGHT * scale), { color, width: RECT_BASE_LINE_WIDTH }, true);
  }
  // rect(joint)
  JOINT_VALUES.forEach((joint, row) => {
    recorder.lineStrip(rectLoop(RECT_LAYOUT.at(3, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: VIOLET, width: 8, joint }, true);
  });
  // rect_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    recorder.lineStrip(rectLoop(RECT_LAYOUT.at(4, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: ORANGE_FULL, width: RECT_BASE_LINE_WIDTH, dash: [dash, space, dashOffset] }, true);
  });
  // rect_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    recorder.lineStrip(rectLoop(RECT_LAYOUT.at(5, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), { color: PINK, width: 8, dash: [0.18, 0.1, dashOffset], joint }, true);
  });
  // rect_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawRectNormals(recorder, rectLoop(RECT_LAYOUT.at(6, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), RECT_FLAT_BASIS, { color: normalSampleColor(row), width: normalSampleWidth(row, RECT_BASE_LINE_WIDTH), joint: "round" });
  }
  // rect_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawRectNormals(recorder, rectLoop(RECT_LAYOUT.at(7, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), RECT_FLAT_BASIS, { color: TEAL, width: RECT_BASE_LINE_WIDTH, dash: [dash, space, dashOffset], joint: "round" });
  });
  // rect_n(joint)
  JOINT_VALUES.forEach((joint, row) => {
    drawRectNormals(recorder, rectLoop(RECT_LAYOUT.at(8, row), RECT_FLAT_BASIS, RECT_WIDTH, RECT_HEIGHT), RECT_FLAT_BASIS, { color: TEAL, width: RECT_EMPHASIS_LINE_WIDTH, joint });
  });
  // rect_s(solid)
  for (let row = 0; row < RECT_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * RECT_S_TUNNEL_SCALE_STEP;
    const hue = row / RECT_S_SAMPLE_COUNT + 0.6;
    const center = rectTunnelCenter(9, row, 0.5, RECT_S_TUNNEL_DEPTH_STEP);
    const basis = rectSolidBasis(row);
    const color = fromHsv(hue, 0.7, 1, 1 - row * 0.08);
    recorder.mesh(rectMesh(center, basis, RECT_S_TUNNEL_WIDTH * scale, RECT_S_TUNNEL_HEIGHT * scale), { color, solid: true });
  }
}

function boxMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = context.time * DASH_OFFSET_SPEED;

  // box(width)
  WIDTH_VALUES.forEach((width, row) => {
    drawBox(recorder, boxCenter(0, row), IDENTITY_BASIS, BOX_SIZE, { color: WHITE, width });
  });
  // box(size)
  BOX_SIZE_VALUES.forEach((size, row) => {
    drawBox(recorder, boxCenter(1, row), IDENTITY_BASIS, size, { color: CYAN, width: BOX_BASE_LINE_WIDTH });
  });
  // box(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * BOX_ROTATION_TUNNEL_SCALE_STEP;
    const center = boxTunnelCenter(2, row, BOX_ROTATION_TUNNEL_Y, BOX_ROTATION_TUNNEL_DEPTH_STEP);
    const color: Color = [0.7, 1, 0.25, 1 - row * 0.07];
    drawBox(recorder, center, boxRotationTunnelBasis(row), scaleVec(BOX_ROTATION_TUNNEL_SIZE, scale), { color, width: BOX_BASE_LINE_WIDTH });
  }
  // box_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawBox(recorder, boxCenter(3, row), IDENTITY_BASIS, BOX_SIZE, { color: ORANGE_FULL, width: BOX_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // box_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    drawBoxNormals(recorder, boxCenter(4, row), IDENTITY_BASIS, BOX_SIZE, { color: normalSampleColor(row), width: normalSampleWidth(row, BOX_BASE_LINE_WIDTH) });
  }
  // box_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    drawBoxNormals(recorder, boxCenter(5, row), IDENTITY_BASIS, BOX_SIZE, { color: TEAL, width: BOX_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // box_s(solid): the reference also overlays the normal-aware wireframe.
  for (let row = 0; row < BOX_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * BOX_S_TUNNEL_SCALE_STEP;
    const hue = row / BOX_S_SAMPLE_COUNT + 0.6;
    const center = boxTunnelCenter(6, row, BOX_S_TUNNEL_Y, BOX_S_TUNNEL_DEPTH_STEP);
    const basis = boxSolidBasis(row);
    const size = scaleVec(BOX_S_TUNNEL_SIZE, scale);
    recorder.mesh(transformMeshByBasis(box(size), center, basis), { color: fromHsv(hue, 0.7, 1, 0.35), solid: true });
    drawBox(recorder, center, basis, size, { color: fromHsv(hue, 0.7, 1, 1), width: BOX_BASE_LINE_WIDTH });
  }
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
// Approximations (also noted in `docs/godot-debug-draw-parity.md`):
// - `Label3D` column and sample labels are omitted; the gallery draws its own.
// - `draw_curve` uses a fixed `tolerance` instead of adaptive `max_stages` sampling.
// - Arrow heads keep the flat X-strip approximation shared with `arrow.gd`.
// - `draw_grid`/`draw_grid_n` use the library grid, whose skew shear and outer
//   edge semantics are the port's own (see the grid scene note).
// - Normal-aware columns pass one representative normal; cone/cylinder/capsule
//   use one segment count for the base ring and the side lines.
// ---------------------------------------------------------------------------

const INDEX_LAYOUT = createLayout(SCENE_LAYOUTS.index, SCENE_LAYOUTS.index.baseY);
const INDEX_DASH_WIDTH = 0.16;
const INDEX_DASH_SPACE = 0.09;
const INDEX_DASH_OFFSET = 0;
const WSW_LINE_WIDTH_SCALE = 0.01;
const INDEX_UP: Vec3 = [0, 1, 0];
const INDEX_BRIGHT_CYAN: Color = [0.35, 1, 1, 1];
const INDEX_GOLD: Color = [1, 0.75, 0.25, 1];
const INDEX_MINT: Color = [0.5, 1, 0.65, 1];
const INDEX_MAGENTA: Color = [1, 0.45, 1, 1];
const INDEX_LAVENDER: Color = [0.7, 0.7, 1, 1];

/** `index.gd` `_p(column, row, x_offset, z_offset, y)` with the capture translation applied. */
function indexPath(column: number, row: number, xOffset = 0, zOffset = 0, y: number = SCENE_LAYOUTS.index.baseY): Vec3 {
  const local = INDEX_LAYOUT.atLocal(column, row);
  return referenceOffset([local[0] + xOffset, y, local[2] + zOffset]);
}

/** `index.gd`'s `_curve` control points (three cubic Bezier anchors). */
const INDEX_CURVE: Curve3D = curve([
  { position: [-0.45, -0.15, 0], in: [0, 0, 0], out: [0.25, 0.4, 0] },
  { position: [0.15, 0.25, 0.25], in: [-0.25, 0.35, 0], out: [0.25, -0.35, 0] },
  { position: [0.65, -0.15, 0.45], in: [-0.25, -0.35, 0], out: [0, 0, 0] },
]);

/** `draw_line_list`: independent segments taken as consecutive point pairs. */
function drawLineList(recorder: FrameRecorder, points: readonly Vec3[], options: LineOptions): void {
  for (let index = 0; index + 1 < points.length; index += 2) recorder.line(points[index]!, points[index + 1]!, options);
}

type ApiMatrixConfig = {
  readonly width: (pixels: number) => number;
  readonly widthMode: NonNullable<LineOptions["widthMode"]>;
  readonly solids: boolean;
};

function apiMatrix(recorder: FrameRecorder, config: ApiMatrixConfig): void {
  const { width: w, widthMode, solids } = config;
  const dash: readonly [number, number, number] = [INDEX_DASH_WIDTH, INDEX_DASH_SPACE, INDEX_DASH_OFFSET];

  drawAxes(recorder, referenceOffset([0, 0, 0]), IDENTITY_BASIS, 0.75, w(2), widthMode);

  // line
  recorder.line(indexPath(0, 0), indexPath(0, 0, 1, 0, 0.9), { color: WHITE, width: w(2), widthMode });
  recorder.line(indexPath(0, 1), indexPath(0, 1, 1, 0, 0.9), { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, normal: INDEX_UP });
  recorder.line(indexPath(0, 2), indexPath(0, 2, 1, 0, 0.9), { color: INDEX_GOLD, width: w(2), widthMode, dash });
  recorder.line(indexPath(0, 3), indexPath(0, 3, 1, 0, 0.9), { color: INDEX_MINT, width: w(2), widthMode, normal: INDEX_UP, dash });

  // ray
  const ray = (row: number, options: LineOptions): void => {
    const origin = indexPath(1, row);
    recorder.line(origin, [origin[0] + 1, origin[1] + 0.35, origin[2]], options);
  };
  ray(0, { color: WHITE, width: w(2), widthMode });
  ray(1, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, normal: INDEX_UP });
  ray(2, { color: INDEX_GOLD, width: w(2), widthMode, dash });
  ray(3, { color: INDEX_MINT, width: w(2), widthMode, normal: INDEX_UP, dash });

  // arrow
  drawArrowHead(recorder, indexPath(2, 0, 1, 0, 0.9), [0.55, 0.2, 0], { color: WHITE, width: w(2), widthMode, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "round" });
  drawArrowHead(recorder, indexPath(2, 1, 1, 0, 0.9), [0.55, 0.2, 0], { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "bevel", normal: INDEX_UP });
  drawArrowLine(recorder, indexPath(2, 2), indexPath(2, 2, 1, 0, 0.9), { color: INDEX_GOLD, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "round" });
  drawArrowLine(recorder, indexPath(2, 3), indexPath(2, 3, 1, 0, 0.9), { color: INDEX_MINT, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "bevel", normal: INDEX_UP });
  drawArrowLine(recorder, indexPath(2, 4), indexPath(2, 4, 1, 0, 0.9), { color: INDEX_MAGENTA, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "miter", dash });
  drawArrowLine(recorder, indexPath(2, 5), indexPath(2, 5, 1, 0, 0.9), { color: INDEX_LAVENDER, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "round", normal: INDEX_UP, dash });

  // axes
  drawAxes(recorder, indexPath(3, 0, 0.5), IDENTITY_BASIS, 0.55, w(2), widthMode);
  drawAxesN(recorder, indexPath(3, 1, 0.5), rotateBasis(IDENTITY_BASIS, INDEX_UP, Math.PI * 0.25), 0.55, w(2), widthMode);

  // line_list
  const listPoints = (column: number, row: number): Vec3[] => [
    indexPath(column, row),
    indexPath(column, row, 0.8, 0, 0.85),
    indexPath(column, row, 0.1, 0.35),
    indexPath(column, row, 0.9, 0.35, 0.85),
  ];
  drawLineList(recorder, listPoints(4, 0), { color: WHITE, width: w(2), widthMode });
  drawLineList(recorder, listPoints(4, 1), { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, normal: INDEX_UP });

  // strip
  const stripPoints = (column: number, row: number): Vec3[] => [indexPath(column, row), indexPath(column, row, 0.45, 0.18, 0.95), indexPath(column, row, 1, 0, 0.7)];
  recorder.lineStrip(stripPoints(5, 0), { color: WHITE, width: w(4), widthMode, joint: "round" }, false);
  recorder.lineStrip(stripPoints(5, 1), { color: INDEX_BRIGHT_CYAN, width: w(4), widthMode, joint: "bevel", normal: INDEX_UP }, false);
  recorder.lineStrip(stripPoints(5, 2), { color: INDEX_GOLD, width: w(4), widthMode, joint: "miter", dash }, false);
  recorder.lineStrip(stripPoints(5, 3), { color: INDEX_MINT, width: w(4), widthMode, joint: "round", normal: INDEX_UP, dash }, false);

  // loop
  const loopPoints = (column: number, row: number): Vec3[] => [indexPath(column, row), indexPath(column, row, 0.55, 0.25, 0.95), indexPath(column, row, 1, 0, 0.65)];
  recorder.lineStrip(loopPoints(6, 0), { color: WHITE, width: w(4), widthMode, joint: "round" }, true);
  recorder.lineStrip(loopPoints(6, 1), { color: INDEX_BRIGHT_CYAN, width: w(4), widthMode, joint: "bevel", normal: INDEX_UP }, true);
  recorder.lineStrip(loopPoints(6, 2), { color: INDEX_GOLD, width: w(4), widthMode, joint: "miter", dash }, true);
  recorder.lineStrip(loopPoints(6, 3), { color: INDEX_MINT, width: w(4), widthMode, joint: "round", normal: INDEX_UP, dash }, true);

  // curve
  recorder.curve(INDEX_CURVE, { color: WHITE, width: w(2.5), widthMode, tolerance: 0.04, joint: "round", transform: { center: indexPath(7, 0, 0.5, 0, 0.65) } });
  recorder.curve(INDEX_CURVE, { color: INDEX_GOLD, width: w(2.5), widthMode, tolerance: 0.04, joint: "bevel", dash, transform: { center: indexPath(7, 1, 0.5, 0, 0.65) } });

  // grid
  recorder.grid(indexPath(8, 0, 0.5, 0, 0.05), [4, 3], [0.25, 0.25], { color: WHITE, width: w(1.5), widthMode, outer: "xz", skew: [0, 0] });
  recorder.grid(indexPath(8, 1, 0.5), [4, 3], [0.25, 0.25], { color: INDEX_BRIGHT_CYAN, width: w(1.5), widthMode, rotation: [Math.PI * 0.5, 0, 0], outer: "xz", skew: [0, 0], normal: INDEX_UP });

  // rect: base, [solid], normal, dashed, normal + dashed
  // `index.gd` passes `Quaternion.IDENTITY` for this column, so the rect lies in the XY plane
  // rather than the ground plane (unlike `rect.gd`, whose own flat basis is the XZ plane).
  let rectRow = 0;
  const rectAt = (row: number): Vec3[] => rectLoop(indexPath(9, row, 0.5), IDENTITY_BASIS, 0.8, 0.5);
  recorder.lineStrip(rectAt(rectRow++), { color: WHITE, width: w(2), widthMode, joint: "round" }, true);
  if (solids) recorder.mesh(rectMesh(indexPath(9, rectRow++, 0.5), IDENTITY_BASIS, 0.8, 0.5), { color: [1, 0.25, 0.25, 0.45], solid: true });
  drawRectNormals(recorder, rectAt(rectRow++), IDENTITY_BASIS, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" });
  recorder.lineStrip(rectAt(rectRow++), { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, true);
  drawRectNormals(recorder, rectAt(rectRow++), IDENTITY_BASIS, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash });

  // box: base, [solid], normal, dashed, normal + dashed
  const boxSize: Vec3 = [0.7, 0.7, 0.7];
  let boxRow = 0;
  const wireBox = (row: number, options: LineOptions): void => {
    drawBox(recorder, indexPath(10, row, 0.5), IDENTITY_BASIS, boxSize, options);
  };
  const wireBoxNormals = (row: number, options: LineOptions): void => {
    drawBoxNormals(recorder, indexPath(10, row, 0.5), IDENTITY_BASIS, boxSize, options);
  };
  wireBox(boxRow++, { color: WHITE, width: w(2), widthMode });
  if (solids) recorder.mesh(transformMeshByBasis(box(boxSize), indexPath(10, boxRow++, 0.5), IDENTITY_BASIS), { color: [1, 0.45, 0.2, 0.35], solid: true });
  wireBoxNormals(boxRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode });
  wireBox(boxRow++, { color: INDEX_GOLD, width: w(2), widthMode, dash });
  wireBoxNormals(boxRow++, { color: INDEX_MINT, width: w(2), widthMode, dash });

  // circle: base, [solid], normal, dashed, normal + dashed
  // `Quaternion.IDENTITY` in `index.gd` puts this column in the XY plane as well, so the ring and
  // its solid fan are vertical here while `circle.gd`'s own flat basis stays on the ground.
  let circleRow = 0;
  const circleRing = (row: number): Vec3[] => circlePoints(indexPath(11, row, 0.5), 0.4, 32, IDENTITY_BASIS);
  recorder.lineStrip(circleRing(circleRow++), { color: WHITE, width: w(2), widthMode, joint: "round" }, true);
  if (solids) recorder.mesh(circleSolidMesh(0.4, 32, indexPath(11, circleRow++, 0.5), IDENTITY_BASIS), { color: [0.25, 0.65, 1, 0.45], solid: true });
  drawCircleNormals(recorder, circleRing(circleRow++), 32, IDENTITY_BASIS, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" });
  recorder.lineStrip(circleRing(circleRow++), { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, true);
  drawCircleNormals(recorder, circleRing(circleRow++), 32, IDENTITY_BASIS, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash });

  // arc
  const arcAt = (row: number): Vec3[] => arcPoints(indexPath(12, row, 0.5), 0.45, Math.PI * 1.25, 32, IDENTITY_BASIS);
  recorder.lineStrip(arcAt(0), { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  drawArcNormals(recorder, arcAt(1), Math.PI * 1.25, 32, IDENTITY_BASIS, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" });
  recorder.lineStrip(arcAt(2), { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, false);
  drawArcNormals(recorder, arcAt(3), Math.PI * 1.25, 32, IDENTITY_BASIS, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash });

  // sphere: base, [solid], normal, dashed, normal + dashed
  const sphereAt = (row: number): ShapeWire => sphereWire(0.4, 32, 2, 2, indexPath(13, row, 0.5), IDENTITY_BASIS);
  const wireSphere = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = sphereAt(row);
    drawShapeWire(recorder, shape, options, normalAware ? sphereWireNormals(indexPath(13, row, 0.5), shape) : undefined);
  };
  let sphereRow = 0;
  wireSphere(sphereRow++, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  if (solids) recorder.mesh(sphereSolidMesh(0.4, indexPath(13, sphereRow++, 0.5), IDENTITY_BASIS), { color: [0.35, 0.75, 1, 0.35], solid: true });
  wireSphere(sphereRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);
  wireSphere(sphereRow++, { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, false);
  wireSphere(sphereRow++, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash }, true);

  // cone: base, [solid], normal
  const coneAt = (row: number): ShapeWire => coneWire(0.35, 0.8, 32, 8, indexPath(14, row, 0.5), IDENTITY_BASIS);
  const wireCone = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = coneAt(row);
    drawShapeWire(recorder, shape, options, normalAware ? coneWireNormals(shape, 0.35, 0.8, 8, IDENTITY_BASIS) : undefined);
  };
  let coneRow = 0;
  wireCone(coneRow++, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  if (solids) recorder.mesh(coneSolidMesh(0.35, 0.8, indexPath(14, coneRow++, 0.5), IDENTITY_BASIS), { color: [1, 0.45, 0.25, 0.35], solid: true });
  wireCone(coneRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);

  // cylinder: base, [solid], normal
  const cylinderAt = (row: number): ShapeWire => cylinderWire(0.35, 0.4, 32, 8, indexPath(15, row, 0.5), IDENTITY_BASIS);
  const wireCylinder = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = cylinderAt(row);
    drawShapeWire(recorder, shape, options, normalAware ? cylinderWireNormals(shape, 0.35, 0.4, 8, IDENTITY_BASIS) : undefined);
  };
  let cylinderRow = 0;
  wireCylinder(cylinderRow++, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  if (solids) recorder.mesh(cylinderSolidMesh(0.35, 0.4, indexPath(15, cylinderRow++, 0.5), IDENTITY_BASIS), { color: [0.6, 0.45, 1, 0.35], solid: true });
  wireCylinder(cylinderRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);

  // capsule: base, normal
  const capsuleAt = (row: number): ShapeWire => capsuleWire(0.32, 0.45, 32, 2, indexPath(16, row, 0.5), IDENTITY_BASIS);
  const wireCapsule = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = capsuleAt(row);
    drawShapeWire(recorder, shape, options, normalAware ? capsuleWireNormals(shape, 0.45, indexPath(16, row, 0.5), IDENTITY_BASIS) : undefined);
  };
  wireCapsule(0, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  wireCapsule(1, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);
}

/** `index.gd`: screen-space widths, with the `*_s` solid columns. */
function indexMatrix(recorder: FrameRecorder): void {
  apiMatrix(recorder, { width: (pixels) => pixels, widthMode: "screen", solids: true });
}

// ---------------------------------------------------------------------------
// Faithful Sphere/Cone/Cylinder/Capsule reference ports.
//
// `examples/sphere.gd`, `cone.gd`, `cylinder.gd` and `capsule.gd` share the same
// structure: per-column centres, a rotation tunnel and (except for capsule) a
// solid `*_s` column that draws a `from_hsv` mesh plus the normal-aware
// wireframe. Capsule deliberately has no solid column in the reference.
//
// The wireframe topology is the reference's, not a mesh's: `sphere` emits one latitude
// ring per `y_axis_segment_count` step plus one meridian great circle per
// `z_axis_segment_count` step, `capsule` emits two rings plus `side_segment_count` closed
// silhouettes, `cone`/`cylinder` emit their rings plus `side_segment_count` side lines.
// The generators for that live in `geometry-generators.ts`; this file only places them.
// ---------------------------------------------------------------------------

/**
 * Draws a reference shape wireframe.
 *
 * The reference emits one `draw_line_loop` per ring and a `draw_line_list` for the side
 * lines, so a closed path keeps its joints and its accumulated dash phase; drawing the
 * same points as independent segments would restart the dash pattern per edge.
 */
function drawShapeWire(recorder: FrameRecorder, shape: ShapeWire, options: LineOptions, normals?: ShapeNormals): void {
  shape.loops.forEach((loop, index) => {
    // Reference `draw_line_loop_n`: each ring joins and dashes with the normals it carries,
    // while a plain ring keeps the flat style (`normal` is undefined there).
    const loopNormals = normals?.loops?.[index];
    recorder.lineStrip(loop, loopNormals === undefined ? options : { ...options, normals: loopNormals }, true);
  });
  shape.lines.forEach(([a, b], index) => {
    const lineNormal = normals?.lines?.[index];
    recorder.line(a, b, lineNormal === undefined ? options : { ...options, normal: lineNormal });
  });
}

/** Reference `_emit_sphere_s` emits a `SphereMesh` (64 radial segments, 32 rings). */
function sphereSolidMesh(radius: number, center: Vec3, basis: Basis3): MeshData {
  return transformMeshByBasis(sphere(radius, 64, 32), center, basis);
}

/** Only the cone/cylinder segment tables differ from the shared sphere values. */
const SHAPE_SEGMENT_VALUES = [3, 4, 8, 16] as const;

/** Per-loop and per-line normals for the reference `*_n` entry points. */
type ShapeNormals = {
  readonly loops?: readonly (readonly Vec3[])[];
  readonly lines?: readonly Vec3[];
};

function shapeScene(recorder: FrameRecorder, id: string, context: SceneContext): void {
  if (id === "sphere") sphereShape(recorder, context);
  else if (id === "cone") coneShape(recorder);
  else if (id === "cylinder") cylinderShape(recorder);
  else capsuleShape(recorder);
}

// --- Sphere ---------------------------------------------------------------

const SPHERE_LAYOUT = createLayout(SCENE_LAYOUTS.sphere, SCENE_LAYOUTS.sphere.baseY);
const SPHERE_BASE_Y = SCENE_LAYOUTS.sphere.baseY;
const SPHERE_RADIUS = 0.30;
const SPHERE_BASE_LINE_WIDTH = 2;
const SPHERE_JOINT_LINE_WIDTH = 8;
const SPHERE_SEGMENT_COUNT = 48;
const SPHERE_JOINT_SEGMENT_COUNT = 16;
const SPHERE_AXIS_SEGMENT_COUNT = 2;
const SPHERE_Y_AXIS_SEGMENT_VALUES = [0, 1, 2, 6] as const;
const SPHERE_Z_AXIS_SEGMENT_VALUES = [0, 1, 2, 6] as const;
const SPHERE_ROTATION_TUNNEL_RADIUS = 0.42;
const SPHERE_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const SPHERE_ROTATION_TUNNEL_SCALE_STEP = 0.05;
const SPHERE_ROTATION_TUNNEL_Y = 0.35;
const SPHERE_S_SAMPLE_COUNT = 8;
const SPHERE_S_TUNNEL_RADIUS = 0.42;
const SPHERE_S_TUNNEL_DEPTH_STEP = 0.16;
const SPHERE_S_TUNNEL_SCALE_STEP = 0.05;
const SPHERE_S_TUNNEL_Y = 0.35;

/** `_get_column_radius`: the radius row plus the two shrinking tunnels. */
function sphereColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 5) return SPHERE_ROTATION_TUNNEL_RADIUS * (1 - row * SPHERE_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 13) return SPHERE_S_TUNNEL_RADIUS * (1 - row * SPHERE_S_TUNNEL_SCALE_STEP);
  return SPHERE_RADIUS;
}

/** `_get_sphere_center`: the sphere rests on `SPHERE_Y`, so its centre rises with the radius. */
function sphereCenter(column: number, row: number): Vec3 {
  return referenceOffset([SPHERE_LAYOUT.columnX(column), SPHERE_BASE_Y + sphereColumnRadius(column, row), SPHERE_LAYOUT.rowZ(column, row)]);
}

function sphereTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = sphereCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}

/** `_get_rotation_tunnel_rotation` / `_get_sphere_s_tunnel_rotation` (identical). */
function sphereTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.35);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

/** `draw_sphere`: latitude rings (`yAxis`) plus meridian great circles (`zAxis`). */
function sphereWireAt(radius: number, segments: number, yAxis: number, zAxis: number, center: Vec3, basis: Basis3): ShapeWire {
  return sphereWire(radius, segments, yAxis, zAxis, center, basis);
}

/** `draw_sphere_n`: every ring shaded from the sphere centre (`_get_sphere_ring_normals`). */
function sphereWireNormals(center: Vec3, shape: ShapeWire): ShapeNormals {
  return { loops: shape.loops.map((loop) => sphereRingNormals(center, loop)) };
}

function sphereShape(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = context.time * DASH_OFFSET_SPEED;
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(recorder, shape, options);
  const base = (column: number, row: number, segments = SPHERE_SEGMENT_COUNT, yAxis = SPHERE_AXIS_SEGMENT_COUNT, zAxis = SPHERE_AXIS_SEGMENT_COUNT): ShapeWire =>
    sphereWireAt(sphereColumnRadius(column, row), segments, yAxis, zAxis, sphereCenter(column, row), IDENTITY_BASIS);
  // `draw_sphere_n`: every ring (latitude ring and great circle alike) is shaded from the
  // sphere centre, which is exactly what `_get_sphere_ring_normals` computes.
  const wireNormal = (column: number, row: number, options: LineOptions, segments = SPHERE_SEGMENT_COUNT, yAxis = SPHERE_AXIS_SEGMENT_COUNT, zAxis = SPHERE_AXIS_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, yAxis, zAxis);
    const center = sphereCenter(column, row);
    drawShapeWire(recorder, shape, options, { loops: shape.loops.map((loop) => sphereRingNormals(center, loop)) });
  };

  // sphere(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // sphere(radius)
  RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(segments)
  SEGMENT_VALUES.forEach((segments, row) => wire(base(2, row, segments), { color: LIME, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(y axis)
  SPHERE_Y_AXIS_SEGMENT_VALUES.forEach((yAxis, row) => wire(base(3, row, SPHERE_SEGMENT_COUNT, yAxis), { color: GOLD, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(z axis)
  SPHERE_Z_AXIS_SEGMENT_VALUES.forEach((zAxis, row) => wire(base(4, row, SPHERE_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, zAxis), { color: ORANGE_FULL, width: SPHERE_BASE_LINE_WIDTH }));
  // sphere(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * SPHERE_ROTATION_TUNNEL_SCALE_STEP;
    const shape = sphereWireAt(SPHERE_ROTATION_TUNNEL_RADIUS * scale, SPHERE_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, sphereTunnelCenter(5, row, SPHERE_ROTATION_TUNNEL_Y, SPHERE_ROTATION_TUNNEL_DEPTH_STEP), sphereTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: SPHERE_BASE_LINE_WIDTH });
  }
  // sphere(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, SPHERE_JOINT_SEGMENT_COUNT), { color: VIOLET, width: SPHERE_JOINT_LINE_WIDTH, joint }));
  // sphere_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => wire(base(7, row), { color: ORANGE_FULL, width: SPHERE_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)] }));
  // sphere_d(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(8, row, SPHERE_JOINT_SEGMENT_COUNT), { color: PINK, width: SPHERE_JOINT_LINE_WIDTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] }));
  // sphere_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(9, row, { color: normalSampleColor(row), width: normalSampleWidth(row, SPHERE_BASE_LINE_WIDTH), joint: "round" });
  }
  // sphere_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(10, row, { color: TEAL, width: SPHERE_JOINT_LINE_WIDTH, joint }, SPHERE_JOINT_SEGMENT_COUNT));
  // sphere_n_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => wireNormal(11, row, { color: TEAL, width: SPHERE_BASE_LINE_WIDTH, dash: [dash, space, fposmod(dashOffset, dash + space)], joint: "round" }));
  // sphere_n_d(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(12, row, { color: TEAL, width: SPHERE_JOINT_LINE_WIDTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] }, SPHERE_JOINT_SEGMENT_COUNT));
  // sphere_s(solid): the reference draws the `SphereMesh` and overlays the wireframe.
  for (let row = 0; row < SPHERE_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * SPHERE_S_TUNNEL_SCALE_STEP;
    const center = sphereTunnelCenter(13, row, SPHERE_S_TUNNEL_Y, SPHERE_S_TUNNEL_DEPTH_STEP);
    const basis = sphereTunnelBasis(row);
    const radius = SPHERE_S_TUNNEL_RADIUS * scale;
    const shape = sphereWireAt(radius, SPHERE_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, SPHERE_AXIS_SEGMENT_COUNT, center, basis);
    recorder.mesh(sphereSolidMesh(radius, center, basis), { color: fromHsv(row / SPHERE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 0.35), solid: true });
    drawShapeWire(recorder, shape, { color: fromHsv(row / SPHERE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 1), width: SPHERE_BASE_LINE_WIDTH }, sphereWireNormals(center, shape));
  }
}

// --- Cone -----------------------------------------------------------------

const CONE_LAYOUT = createLayout(SCENE_LAYOUTS.cone, SCENE_LAYOUTS.cone.baseY);
const CONE_BASE_Y = SCENE_LAYOUTS.cone.baseY;
const CONE_RADIUS = 0.28;
const CONE_HEIGHT = 0.7;
const CONE_BASE_LINE_WIDTH = 2;
const CONE_JOINT_LINE_WIDTH = 8;
const CONE_SEGMENT_COUNT = 16;
const CONE_SIDE_SEGMENT_COUNT = 8;
const CONE_JOINT_SEGMENT_COUNT = 8;
const CONE_JOINT_SIDE_SEGMENT_COUNT = 8;
const CONE_HEIGHT_VALUES = [0.45, 0.65, 0.85, 1.05] as const;
const CONE_ROTATION_TUNNEL_RADIUS = 0.34;
const CONE_ROTATION_TUNNEL_HEIGHT = 0.82;
const CONE_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const CONE_ROTATION_TUNNEL_SCALE_STEP = 0.05;
const CONE_ROTATION_TUNNEL_Y = 0.35;
const CONE_S_SAMPLE_COUNT = 8;
const CONE_S_TUNNEL_RADIUS = 0.34;
const CONE_S_TUNNEL_HEIGHT = 0.82;
const CONE_S_TUNNEL_DEPTH_STEP = 0.16;
const CONE_S_TUNNEL_SCALE_STEP = 0.05;
const CONE_S_TUNNEL_Y = 0.35;

/** `_get_column_radius`: the radius row plus the rotation/solid tunnels. */
function coneColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 5) return CONE_ROTATION_TUNNEL_RADIUS * (1 - row * CONE_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CONE_S_TUNNEL_RADIUS * (1 - row * CONE_S_TUNNEL_SCALE_STEP);
  return CONE_RADIUS;
}

/** `_get_column_height`: the height row plus the rotation/solid tunnels. */
function coneColumnHeight(column: number, row: number): number {
  if (column === 2) return CONE_HEIGHT_VALUES[row]!;
  if (column === 5) return CONE_ROTATION_TUNNEL_HEIGHT * (1 - row * CONE_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CONE_S_TUNNEL_HEIGHT * (1 - row * CONE_S_TUNNEL_SCALE_STEP);
  return CONE_HEIGHT;
}

/** `_get_cone_center`: the cone base stays at `CONE_BASE_Y`, so the centre rises with half the height. */
function coneCenter(column: number, row: number): Vec3 {
  return referenceOffset([CONE_LAYOUT.columnX(column), CONE_BASE_Y + coneColumnHeight(column, row) * 0.5, CONE_LAYOUT.rowZ(column, row)]);
}

function coneTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = coneCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}

/** `_get_rotation_tunnel_rotation` / `_get_cone_s_tunnel_rotation` (identical). */
function coneTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.26);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

function coneWireAt(radius: number, height: number, segments: number, sideSegments: number, center: Vec3, basis: Basis3): ShapeWire {
  return coneWire(radius, height, segments, sideSegments, center, basis);
}

/** Reference `_emit_cone_s` emits a `CylinderMesh` (`top_radius = 0`). */
function coneSolidMesh(radius: number, height: number, center: Vec3, basis: Basis3): MeshData {
  return transformMeshByBasis(cone(radius, height, 64), center, basis);
}

/**
 * `draw_cone_n`: the base ring uses `_get_circle_normals` on the cone's base basis, the side
 * lines use `_get_cone_side_line_normals` (one tilted normal per line).
 */
function coneWireNormals(shape: ShapeWire, radius: number, height: number, sideSegments: number, basis: Basis3): ShapeNormals {
  const ringNormals = circleNormals(shape.loops[0]?.length ?? 0, coneBaseBasis(basis));
  return {
    loops: shape.loops.map(() => ringNormals),
    lines: coneSideLineNormals(radius, height, sideSegments, basis),
  };
}

function coneShape(recorder: FrameRecorder): void {
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(recorder, shape, options);
  const base = (column: number, row: number, segments = CONE_SEGMENT_COUNT, sideSegments = CONE_SIDE_SEGMENT_COUNT): ShapeWire =>
    coneWireAt(coneColumnRadius(column, row), coneColumnHeight(column, row), segments, sideSegments, coneCenter(column, row), IDENTITY_BASIS);
  const wireNormal = (column: number, row: number, options: LineOptions, segments = CONE_SEGMENT_COUNT, sideSegments = CONE_SIDE_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, sideSegments);
    drawShapeWire(recorder, shape, options, coneWireNormals(shape, coneColumnRadius(column, row), coneColumnHeight(column, row), sideSegments, IDENTITY_BASIS));
  };

  // cone(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // cone(radius)
  RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: CONE_BASE_LINE_WIDTH }));
  // cone(height)
  CONE_HEIGHT_VALUES.forEach((_height, row) => wire(base(2, row), { color: LIME, width: CONE_BASE_LINE_WIDTH }));
  // cone(segments)
  SHAPE_SEGMENT_VALUES.forEach((segments, row) => wire(base(3, row, segments), { color: GOLD, width: CONE_BASE_LINE_WIDTH }));
  // cone(side segments)
  SHAPE_SEGMENT_VALUES.forEach((sideSegments, row) => wire(base(4, row, CONE_SEGMENT_COUNT, sideSegments), { color: ORANGE_FULL, width: CONE_BASE_LINE_WIDTH }));
  // cone(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CONE_ROTATION_TUNNEL_SCALE_STEP;
    const shape = coneWireAt(CONE_ROTATION_TUNNEL_RADIUS * scale, CONE_ROTATION_TUNNEL_HEIGHT * scale, CONE_SEGMENT_COUNT, CONE_SIDE_SEGMENT_COUNT, coneTunnelCenter(5, row, CONE_ROTATION_TUNNEL_Y, CONE_ROTATION_TUNNEL_DEPTH_STEP), coneTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: CONE_BASE_LINE_WIDTH });
  }
  // cone(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, CONE_JOINT_SEGMENT_COUNT, CONE_JOINT_SIDE_SEGMENT_COUNT), { color: VIOLET, width: CONE_JOINT_LINE_WIDTH, joint }));
  // cone_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(7, row, { color: normalSampleColor(row), width: normalSampleWidth(row, CONE_BASE_LINE_WIDTH), joint: "round" });
  }
  // cone_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(8, row, { color: TEAL, width: CONE_JOINT_LINE_WIDTH, joint }, CONE_JOINT_SEGMENT_COUNT, CONE_JOINT_SIDE_SEGMENT_COUNT));
  // cone_s(solid): the reference also overlays the normal-aware wireframe.
  for (let row = 0; row < CONE_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CONE_S_TUNNEL_SCALE_STEP;
    const center = coneTunnelCenter(9, row, CONE_S_TUNNEL_Y, CONE_S_TUNNEL_DEPTH_STEP);
    const basis = coneTunnelBasis(row);
    const radius = CONE_S_TUNNEL_RADIUS * scale;
    const height = CONE_S_TUNNEL_HEIGHT * scale;
    const shape = coneWireAt(radius, height, CONE_SEGMENT_COUNT, CONE_SIDE_SEGMENT_COUNT, center, basis);
    recorder.mesh(coneSolidMesh(radius, height, center, basis), { color: fromHsv(row / CONE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 0.35), solid: true });
    drawShapeWire(recorder, shape, { color: fromHsv(row / CONE_S_SAMPLE_COUNT + 0.6, 0.7, 1, 1), width: CONE_BASE_LINE_WIDTH, joint: "round" }, coneWireNormals(shape, radius, height, CONE_SIDE_SEGMENT_COUNT, basis));
  }
}

// --- Cylinder -------------------------------------------------------------

const CYLINDER_LAYOUT = createLayout(SCENE_LAYOUTS.cylinder, SCENE_LAYOUTS.cylinder.baseY);
const CYLINDER_BASE_Y = SCENE_LAYOUTS.cylinder.baseY;
const CYLINDER_RADIUS = 0.28;
const CYLINDER_HALF_HEIGHT = 0.35;
const CYLINDER_BASE_LINE_WIDTH = 2;
const CYLINDER_JOINT_LINE_WIDTH = 8;
const CYLINDER_SEGMENT_COUNT = 16;
const CYLINDER_SIDE_SEGMENT_COUNT = 8;
const CYLINDER_JOINT_SEGMENT_COUNT = 8;
const CYLINDER_JOINT_SIDE_SEGMENT_COUNT = 8;
const CYLINDER_HALF_HEIGHT_VALUES = [0.225, 0.325, 0.425, 0.525] as const;
const CYLINDER_ROTATION_TUNNEL_RADIUS = 0.34;
const CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT = 0.41;
const CYLINDER_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const CYLINDER_ROTATION_TUNNEL_SCALE_STEP = 0.05;
const CYLINDER_ROTATION_TUNNEL_Y = 0.35;
const CYLINDER_S_SAMPLE_COUNT = 8;
const CYLINDER_S_TUNNEL_RADIUS = 0.34;
const CYLINDER_S_TUNNEL_HALF_HEIGHT = 0.41;
const CYLINDER_S_TUNNEL_DEPTH_STEP = 0.16;
const CYLINDER_S_TUNNEL_SCALE_STEP = 0.05;
const CYLINDER_S_TUNNEL_Y = 0.35;

/** `_get_column_radius`: the radius row plus the rotation/solid tunnels. */
function cylinderColumnRadius(column: number, row: number): number {
  if (column === 1) return RADIUS_VALUES[row]!;
  if (column === 5) return CYLINDER_ROTATION_TUNNEL_RADIUS * (1 - row * CYLINDER_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CYLINDER_S_TUNNEL_RADIUS * (1 - row * CYLINDER_S_TUNNEL_SCALE_STEP);
  return CYLINDER_RADIUS;
}

/** `_get_column_half_height`: the half-height row plus the rotation/solid tunnels. */
function cylinderColumnHalfHeight(column: number, row: number): number {
  if (column === 2) return CYLINDER_HALF_HEIGHT_VALUES[row]!;
  if (column === 5) return CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT * (1 - row * CYLINDER_ROTATION_TUNNEL_SCALE_STEP);
  if (column === 9) return CYLINDER_S_TUNNEL_HALF_HEIGHT * (1 - row * CYLINDER_S_TUNNEL_SCALE_STEP);
  return CYLINDER_HALF_HEIGHT;
}

/** `_get_cylinder_center`: the cylinder base stays at `CYLINDER_BASE_Y`. */
function cylinderCenter(column: number, row: number): Vec3 {
  return referenceOffset([CYLINDER_LAYOUT.columnX(column), CYLINDER_BASE_Y + cylinderColumnHalfHeight(column, row), CYLINDER_LAYOUT.rowZ(column, row)]);
}

function cylinderTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = cylinderCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}

/** `_get_rotation_tunnel_rotation` / `_get_cylinder_s_tunnel_rotation` (identical). */
function cylinderTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.26);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

function cylinderWireAt(radius: number, halfHeight: number, segments: number, sideSegments: number, center: Vec3, basis: Basis3): ShapeWire {
  return cylinderWire(radius, halfHeight, segments, sideSegments, center, basis);
}

/** Reference `_emit_cylinder_s` emits a `CylinderMesh`. */
function cylinderSolidMesh(radius: number, halfHeight: number, center: Vec3, basis: Basis3): MeshData {
  return transformMeshByBasis(cylinder(radius, halfHeight, 64), center, basis);
}

/**
 * `draw_cylinder_n`: both rings use `_get_circle_normals` on the ring basis, the wall lines
 * use `_get_cylinder_side_line_normals` (one radial normal per line).
 */
function cylinderWireNormals(shape: ShapeWire, radius: number, halfHeight: number, sideSegments: number, basis: Basis3): ShapeNormals {
  const ringNormals = circleNormals(shape.loops[0]?.length ?? 0, coneBaseBasis(basis));
  return {
    loops: shape.loops.map(() => ringNormals),
    lines: cylinderSideLineNormals(radius, halfHeight, sideSegments, basis),
  };
}

function cylinderShape(recorder: FrameRecorder): void {
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(recorder, shape, options);
  const base = (column: number, row: number, segments = CYLINDER_SEGMENT_COUNT, sideSegments = CYLINDER_SIDE_SEGMENT_COUNT): ShapeWire =>
    cylinderWireAt(cylinderColumnRadius(column, row), cylinderColumnHalfHeight(column, row), segments, sideSegments, cylinderCenter(column, row), IDENTITY_BASIS);
  const wireNormal = (column: number, row: number, options: LineOptions, segments = CYLINDER_SEGMENT_COUNT, sideSegments = CYLINDER_SIDE_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, sideSegments);
    drawShapeWire(recorder, shape, options, cylinderWireNormals(shape, cylinderColumnRadius(column, row), cylinderColumnHalfHeight(column, row), sideSegments, IDENTITY_BASIS));
  };

  // cylinder(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // cylinder(radius)
  RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(half height)
  CYLINDER_HALF_HEIGHT_VALUES.forEach((_halfHeight, row) => wire(base(2, row), { color: LIME, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(segments)
  SHAPE_SEGMENT_VALUES.forEach((segments, row) => wire(base(3, row, segments), { color: GOLD, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(side segments)
  SHAPE_SEGMENT_VALUES.forEach((sideSegments, row) => wire(base(4, row, CYLINDER_SEGMENT_COUNT, sideSegments), { color: ORANGE_FULL, width: CYLINDER_BASE_LINE_WIDTH }));
  // cylinder(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CYLINDER_ROTATION_TUNNEL_SCALE_STEP;
    const shape = cylinderWireAt(CYLINDER_ROTATION_TUNNEL_RADIUS * scale, CYLINDER_ROTATION_TUNNEL_HALF_HEIGHT * scale, CYLINDER_SEGMENT_COUNT, CYLINDER_SIDE_SEGMENT_COUNT, cylinderTunnelCenter(5, row, CYLINDER_ROTATION_TUNNEL_Y, CYLINDER_ROTATION_TUNNEL_DEPTH_STEP), cylinderTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: CYLINDER_BASE_LINE_WIDTH });
  }
  // cylinder(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, CYLINDER_JOINT_SEGMENT_COUNT, CYLINDER_JOINT_SIDE_SEGMENT_COUNT), { color: VIOLET, width: CYLINDER_JOINT_LINE_WIDTH, joint }));
  // cylinder_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(7, row, { color: normalSampleColor(row), width: normalSampleWidth(row, CYLINDER_BASE_LINE_WIDTH), joint: "round" });
  }
  // cylinder_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(8, row, { color: TEAL, width: CYLINDER_JOINT_LINE_WIDTH, joint }, CYLINDER_JOINT_SEGMENT_COUNT, CYLINDER_JOINT_SIDE_SEGMENT_COUNT));
  // cylinder_s(solid): the reference also overlays the normal-aware wireframe.
  for (let row = 0; row < CYLINDER_S_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CYLINDER_S_TUNNEL_SCALE_STEP;
    const center = cylinderTunnelCenter(9, row, CYLINDER_S_TUNNEL_Y, CYLINDER_S_TUNNEL_DEPTH_STEP);
    const basis = cylinderTunnelBasis(row);
    const radius = CYLINDER_S_TUNNEL_RADIUS * scale;
    const halfHeight = CYLINDER_S_TUNNEL_HALF_HEIGHT * scale;
    const shape = cylinderWireAt(radius, halfHeight, CYLINDER_SEGMENT_COUNT, CYLINDER_SIDE_SEGMENT_COUNT, center, basis);
    recorder.mesh(cylinderSolidMesh(radius, halfHeight, center, basis), { color: fromHsv(row / CYLINDER_S_SAMPLE_COUNT + 0.6, 0.7, 1, 0.35), solid: true });
    drawShapeWire(recorder, shape, { color: fromHsv(row / CYLINDER_S_SAMPLE_COUNT + 0.6, 0.7, 1, 1), width: CYLINDER_BASE_LINE_WIDTH, joint: "round" }, cylinderWireNormals(shape, radius, halfHeight, CYLINDER_SIDE_SEGMENT_COUNT, basis));
  }
}

// --- Capsule --------------------------------------------------------------

const CAPSULE_LAYOUT = createLayout(SCENE_LAYOUTS.capsule, SCENE_LAYOUTS.capsule.baseY);
const CAPSULE_BASE_Y = SCENE_LAYOUTS.capsule.baseY;
const CAPSULE_RADIUS = 0.28;
const CAPSULE_HALF_HEIGHT = 0.225;
const CAPSULE_BASE_LINE_WIDTH = 2;
const CAPSULE_JOINT_LINE_WIDTH = 8;
const CAPSULE_SEGMENT_COUNT = 32;
const CAPSULE_SIDE_SEGMENT_COUNT = 2;
const CAPSULE_JOINT_SEGMENT_COUNT = 12;
const CAPSULE_JOINT_SIDE_SEGMENT_COUNT = 4;
const CAPSULE_RADIUS_VALUES = [0.16, 0.24, 0.32, 0.40] as const;
const CAPSULE_HALF_HEIGHT_VALUES = [0.0, 0.125, 0.225, 0.35] as const;
const CAPSULE_SIDE_SEGMENT_VALUES = [1, 2, 4, 8] as const;
const CAPSULE_ROTATION_TUNNEL_RADIUS = 0.34;
const CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT = 0.275;
const CAPSULE_ROTATION_TUNNEL_DEPTH_STEP = 0.16;
const CAPSULE_ROTATION_TUNNEL_SCALE_STEP = 0.05;
const CAPSULE_ROTATION_TUNNEL_Y = 0.35;

/** `_get_column_radius`: the radius row plus the rotation tunnel. */
function capsuleColumnRadius(column: number, row: number): number {
  if (column === 1) return CAPSULE_RADIUS_VALUES[row]!;
  if (column === 5) return CAPSULE_ROTATION_TUNNEL_RADIUS * (1 - row * CAPSULE_ROTATION_TUNNEL_SCALE_STEP);
  return CAPSULE_RADIUS;
}

/** `_get_column_half_height`: the half-height row plus the rotation tunnel. */
function capsuleColumnHalfHeight(column: number, row: number): number {
  if (column === 2) return CAPSULE_HALF_HEIGHT_VALUES[row]!;
  if (column === 5) return CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT * (1 - row * CAPSULE_ROTATION_TUNNEL_SCALE_STEP);
  return CAPSULE_HALF_HEIGHT;
}

/** `_get_capsule_center`: base at `CAPSULE_BASE_Y`, so the centre rises by half height plus radius. */
function capsuleCenter(column: number, row: number): Vec3 {
  const y = CAPSULE_BASE_Y + capsuleColumnHalfHeight(column, row) + capsuleColumnRadius(column, row);
  return referenceOffset([CAPSULE_LAYOUT.columnX(column), y, CAPSULE_LAYOUT.rowZ(column, row)]);
}

function capsuleTunnelCenter(column: number, row: number, yOffset: number, depthStep: number): Vec3 {
  const center = capsuleCenter(column, row);
  return [center[0], center[1] + yOffset, center[2] - row * depthStep];
}

/** `_get_rotation_tunnel_rotation`. */
function capsuleTunnelBasis(row: number): Basis3 {
  let basis = rotateBasis(IDENTITY_BASIS, [1, 0, 0], -Math.PI * 0.28);
  basis = rotateBasis(basis, [0, 0, 1], row * Math.PI * 0.10);
  return rotateBasis(basis, [0, 1, 0], row * Math.PI * 0.08);
}

function capsuleWireAt(radius: number, halfHeight: number, segments: number, sideSegments: number, center: Vec3, basis: Basis3): ShapeWire {
  return capsuleWire(radius, halfHeight, segments, sideSegments, center, basis);
}

/**
 * `draw_capsule_n`: cap rings use `_get_circle_normals` and the silhouettes
 * `_get_capsule_side_outline_normals`. Both reduce to the same formula here -- an outline
 * segment midpoint projected back onto the cap axis -- because a ring midpoint projects onto
 * its own cap centre, so one helper covers every loop in the reference order.
 */
function capsuleWireNormals(shape: ShapeWire, halfHeight: number, center: Vec3, basis: Basis3): ShapeNormals {
  const axis = normalizeVector(basis.y);
  const bottomCenter = offsetAlong(center, axis, -halfHeight);
  const topCenter = offsetAlong(center, axis, halfHeight);
  return { loops: shape.loops.map((loop) => capsuleOutlineNormals(bottomCenter, topCenter, axis, loop)) };
}

function capsuleShape(recorder: FrameRecorder): void {
  const wire = (shape: ShapeWire, options: LineOptions): void => drawShapeWire(recorder, shape, options);
  const base = (column: number, row: number, segments = CAPSULE_SEGMENT_COUNT, sideSegments = CAPSULE_SIDE_SEGMENT_COUNT): ShapeWire =>
    capsuleWireAt(capsuleColumnRadius(column, row), capsuleColumnHalfHeight(column, row), segments, sideSegments, capsuleCenter(column, row), IDENTITY_BASIS);
  const wireNormal = (column: number, row: number, options: LineOptions, segments = CAPSULE_SEGMENT_COUNT, sideSegments = CAPSULE_SIDE_SEGMENT_COUNT): void => {
    const shape = base(column, row, segments, sideSegments);
    drawShapeWire(recorder, shape, options, capsuleWireNormals(shape, capsuleColumnHalfHeight(column, row), capsuleCenter(column, row), IDENTITY_BASIS));
  };

  // capsule(width)
  WIDTH_VALUES.forEach((width, row) => wire(base(0, row), { color: WHITE, width }));
  // capsule(radius)
  CAPSULE_RADIUS_VALUES.forEach((_radius, row) => wire(base(1, row), { color: CYAN, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(half height)
  CAPSULE_HALF_HEIGHT_VALUES.forEach((_halfHeight, row) => wire(base(2, row), { color: LIME, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(segments)
  SEGMENT_VALUES.forEach((segments, row) => wire(base(3, row, segments), { color: GOLD, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(side segments)
  CAPSULE_SIDE_SEGMENT_VALUES.forEach((sideSegments, row) => wire(base(4, row, CAPSULE_SEGMENT_COUNT, sideSegments), { color: PINK, width: CAPSULE_BASE_LINE_WIDTH }));
  // capsule(rotation)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CAPSULE_ROTATION_TUNNEL_SCALE_STEP;
    const shape = capsuleWireAt(CAPSULE_ROTATION_TUNNEL_RADIUS * scale, CAPSULE_ROTATION_TUNNEL_HALF_HEIGHT * scale, CAPSULE_SEGMENT_COUNT, CAPSULE_SIDE_SEGMENT_COUNT, capsuleTunnelCenter(5, row, CAPSULE_ROTATION_TUNNEL_Y, CAPSULE_ROTATION_TUNNEL_DEPTH_STEP), capsuleTunnelBasis(row));
    wire(shape, { color: [0.95, 0.75, 0.25, 1 - row * 0.07], width: CAPSULE_BASE_LINE_WIDTH });
  }
  // capsule(joint)
  JOINT_VALUES.forEach((joint, row) => wire(base(6, row, CAPSULE_JOINT_SEGMENT_COUNT, CAPSULE_JOINT_SIDE_SEGMENT_COUNT), { color: VIOLET, width: CAPSULE_JOINT_LINE_WIDTH, joint }));
  // capsule_n
  for (let row = 0; row < NORMAL_SAMPLE_COUNT; row++) {
    wireNormal(7, row, { color: normalSampleColor(row), width: normalSampleWidth(row, CAPSULE_BASE_LINE_WIDTH), joint: "round" });
  }
  // capsule_n(joint)
  JOINT_VALUES.forEach((joint, row) => wireNormal(8, row, { color: TEAL, width: CAPSULE_JOINT_LINE_WIDTH, joint }, CAPSULE_JOINT_SEGMENT_COUNT, CAPSULE_JOINT_SIDE_SEGMENT_COUNT));
}

/**
 * Encoding, raster-scale and placement matrix (vgpu extension).
 *
 * Not a reference port — the addon has no text API. Two matrices share one view, because the
 * placement space changes how much of an encoding's quality survives:
 *
 * - a **world-billboard** matrix, six glyph sources by three font sizes — the full encoding axis,
 *   drawn facing the camera;
 * - a **world-plane** matrix, the same three font sizes under three representative sources, drawn on
 *   a fixed plane so it foreshortens as the camera orbits.
 *
 * The layout follows the line/circle matrices: one axis enumerates the variants and the other the
 * values, and every cell is a sample. It is **transposed** relative to those scenes because text
 * grows sideways — six source columns would be wider than any camera wants to frame. So reading down
 * a column compares encodings at one size, and reading across a row compares sizes under one encoding.
 *
 * Every row floats above the grid plane. The grid is a full-screen translucent plane that writes
 * depth to match the reference, so a block crossing `y = 0` would be clipped along the grid lines.
 */
function textCompareScene(recorder: FrameRecorder): void {
  const sizes = [16, 24, 36];
  const pixelSize = 0.022;
  const sample = "Handgloves";

  const groups: readonly {
    readonly space: "world-plane" | "world-billboard";
    readonly title: string;
    readonly labelX: number;
    readonly columnX: readonly number[];
    readonly firstRowY: number;
    readonly rows: readonly (readonly [source: string, label: string])[];
  }[] = [
    {
      space: "world-billboard",
      title: "world-billboard",
      labelX: -0.6,
      columnX: [0, 5.0, 10.0],
      firstRowY: 10.4,
      rows: [
        ["bitmap", "bitmap 1x"],
        ["bitmap4x", "bitmap 4x"],
        ["sdf", "sdf 1x"],
        ["sdf4x", "sdf 4x"],
        ["msdf", "msdf outline"],
        ["baked", "msdf baked"],
      ],
    },
    {
      space: "world-plane",
      title: "world-plane",
      // Side by side rather than stacked, with a wide gutter: the camera frames the matrix by width and
      // height together, so a wide, short layout leaves room for the rows to breathe, and the gutter
      // keeps the leaning plane group from sweeping back through the billboard one. The rows match the
      // billboard group one for one, so a row can be read across both spaces.
      labelX: 26.0,
      columnX: [26.6, 31.6, 36.6],
      firstRowY: 10.4,
      rows: [
        ["bitmap", "bitmap 1x"],
        ["bitmap4x", "bitmap 4x"],
        ["sdf", "sdf 1x"],
        ["sdf4x", "sdf 4x"],
        ["msdf", "msdf outline"],
        ["baked", "msdf baked"],
      ],
    },
  ];
  // Height costs framing distance just as width does, so the rows stay as tight as they can while still
  // clearing one another. Screen size of the glyphs is set by how much of the bounds the matrix fills,
  // and scaling the whole thing does not change that — only drawing less of it would.
  const rowStep = 1.45;
  const titleY = 12.2;

  for (const group of groups) {
    recorder.text([group.labelX - 5.6, titleY, 0], group.title, {
      fontSize: 24,
      pixelSize,
      space: "world-billboard",
      source: "baked",
      anchor: "center-right",
      color: [1, 0.85, 0.4, 1],
    });
    for (let column = 0; column < sizes.length; column++) {
      recorder.text([group.columnX[column]!, titleY, 0], `${sizes[column]}px`, {
        fontSize: 22,
        pixelSize,
        space: "world-billboard",
        source: "baked",
        anchor: "top-left",
        color: [0.6, 0.8, 1, 1],
      });
    }

    for (let row = 0; row < group.rows.length; row++) {
      const [source, label] = group.rows[row]!;
      const y = group.firstRowY - row * rowStep;
      // The row label always faces the camera so the row stays identifiable, and only the samples
      // follow the space under test. It is drawn by its own source, so the label column doubles as a
      // sample.
      recorder.text([group.labelX, y, 0], label, {
        fontSize: 20,
        pixelSize,
        space: "world-billboard",
        source,
        anchor: "center-right",
        color: [1, 1, 1, 1],
      });
      for (let column = 0; column < sizes.length; column++) {
        recorder.text([group.columnX[column]!, y, 0], sample, {
          fontSize: sizes[column]!,
          pixelSize,
          space: group.space,
          source,
          anchor: "center-left",
          color: [1, 1, 1, 1],
        });
      }
    }
  }
}

/**
 * Screen-space text (vgpu extension).
 *
 * The 2D counterpart to `text-compare`: everything here is positioned in **top-left origin pixels**,
 * so nothing moves with the camera, the projection or depth. That is what makes it a HUD, and it is
 * the one placement space that cannot be shown inside the world — a world-space scene always renders
 * it through whatever camera happens to be looking.
 *
 * Positions are deliberately conservative rather than pinned to the viewport: a scene builder has no
 * viewport to measure against, and a HUD that falls off the edge in a narrow window is worse than one
 * that sits in a comfortable column.
 */
function textHudScene(recorder: FrameRecorder): void {
  recorder.text([24, 24, 0], "screen space", {
    fontSize: 28,
    space: "screen",
    source: "baked",
    anchor: "top-left",
    color: [1, 0.85, 0.3, 1],
  });
  recorder.text([24, 62, 0], "pixel positions, unaffected by the camera", {
    fontSize: 14,
    space: "screen",
    source: "baked",
    anchor: "top-left",
    color: [1, 1, 1, 0.75],
  });

  // Wrapping and justification, with `bounds` measured in font pixels like every other screen unit.
  recorder.text([24, 100, 0], "wrapped to 260 px with centred justification", {
    fontSize: 18,
    space: "screen",
    source: "baked",
    anchor: "top-left",
    justify: "center",
    bounds: [260, Number.POSITIVE_INFINITY],
    color: [1, 0.75, 0.25, 1],
  });

  // Spans, the equivalent of bevy's child `TextSpan`s: each carries its own colour and size.
  recorder.text(
    [24, 190, 0],
    [
      { text: "spans: " },
      { text: "red ", color: [1, 0.4, 0.4, 1] },
      { text: "green ", color: [0.45, 1, 0.55, 1] },
      { text: "BIG", color: [0.55, 0.8, 1, 1], fontSize: 28 },
    ],
    { fontSize: 18, space: "screen", source: "baked", anchor: "top-left" },
  );

  // Encodings on a pixel grid — the 2D answer to the world-space matrix. A HUD is usually read at its
  // raster size, so the differences are subtler here than they are once a world block is magnified.
  const encodings: readonly (readonly [source: string, label: string])[] = [
    ["bitmap", "bitmap 1x"],
    ["sdf4x", "sdf 4x"],
    ["baked", "msdf baked"],
  ];
  for (let index = 0; index < encodings.length; index++) {
    const [source, label] = encodings[index]!;
    const y = 240 + index * 32;
    recorder.text([24, y, 0], label, { fontSize: 18, space: "screen", source, anchor: "top-left", color: [0.7, 0.85, 1, 1] });
    recorder.text([190, y, 0], "Handgloves 0123", { fontSize: 20, space: "screen", source, anchor: "top-left" });
  }

  // Outline: the same ring obtained two ways — from the true distance the distance encodings keep in
  // alpha, and from sampling the coverage mask in eight directions.
  const outlinedLabel = {
    fontSize: 20,
    space: "screen",
    anchor: "top-left",
    color: [0.45, 0.8, 1, 1],
    outlineWidth: 3,
    outlineColor: [0.04, 0.05, 0.08, 1],
  } as const;
  recorder.text([24, 330, 0], "outlined msdf", { ...outlinedLabel, source: "baked" });
  recorder.text([190, 330, 0], "outlined mask", { ...outlinedLabel, source: "bitmap" });

  // Anchors: the marker is the position, and each block lands on it differently. Spread along one row
  // rather than a 3×3 grid, so the panel stays inside a modest viewport.
  const anchors = ["top-left", "top-right", "center", "bottom-left", "bottom-right"] as const;
  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index]!;
    // The spacing has to clear the widest label at the widest anchor: `top-left` grows rightwards
    // from its marker while `top-right` grows leftwards into the same gap.
    const x = 60 + index * 200;
    const y = 360;
    recorder.text([x, y, 0], "+", { fontSize: 16, space: "screen", source: "baked", anchor: "center", color: [1, 0.55, 0.25, 1] });
    recorder.text([x, y, 0], anchor, { fontSize: 12, space: "screen", source: "baked", anchor, color: [0.85, 0.9, 1, 1] });
  }
}

export function buildScene(id: string, recorder: FrameRecorder, time: number, lineJoint?: SceneContext["lineJoint"]): void {
  const context: SceneContext = lineJoint === undefined ? { time } : { time, lineJoint };
  // Reference: every example's first `_process()` line is
  // `draw_axes(Vector3.ZERO, IDENTITY, 0.75, 2.0)`. `DebugDraw3D` is a child of the scene
  // root, so the local `ZERO` picks up the capture harness's scene translation and the axes
  // land on the shifted origin. `_validate_global_basis()` only rejects rotation/scale, which
  // is what allows that translation. The axes are unconditional scene content, not a
  // toggle: `EndlessGrid3D` and `DebugDraw3D` are sibling nodes that never know about each
  // other, so the grid has no bearing on whether the axes show.
  const selfAxes = id === "index" || id === "grid" || id === "world_space_width" || id === "text-hud";
  // index/grid/world_space_width draw their own translated origin axes (and
  // world_space_width needs world-space widths), so they opt out of the generic one.
  if (!selfAxes) recorder.axes(referenceOffset([0, 0, 0]), AXES_LENGTH, 2);
  switch (id) {
    case "index": indexMatrix(recorder); break;
    case "line": lineMatrix(recorder, context); break;
    case "arrow": arrowMatrix(recorder, context); break;
    case "axes": axesMatrix(recorder, context); break;
    case "grid": gridMatrix(recorder); break;
    case "rect": rectMatrix(recorder, context); break;
    case "box": boxMatrix(recorder, context); break;
    case "circle": circleMatrix(recorder, context); break;
    case "arc": arcMatrix(recorder, context); break;
    case "curve": curveMatrix(recorder, context); break;
    case "sphere":
    case "cone":
    case "cylinder":
    case "capsule": shapeScene(recorder, id, context); break;
    case "world_space_width": worldWidthMatrix(recorder); break;
    case "text": textScene(recorder, context); break;
    case "text-compare": textCompareScene(recorder); break;
    case "text-hud": textHudScene(recorder); break;
    default: break;
  }
}

/** `world_space_width.gd`: the same matrix with world-space widths and no solid columns. */
function worldWidthMatrix(recorder: FrameRecorder): void {
  apiMatrix(recorder, { width: (pixels) => pixels * WSW_LINE_WIDTH_SCALE, widthMode: "world", solids: false });
}

/**
 * Text showcase (vgpu extension).
 *
 * Deliberately not a reference port: `godot-debug-draw` has no text API at all — the labels in
 * its examples are plain `Label3D` nodes, which is also why every other scene omits them. This
 * one exercises what the library adds instead: the three placement spaces, wrapping,
 * justification, span styling and per-frame movement.
 */
function textScene(recorder: FrameRecorder, context: SceneContext): void {
  // Font pixels and world units per font pixel: the reference `Label3D.font_size` /
  // `pixel_size` pair. A 40px glyph at 0.025 units per pixel is 1.0 world unit tall, and
  // raising the font size while lowering the ratio keeps that size at a sharper raster.
  const label = { fontSize: 40, pixelSize: 0.025 } as const;
  const caption = { fontSize: 24, pixelSize: 0.025 } as const;
  // Top-left HUD: screen-space pixels, independent of projection, depth and camera motion. The
  // anchor decides which corner of the block lands on that pixel, so it stays on screen.
  recorder.text([24, 26, 0], "screen space HUD", { fontSize: 24, space: "screen", anchor: "top-left", color: [1, 0.85, 0.3, 1] });
  recorder.text([24, 60, 0], "fixed pixel size, top-left origin", { fontSize: 14, space: "screen", anchor: "top-left", color: [1, 1, 1, 0.8] });
  // Left column: the two world spaces, so their facing can be compared side by side.
  // world-plane keeps its own XY plane and foreshortens with the camera, like a `Label3D`;
  // world-billboard is rebuilt from the camera's axes and stays readable at any orbit angle.
  recorder.text([0, 2.6, 7], "world-plane", { ...label, space: "world-plane" });
  recorder.text([0, 1.4, 7], "fixed orientation", { ...caption, space: "world-plane", color: [0.68, 0.68, 1, 1] });
  recorder.text([0, -0.4, 7], "world-billboard", { ...label, space: "world-billboard", color: [0.5, 1, 0.65, 1] });
  recorder.text([0, -1.6, 7], "always facing the camera", { ...caption, space: "world-billboard", color: [0.6, 1, 0.78, 1] });
  // Middle column: layout and styling.
  recorder.text([0, 2.6, 0], "wrapped to 5 world units with centred justification", {
    ...caption,
    space: "world-billboard",
    justify: "center",
    // `bounds` is in font pixels like `fontSize`, so 5 world units is 200 px at 0.025 units/px.
    bounds: [200, Number.POSITIVE_INFINITY],
    color: [1, 0.75, 0.25, 1],
  });
  // Spans, the equivalent of bevy's child `TextSpan`s: each carries its own colour and size.
  recorder.text([0, -0.4, 0], [
    { text: "spans: " },
    { text: "red ", color: [1, 0.35, 0.35, 1] },
    { text: "green ", color: [0.4, 1, 0.5, 1] },
    { text: "BIG", color: [0.5, 0.8, 1, 1], fontSize: 34 },
  ], { ...caption, space: "world-billboard" });
  // Right column: a block that moves every frame, exercising re-layout and atlas lookup.
  const angle = context.time * 0.9;
  const orbit: Vec3 = [Math.sin(angle) * 2.5, 1.0, -7];
  recorder.point(orbit, { color: [1, 0.55, 0.9, 1], size: 10 });
  recorder.text(orbit, "moves each frame", { ...caption, space: "world-billboard", color: [1, 0.55, 0.9, 1] });
}
