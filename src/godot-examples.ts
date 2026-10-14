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
// gallery never claims parity it does not have: round joins are real disc caps, while bevel/miter
// joins remain plain segments.
const approximated = /joint|outer/;

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
const radius = ["0.18", "0.28", "0.38", "0.50"];
const segments = ["8", "16", "32", "64"];
const jointNote = "Screen-space round joins render as real disc caps; bevel/miter are drawn as plain segments.";

const solidExamples: GodotExample[] = ["sphere", "cone", "cylinder", "capsule"].map((shape) => ({
  id: shape,
  title: shape[0]!.toUpperCase() + shape.slice(1),
  description: `${shape} wire and solid meshes with radius, segment, and rotation parameter rows.`,
  notes: "Radius rows scale the generated mesh; joint rows are inert because solids have no joins.",
  implemented: true,
  columns: [
    column(`${shape}(width)`, width),
    column(`${shape}(radius)`, radius),
    column(`${shape}(segments)`, segments),
    column(`${shape}(rotation)`, rotation),
    column(`${shape}(joint)`, joints),
    column(`${shape}_n`, normal),
    column(`${shape}_s(solid)`, rotation),
  ],
}));

export const GODOT_EXAMPLES: readonly GodotExample[] = [
  { id: "index", title: "Index", description: "The DebugDraw3D API matrix: primitive columns across base, normal, and dashed rows.", notes: "Overview of every primitive family; a representative sample per row.", implemented: true, columns: ["line", "ray", "arrow", "axes", "line_list", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"].map((label) => column(label, ["base", "normal", "dashed", "normal + dashed"])) },
  { id: "line", title: "Line", description: "Widths, alpha, dashes, strip and loop joints, dashed joints, and normal-aware lines.", notes: jointNote, implemented: true, columns: [column("line(width)", width), column("line(alpha)", ["alpha = 1.00", "alpha = 0.65", "alpha = 0.35", "alpha = 0.10"]), column("line_d(dash)", dash), column("strip(joint)", joints), column("loop(joint)", joints), column("strip_d(joint)", joints), column("line_n(normal)", normal)] },
  { id: "arrow", title: "Arrow", description: "Arrow direction, width, head length, head angle, joints, normal-aware arrows, and arrow-line variants.", notes: jointNote + " Head angle and length are wired to arrow geometry.", implemented: true, columns: [column("arrow(width)", width), column("arrow(dir)", ["-63°", "-22°", "22°", "63°"]), column("arrow(head angle)", ["20°", "30°", "45°", "75.6°"]), column("arrow(joint)", joints), column("arrow_n", normal), column("arrow_n(joint)", joints), column("line(width)", width)] },
  { id: "axes", title: "Axes", description: "Axis length, width, rotation, and normal-aware axis variants.", implemented: true, columns: [column("axes(length)", ["0.35", "0.55", "0.75", "1.00"]), column("axes(width)", width), column("axes(rotation)", rotation), column("axes_n(length)", ["0.35", "0.55", "0.75", "1.00"]), column("axes_n(width)", width), column("axes_n(rotation)", rotation)] },
  { id: "grid", title: "Grid", description: "Grid width, cell count, spacing, skew, outer edges, color, and normalized orientation rows.", notes: "Outer-edge modes select only requested boundary lines; rotation, skew, and normal rows are rendered.", implemented: true, columns: [column("grid(width)", width), column("grid(cells)", ["4 × 4", "6 × 4", "10 × 3", "3 × 8"]), column("grid(spacing)", ["0.20 × 0.20", "0.28 × 0.28", "0.42 × 0.22", "0.55 × 0.28"]), column("grid(skew)", ["zero", "+x", "-x", "+x -z"]), column("grid(outer)", ["none", "x", "z", "xz"]), column("grid(rotation)", ["step 0", "step 1", "step 2", "step 3"]), column("grid(color)", normal), column("grid_n", normal)] },
  { id: "rect", title: "Rect", description: "Wire and solid rectangles with size, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: [column("rect(width)", width), column("rect(size)", ["0.50 × 0.40", "0.80 × 0.40", "0.50 × 0.70", "0.55 × 0.55"]), column("rect(rotation)", rotation), column("rect(joint)", joints), column("rect_d(dash)", dash), column("rect_d(joint)", joints), column("rect_n", normal), column("rect_n_d(dash)", dash), column("rect_n(joint)", joints), column("rect_s(solid)", rotation)] },
  { id: "box", title: "Box", description: "Wire and solid boxes with size, rotation, dashes, and normal variants.", implemented: true, columns: [column("box(width)", width), column("box(size)", ["0.50 × 0.40 × 0.40", "0.80 × 0.40 × 0.40", "0.50 × 0.60 × 0.40", "0.50 × 0.40 × 0.60"]), column("box(rotation)", rotation), column("box_d(dash)", dash), column("box_n", normal), column("box_s(solid)", rotation)] },
  { id: "circle", title: "Circle", description: "Circle width, radius, segment count, rotation, joints, dashes, solid and normal variants.", notes: jointNote, implemented: true, columns: [column("circle(width)", width), column("circle(radius)", radius), column("circle(segments)", segments), column("circle(rotation)", rotation), column("circle(joint)", joints), column("circle_d(dash)", dash), column("circle_d(joint)", joints), column("circle_n", normal), column("circle_n_d(dash)", dash), column("circle_n(joint)", joints), column("circle_s(solid)", segments)] },
  { id: "arc", title: "Arc", description: "Arc width, radius, angle, segments, rotation, joints, dashes, and normal variants.", notes: jointNote, implemented: true, columns: [column("arc(width)", width), column("arc(radius)", radius), column("arc(angle)", ["90°", "180°", "270°", "360°"]), column("arc(segments)", segments), column("arc(rotation)", rotation), column("arc(joint)", joints), column("arc_d(dash)", dash), column("arc_d(joint)", joints), column("arc_n", normal), column("arc_n_d(dash)", dash), column("arc_n(joint)", joints)] },
  { id: "curve", title: "Curve", description: "Curve widths, shape, transform, tolerance, closed paths, joints and dashes.", notes: jointNote + " Cubic Bezier control points are sampled adaptively from the tolerance row.", implemented: true, columns: [column("curve(width)", width), column("curve(shape)", ["mild", "soft", "base", "wide"]), column("curve(transform)", rotation), column("curve(tolerance)", ["0.04", "0.08", "0.16", "0.32"]), column("curve(closed)", ["open", "closed", "small", "wide"]), column("curve(joint)", joints), column("curve_d(dash)", dash), column("curve_d(joint)", joints)] },
  ...solidExamples,
  { id: "world_space_width", title: "World Space Width", description: "The primitive matrix rendered with world-space line widths instead of screen-space widths.", notes: "Widths scale with the projected pixels-per-world-unit from the camera matrix.", implemented: true, columns: ["line", "ray", "arrow", "axes", "line_list", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"].map((label) => column(label, ["world width 0.02", "world width 0.04", "world width 0.08", "world width 0.14"])) },
];
