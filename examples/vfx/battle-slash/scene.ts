/**
 * `battle-slash`: the swing the battle simulator draws, played across the same easing matrix.
 *
 * The simulator's swing is the opposite motion to `slash-arc`'s: it is **not** swept out. The first
 * frame is already a full hot arc, and then the arc retracts — its start edge travels toward its end
 * edge while the whole stroke fades, so what you watch is a leftover mark being wiped away rather
 * than an invisible blade travelling.
 *
 * Only the arc is drawn. The simulator also leaves a blazing rhombus on the victim, but that belongs
 * to the hit rather than to the swing, so it is deliberately left out here: this page compares the
 * timing of one stroke, and a second shape would only compete with the angle it is meant to show.
 *
 * Everything else mirrors the simulator's own choices: a stroke as wide as the radius (a thick band,
 * not a thin line), pure white, `world2d` units throughout so the effect scales with the camera, and
 * a stroke that keeps its weight while it retracts. The only thing the matrix adds is the curve: each
 * cell runs the same retract on a different easing.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { outCirc, type Easing } from "../easing.js";
import { DEFAULT_DURATION, actionPhase } from "../action-phase.js";
import { hueColor, withAlpha } from "../params.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/**
 * Share of the loop the retract takes. The rest is the wait before the next swing, which is what
 * makes a single strike readable instead of a permanent blur.
 */
const ACTION_RATIO = 0.5;

/**
 * `arc` rejects a zero sweep, and the easing curves hand back exactly 1 near the end (floating point
 * in `1 - (t - 1)` terms), so the last sliver of the arc is dropped by angle rather than by `progress`.
 */
const SWEEP_MIN = 1e-3;

/** The plot playhead, the same blue-white as the curve so it reads as a marker, not as a shape. */
const PLAYHEAD_COLOR = [0.82, 0.9, 1, 1] as const;

const DEG = Math.PI / 180;

/**
 * Where one swing is at `time`.
 *
 * `progress` is the raw position inside the action window (the plot playhead's x); `eased` is the
 * curve's value there, which drives both the retract and the fade. `remaining` is what is left of the
 * arc in radians, clamped to `[0, sweep]` because `back` and `elastic` overshoot in both directions.
 */
export type BattleSwingPhase = {
  readonly progress: number;
  readonly eased: number;
  readonly remaining: number;
  /** 1 at the first frame, 0 once the retract is done. */
  readonly fade: number;
};

export function battleSwingPhase(
  time: number,
  sweepRadians: number,
  ease: Easing = outCirc,
  duration: number = LOOP_SECONDS,
): BattleSwingPhase {
  const phase = actionPhase(time, ease, duration, ACTION_RATIO, LOOP_SECONDS);
  return {
    progress: phase.progress,
    eased: phase.eased,
    // `back`/`elastic` overshoot in both directions, so what is left of the arc is clamped: the
    // shape layer rejects a sweep outside `(0, 2π]`.
    remaining: Math.max(0, Math.min(sweepRadians, sweepRadians * (1 - phase.eased))),
    fade: phase.fade,
  };
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  drawHeadings(drawList);
  forEachCell((cell) => drawCell(drawList, context, cell));
}

function drawCell(drawList: FrameDrawList, context: VfxSceneContext, cell: MatrixCell): void {
  const d2 = drawList.d2;
  const params = context.params;
  const sweep = params.sweep * DEG;
  const heading = params.heading * DEG;
  const phase = battleSwingPhase(context.time, sweep, cell.ease, params.duration);

  drawCurvePlot(drawList, plotOrigin(cell.center), cell.ease, phase.progress, PLAYHEAD_COLOR);

  // Which side the target is on decides which edge is the start edge: the retract always eats the
  // arc from the top down, so a swing to the left and one to the right read as the same motion.
  // The simulator derives this from the target's direction; here `heading` is that direction.
  const sign = Math.cos(heading) < 0 ? 1 : -1;

  const alpha = params.alpha * phase.fade;
  // Saturation 0 is the simulator's pure white; raising it turns the same stroke into a tinted one.
  const stroke = hueColor(params.hue, params.saturation, 1);
  if (phase.remaining > SWEEP_MIN && alpha > 1e-3) {
    d2.arc(cell.center, params.radius, {
      space: "world2d",
      strokeWidth: params.stroke,
      strokeWidthMode: "world",
      // The end edge stays put at `heading + sign * sweep / 2`; the start edge walks in toward it.
      startAngle: heading - sign * (phase.remaining - sweep / 2),
      sweep: sign * phase.remaining,
      color: withAlpha(stroke, alpha),
    });
  }
}
