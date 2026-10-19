/**
 * `dash-slash`: the caster dashes past the enemy, blinks out behind it, and the cuts land a beat
 * later.
 *
 * The clip is deliberately not one continuous action. The caster runs a straight line from the left
 * of the stage to the far side of the enemy, leaving a few afterimages on the path, and the moment
 * it arrives there is a single vertical flash — the blink. Then the stage holds, and only after that
 * pause does the enemy take the damage: six cuts open on its body one after another, each at its own
 * angle, each stretching and fading on its own short clock.
 *
 * The pause is the whole point. A dash that resolves on the same frame it lands is a movement
 * effect; the delay is what makes the caster look like it already finished the job, and the six
 * cuts look like the damage catching up.
 *
 * All of it is `world2d`, so the bodies, the trail and the cut marks scale with the camera together.
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

/** Loop position the dash starts. The first tenth is the caster's beat before it moves. */
export const DASH_START = 0.1;

/**
 * Loop position the caster arrives, which is also the blink. Everything before it is travel;
 * everything after it is the pause and the damage.
 */
export const DASH_END = 0.3;

/** How long the arrival flash lasts after `DASH_END`, as a share of the loop. */
export const BLINK_SPAN = 0.03;

/** Loop position the first cut opens. The gap from `DASH_END` is the pause the page exists for. */
export const CUT_START = 0.44;

/** Spacing between two cuts. Short on purpose: six cuts should read as one flurry, not six hits. */
export const CUT_GAP = 0.055;

/** How long one cut mark lives, from opening to fully faded, as a share of the loop. */
export const CUT_LIFE = 0.18;

/**
 * Share of a cut's life it spends stretching to full length.
 *
 * The mark opens at 60% of its length and is pulled out to 100% over this window, so a cut reads as
 * a wound being opened rather than as a line fading in.
 */
export const CUT_GROW_RATIO = 0.16;

/** Body radii. The enemy's radius is also the page's scale for cut length and trail size. */
export const CASTER_RADIUS = 1.25;
export const ENEMY_RADIUS = 1.0;

/** Where the caster starts, where it ends, and where the enemy stands between them. */
export const CASTER_START: Vec2 = [-13.2, 3.6];
export const CASTER_END: Vec2 = [7.8, 3.6];
export const ENEMY: Vec2 = [5.2, 3.6];

/** Wide enough for the dash line above and the curve rows below. */
export const DASH_VIEW = { width: 34, height: 15.5 } as const;

/** Where the curve rows sit: full width under the stage, rows stacking downward. */
export const TIMELINE_LAYOUT: TimelineLayout = {
  left: -11,
  width: 26,
  top: 0.1,
  trackHeight: 1.4,
  trackGap: 0.35,
};

/** Path share the nearest afterimage sits at; the rest step back toward the caster's start. */
const TRAIL_FROM = 0.66;

/** How far apart the afterimages sit, in path shares. */
const TRAIL_GAP = 0.1;

/** How long the afterimages survive once the caster has arrived, as a share of the loop. */
const TRAIL_LIFE = 0.18;

/** Opacity of the nearest afterimage. The rest fade back from here. */
const TRAIL_ALPHA = 0.22;

/** Cut thickness as a share of its length: thin — a cut, not a blade. */
const CUT_WIDTH_RATIO = 0.22;

/** How far a cut can sit off the enemy's centre, as a share of its radius. */
const CUT_OFFSET_RATIO = 0.3;

/**
 * Golden angle: scatters the six cuts around the body without a random source, so the same enemy
 * always gets the same cuts and a screenshot comparison is reproducible.
 */
const GOLDEN_ANGLE = 2.399963229728653;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Smooth acceleration and deceleration for the dash.
 *
 * `outCirc` was too abrupt here: it put the caster on top of the enemy after three frames, which hid
 * the travel and the afterimages with it. A quad in-out keeps the run visible and still lands hard.
 */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
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

/** The page's cut colour, lightened towards white for the hot core. */
function lighten(color: Color, amount: number): Color {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3],
  ];
}

/**
 * Where the dash and the blink are at `progress` (a raw 0-1 loop position).
 *
 * `dash` is eased with `easeInOutQuad`: the caster accelerates out of the stance and decelerates into
 * its landing, so the travel reads as a dash instead of a jump. `blink` is a short spike that starts
 * on the arrival frame, so the flash belongs to the arrival and not to the travel.
 */
export type DashSlashPhase = {
  readonly progress: number;
  /** 0-1 position along the dash line. */
  readonly dash: number;
  /** 1 on the arrival frame, 0 once the blink is over. */
  readonly blink: number;
};

export function dashSlashPhaseAt(progress: number): DashSlashPhase {
  const p = clamp01(progress);
  const dash =
    p <= DASH_START ? 0 : p >= DASH_END ? 1 : easeInOutQuad((p - DASH_START) / (DASH_END - DASH_START));
  const sinceArrive = p - DASH_END;
  const blink = sinceArrive < 0 || sinceArrive > BLINK_SPAN ? 0 : 1 - sinceArrive / BLINK_SPAN;
  return { progress: p, dash, blink };
}

export function dashSlashPhase(time: number, duration: number = LOOP_SECONDS): DashSlashPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  return dashSlashPhaseAt(loop / span);
}

/** Loop position cut `index` opens at. */
export function cutStart(index: number): number {
  return CUT_START + index * CUT_GAP;
}

/** 0-1 position of one cut through its own life; negative before it opens. */
export function cutLocal(progress: number, index: number): number {
  return (progress - cutStart(index)) / CUT_LIFE;
}

/** Brightness of one cut: full while it opens, then a squared fade-out. */
export function cutBrightness(progress: number, index: number): number {
  const local = cutLocal(progress, index);
  if (local < 0 || local >= 1) return 0;
  return (1 - local) ** 2;
}

/** 0-1 stretch of one cut, saturating inside `CUT_GROW_RATIO` of its life. */
export function cutGrow(progress: number, index: number): number {
  const local = cutLocal(progress, index);
  if (local < 0) return 0;
  return outCirc(Math.min(1, local / CUT_GROW_RATIO));
}

/** The four rows: the dash, the flurry, one cut's stretch, and the blink. */
function dashSlashTracks(params: EffectParams, cut: Color, caster: Color): readonly TimelineTrack[] {
  const count = Math.max(0, Math.round(params.cuts));
  const cuts: TimelineCurve[] = [];
  for (let index = 0; index < count; index++) {
    cuts.push({
      sample: (t) => cutBrightness(t, index),
      // The later cuts fade back so a twelve-cut row still reads cut by cut.
      ...(index === 0 ? {} : { alpha: Math.max(0.3, 0.85 - index * 0.06) }),
    });
  }
  return [
    {
      id: "dash",
      title: "位移 · 冲刺",
      name: "caster · dash",
      color: caster,
      curves: [{ sample: (t) => dashSlashPhaseAt(t).dash }],
    },
    {
      id: "cuts",
      title: "刀痕 · 连斩",
      name: `cut × ${count} · 亮度`,
      color: cut,
      curves: cuts,
    },
    {
      id: "grow",
      title: "刀痕 · 拉伸",
      name: "cut · grow",
      color: lighten(cut, 0.35),
      curves: [{ sample: (t) => cutGrow(t, 0) }],
    },
    {
      id: "blink",
      title: "一闪 · 亮度",
      name: "blink · flash",
      color: lighten(cut, 0.7),
      curves: [{ sample: (t) => dashSlashPhaseAt(t).blink }],
    },
  ];
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const phase = dashSlashPhase(context.time, params.duration);
  const cut = hueColor(params.hue, params.saturation, 1);
  const hot = lighten(cut, 0.72);
  const white = lighten(cut, 0.95);

  drawStage(drawList, params, phase, cut, hot, white);
  drawTimelineTracks(drawList, {
    tracks: dashSlashTracks(params, cut, hueColor(params.casterHue, params.casterSaturation, 0.9)),
    layout: TIMELINE_LAYOUT,
    progress: phase.progress,
    duration: params.duration,
  });
}

function drawStage(
  drawList: FrameDrawList,
  params: EffectParams,
  phase: DashSlashPhase,
  cut: Color,
  hot: Color,
  white: Color,
): void {
  const { d2 } = drawList;

  // The enemy first: every cut opens on top of this body.
  drawUnitDisc(drawList, ENEMY, ENEMY_RADIUS, params.enemyHue, params.enemySaturation);

  // The afterimages sit under the caster, on the path it has already covered.
  drawTrail(drawList, params, phase, hueColor(params.casterHue, params.casterSaturation, 0.9), hot);

  // The caster at its current point on the line. It holds on the arrival frame instead of sliding
  // back, so the pause after the blink reads as a finished job.
  drawUnitDisc(
    drawList,
    lerp(CASTER_START, CASTER_END, phase.dash),
    CASTER_RADIUS,
    params.casterHue,
    params.casterSaturation,
  );

  drawCuts(drawList, params, phase, cut, hot, white);

  // The blink: one vertical flash through the enemy on the arrival frame. It shrinks as it fades so
  // it leaves the frame instead of being switched off.
  if (phase.blink > 1e-3) {
    const reach = ENEMY_RADIUS * (1.2 + 1.6 * phase.blink);
    d2.line([ENEMY[0], ENEMY[1] - reach], [ENEMY[0], ENEMY[1] + reach], {
      width: ENEMY_RADIUS * 0.07 * phase.blink,
      widthMode: "world",
      color: withAlpha(white, 0.9 * phase.blink),
      zIndex: 8,
    });
    d2.circle_s(ENEMY, ENEMY_RADIUS * (0.35 + 0.45 * phase.blink), {
      color: withAlpha(white, 0.55 * phase.blink),
      zIndex: 8,
    });
  }
}

/**
 * The afterimages the dash leaves behind.
 *
 * Each one sits at a fixed point on the path and lights up when the caster passes it, then all of
 * them fade out on the same clock after the arrival. They are not a motion blur sampled backwards
 * from the current position: a blur that follows the caster would make the dash look slower, while
 * marks left at fixed points read as the caster having already gone through.
 */
function drawTrail(
  drawList: FrameDrawList,
  params: EffectParams,
  phase: DashSlashPhase,
  caster: Color,
  hot: Color,
): void {
  const count = Math.max(0, Math.round(params.trails));
  if (count === 0) return;
  const sinceArrive = phase.progress - DASH_END;
  const life = sinceArrive <= 0 ? 1 : Math.max(0, 1 - sinceArrive / TRAIL_LIFE);
  if (life <= 1e-3) return;
  const { d2 } = drawList;
  for (let index = 0; index < count; index++) {
    const at = TRAIL_FROM - index * TRAIL_GAP;
    if (at <= 0) continue;
    // Lit only once the caster has reached that point on the path.
    const passed = Math.min(1, Math.max(0, (phase.dash - at) / 0.04));
    if (passed <= 1e-3) continue;
    const center = lerp(CASTER_START, CASTER_END, at);
    const alpha = TRAIL_ALPHA * passed * life * (1 - index / (count + 1));
    d2.circle_s(center, CASTER_RADIUS * 0.92, { color: withAlpha(caster, alpha), zIndex: 1 });
    // A short blade streak across the afterimage: the caster was already cutting on the way through.
    d2.line(
      [center[0] - CASTER_RADIUS * 0.95, center[1] + CASTER_RADIUS * 0.25],
      [center[0] + CASTER_RADIUS * 0.95, center[1] - CASTER_RADIUS * 0.25],
      {
        width: CASTER_RADIUS * 0.05,
        widthMode: "world",
        color: withAlpha(hot, alpha * 1.6),
        zIndex: 2,
      },
    );
  }
}

/**
 * The six cuts, one after another.
 *
 * Every cut gets its own angle from the golden sequence and its own small offset off the centre, so
 * a flurry reads as several different wounds rather than one mark blinking. Each one opens at 60% of
 * its length, is pulled to full size almost immediately, and fades on the square of its remaining
 * life — a linear fade leaves a bright cut hanging on a dim body.
 */
function drawCuts(
  drawList: FrameDrawList,
  params: EffectParams,
  phase: DashSlashPhase,
  cut: Color,
  hot: Color,
  white: Color,
): void {
  const count = Math.max(0, intParam(params, "cuts", 6));
  const length = numberParam(params, "length", 2);
  const { d2 } = drawList;
  for (let index = 0; index < count; index++) {
    const brightness = cutBrightness(phase.progress, index);
    if (brightness <= 1e-3) continue;
    const grow = cutGrow(phase.progress, index);
    const angle = (index * GOLDEN_ANGLE) % Math.PI;
    const lengthNow = ENEMY_RADIUS * length * (0.6 + 0.4 * grow);
    if (lengthNow <= 1e-3) continue;
    const width = lengthNow * CUT_WIDTH_RATIO;
    // Off-centre along the cut's own normal, so the cuts do not all pass through one point.
    const offset = Math.sin(index * GOLDEN_ANGLE) * ENEMY_RADIUS * CUT_OFFSET_RATIO;
    const center: Vec2 = [
      ENEMY[0] + Math.cos(angle + Math.PI / 2) * offset,
      ENEMY[1] + Math.sin(angle + Math.PI / 2) * offset,
    ];
    // Three rungs of the same rhombus: a soft halo in the cut colour, the cut itself in a hot near-
    // white, and a white core. The 2D layer has no glow pass, so this ladder is what makes the cut
    // look like it is emitting light instead of being a pale stripe on a purple body.
    d2.rhombus_s(center, [lengthNow * 1.15, width * 2.8], {
      rotation: angle,
      color: withAlpha(cut, 0.28 * brightness),
      zIndex: 4,
    });
    d2.rhombus_s(center, [lengthNow, width], {
      rotation: angle,
      color: withAlpha(hot, 0.98 * brightness),
      zIndex: 5,
    });
    d2.rhombus_s(center, [lengthNow * 0.96, width * 0.42], {
      rotation: angle,
      color: withAlpha(white, 0.95 * brightness),
      zIndex: 6,
    });
  }
}
