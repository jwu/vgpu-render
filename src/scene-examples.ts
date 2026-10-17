import { SCENE_LABELS } from "./labels-3d.js";

export type ExampleColumn = {
  readonly label: string;
  readonly samples: readonly string[];
  readonly implemented: boolean;
};

export type SceneExample = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly notes?: string;
  readonly columns: readonly ExampleColumn[];
  readonly implemented: boolean;
  /** Which camera drives the page: the gallery's 3D orbit camera by default, or the 2D pan/zoom one. */
  readonly family?: "2d" | "3d";
  /**
   * Sidebar grouping. Defaults to `family`, so the 2D pages land in "2D Graphics" and every 3D
   * page in "3D Graphics"; the text pages name "text" explicitly, since they use the 3D camera
   * without being 3D geometry pages.
   */
  readonly group?: "3d" | "2d" | "text";
  /**
   * World-space extent the 2D camera fits to this page, in `world2d` units. Only read when
   * `family` is "2d"; the page draws around the origin.
   */
  readonly view2d?: { readonly width: number; readonly height: number };
  /**
   * Hide the infinite grid while this example is selected.
   *
   * A screen-space page is its own content in pixel space, so the grid is a world-space reference
   * that can only cross it as diagonal lines, so those pages set `true`. A world-space page that
   * wants the grid as its ground plane says `false` explicitly; leaving the flag unset keeps whatever
   * the sidebar shows, which is what every other world-space example wants.
   */
  readonly hideGrid?: boolean;
};

// Columns whose reference variants are only approximated by this vgpu port are flagged false so the
// gallery never claims parity it does not have: grid boundary (`outer`) handling still differs.
const approximated = /outer/;

const column = (label: string, samples: readonly string[]): ExampleColumn => ({
  label,
  samples,
  implemented: !approximated.test(label),
});

const jointNote = "Round, bevel and miter joins are rebuilt in the vertex stage from the reference joint shaders.";

/**
 * A gallery page's columns come from the same table the 3D scene draws its `Label3D`-equivalent text
 * from, so the sidebar and the scene can never disagree about a row's label.
 */
const columnsOf = (id: string): readonly ExampleColumn[] =>
  (SCENE_LABELS[id]?.columns ?? []).map((entry) => column(entry.title, entry.samples));

// Column structure copied from the reference scenes. Capsule has no `_s` column.
const solidExamples: SceneExample[] = [
  {
    id: "sphere",
    title: "Sphere",
    description: "Sphere wire and solid meshes across width, radius, segment, axis, dash, joint and normal rows.",
    notes: "Reference has 14 columns including y/z axis and sphere_s; the UV generator approximates the independent axis ring counts.",
    implemented: true,
    columns: columnsOf("sphere"),
  },
  {
    id: "cone",
    title: "Cone",
    description: "Cone wire and solid meshes across width, radius, height, segment, rotation, joint and normal rows.",
    notes: "Reference has 10 columns including cone_s; the generator uses one segment count for the base ring and side lines.",
    implemented: true,
    columns: columnsOf("cone"),
  },
  {
    id: "cylinder",
    title: "Cylinder",
    description: "Cylinder wire and solid meshes across width, radius, half height, segment, rotation, joint and normal rows.",
    notes: "Reference has 10 columns including cylinder_s; the generator uses one segment count for the base ring and side lines.",
    implemented: true,
    columns: columnsOf("cylinder"),
  },
  {
    id: "capsule",
    title: "Capsule",
    description: "Capsule wire meshes across width, radius, half height, segment, rotation, joint and normal rows.",
    notes: "Reference has 9 columns and no solid column: the capsule reference has no solid variant.",
    implemented: true,
    columns: columnsOf("capsule"),
  },
];

export const SCENE_EXAMPLES: readonly SceneExample[] = [
  { id: "index", title: "Index", description: "The DebugDraw3D API matrix: 17 primitive columns with the reference per-column row sets.", notes: "Overview of every primitive family; row labels mirror the reference draw calls.", implemented: true, columns: columnsOf("index") },
  { id: "line", title: "Line", description: "Widths, alpha, dashes, strip and loop joints, dashed joints, and normal-aware lines.", notes: jointNote, implemented: true, columns: columnsOf("line") },
  { id: "arrow", title: "Arrow", description: "Arrow direction, width, head length, head angle, joints, normal-aware arrows, and arrow-line variants.", notes: jointNote + " Head angle and length are wired to arrow geometry.", implemented: true, columns: columnsOf("arrow") },
  { id: "axes", title: "Axes", description: "Axis length, width, rotation, and normal-aware axis variants.", implemented: true, columns: columnsOf("axes") },
  { id: "grid", title: "Grid", description: "Grid width, cell count, spacing, skew, outer edges, rotation, color, and normal rows.", notes: "Column spacing follows each column's measured bounds; rendered skew and outer edges use the library grid semantics.", implemented: true, columns: columnsOf("grid") },
  { id: "rect", title: "Rect", description: "Wire and solid rectangles with size, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: columnsOf("rect") },
  { id: "box", title: "Box", description: "Wire and solid boxes with size, rotation, dashes, and normal variants.", implemented: true, columns: columnsOf("box") },
  { id: "circle", title: "Circle", description: "Circle width, radius, segment count, rotation, joints, dashes, solid and normal variants.", notes: jointNote, implemented: true, columns: columnsOf("circle") },
  { id: "arc", title: "Arc", description: "Arc width, radius, angle, segments, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: columnsOf("arc") },
  { id: "curve", title: "Curve", description: "Curve widths, shape, transform, tolerance, closed paths, joints and dashes.", notes: jointNote + " Cubic Bezier control points are sampled adaptively from the tolerance row, and the construction band draws the reference anchor and control markers.", implemented: true, columns: columnsOf("curve") },
  ...solidExamples,
  { id: "world_space_width", title: "World Space Width", description: "The 17-column primitive matrix rendered with world-space line widths and without the `*_s` solid columns.", notes: "Widths are `_world_width(px) = px * 0.01`; row labels mirror the reference.", implemented: true, columns: columnsOf("world_space_width") },
  { id: "text-compare", title: "Text Compare", description: "A matrix of one sentence: rows are glyph sources, columns are font sizes.", notes: "Not a reference port: there is no upstream text API, so this is vgpu's own capability. Transposed relative to the line/circle matrices — text grows sideways, so six source columns would be wider than a camera wants to frame. Read down a column to compare encodings at one size, across a row to compare sizes under one encoding. The last row is a fixed-orientation block rather than a camera-facing one, so it foreshortens as you orbit. Every row floats above the grid plane, which writes depth and would otherwise clip it.", implemented: true, group: "text", columns: [column("glyph source", ["bitmap 1x", "bitmap 4x", "sdf 1x", "sdf 4x", "msdf outline", "msdf baked"]), column("font size", ["16 px", "24 px", "36 px"]), column("placement", ["world-billboard", "world-plane", "foreshortens"]), column("what changes", ["coverage interpolation", "supersampled coverage", "distance reconstruction", "per-edge distance", "prebaked at 24 px"])] },
  { id: "text-encodings", title: "Text Encodings", description: "One sentence from four glyph sources, at two sizes, plus the outline pair.", notes: "Not a reference port: there is no upstream text API, so this is vgpu's own capability. Every block takes the default source — the one that rasterises each glyph at the size it covers on screen — except the columns that name one, so the page doubles as the gallery's own quality check. The lower band repeats the same ink at more than twice the size, which is where a coverage source and a distance field stop looking alike.", implemented: true, group: "text", hideGrid: true, columns: [column("source", ["bitmap 1x", "sdf 4x", "msdf 2x", "msdf baked"]), column("what changes", ["coverage interpolation", "distance reconstruction", "per-edge distance", "prebaked at 24 px"]), column("outline", ["reads the true distance in alpha", "samples coverage in eight directions"])] },
  { id: "text-scale", title: "Text Scale", description: "One sentence at six sizes, over three raster strategies at one size.", notes: "Not a reference port. The top row puts 26 px under the screen-driven ladder, a fixed 1x raster and a fixed 4x raster; the rows below run 8 px to 96 px, so the rung changes — and the absence of a soft step between them — are visible in one frame. The first strategy is what a caller gets by default.", implemented: true, group: "text", hideGrid: true, columns: [column("raster", ["screen decides the rung", "fixed 1x", "fixed 4x"]), column("sizes", ["8 px", "12 px", "18 px", "28 px", "48 px", "96 px"])] },
  { id: "text-world-zoom", title: "Text World Zoom", description: "Four sources in world space, made to be magnified with the camera.", notes: "Not a reference port. Screen-space text cannot be magnified — a larger block is simply a request for a new rasterisation — so world-space rows are the only honest test of what a source does past the size its glyphs were built at. Scroll to move the camera in and out: a coverage source runs into the texels it stored, a distance field keeps rebuilding the edge from them.", implemented: true, group: "text", hideGrid: false, columns: [column("source", ["bitmap 1x", "bitmap 4x", "sdf 4x", "msdf baked"]), column("past its raster", ["shows the stored texels", "shows smaller texels", "rebuilds the edge", "rebuilds from a 24 px page"])] },
  { id: "text-layout", title: "Text Layout", description: "Wrapping, justification, bounds, line height, letter spacing and spans.", notes: "Not a reference port. The layout follows the documented wrapping and justification semantics, and `docs/text-reference.md` records how each capability is verified. Each row is one capability, labelled on the left, and every bounded row draws the box it wrapped into — a wrapping rule is unreadable without it.", implemented: true, group: "text", hideGrid: true, columns: [column("capability", ["word wrap", "character wrap", "justify", "line height", "letter spacing", "spans"]), column("option", ["lineBreak", "lineBreak", "justify", "lineHeight", "letterSpacing", "TextSpan"])] },
  { id: "text-anchor", title: "Text Anchors", description: "The nine anchors against the position a block is handed and the bounds it lands in.", notes: "Not a reference port. The plus is the position the block is given, the box is the bounds it laid out into, and the label names the anchor — so both of the things an anchor moves between are visible at once.", implemented: true, group: "text", hideGrid: true, columns: [column("anchor", ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"])] },
  { id: "text-cjk", title: "Text CJK", description: "Wrapping per character, kinsoku, mixed scripts and four sizes.", notes: "Not a reference port. CJK has no spaces to break at, so the layout breaks between characters and applies kinsoku: a closing mark never opens a line and an opening bracket never ends one, and the narrow column is tuned so those rules have to act. The family is the bundled latin face, and the canvas falls back to a system CJK face for the ideographs — the same arrangement a system font fallback provides.", implemented: true, group: "text", hideGrid: true, columns: [column("rule", ["per character", "kinsoku", "mixed script"]), column("sizes", ["12 px", "18 px", "28 px", "48 px"])] },
  {
    id: "2d-gizmos",
    title: "2D Gizmos",
    description: "Immediate-mode 2D strokes in the camera-centred world2d space: lines, rays, joined strips, boxes, rounded boxes, circles, ellipses, arcs, crosses, arrows, curves and a grid.",
    notes: "Not a reference port: this page is built directly on frame.d2. world2d puts the origin at the canvas centre, +y up, one unit per canvas pixel before the camera's pan and zoom. Drag to pan, scroll to zoom.",
    implemented: true,
    family: "2d",
    // The 2D grid is part of what these pages demonstrate, so it opens on even if the
    // previous page had it off.
    hideGrid: false,
    view2d: { width: 1080, height: 640 },
    columns: [
      column("stroke", ["line", "ray", "linestrip", "rect", "roundedRect", "circle", "ellipse", "arc", "cross", "arrow", "curve", "grid"]),
      column("option", ["width", "joint", "dash", "fill", "strokeWidth", "startAngle", "sweep", "rotation", "space"]),
    ],
  },
  {
    id: "2d-shapes",
    title: "2D Shapes",
    description: "Twelve 2D primitives as filled shapes, with their stroked outlines underneath.",
    notes: "Not a reference port: this page is built on frame.d2 shape primitives. Each shape is one instanced quad evaluated as a signed distance field, so an outline width is a pixel count at any zoom and nothing is triangulated on the CPU. Drag to pan, scroll to zoom.",
    implemented: true,
    family: "2d",
    // The 2D grid is part of what these pages demonstrate, so it opens on even if the
    // previous page had it off.
    hideGrid: false,
    view2d: { width: 1260, height: 560 },
    columns: [
      column("filled", ["circle", "sector", "segment", "ellipse", "annulus", "capsule", "rhombus", "rect", "polygon", "triangle", "segment2d", "polyline2d"]),
      column("ring", ["circle", "sector", "segment", "ellipse", "annulus", "capsule", "rhombus", "rect", "polygon", "triangle"]),
    ],
  },
];
