/**
 * Column titles, sample labels and fitted view extents of the 2D matrix pages.
 *
 * The sidebar, the page heading and the geometry all read this one table, so a label
 * cannot drift from the sample it names.
 */

export type Column2D = {
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

export const COLUMN_SPACING = 200;
export const ROW_SPACING = 120;
export const COLUMN_TITLE_FONT = 23;
export const SAMPLE_LABEL_FONT = 19;

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
    note: "cross, point (square and round) and axes",
    columns: [
      { title: "cross(size)", samples: ["8", "16", "24", "32"] },
      { title: "point(size)", samples: ["4", "8", "14", "22"] },
      { title: "point(round)", samples: ["6", "10", "16", "24"] },
      { title: "axes(length)", samples: ["30", "45", "60", "80"] },
    ],
  },
  "2d-arrows": {
    title: "2D Arrows",
    note: "filled / line · same width, head length, head angle, direction, joint and dash as the 3D arrow page",
    spacing: 180,
    columns: [
      { title: "filled(w)", samples: ["w: 2", "w: 4", "w: 6", "w: 8"] },
      { title: "line(w)", samples: ["w: 2", "w: 4", "w: 6", "w: 8"] },
      { title: "filled(head)", samples: ["14", "20", "26", "34"] },
      { title: "line(head)", samples: ["14", "20", "26", "34"] },
      { title: "filled(angle)", samples: ["20°", "30°", "45°", "75°"] },
      { title: "line(angle)", samples: ["20°", "30°", "45°", "75°"] },
      { title: "filled(dir)", samples: ["-63°", "-22°", "22°", "63°"] },
      { title: "line(dir)", samples: ["-63°", "-22°", "22°", "63°"] },
      { title: "filled(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "line(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "filled(dash)", samples: ["24 / 8", "12 / 12", "6 / 18", "2 / 12"] },
      { title: "line(dash)", samples: ["24 / 8", "12 / 12", "6 / 18", "2 / 12"] },
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


export function tableRows(id: string): number {
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
