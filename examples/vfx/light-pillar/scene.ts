/**
 * `light-pillar`: one column of light through its whole life — it rises out of the floor, holds, and
 * then scatters into a wide dim haze.
 *
 * The two halves used to be two easing-matrix pages (`pillar-appear` grew it, `pillar-fade` scattered
 * it). On one clock they are a single event, and the moment where one ends is exactly where the other
 * begins: the column does not fade out and then a second column fades in, it stops being a column.
 *
 * Four fills of one colour, each narrower and hotter than the one outside it, are the whole shape.
 * A flat pool on the floor is the only thing added, and it is on the floor rather than on the shaft
 * because a column that stands on nothing reads as a decal. Nothing else: no tip bloom, no ring, no
 * second colour — the falloff is the alpha ladder alone.
 *
 * Rising is a snap: the height and the floor pool are thrown up on `outExpo` past their final size and
 * settle back onto it, so the column is planted rather than grown. Scattering is not a fade: the shaft *bursts* — the
 * width is thrown open on `outExpo` inside the first third of the scatter, the fills fold towards the
 * outer width and the bright core is the first thing to go, so what is left is a wide dim haze. The
 * floor answers on the same frame with a ring that is thrown off the pool and gone within half of it.
 *
 * The rows under the stage are one curve per element, one playhead: height, width, brightness, the
 * pool's spread and the shock ring's reach and light. Every curve is the function the stage draws
 * with.
 *
 * All of it is `world2d` and sized in world units, so the column keeps its proportions at any zoom.
 */

import type { Color, FrameDrawList } from "../../../src/frame-draw-list.js";
import type { EffectParams } from "../../shared/meta.js";
import type { VfxSceneContext } from "../scene-context.js";
import { DEFAULT_DURATION } from "../action-phase.js";
import { inOutQuad, inQuad, outCirc, outExpo, outQuad } from "../easing.js";
import { hueColor, lighten, withAlpha } from "../params.js";
import { drawPillarShaft } from "../pillar.js";
import {
  drawTimelineTracks,
  type TimelineCurve,
  type TimelineLayout,
  type TimelineTrack,
} from "../timeline-tracks.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/**
 * Share of the loop the column takes to appear.
 *
 * Short on purpose: the column is *planted*, not grown. At the default 0.8 s loop this is 0.16 s of
 * snap-and-settle, and the hold that follows is nearly twice as long.
 */
export const RISE_RATIO = 0.18;

/** Share of the loop where the column stands at full height and full brightness. */
export const HOLD_RATIO = 0.56;

/**
 * Share of the loop by which the scatter is over.
 *
 * The rest of the loop is empty on purpose: the page is one cast, and a column that is still drifting
 * away when the next one starts would read as a permanent pillar.
 */
export const FADE_RATIO = 0.9;

/** Where the column meets the floor. The pool sits here and the shaft grows up from it. */
export const GROUND_Y = 1.8;

/** Extent the page fits: the column on top, five curve rows below. */
export const PILLAR_VIEW = { width: 34, height: 19 } as const;

/** Where the curve rows sit: full width under the stage, rows stacking downward. */
export const TIMELINE_LAYOUT: TimelineLayout = {
  left: -12,
  width: 24,
  top: 0.1,
  trackHeight: 1.3,
  trackGap: 0.35,
};

/** How much taller the column is at the end of the scatter, as a share of its height. */
export const SCATTER_LIFT = 0.18;

/**
 * Share of the scatter the burst itself takes.
 *
 * All of the widening, folding and most of the light loss happen inside this slice — the scatter is
 * an impact, not a dissolve, and a column that spends the whole phase opening reads as slow.
 */
export const BURST_RATIO = 0.34;

/** What the shaft's light drops to on the burst frame, before the haze itself goes. */
const HAZE_LIGHT = 0.22;

/** Share of the scatter in which the floor pool is gone: the ring takes the floor over. */
const POOL_LIFE = 0.45;

/** Share of the scatter the shock ring lives for. */
export const RING_LIFE = 0.5;

/** Where the ring starts, relative to the pool it is thrown off, and how far out it reaches. */
const RING_START = 0.55;
const RING_TRAVEL = 1.15;

/**
 * Share of the rise spent snapping up; the rest is the settle back down from the overshoot.
 *
 * `outExpo` inside this window means the height is most of the way there within a frame or two — the
 * settle is what the eye actually reads as "it arrived".
 */
const RISE_SNAP = 0.55;

/** How far past its final size the column overshoots before it settles, as a share of it. */
export const RISE_OVERSHOOT = 0.14;

/** Share of the rise at which the shaft is already at full brightness... */
const LIGHT_RISE = 0.25;
/** ...and the exponent that keeps the first frames from being a dim sliver. */
const LIGHT_GAMMA = 0.5;

/** Fraction of the rise spent opening from a filament to the full width. */
const OPEN_WIDTH = 0.55;
const OPEN_SPREAD = 0.45;

/** Radius of the floor pool relative to the shaft's width, and its height relative to that radius. */
const POOL_SCALE = 1.6;
const POOL_FLATTEN = 0.18;
/** How far the pool spreads past its opening radius at the end of the scatter. */
const POOL_SCATTER = 0.6;
/**
 * Share of the rise the push ring lives for, and how far past the pool's full reach it travels.
 *
 * The ring is the column *opening the floor*: it starts at the foot and is pushed out while the
 * column climbs, and it is gone before the column finishes arriving — a ripple that outlived the
 * thing that caused it would read as a separate effect.
 */
const PUSH_LIFE = 0.8;
const PUSH_REACH = 1.15;

/**
 * Amplitudes of the hold's breath, as shares of the value they modulate.
 *
 * One full cycle fits the hold and both ends are back at zero, so the breath never fights the snap or
 * the burst: it is only ever visible in the middle, where the column is standing still.
 */
export const WIDTH_BREATH = 0.09;
export const HEIGHT_BREATH = 0.05;
export const LIGHT_BREATH = 0.12;
/** The hue swings this many turns as it breathes, and the saturation drops by `SAT_BREATH` on the
 *  way up — the column goes paler and bluer as it swells, which is what a light doing work looks
 *  like, rather than the same colour getting bigger. */
export const HUE_BREATH = 0.015;
export const SAT_BREATH = 0.1;
/** The floor moves with the column, but less: a pool that pulsed as hard as the shaft would look
 *  like a separate effect. */
export const POOL_BREATH = 0.07;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export type PillarPhase = {
  /** 0-1 raw loop position; what the playhead rides on. */
  readonly progress: number;
  /** 0-1 through the rise, saturating at the hold. */
  readonly rise: number;
  /** 0-1 through the scatter; 0 until the hold is over. */
  readonly fade: number;
};

/** `progress` is a raw 0-1 loop position; `duration` only scales the wall clock. */
export function pillarPhaseAt(progress: number): PillarPhase {
  const p = clamp01(progress);
  return {
    progress: p,
    rise: Math.min(p / RISE_RATIO, 1),
    fade: clamp01((p - HOLD_RATIO) / (FADE_RATIO - HOLD_RATIO)),
  };
}

export function pillarPhase(time: number, duration: number = LOOP_SECONDS): PillarPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  return pillarPhaseAt(loop / span);
}

/**
 * The rise front: up past the final size on `outExpo`, then settling back onto it.
 *
 * This is the whole "planted, not grown" idea. `outExpo` inside `RISE_SNAP` covers most of the way in
 * the first frame or two — a column that walked up on `quad` reads as a lift, not a cast — and the
 * settle is what makes the arrival visible at all: the eye catches the *return*, not the jump.
 */
function snapRise(rise: number): number {
  if (rise <= RISE_SNAP) return (1 + RISE_OVERSHOOT) * outExpo(rise / RISE_SNAP);
  const settle = (rise - RISE_SNAP) / (1 - RISE_SNAP);
  // `inOutQuad` on the return: it hangs at the overshoot for a beat before dropping back, which is
  // what makes the rebound readable at 0.8 s per loop. `outQuad` snapped back too fast to see.
  return 1 + RISE_OVERSHOOT * (1 - inOutQuad(settle));
}

/**
 * The hold's breath, -1 to 1.
 *
 * One sine cycle across the hold: up at a quarter of it, back through zero at half, down at three
 * quarters, zero again at the end. Both ends land on zero so the snap and the burst stay untouched —
 * a breath that was still moving when the burst starts would read as the column wobbling, and the
 * burst would lose its edge. Zero outside the hold, too: nothing breathes while it is being planted
 * or thrown open.
 */
export function breath(phase: PillarPhase): number {
  if (phase.rise < 1 || phase.fade > 0) return 0;
  const held = (phase.progress - RISE_RATIO) / (HOLD_RATIO - RISE_RATIO);
  return Math.sin(clamp01(held) * Math.PI * 2);
}

/**
 * Height, 0-1 of the full column.
 *
 * `snapRise` for the appearance — up past full height and back. It keeps lifting a little as it
 * scatters, which is what makes the haze read as rising off the shaft rather than dissolving in
 * place. The hold adds its breath on top.
 */
export function shaftHeight(phase: PillarPhase): number {
  return snapRise(phase.rise) * (1 + SCATTER_LIFT * inQuad(phase.fade)) * (1 + HEIGHT_BREATH * breath(phase));
}

/**
 * Width while rising, as a multiple of the slider's `width`.
 *
 * It opens on the same `outExpo` front as the height: a thin bright line that is suddenly a full
 * column on the second frame. Opening it on `circ` gave the width a growth of its own, which fought
 * the snap.
 */
export function shaftWidth(phase: PillarPhase): number {
  // The width breathes harder than the height: a column that only swells vertically reads as a
  // zoom, while one that also thickens reads as a body filling with light.
  return (OPEN_WIDTH + OPEN_SPREAD * outExpo(phase.rise)) * (1 + WIDTH_BREATH * breath(phase));
}

/**
 * How far the burst has thrown the shaft open, 0-1.
 *
 * `outExpo` squeezed into `BURST_RATIO`: half of the widening happens inside the first tenth of the
 * scatter, which is what makes it read as an impact instead of an inflation. The caller multiplies
 * this by the `spread` slider.
 */
export function shaftScatter(phase: PillarPhase): number {
  if (phase.fade <= 0) return 0;
  return outExpo(Math.min(phase.fade / BURST_RATIO, 1));
}

/**
 * Brightness of the shaft, 0-1.
 *
 * Two beats, not one curve. It reaches full brightness before it reaches full height — the light
 * arrives with the cast, the column catches up — and on the burst frame it drops most of the way in
 * `outQuad` time, down to the `HAZE_LIGHT` floor. What is left then fades out over the rest of the
 * scatter, and *that* tail is the haze. A single `(1 - fade)^0.8` would spread the drop over the
 * whole phase, which is exactly the slow dissolve the burst is meant to replace.
 */
export function shaftBrightness(phase: PillarPhase): number {
  const lighting = Math.min(phase.rise / LIGHT_RISE, 1) ** LIGHT_GAMMA;
  const pulse = 1 + LIGHT_BREATH * breath(phase);
  // The hold has no burst to fold in, so it returns here — with the breath, which is the only thing
  // moving on those frames.
  if (phase.fade <= 0) return lighting * pulse;
  const burst = Math.min(phase.fade / BURST_RATIO, 1);
  const drop = 1 - (1 - HAZE_LIGHT) * outQuad(burst);
  const tail = Math.max(0, (phase.fade - BURST_RATIO) / (1 - BURST_RATIO));
  return lighting * drop * (1 - tail) ** 0.9 * pulse;
}

/**
 * Reach of the pool, as a multiple of its full opening.
 *
 * `outQuad` rather than the shaft's `outExpo`: the column is already at full width when the floor
 * catches up, so the pool is *pushed* open by it — narrow at the foot for the first frames, wide by
 * the time the column has arrived. Spreading it on the same front as the shaft made it pop into
 * existence at its final size, which reads as a decal rather than as the floor giving way.
 */
export function poolSpread(phase: PillarPhase): number {
  return outQuad(phase.rise) * (1 + POOL_SCATTER * outQuad(phase.fade)) * (1 + POOL_BREATH * breath(phase));
}

/** Reach of the push ring, 0-1: it starts at the foot and is driven out by the climbing column. */
export function pushRingReach(phase: PillarPhase): number {
  if (phase.rise >= 1 || phase.fade > 0) return 0;
  return outCirc(Math.min(phase.rise / PUSH_LIFE, 1));
}

/** Brightness of the push ring: full at the foot, gone by the time the column has arrived. */
export function pushRingBrightness(phase: PillarPhase): number {
  if (phase.rise >= 1 || phase.fade > 0) return 0;
  return Math.max(0, 1 - phase.rise / PUSH_LIFE) ** 1.2;
}

/**
 * Brightness of the floor pool.
 *
 * It comes up with the opening, not before it: a lit pool under a column that has not arrived yet is
 * a stain. It is gone by `POOL_LIFE`, well before the shaft — on the burst frame the floor starts
 * being the ring's job, and two lit ellipses competing down there just reads as a smudge.
 */
export function poolBrightness(phase: PillarPhase): number {
  // `outCirc` here while the *reach* uses `outQuad`: the light comes up quickly under the column
  // (that is the floor being lit) but the shape takes its time being pushed open. Lighting on the
  // same slow curve left the pool invisible for the whole first half of the rise, so all that was
  // on screen was the push ring with nothing under it.
  return outCirc(phase.rise) * Math.max(0, 1 - phase.fade / POOL_LIFE) ** 1.2;
}

/** Reach of the shock ring, 0-1 of its travel. `outCirc`: a front that decelerates as it spreads. */
export function ringReach(phase: PillarPhase): number {
  if (phase.fade <= 0) return 0;
  return outCirc(Math.min(phase.fade / RING_LIFE, 1));
}

/** Brightness of the shock ring: gone exactly when it reaches its full reach. */
export function ringBrightness(phase: PillarPhase): number {
  if (phase.fade <= 0) return 0;
  return Math.max(0, 1 - phase.fade / RING_LIFE) ** 2;
}

/** Every curve row, all of them sampled through the same `pillarPhaseAt` the stage uses. */
function pillarTracks(params: EffectParams, hue: Color): readonly TimelineTrack[] {
  const row = (pick: (phase: PillarPhase) => number): TimelineCurve => ({
    sample: (t) => pick(pillarPhaseAt(t)),
  });
  // Both width rows are plotted against their widest frame, so the strip needs no y axis.
  const widestWidth = 1 + params.spread;
  return [
    {
      id: "height",
      title: "光柱 · 升起",
      name: "shaft · 高度",
      color: lighten(hue, 0.6),
      curves: [row((phase) => shaftHeight(phase) / ((1 + RISE_OVERSHOOT) * (1 + SCATTER_LIFT)))],
    },
    {
      id: "width",
      title: "光柱 · 扩散",
      name: "shaft · 宽度",
      color: lighten(hue, 0.35),
      curves: [row((phase) => (shaftWidth(phase) + params.spread * shaftScatter(phase)) / widestWidth)],
    },
    {
      id: "pool",
      title: "地面 · 光池 / 撑开",
      name: "pool · push · 半径",
      color: hue,
      // The pool is pushed open by the column while the ring runs out ahead of it; two curves in one
      // row is what shows the ring *leaving* the pool rather than the pool growing on its own.
      curves: [row((phase) => poolSpread(phase) / (1 + POOL_SCATTER)), row((phase) => pushRingReach(phase) * 0.45)],
    },
    {
      id: "ring",
      title: "地面 · 冲击环",
      name: "ring · 半径 / 亮度",
      color: lighten(hue, 0.45),
      // Two curves in one row: the ring is at its widest exactly when it is gone, so its reach and
      // its light cross instead of running parallel.
      curves: [row(ringReach), row((phase) => ringBrightness(phase) * 0.45)],
    },
    {
      id: "light",
      title: "光柱 · 亮度",
      name: "shaft · 亮度",
      color: lighten(hue, 0.8),
      curves: [row(shaftBrightness)],
    },
  ];
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const phase = pillarPhase(context.time, params.duration);

  drawStage(drawList, params, phase);

  // The rows keep the parameters' own colour: a curve that changed colour with the breath would be
  // reading the effect out to itself instead of describing it.
  drawTimelineTracks(drawList, {
    tracks: pillarTracks(params, hueColor(params.hue, params.saturation, 1)),
    layout: TIMELINE_LAYOUT,
    progress: phase.progress,
    duration: params.duration,
  });
}

function drawStage(drawList: FrameDrawList, params: EffectParams, phase: PillarPhase): void {
  const { d2 } = drawList;
  const ground: readonly [number, number] = [0, GROUND_Y];

  // The colour breathes with the size: it goes a touch bluer and paler as the column swells, so the
  // swell reads as light doing work rather than as the same colour being scaled up.
  const pulse = breath(phase);
  const hue = hueColor(
    params.hue + HUE_BREATH * pulse,
    Math.min(1, Math.max(0, params.saturation - SAT_BREATH * pulse)),
    1,
  );

  // The pool first: it lies on the floor, so the shaft has to stand on top of it.
  const pool = params.width * POOL_SCALE * poolSpread(phase);
  const poolLight = poolBrightness(phase);
  if (pool > 1e-3 && poolLight > 1e-3) {
    // Two flat ellipses, the outer one nearly twice as wide: that pair is the only soft edge the 2D
    // layer has, and putting the bright one inside it keeps the foot of the column from ending in a
    // hard line where the pool meets the grid.
    d2.ellipse_s(ground, [pool, pool * POOL_FLATTEN], {
      color: withAlpha(hue, 0.1 * poolLight),
      zIndex: 1,
    });
    d2.ellipse_s(ground, [pool * 0.55, pool * POOL_FLATTEN * 0.7], {
      color: withAlpha(hue, 0.24 * poolLight),
      zIndex: 1,
    });
  }

  // The ring the column pushes out of the floor while it climbs. It starts at the foot and is gone
  // before the column has finished arriving, so the floor reads as giving way under it — which is
  // the whole difference between a pool that is *opened* and one that simply appears.
  const pushLight = pushRingBrightness(phase);
  const pushReach = params.width * POOL_SCALE * PUSH_REACH * pushRingReach(phase);
  if (pushLight > 1e-3 && pushReach > 1e-3) {
    d2.ellipse(ground, [pushReach, pushReach * POOL_FLATTEN], {
      strokeWidth: params.width * 0.14 * (0.35 + 0.65 * pushLight),
      strokeWidthMode: "world",
      color: withAlpha(hue, 0.85 * pushLight),
      zIndex: 2,
    });
  }

  // The floor answers the burst: a ring thrown off the pool, outrunning it and gone before the haze
  // is. It lies on the floor — same flatten as the pool — rather than standing around the shaft.
  const ringLight = ringBrightness(phase);
  const ringReachAt = params.width * POOL_SCALE * params.ring * (RING_START + ringReach(phase) * RING_TRAVEL);
  if (ringLight > 1e-3 && ringReachAt > 1e-3) {
    d2.ellipse(ground, [ringReachAt, ringReachAt * POOL_FLATTEN], {
      // It thins as it spreads, the same way the ult flash's ring does: a constant-width hoop reads
      // as a shape sliding outward, not as a wave losing its energy.
      strokeWidth: params.width * 0.22 * (0.35 + 0.65 * ringLight),
      strokeWidthMode: "world",
      color: withAlpha(hue, 0.95 * ringLight),
      zIndex: 2,
    });
  }

  const height = params.height * shaftHeight(phase);
  const light = shaftBrightness(phase);
  if (height <= 1e-3 || light <= 1e-3) return;

  // One colour for every layer: the falloff is the alpha ladder inside `drawPillarShaft`. The fourth
  // argument is the scatter — at the end the four fills are one width and the column has no core.
  const width = params.width * (shaftWidth(phase) + params.spread * shaftScatter(phase));
  drawPillarShaft(drawList, ground, width, height, light, hue, phase.fade);
}
