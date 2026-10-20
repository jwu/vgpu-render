/**
 * `hit-shake`: the third channel of hit feedback — the body itself being knocked off its square.
 *
 * The two pages beside this one spend the hit on something drawn *over* the unit (`hit-mark`'s cut,
 * `hit-flash`'s white disc). This one spends it on the unit's own position: the body is nudged left
 * and right a few times and settles back. Small on purpose — a hit shake that carries the body more
 * than its own radius stops reading as an impact and starts reading as a dash.
 *
 * The curve decides only how fast the swing dies, on the same `1 - eased` envelope `hit-flash` puts
 * on its alpha. `out` rows are a body that snaps home on the impact frame; `in` rows keep it moving
 * until almost the end and then stop it dead.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { actionPhase, DEFAULT_DURATION } from "../action-phase.js";
import type { Easing } from "../easing.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";
import { drawUnitDisc } from "../unit.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/** Share of the loop the shake takes; the rest is the wait before the next hit. */
const ACTION_RATIO = 0.5;

/** The plot playhead, the curve's own blue-white so it never reads as part of the effect. */
const PLAYHEAD_COLOR = [0.82, 0.9, 1, 1] as const;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The signed offset from the rest position, in `world2d` units.
 *
 * `envelope` is `1 - ease(progress)`, the same reading `hit-flash` puts on its alpha: the curve is
 * how fast the hit is spent, not how far the body travels. The cosine carries the swing and is at
 * full amplitude on the impact frame — a sine would start the page at rest, which is the one
 * instant the shake must not be invisible.
 */
export function shakeOffsetAt(ease: Easing, progress: number, amplitude: number, cycles: number): number {
  const p = clamp01(progress);
  const envelope = amplitude * clamp01(1 - ease(p));
  return envelope * Math.cos(p * cycles * Math.PI * 2);
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  drawHeadings(drawList);
  forEachCell((cell) => drawCell(drawList, context, cell));
}

function drawCell(drawList: FrameDrawList, context: VfxSceneContext, cell: MatrixCell): void {
  const params = context.params;
  const phase = actionPhase(context.time, cell.ease, params.duration, ACTION_RATIO, LOOP_SECONDS);

  drawCurvePlot(drawList, plotOrigin(cell.center), cell.ease, phase.progress, PLAYHEAD_COLOR);

  const offset = shakeOffsetAt(cell.ease, phase.progress, params.amplitude, params.cycles);
  drawUnitDisc(drawList, [cell.center[0] + offset, cell.center[1]], params.unitRadius, params.unitHue, params.unitSaturation);
}
