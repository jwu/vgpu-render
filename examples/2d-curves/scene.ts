/**
 * `2d-curves`: the 2D twin of the 3D curve page — a construction band that shows the control
 * points of every curve shape, then a matrix over width / shape / transform / tolerance / closed
 * and dashes.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { Vec2 } from "../../src/camera-2d.js";
import type { Curve2D, CurvePoint2D, CurveTransform2D } from "../../src/curve.js";
import { placeCurvePoint2D } from "../../src/curve.js";
import { ACCENT, ACTION, COOL, FILL, HINT, RING, WARM, pageHeading, table2D } from "../shared/2d-page.js";

/** Control points are authored in the 3D curve page's units and scaled up to `world2d`. */
const UNIT = 100;

const p = (x: number, y: number): Vec2 => [x * UNIT, y * UNIT];

function node(x: number, y: number, inHandle?: Vec2, outHandle?: Vec2): CurvePoint2D {
  return {
    position: p(x, y),
    ...(inHandle === undefined ? {} : { in: inHandle }),
    ...(outHandle === undefined ? {} : { out: outHandle }),
  };
}

/** The reference `_create_*_curve` constructors, flattened onto the XY plane. */
const straightCurve = (): Curve2D => ({
  points: [node(-0.5, 0.18), node(0, -0.18), node(0.5, 0.18)],
});

const smoothSymmetricCurve = (shapeScale = 1): Curve2D => ({
  points: [
    node(-0.55, 0.2 * shapeScale, undefined, p(0.28, -0.35 * shapeScale)),
    node(0, -0.2 * shapeScale, p(-0.28, 0.35 * shapeScale), p(0.28, -0.35 * shapeScale)),
    node(0.55, 0.2 * shapeScale, p(-0.28, 0.35 * shapeScale)),
  ],
});

const flatHandleCurve = (): Curve2D => ({
  points: [node(-0.55, 0, undefined, p(0.32, 0)), node(0.55, 0, p(-0.32, 0))],
});

const brokenCornerCurve = (): Curve2D => ({
  points: [
    node(-0.55, 0.18, undefined, p(0.28, -0.08)),
    node(0, -0.24, p(-0.18, 0.34), p(0.12, 0.34)),
    node(0.55, 0.18, p(-0.28, -0.08)),
  ],
});

const oneSidedCurve = (): Curve2D => ({
  points: [
    node(-0.55, 0.18, undefined, p(0.38, -0.48)),
    node(0, -0.16),
    node(0.55, 0.18, p(-0.38, -0.48)),
  ],
});

const yCurve = (): Curve2D => ({
  points: [
    node(-0.55, -0.18, undefined, p(0.28, 0.36)),
    node(0, 0.22, p(-0.28, -0.34), p(0.28, -0.34)),
    node(0.55, -0.18, p(-0.28, 0.36)),
  ],
});

const closedCurve = (shapeScale: number): Curve2D => {
  const xRadius = 0.45 * shapeScale;
  const yRadius = 0.35 * shapeScale;
  const xHandle = 0.28 * shapeScale;
  const yHandle = 0.24 * shapeScale;
  return {
    closed: true,
    points: [
      node(-xRadius, 0, p(0, yHandle), p(0, -yHandle)),
      node(0, -yRadius, p(-xHandle, 0), p(xHandle, 0)),
      node(xRadius, 0, p(0, -yHandle), p(0, yHandle)),
      node(0, yRadius, p(xHandle, 0), p(-xHandle, 0)),
    ],
  };
};

const SHAPE_VALUES = [0.25, 0.65, 1, 1.35] as const;
const TOLERANCES = [1, 2, 4, 8] as const;
const WIDTHS = [1, 2, 4, 8] as const;
const ROTATIONS = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

const BASE = smoothSymmetricCurve();
const SHAPES = SHAPE_VALUES.map((value) => smoothSymmetricCurve(value));
const CLOSED: readonly Curve2D[] = [smoothSymmetricCurve(), closedCurve(1), closedCurve(0.75), closedCurve(1.25)];
const CONSTRUCTION: readonly { readonly curve: Curve2D; readonly title: string }[] = [
  { curve: straightCurve(), title: "straight" },
  { curve: smoothSymmetricCurve(), title: "smooth" },
  { curve: flatHandleCurve(), title: "flat handles" },
  { curve: brokenCornerCurve(), title: "broken" },
  { curve: oneSidedCurve(), title: "one-sided" },
  { curve: yCurve(), title: "y curve" },
  { curve: closedCurve(1), title: "closed" },
];

const CONSTRUCTION_GAP = 200;

/**
 * Reference `_draw_curve_control_points`: a pink anchor ring per control point, an amber ring and
 * edge per handle. The 2D page draws them as pixel-sized points and one-pixel edges.
 */
const ANCHOR_RING_RADIUS = 8;
const HANDLE_RING_RADIUS = 5;
const CONTROL_RING_WIDTH = 1.5;

function drawControlPoints(d2: FrameDrawList2D, curve: Curve2D, transform: CurveTransform2D): void {
  // Hollow rings like the 3D page's `_draw_curve_control_points`: the anchor is larger than the
  // handle tips, and both are outlines rather than filled dots.
  const ring = (center: Vec2, radius: number, color: Color): void => {
    d2.circle(center, radius, { strokeWidth: CONTROL_RING_WIDTH, color });
  };
  for (const point of curve.points) {
    // Anchors and handles are both placed from local control points; only the transform moves
    // them, so the handle tip cannot pick up the centre twice.
    const anchor = placeCurvePoint2D(point.position, transform);
    const handle = (offset: Vec2): void => {
      const local: Vec2 = [point.position[0] + offset[0], point.position[1] + offset[1]];
      const tip = placeCurvePoint2D(local, transform);
      d2.line(anchor, tip, { width: 1, color: ACTION });
      ring(tip, HANDLE_RING_RADIUS, ACTION);
    };
    if (point.in !== undefined) handle(point.in);
    if (point.out !== undefined) handle(point.out);
    ring(anchor, ANCHOR_RING_RADIUS, ACCENT);
  }
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-curves");
  const { d2, shapeX, rowY, rows } = table2D(drawList, "2d-curves");
  const dashPhase = context.time * DASH_SPEED;

  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.curve(BASE, { width: WIDTHS[row], color: RING, transform: { center: [shapeX(0), y] } });
    d2.curve(SHAPES[row]!, { width: 2, color: FILL, transform: { center: [shapeX(1), y] } });
    d2.curve(BASE, {
      width: 2,
      color: WARM,
      transform: { center: [shapeX(2), y], rotation: ROTATIONS[row] },
    });
    d2.curve(BASE, {
      width: 2,
      color: COOL,
      tolerance: TOLERANCES[row],
      transform: { center: [shapeX(3), y] },
    });
    d2.curve(CLOSED[row]!, { width: 2, color: FILL, transform: { center: [shapeX(4), y] } });
    const [visible, gap] = DASHES[row]!;
    d2.curve_d(BASE, [visible, gap, dashPhase], {
      width: 2,
      color: ACCENT,
      transform: { center: [shapeX(5), y] },
    });
  }

  // Construction band under the matrix: every curve shape with its anchors and handles visible.
  const bandY = rowY(rows - 1) - 100;
  CONSTRUCTION.forEach((sample, index) => {
    const center: Vec2 = [(index - (CONSTRUCTION.length - 1) / 2) * CONSTRUCTION_GAP, bandY];
    const transform: CurveTransform2D = { center };
    d2.curve(sample.curve, { width: 1.5, color: HINT, tolerance: 1, transform });
    drawControlPoints(d2, sample.curve, transform);
    drawList.text([center[0], bandY - 46, 0], sample.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: 16,
      anchor: "top-center",
      color: HINT,
      depthTest: false,
    });
  });
}
