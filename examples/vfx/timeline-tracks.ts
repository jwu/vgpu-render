/**
 * The element timeline a single-effect battle page draws under its effect.
 *
 * One row per element, each plotting the one value that element is driven by across the loop — a
 * spread, a climb, a brightness — plus a playhead that crosses every row at the same instant. The
 * rows are `world2d`, in the same units and camera as the effect, so zooming in on the light beam
 * zooms the curves with it instead of leaving a fixed overlay behind.
 *
 * The rows carry no grid beyond a baseline and a 50% guide on purpose: what a page is showing here
 * is the shape of each curve and where the playhead sits on it, not a value read off an axis.
 */

import type { Color, FrameDrawList } from "../../src/frame-draw-list.js";
import { withAlpha } from "./params.js";

/** Curve samples per row; enough to show a bounce landing without flooding the command list. */
const SAMPLES = 96;

const TRACK_FILL: Color = [0.42, 0.5, 0.64, 0.14];
const TRACK_BASELINE: Color = [0.42, 0.5, 0.64, 0.26];
const TRACK_GUIDE: Color = [0.46, 0.54, 0.68, 0.14];
const TITLE_COLOR: Color = [0.74, 0.81, 0.92, 1];
const NAME_COLOR: Color = [0.5, 0.58, 0.7, 1];
const AXIS_COLOR: Color = [0.52, 0.6, 0.72, 0.6];
const PLAYHEAD_COLOR: Color = [0.82, 0.9, 1, 0.9];

/** Radius of the dot that marks each curve's current value, in `world2d` units. */
const DOT_RADIUS = 0.075;

/**
 * One curve inside a row.
 *
 * `sample` is the value the effect's own phase function returns at that instant, normalized to
 * 0-1; the drawing clamps it again, so a curve is free to overshoot the way `back` and `elastic` do.
 */
export type TimelineCurve = {
  readonly sample: (t: number) => number;
  /**
   * Opacity of this curve, 0-1, default 1. A row that plots one element several times — the heal
   * beam draws a curve per rising spark — drops it per curve so the copies stay apart.
   */
  readonly alpha?: number;
};

/** One element of the effect and the curves that drive it. */
export type TimelineTrack = {
  readonly id: string;
  /** Element name in Chinese, drawn above the code name. */
  readonly title: string;
  /** The element as the scene code names it plus what the curve is, e.g. `beam · 升起`. */
  readonly name: string;
  readonly color: Color;
  readonly curves: readonly TimelineCurve[];
};

/** Where the rows sit, in `world2d` units. The page owns the numbers; this module only reads them. */
export type TimelineLayout = {
  /** Left edge of the plot area; the labels sit to its left. */
  readonly left: number;
  readonly width: number;
  /** Top edge of the first row. Rows stack downward. */
  readonly top: number;
  readonly trackHeight: number;
  readonly trackGap: number;
};

/** Bottom edge of the last row, which is where the playhead stops. */
export function timelineBottom(layout: TimelineLayout, trackCount: number): number {
  return layout.top - trackCount * layout.trackHeight - (trackCount - 1) * layout.trackGap;
}

export type TimelineTracksOptions = {
  readonly tracks: readonly TimelineTrack[];
  readonly layout: TimelineLayout;
  /** 0-1 position of the shared playhead, the same number the effect is drawn at. */
  readonly progress: number;
  /** Loop length in seconds, for the ticks under the last row. */
  readonly duration: number;
  /**
   * Time the window's left edge sits at, in seconds into the loop.
   *
   * Ticks read `startTime + fraction * duration`, which is what a row group covering only part of
   * the loop needs: the labels then say where in the page's own clock the window sits, instead of
   * restarting at zero for every group.
   */
  readonly startTime?: number;
};

/**
 * Draws every row, its labels, the shared playhead and the time ticks.
 *
 * All rows share one playhead on purpose: the point of the strip is that the elements are on the
 * same clock, so a per-row marker that could drift would defeat it. Each row's curve also gets a dot
 * at the playhead, which is what makes "this element is at 0.4 right now" readable at a glance.
 */
export function drawTimelineTracks(drawList: FrameDrawList, options: TimelineTracksOptions): void {
  const { tracks, layout, progress, duration, startTime = 0 } = options;
  const { d2 } = drawList;
  if (tracks.length === 0) return;

  const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
  const xOf = (t: number): number => layout.left + clamp01(t) * layout.width;
  const bottom = timelineBottom(layout, tracks.length);
  const head = clamp01(progress);

  tracks.forEach((track, index) => {
    const bandTop = layout.top - index * (layout.trackHeight + layout.trackGap);
    const bandBottom = bandTop - layout.trackHeight;
    const yOf = (value: number): number => bandBottom + clamp01(value) * layout.trackHeight;

    d2.rect_s(
      [layout.left + layout.width / 2, bandBottom + layout.trackHeight / 2],
      [layout.width, layout.trackHeight],
      { color: TRACK_FILL },
    );
    d2.line([layout.left, bandBottom], [layout.left + layout.width, bandBottom], {
      width: 1,
      color: TRACK_BASELINE,
    });
    d2.line(
      [layout.left, bandBottom + layout.trackHeight * 0.5],
      [layout.left + layout.width, bandBottom + layout.trackHeight * 0.5],
      { width: 1, color: TRACK_GUIDE },
    );

    for (const curve of track.curves) {
      const color = withAlpha(track.color, curve.alpha ?? 1);
      const points: [number, number][] = [];
      for (let step = 0; step <= SAMPLES; step++) {
        const t = step / SAMPLES;
        points.push([xOf(t), yOf(curve.sample(t))]);
      }
      d2.polyline(points, { width: 2, color });
      d2.circle_s([xOf(head), yOf(curve.sample(head))], DOT_RADIUS, { color });
    }

    drawList.text([layout.left - 0.55, bandBottom + layout.trackHeight * 0.64, 0], track.title, {
      space: "world-plane",
      fontSize: 30,
      pixelSize: 0.016,
      anchor: "center-right",
      color: TITLE_COLOR,
      depthTest: false,
    });
    drawList.text([layout.left - 0.55, bandBottom + layout.trackHeight * 0.26, 0], track.name, {
      space: "world-plane",
      fontSize: 22,
      pixelSize: 0.016,
      anchor: "center-right",
      color: NAME_COLOR,
      depthTest: false,
    });
  });

  // The playhead last, so it crosses the curves instead of being crossed by them.
  d2.line([xOf(head), layout.top], [xOf(head), bottom], { width: 1.5, color: PLAYHEAD_COLOR });

  // Three ticks are enough to place the playhead in time; more would compete with the curve labels.
  for (const fraction of [0, 0.5, 1]) {
    const x = layout.left + fraction * layout.width;
    d2.line([x, bottom], [x, bottom - 0.16], { width: 1, color: AXIS_COLOR });
    drawList.text([x, bottom - 0.42, 0], `${(startTime + duration * fraction).toFixed(2)}s`, {
      space: "world-plane",
      fontSize: 22,
      pixelSize: 0.016,
      anchor: fraction === 0 ? "center-left" : fraction === 1 ? "center-right" : "center",
      color: NAME_COLOR,
      depthTest: false,
    });
  }
}
