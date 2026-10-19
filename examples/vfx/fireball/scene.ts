/**
 * `fireball`: a projectile with a blast, on one clip instead of a matrix.
 *
 * Three beats share one loop. The caster winds up a small ember on its own body, the fireball flies
 * a straight line to the target dragging a tail behind it, and the hit opens four layers at once — a
 * white flash, a fast shock ring, a slower wider ring, sparks thrown outward and embers left drifting.
 *
 * The rows under the stage are the point of the page: one curve per element, one playhead. Ride the
 * playhead and the strip says exactly what the stage is doing at that instant — the flight is still
 * climbing while every blast row is flat on the floor, the ring's arc peaks and is already coming
 * down while the sparks are at their widest, and the embers outlive everything else. Every curve is
 * the same function the stage draws with, so the two can never disagree.
 *
 * All of it is `world2d`: the two bodies, the flight line, the blast and the curve rows scale with
 * the camera together.
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
 * Share of the loop the caster spends winding up. The ember swells on the caster's body and then
 * leaves it — a launch with no windup reads as a projectile appearing rather than being thrown.
 */
export const CHARGE_RATIO = 0.12;

/**
 * Loop position where the fireball lands. The rest of the loop is the blast, so a short loop does
 * not cut the explosion off before its embers have faded.
 */
export const HIT_RATIO = 0.55;

/** Body radius; also the page's scale, since the flight line, the blast and the sparks use it. */
export const BODY_RADIUS = 1.3;

/** Where the two bodies stand. The flight is the straight line between them. */
export const CASTER: readonly [number, number] = [-10.5, 3.9];
export const TARGET: readonly [number, number] = [10.5, 3.9];

/** The launch point: just off the caster's body, so the ember is visibly born on the caster. */
const LAUNCH: readonly [number, number] = [CASTER[0] + BODY_RADIUS * 0.55, CASTER[1]];

/** Extent the page fits: the flight across the top, five curve rows below. */
export const FIREBALL_VIEW = { width: 34, height: 15.5 } as const;

/** Where the curve rows sit: full width under the stage, rows stacking downward. */
export const TIMELINE_LAYOUT: TimelineLayout = {
  left: -9.4,
  width: 24,
  top: 0.2,
  trackHeight: 1.45,
  trackGap: 0.4,
};

/**
 * How far the tail reaches behind the ball, as a share of the flight line.
 *
 * The tail is a run of shrinking, fading discs sampled backwards along the flight path, not one
 * stroke: a stroke has a constant width, so a long tail reads as a rectangle glued to the ball.
 */
const TAIL_SPAN = 0.11;
const TAIL_DOTS = 44;
/** Most recent tail dot, as a share of the ball's radius. The rest taper from here. */
const TAIL_WIDTH = 0.52;

/** The blast's outer reach, in body radii. Every blast layer is measured against it. */
const BLAST_REACH = 2.1;

/** The hit flash: full on the hit frame, gone by this share of the blast. */
const FLASH_SPAN = 0.16;
/**
 * The fireball's body when it bursts: a filled disc that opens fast and is gone by this share.
 *
 * Without it the explosion is only outlines — a flash, two rings and some sparks — and reads as
 * geometry rather than as fire. This is the one filled layer, and it is what the other layers sit on.
 */
export const BURST_SPAN = 0.62;
/** How much of the blast's reach the burst takes, relative to the rings. */
const BURST_REACH = 0.62;

/**
 * The two rings, as `[arrival share, travel]`: a short fast front and a long slow one.
 *
 * Two rings rather than one because a single expanding circle reads as a bubble; a fast thin front
 * chased by a slower wide one reads as a pressure wave. The two reaches are deliberately far apart —
 * rings that arrive at the same radius at the same instant only look like one thick ring.
 */
const RING_FAST = { span: 0.28, travel: 0.6 } as const;
const RING_SLOW = { span: 0.85, travel: 1.15 } as const;

/** Sparks: out over 45% of the blast and gone by 55%, so they are the first thing to disappear. */
const SPARK_SPAN = 0.45;
const SPARK_FADE = 0.55;
/** How far the spark launches are spread out in time, as a share of the blast. */
const SPARK_STAGGER = 0.18;
export const SPARK_TRAVEL = 2.0;

/** Embers: slower and longer-lived — they are what is left after the light is gone. */
const EMBER_SPAN = 0.7;
export const EMBER_TRAVEL = 1.15;

/** Golden angle: scatters the ember fan without pulling in a random source, so replays match. */
const GOLDEN_ANGLE = 2.399;

/**
 * Where one playback is at `time`.
 *
 * `charge` is the windup, `flight` the position along the flight line and `blast` the time since the
 * hit. All three are fractions of the loop, so every layer — and every curve row — reads the same
 * numbers at the same instant.
 */
export type FireballPhase = {
  /** 0-1 raw loop position; what the playhead rides on. */
  readonly progress: number;
  /** 0-1 windup, saturating at the launch. */
  readonly charge: number;
  /** 0-1 position along the flight line, eased; 0 before launch and 1 from the hit onward. */
  readonly flight: number;
  /** 0-1 progress through the blast; 0 until the hit. */
  readonly blast: number;
};

/**
 * Ease-in-out for the flight: the ball leaves slowly, is fastest mid-air and lands softly.
 *
 * This is the flight's whole "physics": with no gravity in a straight-line shot, acceleration is the
 * only thing that separates a thrown projectile from one sliding along a rail.
 */
function easeFlight(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
}

/** `progress` is a raw 0-1 loop position; `duration` only scales the wall clock. */
export function fireballPhaseAt(progress: number): FireballPhase {
  const charge = Math.min(progress / CHARGE_RATIO, 1);
  return {
    progress,
    charge,
    flight: easeFlight((progress - CHARGE_RATIO) / (HIT_RATIO - CHARGE_RATIO)),
    blast: progress <= HIT_RATIO ? 0 : (progress - HIT_RATIO) / (1 - HIT_RATIO),
  };
}

export function fireballPhase(time: number, duration: number = LOOP_SECONDS): FireballPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  return fireballPhaseAt(loop / span);
}

/** Radius of the ball, as a share of its full size: it swells through the windup and then holds. */
export function fireballRadius(phase: FireballPhase): number {
  return 0.42 + 0.58 * phase.charge;
}

/** Tail brightness: it ramps in with the launch and is gone the instant the ball lands. */
export function tailBrightness(phase: FireballPhase): number {
  return phase.flight > 0 && phase.blast <= 0 ? phase.charge : 0;
}

/**
 * Radius of the fast shock ring, 0-1 of its travel.
 *
 * `outCirc` because a shock front starts fast and slows — it is a pressure wave, not a thrown hoop.
 */
export function ringRadius(phase: FireballPhase): number {
  return outCirc(Math.min(phase.blast / RING_FAST.span, 1));
}

/** Radius of the slower, wider ring, 0-1 of its travel. */
export function slowRingRadius(phase: FireballPhase): number {
  return outCirc(Math.min(phase.blast / RING_SLOW.span, 1));
}

/** Brightness of the hit flash: full on the hit frame, gone after `FLASH_SPAN` of the blast. */
export function flashBrightness(phase: FireballPhase): number {
  return phase.blast <= 0 ? 0 : Math.max(0, 1 - phase.blast / FLASH_SPAN);
}

/** Brightness of the spark fan, shared by every spark so the fan stays one shape. */
export function sparkBrightness(phase: FireballPhase): number {
  return Math.max(0, 1 - phase.blast / SPARK_FADE);
}

/** How far an ember has drifted, 0-1 of its travel. */
export function emberReach(phase: FireballPhase): number {
  return Math.min(phase.blast / EMBER_SPAN, 1);
}

/** Share of the body's life it spends opening; it contracts for the rest. */
export const BURST_OPEN = 0.6;

/**
 * Radius of the fire body, 0-1 of its travel.
 *
 * It opens fast and then *contracts*, rather than holding full size while fading. A fire body that
 * shrinks reads as fire being consumed; the same body at half opacity over a dark background reads
 * as a brown disc, which is the one thing an explosion must not look like.
 */
export function burstRadius(phase: FireballPhase): number {
  const t = Math.min(phase.blast / BURST_SPAN, 1);
  if (t <= BURST_OPEN) return 1 - (1 - t / BURST_OPEN) ** 3;
  return Math.max(0, 1 - ((t - BURST_OPEN) / (1 - BURST_OPEN)) ** 2);
}

/**
 * Brightness of the fire body: opaque for its whole life.
 *
 * The body leaves the stage by *contracting*, not by fading. A half-transparent orange disc over a
 * dark background is brown, and over the target's body it is salmon — both read as a stain, not as
 * fire. `burstRadius` is what ends this layer; brightness never has to.
 */
export function burstBrightness(phase: FireballPhase): number {
  return phase.blast <= 0 ? 0 : 1;
}

/** Ember brightness: they appear with the sparks and are the last thing to go. */
export function emberBrightness(phase: FireballPhase): number {
  return phase.blast <= 0 ? 0 : 1 - phase.blast;
}

/** Where the ball is at this instant, on the flight line. */
export function fireballPosition(phase: FireballPhase): readonly [number, number] {
  const x = LAUNCH[0] + (TARGET[0] - LAUNCH[0]) * phase.flight;
  return [x, LAUNCH[1]];
}

/** The point the windup ember sits at: on the caster's body, not at the launch point in the air. */
const EMBER: readonly [number, number] = [CASTER[0] + BODY_RADIUS * 0.1, CASTER[1]];

/**
 * The same fire, one step hotter.
 *
 * Fire does not get whiter by losing saturation alone: it rotates towards yellow first. `amount` is
 * the turn in hue turns (0.05-0.1) and the value/flatness it trades. This is what keeps a highlight
 * on a fireball looking hot instead of looking like pink paint.
 */
function hotter(hue: number, saturation: number, amount: number): Color {
  return hueColor(hue + amount, Math.max(0, saturation - amount * 4), 1);
}

/** The page's body colour, lightened towards white for the hot core. */
function lighten(color: Color, amount: number): Color {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3],
  ];
}

/** Every curve row, all of them sampled through the same `fireballPhaseAt` the stage uses. */
function fireballTracks(hue: Color): readonly TimelineTrack[] {
  const row = (pick: (phase: FireballPhase) => number, alpha = 1): TimelineCurve => ({
    sample: (t) => pick(fireballPhaseAt(t)),
    ...(alpha === 1 ? {} : { alpha }),
  });
  return [
    {
      id: "flight",
      title: "火球 · 飞行",
      name: "ball · 位置",
      color: lighten(hue, 0.35),
      curves: [row((phase) => phase.flight)],
    },
    {
      id: "radius",
      title: "火球 · 大小",
      name: "ball · 半径",
      color: lighten(hue, 0.5),
      curves: [row((phase) => (phase.blast > 0 ? 0 : fireballRadius(phase)))],
    },
    {
      id: "rings",
      title: "爆炸 · 闪光 / 冲击环",
      name: "flash · ring · 半径",
      color: hue,
      // The flash peaks while both rings are still at zero, so they have to share a row: three
      // curves at three different stages of the blast is the point of the row.
      curves: [row(flashBrightness, 0.4), row(ringRadius), row(slowRingRadius, 0.5)],
    },
    {
      id: "sparks",
      title: "爆炸 · 火花 / 余烬",
      name: "spark · ember · 亮度",
      color: lighten(hue, 0.7),
      curves: [row(sparkBrightness), row(emberBrightness, 0.4)],
    },
  ];
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const phase = fireballPhase(context.time, params.duration);
  const hue = hueColor(params.hue, params.saturation, 1);
  const core = hotter(params.hue, params.saturation, 0.07);

  drawStage(drawList, params, phase, hue, core);
  drawTimelineTracks(drawList, {
    tracks: fireballTracks(hue),
    layout: TIMELINE_LAYOUT,
    progress: phase.progress,
    duration: params.duration,
  });
}

function drawStage(
  drawList: FrameDrawList,
  params: EffectParams,
  phase: FireballPhase,
  hue: Color,
  core: Color,
): void {
  const { d2 } = drawList;
  const radius = BODY_RADIUS;
  const charge = fireballRadius(phase) * params.radius;

  // Both bodies first: the projectile crosses them, the blast covers the target.
  drawUnitDisc(drawList, CASTER, radius, params.casterHue, params.casterSaturation);
  drawUnitDisc(drawList, TARGET, radius, params.targetHue, params.targetSaturation);

  // The windup ember sits on the caster and leaves with the launch — the travelling ball takes over
  // on the same frame, so the effect never shows two fireballs.
  if (phase.flight <= 0 && phase.charge > 0) {
    d2.circle_s(EMBER, charge * 0.85, { color: withAlpha(hue, 0.3 * phase.charge), zIndex: 2 });
    d2.circle_s(EMBER, charge * 0.5, { color: withAlpha(core, 0.9 * phase.charge), zIndex: 2 });
  }

  // The ball in flight, dragging its tail. The tail is one stroke whose `colorEnd` fades to zero:
  // a stack of shrinking dots would read as a second, slower fireball behind this one.
  if (phase.flight > 0 && phase.blast <= 0) {
    const [x, y] = fireballPosition(phase);
    // The tail: dots sampled backwards along the flight path, each one smaller and fainter than the
    // one in front of it. They are positions the ball *was* at, so the trail bends with the flight
    // curve instead of being a straight stick glued behind it.
    const tail = tailBrightness(phase);
    for (let step = 1; step <= TAIL_DOTS; step++) {
      const back = (step / TAIL_DOTS) * TAIL_SPAN;
      const past = fireballPhaseAt(Math.max(0, phase.progress - back));
      if (past.flight <= 0) break;
      const [px, py] = fireballPosition(past);
      const fade = 1 - step / (TAIL_DOTS + 1);
      d2.circle_s([px, py], charge * TAIL_WIDTH * fade * fade, {
        color: withAlpha(hue, 0.34 * fade * fade * tail),
        zIndex: 2,
      });
    }
    // Halo, body, core — one hue, three opacities. That ladder is the only "glow" the 2D layer has.
    d2.circle_s([x, y], charge * 1.22, { color: withAlpha(hue, 0.12), zIndex: 3 });
    d2.circle_s([x, y], charge, { color: withAlpha(hue, 0.8), zIndex: 3 });
    d2.circle_s([x, y], charge * 0.5, { color: withAlpha(core, 0.95), zIndex: 3 });
  }

  if (phase.blast <= 0) return;

  // The blast, from the target outward. Layers go back to front so the flash ends up on top: embers,
  // rings, sparks, and the flash last.
  const [x, y] = TARGET;
  const blastScale = radius * BLAST_REACH * params.blast;

  // The fire body: two discs, the outer one darker and wider, so the burst has a hot middle and a
  // softer edge instead of being one flat circle.
  const burst = burstBrightness(phase);
  if (burst > 1e-3) {
    // Three discs, each narrower and hotter than the one outside it: that ladder is the only "radial
    // gradient" the 2D layer has. They fade at different rates — the outer haze first, the hot core
    // last — so the body cools from the edges in while it shrinks. Fading all three together leaves a
    // large half-transparent orange disc, which over a dark background reads as brown, not as fire.
    // Three discs, each narrower and hotter than the one outside it: the only "radial gradient" the
    // 2D layer has. They all shrink together, so the fire is consumed from the outside in.
    const blastRadius = radius * BLAST_REACH * BURST_REACH * params.blast * burstRadius(phase);
    if (blastRadius > 1e-3) {
      d2.circle_s([x, y], blastRadius, { color: withAlpha(hue, 0.95 * burst), zIndex: 3 });
      d2.circle_s([x, y], blastRadius * 0.55, { color: withAlpha(core, 0.95 * burst), zIndex: 3 });
      d2.circle_s([x, y], blastRadius * 0.26, { color: withAlpha(lighten(core, 0.55), 0.9 * burst), zIndex: 3 });
    }
  }

  const emberAlpha = emberBrightness(phase);
  const embers = Math.max(0, Math.round(params.embers));
  if (emberAlpha > 1e-3) {
    for (let index = 0; index < embers; index++) {
      const angle = index * GOLDEN_ANGLE;
      const reach = emberReach(phase) * blastScale * EMBER_TRAVEL * 0.55;
      // Embers drift upward as they fade: the blast is over, they are rising off it.
      d2.circle_s([x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * 0.6 + reach * 0.55], radius * 0.13, {
        color: withAlpha(lighten(hue, 0.25), 0.9 * emberAlpha),
        zIndex: 3,
      });
    }
  }

  // Both rings fade on the square of their remaining life: a linear fade leaves the front at 20%
  // opacity exactly while it is still the only thing on screen, and it reads as already gone.
  const fast = blastScale * RING_FAST.travel * ringRadius(phase);
  if (fast > 1e-3) {
    const life = Math.max(0, 1 - phase.blast / RING_FAST.span);
    const fastColor = lighten(hue, 0.5);
    d2.circle([x, y], fast, {
      strokeWidth: radius * 0.11,
      strokeWidthMode: "world",
      color: withAlpha(fastColor, life * life),
      zIndex: 4,
    });
  }
  const slow = blastScale * RING_SLOW.travel * slowRingRadius(phase);
  if (slow > 1e-3) {
    const life = Math.max(0, 1 - phase.blast / RING_SLOW.span);
    d2.circle([x, y], slow, {
      strokeWidth: radius * 0.07,
      strokeWidthMode: "world",
      color: withAlpha(hue, 0.85 * life * life),
      zIndex: 4,
    });
  }

  const sparks = Math.max(0, Math.round(params.sparks));
  // The fan starts outside the fire body's reach, so it is visible from the first blast frame. A fan
  // that only emerges once the body has shrunk reads as if the sparks were late to their own hit.
  const sparkOrigin = radius * BLAST_REACH * BURST_REACH * burstRadius(phase);
  const hot = lighten(hue, 0.5);
  for (let index = 0; index < sparks; index++) {
    // Each spark launches on its own short delay and travels its own distance. An evenly spaced fan
    // at one radius is a wheel of spokes; the staggered version is debris.
    const delay = ((index * 7) % 5) / 5 * SPARK_STAGGER;
    const local = Math.max(0, phase.blast - delay) / (1 - SPARK_STAGGER);
    const alpha = Math.max(0, 1 - local / SPARK_FADE);
    if (alpha <= 1e-3) continue;
    const reach = Math.min(local / SPARK_SPAN, 1);
    const travel = radius * BLAST_REACH * params.blast * SPARK_TRAVEL * (0.55 + 0.45 * ((index * 3) % 4) / 3);
    const head = sparkOrigin * (1 - 0.4 * reach) + reach * travel;
    const angle = (index / Math.max(1, sparks)) * Math.PI * 2 + GOLDEN_ANGLE * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // A streak behind the head with a hot tip on it: the streak is what a thrown ember looks like,
    // and a bare dot at a different radius only looks like a dot at a different radius.
    const tailLength = radius * 0.9 * alpha;
    d2.line(
      [x + cos * (head - tailLength), y + sin * (head - tailLength)],
      [x + cos * head, y + sin * head],
      {
        width: radius * 0.1 * alpha,
        widthMode: "world",
        color: withAlpha(lighten(hue, 0.3), 0),
        colorEnd: withAlpha(hot, alpha),
        zIndex: 5,
      },
    );
    d2.circle_s([x + cos * head, y + sin * head], radius * 0.09 * alpha, {
      color: withAlpha(hot, alpha),
      zIndex: 5,
    });
  }

  // The flash is a small hot disc, not a big one: a hit reads as a point of light on the body, and
  // a disc the size of the blast would only wash the rings out on the one frame they are all visible.
  // It is also white rather than the fire's hue — that frame is the light, not the fire.
  // Two tiers: a faint halo and a small white core. Both stay inside the target's own footprint —
  // a halo wider than the body reads as a stained disc around it rather than as light on it.
  const flash = flashBrightness(phase);
  if (flash > 1e-3) {
    const white = lighten(hue, 0.85);
    d2.circle_s([x, y], radius * (0.75 + 0.35 * flash), { color: withAlpha(white, 0.28 * flash), zIndex: 6 });
    d2.circle_s([x, y], radius * (0.35 + 0.4 * flash), { color: withAlpha(white, 0.9 * flash), zIndex: 6 });
  }
}
