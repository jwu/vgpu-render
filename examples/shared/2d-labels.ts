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
  /**
   * Column-title size in font pixels. Defaults to `COLUMN_TITLE_FONT`; the shape pages shrink it a
   * little so single-line `rect(width)` titles still fit their (wider) columns.
   */
  readonly titleFont?: number;
  /**
   * Extra `world2d` height reserved below the matrix, for a page that draws a construction band
   * under its columns (the 2D twin of the 3D curve page).
   */
  readonly extraHeight?: number;
};

export const COLUMN_SPACING = 200;
export const ROW_SPACING = 120;
export const COLUMN_TITLE_FONT = 23;
export const SAMPLE_LABEL_FONT = 19;

/** Column titles and sample labels of every matrix page, shared with `scene-examples.ts`. */
export const LABELS_2D: Readonly<Record<string, Page2DLabels>> = {
  "2d-lines": {
    title: "2D Lines",
    note: "line · width, alpha, gradient, dash · open strip and closed loop, solid and dashed · drag or WASD to pan · shift sprints · scroll to zoom",
    spacing: 210,
    columns: [
      { title: "line(width)", samples: ["w: 2", "w: 6", "w: 12", "w: 24"] },
      { title: "line(alpha)", samples: ["a: .25", "a: .50", "a: .75", "a: 1.0"] },
      { title: "line(grad)", samples: ["a→r", "c→w", "ac→c", "w→a"] },
      { title: "line_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "strip(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "strip_d(dash)", samples: ["none", "round", "bevel", "miter"] },
      { title: "loop(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "loop_d(dash)", samples: ["none", "round", "bevel", "miter"] },
    ],
  },
  "2d-curves": {
    title: "2D Curves",
    note: "construction band with control points, then width / shape / transform / tolerance / closed / dashes · the same layout as the 3D curve page",
    spacing: 240,
    extraHeight: 180,
    columns: [
      { title: "curve(width)", samples: ["1", "2", "4", "8"] },
      { title: "curve(shape)", samples: ["mild", "soft", "base", "wide"] },
      { title: "curve(transform)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "curve(tolerance)", samples: ["tol 1", "tol 2", "tol 4", "tol 8"] },
      { title: "curve(closed)", samples: ["open", "closed", "small", "wide"] },
      { title: "curve_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
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
    note: "arrow keeps the open line head and arrow_s fills it · width, head length, head angle, direction, joint and dashes",
    spacing: 200,
    columns: [
      { title: "arrow_s(width)", samples: ["2", "4", "6", "8"] },
      { title: "arrow(width)", samples: ["2", "4", "6", "8"] },
      { title: "arrow_s(head)", samples: ["14", "20", "26", "34"] },
      { title: "arrow(head)", samples: ["14", "20", "26", "34"] },
      { title: "arrow_s(angle)", samples: ["20°", "30°", "45°", "75°"] },
      { title: "arrow(angle)", samples: ["20°", "30°", "45°", "75°"] },
      { title: "arrow_s(dir)", samples: ["-63°", "-22°", "22°", "63°"] },
      { title: "arrow(dir)", samples: ["-63°", "-22°", "22°", "63°"] },
      { title: "arrow(joint)", samples: ["none", "round", "bevel", "miter"] },
      { title: "arrow_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "arrow_s_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
    ],
  },
  "2d-rect": {
    title: "2D Rect",
    note: "normal width / size / rotation / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "rect(width)", samples: ["1", "2", "4", "8"] },
      { title: "rect(size)", samples: ["100×48", "72×44", "52×60", "96×32"] },
      { title: "rect(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "rect(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "rect(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "rect_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "rect_s(solid)", samples: ["92×54", "68×38", "92×34", "68×68"] },
    ],
  },
  "2d-rounded-rect": {
    title: "2D Rounded Rect",
    note: "normal radius / size / rotation / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "rect_r(radius)", samples: ["2", "12", "24", "40"] },
      { title: "rect_r(size)", samples: ["100×52", "72×44", "52×60", "96×32"] },
      { title: "rect_r(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "rect_r(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "rect_r(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "rect_r_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "rect_r_s(solid)", samples: ["92×52", "64×44", "84×42", "68×68"] },
    ],
  },
  "2d-circle": {
    title: "2D Circle",
    note: "normal radius / stroke / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "circle(radius)", samples: ["18", "26", "34", "40"] },
      { title: "circle(stroke)", samples: ["1", "2", "4", "8"] },
      { title: "circle(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "circle(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "circle_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "circle_s(solid)", samples: ["20", "28", "36", "40"] },
    ],
  },
  "2d-ellipse": {
    title: "2D Ellipse",
    note: "normal radii / rotation / stroke / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "ellipse(radii)", samples: ["50×26", "36×36", "26×36", "50×20"] },
      { title: "ellipse(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "ellipse(stroke)", samples: ["1", "2", "4", "8"] },
      { title: "ellipse(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "ellipse(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "ellipse_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "ellipse_s(solid)", samples: ["46×20", "32×32", "22×36", "50×18"] },
    ],
  },
  "2d-arc": {
    title: "2D Arc",
    note: "normal sweep / startAngle / radius / stroke / color / alpha first, then the dashed variant · an arc has no interior, so there is no _s",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "arc(sweep)", samples: ["60°", "120°", "240°", "330°"] },
      { title: "arc(startAngle)", samples: ["0°", "90°", "180°", "270°"] },
      { title: "arc(radius)", samples: ["22", "30", "36", "40"] },
      { title: "arc(stroke)", samples: ["1", "2", "4", "8"] },
      { title: "arc(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "arc(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "arc_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
    ],
  },
  "2d-annulus": {
    title: "2D Annulus",
    note: "normal inner / outer / stroke / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "annulus(inner)", samples: ["6", "14", "22", "30"] },
      { title: "annulus(outer)", samples: ["30", "34", "38", "40"] },
      { title: "annulus(stroke)", samples: ["1", "2", "4", "8"] },
      { title: "annulus(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "annulus(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "annulus_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "annulus_s(solid)", samples: ["6/30", "14/34", "22/38", "30/40"] },
    ],
  },
  "2d-capsule": {
    title: "2D Capsule",
    note: "normal length / radius / rotation / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "capsule(length)", samples: ["0", "16", "32", "44"] },
      { title: "capsule(radius)", samples: ["10", "14", "18", "22"] },
      { title: "capsule(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "capsule(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "capsule(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "capsule_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "capsule_s(solid)", samples: ["0", "16", "32", "44"] },
    ],
  },
  "2d-polygon": {
    title: "2D Polygon",
    note: "normal sides / circumradius / rotation / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "polygon(sides)", samples: ["3", "4", "6", "12"] },
      { title: "polygon(circumradius)", samples: ["20", "26", "32", "40"] },
      { title: "polygon(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "polygon(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "polygon(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "polygon_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "polygon_s(solid)", samples: ["3", "4", "6", "12"] },
    ],
  },
  "2d-triangle": {
    title: "2D Triangle",
    note: "normal vertices / rotation / stroke / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "triangle(vertices)", samples: ["acute", "right", "obtuse", "isosceles"] },
      { title: "triangle(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "triangle(stroke)", samples: ["1", "2", "4", "8"] },
      { title: "triangle(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "triangle(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "triangle_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "triangle_s(solid)", samples: ["acute", "right", "obtuse", "isosceles"] },
    ],
  },
  "2d-rhombus": {
    title: "2D Rhombus",
    note: "normal diagonals / rotation / stroke / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "rhombus(diagonals)", samples: ["60×80", "84×56", "72×72", "90×76"] },
      { title: "rhombus(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "rhombus(stroke)", samples: ["1", "2", "4", "8"] },
      { title: "rhombus(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "rhombus(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "rhombus_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "rhombus_s(solid)", samples: ["60×80", "84×56", "72×72", "90×76"] },
    ],
  },
  "2d-sector": {
    title: "2D Sector",
    note: "normal sweep / startAngle / radius / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "sector(sweep)", samples: ["60°", "120°", "240°", "330°"] },
      { title: "sector(startAngle)", samples: ["0°", "90°", "180°", "270°"] },
      { title: "sector(radius)", samples: ["22", "30", "36", "40"] },
      { title: "sector(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "sector(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "sector_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "sector_s(solid)", samples: ["60°", "120°", "240°", "330°"] },
    ],
  },
  "2d-segment": {
    title: "2D Segment",
    note: "normal sweep / startAngle / radius / color / alpha first, then the dashed outline and one combined solid sample per row",
    spacing: 250,
    titleFont: 20,
    columns: [
      { title: "segment(sweep)", samples: ["60°", "120°", "240°", "330°"] },
      { title: "segment(startAngle)", samples: ["0°", "90°", "180°", "270°"] },
      { title: "segment(radius)", samples: ["22", "30", "36", "40"] },
      { title: "segment(color)", samples: ["warm", "accent", "cool", "action"] },
      { title: "segment(alpha)", samples: [".25", ".50", ".75", "1.0"] },
      { title: "segment_d(dash)", samples: ["24/8", "12/12", "6/18", "2/12"] },
      { title: "segment_s(solid)", samples: ["60°", "120°", "240°", "330°"] },
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
    note: "grid · same width, cells, spacing, skew, outer, rotation and color parameters as the 3D grid",
    columns: [
      { title: "grid(width)", samples: ["w: 1", "w: 2", "w: 4", "w: 8"] },
      { title: "grid(cells)", samples: ["2×2", "3×2", "4×3", "5×4"] },
      { title: "grid(spacing)", samples: ["8×8", "12×10", "16×12", "20×14"] },
      { title: "grid(skew)", samples: ["none", "0.28/0.00", "-0.28/0.00", "0.28/-0.18"] },
      { title: "grid(outer)", samples: ["none", "x", "y", "xy"] },
      { title: "grid(rotation)", samples: ["0°", "15°", "30°", "45°"] },
      { title: "grid(color)", samples: ["base", "alpha", "color", "blue"] },
    ],
  },
  "2d-order": {
    title: "2D & Text Layering",
    note: "zIndex · 2D primitives and text share one key space · higher draws later, so it covers lower · equal keys keep the old order",
    columns: [
      { title: "shape z1 · text z0", samples: ["shape covers text"] },
      { title: "shape z0 · text z1", samples: ["text covers shape"] },
      { title: "shape 0 · text 1 · shape 2", samples: ["text in between"] },
    ],
    titleFont: 19,
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
  const extra = labels?.extraHeight ?? 0;
  return { width: (columns - 1) * spacing + 260, height: (rows - 1) * ROW_SPACING + 300 + extra };
}
