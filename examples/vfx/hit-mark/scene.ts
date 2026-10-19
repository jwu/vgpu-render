/**
 * `hit-mark`: the hit the battle simulator resolves, drawn on a real unit.
 *
 * This is the second half of the simulator's melee pair, split out from `battle-slash` so it can be
 * looked at on its own: a thin blazing rhombus is cut across the victim's body, its long axis
 * stretching outward while it fades. The unit body is here because the mark is only readable against
 * it — a slash across empty grid is just a diamond. The simulator's white hit flash is left out: it
 * covers the very body this page exists to show.
 *
 * The unit and the mark are the simulator's own numbers: a navy disc with a bright rim (its ally
 * palette), a `#ffd23f` rhombus whose thickness is 0.225 of its length, both in `world2d` units so
 * they scale with the camera. The matrix turns the timing into the thing being compared: each cell
 * spends its curve on stretching and fading the same mark.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { outCirc } from "../easing.js";
import { DEFAULT_DURATION, actionPhase } from "../action-phase.js";
import { hueColor, withAlpha } from "../params.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";
import { drawUnitDisc } from "../unit.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/** Share of the loop the hit takes; the rest is the wait before the next one. */
const ACTION_RATIO = 0.5;

/**
 * The mark's thickness as a share of its length. The simulator uses 0.18 / 0.8: thin enough to read
 * as a cut rather than a blade, thick enough not to collapse into a 1px line when zoomed out.
 */
const MARK_WIDTH_RATIO = 0.225;

const DEG = Math.PI / 180;

/**
 * The plot playhead. Kept off the mark's hue on purpose: the only mark-coloured thing in a cell
 * should be the cut, so the marker that says "we are here on the curve" is the curve's own blue-white.
 */
const PLAYHEAD_COLOR = [0.82, 0.9, 1, 1] as const;

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  drawHeadings(drawList);
  forEachCell((cell) => drawCell(drawList, context, cell));
}

function drawCell(drawList: FrameDrawList, context: VfxSceneContext, cell: MatrixCell): void {
  const d2 = drawList.d2;
  const params = context.params;
  const phase = actionPhase(context.time, cell.ease, params.duration, ACTION_RATIO, LOOP_SECONDS);
  const heading = params.heading * DEG;

  drawCurvePlot(drawList, plotOrigin(cell.center), cell.ease, phase.progress, PLAYHEAD_COLOR);

  const markColor = hueColor(params.markHue, params.markSaturation, 1);

  // The victim first: the mark reads as something happening *to* this disc, so it has to be drawn
  // over it.
  drawUnitDisc(drawList, cell.center, params.unitRadius, params.unitHue, params.unitSaturation);

  // The mark: thin rhombus, long axis stretching outward from the centre while it fades.
  if (params.mark > 1e-3 && phase.fade > 1e-3) {
    const halfLength = (params.mark / 2) * (1 + params.stretch * phase.eased);
    // `rhombus_s` takes the full diagonals: the long axis is the stretched total, the short one is
    // fixed — stretching only the long axis is what makes the cut look like it is being pulled apart.
    const diagonals: readonly [number, number] = [halfLength * 2, params.mark * MARK_WIDTH_RATIO];
    d2.rhombus_s(cell.center, diagonals, {
      // `world2d` rotates anticlockwise, so "top-left to bottom-right" is -45°. Which diagonal it
      // is follows the heading, the same side test the simulator uses for the swing itself.
      rotation: Math.cos(heading) < 0 ? (-Math.PI * 3) / 4 : -Math.PI / 4,
      color: withAlpha(markColor, phase.fade),
    });
  }
}
