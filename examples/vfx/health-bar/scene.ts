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
import { inOutCubic, inOutExpo, outQuad } from "../easing.js";
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
export const LOOP_SECONDS = 0.95;

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

/** How long the whole "shield up" action takes, in seconds. */
export const SHIELD_GROW_SECONDS = 0.35;
/** Share of that action the sleeve takes to clamp down onto the bar. */
const SLEEVE_SETTLE_RATIO = 0.75;
/** How long the sleeve stays on the bar before it fades into the shield segment. */
const SLEEVE_FADE_SECONDS = 0.1;

/**
 * When the two blows of the breaking column land, in seconds.
 *
 * The first one is held back a beat on purpose: the column opens with the shield **full**, so the
 * eye gets a frame or two to see what is about to be taken away. It chips two thirds of it; the
 * second blow takes the rest and spills onto health.
 */
export const SHIELD_FIRST_HIT_SECONDS = 0.1;
export const SHIELD_BREAK_SECONDS = 0.35;
/** Share of the shield the first blow chips off. */
const SHIELD_CHIP_FRACTION = 2 / 3;
/** How long the shards fly after the break, in seconds. */
const SHATTER_SECONDS = 0.45;
/** How many shards one break throws. */
const SHARD_COUNT = 10;

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

/**
 * The shield colour: blue.
 *
 * White is taken (the ghost means "just came off") and red/green are taken by health and heal, so the
 * shield is the fourth hue — a saturated barrier blue, dark enough to sit next to the fill instead of
 * washing it out.
 */
export const SHIELD_HUE = 0.6;
export const SHIELD_SATURATION = 0.9;
export const SHIELD_VALUE = 0.75;

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
  readonly id: "hit" | "heal" | "shield-up" | "shield-break";
  /** The unit's name, drawn above its bar and as the glyph inside its body. */
  readonly name: string;
  /** The row group's title: what this example demonstrates. */
  readonly label: string;
};

export const EXAMPLES: readonly BarExample[] = [
  { id: "hit", name: "守卫", label: "受击" },
  { id: "heal", name: "骑士", label: "治疗" },
  { id: "shield-up", name: "盾卫", label: "上盾" },
  { id: "shield-break", name: "铁卫", label: "破盾" },
];

export const UNIT_RADIUS = 1.5;
/** Bar size in world units: wider than the body, as the simulator's 50 px bar is. */
export const BAR_WIDTH = 6.2;
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
const TRACK_WIDTH = 5.6;
const TRACK_LABEL_GUTTER = 1.2;
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
  return Math.max(
    0.1,
    options.ghostDelay + options.ghostChase,
    options.healSpan + options.healFade,
    SHIELD_GROW_SECONDS,
    SHIELD_BREAK_SECONDS + options.ghostDelay + options.ghostChase,
  );
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
  /** Shield the shield example starts with, in units of one full health bar. */
  readonly shieldMax: number;
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
  if (span <= 0 || seconds < 0) return 0;
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
/**
 * The ghost's length `elapsed` seconds after a hit that left `health` on the bar.
 *
 * Holds at the pre-hit length for `ghostDelay`, then walks to the fill on `outQuad` — the
 * simulator's `ghostRatio` curve. Once it has caught up it is simply the fill: its edge against the
 * fill only makes the bar look like it is vibrating.
 */
function ghostChaseAt(elapsed: number, health: number, options: HealthBarOptions): number {
  const delay = Math.max(0, options.ghostDelay);
  const chase = Math.max(1e-3, options.ghostChase);
  if (elapsed <= delay) return 1;
  const progress = (elapsed - delay) / chase;
  if (progress >= 1) return health;
  return 1 + (health - 1) * outQuad(progress);
}

export function hitPhaseAt(
  progress: number,
  duration: number,
  options: HealthBarOptions,
): HitBarPhase {
  const t = clamp01(progress);
  const loopSeconds = loopSecondsOf(duration, options);
  const seconds = t * loopSeconds;
  const health = 1 - clamp01(options.damage);
  return {
    progress: t,
    health,
    ghost: Math.max(health, ghostChaseAt(seconds, health, options)),
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
  /*
   * The green layer over that stretch: fully lit while it grows, then cross-fading into red.
   *
   * Squared, not linear. A cross-fade between green and red has to pass through a muddy orange, and
   * a linear one spends half of its time there; squaring leaves the green quickly and lingers only
   * near zero, so the middle is a blink instead of a phase.
   */
  const rest = 1 - clamp01((since - span) / fade);
  return {
    progress: t,
    health,
    healFill,
    healFrom: before,
    glow: healFill > 1e-6 && since > 0 ? rest * rest : 0,
  };
}

/** Where a shield column is at one instant: the fill, the shield on top of it, the ghost. */
export type ShieldBarPhase = {
  readonly progress: number;
  readonly health: number;
  /** Shield standing, in units of one full health bar. Sits to the right of the fill. */
  readonly shield: number;
  /** Length of the white ghost, 0-1 of the health bar. Never shorter than `health`. */
  readonly ghost: number;
  /** Opacity of the hit flash over the body, 0-1 of the curve's peak. */
  readonly flash: number;
};

/**
 * The "shield up" column at loop position `progress` (0-1): a sleeve clamps down, the shield fills.
 *
 * Not a fill-up from zero: a plate a size larger than the bar drops onto it and shrinks until it
 * sits tight, and the shield **snaps to full on that frame** — nothing grows, nothing fills. That is
 * what makes it read as *armour being fitted* rather than as a progress bar: the shield arrives whole
 * when the plate seats, and what the eye follows is the plate.
 *
 * The shrink runs on `inOutCubic`, not `outExpo`: an ease-out spends its first frames at 90% of the
 * travel, so the plate would appear already-fitted. The middle of an in-out is where the size change
 * is actually visible, which is the whole point of showing it.
 */
export type ShieldUpPhase = ShieldBarPhase & {
  /** How far the sleeve has closed, `0` = a size larger, `1` = tight on the bar. */
  readonly sleeve: number;
  /** Sleeve opacity: 1 while it closes, fading out once it has clicked shut. */
  readonly sleeveAlpha: number;
  /** Flash on the bar at the moment the sleeve lands, 1 → 0. */
  readonly pulse: number;
};

export function shieldUpPhaseAt(
  progress: number,
  duration: number,
  options: HealthBarOptions,
): ShieldUpPhase {
  const t = clamp01(progress);
  const loopSeconds = loopSecondsOf(duration, options);
  const seconds = t * loopSeconds;
  const settleAt = SHIELD_GROW_SECONDS * SLEEVE_SETTLE_RATIO;
  const maxShield = Math.max(0, options.shieldMax);
  const settle = inOutCubic(clamp01(seconds / Math.max(1e-3, settleAt)));
  const landed = clamp01((seconds - settleAt) / Math.max(1e-3, SLEEVE_FADE_SECONDS));
  // One frame it is not there, the next it is: the shield does not grow, it is seated with the plate.
  const seated = seconds >= settleAt;
  return {
    progress: t,
    health: 1,
    shield: seated ? maxShield : 0,
    ghost: 1,
    flash: 0,
    sleeve: settle,
    sleeveAlpha: 1 - landed,
    // Only after the plate lands: before that the bar is still uncovered.
    pulse: seconds <= settleAt ? 0 : 1 - clamp01((seconds - settleAt) / 0.12),
  };
}

/**
 * The "shield break" column at loop position `progress` (0-1): two blows, then the shield is gone.
 *
 * It opens with the shield **full** — that is the state being demonstrated. The first blow chips two
 * thirds off (health untouched, so the fill shows nothing happened to the body); the second takes
 * what is left, and only the part it could not eat lands on health. That overflow is the only moment
 * the fill moves, so the ghost starts there, and the shatter plays from the same frame.
 */
export type ShieldBreakPhase = ShieldBarPhase & {
  /** 0-1 through the shatter after the second blow; `null` before it. */
  readonly shatter: number | null;
};

export function shieldBreakPhaseAt(
  progress: number,
  duration: number,
  options: HealthBarOptions,
): ShieldBreakPhase {
  const t = clamp01(progress);
  const loopSeconds = loopSecondsOf(duration, options);
  const seconds = t * loopSeconds;
  const maxShield = Math.max(0, options.shieldMax);
  const chipped = maxShield * (1 - SHIELD_CHIP_FRACTION);
  const window = windowSpan(options);
  const shell = seconds < SHIELD_FIRST_HIT_SECONDS ? maxShield : seconds < SHIELD_BREAK_SECONDS ? chipped : 0;
  const broken = seconds >= SHIELD_BREAK_SECONDS;
  const overflow = broken ? Math.min(1, Math.max(0, clamp01(options.damage) - chipped)) : 0;
  const health = 1 - overflow;
  return {
    progress: t,
    health,
    shield: shell,
    ghost: Math.max(health, broken ? ghostChaseAt(seconds - SHIELD_BREAK_SECONDS, health, options) : 1),
    // Two blows, two flashes.
    flash: Math.max(
      flashAt(seconds - SHIELD_FIRST_HIT_SECONDS, window),
      flashAt(seconds - SHIELD_BREAK_SECONDS, window),
    ),
    shatter: broken ? clamp01((seconds - SHIELD_BREAK_SECONDS) / SHATTER_SECONDS) : null,
  };
}

/** `shieldUpPhaseAt` for a playback time. */
export function shieldUpPhase(
  time: number,
  duration: number,
  options: HealthBarOptions,
): ShieldBarPhase {
  return shieldUpPhaseAt(loopProgress(time, duration, options), duration, options);
}

/** `shieldBreakPhaseAt` for a playback time. */
export function shieldBreakPhase(
  time: number,
  duration: number,
  options: HealthBarOptions,
): ShieldBarPhase {
  return shieldBreakPhaseAt(loopProgress(time, duration, options), duration, options);
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
    shieldMax: params.shieldMax,
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
  const silver = hueColor(SHIELD_HUE, SHIELD_SATURATION, SHIELD_VALUE);

  const seconds = progress * loopSeconds;
  const win = windowOf(duration, options);
  EXAMPLES.forEach((example, index) => {
    const center: readonly [number, number] = [columnCenter(index), EXAMPLE_Y];
    let tracks: readonly TimelineTrack[];
    switch (example.id) {
      case "hit": {
        drawHit(drawList, params, example, center, hit, healthColor);
        tracks = hitTracks(options, win, duration, healthColor);
        break;
      }
      case "heal": {
        drawHeal(drawList, params, example, center, heal, healthColor, mint);
        tracks = healTracks(options, win, duration, healthColor, mint);
        break;
      }
      case "shield-up": {
        const up = shieldUpPhaseAt(progress, duration, options);
        drawShield(drawList, params, example, center, up, healthColor, silver, {
          settle: up.sleeve,
          alpha: up.sleeveAlpha,
          pulse: up.pulse,
        });
        tracks = shieldTracks(options, win, duration, healthColor, silver, "up");
        break;
      }
      default: {
        const broken = shieldBreakPhaseAt(progress, duration, options);
        drawShield(drawList, params, example, center, broken, healthColor, silver, undefined, broken.shatter);
        tracks = shieldTracks(options, win, duration, healthColor, silver, "break");
        break;
      }
    }
    drawTrackGroup(drawList, { title: example.label, ...win, layout: trackLayout(index), tracks, seconds });
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

/**
 * A shield column's rows, in the order the stage reads them.
 *
 * Plotted as shares of the slot (health / total, shield / total) rather than as shares of one health
 * bar: the slot holds health plus shield, so these are exactly the widths on screen. The breaking
 * column also plots the ghost, because that is the only column where the fill moves.
 */
function shieldTracks(
  options: HealthBarOptions,
  win: BarWindow,
  duration: number,
  healthColor: Color,
  silver: Color,
  kind: "up" | "break",
): readonly TimelineTrack[] {
  const at = sampler(win, duration);
  const phaseOf = (t: number): ShieldBarPhase =>
    kind === "up"
      ? shieldUpPhaseAt(at(t), duration, options)
      : shieldBreakPhaseAt(at(t), duration, options);
  const total = 1 + Math.max(0, options.shieldMax);
  const curve = (sample: (t: number) => number): readonly TimelineCurve[] => [{ sample }];
  const tracks: TimelineTrack[] = [
    { id: `${kind}-health`, title: "血条", name: "", color: healthColor, curves: curve((t) => phaseOf(t).health / total) },
    { id: `${kind}-shield`, title: "护盾", name: "", color: silver, curves: curve((t) => phaseOf(t).shield / total) },
  ];
  if (kind === "break") {
    tracks.push({
      id: "break-ghost",
      title: "残影",
      name: "",
      color: withAlpha(GHOST_RGB, 0.9),
      curves: curve((t) => phaseOf(t).ghost / total),
    });
  }
  return tracks;
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
   * The green stretch the heal has added, laid over the **right end** of the fill and fading back
   * into the wound colour.
   *
   * Anchored to the fill's right edge: the stretch is the newest blood on the bar, so it grows out
   * of that edge as the fill grows. `glow` then fades the whole stretch out rather than shrinking
   * it, which is what makes it read as "this part is turning red" instead of as a green segment
   * sliding back along the bar. The fade does pass through a muddy orange where green and red mix —
   * that is the cost of a real cross-fade, and it lasts less than a quarter second.
   */
  const healWidth = barWidth * clamp01(phase.healFill);
  if (healWidth > 1e-3 && phase.glow > 1e-3) {
    const healRight = left + barWidth * clamp01(phase.health);
    d2.rect_s([healRight - healWidth / 2, barCenterY], [healWidth, barHeight], {
      color: withAlpha(mint, phase.glow),
      zIndex: 6,
    });
  }
}

function drawShield(
  drawList: FrameDrawList,
  params: EffectParams,
  example: BarExample,
  center: readonly [number, number],
  phase: ShieldBarPhase,
  healthColor: Color,
  silver: Color,
  /** Present on the "shield up" column: the plate dropping onto the bar. */
  sleeve?: { readonly settle: number; readonly alpha: number; readonly pulse: number },
  /** Present on the breaking column: 0-1 through the shatter after the shield goes. */
  shatter?: number | null,
): void {
  const { d2 } = drawList;
  const radius = params.unitRadius;
  const barWidth = params.barWidth;
  const barHeight = params.barHeight;
  const barCenterY = center[1] + radius + BAR_GAP + barHeight / 2;
  const left = center[0] - barWidth / 2;

  drawBody(drawList, example, center, radius, barCenterY, barHeight, params.unitHue, params.unitSaturation);

  if (phase.flash > 1e-3) {
    d2.circle_s(center, radius, {
      color: withAlpha(FLASH_RGB, Math.min(1, phase.flash / FLASH_PEAK)),
      zIndex: 1,
    });
  }

  /*
   * The slot holds health *plus* the shield's capacity, so the shield is literally extra bar to the
   * right of the fill — one slot, two pools, the same width the whole time. Once the shield is gone
   * the right-hand stretch is empty slot, which is also what a dropped health bar looks like.
   */
  const total = 1 + Math.max(0, params.shieldMax);
  const unit = barWidth / total;

  d2.rect_s([center[0], barCenterY], [barWidth, barHeight], { color: SLOT_COLOR, zIndex: 3 });
  d2.rect([center[0], barCenterY], [barWidth, barHeight], {
    strokeWidth: 1,
    color: [0.35, 0.4, 0.5, 0.55],
    zIndex: 3,
  });

  const healthWidth = unit * clamp01(phase.health);
  const trailWidth = unit * Math.max(clamp01(phase.health), clamp01(phase.ghost));
  if (trailWidth - healthWidth > barWidth * 0.004) {
    d2.rect_s([left + (healthWidth + trailWidth) / 2, barCenterY], [trailWidth - healthWidth, barHeight], {
      color: withAlpha(GHOST_RGB, GHOST_ALPHA),
      zIndex: 4,
    });
  }
  if (healthWidth > 1e-3) {
    d2.rect_s([left + healthWidth / 2, barCenterY], [healthWidth, barHeight], { color: healthColor, zIndex: 5 });
  }

  // The shield continues to the right of the fill, and is never longer than the slot has room for.
  const shieldWidth = unit * Math.min(total - clamp01(phase.health), Math.max(0, phase.shield));
  if (shieldWidth > 1e-3) {
    d2.rect_s([left + healthWidth + shieldWidth / 2, barCenterY], [shieldWidth, barHeight], {
      color: silver,
      zIndex: 6,
    });
  }

  if (sleeve !== undefined && sleeve.alpha > 1e-3) {
    /*
     * The plate: a rectangle a size larger than the slot, shrinking until it sits tight on it.
     *
     * Drawn as an outline, not a filled box: a filled one would hide the bar it is being fitted to,
     * and the point is to see the bar get covered over. `settle` comes from `outBack`, so it passes
     * 1 on the way — the plate goes a hair *smaller* than the slot and springs back, which is the
     * click. The pulse underneath is the bar taking the hit of the plate landing.
     */
    // A size larger in both axes when it arrives (as wide as the column allows), tight at settle.
    const inset = 1 - Math.max(0, Math.min(1, sleeve.settle));
    const sleeveWidth = barWidth * (1 + 0.15 * inset);
    const sleeveHeight = barHeight * (1 + 1 * inset);
    // A faint fill so the plate reads as a slab rather than a selection box, on top of the bar it
    // is about to cover — the outline alone disappears the moment it fits.
    d2.rect_s([center[0], barCenterY], [sleeveWidth, sleeveHeight], {
      color: withAlpha(silver, 0.08 * sleeve.alpha),
      zIndex: 7,
    });
    // On the landing frame the outline thickens for a moment instead of the bar flashing: a fill
    // flash turns red into pink, which reads as a colour change rather than as the plate seating.
    d2.rect([center[0], barCenterY], [sleeveWidth, sleeveHeight], {
      strokeWidth: 2 + 2.5 * sleeve.pulse,
      color: withAlpha(silver, sleeve.alpha),
      zIndex: 7,
    });
  }

  if (shatter !== undefined && shatter !== null && shatter < 1) {
    drawShards(drawList, {
      originX: left + healthWidth + (unit * Math.max(0, params.shieldMax) * (1 - SHIELD_CHIP_FRACTION)) / 2,
      originY: barCenterY,
      barWidth,
      barHeight,
      // White, not the shield's blue: the shards are the shield *leaving*, and the blue went with it.
      color: GHOST_RGB,
      age: shatter,
    });
  }
}

/**
 * The shield coming apart: a burst of rectangles thrown off the shield's old position.
 *
 * They fly **away from the direction the bar shrinks**: the fill gives ground from right to left, so
 * the debris is thrown to the right, out of the bar and past it. Debris that flew left would read as
 * the shield being pulled back in rather than knocked off.
 *
 * Deterministic on purpose — no `Math.random`, the same frame always throws the same shards. They
 * leave in a rightward fan, gravity pulls them down, each spins on its own direction, and they fade
 * on the square of the age so they are gone before the ghost has finished chasing.
 */
function drawShards(
  drawList: FrameDrawList,
  shatter: {
    readonly originX: number;
    readonly originY: number;
    readonly barWidth: number;
    readonly barHeight: number;
    readonly color: Color;
    readonly age: number;
  },
): void {
  const { d2 } = drawList;
  const { originX, originY, barWidth, barHeight, color, age } = shatter;

  // A shock ring on the break frame, so the hit reads even in a still frame.
  if (age < 0.7) {
    const ring = age / 0.7;
    d2.circle([originX, originY], barWidth * 0.08 + barWidth * 0.2 * ring, {
      strokeWidth: Math.max(0.5, 4 * (1 - ring)),
      color: withAlpha(color, 0.75 * (1 - ring)),
      zIndex: 8,
    });
  }

  for (let index = 0; index < SHARD_COUNT; index++) {
    // A rightward fan: mostly along +x, spread up and down a little.
    const spread = SHARD_COUNT <= 1 ? 0 : index / (SHARD_COUNT - 1) - 0.5;
    const angle = spread * 1.7;
    const speed = barWidth * (1 + (index % 3) * 0.25);
    const x = originX + Math.cos(angle) * speed * age;
    const y = originY + Math.sin(angle) * speed * age - barWidth * 0.55 * age * age;
    const scale = 1 - 0.4 * age;
    d2.rect([x, y], [barHeight * 0.8 * scale, barHeight * 0.44 * scale], {
      rotation: spread * 3 + age * (index % 2 === 0 ? 9 : -9),
      color: withAlpha(color, 1 - age * age),
      zIndex: 8,
    });
  }
}
