import type { FrameRecorder, Vec3, Color } from "./frame-recorder.js";
import { rotatePoint, type Curve3D } from "./curve.js";
import { box, capsule, cone, cylinder, disc, rect, sphere, type MeshData } from "./geometry-generators.js";

export type SceneContext = { readonly time: number; readonly lineJoint?: "none" | "round" | "bevel" | "miter" };

const WIDTH_VALUES = [1, 2, 5.5, 10];
const ALPHA_VALUES = [1, 0.65, 0.35, 0.1];
const DASH_VALUES: readonly (readonly [number, number])[] = [[0.1, 0.1], [0.2, 0.1], [0.4, 0.15], [0.04, 0.12]];
const JOINT_VALUES = ["none", "round", "bevel", "miter"] as const;
const NORMAL_VALUES: readonly Vec3[] = [[0, 0, 1], [0, 0.7071, 0.7071], [0, 1, 0], [0, 0, -1]];
const ROTATIONS = Array.from({ length: 8 }, (_, index) => index * Math.PI / 4);
const RADII = [0.18, 0.28, 0.38, 0.5];
const SEGMENTS = [8, 16, 32, 64];
const SHAPES = [0.25, 0.65, 1, 1.35];
const TOLERANCES = [0.04, 0.08, 0.16, 0.32];

const WHITE: Color = [1, 1, 1, 1];
const CYAN: Color = [0.15, 0.85, 1, 0.95];
const LIME: Color = [0.7, 1, 0.25, 1];
const ORANGE: Color = [1, 0.45, 0.2, 0.95];
const VIOLET: Color = [0.75, 0.45, 1, 1];
const TEAL: Color = [0.25, 0.95, 0.9, 1];
const GOLD: Color = [0.95, 0.75, 0.25, 1];
const RED: Color = [1, 0.25, 0.35, 1];

function slot(column: number, row: number, columns: number, rows: number): Vec3 {
  const columnSpacing = columns > 1 ? Math.min(1.5, 10 / (columns - 1)) : 0;
  const rowSpacing = rows > 1 ? Math.min(0.62, 2.6 / (rows - 1)) : 0;
  return [(column - (columns - 1) / 2) * columnSpacing, 0, (row - (rows - 1) / 2) * rowSpacing];
}

function circlePoints(radius: number, segments: number, rotation: readonly [number, number, number] = [0, 0, 0], center: Vec3 = [0, 0, 0]): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2;
    const p: Vec3 = [Math.cos(a) * radius, 0, Math.sin(a) * radius];
    points.push([p[0] + center[0], p[1] + center[1], p[2] + center[2]]);
  }
  return rotation.some((value) => value !== 0) ? points.map((p) => rotatePoint(p, rotation)) : points;
}

function arcPoints(radius: number, angle: number, segments: number): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * angle;
    points.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  return points;
}

function rectPoints(width: number, height: number): Vec3[] {
  return [[-width / 2, 0, -height / 2], [width / 2, 0, -height / 2], [width / 2, 0, height / 2], [-width / 2, 0, height / 2]].map((p) => [p[0]!, p[1]!, p[2]!]);
}

function transformPoints(points: readonly Vec3[], position: Vec3, rotation: readonly [number, number, number]): Vec3[] {
  return points.map((p) => {
    const r = rotatePoint(p, rotation);
    return [r[0] + position[0], r[1] + position[1], r[2] + position[2]];
  });
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
// here. No compressed `slot()` layout is used for these scenes.
// ---------------------------------------------------------------------------

const REFERENCE_OFFSET: Vec3 = [-10, 0, 1.5];

type CircleBasis = { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };

function referenceOffset(p: Vec3): Vec3 {
  return [p[0] + REFERENCE_OFFSET[0], p[1] + REFERENCE_OFFSET[1], p[2] + REFERENCE_OFFSET[2]];
}

function normalizeVector(p: Vec3): Vec3 {
  const length = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / length, p[1] / length, p[2] / length];
}

function crossVector(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Godot `Vector3.rotated(axis, angle)` equivalent (right-handed Rodrigues). */
function rotateAroundAxis(p: Vec3, axis: Vec3, angle: number): Vec3 {
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

/** Port of `_get_circle_rotation(normal, angle)` from circle.gd. */
function circleBasis(normal: Vec3, angle: number): CircleBasis {
  const n = normalizeVector(normal);
  const reference: Vec3 = Math.abs(n[0]) > 0.95 ? [0, 0, 1] : [1, 0, 0];
  const projection = reference[0] * n[0] + reference[1] * n[1] + reference[2] * n[2];
  const planar: Vec3 = [reference[0] - n[0] * projection, reference[1] - n[1] * projection, reference[2] - n[2] * projection];
  const widthAxis = normalizeVector(rotateAroundAxis(normalizeVector(planar), n, angle));
  const heightAxis = normalizeVector(crossVector(n, widthAxis));
  return { x: widthAxis, y: heightAxis, z: n };
}

/** Points on a circle in the plane spanned by a Godot rotation basis. */
function basisCirclePoints(centerLocal: Vec3, radius: number, segments: number, basis: CircleBasis): Vec3[] {
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

function arrowMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 7;
  const rowCount = 4;
  const dirs = [-Math.PI * 0.35, -Math.PI * 0.12, Math.PI * 0.12, Math.PI * 0.35];
  const headAngles = [Math.PI / 9, Math.PI / 6, Math.PI / 4, Math.PI * 0.42];

  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.arrow([p[0] - 0.5, 0, p[2]], [0.9, 0, 0], { color: WHITE, width });
  });
  dirs.forEach((angle, row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.arrow([p[0] - 0.5, 0, p[2]], [Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9], { color: CYAN, width: 2 });
  });
  headAngles.forEach((headAngle, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.arrow([p[0] - 0.5, 0, p[2]], [0.9, 0, 0], { color: LIME, width: 2, headAngle });
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.lineStrip(transformPoints([[-0.5, 0, 0.22], [-0.12, 0, -0.22], [0.16, 0, 0.22], [0.5, 0, -0.22]], p, [0, 0, 0]), { color: VIOLET, width: 8, joint }, false);
  });
  NORMAL_VALUES.forEach((normal, row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.arrow([p[0] - 0.4, 0, p[2]], [0.8, 0.2, 0], { color: TEAL, width: 4, normal });
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.lineStrip(transformPoints([[-0.5, 0, 0.1], [0, 0, -0.2], [0.5, 0, 0.1]], p, [0, 0, 0]), { color: GOLD, width: 6, joint }, false);
  });
  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.arrow([p[0] - 0.55, 0, p[2]], [1.1, 0, 0], { color: LIME, width });
  });
}

function axesMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 6;
  const rowCount = 8;
  const lengths = [0.35, 0.55, 0.75, 1];

  lengths.forEach((length, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.axes([p[0], 0, p[2]], length, 2);
  });
  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.axes([p[0], 0, p[2]], 0.5, width);
  });
  ROTATIONS.forEach((_angle, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.axes([p[0], 0, p[2]], 0.4, 2);
  });
  lengths.forEach((length, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.axes([p[0], 0, p[2]], length, 2);
  });
  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.axes([p[0], 0, p[2]], 0.5, width);
  });
  ROTATIONS.forEach((_angle, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.axes([p[0], 0, p[2]], 0.4, 2);
  });
}

function gridMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 8;
  const rowCount = 4;
  const cells: readonly (readonly [number, number])[] = [[4, 4], [6, 4], [10, 3], [3, 8]];
  const spacings: readonly (readonly [number, number])[] = [[0.2, 0.2], [0.28, 0.28], [0.42, 0.22], [0.55, 0.28]];
  const skews: readonly (readonly [number, number])[] = [[0, 0], [0.5, 0], [-0.5, 0], [0.5, -0.5]];

  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], [3, 3], [0.25, 0.25], { color: WHITE, width });
  });
  cells.forEach((cell, row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], cell, [0.22, 0.22], { color: CYAN, width: 2 });
  });
  spacings.forEach((spacing, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], [3, 3], spacing, { color: LIME, width: 2 });
  });
  skews.forEach((skew, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], [4, 4], [0.22, 0.22], { color: ORANGE, width: 2, skew });
  });
  [0, 1, 2, 3].forEach((outer, row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], [3, 3], [0.24, 0.24], { color: VIOLET, width: 2 + outer });
  });
  ROTATIONS.slice(0, 4).forEach((angle, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], cells[1]!, spacings[1]!, { color: GOLD, width: 2, rotation: [0, angle, 0], outer: angle === 0 ? "none" : "xz" });
  });
  [0, 1, 2, 3].forEach((value, row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], [3, 3], [0.24, 0.24], { color: [0.4, 0.6 + value * 0.1, 1, 1], width: 2 });
  });
  [0, 1, 2, 3].forEach((_value, row) => {
    const p = slot(7, row, columnCount, rowCount);
    recorder.grid([p[0], 0, p[2]], [3, 3], [0.24, 0.24], { color: TEAL, width: 2 });
  });
}

function translateMesh(mesh: MeshData, position: Vec3): MeshData {
  const move = (p: Vec3): Vec3 => [p[0] + position[0], p[1] + position[1], p[2] + position[2]];
  return { triangles: mesh.triangles.map(([a, b, c]) => [move(a), move(b), move(c)]), segments: mesh.segments.map(([a, b]) => [move(a), move(b)]) };
}

const BASE_CURVE = curve([
  { position: [-0.55, 0, 0.2], out: [0.28, 0, -0.35] },
  { position: [0, 0, -0.2], in: [-0.28, 0, 0.35], out: [0.28, 0, -0.35] },
  { position: [0.55, 0, 0.2], in: [-0.28, 0, 0.35] },
]);

function curveMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 8;
  const rowCount = 8;

  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.curve(BASE_CURVE, { color: WHITE, width, tolerance: 0.08, transform: { center: p } });
  });
  SHAPES.forEach((scale, row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.curve(scaleCurve(scale), { color: CYAN, width: 2, tolerance: 0.08, transform: { center: p } });
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.curve(BASE_CURVE, { color: LIME, width: 2, tolerance: 0.08, transform: { center: p, rotation: [0, angle, 0] } });
  });
  TOLERANCES.forEach((tolerance, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.curve(BASE_CURVE, { color: GOLD, width: 2, tolerance, transform: { center: p } });
  });
  [0, 1, 2, 3].forEach((index, row) => {
    const p = slot(4, row, columnCount, rowCount);
    if (index === 0) recorder.curve(BASE_CURVE, { color: TEAL, width: 2, tolerance: 0.08, transform: { center: p } });
    else recorder.curve(scaleClosed(0.75 + (index - 1) * 0.25), { color: TEAL, width: 2, tolerance: 0.08, joint: context.lineJoint ?? "round", transform: { center: p } });
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.curve(cornerCurve(), { color: VIOLET, width: 5, tolerance: 0.16, joint, transform: { center: p } });
  });
  DASH_VALUES.forEach(([dash, space], row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.curve(BASE_CURVE, { color: ORANGE, width: 2, dash: [dash, space, context.time * 0.6], tolerance: 0.08, transform: { center: p } });
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(7, row, columnCount, rowCount);
    recorder.curve(cornerCurve(), { color: RED, width: 5, dash: [0.18, 0.1, context.time * 0.6], tolerance: 0.16, joint, transform: { center: p } });
  });
}

function scaleCurve(scale: number): Curve3D {
  return curve([
    { position: [-0.55, 0, 0.2 * scale], out: [0.28, 0, -0.35 * scale] },
    { position: [0, 0, -0.2 * scale], in: [-0.28, 0, 0.35 * scale], out: [0.28, 0, -0.35 * scale] },
    { position: [0.55, 0, 0.2 * scale], in: [-0.28, 0, 0.35 * scale] },
  ]);
}

function scaleClosed(scale: number): Curve3D {
  return curve([
    { position: [-0.45 * scale, 0, 0], in: [0, 0, 0.24 * scale], out: [0, 0, -0.24 * scale] },
    { position: [0, 0, -0.35 * scale], in: [-0.28 * scale, 0, 0], out: [0.28 * scale, 0, 0] },
    { position: [0.45 * scale, 0, 0], in: [0, 0, -0.24 * scale], out: [0, 0, 0.24 * scale] },
    { position: [0, 0, 0.35 * scale], in: [0.28 * scale, 0, 0], out: [-0.28 * scale, 0, 0] },
  ], true);
}

function cornerCurve(): Curve3D {
  return curve([
    { position: [-0.5, 0, 0.24] },
    { position: [-0.15, 0, -0.24] },
    { position: [0.18, 0, 0.24] },
    { position: [0.5, 0, -0.24] },
  ]);
}

function circleMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const dashOffset = context.time * CIRCLE_DASH_SPEED;
  const flat = circleBasis([0, 1, 0], 0);
  const normalUp: Vec3 = [0, 1, 0];
  const circle = (column: number, row: number, radius: number, segments: number, basis: CircleBasis = flat): Vec3[] =>
    basisCirclePoints(circleCenterLocal(column, row), radius, segments, basis);

  WIDTH_VALUES.forEach((width, row) => recorder.lineStrip(circle(0, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color: WHITE, width }, true));
  RADII.forEach((radius, row) => recorder.lineStrip(circle(1, row, radius, CIRCLE_SEGMENTS), { color: CYAN, width: 2 }, true));
  SEGMENTS.forEach((segments, row) => recorder.lineStrip(circle(2, row, CIRCLE_RADIUS, segments), { color: LIME, width: 2 }, true));

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
    recorder.lineStrip(circle(7, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color, width, normal: normalUp, joint: "round" }, true);
  }
  DASH_VALUES.forEach(([dash, space], row) => recorder.lineStrip(circle(8, row, CIRCLE_RADIUS, CIRCLE_SEGMENTS), { color: TEAL, width: CIRCLE_BASE_WIDTH, normal: normalUp, dash: [dash, space, dashOffset], joint: "round" }, true));
  JOINT_VALUES.forEach((joint, row) => recorder.lineStrip(circle(9, row, CIRCLE_RADIUS, CIRCLE_JOINT_SEGMENTS), { color: TEAL, width: 8, normal: normalUp, joint }, true));

  SEGMENTS.forEach((segments, row) => {
    const center = referenceOffset(circleCenterLocal(10, row));
    recorder.mesh(translateMesh(disc(CIRCLE_RADIUS, segments), center), { color: [0.25, 0.65, 1, 0.45], solid: true });
  });
}

function normalOf(index: number): Vec3 { return NORMAL_VALUES[index % NORMAL_VALUES.length]!; }
function offset(points: readonly Vec3[], p: Vec3): Vec3[] { return points.map((q) => [q[0] + p[0], q[1] + p[1], q[2] + p[2]]); }

function arcMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 11;
  const rowCount = 4;
  const angles = [Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2];

  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 32), p), { color: WHITE, width }, false);
  });
  RADII.forEach((radius, row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(radius, Math.PI * 1.5, 48), p), { color: CYAN, width: 2 }, false);
  });
  angles.forEach((angle, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, angle, 48), p), { color: LIME, width: 2 }, false);
  });
  SEGMENTS.forEach((segments, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, segments), p), { color: ORANGE, width: 2, joint: context.lineJoint ?? "round" }, false);
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.lineStrip(transformPoints(arcPoints(0.35, Math.PI * 1.5, 32), p, [0, angle, 0]), { color: GOLD, width: 2 }, false);
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 6), p), { color: VIOLET, width: 8, joint }, false);
  });
  DASH_VALUES.forEach(([dash, space], row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 48), p), { color: GOLD, width: 2, dash: [dash, space, context.time * 0.35] }, false);
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(7, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 6), p), { color: RED, width: 8, joint, dash: [0.18, 0.1, context.time * 0.35] }, false);
  });
  NORMAL_VALUES.forEach((normal, row) => {
    const p = slot(8, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 32), p), { color: TEAL, width: 4, normal }, false);
  });
  DASH_VALUES.forEach(([dash, space], row) => {
    const p = slot(9, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 32), p), { color: TEAL, width: 4, normal: normalOf(0), dash: [dash, space, context.time * 0.35] }, false);
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(10, row, columnCount, rowCount);
    recorder.lineStrip(offset(arcPoints(0.35, Math.PI * 1.5, 6), p), { color: TEAL, width: 6, normal: normalOf(1), joint }, false);
  });
}

function rectMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 10;
  const rowCount = 8;
  const sizes: readonly (readonly [number, number])[] = [[0.5, 0.4], [0.8, 0.4], [0.5, 0.7], [0.55, 0.55]];

  WIDTH_VALUES.forEach((width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: WHITE, width }, true);
  });
  sizes.forEach(([w, h], row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(w, h), p), { color: CYAN, width: 2 }, true);
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.lineStrip(transformPoints(rectPoints(0.6, 0.4), p, [0, angle, 0]), { color: LIME, width: 2 }, true);
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: ORANGE, width: 8, joint }, true);
  });
  DASH_VALUES.forEach(([dash, space], row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: VIOLET, width: 2, dash: [dash, space, context.time * 0.35] }, true);
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: GOLD, width: 8, joint, dash: [0.18, 0.1, context.time * 0.35] }, true);
  });
  NORMAL_VALUES.forEach((normal, row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: TEAL, width: 4, normal }, true);
  });
  DASH_VALUES.forEach(([dash, space], row) => {
    const p = slot(7, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: TEAL, width: 4, normal: normalOf(0), dash: [dash, space, context.time * 0.35] }, true);
  });
  JOINT_VALUES.forEach((joint, row) => {
    const p = slot(8, row, columnCount, rowCount);
    recorder.lineStrip(offset(rectPoints(0.6, 0.4), p), { color: TEAL, width: 6, normal: normalOf(1), joint }, true);
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(9, row, columnCount, rowCount);
    recorder.mesh(translateMesh(rect([0.7, 0.5], [0, 0, 0], [0, angle, 0]), p), { color: GOLD, solid: true });
  });
}

function boxMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const columnCount = 7;
  const rowCount = 8;
  const sizes: readonly Vec3[] = [[0.5, 0.4, 0.4], [0.8, 0.4, 0.4], [0.5, 0.6, 0.4], [0.5, 0.4, 0.6]];

  WIDTH_VALUES.forEach((_width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box([0.5, 0.4, 0.4]), p), { color: WHITE });
  });
  sizes.forEach((size, row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box(size), p), { color: CYAN });
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box([0.5, 0.4, 0.4], [0, 0, 0], [0, angle, 0]), p), { color: LIME });
  });
  DASH_VALUES.forEach((_dash, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box([0.5, 0.4, 0.4]), p), { color: VIOLET });
  });
  NORMAL_VALUES.forEach((_normal, row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box([0.5, 0.4, 0.4]), p), { color: TEAL });
  });
  DASH_VALUES.forEach((_dash, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box([0.5, 0.4, 0.4]), p), { color: GOLD });
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.mesh(translateMesh(box([0.6, 0.5, 0.5], [0, 0, 0], [0, angle, 0]), p), { color: GOLD, solid: true });
  });
}

function overviewMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const labels = ["line", "ray", "arrow", "axes", "list", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"];
  const shapes: Record<string, MeshData> = {
    sphere: sphere(0.28, 24, 12),
    cone: cone(0.28, 0.5, 24),
    cylinder: cylinder(0.24, 0.24, 24),
    capsule: capsule(0.2, 0.22, 20, 8),
  };
  const total = labels.length;
  for (let c = 0; c < total; c++) {
    const label = labels[c]!;
    for (let row = 0; row < 4; row++) {
      const p = slot(c, row, total, 4);
      const color = [WHITE, CYAN, LIME, ORANGE][row % 4]!;
      const dashed = row === 2 || row === 3;
      const normal: Vec3 | undefined = row >= 1 ? NORMAL_VALUES[row % NORMAL_VALUES.length] : undefined;
      const extras = {
        ...(dashed ? { dash: [0.1, 0.08, context.time * 0.3] as const } : {}),
        ...(normal === undefined ? {} : { normal }),
      };
      const width = 2;
      switch (label) {
        case "line": recorder.line([p[0] - 0.4, 0, p[2]], [p[0] + 0.4, 0, p[2]], { color, width, ...extras }); break;
        case "ray": recorder.ray([p[0] - 0.4, 0, p[2]], [0.8, 0, 0], { color, width, ...(normal === undefined ? {} : { normal }) }); break;
        case "arrow": recorder.arrow([p[0] - 0.4, 0, p[2]], [0.8, 0, 0], { color, width, ...(normal === undefined ? {} : { normal }) }); break;
        case "axes": recorder.axes([p[0], 0, p[2]], 0.4, width); break;
        case "strip": recorder.lineStrip(offset([[-0.4, 0, 0.18], [-0.1, 0, -0.18], [0.15, 0, 0.18], [0.4, 0, -0.18]], p), { color, width: 5, joint: context.lineJoint ?? "round" }, false); break;
        case "list": recorder.line([p[0] - 0.35, 0, p[2] + 0.12], [p[0] + 0.35, 0, p[2] + 0.12], { color, ...extras }); recorder.line([p[0] - 0.35, 0, p[2] - 0.12], [p[0] + 0.35, 0, p[2] - 0.12], { color, ...extras }); break;
        case "loop": recorder.lineStrip(offset(circlePoints(0.25, 5), p), { color, width: 5, joint: context.lineJoint ?? "round" }, true); break;
        case "curve": recorder.curve(BASE_CURVE, { color, width, tolerance: 0.12, transform: { center: p } }); break;
        case "grid": recorder.grid([p[0], 0, p[2]], [2, 2], [0.22, 0.22], { color, width }); break;
        case "rect": recorder.lineStrip(offset(rectPoints(0.45, 0.35), p), { color, width }, true); break;
        case "box": recorder.mesh(translateMesh(box([0.35, 0.3, 0.3]), p), { color }); break;
        case "circle": recorder.lineStrip(offset(circlePoints(0.24, 24), p), { color, width }, true); break;
        case "arc": recorder.lineStrip(offset(arcPoints(0.26, Math.PI * 1.5, 20), p), { color, width }, false); break;
        default: recorder.mesh(translateMesh(shapes[label] ?? box([0.3, 0.3, 0.3]), p), { color }); break;
      }
    }
  }
}

function shapeScene(recorder: FrameRecorder, id: string, context: SceneContext): void {
  const columnCount = 7;
  const rowCount = 8;
  const base: Record<string, MeshData> = {
    sphere: sphere(0.24, 24, 12),
    cone: cone(0.24, 0.46, 24),
    cylinder: cylinder(0.22, 0.22, 24),
    capsule: capsule(0.18, 0.2, 20, 8),
  };
  const mesh = base[id]!;
  const radii: readonly (readonly [number, number])[] = [[0.18, 0.18], [0.26, 0.26], [0.34, 0.34], [0.44, 0.44]];

  WIDTH_VALUES.forEach((_width, row) => {
    const p = slot(0, row, columnCount, rowCount);
    recorder.mesh(translateMesh(mesh, p), { color: WHITE });
  });
  radii.forEach(([radius], row) => {
    const p = slot(1, row, columnCount, rowCount);
    recorder.mesh(translateMesh(scaleMesh(mesh, 0.6 + radius), p), { color: CYAN });
  });
  SEGMENTS.forEach((segments, row) => {
    const p = slot(2, row, columnCount, rowCount);
    recorder.mesh(translateMesh(sphere(0.24, segments, Math.max(4, segments / 2)), p), { color: LIME });
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(3, row, columnCount, rowCount);
    recorder.mesh(translateMesh(rotateMesh(mesh, [0, angle, 0]), p), { color: ORANGE });
  });
  JOINT_VALUES.forEach((_joint, row) => {
    const p = slot(4, row, columnCount, rowCount);
    recorder.mesh(translateMesh(mesh, p), { color: VIOLET });
  });
  NORMAL_VALUES.forEach((_normal, row) => {
    const p = slot(5, row, columnCount, rowCount);
    recorder.mesh(translateMesh(mesh, p), { color: TEAL });
  });
  ROTATIONS.forEach((angle, row) => {
    const p = slot(6, row, columnCount, rowCount);
    recorder.mesh(translateMesh(rotateMesh(mesh, [0, angle, 0]), p), { color: GOLD, solid: true });
  });
}

function rotateMesh(mesh: MeshData, rotation: readonly [number, number, number]): MeshData {
  const r = (p: Vec3): Vec3 => rotatePoint(p, rotation);
  return { triangles: mesh.triangles.map(([a, b, c]) => [r(a), r(b), r(c)]), segments: mesh.segments.map(([a, b]) => [r(a), r(b)]) };
}

function scaleMesh(mesh: MeshData, scale: number): MeshData {
  return { triangles: mesh.triangles.map(([a, b, c]) => [a.map((v) => v * scale) as unknown as Vec3, b.map((v) => v * scale) as unknown as Vec3, c.map((v) => v * scale) as unknown as Vec3]), segments: mesh.segments.map(([a, b]) => [a.map((v) => v * scale) as unknown as Vec3, b.map((v) => v * scale) as unknown as Vec3]) };
}

export function buildScene(id: string, recorder: FrameRecorder, time: number, lineJoint?: SceneContext["lineJoint"]): void {
  const context: SceneContext = lineJoint === undefined ? { time } : { time, lineJoint };
  // The reference capture harness translates the whole Godot scene root, so the
  // origin axes move with it for circle/line; other scenes keep the gallery layout.
  const referenceScene = id === "circle" || id === "line";
  recorder.axes(referenceScene ? referenceOffset([0, 0, 0]) : [0, 0, 0], 0.6, 2);
  switch (id) {
    case "index": overviewMatrix(recorder, context); break;
    case "line": lineMatrix(recorder, context); break;
    case "arrow": arrowMatrix(recorder, context); break;
    case "axes": axesMatrix(recorder, context); break;
    case "grid": gridMatrix(recorder, context); break;
    case "rect": rectMatrix(recorder, context); break;
    case "box": boxMatrix(recorder, context); break;
    case "circle": circleMatrix(recorder, context); break;
    case "arc": arcMatrix(recorder, context); break;
    case "curve": curveMatrix(recorder, context); break;
    case "sphere":
    case "cone":
    case "cylinder":
    case "capsule": shapeScene(recorder, id, context); break;
    case "world_space_width": worldWidthMatrix(recorder, context); break;
    default: overviewMatrix(recorder, context); break;
  }
}

function worldWidthMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const labels = ["line", "arrow", "axes", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"];
  const widths = [0.02, 0.04, 0.08, 0.14];
  const total = labels.length;
  for (let c = 0; c < total; c++) {
    const label = labels[c]!;
    for (let row = 0; row < 4; row++) {
      const p = slot(c, row, total, 4);
      const width = widths[row]!;
      const options = { color: [0.4, 0.85, 1, 1] as Color, width, widthMode: "world" as const };
      switch (label) {
        case "line": recorder.line([p[0] - 0.35, 0, p[2]], [p[0] + 0.35, 0, p[2]], options); break;
        case "arrow": recorder.arrow([p[0] - 0.3, 0, p[2]], [0.6, 0, 0], options); break;
        case "axes": recorder.axes([p[0], 0, p[2]], 0.35, width); break;
        case "strip": recorder.lineStrip(offset([[-0.35, 0, 0.15], [0, 0, -0.15], [0.35, 0, 0.15]], p), { ...options, joint: context.lineJoint ?? "round" }, false); break;
        case "loop": recorder.lineStrip(offset(circlePoints(0.2, 6), p), { ...options, joint: context.lineJoint ?? "round" }, true); break;
        case "curve": recorder.curve(BASE_CURVE, { ...options, tolerance: 0.12, transform: { center: p } }); break;
        case "grid": recorder.grid([p[0], 0, p[2]], [2, 2], [0.2, 0.2], options); break;
        case "rect": recorder.lineStrip(offset(rectPoints(0.4, 0.3), p), { ...options, joint: context.lineJoint ?? "round" }, true); break;
        case "box": recorder.mesh(translateMesh(box([0.3, 0.26, 0.26]), p), { color: options.color }); break;
        case "circle": recorder.lineStrip(offset(circlePoints(0.2, 24), p), { ...options, joint: context.lineJoint ?? "round" }, true); break;
        case "arc": recorder.lineStrip(offset(arcPoints(0.22, Math.PI * 1.5, 20), p), { ...options, joint: context.lineJoint ?? "round" }, false); break;
        default: {
          const shape = { sphere: sphere(0.2, 20, 10), cone: cone(0.2, 0.4, 20), cylinder: cylinder(0.18, 0.18, 20), capsule: capsule(0.15, 0.16, 16, 6) }[label]!;
          recorder.mesh(translateMesh(shape, p), { color: options.color });
          break;
        }
      }
    }
  }
  void context;
}
