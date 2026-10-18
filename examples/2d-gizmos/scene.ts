/**
 * `2d-gizmos`: bevy's `2d_gizmos` example, rebuilt with the stroke and shape primitives.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, ACTION, COOL, GRID, RING, WARM, cross, heading } from "../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  heading(drawList, "2D Gizmos", "strokes and outlined shapes · drag or WASD to pan, scroll to zoom");
  const d2 = drawList.d2;
  const time = context.time;

  // Background grid, drawn first so the strokes sit on top of it.
  const cell = 60;
  for (let index = -6; index <= 6; index++) {
    d2.line([index * cell, -260], [index * cell, 260], { width: 1, color: GRID });
    d2.line([-380, index * cell], [380, index * cell], { width: 1, color: GRID });
  }

  // line and ray.
  d2.line([-460, 200], [-300, 200], { width: 5, color: ACTION });
  d2.ray([-460, 140], [160, -40], { width: 5, color: COOL });

  // Joined strip (round joints) and a dashed stroke with the same width.
  d2.lineStrip(
    [[-460, 60], [-410, 0], [-360, 60], [-310, 0], [-260, 60]],
    { width: 6, joint: "round", color: RING },
  );
  d2.line([-460, -20], [-260, -20], { width: 6, dash: [20, 14, time * 30], color: RING });

  // Outlined boxes, one with rounded corners.
  d2.rect([-120, 170], [120, 80], { fill: false, strokeWidth: 4, color: WARM });
  d2.roundedRect([-120, 40], [140, 80], 26, { fill: false, strokeWidth: 4, color: WARM });
  d2.grid([-120, -100], [4, 3], [40, 40], { width: 2, color: WARM });

  // Circle, ellipse and an arc.
  d2.circle([120, 170], 55, { fill: false, strokeWidth: 4, color: ACCENT });
  d2.ellipse([120, 60], [75, 35], { fill: false, strokeWidth: 4, color: ACCENT });
  d2.arc([120, -80], 55, { fill: false, strokeWidth: 4, startAngle: 0.4, sweep: 2.2, color: ACCENT });

  // Cross marker.
  for (const [x, y] of [[340, 200], [400, 200], [370, 170], [370, 230]] as const) {
    d2.point([x, y], { size: 4, round: true, color: ACTION });
  }
  cross(d2, [340, 170], 34, ACTION);
  cross(d2, [340, 230], 34, ACTION);

  // Arrow: a shaft plus a filled triangle head that swings with time.
  const angle = 1.1 + Math.sin(time * 0.9) * 0.5;
  const origin: [number, number] = [330, 60];
  const tip: [number, number] = [origin[0] + Math.cos(angle) * 140, origin[1] + Math.sin(angle) * 140];
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const back = 22;
  const spread = 11;
  d2.line(origin, tip, { width: 5, color: ACTION });
  d2.triangle(
    tip,
    [tip[0] - ux * back - uy * spread, tip[1] - uy * back + ux * spread],
    [tip[0] - ux * back + uy * spread, tip[1] - uy * back - ux * spread],
    { color: ACTION },
  );

  // A travelling sine curve, sampled into a strip.
  const wave: [number, number][] = [];
  for (let step = 0; step <= 64; step++) {
    const x = -460 + step * 12;
    wave.push([x, -170 + Math.sin((x + time * 90) / 55) * 34]);
  }
  d2.lineStrip(wave, { width: 4, color: COOL });

  // Outlined hexagon and a filled diamond, the two closed shapes bevy's example draws last.
  d2.polygon([330, -170], 60, 6, { fill: false, strokeWidth: 4, color: WARM });
  d2.rhombus([450, -170], [90, 110], { color: ACCENT });
}
