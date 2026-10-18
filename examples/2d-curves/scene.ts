/**
 * `2d-curves`: arc sweep and start angle, short and long arcs between points, sampled curves.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import type { FrameDrawList2D, Shape2DOptions } from "../../src/frame-draw-list-2d.js";
import type { Vec2 } from "../../src/camera-2d.js";
import { COLUMN_SPACING } from "../shared/2d-labels.js";
import { ACCENT, ACTION, COOL, RING, WARM, pageHeading, table2D } from "../shared/2d-page.js";

const TAU = Math.PI * 2;

function mixColor(from: Color, to: Color, t: number): Color {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
    from[3] + (to[3] - from[3]) * t,
  ];
}

/**
 * A stroke that fades from one colour to the other over its whole length. One `line` per segment
 * rather than a single `lineStrip`, because a strip's `color`/`colorEnd` repeats per segment.
 */
function gradientStrip(d2: FrameDrawList2D, points: readonly Vec2[], from: Color, to: Color, width: number): void {
  const segments = points.length - 1;
  for (let index = 0; index < segments; index++) {
    d2.line(points[index]!, points[index + 1]!, {
      width,
      color: mixColor(from, to, index / segments),
      colorEnd: mixColor(from, to, (index + 1) / segments),
    });
  }
}

function pointAt(center: Vec2, radius: number, angle: number): Vec2 {
  return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
}

/**
 * bevy's `short_arc_2d_between` / `long_arc_2d_between`: an arc of the circle through `from`
 * around `center`, ending at the direction of `to`. The short form takes the sweep with the
 * smaller absolute angle, the long form the other one.
 */
function arcBetween(
  d2: FrameDrawList2D,
  center: Vec2,
  from: Vec2,
  to: Vec2,
  long: boolean,
  options: Shape2DOptions,
): void {
  const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const radius = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const raw = Math.atan2(to[1] - center[1], to[0] - center[0]) - start;
  const counterClockwise = ((raw % TAU) + TAU) % TAU;
  const sweep = long
    ? (counterClockwise <= Math.PI ? counterClockwise - TAU : counterClockwise)
    : (counterClockwise <= Math.PI ? counterClockwise : counterClockwise - TAU);
  d2.arc(center, radius, { ...options, startAngle: start, sweep });
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  pageHeading(drawList, "2d-curves");
  const { d2, columnX, rowY, rows } = table2D(drawList, "2d-curves");
  const sweeps = [Math.PI / 3, (Math.PI * 2) / 3, (Math.PI * 4) / 3, (Math.PI * 11) / 6] as const;
  const starts = [0, Math.PI / 2, Math.PI, Math.PI * 1.5] as const;
  const between = [
    [20, 100],
    [20, 150],
    [20, 250],
    [20, 340],
  ] as const;
  const waves = [1, 2, 3, 4] as const;
  const gradients: readonly (readonly [Color, Color])[] = [
    [ACTION, RING],
    [COOL, WARM],
    [ACCENT, COOL],
    [WARM, ACTION],
  ];
  const deg = Math.PI / 180;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.arc([columnX(0), y], 42, {
      fill: false,
      strokeWidth: 5,
      startAngle: -Math.PI / 2,
      sweep: sweeps[row]!,
      color: RING,
    });
    d2.arc([columnX(1), y], 42, {
      fill: false,
      strokeWidth: 5,
      startAngle: starts[row]!,
      sweep: Math.PI * 0.75,
      color: ACCENT,
    });
    const [fromAngle, toAngle] = between[row]!;
    const shortCenter: Vec2 = [columnX(2), y];
    arcBetween(
      d2,
      shortCenter,
      pointAt(shortCenter, 42, fromAngle * deg),
      pointAt(shortCenter, 42, toAngle * deg),
      false,
      { fill: false, strokeWidth: 5, color: COOL },
    );
    const longCenter: Vec2 = [columnX(3), y];
    arcBetween(
      d2,
      longCenter,
      pointAt(longCenter, 38, fromAngle * deg),
      pointAt(longCenter, 38, toAngle * deg),
      true,
      { fill: false, strokeWidth: 5, color: WARM },
    );

    const waveCount = waves[row]!;
    const sine: Vec2[] = [];
    for (let step = 0; step <= 72; step++) {
      const t = step / 72;
      sine.push([columnX(4) - 62 + t * 124, y + Math.sin(t * TAU * waveCount) * 30]);
    }
    d2.lineStrip(sine, { width: 4, color: ACTION });
    const [gradientFrom, gradientTo] = gradients[row]!;
    gradientStrip(
      d2,
      sine.map(([x, sy]) => [x + COLUMN_SPACING, sy] as Vec2),
      gradientFrom,
      gradientTo,
      4,
    );
  }
}
