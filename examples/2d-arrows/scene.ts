/**
 * `2d-arrows`: filled and line heads across the same parameters the 3D arrow page uses.
 *
 * Both styles share one shaft and the same open V outline: the outline's `joint` decides how
 * the tip is finished, so the filled head gets the same round tip as the line head instead of
 * a raw triangle corner. The only difference is the extra triangle inside the V.
 */

import type { Color, FrameDrawList, LineJoint } from "../../src/frame-draw-list.js";
import type { FrameDrawList2D } from "../../src/frame-draw-list-2d.js";
import type { Vec2 } from "../../src/camera-2d.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, pageHeading, table2D } from "../shared/2d-page.js";

type ArrowStyle = {
  readonly color: Color;
  readonly width: number;
  readonly headLength: number;
  readonly headAngle: number;
  readonly joint: LineJoint;
  readonly dash?: readonly [number, number, number];
};

type ArrowHead = {
  readonly tip: Vec2;
  readonly backLeft: Vec2;
  readonly backRight: Vec2;
};

/** The V the two styles share. The outline joint finishes the tip. */
function headGeometry(origin: Vec2, angle: number, length: number, style: ArrowStyle): ArrowHead {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const tip: Vec2 = [origin[0] + ux * length, origin[1] + uy * length];
  const back: Vec2 = [tip[0] - ux * style.headLength, tip[1] - uy * style.headLength];
  const halfWidth = Math.tan(style.headAngle) * style.headLength;
  return {
    tip,
    backLeft: [back[0] + nx * halfWidth, back[1] + ny * halfWidth],
    backRight: [back[0] - nx * halfWidth, back[1] - ny * halfWidth],
  };
}

function drawShaft(d2: FrameDrawList2D, origin: Vec2, tip: Vec2, style: ArrowStyle): void {
  d2.line(origin, tip, {
    width: style.width,
    color: style.color,
    ...(style.dash === undefined ? {} : { dash: style.dash }),
  });
}

/**
 * Filled head: a clean triangle with a round tip.
 *
 * The tip is a disc of the shaft's half-width, the same radius the line head's round joint
 * produces. The triangle itself is not stroked, so its base corners stay clean instead of
 * growing the round end-caps a V outline would leave there.
 */
function drawFilledArrow(d2: FrameDrawList2D, origin: Vec2, angle: number, length: number, style: ArrowStyle): void {
  const head = headGeometry(origin, angle, length, style);
  // Stop the shaft at the base midpoint: it touches the triangle instead of running through it.
  const baseCenter: Vec2 = [
    head.tip[0] - Math.cos(angle) * style.headLength,
    head.tip[1] - Math.sin(angle) * style.headLength,
  ];
  drawShaft(d2, origin, baseCenter, style);
  d2.triangle(head.tip, head.backLeft, head.backRight, { color: style.color });
}

/** Line head: a shaft plus the open V outline. */
function drawLineArrow(d2: FrameDrawList2D, origin: Vec2, angle: number, length: number, style: ArrowStyle): void {
  const head = headGeometry(origin, angle, length, style);
  drawShaft(d2, origin, head.tip, style);
  d2.lineStrip([head.backLeft, head.tip, head.backRight], {
    width: style.width,
    color: style.color,
    joint: style.joint,
  });
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-arrows");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-arrows");

  // Same parameter tables as the 3D arrow page, scaled from world units to canvas pixels.
  const widths = [2, 4, 6, 8] as const;
  const headLengths = [14, 20, 26, 34] as const;
  const headAngles = [Math.PI / 9, Math.PI / 6, Math.PI / 4, Math.PI * 0.42] as const;
  const directions = [-Math.PI * 0.35, -Math.PI * 0.12, Math.PI * 0.12, Math.PI * 0.35] as const;
  const joints: readonly LineJoint[] = ["none", "round", "bevel", "miter"];
  const dashes: readonly (readonly [number, number])[] = [[24, 8], [12, 12], [6, 18], [2, 12]];

  const length = 72;
  const baseAngle = Math.PI * 0.06;
  const base = { width: 4, headLength: 22, headAngle: Math.PI / 6, joint: "round" } as const;
  const dashPhase = context.time * 30;
  const y = (row: number): number => rowY(row) - 22;
  const originX = (column: number): number => columnX(column) - 40;

  for (let row = 0; row < rows; row++) {
    // width: filled / line
    drawFilledArrow(d2, [originX(0), y(row)], baseAngle, length, { ...base, color: WARM, width: widths[row]! });
    drawLineArrow(d2, [originX(1), y(row)], baseAngle, length, { ...base, color: RING, width: widths[row]! });

    // head length: filled / line
    drawFilledArrow(d2, [originX(2), y(row)], baseAngle, length, { ...base, color: ACTION, headLength: headLengths[row]! });
    drawLineArrow(d2, [originX(3), y(row)], baseAngle, length, { ...base, color: COOL, headLength: headLengths[row]! });

    // head angle: filled / line
    drawFilledArrow(d2, [originX(4), y(row)], baseAngle, length, { ...base, color: ACCENT, headAngle: headAngles[row]! });
    drawLineArrow(d2, [originX(5), y(row)], baseAngle, length, { ...base, color: ACTION, headAngle: headAngles[row]! });

    // direction: filled / line
    drawFilledArrow(d2, [originX(6), y(row)], directions[row]!, length, { ...base, color: COOL });
    drawLineArrow(d2, [originX(7), y(row)], directions[row]!, length, { ...base, color: RING });

    // joint: line head only (the filled head has no stroked outline)
    drawLineArrow(d2, [originX(8), y(row)], baseAngle, length, { ...base, color: WARM, joint: joints[row]! });

    // dash: filled / line
    const [dash, space] = dashes[row]!;
    drawFilledArrow(d2, [originX(9), y(row)], baseAngle, length, { ...base, color: ACTION, dash: [dash, space, dashPhase] });
    drawLineArrow(d2, [originX(10), y(row)], baseAngle, length, { ...base, color: WARM, dash: [dash, space, dashPhase] });
  }
}
