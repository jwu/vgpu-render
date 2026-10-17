/**
 * Column and row label text of the reference example scenes.
 *
 * Every reference `examples/*.gd` builds one `Label3D` per column title and one per sample, so the
 * gallery's 3D text and its sidebar both need exactly the same strings. They live here, once, and
 * each scene decides only where to put them.
 *
 * The strings are a straight transcription of the reference `_get_column_label` /
 * `_get_sample_label` functions, including their formatting: `w = 1.0`, `ROUND`, `s:0.93  r:-22°
 * h:216°`. The reference scene's own value tables are shared with `layout-3d.ts` rather than
 * copied, so a change to a value row cannot leave its label behind.
 *
 * Placement constants are per scene family: the shape scenes use a 20 px label under a 28 px title
 * at `TITLE_Z`, while the two all-API matrices use 18/24 and a tighter `TITLE_Z`.
 */

import type { Color, FrameRecorder, Vec3 } from "./frame-recorder.js";
import { ALPHA_VALUES, DASH_VALUES, JOINT_VALUES, RADIUS_VALUES, SEGMENT_VALUES, WIDTH_VALUES } from "./layout-3d.js";

export type LabelColumn = {
  readonly title: string;
  /** One label per sample row, in row order. */
  readonly samples: readonly string[];
};

export type SceneLabels = {
  readonly columns: readonly LabelColumn[];
  /** Extra band titles that are not per-column, e.g. `curve.gd`'s construction samples. */
  readonly construction?: readonly string[];
};

export type LabelPlacement = typeof LABEL_PLACEMENT | typeof INDEX_LABEL_PLACEMENT;

/**
 * Where one scene's labels go, already in world space.
 *
 * The reference puts every label at a local position under the scene root, which the capture
 * harness then translates; each spec does that translation itself so a scene only has to name the
 * reference coordinate its label belongs at.
 */
export type SceneLabelSpec = {
  readonly placement: LabelPlacement;
  /** Centre of a column title, the reference `Vector3(_get_column_label_x(c), LABEL_Y, TITLE_Z)`. */
  readonly titlePosition: (column: number) => Vec3;
  /** Right end of a row label, the reference `_get_sample_label_position(column, row)`. */
  readonly samplePosition: (column: number, row: number) => Vec3;
  /** Centre of a construction-band title, the reference `_get_construction_label_x(index)`. */
  readonly constructionPosition?: (index: number) => Vec3;
};

/**
 * Draws one scene's column titles and row labels the way the reference `_create_labels` does: a
 * centred title per column and a right-aligned label per sample, both lying flat on the ground
 * plane at the scene's own label height.
 */
export function drawSceneLabels(recorder: FrameRecorder, labels: SceneLabels, spec: SceneLabelSpec): void {
  const { placement } = spec;
  labels.construction?.forEach((title, index) => {
    const position = spec.constructionPosition?.(index);
    if (position === undefined) return;
    recorder.text(position, title, {
      fontSize: placement.titleFontSize,
      pixelSize: placement.pixelSize,
      space: "world-plane",
      rotation: placement.rotation,
      anchor: "center",
      color: placement.color,
    });
  });
  labels.columns.forEach((column, index) => {
    recorder.text(spec.titlePosition(index), column.title, {
      fontSize: placement.titleFontSize,
      pixelSize: placement.pixelSize,
      space: "world-plane",
      rotation: placement.rotation,
      anchor: "center",
      color: placement.color,
    });
    column.samples.forEach((sample, row) => {
      recorder.text(spec.samplePosition(index, row), sample, {
        fontSize: placement.fontSize,
        pixelSize: placement.pixelSize,
        space: "world-plane",
        rotation: placement.rotation,
        anchor: "center-right",
        color: placement.color,
      });
    });
  });
}

/** Reference `Label3D` constants shared by every curated shape scene. */
export const LABEL_PLACEMENT = {
  /** `LABEL_Y := <scene>_Y + 0.01`: the labels sit just above their samples' base plane. */
  labelYOffset: 0.01,
  /** `TITLE_Z := 0.35`: column titles sit in front of the first sample row. */
  titleZ: 0.35,
  /** `SAMPLE_LABEL_GAP := 0.12`: a row label ends this far left of its sample's bounds. */
  sampleGap: 0.12,
  /** `LABEL_FONT_SIZE`. */
  fontSize: 20,
  /** `TITLE_LABEL_FONT_SIZE`. */
  titleFontSize: 28,
  /** `LABEL_PIXEL_SIZE`: world units per font pixel. */
  pixelSize: 0.004,
  /** `label.modulate = Color(0.86, 0.94, 1.0, 1.0)`. */
  color: [0.86, 0.94, 1, 1] as Color,
  /** `label.rotation.x = -PI * 0.5`, which lays the block flat and readable from above. */
  rotation: [-Math.PI / 2, 0, 0] as const,
} as const;

/** `index.gd` and `world_space_width.gd` use their own, smaller label triple. */
export const INDEX_LABEL_PLACEMENT = {
  ...LABEL_PLACEMENT,
  titleZ: 0.25,
  fontSize: 18,
  titleFontSize: 24,
} as const;

const widths = WIDTH_VALUES.map((value) => `w = ${value.toFixed(1)}`);
const alphas = ALPHA_VALUES.map((value) => `a = ${value.toFixed(2)}`);
const dashes = DASH_VALUES.map(([dash, space]) => `${dash.toFixed(2)} / ${space.toFixed(2)}`);
const joints = JOINT_VALUES.map((joint) => joint.toUpperCase());
const normals = ["base", "alpha", "color", "wide"];
const rotations = Array.from({ length: 8 }, (_, row) => `step ${row}`);
const radii = RADIUS_VALUES.map((value) => `r = ${value.toFixed(2)}`);
const segments = SEGMENT_VALUES.map((value) => `${value} seg`);

/** Reference `_get_angle_label`: whole degrees, `rad_to_deg` then `roundi`. */
function angleLabel(radians: number): string {
  return `${Math.round(radians * 180 / Math.PI)} deg`;
}

/**
 * Reference `_get_*_s_label`: the solid sample's scale, twist and hue in one row,
 * formatted `.2f`, `.0f°`, `.0f°` with two spaces between the three parts.
 */
function solidLabel(scale: number, radians: number, hue: number): string {
  return `s:${scale.toFixed(2)}  r:${Math.round(radians * 180 / Math.PI)}°  h:${Math.round(hue * 360)}°`;
}

// Row labels copied from `examples/index.gd` ROW_LABELS (the full API matrix).
export const INDEX_ROWS: Readonly<Record<string, readonly string[]>> = {
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
export const WORLD_WIDTH_ROWS: Readonly<Record<string, readonly string[]>> = {
  ...INDEX_ROWS,
  rect: ["draw_rect", "draw_rect_n", "draw_rect_d", "draw_rect_n_d"],
  box: ["draw_box", "draw_box_n", "draw_box_d", "draw_box_n_d"],
  circle: ["draw_circle", "draw_circle_n", "draw_circle_d", "draw_circle_n_d"],
  sphere: ["draw_sphere", "draw_sphere_n", "draw_sphere_d", "draw_sphere_n_d"],
  cone: ["draw_cone", "draw_cone_n"],
  cylinder: ["draw_cylinder", "draw_cylinder_n"],
};

export const INDEX_COLUMNS = ["line", "ray", "arrow", "axes", "line_list", "strip", "loop", "curve", "grid", "rect", "box", "circle", "arc", "sphere", "cone", "cylinder", "capsule"] as const;

const matrix = (rows: Readonly<Record<string, readonly string[]>>): readonly LabelColumn[] =>
  INDEX_COLUMNS.map((title) => ({ title, samples: rows[title]! }));

/**
 * Every reference example scene that carries labels. The keys are the gallery scene ids, so a
 * scene draws its own labels without a second, drifting copy of these strings.
 */
export const SCENE_LABELS: Readonly<Record<string, SceneLabels>> = {
  index: { columns: matrix(INDEX_ROWS) },
  world_space_width: { columns: matrix(WORLD_WIDTH_ROWS) },
  line: {
    columns: [
      { title: "line(width)", samples: widths },
      { title: "line(alpha)", samples: alphas },
      { title: "line_d(dash)", samples: dashes },
      { title: "strip(joint)", samples: joints },
      { title: "loop(joint)", samples: joints },
      { title: "strip_d(joint)", samples: joints },
      { title: "line_n(normal)", samples: normals },
    ],
  },
  arrow: {
    columns: [
      { title: "arrow(width)", samples: widths },
      { title: "arrow(dir)", samples: [-Math.PI * 0.35, -Math.PI * 0.12, Math.PI * 0.12, Math.PI * 0.35].map(angleLabel) },
      { title: "arrow(head angle)", samples: [Math.PI / 9, Math.PI / 6, Math.PI / 4, Math.PI * 0.42].map(angleLabel) },
      { title: "arrow(joint)", samples: joints },
      { title: "arrow_n", samples: normals },
      { title: "arrow_n(joint)", samples: joints },
      { title: "arrow_line(width)", samples: widths },
      { title: "arrow_line(head length)", samples: [0.12, 0.22, 0.34, 0.46].map((value) => `head = ${value.toFixed(2)}`) },
      { title: "arrow_line(head angle)", samples: [Math.PI / 9, Math.PI / 6, Math.PI / 4, Math.PI * 0.42].map(angleLabel) },
      { title: "arrow_line(rotation)", samples: rotations },
      { title: "arrow_line(joint)", samples: joints },
      { title: "arrow_line_d(dash)", samples: dashes },
      { title: "arrow_line_d(joint)", samples: joints },
      { title: "arrow_line_n", samples: normals },
      { title: "arrow_line_n(joint)", samples: joints },
      { title: "arrow_line_n_d(dash)", samples: dashes },
      { title: "arrow_line_n_d(joint)", samples: joints },
    ],
  },
  axes: {
    columns: [
      { title: "axes(length)", samples: [0.35, 0.55, 0.75, 1].map((value) => `len = ${value.toFixed(2)}`) },
      { title: "axes(width)", samples: widths },
      { title: "axes(rotation)", samples: rotations },
      { title: "axes_n(length)", samples: [0.35, 0.55, 0.75, 1].map((value) => `len = ${value.toFixed(2)}`) },
      { title: "axes_n(width)", samples: widths },
      { title: "axes_n(rotation)", samples: rotations },
    ],
  },
  grid: {
    columns: [
      { title: "grid(width)", samples: widths },
      { title: "grid(cells)", samples: [[4, 4], [6, 4], [10, 3], [3, 8]].map(([x, y]) => `${x} x ${y}`) },
      { title: "grid(spacing)", samples: [[0.2, 0.2], [0.28, 0.28], [0.42, 0.22], [0.55, 0.28]].map(([x, z]) => `${x.toFixed(2)} x ${z.toFixed(2)}`) },
      { title: "grid(skew)", samples: ["none", "0.28 / 0.00", "-0.28 / 0.00", "0.28 / -0.18"] },
      { title: "grid(outer)", samples: ["none", "X", "Z", "XZ"] },
      { title: "grid(rotation)", samples: rotations.slice(0, 6) },
      { title: "grid(color)", samples: ["base", "alpha", "color", "blue"] },
      { title: "grid_n", samples: normals },
    ],
  },
  rect: {
    columns: [
      { title: "rect(width)", samples: widths },
      { title: "rect(size)", samples: [[0.95, 0.45], [1.25, 0.45], [0.95, 0.75], [0.55, 0.55]].map(([x, y]) => `${x.toFixed(2)} x ${y.toFixed(2)}`) },
      { title: "rect(rotation)", samples: rotations },
      { title: "rect(joint)", samples: joints },
      { title: "rect_d(dash)", samples: dashes },
      { title: "rect_d(joint)", samples: joints },
      { title: "rect_n", samples: normals },
      { title: "rect_n_d(dash)", samples: dashes },
      { title: "rect_n(joint)", samples: joints },
      // `_get_rect_s_label`: scale drops by RECT_S_TUNNEL_SCALE_STEP, twist by PI * 0.12 per row,
      // and the hue walks a sixth of the wheel over the eight samples.
      { title: "rect_s(solid)", samples: rotations.map((_, row) => solidLabel(1 - row * 0.06, row * Math.PI * 0.12, (row / 8 + 0.6) % 1)) },
    ],
  },
  box: {
    columns: [
      { title: "box(width)", samples: widths },
      { title: "box(size)", samples: [[0.72, 0.46, 0.46], [1, 0.46, 0.46], [0.72, 0.72, 0.46], [0.72, 0.46, 0.76]].map(([x, y, z]) => `${x.toFixed(2)} x ${y.toFixed(2)} x ${z.toFixed(2)}`) },
      { title: "box(rotation)", samples: rotations },
      { title: "box_d(dash)", samples: dashes },
      { title: "box_n", samples: normals },
      { title: "box_n_d(dash)", samples: dashes },
      // `_get_box_s_label`: the same three-part row, a fifth of the wheel per sample.
      { title: "box_s(solid)", samples: rotations.map((_, row) => solidLabel(1 - row * 0.05, row * Math.PI * 0.1, (row / 8 + 0.6) % 1)) },
    ],
  },
  circle: {
    columns: [
      { title: "circle(width)", samples: widths },
      { title: "circle(radius)", samples: radii },
      { title: "circle(segments)", samples: segments },
      { title: "circle(rotation)", samples: rotations },
      { title: "circle(joint)", samples: joints },
      { title: "circle_d(dash)", samples: dashes },
      { title: "circle_d(joint)", samples: joints },
      { title: "circle_n", samples: normals },
      { title: "circle_n_d(dash)", samples: dashes },
      { title: "circle_n(joint)", samples: joints },
      { title: "circle_s(segments)", samples: segments },
    ],
  },
  arc: {
    columns: [
      { title: "arc(width)", samples: widths },
      { title: "arc(radius)", samples: radii },
      { title: "arc(angle)", samples: [Math.PI * 0.5, Math.PI, Math.PI * 1.5, Math.PI * 2].map(angleLabel) },
      { title: "arc(segments)", samples: segments },
      { title: "arc(rotation)", samples: rotations },
      { title: "arc(joint)", samples: joints },
      { title: "arc_d(dash)", samples: dashes },
      { title: "arc_d(joint)", samples: joints },
      { title: "arc_n", samples: normals },
      { title: "arc_n_d(dash)", samples: dashes },
      { title: "arc_n(joint)", samples: joints },
    ],
  },
  curve: {
    construction: ["straight", "smooth", "flat handles", "broken", "one-sided", "y curve", "closed"],
    columns: [
      { title: "curve(width)", samples: widths },
      { title: "curve(shape)", samples: ["mild", "soft", "base", "wide"] },
      { title: "curve(transform)", samples: rotations },
      { title: "curve(tolerance)", samples: [0.04, 0.08, 0.16, 0.32].map((value) => `tol = ${value.toFixed(2)}`) },
      { title: "curve(closed)", samples: ["open", "closed", "small", "wide"] },
      { title: "curve(joint)", samples: joints },
      { title: "curve_d(dash)", samples: dashes },
      { title: "curve_d(joint)", samples: joints },
    ],
  },
  sphere: {
    columns: [
      { title: "sphere(width)", samples: widths },
      { title: "sphere(radius)", samples: radii },
      { title: "sphere(segments)", samples: segments },
      { title: "sphere(y axis)", samples: [0, 1, 2, 6].map((value) => `y = ${value}`) },
      { title: "sphere(z axis)", samples: [0, 1, 2, 6].map((value) => `z = ${value}`) },
      { title: "sphere(rotation)", samples: rotations },
      { title: "sphere(joint)", samples: joints },
      { title: "sphere_d(dash)", samples: dashes },
      { title: "sphere_d(joint)", samples: joints },
      { title: "sphere_n", samples: normals },
      { title: "sphere_n(joint)", samples: joints },
      { title: "sphere_n_d(dash)", samples: dashes },
      { title: "sphere_n_d(joint)", samples: joints },
      { title: "sphere_s", samples: rotations },
    ],
  },
  cone: {
    columns: [
      { title: "cone(width)", samples: widths },
      { title: "cone(radius)", samples: radii },
      { title: "cone(height)", samples: [0.45, 0.65, 0.85, 1.05].map((value) => `h = ${value.toFixed(2)}`) },
      { title: "cone(segments)", samples: ["3", "4", "8", "16"].map((value) => `${value} seg`) },
      { title: "cone(side segments)", samples: ["3", "4", "8", "16"].map((value) => `${value} side`) },
      { title: "cone(rotation)", samples: rotations },
      { title: "cone(joint)", samples: joints },
      { title: "cone_n", samples: normals },
      { title: "cone_n(joint)", samples: joints },
      { title: "cone_s", samples: rotations },
    ],
  },
  cylinder: {
    columns: [
      { title: "cylinder(width)", samples: widths },
      { title: "cylinder(radius)", samples: radii },
      { title: "cylinder(half height)", samples: [0.225, 0.325, 0.425, 0.525].map((value) => `hh = ${value.toFixed(3)}`) },
      { title: "cylinder(segments)", samples: ["3", "4", "8", "16"].map((value) => `${value} seg`) },
      { title: "cylinder(side segments)", samples: ["3", "4", "8", "16"].map((value) => `${value} side`) },
      { title: "cylinder(rotation)", samples: rotations },
      { title: "cylinder(joint)", samples: joints },
      { title: "cylinder_n", samples: normals },
      { title: "cylinder_n(joint)", samples: joints },
      { title: "cylinder_s", samples: rotations },
    ],
  },
  capsule: {
    columns: [
      { title: "capsule(width)", samples: widths },
      { title: "capsule(radius)", samples: [0.16, 0.24, 0.32, 0.4].map((value) => `r = ${value.toFixed(2)}`) },
      { title: "capsule(half height)", samples: [0, 0.125, 0.225, 0.35].map((value) => `hh = ${value.toFixed(3)}`) },
      { title: "capsule(segments)", samples: segments },
      { title: "capsule(side segments)", samples: ["1", "2", "4", "8"].map((value) => `${value} side`) },
      { title: "capsule(rotation)", samples: rotations },
      { title: "capsule(joint)", samples: joints },
      { title: "capsule_n", samples: normals },
      { title: "capsule_n(joint)", samples: joints },
    ],
  },
};
