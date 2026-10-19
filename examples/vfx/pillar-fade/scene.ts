/**
 * `pillar-fade`: a column of light that is already at full height on its first frame, then scatters
 * away.
 *
 * The sibling of `pillar-appear`, with the opposite motion. That one grows into view — early frames
 * are a short bright sliver. This one starts complete, and what the clock takes away is its
 * definition: the shaft widens as it loses opacity, so the last frames are a wide dim haze rather
 * than a thin column.
 *
 * The matrix turns that dispersion into the comparison: at any instant the cells differ in how far
 * the column has widened, so a slow curve is still a crisp shaft while a fast one is already a haze.
 *
 * The column shape itself is shared with `pillar-appear` (see `../pillar.ts`); this page owns only
 * the timing.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { actionPhase, DEFAULT_DURATION } from "../action-phase.js";
import { hueColor } from "../params.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";
import { drawPillarShaft } from "../pillar.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/** Share of the loop the fade takes; the rest is the wait before the next column. */
const ACTION_RATIO = 0.5;

/**
 * Where the column meets the ground, relative to the cell centre. Slightly below centre so the
 * shaft reads as standing on a floor rather than growing from a dot in the middle.
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

  // The burst is full height from the first frame; only the definition goes away.
  //
  // `fade` goes negative once a curve overshoots past 1 (`outBack`, `outElastic`), and a negative
  // base to a fractional power is NaN — which would sail through the guard below and put a NaN
  // colour into the command list. Clamping first means an overshooting cell is simply over.
  //
  // The exponent is below 1 on purpose: the point of the fade is the wide dim haze it leaves, and a
  // steeper falloff made the fastest cells read as empty right when they were at their widest.
  const alpha = Math.max(0, phase.fade) ** 0.8;
  if (alpha <= 1e-3) return;

  // Only the shaft: same layered rectangles as `pillar-appear`, one colour, nothing round on top.
  // What the fade does is spread the width as the clock runs, which is the whole difference.
  drawPillarShaft(
    drawList,
    [cell.center[0], cell.center[1] + GROUND_Y],
    params.width * (1 + params.spread * phase.eased),
    params.height,
    alpha,
    hueColor(params.hue, params.saturation, 1),
  );
}
