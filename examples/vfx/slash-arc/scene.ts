/**
 * `slash-arc`: every easing curve of anime.js, played as the same sword swing.
 *
 * The swing grows out of nothing: the clock charges for a moment, then the blade sweeps from the
 * start angle through the arc, and the whole thing fades as it settles. Only the timing curve
 * differs between cells, which is what makes the comparison honest — the swept angle at any instant
 * *is* the curve.
 *
 * The swing is two primitives and nothing else: a filled sector for the light the blade throws, and
 * an arc stroke for its edge. A curve comparison is easier to read when the shape is identical in
 * every cell and only the swept angle moves.
 *
 * The matrix frame (headings, curve plots, cell centres) lives in `../matrix.ts`, shared with the
 * battle-style swing page.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { VfxSceneContext } from "../scene-context.js";
import { hueColor, withAlpha } from "../params.js";
import { outExpo, type Easing } from "../easing.js";
import { DEFAULT_DURATION } from "../action-phase.js";
import { drawCurvePlot, drawHeadings, forEachCell, plotOrigin, type MatrixCell } from "../matrix.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/**
 * Windup share of one loop: the blade charges for this fraction, then the swing starts. Everything
 * downstream is expressed as a share of the loop rather than in seconds, so changing `duration`
 * re-times the whole swing instead of stretching one phase against the others.
 */
const WINDUP_RATIO = 0.12;
/** Share of the loop by which the swing is complete; the remainder is the fade. */
const SWING_END_RATIO = 0.36;

const DEG = Math.PI / 180;
/**
 * The 2D shape layer rejects a sweep outside `(0, 2π]`. `back` and `elastic` overshoot past their
 * target, so a full 330° swing times a 1.1 peak lands beyond one turn — the overshoot is clamped
 * here rather than left to throw inside `buildScene` and truncate the frame.
 */
const MAX_SWEEP = Math.PI * 2;

/**
 * Where one swing is at `time`, as the fractions each layer needs.
 *
 * `ease` is the only thing that varies between cells. `progress` is the raw position inside the
 * strike window (the playhead's x), while `arc` is the eased one (the playhead's y and the swept
 * angle), so a plot can show both at once.
 */
export type SlashPhase = {
  /** 0-1 charge-up of the windup arc. */
  readonly charge: number;
  /** 0-1 raw position inside the strike window; the plot playhead's x. */
  readonly progress: number;
  /** Radians already swept at this instant; overshoots for `back` and `elastic`. */
  readonly arc: number;
  /** 1 while the strike is fresh, decaying to 0 as the blade settles. */
  readonly vanish: number;
};

export function slashPhase(
  time: number,
  sweepRadians: number,
  ease: Easing = outExpo,
  duration: number = LOOP_SECONDS,
): SlashPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  const swingStart = span * WINDUP_RATIO;
  const swingEnd = span * SWING_END_RATIO;
  const charge = Math.min(loop / swingStart, 1);
  const progress = loop <= swingStart ? 0 : Math.min((loop - swingStart) / (swingEnd - swingStart), 1);
  const settle = loop <= swingEnd ? 0 : Math.min((loop - swingEnd) / (span - swingEnd), 1);
  return {
    charge,
    progress,
    // `back`/`elastic` go below 0 or above 1: the negative side is clamped so the arc never inverts,
    // the positive side at one full turn so the shape layer accepts it, and everything in between
    // keeps the overshoot that makes those families worth looking at.
    arc: Math.min(MAX_SWEEP, Math.max(0, sweepRadians * ease(progress))),
    vanish: (1 - settle) ** 2,
  };
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  drawHeadings(drawList);
  forEachCell((cell) => drawCell(drawList, context, cell));
}

/**
 * One swing: a filled sector plus an arc stroke, and nothing else.
 *
 * `sector_s` is the "solid arc" of this layer — the 2D API has no `arc_s`, because an arc has no
 * interior; the sector is what fills the swept angle. Both primitives read the same `startAngle` and
 * `sweep`, so the fill and its edge can never drift apart.
 */
function drawCell(drawList: FrameDrawList, context: VfxSceneContext, cell: MatrixCell): void {
  const d2 = drawList.d2;
  const params = context.params;
  const phase = slashPhase(context.time, params.sweep * DEG, cell.ease, params.duration);

  // The plot is drawn on every frame; only the swing needs a non-zero sweep.
  drawCurvePlot(
    drawList,
    plotOrigin(cell.center),
    cell.ease,
    phase.progress,
    hueColor(params.hue + 0.07, 0.85 * params.saturation, 1),
  );

  const arc = phase.arc;
  // Nothing has been swept yet (the windup, or the first frame of the loop).
  if (arc <= 1e-4) return;

  const startAngle = params.start * DEG;
  const alpha = phase.vanish;
  // `saturation` scales the authored mix rather than replacing it: at 1 the cell keeps its blue-cyan
  // fill and paler edge, at 0 both go white, which is what the battle-style pages open with.
  const fill = hueColor(params.hue, 0.62 * params.saturation, 1);
  const edge = hueColor(params.hue, 0.3 * params.saturation, 1);

  d2.sector_s(cell.center, params.radius, {
    startAngle,
    sweep: arc,
    color: withAlpha(fill, 0.4 * params.fill * alpha),
  });
  d2.arc(cell.center, params.radius, {
    startAngle,
    sweep: arc,
    strokeWidth: params.stroke,
    strokeWidthMode: "world",
    color: withAlpha(edge, 0.95 * alpha),
  });
}
