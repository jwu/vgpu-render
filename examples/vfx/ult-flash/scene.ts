/**
 * `ult-flash`: the four-armed star and the single ring that pop on a body when an ultimate goes off.
 *
 * Two beats share one loop. The caster's body gathers a small cross of light, then that cross shoots
 * out into a full four-spiked star while a ring is thrown off it and gone — by the time the eye has
 * followed the ring, the star has already pulled back and faded, and the rest of the loop is the wait
 * before the next cast.
 *
 * Nothing tints the body: the flash is its own object sitting on top of the unit, which is why the
 * unit is drawn at all — a star on empty grid says nothing about who cast it.
 *
 * The rows under the stage are one curve per element, one playhead: light gathering, cross length,
 * ring reach, ring brightness. Every curve is the function the stage draws with, so the strip is the
 * effect's timing rather than a second animation describing it.
 *
 * Everything is `world2d` and measured in body radii, so the star keeps its proportions at any zoom.
 */

import type { Color, FrameDrawList } from "../../../src/frame-draw-list.js";
import type { EffectParams } from "../../shared/meta.js";
import type { VfxSceneContext } from "../scene-context.js";
import { DEFAULT_DURATION } from "../action-phase.js";
import { outCirc } from "../easing.js";
import { hueColor, withAlpha } from "../params.js";
import { drawUnitDisc } from "../unit.js";
import {
  drawTimelineTracks,
  type TimelineCurve,
  type TimelineLayout,
  type TimelineTrack,
} from "../timeline-tracks.js";

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/**
 * Share of the loop the caster spends gathering the star on its own body.
 *
 * The windup is what separates this from a hit: something is being built, and the pop is the instant
 * it is spent. Without it the star simply appears, which reads as a glitch rather than a cast.
 */
export const CHARGE_RATIO = 0.28;

/** Where the caster stands: above the curve rows, centred on the page. */
export const UNIT: readonly [number, number] = [0, 3.9];

/** Body radius the page opens with; the whole flash is measured against it. */
export const DEFAULT_UNIT_RADIUS = 1.3;

/** Extent the page fits: the star on top, four curve rows below. */
export const ULT_VIEW = { width: 34, height: 16 } as const;

/** Where the curve rows sit: full width under the stage, rows stacking downward. */
export const TIMELINE_LAYOUT: TimelineLayout = {
  left: -12,
  width: 24,
  top: 0.1,
  trackHeight: 1.4,
  trackGap: 0.4,
};

/** The star's own light dies within this share of the burst, so the flash is short. */
export const FLASH_SPAN = 0.45;

/** The cross is at full length this early into the burst... */
export const SPIKE_OPEN = 0.16;

/** ...and has pulled all the way back by this one, leaving only the gathered cross. */
export const SPIKE_CLOSE = 0.6;

/** The ring reaches its full reach here, which is also where it has faded out. */
export const RING_SPAN = 0.62;

/** Light on the body before the pop, as a share of the pop's own brightness. */
const GATHER_LIGHT = 0.22;

/** Cross length while gathering, as a share of its full length: a small cross, not a full star. */
const GATHER_SPIKE = 0.26;
const GATHER_SPIKE_GAIN = 0.14;

/** Half-width of one arm of the cross, as a share of the body radius. */
const ARM_WIDTH = 0.26;

/**
 * Radii of the three discs the core is built from, as shares of `starSize`.
 *
 * A stack of discs, each narrower and paler than the one outside it, is the only "radial gradient"
 * the 2D layer has; on their own they are a dot, which is why the arms are what make it a star.
 */
const CORE_LADDER = [
  { scale: 2.4, alpha: 0.14 },
  { scale: 1.3, alpha: 0.5 },
  { scale: 0.7, alpha: 0.95 },
] as const;

/** The four arms, as unit directions. Written out so the order never depends on trig round-off. */
const ARM_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export type UltFlashPhase = {
  /** 0-1 raw loop position; what the playhead rides on. */
  readonly progress: number;
  /** 0-1 windup, saturating on the pop frame. */
  readonly charge: number;
  /** 0-1 through the burst; 0 for the whole windup. */
  readonly burst: number;
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** `progress` is a raw 0-1 loop position; `duration` only scales the wall clock. */
export function ultFlashPhaseAt(progress: number): UltFlashPhase {
  const p = clamp01(progress);
  return {
    progress: p,
    charge: Math.min(p / CHARGE_RATIO, 1),
    burst: p <= CHARGE_RATIO ? 0 : (p - CHARGE_RATIO) / (1 - CHARGE_RATIO),
  };
}

export function ultFlashPhase(time: number, duration: number = LOOP_SECONDS): UltFlashPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  return ultFlashPhaseAt(loop / span);
}

/**
 * Brightness of the star: a faint gathering light, then the pop, then a fast square fall-off.
 *
 * The pop is a jump on purpose — the frame the ultimate lands is the brightest frame of the whole
 * loop, and a curve that walked there over two frames would read as a lamp turning up.
 */
export function starBrightness(phase: UltFlashPhase): number {
  if (phase.burst <= 0) return GATHER_LIGHT * phase.charge * phase.charge;
  const life = Math.max(0, 1 - phase.burst / FLASH_SPAN);
  return life * life;
}

/**
 * Length of the arms, 0-1 of their full reach.
 *
 * It shoots out on `outCirc` — a burst front starts fast and slows — and then pulls back, so the
 * star *closes* instead of merely dimming. It never returns to zero: the gathered cross is what the
 * next windup starts from.
 */
export function spikeLength(phase: UltFlashPhase): number {
  const gathered = GATHER_SPIKE + GATHER_SPIKE_GAIN * phase.charge;
  if (phase.burst <= 0) return gathered;
  const open = outCirc(Math.min(phase.burst / SPIKE_OPEN, 1));
  const close = Math.min(phase.burst / SPIKE_CLOSE, 1);
  return gathered + (1 - gathered) * open * (1 - close * close);
}

/** Reach of the ring, 0-1 of its travel. `outCirc`: a shock front decelerates as it spreads. */
export function ringRadius(phase: UltFlashPhase): number {
  return phase.burst <= 0 ? 0 : outCirc(Math.min(phase.burst / RING_SPAN, 1));
}

/** Brightness of the ring: gone exactly when it reaches its full reach. */
export function ringBrightness(phase: UltFlashPhase): number {
  if (phase.burst <= 0) return 0;
  const life = Math.max(0, 1 - phase.burst / RING_SPAN);
  return life * life;
}

/** The page's light colour, lightened towards white for the hot core. */
function lighten(color: Color, amount: number): Color {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3],
  ];
}

/** Every curve row, all of them sampled through the same `ultFlashPhaseAt` the stage uses. */
function ultTracks(hue: Color): readonly TimelineTrack[] {
  const row = (pick: (phase: UltFlashPhase) => number): TimelineCurve => ({
    sample: (t) => pick(ultFlashPhaseAt(t)),
  });
  return [
    {
      id: "star",
      title: "闪光 · 星核",
      name: "star · 亮度",
      color: lighten(hue, 0.8),
      curves: [row(starBrightness)],
    },
    {
      id: "arms",
      title: "闪光 · 十字芒",
      name: "cross · 长度",
      color: lighten(hue, 0.5),
      curves: [row(spikeLength)],
    },
    {
      id: "ring",
      title: "光圈 · 半径",
      name: "ring · 半径",
      color: hue,
      curves: [row(ringRadius)],
    },
    {
      id: "ring-light",
      title: "光圈 · 亮度",
      name: "ring · 亮度",
      color: lighten(hue, 0.25),
      curves: [row(ringBrightness)],
    },
  ];
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const phase = ultFlashPhase(context.time, params.duration);

  drawStage(drawList, params, phase);

  drawTimelineTracks(drawList, {
    tracks: ultTracks(hueColor(params.hue, params.saturation, 1)),
    layout: TIMELINE_LAYOUT,
    progress: phase.progress,
    duration: params.duration,
  });
}

function drawStage(drawList: FrameDrawList, params: EffectParams, phase: UltFlashPhase): void {
  const { d2 } = drawList;
  const radius = params.unitRadius;
  const light = starBrightness(phase);
  const hue = hueColor(params.hue, params.saturation, 1);
  const core = lighten(hue, 0.75);

  // The body first: the flash is something happening *to* it, so it has to sit on top of it.
  drawUnitDisc(drawList, UNIT, radius, params.unitHue, params.unitSaturation);

  // The ring goes under the star: the star is the light source, the ring is what it threw off.
  const reach = ringBrightness(phase);
  const ring = radius * params.ring * ringRadius(phase);
  if (reach > 1e-3 && ring > 1e-3) {
    d2.circle(UNIT, ring, {
      // It thins as it expands: a constant-width hoop reads as a shape travelling outward, while a
      // front that loses weight reads as a wave dissipating.
      strokeWidth: radius * ARM_WIDTH * 1.25 * reach,
      strokeWidthMode: "world",
      color: withAlpha(hue, reach),
      zIndex: 4,
    });
  }

  if (light <= 1e-3) return;

  // The cross: a long thin triangle per direction, over a wider and fainter copy of itself. Two
  // tiers are what stand in for a glow — one triangle is a spike of flat colour, and the pair reads
  // as a hot centre with light bleeding off it.
  const length = radius * params.spike * spikeLength(phase);
  const half = radius * ARM_WIDTH * (0.5 + 0.5 * light);
  if (length > 1e-3) {
    drawCross(drawList, length, half * 1.9, lighten(hue, 0.45), 0.26 * light, 3);
    drawCross(drawList, length, half, core, 0.85 * light, 3);
  }

  // The core: three discs of one colour, each narrower and more opaque than the one outside it.
  const star = radius * params.starSize * (0.5 + 0.5 * light);
  for (const step of CORE_LADDER) {
    d2.circle_s(UNIT, star * step.scale, {
      color: withAlpha(core, step.alpha * light),
      zIndex: 5,
    });
  }
}

/** Draws the four arms of the cross once, at one width and one opacity. */
function drawCross(
  drawList: FrameDrawList,
  length: number,
  halfWidth: number,
  color: Color,
  alpha: number,
  zIndex: number,
): void {
  const [cx, cy] = UNIT;
  // The base sits a little past the centre so the four triangles do not pile up into a bright square;
  // the core covers the gap they leave.
  const base = halfWidth * 0.15;
  for (const [dx, dy] of ARM_DIRECTIONS) {
    const px = -dy;
    const py = dx;
    drawList.d2.triangle_s(
      [cx + dx * length, cy + dy * length],
      [cx - px * halfWidth + dx * base, cy - py * halfWidth + dy * base],
      [cx + px * halfWidth + dx * base, cy + py * halfWidth + dy * base],
      { color: withAlpha(color, alpha), zIndex },
    );
  }
}
