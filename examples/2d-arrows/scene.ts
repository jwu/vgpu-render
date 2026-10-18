/**
 * `2d-arrows`: the arrow API across width, head length, head angle, direction, joint and dashes.
 *
 * `arrow` draws the open V head and `arrow_s` the filled one, so every parameter is shown in both
 * forms; `arrow_d` / `arrow_s_d` add the dash pattern to the same two shapes.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { Vec2 } from "../../src/camera-2d.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, ACTION, COOL, RING, WARM, pageHeading, table2D } from "../shared/2d-page.js";

const deg = Math.PI / 180;
const BASE_ANGLE = -30 * deg;
const LENGTH = 72;
const WIDTHS = [2, 4, 6, 8] as const;
const HEAD_LENGTHS = [14, 20, 26, 34] as const;
const HEAD_ANGLES = [20, 30, 45, 75].map((angle) => angle * deg);
const DIRECTIONS = [-63, -22, 22, 63].map((angle) => angle * deg);
const JOINTS = ["none", "round", "bevel", "miter"] as const;
const DASHES = [[24, 8], [12, 12], [6, 18], [2, 12]] as const;
const DASH_SPEED = 30;

/** Arrow direction vector: `LENGTH` long, pointing along `angle`. */
const along = (angle: number): Vec2 => [Math.cos(angle) * LENGTH, Math.sin(angle) * LENGTH];

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-arrows");
  const { d2, shapeX, rowY, rows } = table2D(drawList, "2d-arrows");
  const dashPhase = context.time * DASH_SPEED;
  const originX = (column: number): number => shapeX(column) - 40;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const origin = (column: number): Vec2 => [originX(column), y];
    // width: filled / line
    d2.arrow_s(origin(0), along(BASE_ANGLE), { width: WIDTHS[row], color: WARM });
    d2.arrow(origin(1), along(BASE_ANGLE), { width: WIDTHS[row], color: RING });
    // head length: filled / line
    d2.arrow_s(origin(2), along(BASE_ANGLE), { width: 2, headLength: HEAD_LENGTHS[row], color: ACTION });
    d2.arrow(origin(3), along(BASE_ANGLE), { width: 2, headLength: HEAD_LENGTHS[row], color: COOL });
    // head angle: filled / line
    d2.arrow_s(origin(4), along(BASE_ANGLE), { width: 2, headAngle: HEAD_ANGLES[row]!, color: ACCENT });
    d2.arrow(origin(5), along(BASE_ANGLE), { width: 2, headAngle: HEAD_ANGLES[row]!, color: ACTION });
    // direction: filled / line
    d2.arrow_s(origin(6), along(DIRECTIONS[row]!), { width: 2, color: COOL });
    d2.arrow(origin(7), along(DIRECTIONS[row]!), { width: 2, color: RING });
    // joint on the line head
    d2.arrow(origin(8), along(BASE_ANGLE), { width: 2, joint: JOINTS[row]!, color: WARM });
    // dash: line / filled head
    const [visible, gap] = DASHES[row]!;
    d2.arrow_d(origin(9), along(BASE_ANGLE), [visible, gap, dashPhase], { width: 2, color: ACTION });
    d2.arrow_s_d(origin(10), along(BASE_ANGLE), [visible, gap, dashPhase], { width: 2, color: WARM });
  }
}
