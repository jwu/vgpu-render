/**
 * `pillar-appear`: a column of light growing up from the ground, played across the easing matrix.
 *
 * It is built from three nested fills of the same width-and-height family — a wide dim halo, a
 * narrower brighter core, and a near-white filament — plus a flat ellipse where it meets the ground
 * and a small bloom at the tip. The column grows out of nothing while it fades: early it is a short
 * bright sliver, late it is a tall faint shaft, so a single instant reads as a point on its way up.
 *
 * The matrix turns that climb into the comparison: `outExpo` shoots up and is gone almost at once,
 * `inQuad` barely leaves the ground, and everything between shows the same column at a different
 * point of its appearance.
 *
 * Everything is `world2d` and sized in world units, so the column keeps its proportions at any zoom.
 * The height is capped just under the space between two rows: the plot above each cell is the
 * neighbouring row's, and a taller shaft would run into it.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { actionPhase, DEFAULT_DURATION } from "../action-phase.js";
import { hueColor } from "../params.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";
import { drawPillarShaft } from "../pillar.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/** Share of the loop the column takes to rise and fade; the rest is the wait before the next one. */
const ACTION_RATIO = 0.5;

/**
 * Where the column meets the ground, relative to the cell centre. Slightly below centre so the
 * shaft reads as rising out of a floor rather than growing from a dot in the middle.
 */
const GROUND_Y = -0.35;

/** The plot playhead, the curve's own blue-white so it never reads as part of the effect. */
const PLAYHEAD_COLOR = [0.82, 0.9, 1, 1] as const;

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  drawHeadings(drawList);
  forEachCell((cell) => drawCell(drawList, context, cell));
}

function drawCell(drawList: FrameDrawList, context: VfxSceneContext, cell: MatrixCell): void {
  const params = context.params;
  const phase = actionPhase(context.time, cell.ease, params.duration, ACTION_RATIO, LOOP_SECONDS);

  drawCurvePlot(drawList, plotOrigin(cell.center), cell.ease, phase.progress, PLAYHEAD_COLOR);

  // Height climbs with the curve and opacity falls with it: a short hot sliver at the start, a tall
  // faint shaft at the end. Both read from the same `eased`, so the two can never disagree.
  //
  // The fade is the square root of `1 - eased` on purpose: a linear fade puts the tall cells so far
  // below 10% opacity that the column reads as "missing" at the very moment it is tallest, and the
  // comparison collapses into "which cells still have something". The curve's shape is still what
  // decides how fast it happens; only the overall brightness is lifted.
  const height = params.height * phase.eased;
  const alpha = Math.sqrt(phase.fade);
  if (height <= 1e-3 || alpha <= 1e-3) return;

  // One colour for every layer: the falloff is the alpha ladder inside `drawPillarShaft`, so there
  // is nothing to blend between and nothing round added on top.
  drawPillarShaft(
    drawList,
    [cell.center[0], cell.center[1] + GROUND_Y],
    params.width,
    height,
    alpha,
    hueColor(params.hue, params.saturation, 1),
  );
}
