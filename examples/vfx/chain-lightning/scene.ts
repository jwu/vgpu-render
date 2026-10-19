/**
 * `chain-lightning`: one bolt strikes the first enemy, then forks to the rest on the same frame.
 *
 * The clip is a strike, not a beam. A small charge lights up on the caster, the main bolt lands
 * inside the first tenth of the loop, and on that frame every remaining enemy is connected at once
 * by a fork out of the first body. The tree then kicks twice and is gone: the rest of the loop is
 * empty on purpose, because a bolt that stays connected reads as a channel rather than as a hit.
 *
 * The path is a hard zig-zag, not a smooth arc and not a trembling line: a few long legs with big
 * throws, rebuilt every frame, so the bolt reads as lightning drawn through the air. The caster
 * still carries no arcs of its own — the bolt exists only while it is striking.
 *
 * A bolt is not a stroke with a random shape baked in: every frame rebuilds the jagged path from a
 * deterministic hash, so the electricity visibly re-cracks instead of sliding a fixed zigzag around.
 * The hash takes the frame index, so the same `time` always produces the same shape — a scrubbed
 * timeline, a reload and a screenshot comparison all see one picture.
 *
 * All of it is `world2d`: the bodies, the bolts and the curve rows scale with the camera together.
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

type Vec2 = readonly [number, number];

/** The loop length the page opens with; the timeline's `duration` parameter overrides it. */
export const LOOP_SECONDS = DEFAULT_DURATION;

/** Share of the loop the caster spends charging: one small light on its own body. */
export const CHARGE_RATIO = 0.04;

/** Loop position where the main bolt lands. The whole strike is over inside the first tenth. */
export const STRIKE_RATIO = 0.08;

/**
 * How long the bolt tree stays on screen after the hit, as a share of the loop.
 *
 * Short on purpose: the beat is a strike — one hit, two afterglow kicks, then empty air for the rest
 * of the loop. Bolts that hold connect the bodies into a beam, which is a different effect.
 */
export const BOLT_LIFE = 0.26;

/** How many times the bolt tree flashes after the hit: the strike plus two weaker afterglow kicks. */
export const BOLT_PULSES = 3;

/** Share of the loop the hit flash lasts, per enemy. */
export const FLASH_SPAN = 0.06;

/** Share of the loop the hit rings take to expand and die. */
export const RING_SPAN = 0.11;

/** How many legs one bolt's path is built from. Few and long: that is what makes the corners hard. */
export const ARC_SEGMENTS = 9;

/** How many legs a branch off a bolt is built from. */
export const BRANCH_SEGMENTS = 5;

/**
 * How far a corner throws the path sideways, as a share of the bolt's own length.
 *
 * This is a throw, not a wobble: the bolt zig-zags across a wide band around the line between the
 * two bodies, so the corners read as lightning rather than as a nervous stroke.
 */
export const JAG_RATIO = 0.18;

/** Cap on a corner's throw, in body radii, so a long fork does not swing off the stage. */
export const JAG_MAX_RADIUS = 1;

/**
 * The rate at which a bolt re-cracks, in shapes per second.
 *
 * Tied to the loop fraction rather than to a wall clock, so a slow-motion loop shows slower
 * electricity and a fast one shows a strobe — which is what a re-timed VFX clip should do.
 */
export const FLICKER_FPS = 30;

/** Body radii. The enemy radius is also the page's scale for bolt thickness and branch size. */
export const CASTER_RADIUS = 1.35;
export const ENEMY_RADIUS = 1.0;

/** Where the caster stands. */
export const CASTER: Vec2 = [-12.8, 2.6];

/**
 * Fixed enemy slots, nearest first.
 *
 * The first slot is the one the main bolt hits and the pivot the forks leave from. Fixed positions
 * rather than a generated arc: the page has no random source, and a fixed layout keeps the same
 * picture at every screen size and in every screenshot comparison. The slots zig-zag in height so
 * neighbouring forks do not overlap into one thick band.
 */
export const ENEMY_SLOTS: readonly Vec2[] = [
  [-7.4, 4.7],
  [-2.2, 2.2],
  [2.6, 5.0],
  [7.4, 2.3],
  [11.6, 4.6],
  [14.9, 2.0],
];

/** Wide enough for the whole bolt tree above and the curve rows below. */
export const CHAIN_VIEW = { width: 34, height: 15.5 } as const;

/** Where the curve rows sit: full width under the stage, rows stacking downward. */
export const TIMELINE_LAYOUT: TimelineLayout = {
  left: -11,
  width: 26,
  top: 0.1,
  trackHeight: 2.0,
  trackGap: 0.5,
};

/** Clamp to 0-1. Every phase function takes a raw loop position, which can fall outside. */
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** A 0-1 value from two integers, with no random source: same inputs, same bolt, every replay. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** One numeric parameter, falling back when a caller passes no record at all. */
function numberParam(params: EffectParams, key: string, fallback: number): number {
  const raw = params[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

/** One integer parameter, rounded. */
function intParam(params: EffectParams, key: string, fallback: number): number {
  return Math.round(numberParam(params, key, fallback));
}

/** How many enemies this frame strikes: at least one, never more slots than the page has. */
export function enemyCount(params: EffectParams): number {
  return Math.max(1, Math.min(ENEMY_SLOTS.length, intParam(params, "targets", 4)));
}

/**
 * Brightness of the electricity at loop position `t`, for the bolt with index `index`.
 *
 * `t` is the raw loop position, quantized to `FLICKER_FPS` so the curve row shows the same steps
 * the stage draws. Every bolt gets its own phase through `index`, which is what keeps the forks
 * from pulsing in unison.
 */
export function boltFlicker(t: number, index: number): number {
  const frame = Math.floor(clamp01(t) * FLICKER_FPS);
  return 0.84 + 0.16 * hash(index * 7 + 1, frame + 11);
}

/**
 * Where one playback is at `time`, as the fractions every layer reads.
 *
 * `charge` swells through the windup, `strike` covers caster → first enemy, `fork` snaps to 1 on the
 * hit frame (the forks are never grown, they are simply there), and `flash`/`ring` are the hit
 * feedback. `fade` is the strobe envelope of the whole bolt tree: full on the hit, two weaker
 * kicks, then zero for the rest of the loop.
 */
export type ChainPhase = {
  /** 0-1 raw loop position; what the playhead rides on. */
  readonly progress: number;
  /** 0-1 windup, saturating on the strike frame. */
  readonly charge: number;
  /** 0-1 length of the main bolt; 0 before it leaves the caster. */
  readonly strike: number;
  /** 1 from the hit frame onward, 0 before it. The forks are never partially drawn. */
  readonly fork: number;
  /** 1 on the hit frame, 0 once the flash is over; 0 before the hit. */
  readonly flash: number;
  /** 0-1 expansion of the hit rings; 0 before the hit. */
  readonly ring: number;
  /** Brightness of every bolt: the post-hit strobe, 0 before the hit and after `BOLT_LIFE`. */
  readonly fade: number;
};

/**
 * Brightness of the bolt tree `life` (0-1) through the post-hit window.
 *
 * A strike is not a fade: it lands at full strength, kicks twice while the eye is still on the hit,
 * and then there is nothing. Each kick is weaker than the one before, and the squared ramp is what
 * makes the dark gap between two kicks read as lightning striking again rather than as a slow dim.
 */
export function strikePulse(life: number): number {
  if (!(life >= 0) || life >= 1) return 0;
  const phase = (life * BOLT_PULSES) % 1;
  return (1 - phase) ** 2 * (1 - life);
}

/** `progress` is a raw 0-1 loop position; `duration` only scales the wall clock. */
export function chainPhaseAt(progress: number): ChainPhase {
  const p = clamp01(progress);
  const charge = p >= CHARGE_RATIO ? 1 : p / CHARGE_RATIO;
  const strike = p <= CHARGE_RATIO ? 0 : outCirc(Math.min(1, (p - CHARGE_RATIO) / (STRIKE_RATIO - CHARGE_RATIO)));
  // Time since the hit, in loop shares. Before the hit, nothing downstream of the strike exists.
  const since = Math.max(0, p - STRIKE_RATIO);
  const hit = since > 0;
  return {
    progress: p,
    charge,
    strike,
    fork: hit ? 1 : 0,
    flash: hit ? Math.max(0, 1 - since / FLASH_SPAN) : 0,
    ring: hit ? Math.min(1, since / RING_SPAN) : 0,
    fade: hit ? strikePulse(since / BOLT_LIFE) : 0,
  };
}

export function chainPhase(time: number, duration: number = LOOP_SECONDS): ChainPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  return chainPhaseAt(loop / span);
}

/** The page's bolt colour, lightened towards white for the core and the hit flash. */
function lighten(color: Color, amount: number): Color {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3],
  ];
}

/** The point where a bolt leaves a body: on the rim, so it starts on the unit rather than in it. */
function rimPoint(from: Vec2, to: Vec2, radius: number): Vec2 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length <= 1e-6) return from;
  return [from[0] + (dx / length) * radius, from[1] + (dy / length) * radius];
}

/**
 * The zig-zag path between two points, rebuilt for one frame.
 *
 * The shape is a few long straight legs with hard corners, not a smooth wave: many small offsets
 * read as a shaking wire, while fewer corners with bigger throws read as lightning. `sin(pi * s)`
 * keeps both ends pinned to the bodies, raised to a power below one so the throws stay large almost
 * all the way to each body instead of dying off early. The along-track offset keeps the legs from
 * all changing direction in the same plane, which is what stops the zig-zag looking like a ladder.
 */
export function boltPath(from: Vec2, to: Vec2, seed: number, amplitude: number, segments: number): Vec2[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length <= 1e-6 || amplitude <= 1e-6) return [from, to];
  const nx = -dy / length;
  const ny = dx / length;
  const ux = dx / length;
  const uy = dy / length;
  const points: Vec2[] = [from];
  for (let i = 1; i < segments; i++) {
    const s = i / segments;
    const envelope = Math.sin(Math.PI * s) ** 0.6;
    const lateral = (hash(seed, i) * 2 - 1) * amplitude * envelope;
    const along = (hash(seed + 1, i) * 2 - 1) * amplitude * 0.35 * envelope;
    points.push([
      from[0] + dx * s + nx * lateral + ux * along,
      from[1] + dy * s + ny * lateral + uy * along,
    ]);
  }
  points.push(to);
  return points;
}

export type BoltStyle = {
  readonly radius: number;
  readonly brightness: number;
  /** 0-1 share of the bolt that has been drawn; the far endpoint is interpolated by it. */
  readonly growth: number;
  readonly jitter: number;
  readonly glow: number;
  /** Branches hanging off this bolt. */
  readonly branches: number;
  /** Per-frame seed: drives the corners of the path. */
  readonly seed: number;
  readonly body: Color;
  readonly core: Color;
  readonly zIndex: number;
};

/**
 * One bolt: three passes of the same path plus a few branches.
 *
 * The 2D layer has no glow pass and no gradient fill, so the halo has to be built as a wider, dimmer
 * copy of the same stroke. Three rungs — a wide halo, the bolt, a near-white core — are the same
 * ladder the fireball's blast uses; fewer rungs read as a coloured line, more rungs only cost draw
 * commands without changing the edge.
 */
function drawBolt(drawList: FrameDrawList, from: Vec2, to: Vec2, style: BoltStyle): void {
  if (style.brightness <= 1e-3 || style.growth <= 0) return;
  const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (span <= 1e-6) return;
  const end: Vec2 = [from[0] + (to[0] - from[0]) * style.growth, from[1] + (to[1] - from[1]) * style.growth];
  // The crack stays small — that is what the last pass cut back — and the visible shape now lives in
  // a low-frequency bow: the bolt arcs between the bodies instead of running straight between them.
  const amplitude = Math.min(style.radius * JAG_MAX_RADIUS, span * JAG_RATIO) * style.jitter;
  const path = boltPath(from, end, style.seed, amplitude, ARC_SEGMENTS);
  const { d2 } = drawList;

  if (style.glow > 1e-3) {
    d2.polyline(path, {
      width: style.radius * 0.36 * style.glow,
      widthMode: "world",
      color: withAlpha(style.body, 0.12 * style.brightness),
      zIndex: style.zIndex,
    });
  }
  d2.polyline(path, {
    width: style.radius * 0.16,
    widthMode: "world",
    color: withAlpha(style.body, 0.6 * style.brightness),
    zIndex: style.zIndex + 1,
  });
  d2.polyline(path, {
    width: style.radius * 0.07,
    widthMode: "world",
    color: withAlpha(style.core, 0.95 * style.brightness),
    zIndex: style.zIndex + 2,
  });

  // A branch on a half-drawn trunk reads as a second bolt crossing the first one, so branches wait
  // until the trunk has arrived.
  if (style.growth < 0.98) return;
  drawBranches(drawList, from, to, style);
}

/** Short side strokes hanging off one bolt: the difference between a wire and lightning. */
function drawBranches(drawList: FrameDrawList, from: Vec2, to: Vec2, style: BoltStyle): void {
  const count = Math.max(0, Math.round(style.branches));
  if (count === 0) return;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length <= 1e-6) return;
  const ux = dx / length;
  const uy = dy / length;
  const { d2 } = drawList;
  for (let index = 0; index < count; index++) {
    // Branches leave from the middle of the trunk, alternating sides, and never from the two ends:
    // an end branch looks like a second connection to that body.
    const at = 0.28 + 0.44 * hash(style.seed + 3, index);
    const origin: Vec2 = [from[0] + dx * at, from[1] + dy * at];
    const side = hash(style.seed + 5, index) < 0.5 ? -1 : 1;
    const angle = side * (0.5 + 0.55 * hash(style.seed + 7, index));
    // Branch length follows the bolt thickness rather than the trunk length: a branch measured as a
    // share of a long fork grows into a second bolt that happens to start on the first one.
    const reach = style.radius * (1.5 + 1.3 * hash(style.seed + 11, index));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tip: Vec2 = [origin[0] + (ux * cos - uy * sin) * reach, origin[1] + (ux * sin + uy * cos) * reach];
    const path = boltPath(
      origin,
      tip,
      style.seed + 13 * (index + 1),
      // A branch jags against its own length, not the trunk's: a short side stroke measured against a
      // long fork would fold back onto itself.
      Math.min(reach * JAG_RATIO, style.radius * JAG_MAX_RADIUS * 0.75) * style.jitter,
      BRANCH_SEGMENTS,
    );
    // Two rungs instead of three: a branch is thinner than the trunk that carries it.
    d2.polyline(path, {
      width: style.radius * 0.095,
      widthMode: "world",
      color: withAlpha(style.body, 0.42 * style.brightness),
      zIndex: style.zIndex,
    });
    d2.polyline(path, {
      width: style.radius * 0.05,
      widthMode: "world",
      color: withAlpha(style.core, 0.9 * style.brightness),
      zIndex: style.zIndex + 1,
    });
  }
}

/** The three rows: the strike, the bolt tree's strobe, the hit feedback. */
function chainTracks(params: EffectParams, body: Color): readonly TimelineTrack[] {
  const count = enemyCount(params);
  const crackles: TimelineCurve[] = [];
  for (let index = 0; index < count; index++) {
    crackles.push({
      sample: (t) => boltFlicker(t, index) * chainPhaseAt(t).fade,
      // The later bolts fade back so a six-bolt row still reads bolt by bolt.
      ...(index === 0 ? {} : { alpha: Math.max(0.3, 0.85 - index * 0.12) }),
    });
  }
  return [
    {
      id: "strike",
      title: "劈中 · 主弧",
      name: "bolt · strike",
      color: body,
      curves: [{ sample: (t) => chainPhaseAt(t).strike }],
    },
    {
      id: "crackle",
      title: "电弧 · 余闪",
      name: `bolt × ${count} · 亮度`,
      color: lighten(body, 0.3),
      // Every bolt rides the same strobe, so these rows are the two afterglow kicks and the dark
      // gap between them — the shape a strike has, not a fade.
      curves: crackles,
    },
    {
      id: "hit",
      title: "命中 · 闪光",
      name: "flash · ring",
      color: lighten(body, 0.62),
      // The flash starts full and decays while the ring expands, so the two curves cross in the
      // middle of the window — which is exactly what the stage shows.
      curves: [
        { sample: (t) => chainPhaseAt(t).flash },
        { sample: (t) => chainPhaseAt(t).ring, alpha: 0.55 },
      ],
    },
  ];
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const phase = chainPhase(context.time, params.duration);
  const body = hueColor(params.hue, params.saturation, 1);
  const core = lighten(body, 0.72);

  drawStage(drawList, params, phase, body, core);
  drawTimelineTracks(drawList, {
    tracks: chainTracks(params, body),
    layout: TIMELINE_LAYOUT,
    progress: phase.progress,
    duration: params.duration,
  });
}

/** The shape a bolt is rebuilt from this frame. Same loop position, same shape. */
function frameSeed(progress: number, index: number): number {
  return Math.floor(clamp01(progress) * FLICKER_FPS) * 37 + index * 101 + 1;
}

function drawStage(drawList: FrameDrawList, params: EffectParams, phase: ChainPhase, body: Color, core: Color): void {
  const { d2 } = drawList;
  const count = enemyCount(params);
  const jitter = numberParam(params, "jitter", 1);
  const glow = numberParam(params, "glow", 1);
  const branches = Math.max(0, intParam(params, "split", 1));

  // The bodies first: every bolt leaves or lands on one of them.
  drawUnitDisc(drawList, CASTER, CASTER_RADIUS, params.casterHue, params.casterSaturation);
  for (let index = 0; index < count; index++) {
    drawUnitDisc(drawList, ENEMY_SLOTS[index]!, ENEMY_RADIUS, params.targetHue, params.targetSaturation);
  }

  // The windup is one small charge on the caster, not arcs of its own: the caster is where the bolt
  // comes from, not a second light show around it. It hands over to the main bolt on the frame the
  // bolt leaves, so the two never read as two sources.
  const chargeBrightness = phase.charge * (1 - phase.strike);
  if (chargeBrightness > 1e-3 && phase.fade > 0) {
    d2.circle_s(CASTER, CASTER_RADIUS * (0.2 + 0.22 * phase.charge), {
      color: withAlpha(core, 0.5 * chargeBrightness * phase.fade),
      zIndex: 2,
    });
  }

  // The main bolt, from the caster's rim to the first enemy's rim.
  if (phase.strike > 0 && phase.fade > 0) {
    const target = ENEMY_SLOTS[0]!;
    const from = rimPoint(CASTER, target, CASTER_RADIUS * 0.94);
    const to = rimPoint(target, CASTER, ENEMY_RADIUS * 0.9);
    drawBolt(drawList, from, to, {
      // The trunk is thicker than the forks it sprouts: the tree has to read from its source out.
      radius: ENEMY_RADIUS * 1.15,
      brightness: phase.fade * boltFlicker(phase.progress, 0),
      growth: phase.strike,
      jitter,
      glow,
      branches,
      seed: frameSeed(phase.progress, 0),
      body,
      core,
      zIndex: 2,
    });
  }

  // The forks: every other enemy connected from the first one on the strike frame.
  if (phase.fork > 0 && phase.fade > 0) {
    const pivot = ENEMY_SLOTS[0]!;
    for (let index = 1; index < count; index++) {
      const target = ENEMY_SLOTS[index]!;
      const from = rimPoint(pivot, target, ENEMY_RADIUS * 0.9);
      const to = rimPoint(target, pivot, ENEMY_RADIUS * 0.9);
      drawBolt(drawList, from, to, {
        radius: ENEMY_RADIUS,
        // A fork is dimmer than the bolt that caused it, and its brightness steps down with the
        // order it sits in, so the tree reads from its trunk outward.
        brightness: phase.fade * boltFlicker(phase.progress, index) * (0.92 - index * 0.06),
        growth: phase.fork,
        jitter,
        glow,
        branches,
        seed: frameSeed(phase.progress, index),
        body,
        core,
        zIndex: 2,
      });
    }
  }

  const white = lighten(body, 0.85);
  for (let index = 0; index < count; index++) {
    const center = ENEMY_SLOTS[index]!;

    // The hit rings expand out of each body and fade on the square of their remaining life: a
    // linear fade is still an obvious band while it is the only thing left on the frame.
    if (phase.ring > 0 && phase.ring < 1) {
      const reach = ENEMY_RADIUS * (1.05 + 1.15 * phase.ring);
      d2.circle(center, reach, {
        strokeWidth: ENEMY_RADIUS * 0.09,
        strokeWidthMode: "world",
        color: withAlpha(lighten(body, 0.5), 0.8 * (1 - phase.ring) ** 2),
        zIndex: 5,
      });
    }

    // Two tiers of flash over the body, both inside its own footprint: a halo wider than the unit
    // reads as a stained disc around it rather than as light on it.
    if (phase.flash > 1e-3) {
      d2.circle_s(center, ENEMY_RADIUS * (0.72 + 0.4 * phase.flash), {
        color: withAlpha(white, 0.28 * phase.flash),
        zIndex: 6,
      });
      d2.circle_s(center, ENEMY_RADIUS * (0.3 + 0.5 * phase.flash), {
        color: withAlpha(white, 0.85 * phase.flash),
        zIndex: 6,
      });
    }
  }
}
