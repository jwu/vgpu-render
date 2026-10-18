/**
 * bevy 2D reference pages.
 *
 * These are vgpu's own capability pages built on `frame.d2`, not ports of a Godot addon: the
 * reference addon has no 2D API, so the models are bevy's `2d_gizmos` and `2d_shapes`. That also
 * means the coordinate convention is bevy's: the origin sits at the canvas centre, +y points up,
 * and one world unit covers one canvas pixel before the 2D camera's pan and zoom.
 *
 * Two conventions carry over from the text pages: a page heading in the top-left corner (a
 * screen-space block, so the labels stay put while the 2D camera pans), and one shape per column
 * with the row meaning stated once.
 *
 * The pages come in two shapes. `2d-gizmos` and `2d-shapes` are overviews: one collage and one
 * complete primitive matrix. Everything after them is a reference-style matrix page like the 3D
 * scenes — a column per API variant, a row per value, with the column titles and sample labels
 * drawn in `world2d` so they pan and zoom with the geometry they annotate (see
 * `demo-engine.ts`, which projects world-plane text through the 2D camera on 2D pages).
 */

import type { Color, FrameRecorder, LineJoint } from "./frame-recorder.js";
import type { FrameRecorder2D, Shape2DOptions } from "./frame-recorder-2d.js";
import type { Vec2 } from "./camera-2d.js";

const TITLE: Color = [0.92, 0.95, 1, 1];
const HINT: Color = [0.55, 0.62, 0.72, 1];
const GRID: Color = [0.32, 0.36, 0.44, 0.55];
const FILL: Color = [0.93, 0.95, 0.98, 1];
const RING: Color = [0.55, 0.72, 1, 1];
const WARM: Color = [1, 0.72, 0.36, 1];
const COOL: Color = [0.42, 0.86, 0.78, 1];
const ACCENT: Color = [1, 0.55, 0.66, 1];
const ACTION: Color = [0.98, 0.86, 0.42, 1];

const TAU = Math.PI * 2;

/** Page heading: a screen-space title and note, fixed to the top-left corner. */
function heading(recorder: FrameRecorder, title: string, note: string): void {
  recorder.text([24, 16, 0], title, { space: "screen", fontSize: 17, anchor: "top-left", color: TITLE });
  recorder.text([24, 38, 0], note, { space: "screen", fontSize: 12, anchor: "top-left", color: HINT });
}

// ---------------------------------------------------------------------------
// Matrix page scaffolding.
//
// A reference-style page is a grid of samples: one column per API variant, one row per value.
// The same table drives the drawing and the sidebar, so a label cannot drift from the sample it
// names. Columns are spaced in `world2d` units, and one row's label sits under its sample rather
// than beside it: 2D columns are narrower than the 3D ones, and a left label would collide with
// the previous column's geometry.

type Column2D = {
  readonly title: string;
  readonly samples: readonly string[];
};

export type Page2DLabels = {
  readonly title: string;
  readonly note: string;
  readonly columns: readonly Column2D[];
  /** Column pitch in `world2d` units. Defaults to `COLUMN_SPACING`; a wide page tightens it. */
  readonly spacing?: number;
};

const COLUMN_SPACING = 200;
const ROW_SPACING = 120;
const COLUMN_TITLE_FONT = 23;
const SAMPLE_LABEL_FONT = 19;

/** Column titles and sample labels of every matrix page, shared with `scene-examples.ts`. */
export const LABELS_2D: Readonly<Record<string, Page2DLabels>> = {
  "2d-lines": {
    title: "2D Lines",
    note: "line · width, alpha, gradient, dash · open strip and closed loop, solid and dashed · drag or WASD to pan, scroll to zoom",
    spacing: 175,
    columns: [
      { title: "line(width)", samples: ["w: 2", "w: 6", "w: 12", "w: 24"] },
      { title: "line(alpha)", samples: ["a: .25", "a: .50", "a: .75", "a: 1.0"] },
      { title: "line(grad)", samples: ["action→ring", "cool→warm", "accent→cool", "warm→action"] },
      { title: "line(dash)", samples: ["24 / 8", "12 / 12", "6 / 18", "2 / 12"] },
      { title: "strip(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "strip(dash)", samples: ["none", "round", "bevel", "miter"] },
      { title: "loop(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "loop(dash)", samples: ["none", "round", "bevel", "miter"] },
    ],
  },
  "2d-curves": {
    title: "2D Curves",
    note: "arc sweep and start angle, short and long arcs between two points, sampled curves",
    columns: [
      { title: "arc(sweep)", samples: ["60°", "120°", "240°", "330°"] },
      { title: "arc(startAngle)", samples: ["0°", "90°", "180°", "270°"] },
      { title: "short arc", samples: ["20→100°", "20→150°", "20→250°", "20→340°"] },
      { title: "long arc", samples: ["20→100°", "20→150°", "20→250°", "20→340°"] },
      { title: "curve(sine)", samples: ["1 wave", "2 waves", "3 waves", "4 waves"] },
      { title: "curve(gradient)", samples: ["action→ring", "cool→warm", "accent→cool", "warm→action"] },
    ],
  },
  "2d-markers": {
    title: "2D Markers",
    note: "cross, point (square and round), arrow tips, double-ended arrows and axes",
    columns: [
      { title: "cross(size)", samples: ["8", "16", "24", "32"] },
      { title: "point(size)", samples: ["4", "8", "14", "22"] },
      { title: "point(round)", samples: ["6", "10", "16", "24"] },
      { title: "arrow(angle)", samples: ["-35°", "10°", "45°", "80°"] },
      { title: "arrow(tip)", samples: ["tip 8", "tip 16", "tip 24", "tip 32"] },
      { title: "axes(length)", samples: ["30", "45", "60", "80"] },
    ],
  },
  "2d-outlines": {
    title: "2D Outlines",
    note: "the stroked form of six shape primitives: fill: false, one stroke width per row",
    columns: [
      { title: "rect", samples: ["2", "4", "8", "16"] },
      { title: "roundedRect", samples: ["2", "4", "8", "16"] },
      { title: "circle", samples: ["2", "4", "8", "16"] },
      { title: "ellipse", samples: ["2", "4", "8", "16"] },
      { title: "annulus", samples: ["2", "4", "8", "16"] },
      { title: "polygon", samples: ["2", "4", "8", "16"] },
    ],
  },
  "2d-fill": {
    title: "2D Filled Shapes",
    note: "shape parameters as rows: rotation, sweep, side count and capsule length",
    columns: [
      { title: "rect(rot)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "ellipse(rot)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "sector(sweep)", samples: ["60°", "120°", "240°", "330°"] },
      { title: "segment(sweep)", samples: ["60°", "120°", "240°", "330°"] },
      { title: "polygon(sides)", samples: ["3", "4", "6", "12"] },
      { title: "capsule(len)", samples: ["0", "18", "36", "54"] },
    ],
  },
  "2d-spaces": {
    title: "2D Spaces",
    note: "world2d follows the camera; screen is top-left pixels · width and size modes",
    columns: [
      { title: "world2d", samples: ["line", "point", "rect", "grid"] },
      { title: "screen", samples: ["line", "point", "rect", "grid"] },
      { title: "width / size mode", samples: ["screen", "world", "point screen", "point world"] },
    ],
  },
  "2d-grid": {
    title: "2D Grid",
    note: "the grid primitive: cell count per column, line width per row, same extent throughout",
    columns: [
      { title: "2 x 2", samples: ["w: 1", "w: 2", "w: 4"] },
      { title: "4 x 3", samples: ["w: 1", "w: 2", "w: 4"] },
      { title: "8 x 6", samples: ["w: 1", "w: 2", "w: 4"] },
      { title: "16 x 9", samples: ["w: 1", "w: 2", "w: 4"] },
    ],
  },
};

type Table2D = {
  readonly d2: FrameRecorder2D;
  readonly rows: number;
  readonly columnX: (column: number) => number;
  readonly rowY: (row: number) => number;
};

/** Rows a page's label table declares, so the drawing loop cannot disagree with it. */
function tableRows(id: string): number {
  const labels = LABELS_2D[id];
  return labels === undefined ? 1 : Math.max(...labels.columns.map((column) => column.samples.length), 1);
}

/**
 * The `world2d` extent a page asks the 2D camera to fit, derived from its label table so a new
 * column cannot leave part of the matrix off screen.
 */
export function page2DView(id: string): { readonly width: number; readonly height: number } {
  const labels = LABELS_2D[id];
  const columns = labels?.columns.length ?? 1;
  const rows = tableRows(id);
  const spacing = labels?.spacing ?? COLUMN_SPACING;
  return { width: (columns - 1) * spacing + 300, height: (rows - 1) * ROW_SPACING + 300 };
}

/**
 * Lays out a matrix page and draws its labels: a centred column title above every column and one
 * sample label under every sample. Labels are `world-plane` blocks at `pixelSize: 1`, so one font
 * pixel is one `world2d` unit and the labels scale with the geometry.
 */
function table2D(recorder: FrameRecorder, id: string): Table2D {
  const labels = LABELS_2D[id];
  if (labels === undefined) throw new Error(`no 2D label table for "${id}"`);
  const columns = labels.columns.length;
  const rows = tableRows(id);
  const spacing = labels.spacing ?? COLUMN_SPACING;
  const columnX = (column: number): number => (column - (columns - 1) / 2) * spacing;
  const rowY = (row: number): number => ((rows - 1) / 2 - row) * ROW_SPACING;
  const titleY = (rows * ROW_SPACING) / 2 + 24;
  labels.columns.forEach((column, index) => {
    recorder.text([columnX(index), titleY, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
    column.samples.forEach((sample, row) => {
      recorder.text([columnX(index), rowY(row) - ROW_SPACING * 0.48, 0], sample, {
        space: "world-plane",
        pixelSize: 1,
        fontSize: SAMPLE_LABEL_FONT,
        anchor: "top-center",
        color: HINT,
        depthTest: false,
      });
    });
  });
  return { d2: recorder.d2, rows, columnX, rowY };
}

function pageHeading(recorder: FrameRecorder, id: string): void {
  const labels = LABELS_2D[id];
  if (labels !== undefined) heading(recorder, labels.title, labels.note);
}

// ---------------------------------------------------------------------------
// Shared geometry helpers for the matrix pages.

function mixColor(from: Color, to: Color, t: number): Color {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
    from[3] + (to[3] - from[3]) * t,
  ];
}

/**
 * A stroke that fades from one colour to the other over its whole length. One `line` per segment
 * rather than a single `lineStrip`, because a strip's `color`/`colorEnd` repeats per segment.
 */
function gradientStrip(d2: FrameRecorder2D, points: readonly Vec2[], from: Color, to: Color, width: number): void {
  const segments = points.length - 1;
  for (let index = 0; index < segments; index++) {
    d2.line(points[index]!, points[index + 1]!, {
      width,
      color: mixColor(from, to, index / segments),
      colorEnd: mixColor(from, to, (index + 1) / segments),
    });
  }
}

function pointAt(center: Vec2, radius: number, angle: number): Vec2 {
  return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
}

/**
 * bevy's `short_arc_2d_between` / `long_arc_2d_between`: an arc of the circle through `from`
 * around `center`, ending at the direction of `to`. The short form takes the sweep with the
 * smaller absolute angle, the long form the other one.
 */
function arcBetween(
  d2: FrameRecorder2D,
  center: Vec2,
  from: Vec2,
  to: Vec2,
  long: boolean,
  options: Shape2DOptions,
): void {
  const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const radius = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const raw = Math.atan2(to[1] - center[1], to[0] - center[0]) - start;
  const counterClockwise = ((raw % TAU) + TAU) % TAU;
  const sweep = long
    ? (counterClockwise <= Math.PI ? counterClockwise - TAU : counterClockwise)
    : (counterClockwise <= Math.PI ? counterClockwise : counterClockwise - TAU);
  d2.arc(center, radius, { ...options, startAngle: start, sweep });
}

type ArrowOptions = {
  readonly color?: Color;
  readonly tipLength?: number;
  readonly tipWidth?: number;
  readonly doubleEnd?: boolean;
};

/** Arrow as a shaft plus a filled triangular head, the 2D twin of the 3D arrow helper. */
function drawArrow(d2: FrameRecorder2D, origin: Vec2, angle: number, length: number, options: ArrowOptions = {}): void {
  const color = options.color ?? ACTION;
  const tipLength = options.tipLength ?? 22;
  const tipWidth = options.tipWidth ?? 10;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tip: Vec2 = [origin[0] + ux * length, origin[1] + uy * length];
  d2.line(origin, tip, { width: 5, color });
  arrowHead(d2, tip, ux, uy, tipLength, tipWidth, color);
  if (options.doubleEnd === true) arrowHead(d2, origin, -ux, -uy, tipLength, tipWidth, color);
}

function arrowHead(
  d2: FrameRecorder2D,
  tip: Vec2,
  ux: number,
  uy: number,
  length: number,
  halfWidth: number,
  color: Color,
): void {
  const backX = tip[0] - ux * length;
  const backY = tip[1] - uy * length;
  d2.triangle(
    tip,
    [backX - uy * halfWidth, backY + ux * halfWidth],
    [backX + uy * halfWidth, backY - ux * halfWidth],
    { color },
  );
}

/** Two-axis cross: x in the action colour, y in the cool one, as bevy's `axes_2d`. */
function drawAxes(d2: FrameRecorder2D, origin: Vec2, length: number, width: number): void {
  d2.line(origin, [origin[0] + length, origin[1]], { width, color: ACTION });
  d2.line(origin, [origin[0], origin[1] + length], { width, color: COOL });
}

// ---------------------------------------------------------------------------
// Matrix pages.

/** line, width, alpha, gradient, dash, open strip joints and closed loop joints. */
function lines2D(recorder: FrameRecorder, time: number): void {
  pageHeading(recorder, "2d-lines");
  const { d2, columnX, rowY, rows } = table2D(recorder, "2d-lines");
  const widths = [2, 6, 12, 24] as const;
  const alphas = [0.25, 0.5, 0.75, 1] as const;
  const gradients: readonly (readonly [Color, Color])[] = [
    [ACTION, RING],
    [COOL, WARM],
    [ACCENT, COOL],
    [WARM, ACTION],
  ];
  const dashes: readonly (readonly [number, number, number])[] = [
    [24, 8, 0],
    [12, 12, 6],
    [6, 18, 0],
    [2, 12, 0],
  ];
  const joints: readonly LineJoint[] = ["none", "round", "bevel", "miter"];
  // The phase travels with time so the pattern visibly moves along the path, the same convention
  // as the 3D line page; 30 px/s makes one 24/14 period take just over a second.
  const dashPhase = time * 30;
  const stripDash = [24, 14] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const start = columnX(0) - 52;
    const end = columnX(0) + 58;
    d2.line([start, y], [end, y], { width: widths[row]!, color: FILL });
    d2.line([columnX(1) - 52, y], [columnX(1) + 58, y], {
      width: 9,
      color: [ACTION[0], ACTION[1], ACTION[2], alphas[row]!],
    });
    const [from, to] = gradients[row]!;
    d2.line([columnX(2) - 52, y], [columnX(2) + 58, y], { width: 7, color: from, colorEnd: to });
    const [dashVisible, dashGap] = dashes[row]!;
    d2.line([columnX(3) - 52, y], [columnX(3) + 58, y], {
      width: 7,
      dash: [dashVisible, dashGap, dashPhase],
      color: COOL,
    });

    const zigzag = (x: number): Vec2[] => [
      [x - 54, y + 22],
      [x - 27, y - 22],
      [x, y + 22],
      [x + 27, y - 22],
      [x + 54, y + 22],
    ];
    const loopPath = (x: number): Vec2[] => [
      [x - 50, y + 26],
      [x + 50, y + 26],
      [x + 50, y - 26],
      [x - 50, y - 26],
    ];

    d2.lineStrip(zigzag(columnX(4)), { width: 11, joint: joints[row]!, color: RING });
    d2.lineStrip(zigzag(columnX(5)), {
      width: 11,
      joint: joints[row]!,
      dash: [stripDash[0], stripDash[1], dashPhase],
      color: ACTION,
    });
    // Closed paths: the last point joins the first and the corner joints wrap around.
    d2.lineStrip(loopPath(columnX(6)), { width: 11, joint: joints[row]!, color: WARM }, true);
    d2.lineStrip(
      loopPath(columnX(7)),
      { width: 11, joint: joints[row]!, dash: [stripDash[0], stripDash[1], dashPhase], color: ACCENT },
      true,
    );
  }
}

/** Arc sweep, start angle, short and long arcs between points, and sampled curves. */
function curves2D(recorder: FrameRecorder): void {
  pageHeading(recorder, "2d-curves");
  const { d2, columnX, rowY, rows } = table2D(recorder, "2d-curves");
  const sweeps = [Math.PI / 3, (Math.PI * 2) / 3, (Math.PI * 4) / 3, (Math.PI * 11) / 6] as const;
  const starts = [0, Math.PI / 2, Math.PI, Math.PI * 1.5] as const;
  const between = [
    [20, 100],
    [20, 150],
    [20, 250],
    [20, 340],
  ] as const;
  const waves = [1, 2, 3, 4] as const;
  const gradients: readonly (readonly [Color, Color])[] = [
    [ACTION, RING],
    [COOL, WARM],
    [ACCENT, COOL],
    [WARM, ACTION],
  ];
  const deg = Math.PI / 180;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.arc([columnX(0), y], 42, {
      fill: false,
      strokeWidth: 5,
      startAngle: -Math.PI / 2,
      sweep: sweeps[row]!,
      color: RING,
    });
    d2.arc([columnX(1), y], 42, {
      fill: false,
      strokeWidth: 5,
      startAngle: starts[row]!,
      sweep: Math.PI * 0.75,
      color: ACCENT,
    });
    const [fromAngle, toAngle] = between[row]!;
    const shortCenter: Vec2 = [columnX(2), y];
    arcBetween(
      d2,
      shortCenter,
      pointAt(shortCenter, 42, fromAngle * deg),
      pointAt(shortCenter, 42, toAngle * deg),
      false,
      { fill: false, strokeWidth: 5, color: COOL },
    );
    const longCenter: Vec2 = [columnX(3), y];
    arcBetween(
      d2,
      longCenter,
      pointAt(longCenter, 38, fromAngle * deg),
      pointAt(longCenter, 38, toAngle * deg),
      true,
      { fill: false, strokeWidth: 5, color: WARM },
    );

    const waveCount = waves[row]!;
    const sine: Vec2[] = [];
    for (let step = 0; step <= 72; step++) {
      const t = step / 72;
      sine.push([columnX(4) - 62 + t * 124, y + Math.sin(t * TAU * waveCount) * 30]);
    }
    d2.lineStrip(sine, { width: 4, color: ACTION });
    const [gradientFrom, gradientTo] = gradients[row]!;
    gradientStrip(
      d2,
      sine.map(([x, sy]) => [x + COLUMN_SPACING, sy] as Vec2),
      gradientFrom,
      gradientTo,
      4,
    );
  }
}

/** Crosses, points, arrows and axes. */
function markers2D(recorder: FrameRecorder): void {
  pageHeading(recorder, "2d-markers");
  const { d2, columnX, rowY, rows } = table2D(recorder, "2d-markers");
  const crossSizes = [8, 16, 24, 32] as const;
  const pointSizes = [4, 8, 14, 22] as const;
  const roundSizes = [6, 10, 16, 24] as const;
  const arrowAngles = [-0.44, -0.14, 0.14, 0.44] as const;
  const tips = [8, 16, 24, 32] as const;
  const axisLengths = [30, 45, 60, 80] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    cross(d2, [columnX(0), y], crossSizes[row]!, ACTION);
    d2.point([columnX(1), y], { size: pointSizes[row]!, color: ACCENT });
    d2.point([columnX(2), y], { size: roundSizes[row]!, round: true, color: COOL });
    const arrowOrigin: Vec2 = [columnX(3) - 40, y - 16];
    drawArrow(d2, arrowOrigin, arrowAngles[row]!, 80, { color: WARM });
    drawArrow(d2, [columnX(4) - 40, y - 16], 0.42, 80, { color: RING, tipLength: tips[row]! });
    drawAxes(d2, [columnX(5) - 40, y - 26], axisLengths[row]!, 4);
  }
}

/** The same six shapes stroked with four widths. */
function outlines2D(recorder: FrameRecorder): void {
  pageHeading(recorder, "2d-outlines");
  const { d2, columnX, rowY, rows } = table2D(recorder, "2d-outlines");
  const widths = [2, 4, 8, 16] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const style = { fill: false, strokeWidth: widths[row]!, color: RING };
    d2.rect([columnX(0), y], [110, 70], style);
    d2.roundedRect([columnX(1), y], [110, 70], 24, style);
    d2.circle([columnX(2), y], 48, style);
    d2.ellipse([columnX(3), y], [56, 36], style);
    d2.annulus([columnX(4), y], 22, 48, style);
    d2.polygon([columnX(5), y], 48, 6, style);
  }
}

/** Shape parameters as rows: rotation, sweep, side count, capsule length. */
function fill2D(recorder: FrameRecorder): void {
  pageHeading(recorder, "2d-fill");
  const { d2, columnX, rowY, rows } = table2D(recorder, "2d-fill");
  const rotations = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4] as const;
  const sweeps = [Math.PI / 3, (Math.PI * 2) / 3, (Math.PI * 4) / 3, (Math.PI * 11) / 6] as const;
  const sides = [3, 4, 6, 12] as const;
  const lengths = [0, 18, 36, 54] as const;
  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    d2.rect([columnX(0), y], [110, 70], { rotation: rotations[row]!, color: WARM });
    d2.ellipse([columnX(1), y], [66, 34], { rotation: rotations[row]!, color: ACCENT });
    d2.sector([columnX(2), y], 50, {
      startAngle: -Math.PI / 2,
      sweep: sweeps[row]!,
      color: COOL,
    });
    d2.segment([columnX(3), y], 50, {
      startAngle: -Math.PI / 2,
      sweep: sweeps[row]!,
      color: RING,
    });
    d2.polygon([columnX(4), y], 50, sides[row]!, { color: ACTION });
    d2.capsule([columnX(5), y], 22, lengths[row]!, { color: FILL });
  }
}

/** `screen` space is top-left canvas pixels, so the page needs a viewport to place them in. */
type Viewport2D = readonly [number, number];

/** Used when a caller has no viewport, e.g. a unit test building a frame. */
const DEFAULT_VIEWPORT: Viewport2D = [1280, 720];

/**
 * `world2d` versus `screen`, plus the width and size modes of each. The `screen` column is placed
 * from the viewport rather than from a fixed pixel coordinate: it is a fixed-position overlay, so
 * its labels and geometry have to agree with whatever canvas the page is rendered into.
 */
function spaces2D(recorder: FrameRecorder, viewport: Viewport2D): void {
  pageHeading(recorder, "2d-spaces");
  const labels = LABELS_2D["2d-spaces"];
  if (labels === undefined) return;
  const { d2 } = recorder;
  const rows = 4;
  const worldX = -220;
  const modeX = 60;
  const rowY = (row: number): number => 120 - row * 110;
  const screenX = viewport[0] * 0.74;
  const screenTop = viewport[1] * 0.2;
  const screenStep = Math.max(viewport[1] * 0.18, 108);
  const screenY = (row: number): number => screenTop + row * screenStep;

  // Column titles and sample labels for the two world-space columns.
  labels.columns.forEach((column, index) => {
    if (index === 1) return;
    const x = index === 0 ? worldX : modeX;
    recorder.text([x, rowY(0) + 92, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
    column.samples.forEach((sample, row) => {
      recorder.text([x - 78, rowY(row), 0], sample, {
        space: "world-plane",
        pixelSize: 1,
        fontSize: SAMPLE_LABEL_FONT,
        anchor: "center-right",
        color: HINT,
        depthTest: false,
      });
    });
  });

  // The `screen` column labels itself in screen space, above each fixed-pixel sample.
  recorder.text([screenX, screenTop - 26, 0], labels.columns[1]!.title, {
    space: "screen",
    fontSize: 34,
    anchor: "bottom-center",
    color: TITLE,
  });
  labels.columns[1]!.samples.forEach((sample, row) => {
    recorder.text([screenX, screenY(row) + 38, 0], sample, {
      space: "screen",
      fontSize: 26,
      anchor: "top-center",
      color: HINT,
    });
  });

  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const sy = screenY(row);
    // Row 0: a line in both spaces. `screen` keeps its pixel width while the world line moves
    // with pan and zoom.
    if (row === 0) {
      d2.line([worldX - 70, y], [worldX + 70, y], { width: 6, color: FILL });
      d2.line([screenX - 70, sy], [screenX + 70, sy], { width: 6, color: FILL, space: "screen" });
    }
    // Row 1: a point, sized in canvas pixels on both sides.
    if (row === 1) {
      d2.point([worldX, y], { size: 16, color: ACCENT });
      d2.point([screenX, sy], { size: 16, color: ACCENT, space: "screen" });
    }
    // Row 2: an outline, which strokes in pixels in both spaces.
    if (row === 2) {
      d2.rect([worldX, y], [120, 68], { fill: false, strokeWidth: 4, color: COOL });
      d2.rect([screenX, sy], [120, 68], { fill: false, strokeWidth: 4, color: COOL, space: "screen" });
    }
    // Row 3: the grid primitive in both spaces.
    if (row === 3) {
      d2.grid([worldX, y], [4, 3], [30, 24], { width: 2, color: RING });
      d2.grid([screenX, sy], [4, 3], [30, 24], { width: 2, color: RING, space: "screen" });
    }
    // The mode column: one nominal width under `screen` and `world`, then the two point size
    // modes. Only the `world` variants change with the camera zoom.
    if (row === 0) d2.line([modeX - 70, y], [modeX + 70, y], { width: 14, color: ACTION });
    if (row === 1) d2.line([modeX - 70, y], [modeX + 70, y], { width: 4, widthMode: "world", color: COOL });
    if (row === 2) d2.point([modeX, y], { size: 14, color: ACTION });
    if (row === 3) d2.point([modeX, y], { size: 14, sizeMode: "world", color: COOL });
  }
}

/** The grid primitive: cell count per column, line width per row, one fixed extent. */
function grid2D(recorder: FrameRecorder): void {
  pageHeading(recorder, "2d-grid");
  const { d2, columnX, rowY, rows } = table2D(recorder, "2d-grid");
  const cells: readonly (readonly [number, number])[] = [
    [2, 2],
    [4, 3],
    [8, 6],
    [16, 9],
  ];
  const widths = [1, 2, 4] as const;
  const extent: Vec2 = [132, 84];
  for (let column = 0; column < cells.length; column++) {
    const [columns, lines] = cells[column]!;
    for (let row = 0; row < rows; row++) {
      d2.grid([columnX(column), rowY(row)], [columns, lines], [extent[0] / columns, extent[1] / lines], {
        width: widths[row]!,
        color: RING,
      });
    }
  }
}

/**
 * Dispatches the 2D pages. Returns false for every other id so `buildScene` can fall through to
 * the 3D scenes. `viewport` is only read by `screen`-space content, which is in canvas pixels.
 */
export function buildScene2D(
  id: string,
  recorder: FrameRecorder,
  time: number,
  viewport: readonly [number, number] = DEFAULT_VIEWPORT,
): boolean {
  switch (id) {
    case "2d-gizmos":
      gizmos2D(recorder, time);
      return true;
    case "2d-shapes":
      shapes2D(recorder);
      return true;
    case "2d-lines":
      lines2D(recorder, time);
      return true;
    case "2d-curves":
      curves2D(recorder);
      return true;
    case "2d-markers":
      markers2D(recorder);
      return true;
    case "2d-outlines":
      outlines2D(recorder);
      return true;
    case "2d-fill":
      fill2D(recorder);
      return true;
    case "2d-spaces":
      spaces2D(recorder, viewport);
      return true;
    case "2d-grid":
      grid2D(recorder);
      return true;
    default:
      return false;
  }
}

/** The twelve bevy 2D primitives, filled in one row and outlined in the next. */
function shapes2D(recorder: FrameRecorder): void {
  heading(recorder, "2D Shapes", "filled row, ring row · drag or WASD to pan, scroll to zoom");
  const d2 = recorder.d2;
  const columns = 12;
  const spacing = 100;
  const startX = -((columns - 1) * spacing) / 2;
  for (let index = 0; index < columns; index++) {
    const x = startX + index * spacing;
    drawShape(d2, index, [x, 110], true);
    // The two polyline shapes have no interior to outline.
    if (index < 10) drawShape(d2, index, [x, -110], false);
  }
}

/** One column of `shapes2D`, in the order bevy's `2d_shapes` example lists them. */
function drawShape(d2: FrameRecorder2D, shape: number, center: [number, number], filled: boolean): void {
  const style = { fill: filled, strokeWidth: 4, color: filled ? FILL : RING };
  const [x, y] = center;
  switch (shape) {
    case 0: // Circle::new(50)
      d2.circle(center, 50, style);
      return;
    case 1: // CircularSector::new(50, 1.0)
      d2.sector(center, 50, { ...style, sweep: 1.0 });
      return;
    case 2: // CircularSegment::new(50, 1.25)
      d2.segment(center, 50, { ...style, sweep: 1.25 });
      return;
    case 3: // Ellipse::new(25, 50)
      d2.ellipse(center, [25, 50], style);
      return;
    case 4: // Annulus::new(25, 50)
      d2.annulus(center, 25, 50, style);
      return;
    case 5: // Capsule2d::new(25, 50)
      d2.capsule(center, 25, 50, style);
      return;
    case 6: // Rhombus::new(75, 100)
      d2.rhombus(center, [75, 100], style);
      return;
    case 7: // Rectangle::new(50, 100)
      d2.rect(center, [50, 100], style);
      return;
    case 8: // RegularPolygon::new(50, 6)
      d2.polygon(center, 50, 6, style);
      return;
    case 9: // Triangle2d::new(Vec2::Y * 50, Vec2::new(-50, -50), Vec2::new(50, -50))
      d2.triangle([x, y + 50], [x - 50, y - 50], [x + 50, y - 50], style);
      return;
    case 10: // Segment2d::new(Vec2::new(-50, 50), Vec2::new(50, -50))
      d2.line([x - 50, y + 50], [x + 50, y - 50], { width: 8, color: filled ? FILL : RING });
      return;
    default: // Polyline2d::new([(-50, 50), (0, -50), (50, 50)])
      d2.lineStrip([[x - 50, y + 50], [x, y - 50], [x + 50, y + 50]], {
        width: 8,
        joint: "round",
        color: filled ? FILL : RING,
      });
  }
}

/** bevy's `2d_gizmos` example, rebuilt with the stroke and shape primitives. */
function gizmos2D(recorder: FrameRecorder, time: number): void {
  heading(recorder, "2D Gizmos", "strokes and outlined shapes · drag or WASD to pan, scroll to zoom");
  const d2 = recorder.d2;

  // Background grid, drawn first so the strokes sit on top of it.
  const cell = 60;
  for (let index = -6; index <= 6; index++) {
    d2.line([index * cell, -260], [index * cell, 260], { width: 1, color: GRID });
    d2.line([-380, index * cell], [380, index * cell], { width: 1, color: GRID });
  }

  // line and ray.
  d2.line([-460, 200], [-300, 200], { width: 5, color: ACTION });
  d2.ray([-460, 140], [160, -40], { width: 5, color: COOL });

  // Joined strip (round joints) and a dashed stroke with the same width.
  d2.lineStrip(
    [[-460, 60], [-410, 0], [-360, 60], [-310, 0], [-260, 60]],
    { width: 6, joint: "round", color: RING },
  );
  d2.line([-460, -20], [-260, -20], { width: 6, dash: [20, 14, time * 30], color: RING });

  // Outlined boxes, one with rounded corners.
  d2.rect([-120, 170], [120, 80], { fill: false, strokeWidth: 4, color: WARM });
  d2.roundedRect([-120, 40], [140, 80], 26, { fill: false, strokeWidth: 4, color: WARM });
  d2.grid([-120, -100], [4, 3], [40, 40], { width: 2, color: WARM });

  // Circle, ellipse and an arc.
  d2.circle([120, 170], 55, { fill: false, strokeWidth: 4, color: ACCENT });
  d2.ellipse([120, 60], [75, 35], { fill: false, strokeWidth: 4, color: ACCENT });
  d2.arc([120, -80], 55, { fill: false, strokeWidth: 4, startAngle: 0.4, sweep: 2.2, color: ACCENT });

  // Cross marker.
  for (const [x, y] of [[340, 200], [400, 200], [370, 170], [370, 230]] as const) {
    d2.point([x, y], { size: 4, round: true, color: ACTION });
  }
  cross(d2, [340, 170], 34, ACTION);
  cross(d2, [340, 230], 34, ACTION);

  // Arrow: a shaft plus a filled triangle head that swings with time.
  const angle = 1.1 + Math.sin(time * 0.9) * 0.5;
  const origin: [number, number] = [330, 60];
  const tip: [number, number] = [origin[0] + Math.cos(angle) * 140, origin[1] + Math.sin(angle) * 140];
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const back = 22;
  const spread = 11;
  d2.line(origin, tip, { width: 5, color: ACTION });
  d2.triangle(
    tip,
    [tip[0] - ux * back - uy * spread, tip[1] - uy * back + ux * spread],
    [tip[0] - ux * back + uy * spread, tip[1] - uy * back - ux * spread],
    { color: ACTION },
  );

  // A travelling sine curve, sampled into a strip.
  const wave: [number, number][] = [];
  for (let step = 0; step <= 64; step++) {
    const x = -460 + step * 12;
    wave.push([x, -170 + Math.sin((x + time * 90) / 55) * 34]);
  }
  d2.lineStrip(wave, { width: 4, color: COOL });

  // Outlined hexagon and a filled diamond, the two closed shapes bevy's example draws last.
  d2.polygon([330, -170], 60, 6, { fill: false, strokeWidth: 4, color: WARM });
  d2.rhombus([450, -170], [90, 110], { color: ACCENT });
}

/** Two crossing strokes, bevy's `cross_2d`. */
function cross(d2: FrameRecorder2D, center: [number, number], size: number, color: Color): void {
  const [x, y] = center;
  d2.line([x - size, y], [x + size, y], { width: 3, color });
  d2.line([x, y - size], [x, y + size], { width: 3, color });
}
