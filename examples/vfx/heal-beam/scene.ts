/**
 * `heal-beam`: the heal a support skill lands on an ally, with its elements on a timeline.
 *
 * This page is a single effect rather than a matrix: one beam on one unit, large enough to read,
 * with a strip of element curves beside it. The stage is the battle simulator's own healing effect
 * (`~/gamedev/battle`): a flat ground pool spreading out from the feet, a stacked column rising
 * off the body, and a few sparks drifting up its length — all of it fading out together.
 *
 * The strip is what this page exists for. Each element gets one row, and each row plots the value
 * that element is actually driven by at that instant, so the rows *are* the effect's timing:
 * the pool keeps expanding while the column has already reached full height, the column dims on a
 * straight line, and each spark is a sine that comes up and dies down on its own phase offset. The
 * playhead is the same number the stage is drawn at, so the two can never disagree.
 *
 * Everything is `world2d` and sized in world units: the pool, the column and the sparks scale with
 * the camera, and so do the curve rows.
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
 * Share of the loop the column takes to reach full height. It grows fast and then holds, which is
 * why the beam row and the brightness row are read together: one is a wall, the other a slope.
 */
export const GROW_RATIO = 0.3;

/**
 * Where the beam starts, as a multiple of the unit's radius above its centre. Slightly over 1 puts
 * the base on the body's upper edge, so the column reads as rising off the unit rather than out of
 * its middle — and the disc's own rim stays uncovered.
 */
const BEAM_BASE_RADIUS = 1.06;

/** How many stacked strokes one column is made of. */
export const BEAM_BAND_COUNT = 28;

/**
 * The column, as `BEAM_BAND_COUNT` bands of the same family: each one narrower, taller and more
 * opaque than the one outside it, so the stack reads as a cone of light instead of a rectangle.
 *
 * The 2D layer has no gradient fill, so both softnesses have to be built: horizontally by stacking
 * unequal widths, vertically by sending `colorEnd` to fully transparent at the top. The step count
 * is what decides whether the ladder reads as a cone or as a bar code: at four bands the stripes are
 * obvious at gallery zoom, at this many the edges only show up as a smooth gradient.
 */
function beamBand(index: number): { readonly width: number; readonly height: number; readonly alpha: number } {
  const t = index / (BEAM_BAND_COUNT - 1);
  return {
    // Wide and short outside (a haze hugging the floor), narrow and tall inside (the hot core).
    // The exponent is above one, so the outer haze steps are the narrow ones: the ladder's visible
    // jumps belong near the core where the eye is, and the outer edge stays soft.
    width: 1 - 0.88 * t ** 1.3,
    // The height ladder tapers the column's silhouette: the wide haze hugs the floor, the narrow
    // core reaches full height. Without it the stack is a rectangle with a soft edge, not a cone.
    height: 0.9 + 0.1 * t,
    // Linear, and that is the whole point: a band's edge is only visible as a stripe when its
    // alpha differs enough from its neighbour's. Spreading a small step evenly over every band
    // makes the stack add up to one soft cone instead of reading as a set of stacked bars.
    alpha: 0.004 + 0.055 * t,
  };
}

/** Widest band, as a multiple of the unit's radius: the simulator's own 1.08 / 0.32 proportions. */
const BEAM_WIDTH_RADIUS = 2.8;
/** The two innermost bands use the lightened core colour instead of the body colour. */
const BEAM_CORE_BANDS = 2;

/** Ground pool: starting radius and how far it expands, in units of the unit's radius. */
const POOL_FROM_RADIUS = 1.25;
const POOL_SPREAD_RADIUS = 2.2;
/** Flattening of the pool: a circle on this camera reads as a ring, an ellipse reads as a floor. */
const POOL_FLAT = 0.42;
const POOL_ALPHA = 0.16;
const POOL_CORE_ALPHA = 0.26;

/** One spark: radius and lateral sway, in units of the unit's radius. */
const SPARK_RADIUS = 0.15;
const SPARK_SWAY_RADIUS = 0.44;
/** The lowest and highest points of a spark's climb, as shares of the column's height. */
const SPARK_LIFT_FROM = 0.2;
const SPARK_LIFT_SPAN = 0.75;
/** Golden angle: neighbouring sparks start on different phases of the sway sine instead of together. */
const GOLDEN_ANGLE = 2.399;

/**
 * Where the unit body sits and how big it is.
 *
 * The body is the left half of the page, and its radius is the page's scale: the beam's base, the
 * pool's reach and the sparks' sizes are all expressed against it, so one number rescales the whole
 * effect without breaking its ratios. The column then has room to climb several body diameters, the
 * way the simulator's beam does, while the curve rows get the right half.
 */
const UNIT_CENTER: readonly [number, number] = [-10, -3.4];
export const UNIT_RADIUS = 1.2;

/** Wide enough to hold the effect on the left and the curve rows on the right at gallery size. */
export const HEAL_VIEW = { width: 30, height: 13.6 } as const;

/** Where the curve rows sit. Rows stack downward from `top`, to the right of the effect. */
export const TIMELINE_LAYOUT: TimelineLayout = {
  left: -0.6,
  width: 15,
  top: 5.1,
  trackHeight: 2.1,
  trackGap: 0.55,
};

/**
 * Where one playback is at `time`, as the fractions every layer reads.
 *
 * All three are functions of the loop position alone, so the strip can plot them without asking the
 * stage anything: `spread` is the pool's expansion, `grow` the column's height, `fade` the shared
 * linear dim-out. `progress` is the raw loop position, which is what the playhead rides on.
 */
export type HealPhase = {
  readonly progress: number;
  readonly spread: number;
  readonly grow: number;
  readonly fade: number;
};

export function healPhase(time: number, duration: number = LOOP_SECONDS): HealPhase {
  const span = Number.isFinite(duration) && duration > 0 ? duration : LOOP_SECONDS;
  const loop = ((time % span) + span) % span;
  const progress = loop / span;
  return {
    progress,
    // The pool keeps opening for the whole loop, so it never looks like it has stopped.
    spread: outCirc(progress),
    // The column is up after the first 30% and holds; nothing else happens to its height.
    grow: outCirc(Math.min(1, progress / GROW_RATIO)),
    fade: 1 - progress,
  };
}

/**
 * Brightness of spark `index` of `count` at loop position `t`.
 *
 * Each spark gets its own slice of the loop: it fades in, crosses the column and is gone, and the
 * next one is already on its way up. `sin(pi * phase)` is zero at both ends, so the wrap from the
 * top of the column back to the bottom is not a visible seam.
 */
export function sparkBrightness(t: number, index: number, count: number, fade: number): number {
  if (count <= 0) return 0;
  const phase = (((t + index / count) % 1) + 1) % 1;
  return Math.sin(Math.PI * phase) * fade;
}

/** The page's body colour, lightened towards white for the hot core and the sparks. */
function lighten(color: Color, amount: number): Color {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3],
  ];
}

export function draw(drawList: FrameDrawList, context: VfxSceneContext): void {
  const params = context.params;
  const phase = healPhase(context.time, params.duration);
  const hue = hueColor(params.hue, params.saturation, 1);
  const core = lighten(hue, 0.4);
  const spark = lighten(hue, 0.5);

  drawStage(drawList, params, phase, hue, core, spark);
  drawTimelineTracks(drawList, {
    tracks: healTracks(params, hue),
    layout: TIMELINE_LAYOUT,
    progress: phase.progress,
    duration: params.duration,
  });
}

/** The four rows: one per element, in the order the stage draws them. */
function healTracks(params: EffectParams, hue: Color): readonly TimelineTrack[] {
  const count = Math.max(0, Math.round(params.sparks));
  const sparks: TimelineCurve[] = [];
  for (let index = 0; index < count; index++) {
    // Every spark runs the whole loop, phase-shifted by its share of it: the row's bumps are the
    // sparks themselves, each at a different point of its climb. The later ones fade back so a
    // four-bump row still reads bump by bump instead of as one thick band.
    sparks.push({
      sample: (t) => sparkBrightness(t, index, count, 1 - t),
      ...(index === 0 ? {} : { alpha: Math.max(0.3, 0.85 - index * 0.18) }),
    });
  }
  return [
    {
      id: "pool",
      title: "地面光斑",
      name: "pool · 扩散",
      color: hue,
      curves: [{ sample: (t) => outCirc(Math.max(0, Math.min(1, t))) }],
    },
    {
      id: "beam",
      title: "柱身",
      name: "beam · 升起",
      color: lighten(hue, 0.25),
      curves: [{ sample: (t) => outCirc(Math.min(1, Math.max(0, t) / GROW_RATIO)) }],
    },
    {
      id: "fade",
      title: "柱身亮度",
      name: "beam · 淡出",
      color: lighten(hue, 0.45),
      curves: [{ sample: (t) => 1 - Math.max(0, Math.min(1, t)) }],
    },
    {
      id: "sparks",
      title: "上升光点",
      name: count === 0 ? "spark · 关" : `spark × ${count} · 各相位亮度`,
      color: lighten(hue, 0.6),
      curves: sparks,
    },
  ];
}

function drawStage(
  drawList: FrameDrawList,
  params: EffectParams,
  phase: HealPhase,
  hue: Color,
  core: Color,
  spark: Color,
): void {
  const { d2 } = drawList;
  const radius = UNIT_RADIUS;
  const height = params.height;
  const beamBase = UNIT_CENTER[1] + radius * BEAM_BASE_RADIUS;
  const fade = Math.max(0, phase.fade);

  // The body first: the pool washes over it and the column rises off it.
  drawUnitDisc(drawList, UNIT_CENTER, radius, params.unitHue, params.unitSaturation);

  // Ground pool: a wide dim ellipse with a brighter core, both spreading and both fading on the
  // square of the fade so the floor clears faster than the column does.
  const spread = radius * (POOL_FROM_RADIUS + POOL_SPREAD_RADIUS * phase.spread) * params.spread;
  if (spread > 1e-3) {
    const alpha = fade * fade;
    d2.ellipse_s(UNIT_CENTER, [spread, spread * POOL_FLAT], {
      color: withAlpha(hue, POOL_ALPHA * alpha),
      zIndex: 1,
    });
    const inner = spread * 0.5;
    d2.ellipse_s(UNIT_CENTER, [inner, inner * POOL_FLAT], {
      color: withAlpha(core, POOL_CORE_ALPHA * alpha),
      zIndex: 1,
    });
  }

  // The column: stacked bands, each a vertical stroke that goes transparent at the top.
  const columnHeight = height * phase.grow;
  if (columnHeight > 1e-3) {
    for (let index = 0; index < BEAM_BAND_COUNT; index++) {
      const band = beamBand(index);
      const bandHeight = columnHeight * band.height;
      if (bandHeight <= 1e-3) continue;
      const color = index >= BEAM_BAND_COUNT - BEAM_CORE_BANDS ? core : hue;
      d2.line([UNIT_CENTER[0], beamBase], [UNIT_CENTER[0], beamBase + bandHeight], {
        width: radius * BEAM_WIDTH_RADIUS * band.width * params.width,
        widthMode: "world",
        color: withAlpha(color, band.alpha * fade),
        colorEnd: withAlpha(color, 0),
        zIndex: 2,
      });
    }
  }

  // The sparks: each one on its own slice of the loop, swaying on a golden-angle offset so they
  // never line up into a single blinking column.
  const count = Math.max(0, Math.round(params.sparks));
  for (let index = 0; index < count; index++) {
    const brightness = sparkBrightness(phase.progress, index, count, fade);
    if (brightness <= 1e-3) continue;
    const phaseOfSpark = (((phase.progress + index / count) % 1) + 1) % 1;
    const lift = columnHeight * (SPARK_LIFT_FROM + SPARK_LIFT_SPAN * phaseOfSpark);
    const sway = Math.sin(index * GOLDEN_ANGLE + phaseOfSpark * Math.PI * 2) * radius * SPARK_SWAY_RADIUS;
    d2.circle_s([UNIT_CENTER[0] + sway, beamBase + lift], radius * SPARK_RADIUS, {
      color: withAlpha(spark, brightness * 0.9),
      zIndex: 3,
    });
  }
}
