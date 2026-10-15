export type ExampleColumn = {
  readonly label: string;
  readonly samples: readonly string[];
  readonly implemented: boolean;
};

export type GodotExample = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly notes?: string;
  readonly columns: readonly ExampleColumn[];
  readonly implemented: boolean;
};

// Columns whose Godot variants are only approximated by this vgpu port are flagged false so the
// gallery never claims parity it does not have: grid boundary (`outer`) handling still differs.
const approximated = /outer/;

const column = (label: string, samples: readonly string[]): ExampleColumn => ({
  label,
  samples,
  implemented: !approximated.test(label),
});

const width = ["width = 1.0", "width = 2.0", "width = 5.5", "width = 10.0"];
const joints = ["none", "round", "bevel", "miter"];
const dash = ["dash = 0.10 / 0.10", "dash = 0.20 / 0.10", "dash = 0.40 / 0.15", "dash = 0.04 / 0.12"];
const normal = ["base", "alpha", "color", "wide"];
const rotation = Array.from({ length: 8 }, (_, index) => `step ${index}`);

// Arrow example samples copied from `examples/arrow.gd` `_get_sample_label`.
const arrowWidth = ["w = 1.0", "w = 2.0", "w = 5.5", "w = 10.0"];
const arrowDir = ["-63 deg", "-22 deg", "22 deg", "63 deg"];
const arrowHeadAngle = ["20 deg", "30 deg", "45 deg", "76 deg"];
const arrowJoints = ["NONE", "ROUND", "BEVEL", "MITER"];
const arrowHeadLength = ["head = 0.12", "head = 0.22", "head = 0.34", "head = 0.46"];
const arrowDash = ["0.10 / 0.10", "0.20 / 0.10", "0.40 / 0.15", "0.04 / 0.12"];
const radius = ["0.18", "0.28", "0.38", "0.50"];
const segments = ["8", "16", "32", "64"];
const jointNote = "Round, bevel and miter joins are rebuilt in the vertex stage from the reference joint shaders.";

const shapeWidth = ["w = 1.0", "w = 2.0", "w = 5.5", "w = 10.0"];
const shapeRadius = ["r = 0.18", "r = 0.28", "r = 0.38", "r = 0.50"];
const capsuleRadius = ["r = 0.16", "r = 0.24", "r = 0.32", "r = 0.40"];
const shapeSegments = ["8 seg", "16 seg", "32 seg", "64 seg"];
const smallSegments = ["3 seg", "4 seg", "8 seg", "16 seg"];
const sideSegments = ["3 side", "4 side", "8 side", "16 side"];
const capsuleSideSegments = ["1 side", "2 side", "4 side", "8 side"];
const coneHeights = ["h = 0.45", "h = 0.65", "h = 0.85", "h = 1.05"];
const cylinderHalfHeights = ["hh = 0.225", "hh = 0.325", "hh = 0.425", "hh = 0.525"];
const capsuleHalfHeights = ["hh = 0.000", "hh = 0.125", "hh = 0.225", "hh = 0.350"];
const yAxisSegments = ["y = 0", "y = 1", "y = 2", "y = 6"];
const zAxisSegments = ["z = 0", "z = 1", "z = 2", "z = 6"];

// Row labels copied from `examples/index.gd` ROW_LABELS (the full API matrix).
const indexRows: Readonly<Record<string, readonly string[]>> = {
  line: ["draw_line", "draw_line_n", "draw_line_d", "draw_line_n_d"],
  ray: ["draw_ray", "draw_ray_n", "draw_ray_d", "draw_ray_n_d"],
  arrow: ["draw_arrow", "draw_arrow_n", "draw_arrow_line", "draw_arrow_line_n", "draw_arrow_line_d", "draw_arrow_line_n_d"],
  axes: ["draw_axes", "draw_axes_n"],
  line_list: ["draw_line_list", "draw_line_list_n"],
  strip: ["draw_line_strip", "draw_line_strip_n", "draw_line_strip_d", "draw_line_strip_n_d"],
  loop: ["draw_line_loop", "draw_line_loop_n", "draw_line_loop_d", "draw_line_loop_n_d"],
  curve: ["draw_curve", "draw_curve_d"],
  grid: ["draw_grid", "draw_grid_n"],
  rect: ["draw_rect", "draw_rect_s", "draw_rect_n", "draw_rect_d", "draw_rect_n_d"],
  box: ["draw_box", "draw_box_s", "draw_box_n", "draw_box_d", "draw_box_n_d"],
  circle: ["draw_circle", "draw_circle_s", "draw_circle_n", "draw_circle_d", "draw_circle_n_d"],
  arc: ["draw_arc", "draw_arc_n", "draw_arc_d", "draw_arc_n_d"],
  sphere: ["draw_sphere", "draw_sphere_s", "draw_sphere_n", "draw_sphere_d", "draw_sphere_n_d"],
  cone: ["draw_cone", "draw_cone_s", "draw_cone_n"],
  cylinder: ["draw_cylinder", "draw_cylinder_s", "draw_cylinder_n"],
  capsule: ["draw_capsule", "draw_capsule_n"],
};

// `world_space_width.gd` ROW_LABELS: same matrix without the `*_s` solid columns.
const worldWidthRows: Readonly<Record<string, readonly string[]>> = {
  ...indexRows,
  rect: ["draw_rect", "draw_rect_n", "draw_rect_d", "draw_rect_n_d"],
  box: ["draw_box", "draw_box_n", "draw_box_d", "draw_box_n_d"],
  circle: ["draw_circle", "draw_circle_n", "draw_circle_d", "draw_circle_n_d"],
  sphere: ["draw_sphere", "draw_sphere_n", "draw_sphere_d", "draw_sphere_n_d"],
  cone: ["draw_cone", "draw_cone_n"],
  cylinder: ["draw_cylinder", "draw_cylinder_n"],
};

// Column structure copied from the reference scenes. Capsule has no `_s` column.
const solidExamples: GodotExample[] = [
  {
    id: "sphere",
    title: "Sphere",
    description: "Sphere wire and solid meshes across width, radius, segment, axis, dash, joint and normal rows.",
    notes: "Reference has 14 columns including y/z axis and sphere_s; the UV generator approximates the independent axis ring counts.",
    implemented: true,
    columns: [
      column("sphere(width)", shapeWidth),
      column("sphere(radius)", shapeRadius),
      column("sphere(segments)", shapeSegments),
      column("sphere(y axis)", yAxisSegments),
      column("sphere(z axis)", zAxisSegments),
      column("sphere(rotation)", rotation),
      column("sphere(joint)", joints),
      column("sphere_d(dash)", dash),
      column("sphere_d(joint)", joints),
      column("sphere_n", normal),
      column("sphere_n(joint)", joints),
      column("sphere_n_d(dash)", dash),
      column("sphere_n_d(joint)", joints),
      column("sphere_s", rotation),
    ],
  },
  {
    id: "cone",
    title: "Cone",
    description: "Cone wire and solid meshes across width, radius, height, segment, rotation, joint and normal rows.",
    notes: "Reference has 10 columns including cone_s; the generator uses one segment count for the base ring and side lines.",
    implemented: true,
    columns: [
      column("cone(width)", shapeWidth),
      column("cone(radius)", shapeRadius),
      column("cone(height)", coneHeights),
      column("cone(segments)", smallSegments),
      column("cone(side segments)", sideSegments),
      column("cone(rotation)", rotation),
      column("cone(joint)", joints),
      column("cone_n", normal),
      column("cone_n(joint)", joints),
      column("cone_s", rotation),
    ],
  },
  {
    id: "cylinder",
    title: "Cylinder",
    description: "Cylinder wire and solid meshes across width, radius, half height, segment, rotation, joint and normal rows.",
    notes: "Reference has 10 columns including cylinder_s; the generator uses one segment count for the base ring and side lines.",
    implemented: true,
    columns: [
      column("cylinder(width)", shapeWidth),
      column("cylinder(radius)", shapeRadius),
      column("cylinder(half height)", cylinderHalfHeights),
      column("cylinder(segments)", smallSegments),
      column("cylinder(side segments)", sideSegments),
      column("cylinder(rotation)", rotation),
      column("cylinder(joint)", joints),
      column("cylinder_n", normal),
      column("cylinder_n(joint)", joints),
      column("cylinder_s", rotation),
    ],
  },
  {
    id: "capsule",
    title: "Capsule",
    description: "Capsule wire meshes across width, radius, half height, segment, rotation, joint and normal rows.",
    notes: "Reference has 9 columns and no solid column: the capsule reference has no solid variant.",
    implemented: true,
    columns: [
      column("capsule(width)", shapeWidth),
      column("capsule(radius)", capsuleRadius),
      column("capsule(half height)", capsuleHalfHeights),
      column("capsule(segments)", shapeSegments),
      column("capsule(side segments)", capsuleSideSegments),
      column("capsule(rotation)", rotation),
      column("capsule(joint)", joints),
      column("capsule_n", normal),
      column("capsule_n(joint)", joints),
    ],
  },
];

export const GODOT_EXAMPLES: readonly GodotExample[] = [
  { id: "index", title: "Index", description: "The DebugDraw3D API matrix: 17 primitive columns with the reference per-column row sets.", notes: "Overview of every primitive family; row labels mirror the reference draw calls.", implemented: true, columns: ["line", "ray", "arrow", "axes", "line_list", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"].map((label) => column(label, indexRows[label]!)) },
  { id: "line", title: "Line", description: "Widths, alpha, dashes, strip and loop joints, dashed joints, and normal-aware lines.", notes: jointNote, implemented: true, columns: [column("line(width)", width), column("line(alpha)", ["alpha = 1.00", "alpha = 0.65", "alpha = 0.35", "alpha = 0.10"]), column("line_d(dash)", dash), column("strip(joint)", joints), column("loop(joint)", joints), column("strip_d(joint)", joints), column("line_n(normal)", normal)] },
  { id: "arrow", title: "Arrow", description: "Arrow direction, width, head length, head angle, joints, normal-aware arrows, and arrow-line variants.", notes: jointNote + " Head angle and length are wired to arrow geometry.", implemented: true, columns: [column("arrow(width)", arrowWidth), column("arrow(dir)", arrowDir), column("arrow(head angle)", arrowHeadAngle), column("arrow(joint)", arrowJoints), column("arrow_n", normal), column("arrow_n(joint)", arrowJoints), column("arrow_line(width)", arrowWidth), column("arrow_line(head length)", arrowHeadLength), column("arrow_line(head angle)", arrowHeadAngle), column("arrow_line(rotation)", rotation), column("arrow_line(joint)", arrowJoints), column("arrow_line_d(dash)", arrowDash), column("arrow_line_d(joint)", arrowJoints), column("arrow_line_n", normal), column("arrow_line_n(joint)", arrowJoints), column("arrow_line_n_d(dash)", arrowDash), column("arrow_line_n_d(joint)", arrowJoints)] },
  { id: "axes", title: "Axes", description: "Axis length, width, rotation, and normal-aware axis variants.", implemented: true, columns: [column("axes(length)", ["0.35", "0.55", "0.75", "1.00"]), column("axes(width)", width), column("axes(rotation)", rotation), column("axes_n(length)", ["0.35", "0.55", "0.75", "1.00"]), column("axes_n(width)", width), column("axes_n(rotation)", rotation)] },
  { id: "grid", title: "Grid", description: "Grid width, cell count, spacing, skew, outer edges, rotation, color, and normal rows.", notes: "Column spacing follows each column's measured bounds; rendered skew and outer edges use the library grid semantics.", implemented: true, columns: [column("grid(width)", ["w = 1.0", "w = 2.0", "w = 5.5", "w = 10.0"]), column("grid(cells)", ["4 x 4", "6 x 4", "10 x 3", "3 x 8"]), column("grid(spacing)", ["0.20 x 0.20", "0.28 x 0.28", "0.42 x 0.22", "0.55 x 0.28"]), column("grid(skew)", ["none", "0.28 / 0.00", "-0.28 / 0.00", "0.28 / -0.18"]), column("grid(outer)", ["none", "X", "Z", "XZ"]), column("grid(rotation)", ["step 0", "step 1", "step 2", "step 3", "step 4", "step 5"]), column("grid(color)", ["base", "alpha", "color", "blue"]), column("grid_n", normal)] },
  { id: "rect", title: "Rect", description: "Wire and solid rectangles with size, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: [column("rect(width)", width), column("rect(size)", ["0.50 × 0.40", "0.80 × 0.40", "0.50 × 0.70", "0.55 × 0.55"]), column("rect(rotation)", rotation), column("rect(joint)", joints), column("rect_d(dash)", dash), column("rect_d(joint)", joints), column("rect_n", normal), column("rect_n_d(dash)", dash), column("rect_n(joint)", joints), column("rect_s(solid)", rotation)] },
  { id: "box", title: "Box", description: "Wire and solid boxes with size, rotation, dashes, and normal variants.", implemented: true, columns: [column("box(width)", width), column("box(size)", ["0.50 × 0.40 × 0.40", "0.80 × 0.40 × 0.40", "0.50 × 0.60 × 0.40", "0.50 × 0.40 × 0.60"]), column("box(rotation)", rotation), column("box_d(dash)", dash), column("box_n", normal), column("box_n_d(dash)", dash), column("box_s(solid)", rotation)] },
  { id: "circle", title: "Circle", description: "Circle width, radius, segment count, rotation, joints, dashes, solid and normal variants.", notes: jointNote, implemented: true, columns: [column("circle(width)", width), column("circle(radius)", radius), column("circle(segments)", segments), column("circle(rotation)", rotation), column("circle(joint)", joints), column("circle_d(dash)", dash), column("circle_d(joint)", joints), column("circle_n", normal), column("circle_n_d(dash)", dash), column("circle_n(joint)", joints), column("circle_s(solid)", segments)] },
  { id: "arc", title: "Arc", description: "Arc width, radius, angle, segments, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: [column("arc(width)", width), column("arc(radius)", radius), column("arc(angle)", ["90°", "180°", "270°", "360°"]), column("arc(segments)", segments), column("arc(rotation)", rotation), column("arc(joint)", joints), column("arc_d(dash)", dash), column("arc_d(joint)", joints), column("arc_n", normal), column("arc_n_d(dash)", dash), column("arc_n(joint)", joints)] },
  { id: "curve", title: "Curve", description: "Curve widths, shape, transform, tolerance, closed paths, joints and dashes.", notes: jointNote + " Cubic Bezier control points are sampled adaptively from the tolerance row, and the construction band draws the reference anchor and control markers.", implemented: true, columns: [column("curve(width)", width), column("curve(shape)", ["mild", "soft", "base", "wide"]), column("curve(transform)", rotation), column("curve(tolerance)", ["0.04", "0.08", "0.16", "0.32"]), column("curve(closed)", ["open", "closed", "small", "wide"]), column("curve(joint)", joints), column("curve_d(dash)", dash), column("curve_d(joint)", joints)] },
  ...solidExamples,
  { id: "world_space_width", title: "World Space Width", description: "The 17-column primitive matrix rendered with world-space line widths and without the `*_s` solid columns.", notes: "Widths are `_world_width(px) = px * 0.01`; row labels mirror the reference.", implemented: true, columns: ["line", "ray", "arrow", "axes", "line_list", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"].map((label) => column(label, worldWidthRows[label]!)) },
];
