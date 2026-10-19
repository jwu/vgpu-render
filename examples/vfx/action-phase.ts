/**
 * The action window every battle effect plays inside.
 *
 * A battle effect is a short burst inside a longer loop: the strike happens, then the page waits so
 * a single hit stays readable instead of turning into a permanent blur. Everything downstream is
 * expressed as a share of the loop rather than in seconds, so the timeline's `duration` parameter
 * re-times the whole effect instead of stretching one phase against the others.
 */

import type { Easing } from "./easing.js";

/**
 * The loop length every battle page opens with, in seconds.
 *
 * One number for all of them: switching between the pages should not change how long a hit takes,
 * only what the hit looks like. The timeline's `duration` parameter overrides it per page.
 */
export const DEFAULT_DURATION = 0.8;

export type ActionPhase = {
  /** 0-1 raw position inside the action window; the curve plot's playhead rides on it. */
  readonly progress: number;
  /** The curve's value at `progress`, which is what the effect actually animates by. */
  readonly eased: number;
  /** 1 at the first frame of the action, 0 once it is over. Clamped, since curves overshoot. */
  readonly fade: number;
};

/**
 * Resolves where an effect is at `time`.
 *
 * `actionRatio` is how much of the loop the action itself takes; the rest is the wait. `fallback` is
 * used when the page is handed a duration that is missing or unusable, so a stale URL record cannot
 * produce a NaN progress.
 */
export function actionPhase(
  time: number,
  ease: Easing,
  duration: number,
  actionRatio: number,
  fallback: number,
): ActionPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : fallback;
  const loop = ((time % span) + span) % span;
  const progress = Math.min(loop / (span * actionRatio), 1);
  const eased = ease(progress);
  return { progress, eased, fade: Math.max(0, Math.min(1, 1 - eased)) };
}
