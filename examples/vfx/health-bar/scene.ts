/**
 * `health-bar`: two bar effects side by side — the ghost a hit leaves, and the grow-back a heal does.
 *
 * Both are taken from the battle simulator (`~/gamedev/battle`, `engines/scene-kit.ts`):
 *
 * - **受击 (hit)** — the bar is an opaque black slot with a blood-red fill, and a hit leaves a white
 *   ghost parked at the bar's old length. The ghost waits 0.22 s and then catches up on an ease-out
 *   quad; the delay is what makes the *amount* that came off readable, since without it the red just
 *   gets shorter and the hit is a number changing.
 * - **治疗 (heal)** — the fill grows back instead of snapping, and the stretch that just returned
 *   stays mint (`#2ee6a0`, the heal beam's colour) before fading into the wound colour. The simulator
 *   jumps the bar on a `heal` event because under a battlefield camera the bar is a reading; here the
 *   bar is the subject, and growing it says *how much* came back.
 *
 * They share one clock and one set of sliders, but they are separate examples on purpose: a single
 * unit can only be hit or healed at a time, and putting both in one strip made the two stories run
 * into each other. Hit plays in the first 0.6 s, heal in the last 0.5 s, so the playhead crosses the
 * page as two beats rather than one long blur — and a third bar effect (armour) only has to add a
 * unit, a phase function and its rows.
 *
 * Everything is `world2d` and sized in world units, so it zooms with the camera like the rest of
 * the page. The bars are drawn big on purpose: the simulator draws them 8 px tall under a camera
 * that zooms in on them, and here the bars *are* the page.
 */

import type { Color, FrameDrawList } from "../../../src/frame-draw-list.js";
import type { EffectParams } from "../../shared/meta.js";
import type { VfxSceneContext } from "../scene-context.js";
import { inOutExpo, outQuad } from "../easing.js";
import { hueColor, withAlpha } from "../params.js";
import { drawUnitDisc } from "../unit.js";
import {
  drawTimelineTracks,
  type TimelineCurve,
  type TimelineLayout,
  type TimelineTrack,
} from "../timeline-tracks.js";

/**
 * The loop both examples share, in seconds.
 *
 * Both effects start on the same frame and the loop ends when the last of them is done — the shorter
 * one simply holds its final frame and waits. `duration` can stretch that tail (a longer pause
 * before the replay) but can never cut an effect off: `loopSecondsOf` takes the longer of the two.
 */
export const LOOP_SECONDS = 0.6;

/**
 * How long the white ghost waits before it starts chasing, in seconds.
 *
 * The simulator's `GHOST_DELAY` / `GHOST_CHASE`: 0.22 s of hold, then 0.38 s to catch up. These are
 * the slider defaults, and the point of the sliders is to feel what moving either one does.
 */
export const GHOST_DELAY_SECONDS = 0.22;
export const GHOST_CHASE_SECONDS = 0.38;

/**
 * The hit flash: 18 frames at 60 Hz, `HIT_FLASH_FRAMES` in the simulator — the same window its
 * swing arc and its mark live in, so the three channels of a hit end together.
 */
export const FLASH_SECONDS = 0.3;
/**
 * Peak of the flash's decay curve, the simulator's `HIT_FLASH_PEAK`.
 *
 * The curve is what `hitPhaseAt` returns; the drawing divides by it, so the white disc peaks at
 * fully opaque. The simulator does the same, and for the same reason: the flash has to swallow the
 * body's rim and its label, and 85% white leaves both showing through.
 */
export const FLASH_PEAK = 0.85;

/** How long the red takes to grow back, in seconds (slider default). */
export const HEAL_SPAN_SECONDS = 0.25;
/** How long the mint stretch stays lit after it has finished growing, in seconds. */
export const HEAL_FADE_SECONDS = 0.25;

/**
 * Value (HSV) of the bar's fill.
 *
 * The simulator's fill is `#8a0303` = HSV(0, 0.98, 0.54): it is authored dark because the scene
 * target lifts it back to sRGB. Keeping the value out of the hue/saturation sliders means recolouring
 * the bar changes its hue, not its weight against the slot.
 */
export const HEALTH_VALUE = 0.54;
/** The fill's opacity, again the simulator's: a nearly opaque red over an opaque black slot. */
const HEALTH_ALPHA = 0.95;
/** The ghost is pure white at 0.92 — dimming it further lets the slot tint it grey. */
const GHOST_ALPHA = 0.92;

/**
 * The heal colour: grass green (hue 0.30), not the simulator's mint.
 *
 * The beam's `#2ee6a0` is a cyan-leaning mint; on the bar it read as neon. Pulling the hue towards
 * yellow and the value down to the wound red's own weight keeps the stretch beside the red instead
 * of shouting over it — authored values are lifted to sRGB by the scene target, so both the hue and
 * the 0.58 value are chosen for what they look like after that lift. It is still a *third* colour:
 * white means "just came off", green means "just came back".
 */
export const HEAL_HUE = 0.3;
export const HEAL_SATURATION = 0.75;
export const HEAL_VALUE = 0.58;

const SLOT_COLOR: Color = [0, 0, 0, 1];
const GHOST_RGB: Color = [1, 1, 1, 1];
const FLASH_RGB: Color = [1, 1, 1, 1];
/** The strip's playhead and flash row, the blue-white the other battle pages plot with. */
const CURVE_HEAD: Color = [0.82, 0.9, 1, 0.95];
const NAME_COLOR: Color = [0.92, 0.95, 1, 1];
const TITLE_COLOR: Color = [0.74, 0.81, 0.92, 1];
const GLYPH_COLOR: Color = [1, 1, 1, 0.95];

/** Gap between the top of a unit and the bottom of its slot, in world units. */
const BAR_GAP = 0.3;
/** Gap between the top of a slot and the unit's name, in world units. */
const NAME_GAP = 0.22;

/**
 * One example on the stage: what it is called and which effect it shows.
 *
 * Positions are derived from the list (`columnCenter`), not stored here: adding a third bar effect
 * (armour) is one more entry, and every column re-spaces itself around it.
 */
export type BarExample = {
  readonly id: "hit" | "heal";
  /** The unit's name, drawn above its bar and as the glyph inside its body. */
  readonly name: string;
  /** The row group's title: what this example demonstrates. */
  readonly label: string;
};

export const EXAMPLES: readonly BarExample[] = [
  { id: "hit", name: "守卫", label: "受击" },
  { id: "heal", name: "骑士", label: "治疗" },
];

export const UNIT_RADIUS = 1.9;
/** Bar size in world units: wider than the body, as the simulator's 50 px bar is. */
export const BAR_WIDTH = 7.2;
export const BAR_HEIGHT = 1;

/** A column per example: a body with its bar on top, that example's rows underneath. */
export const HEALTH_VIEW = { width: 30, height: 12.6 } as const;
/** Vertical centre of the bodies. The rows sit under them. */
export const EXAMPLE_Y = 2.4;

/** Body centre of column `index`; columns are evenly spaced across the view. */
export function columnCenter(index: number): number {
  const span = HEALTH_VIEW.width / EXAMPLES.length;
  return -HEALTH_VIEW.width / 2 + span * (index + 0.5);
}

/**
 * Width of a curve plot, and the gutter its row labels need on the left.
 *
 * The strip is drawn to the right of the labels, so the plot's centre sits half a gutter to the
 * right of the column's centre — that keeps the whole strip (labels + plot) centred under its body.
 */
const TRACK_WIDTH = 10.4;
const TRACK_LABEL_GUTTER = 1.75;
const TRACK_TOP = -0.95;

/** Where the rows of column `index` sit. */
export function trackLayout(index: number): TimelineLayout {
  return {
    left: columnCenter(index) - TRACK_WIDTH / 2 + TRACK_LABEL_GUTTER / 2,
    width: TRACK_WIDTH,
    top: TRACK_TOP,
    trackHeight: 1.25,
    trackGap: 0.28,
  };
}

/** The slice of the loop every example plays in, in seconds. Both start at zero. */
export type BarWindow = {
  readonly from: number;
  readonly to: number;
};

/**
 * How long the longest effect runs, in seconds.
 *
 * Both examples start together, so the shared window is the longest of them: the other one finishes
 * early and holds its last frame while the loop runs out. That is what makes the two strips readable
 * against each other — same length, same slope, one clock.
 */
export function windowSpan(options: HealthBarOptions): number {
  return Math.max(0.1, options.ghostDelay + options.ghostChase, options.healSpan + options.healFade);
}

/**
 * The loop length: the shared window, or the `duration` slider when that is longer.
 *
 * The slider can only add a pause after the effects have finished — it never truncates one, because
 * a loop that restarts mid-chase would show a hit that never resolves.
 */
export function loopSecondsOf(duration: number, options: HealthBarOptions): number {
  const chosen = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  return Math.max(chosen, windowSpan(options));
}

/** The window both strips draw, resolved from the sliders: `0..longest effect`. */
export function windowOf(duration: number, options: HealthBarOptions): BarWindow {
  return { from: 0, to: windowSpan(options) };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The sliders both examples read. Kept separate so the curve rows and the stage agree. */
export type HealthBarOptions = {
  readonly damage: number;
  readonly heal: number;
  readonly ghostDelay: number;
  readonly ghostChase: number;
  readonly healSpan: number;
  readonly healFade: number;
};

/** Where the hit example is at one instant: the dropped fill, the ghost, the flash. */
export type HitBarPhase = {
  /** 0-1 position in the loop; the strip's playhead rides on it. */
  readonly progress: number;
  /** Length of the red fill, 0-1 of the slot. */
  readonly health: number;
  /** Length of the white ghost, 0-1 of the slot. Never shorter than `health`. */
  readonly ghost: number;
  /** Opacity of the hit flash over the body, 0-1 of the curve's peak. */
  readonly flash: number;
};

/** Where the heal example is at one instant: the fill growing back and the mint stretch. */
export type HealBarPhase = {
  readonly progress: number;
  readonly health: number;
  /** Length of the stretch the heal has added, 0-1 of the slot. Zero before the heal. */
  readonly healFill: number;
  /** Length of the red fill the moment the heal landed — where the mint stretch starts. */
  readonly healFrom: number;
  /** Opacity of that stretch: 1 while it grows, fading to 0 once it is done. */
  readonly glow: number;
};

/** Where in the loop `time` is, as 0-1, on the loop length `loopSecondsOf` resolves. */
export function loopProgress(time: number, duration: number, options: HealthBarOptions): number {
  const span = loopSecondsOf(duration, options);
  return (((time % span) + span) % span) / span;
}


/**
 * The hit example's flash at `seconds` into the loop, on `1 - expo(inOut)`.
 *
 * The simulator's own curve: it holds near full for the first frames, crosses in a few, and is
 * under 2% before the window ends — so the flash reads as "bright, then gone" instead of as a fade.
 * The window is clipped to the shared one so a very short effect cannot still be flashing at its end.
 */
function flashAt(seconds: number, window: number): number {
  const span = Math.min(FLASH_SECONDS, window);
  if (span <= 0) return 0;
  return FLASH_PEAK * (1 - inOutExpo(Math.min(1, seconds / span)));
}

/**
 * The hit example at loop position `progress` (0-1).
 *
 * The hit lands on the first frame, so a loop never shows the bar at full health before it drops.
 * The ghost holds at the pre-hit length for `ghostDelay`, then walks to the fill on `outQuad` — the
 * simulator's `ghostRatio` curve. Once it has caught up there is no ghost to draw: its edge against
 * the fill only makes the bar look like it is vibrating.
 */
export function hitPhaseAt(
  progress: number,
  duration: number,
  options: HealthBarOptions,
): HitBarPhase {
  const t = clamp01(progress);
  const loopSeconds = loopSecondsOf(duration, options);
  const seconds = t * loopSeconds;
  const health = 1 - clamp01(options.damage);
  const delay = Math.max(0, options.ghostDelay);
  const chase = Math.max(1e-3, options.ghostChase);
  const chaseProgress = (seconds - delay) / chase;
  const ghost =
    seconds <= delay ? 1 : chaseProgress >= 1 ? health : 1 + (health - 1) * outQuad(chaseProgress);
  return {
    progress: t,
    health,
    ghost: Math.max(health, ghost),
    flash: flashAt(seconds, windowSpan(options)),
  };
}

/**
 * The heal example at loop position `progress` (0-1).
 *
 * The fill starts where a hit would have left it and grows back on `outQuad` — the same family the
 * ghost chases on, so the two examples read as one system: a gap is closed at a speed that starts
 * fast and settles. The mint stretch is the part the heal has added so far, lit while it grows and
 * fading into the wound colour after, which is what turns green back into red without a second event.
 */
export function healPhaseAt(
  progress: number,
  duration: number,
  options: HealthBarOptions,
): HealBarPhase {
  const t = clamp01(progress);
  const loopSeconds = loopSecondsOf(duration, options);
  const seconds = t * loopSeconds;
  // The heal starts on the loop's first frame: both examples play together, so nothing has to wait
  // for the hit to finish before the refill begins.
  const healAt = 0;
  const damage = clamp01(options.damage);
  const before = 1 - damage;
  const after = Math.min(1, before + damage * clamp01(options.heal));
  const span = Math.max(1e-3, options.healSpan);
  const fade = Math.max(1e-3, options.healFade);
  const since = seconds - healAt;
  const health = since <= 0 ? before : before + (after - before) * outQuad(clamp01(since / span));
  const healFill = Math.max(0, health - before);
  return {
    progress: t,
    health,
    healFill,
    healFrom: before,
    glow: healFill > 1e-6 && since > 0 ? 1 - clamp01((since - span) / fade) : 0,
  };
}

/** `hitPhaseAt` for a playback time, which is what the scene and the strip are handed. */
export function hitPhase(time: number, duration: number, options: HealthBarOptions): HitBarPhase {
  return hitPhaseAt(loopProgress(time, duration, options), duration, options);
}

/** `healPhaseAt` for a playback time. */
export function healPhase(time: number, duration: number, options: HealthBarOptions): HealBarPhase {
  return healPhaseAt(loopProgress(time, duration, options), duration, options);
}

/** The sliders, gathered in one place so the stage and the rows read the same values. */
function optionsOf(params: EffectParams): HealthBarOptions {
  return {
    damage: params.damage,
    heal: params.heal,
    ghostDelay: params.ghostDelay,
    ghostChase: params.ghostChase,
    healSpan: params.healSpan,
    healFade: params.healFade,
  };
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const options = optionsOf(params);
  const duration = params.duration;
  const loopSeconds = loopSecondsOf(duration, options);
  const progress = loopProgress(context.time, duration, options);
  const hit = hitPhaseAt(progress, duration, options);
  const heal = healPhaseAt(progress, duration, options);
  const healthColor = withAlpha(
    hueColor(params.healthHue, params.healthSaturation, HEALTH_VALUE),
    HEALTH_ALPHA,
  );
  const mint = hueColor(HEAL_HUE, HEAL_SATURATION, HEAL_VALUE);

  const seconds = progress * loopSeconds;
  const win = windowOf(duration, options);
  EXAMPLES.forEach((example, index) => {
    const center: readonly [number, number] = [columnCenter(index), EXAMPLE_Y];
    if (example.id === "hit") drawHit(drawList, params, example, center, hit, healthColor);
    else drawHeal(drawList, params, example, center, heal, healthColor, mint);
    drawTrackGroup(drawList, {
      title: example.label,
      ...win,
      layout: trackLayout(index),
      tracks:
        example.id === "hit"
          ? hitTracks(options, win, duration, healthColor)
          : healTracks(options, win, duration, healthColor, mint),
      seconds,
    });
  });
}

/** One row group drawn over its own window; the playhead rides inside that window. */
function drawTrackGroup(
  drawList: FrameDrawList,
  group: {
    readonly title: string;
    readonly from: number;
    readonly to: number;
    readonly layout: TimelineLayout;
    readonly tracks: readonly TimelineTrack[];
    /** Playback time, in seconds into the loop. */
    readonly seconds: number;
  },
): void {
  const span = Math.max(1e-3, group.to - group.from);
  drawList.text([group.layout.left, group.layout.top + 0.55, 0], `${group.title} · ${group.from.toFixed(2)}–${group.to.toFixed(2)}s`, {
    space: "world-plane",
    fontSize: 26,
    pixelSize: 0.014,
    anchor: "bottom-left",
    color: TITLE_COLOR,
    depthTest: false,
  });
  drawTimelineTracks(drawList, {
    tracks: group.tracks,
    layout: group.layout,
    // Clamped, so a playhead outside the window waits at its edge instead of vanishing.
    progress: clamp01((group.seconds - group.from) / span),
    duration: span,
    startTime: group.from,
  });
}

/** Maps a 0-1 row position onto the loop position inside `win`. */
function sampler(
  win: BarWindow,
  loopSeconds: number,
): (t: number) => number {
  const span = win.to - win.from;
  return (t) => clamp01((win.from + clamp01(t) * span) / loopSeconds);
}

/**
 * The hit group's rows: the dropped fill, the ghost, the flash — sampled inside the hit window.
 *
 * The groups are grouped by example, not merged by element: a row can only have one colour, and
 * "the hit's fill" and "the heal's fill" are two different stories even though both are the red bar.
 */
function hitTracks(
  options: HealthBarOptions,
  win: BarWindow,
  duration: number,
  healthColor: Color,
): readonly TimelineTrack[] {
  const at = sampler(win, duration);
  const phaseOf = (t: number): HitBarPhase => hitPhaseAt(at(t), duration, options);
  const curve = (sample: (t: number) => number): readonly TimelineCurve[] => [{ sample }];
  return [
    // The strips sit under the examples, so the label gutter is one short line per row: the code
    // name lives in the source, and two columns of `health · 剩余` would eat the plot's width.
    { id: "hit-health", title: "血条", name: "", color: healthColor, curves: curve((t) => phaseOf(t).health) },
    { id: "hit-ghost", title: "残影", name: "", color: withAlpha(GHOST_RGB, 0.9), curves: curve((t) => phaseOf(t).ghost) },
    { id: "hit-flash", title: "闪白", name: "", color: CURVE_HEAD, curves: curve((t) => phaseOf(t).flash) },
  ];
}

/** The heal group's rows: the fill growing back and the mint stretch, sampled inside its window. */
function healTracks(
  options: HealthBarOptions,
  win: BarWindow,
  duration: number,
  healthColor: Color,
  mint: Color,
): readonly TimelineTrack[] {
  const at = sampler(win, duration);
  const phaseOf = (t: number): HealBarPhase => healPhaseAt(at(t), duration, options);
  const curve = (sample: (t: number) => number): readonly TimelineCurve[] => [{ sample }];
  return [
    { id: "heal-health", title: "血条", name: "", color: healthColor, curves: curve((t) => phaseOf(t).health) },
    {
      id: "heal-fill",
      title: "补上",
      // Plotted as the stretch you can actually see: it grows while the bar fills and drops back
      // to zero as the mint fades into the wound colour. Plotting the raw healed amount would keep
      // a line up there after the green is gone, and the row would stop describing the picture.
      name: "",
      color: mint,
      curves: curve((t) => {
        const phase = phaseOf(t);
        return phase.healFill * phase.glow;
      }),
    },
  ];
}

/** The name above a bar and the first character inside the body, as the simulator stacks them. */
function drawBody(
  drawList: FrameDrawList,
  example: BarExample,
  center: readonly [number, number],
  radius: number,
  barCenterY: number,
  barHeight: number,
  hue: number,
  saturation: number,
): void {
  const [x, y] = center;

  drawUnitDisc(drawList, center, radius, hue, saturation);
  drawList.text([x, y, 0], example.name.slice(0, 1), {
    space: "world-plane",
    fontSize: 32,
    pixelSize: (radius * 1.15) / 32,
    anchor: "center",
    weight: 600,
    color: GLYPH_COLOR,
    outlineWidth: 1.5,
    outlineColor: [0, 0, 0, 0.55],
    // Same layer as the body: the flash goes in a layer above, so a hit swallows the glyph too.
    depthTest: false,
    zIndex: 0,
  });
  drawList.text([x, barCenterY + barHeight / 2 + NAME_GAP, 0], example.name, {
    space: "world-plane",
    fontSize: 30,
    pixelSize: 0.016,
    anchor: "bottom-center",
    color: NAME_COLOR,
    depthTest: false,
    zIndex: 5,
  });
}

/**
 * The slot, the ghost and the fill, in that order.
 *
 * The slot is opaque: a translucent one lets the grid and the body's rim through it, and the bar
 * stops reading as a reading. A thin outline keeps the black slot from disappearing into the dark
 * grid — the simulator does not need one because its floor is a flat dark plane, this page's grid
 * is not. The ghost starts at the fill's right edge, never at the bar's left one: it marks what
 * came off, not the whole bar.
 */
function drawBar(
  drawList: FrameDrawList,
  center: readonly [number, number],
  barWidth: number,
  barHeight: number,
  barCenterY: number,
  phase: { readonly health: number; readonly ghost: number },
  healthColor: Color,
): void {
  const { d2 } = drawList;
  const [x] = center;
  const left = x - barWidth / 2;

  d2.rect_s([x, barCenterY], [barWidth, barHeight], { color: SLOT_COLOR, zIndex: 3 });
  d2.rect([x, barCenterY], [barWidth, barHeight], {
    strokeWidth: 1,
    color: [0.35, 0.4, 0.5, 0.55],
    zIndex: 3,
  });

  const filled = barWidth * clamp01(phase.health);
  const trail = barWidth * clamp01(phase.ghost);
  if (trail - filled > barWidth * 0.004) {
    d2.rect_s([left + (filled + trail) / 2, barCenterY], [trail - filled, barHeight], {
      color: withAlpha(GHOST_RGB, GHOST_ALPHA),
      zIndex: 4,
    });
  }
  if (filled > 1e-3) {
    d2.rect_s([left + filled / 2, barCenterY], [filled, barHeight], { color: healthColor, zIndex: 5 });
  }
}

function drawHit(
  drawList: FrameDrawList,
  params: EffectParams,
  example: BarExample,
  center: readonly [number, number],
  phase: HitBarPhase,
  healthColor: Color,
): void {
  const { d2 } = drawList;
  const radius = params.unitRadius;
  const barHeight = params.barHeight;
  const barCenterY = center[1] + radius + BAR_GAP + barHeight / 2;

  drawBody(drawList, example, center, radius, barCenterY, barHeight, params.unitHue, params.unitSaturation);

  if (phase.flash > 1e-3) {
    /*
     * A white disc of the same radius on top of the body, exactly like the simulator's `fx` layer:
     * the curve is divided by its peak so the flash really is opaque at the start — at 85% the
     * body's rim and its label would still show through the hit.
     */
    d2.circle_s(center, radius, {
      color: withAlpha(FLASH_RGB, Math.min(1, phase.flash / FLASH_PEAK)),
      zIndex: 1,
    });
  }

  drawBar(drawList, center, params.barWidth, barHeight, barCenterY, phase, healthColor);
}

function drawHeal(
  drawList: FrameDrawList,
  params: EffectParams,
  example: BarExample,
  center: readonly [number, number],
  phase: HealBarPhase,
  healthColor: Color,
  mint: Color,
): void {
  const { d2 } = drawList;
  const radius = params.unitRadius;
  const barWidth = params.barWidth;
  const barHeight = params.barHeight;
  const barCenterY = center[1] + radius + BAR_GAP + barHeight / 2;
  const left = center[0] - barWidth / 2;

  drawBody(drawList, example, center, radius, barCenterY, barHeight, params.unitHue, params.unitSaturation);
  // No ghost on the healed bar: nothing has come off it in this example, so the whole length is
  // the fill's own.
  drawBar(drawList, center, barWidth, barHeight, barCenterY, { health: phase.health, ghost: phase.health }, healthColor);

  /*
   * The mint stretch the heal has added so far, laid over the fill and fading into the wound colour.
   *
   * It starts where the bar stood when the heal landed (`healFrom`), not at the fill's right edge:
   * the stretch is the *new* part, and anchoring it to the moving edge would smear it across the bar.
   */
  const healWidth = barWidth * clamp01(phase.healFill);
  if (phase.glow > 1e-3 && healWidth > 1e-3) {
    const healLeft = left + barWidth * clamp01(phase.healFrom);
    d2.rect_s([healLeft + healWidth / 2, barCenterY], [healWidth, barHeight], {
      color: withAlpha(mint, phase.glow),
      zIndex: 6,
    });
  }
}
