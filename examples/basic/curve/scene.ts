/**
 * `curve`: widths, shape, transform, tolerance, closed paths, joints and dashes.
 */

import { CONSTRUCTION_SAMPLE_Z, CURVE_BASE, CURVE_CLOSED, CURVE_CONSTRUCTION, CURVE_CORNER, CURVE_JOINT_TOLERANCE_LENGTH, CURVE_LAYOUT, CURVE_SHAPES, CURVE_TOLERANCE_LENGTH, CURVE_TOLERANCE_VALUES, CURVE_TUNNEL_DEPTH_STEP, CURVE_TUNNEL_SCALE_STEP, CURVE_Y, CYAN, DASH_OFFSET_SPEED, GOLD, IDENTITY_BASIS, ORANGE_FULL, PINK, TEAL, VIOLET, WHITE, curveTunnelBasis, fposmod, scaleCurve, type Basis3 } from "../../shared/draw-3d.js";
import type { Color, FrameDrawList, LineOptions, Vec3 } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { DASH_VALUES, JOINT_VALUES, ROTATION_SAMPLE_COUNT, WIDTH_VALUES, basisCirclePoints, referenceOffset, type CircleBasis } from "../../shared/layout-3d.js";
import type { Curve3D } from "../../../src/curve.js";

const CURVE_BASE_LINE_WIDTH = 2;

const CURVE_EMPHASIS_LINE_WIDTH = 8;

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


/** `_get_rotation_tunnel_center`: lift the row, then recess it along -Z. */
function curveTunnelCenter(column: number, row: number): Vec3 {
  const center = CURVE_LAYOUT.atLocal(column, row);
  return referenceOffset([center[0], center[1] + 0.35, center[2] - row * CURVE_TUNNEL_DEPTH_STEP]);
}

function placeCurve(
  drawList: FrameDrawList,
  shape: Curve3D,
  center: Vec3,
  options: LineOptions & { readonly tolerance: number },
  scale = 1,
  basis: Basis3 = IDENTITY_BASIS,
): void {
  drawList.curve(scaleCurve(shape, scale, basis), { ...options, transform: { center } });
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
function drawCurveControlPoints(drawList: FrameDrawList, shape: Curve3D, localCenter: Vec3): void {
  const ring = (local: Vec3, radius: number, color: Color): void => {
    drawList.lineStrip(
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
      drawList.line(referenceOffset(anchor), referenceOffset(tip), { color: CURVE_CONTROL_EDGE_COLOR, width: CURVE_CONTROL_POINT_EDGE_WIDTH });
      ring(tip, CURVE_CONTROL_POINT_RADIUS, CURVE_CONTROL_POINT_COLOR);
    }
    ring(anchor, CURVE_ANCHOR_POINT_RADIUS, CURVE_ANCHOR_POINT_COLOR);
  }
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const dashOffset = fposmod(context.time * DASH_OFFSET_SPEED, 10);

  // Construction band at CONSTRUCTION_SAMPLE_Z, including the reference control-point markers.
  CURVE_CONSTRUCTION.forEach((shape, index) => {
    const localCenter: Vec3 = [CURVE_LAYOUT.columnX(index), CURVE_Y, CONSTRUCTION_SAMPLE_Z];
    const center = referenceOffset(localCenter);
    drawList.curve(shape, { color: CURVE_CONSTRUCTION_COLOR, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH, joint: "round", transform: { center } });
    drawCurveControlPoints(drawList, shape, localCenter);
  });

  // curve(width)
  WIDTH_VALUES.forEach((width, row) => {
    placeCurve(drawList, CURVE_BASE, CURVE_LAYOUT.at(0, row), { color: WHITE, width, tolerance: CURVE_TOLERANCE_LENGTH });
  });
  // curve(shape)
  CURVE_SHAPES.forEach((shape, row) => {
    placeCurve(drawList, shape, CURVE_LAYOUT.at(1, row), { color: CYAN, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH });
  });
  // curve(transform)
  for (let row = 0; row < ROTATION_SAMPLE_COUNT; row++) {
    const scale = 1 - row * CURVE_TUNNEL_SCALE_STEP;
    placeCurve(drawList, CURVE_BASE, curveTunnelCenter(2, row), { color: [0.7, 1, 0.25, 1 - row * 0.07], width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH }, scale, curveTunnelBasis(row));
  }
  // curve(tolerance)
  CURVE_TOLERANCE_VALUES.forEach((tolerance, row) => {
    placeCurve(drawList, CURVE_BASE, CURVE_LAYOUT.at(3, row), { color: GOLD, width: CURVE_BASE_LINE_WIDTH, tolerance });
  });
  // curve(closed)
  CURVE_CLOSED.forEach((shape, row) => {
    placeCurve(drawList, shape, CURVE_LAYOUT.at(4, row), { color: TEAL, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH, joint: "round" });
  });
  // curve(joint)
  JOINT_VALUES.forEach((joint, row) => {
    placeCurve(drawList, CURVE_CORNER, CURVE_LAYOUT.at(5, row), { color: VIOLET, width: CURVE_EMPHASIS_LINE_WIDTH, tolerance: CURVE_JOINT_TOLERANCE_LENGTH, joint });
  });
  // curve_d(dash)
  DASH_VALUES.forEach(([dash, space], row) => {
    placeCurve(drawList, CURVE_BASE, CURVE_LAYOUT.at(6, row), { color: ORANGE_FULL, width: CURVE_BASE_LINE_WIDTH, tolerance: CURVE_TOLERANCE_LENGTH, dash: [dash, space, fposmod(dashOffset, dash + space)] });
  });
  // curve_d(joint)
  JOINT_VALUES.forEach((joint, row) => {
    placeCurve(drawList, CURVE_CORNER, CURVE_LAYOUT.at(7, row), { color: PINK, width: CURVE_EMPHASIS_LINE_WIDTH, tolerance: CURVE_JOINT_TOLERANCE_LENGTH, joint, dash: [0.18, 0.1, fposmod(dashOffset, 0.28)] });
  });
}
