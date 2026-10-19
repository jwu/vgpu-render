/**
 * `hit-flash`: the white flash the battle simulator puts on a unit the instant a hit lands.
 *
 * The simulator draws it as a plain white disc over the whole unit — body, rim and letter — lifted on
 * `1 - easeInCirc`, i.e. almost gone by the time the eye has registered it. That is the whole effect:
 * there is no ring, no flash sprite, just "this body was just struck".
 *
 * The unit is part of the page because the flash means nothing without it: a white disc on empty grid
 * is a circle. The matrix turns the decay into the thing being compared — `inCirc` is the simulator's
 * own timing, and the rest of the cells show what a slower or faster curve does to the same flash.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { actionPhase, DEFAULT_DURATION } from "../action-phase.js";
import { hueColor } from "../params.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";
import { drawUnitDisc } from "../unit.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/** Share of the loop the flash takes; the rest is the wait before the next hit. */
const ACTION_RATIO = 0.5;

/** The plot playhead, the curve's own blue-white so it never reads as part of the effect. */
const PLAYHEAD_COLOR = [0.82, 0.9, 1, 1] as const;

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  drawHeadings(drawList);
  forEachCell((cell) => drawCell(drawList, context, cell));
}

function drawCell(drawList: FrameDrawList, context: VfxSceneContext, cell: MatrixCell): void {
  const d2 = drawList.d2;
  const params = context.params;
  const phase = actionPhase(context.time, cell.ease, params.duration, ACTION_RATIO, LOOP_SECONDS);

  drawCurvePlot(drawList, plotOrigin(cell.center), cell.ease, phase.progress, PLAYHEAD_COLOR);

  // The body first: the flash is read as something happening *to* it, so it has to cover it.
  drawUnitDisc(drawList, cell.center, params.unitRadius, params.unitHue, params.unitSaturation);

  const alpha = params.flash * phase.fade;
  if (alpha <= 1e-3) return;
  // A filled disc of the same radius as the body, exactly like the simulator's `fx`-layer overlay.
  // `fade` is `1 - eased`, so the cell whose curve is `inCirc` reproduces the simulator's own timing.
  d2.circle_s(cell.center, params.unitRadius, {
    color: hueColor(params.flashHue, params.flashSaturation, 1, alpha),
  });
}
