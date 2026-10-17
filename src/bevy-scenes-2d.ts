/**
 * bevy 2D reference pages.
 *
 * These are vgpu's own capability pages built on `frame.d2`, not ports of a Godot addon: the
 * reference addon has no 2D API, so the models are bevy's `2d_gizmos` and `2d_shapes`. That also
 * means the coordinate convention is bevy's: the origin sits at the canvas centre, +y points up,
 * and one world unit covers one canvas pixel before the 2D camera's pan and zoom.
 *
 * Two conventions carry over from the text pages: a page heading in the top-left corner (a
 * screen-space block, so the labels stay put while the 2D camera pans), and one shape per column
 * with the row meaning stated once.
 */

import type { Color, FrameRecorder } from "./frame-recorder.js";
import type { FrameRecorder2D } from "./frame-recorder-2d.js";

const TITLE: Color = [0.92, 0.95, 1, 1];
const HINT: Color = [0.55, 0.62, 0.72, 1];
const GRID: Color = [0.32, 0.36, 0.44, 0.55];
const FILL: Color = [0.93, 0.95, 0.98, 1];
const RING: Color = [0.55, 0.72, 1, 1];
const WARM: Color = [1, 0.72, 0.36, 1];
const COOL: Color = [0.42, 0.86, 0.78, 1];
const ACCENT: Color = [1, 0.55, 0.66, 1];
const ACTION: Color = [0.98, 0.86, 0.42, 1];

/** Page heading: a screen-space title and note, fixed to the top-left corner. */
function heading(recorder: FrameRecorder, title: string, note: string): void {
  recorder.text([24, 16, 0], title, { space: "screen", fontSize: 17, anchor: "top-left", color: TITLE });
  recorder.text([24, 38, 0], note, { space: "screen", fontSize: 12, anchor: "top-left", color: HINT });
}

/**
 * Dispatches the 2D pages. Returns false for every other id so `buildScene` can fall through to
 * the 3D scenes.
 */
export function buildScene2D(id: string, recorder: FrameRecorder, time: number): boolean {
  switch (id) {
    case "2d-gizmos":
      gizmos2D(recorder, time);
      return true;
    case "2d-shapes":
      shapes2D(recorder);
      return true;
    default:
      return false;
  }
}

/** The twelve bevy 2D primitives, filled in one row and outlined in the next. */
function shapes2D(recorder: FrameRecorder): void {
  heading(recorder, "2D Shapes", "bevy 2d_shapes · filled row, ring row · drag to pan, scroll to zoom");
  const d2 = recorder.d2;
  const columns = 12;
  const spacing = 100;
  const startX = -((columns - 1) * spacing) / 2;
  for (let index = 0; index < columns; index++) {
    const x = startX + index * spacing;
    drawShape(d2, index, [x, 110], true);
    // The two polyline shapes have no interior to outline.
    if (index < 10) drawShape(d2, index, [x, -110], false);
  }
}

/** One column of `shapes2D`, in the order bevy's `2d_shapes` example lists them. */
function drawShape(d2: FrameRecorder2D, shape: number, center: [number, number], filled: boolean): void {
  const style = { fill: filled, strokeWidth: 4, color: filled ? FILL : RING };
  const [x, y] = center;
  switch (shape) {
    case 0: // Circle::new(50)
      d2.circle(center, 50, style);
      return;
    case 1: // CircularSector::new(50, 1.0)
      d2.sector(center, 50, { ...style, sweep: 1.0 });
      return;
    case 2: // CircularSegment::new(50, 1.25)
      d2.segment(center, 50, { ...style, sweep: 1.25 });
      return;
    case 3: // Ellipse::new(25, 50)
      d2.ellipse(center, [25, 50], style);
      return;
    case 4: // Annulus::new(25, 50)
      d2.annulus(center, 25, 50, style);
      return;
    case 5: // Capsule2d::new(25, 50)
      d2.capsule(center, 25, 50, style);
      return;
    case 6: // Rhombus::new(75, 100)
      d2.rhombus(center, [75, 100], style);
      return;
    case 7: // Rectangle::new(50, 100)
      d2.rect(center, [50, 100], style);
      return;
    case 8: // RegularPolygon::new(50, 6)
      d2.polygon(center, 50, 6, style);
      return;
    case 9: // Triangle2d::new(Vec2::Y * 50, Vec2::new(-50, -50), Vec2::new(50, -50))
      d2.triangle([x, y + 50], [x - 50, y - 50], [x + 50, y - 50], style);
      return;
    case 10: // Segment2d::new(Vec2::new(-50, 50), Vec2::new(50, -50))
      d2.line([x - 50, y + 50], [x + 50, y - 50], { width: 8, color: filled ? FILL : RING });
      return;
    default: // Polyline2d::new([(-50, 50), (0, -50), (50, 50)])
      d2.lineStrip([[x - 50, y + 50], [x, y - 50], [x + 50, y + 50]], {
        width: 8,
        joint: "round",
        color: filled ? FILL : RING,
      });
  }
}

/** bevy's `2d_gizmos` example, rebuilt with the stroke and shape primitives. */
function gizmos2D(recorder: FrameRecorder, time: number): void {
  heading(recorder, "2D Gizmos", "bevy 2d_gizmos · strokes and outlined shapes · drag to pan, scroll to zoom");
  const d2 = recorder.d2;

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
  d2.line([-460, -20], [-260, -20], { width: 6, dash: [20, 14, 0], color: RING });

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

/** Two crossing strokes, bevy's `cross_2d`. */
function cross(d2: FrameRecorder2D, center: [number, number], size: number, color: Color): void {
  const [x, y] = center;
  d2.line([x - size, y], [x + size, y], { width: 3, color });
  d2.line([x, y - size], [x, y + size], { width: 3, color });
}
