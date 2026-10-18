/**
 * 2D debug-draw commands and their drawList.
 *
 * The 2D layer is the same data flow as the 3D one — `FrameDrawList -> FrameCommand[] -> GPU` —
 * reached through `frame.d2` instead of a second entry point, so a frame has one lifecycle, one
 * layer mask and one set of defaults. The commands are separate types rather than 3D commands
 * with a `space` flag because a 2D point is a `Vec2` and 2D strokes carry no surface normal;
 * keeping them apart stops a 3D-only field from silently meaning something different here.
 *
 * See `camera-2d.ts` for what `world2d` and `screen` mean.
 */

import type { Space2D, Vec2 } from "./camera-2d.js";
import { gridLines2D } from "./geometry-generators.js";
import { sampleCurve2D, type Curve2D, type CurveTransform2D } from "./curve.js";
import type {
  Color,
  LayerMask,
  LineJoint,
  RenderedJoint,
  ResolvedLineDefaults,
  ResolvedPointDefaults,
} from "./frame-draw-list.js";

export type Line2DOptions = {
  color?: Color;
  colorEnd?: Color;
  /** Stroke width in canvas pixels (`widthMode: "screen"`) or world2d units. */
  width?: number;
  widthMode?: "screen" | "world";
  joint?: LineJoint;
  /** Defaults to `world2d`; see `camera-2d.ts`. */
  space?: Space2D;
  layer?: LayerMask;
};

/** `arrow` options: the line style plus the head size and half-angle. */
export type Arrow2DOptions = Line2DOptions & {
  /** Head length in `world2d` units; defaults to a quarter of the shaft, clamped to 6..14. */
  headLength?: number;
  /** Half-angle of the head in radians; defaults to 30 degrees. */
  headAngle?: number;
};

/** `curve` options: the line style plus sampling tolerance and placement. */
export type Curve2DOptions = Line2DOptions & {
  /** Approximate segment length in `world2d` units; smaller values subdivide each cubic further. */
  readonly tolerance?: number;
  readonly transform?: CurveTransform2D;
};

/** `grid` options: the 3D grid parameters in the XY plane, plus the line style. */
export type Grid2DOptions = Line2DOptions & {
  /** Anticlockwise rotation around the grid centre, in radians. */
  rotation?: number;
  /** Skew angles whose tangents shift the opposite family of lines. */
  skew?: readonly [number, number];
  /** Keep the x-axis or y-axis boundary lines (the 2D counterpart of 3D's x/z edges). */
  outer?: "none" | "x" | "y" | "xy";
};

export type Point2DOptions = {
  color?: Color;
  size?: number;
  sizeMode?: "screen" | "world";
  round?: boolean;
  space?: Space2D;
  layer?: LayerMask;
};

/** Every filled/stroked 2D shape the layer can draw. */
export type Shape2DKind =
  | "rect"
  | "rounded-rect"
  | "circle"
  | "ellipse"
  | "arc"
  | "annulus"
  | "capsule"
  | "polygon"
  | "triangle"
  | "rhombus"
  | "sector"
  | "segment";

export type Shape2DOptions = {
  color?: Color;
  /** Rotation in radians, anticlockwise in `world2d` and screen-clockwise in `screen`. */
  rotation?: number;
  /** Outline width in canvas pixels; the `<shape>` and `<shape>_d` variants read it. */
  strokeWidth?: number;
  /** Start angle of `arc`/`sector`/`segment` in radians. Defaults to `0`, the +x axis. */
  startAngle?: number;
  /** Sweep of `arc`/`sector`/`segment` in radians. Defaults to a full turn; negative turns the other way. */
  sweep?: number;
  space?: Space2D;
  layer?: LayerMask;
};

export type Shape2DCommand = {
  readonly kind: "shape2d";
  readonly shape: Shape2DKind;
  readonly center: Vec2;
  /**
   * Primary half-size, meaning depends on `shape`: box half extents, ellipse radii, circumradius,
   * capsule `[radius, halfLength]`, annulus `[outer, inner]`, rhombus half diagonals, or a
   * triangle's first vertex offset from the centroid.
   */
  readonly size: Vec2;
  /** Second/third triangle vertices relative to the centroid; zero for every other shape. */
  readonly vertexB: Vec2;
  readonly vertexC: Vec2;
  readonly cornerRadius: number;
  /** Outline width in canvas pixels. */
  readonly thickness: number;
  readonly filled: boolean;
  /**
   * Dashed-outline pattern `[visible, gap, phase]` in shape-space units for the `_d` variants;
   * absent for solid shapes and solid outlines.
   */
  readonly dash?: readonly [number, number, number];
  readonly rotation: number;
  readonly startAngle: number;
  readonly sweep: number;
  /** Vertex count of `polygon`; zero for every other shape. */
  readonly sides: number;
  readonly color: Color;
  readonly space: Space2D;
  readonly layer: LayerMask;
};

export type Point2DCommand = {
  readonly kind: "point2d";
  readonly position: Vec2;
  readonly color: Color;
  readonly size: number;
  readonly sizeMode: "screen" | "world";
  readonly round?: boolean;
  readonly space: Space2D;
  readonly layer: LayerMask;
};

export type Line2DCommand = {
  readonly kind: "line2d";
  readonly start: Vec2;
  readonly end: Vec2;
  readonly color: Color;
  readonly colorEnd: Color;
  readonly width: number;
  readonly widthMode: "screen" | "world";
  readonly dash?: readonly [number, number, number];
  readonly joint?: LineJoint;
  readonly space: Space2D;
  readonly layer: LayerMask;
};

/**
 * One path vertex of a `lineStrip`/`polyline`, the 2D twin of `JointCommand`. The renderer
 * rebuilds the round/bevel/miter wedge from `previous`, `center` and `next`, exactly as the 3D
 * joint pipeline does.
 */
export type Joint2DCommand = {
  readonly kind: "joint2d";
  readonly previous: Vec2;
  readonly center: Vec2;
  readonly next: Vec2;
  readonly color: Color;
  readonly width: number;
  readonly widthMode: "screen" | "world";
  readonly dash?: readonly [number, number, number];
  readonly joint: RenderedJoint;
  readonly space: Space2D;
  readonly layer: LayerMask;
};

/** Everything a `FrameDrawList2D` can emit. */
export type FrameCommand2D = Point2DCommand | Line2DCommand | Joint2DCommand | Shape2DCommand;

/**
 * Which of the `<shape>` / `<shape>_s` / `<shape>_d` trio a command came from. The method name
 * decides fill versus stroke, so a filled command never carries a dash pattern.
 */
type Shape2DVariant = {
  readonly filled: boolean;
  readonly dash?: readonly [number, number, number];
};

const WIRE: Shape2DVariant = { filled: false };
const SOLID: Shape2DVariant = { filled: true };

/** Shape parameters that differ per primitive; everything else lives in `Shape2DCommand`. */
type Shape2DFields = {
  size?: Vec2;
  vertexB?: Vec2;
  vertexC?: Vec2;
  cornerRadius?: number;
  startAngle?: number;
  sweep?: number;
  sides?: number;
};

/** The 3D drawList's resolved point/line styles, reused so 2D and 3D defaults cannot drift. */
export type FrameDrawList2DStyleDefaults = {
  readonly point: ResolvedPointDefaults;
  readonly line: ResolvedLineDefaults;
};

const DEFAULT_2D_COLOR: Color = [1, 1, 1, 1];
const DEFAULT_2D_LAYER = 1;
/** An unfilled shape still has to be visible, so a stroke defaults to one pixel. */
const DEFAULT_2D_STROKE_WIDTH = 1;
const TAU = Math.PI * 2;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
  return value;
}

function positive(value: number, name: string): number {
  const resolved = finite(value, name);
  if (resolved <= 0) throw new RangeError(`${name} must be greater than zero`);
  return resolved;
}

function nonNegative(value: number, name: string): number {
  const resolved = finite(value, name);
  if (resolved < 0) throw new RangeError(`${name} must not be negative`);
  return resolved;
}

function positiveSize(value: Vec2, name: string): Vec2 {
  const resolved = vec2(value, name);
  if (resolved[0] <= 0 || resolved[1] <= 0) throw new RangeError(`${name} values must be greater than zero`);
  return resolved;
}

/** Start angle and sweep of the angle-parameterised shapes, with the same defaults and bounds. */
function angleRange(options: Shape2DOptions): { startAngle: number; sweep: number } {
  const startAngle = finite(options.startAngle ?? 0, "startAngle");
  const sweep = finite(options.sweep ?? TAU, "sweep");
  if (sweep === 0 || Math.abs(sweep) > TAU) {
    throw new RangeError("sweep must be a non-zero angle of at most one full turn");
  }
  return { startAngle, sweep };
}

/** `[visible, gap, phase]` of a dashed outline; a dash needs a real gap to break the stroke. */
function dashValue(value: readonly [number, number, number]): readonly [number, number, number] {
  const visible = finite(value[0], "dash visible");
  const gap = finite(value[1], "dash gap");
  const phase = finite(value[2], "dash phase");
  if (visible <= 0) throw new RangeError("dash visible must be greater than zero");
  if (gap <= 0) throw new RangeError("dash gap must be greater than zero");
  return [visible, gap, phase];
}

/** A dashed outline: the pattern is validated once, here. */
function dashed(dash: readonly [number, number, number]): Shape2DVariant {
  return { filled: false, dash: dashValue(dash) };
}

function vec2(value: Vec2, name: string): Vec2 {
  if (value.length !== 2) {
    throw new RangeError(`${name} must contain two values`);
  }
  return [finite(value[0], `${name}[0]`), finite(value[1], `${name}[1]`)];
}

function colorValue(value: Color, name: string): Color {
  if (value.length !== 4) {
    throw new RangeError(`${name} must contain four values`);
  }
  return [
    finite(value[0], `${name}[0]`),
    finite(value[1], `${name}[1]`),
    finite(value[2], `${name}[2]`),
    finite(value[3], `${name}[3]`),
  ];
}

function color(value: Color | undefined): Color {
  return value === undefined ? DEFAULT_2D_COLOR : colorValue(value, "color");
}

function layer(value: number | undefined): LayerMask {
  const resolved = value ?? DEFAULT_2D_LAYER;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new RangeError("layer must be a non-negative integer bitmask");
  }
  return resolved;
}

function sizeModeValue(value: string, name: string): "screen" | "world" {
  if (value !== "screen" && value !== "world") {
    throw new RangeError(`${name} must be "screen" or "world"`);
  }
  return value;
}

function jointValue(value: string, name: string): LineJoint {
  if (value !== "none" && value !== "round" && value !== "bevel" && value !== "miter") {
    throw new RangeError(`${name} must be "none", "round", "bevel", or "miter"`);
  }
  return value;
}

/** Resolves the space, defaulting to `world2d` so a command only pays for a camera when it wants one. */
function spaceValue(value: string | undefined): Space2D {
  if (value === undefined) return "world2d";
  if (value !== "world2d" && value !== "screen") {
    throw new RangeError('space must be "world2d" or "screen"');
  }
  return value;
}

/**
 * Records 2D primitives for one frame. Obtained through `FrameDrawList.d2`; it seals with its
 * parent, so a caller cannot keep drawing into a finished frame.
 */
export class FrameDrawList2D {
  readonly #points: Point2DCommand[] = [];
  readonly #lines: Line2DCommand[] = [];
  readonly #joints: Joint2DCommand[] = [];
  readonly #shapes: Shape2DCommand[] = [];
  readonly #defaults: FrameDrawList2DStyleDefaults;
  readonly #assertOpen: () => void;

  constructor(defaults: FrameDrawList2DStyleDefaults, assertOpen: () => void) {
    this.#defaults = defaults;
    this.#assertOpen = assertOpen;
  }

  point(position: Vec2, options: Point2DOptions = {}): this {
    this.#assertOpen();
    const size = finite(options.size ?? this.#defaults.point.size ?? 1, "size");
    if (size <= 0) throw new RangeError("size must be greater than zero");
    this.#points.push({
      kind: "point2d",
      position: vec2(position, "position"),
      color: color(options.color ?? this.#defaults.point.color),
      size,
      sizeMode: options.sizeMode ?? this.#defaults.point.sizeMode ?? "screen",
      space: spaceValue(options.space),
      layer: layer(options.layer ?? this.#defaults.point.layer),
      ...(options.round === undefined ? {} : { round: options.round }),
    });
    return this;
  }

  /** Straight segment (the 3D `draw_line`). */
  line(start: Vec2, end: Vec2, options: Line2DOptions = {}): this {
    return this.#line(start, end, options, undefined);
  }

  /** Straight segment dashed along its length (the 3D `draw_line_d`). */
  line_d(
    start: Vec2,
    end: Vec2,
    dash: readonly [number, number, number],
    options: Line2DOptions = {},
  ): this {
    return this.#line(start, end, options, dashValue(dash));
  }

  /**
   * Arrow with an open V head, the 2D twin of `FrameDrawList.arrow`: the shaft runs to `origin +
   * direction`, and the head is two lines back from the tip.
   */
  arrow(origin: Vec2, direction: Vec2, options: Arrow2DOptions = {}): this {
    const { end, left, right } = this.#arrowParts(origin, direction, options);
    // The open head is an outline, so the shaft runs all the way to the tip and the two head lines
    // sit on top of it.
    this.line(origin, end, options);
    this.line(end, left, options);
    this.line(end, right, options);
    return this;
  }

  /** Arrow with a filled triangular head (`arrow` keeps the open line head). */
  arrow_s(origin: Vec2, direction: Vec2, options: Arrow2DOptions = {}): this {
    const { end, base, left, right } = this.#arrowParts(origin, direction, options);
    this.line(origin, base, options);
    this.triangle_s(end, left, right, {
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.space === undefined ? {} : { space: options.space }),
      ...(options.layer === undefined ? {} : { layer: options.layer }),
    });
    return this;
  }

  /** Arrow whose shaft is dashed; the two head lines stay solid like the filled head. */
  arrow_d(
    origin: Vec2,
    direction: Vec2,
    dash: readonly [number, number, number],
    options: Arrow2DOptions = {},
  ): this {
    const { end, left, right } = this.#arrowParts(origin, direction, options);
    this.line_d(origin, end, dashValue(dash), options);
    // Only the shaft dashes: the head outline stays solid so the tip keeps its shape, matching the
    // filled head of `arrow_s_d`.
    this.line(end, left, options);
    this.line(end, right, options);
    return this;
  }

  /** Arrow with a filled head and a dashed shaft. */
  arrow_s_d(
    origin: Vec2,
    direction: Vec2,
    dash: readonly [number, number, number],
    options: Arrow2DOptions = {},
  ): this {
    const { end, base, left, right } = this.#arrowParts(origin, direction, options);
    this.line_d(origin, base, dashValue(dash), options);
    this.triangle_s(end, left, right, {
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.space === undefined ? {} : { space: options.space }),
      ...(options.layer === undefined ? {} : { layer: options.layer }),
    });
    return this;
  }

  #arrowParts(
    origin: Vec2,
    direction: Vec2,
    options: Arrow2DOptions,
  ): { end: Vec2; base: Vec2; left: Vec2; right: Vec2; back: number } {
    const from = vec2(origin, "origin");
    const delta = vec2(direction, "direction");
    const length = Math.hypot(delta[0], delta[1]);
    const end: Vec2 = [from[0] + delta[0], from[1] + delta[1]];
    const unit: Vec2 = length > 0 ? [delta[0] / length, delta[1] / length] : [1, 0];
    const headLength = finite(
      options.headLength ?? Math.min(14, Math.max(6, length * 0.25)),
      "headLength",
    );
    const headAngle = finite(options.headAngle ?? Math.PI / 6, "headAngle");
    const back = Math.cos(headAngle) * headLength;
    const spread = Math.sin(headAngle) * headLength;
    const side: Vec2 = [-unit[1], unit[0]];
    return {
      end,
      base: [end[0] - unit[0] * back, end[1] - unit[1] * back],
      left: [end[0] - unit[0] * back + side[0] * spread, end[1] - unit[1] * back + side[1] * spread],
      right: [end[0] - unit[0] * back - side[0] * spread, end[1] - unit[1] * back - side[1] * spread],
      back,
    };
  }

  ray(origin: Vec2, direction: Vec2, options: Line2DOptions = {}): this {
    return this.#line(origin, [origin[0] + direction[0], origin[1] + direction[1]], options, undefined);
  }

  /** Ray dashed along its length. */
  ray_d(
    origin: Vec2,
    direction: Vec2,
    dash: readonly [number, number, number],
    options: Line2DOptions = {},
  ): this {
    return this.#line(
      origin,
      [origin[0] + direction[0], origin[1] + direction[1]],
      options,
      dashValue(dash),
    );
  }

  #line(
    start: Vec2,
    end: Vec2,
    options: Line2DOptions,
    dashArgument: readonly [number, number, number] | undefined,
  ): this {
    this.#assertOpen();
    const resolvedStart = vec2(start, "start");
    const resolvedEnd = vec2(end, "end");
    if (resolvedStart[0] === resolvedEnd[0] && resolvedStart[1] === resolvedEnd[1]) {
      return this;
    }
    const width = finite(options.width ?? this.#defaults.line.width ?? 1, "width");
    if (width <= 0) throw new RangeError("width must be greater than zero");
    const dash = dashArgument ?? this.#defaults.line.dash;
    const joint = options.joint ?? this.#defaults.line.joint;
    this.#lines.push({
      kind: "line2d",
      start: resolvedStart,
      end: resolvedEnd,
      color: color(options.color ?? this.#defaults.line.color),
      colorEnd: color(options.colorEnd ?? options.color ?? this.#defaults.line.colorEnd ?? this.#defaults.line.color),
      width,
      widthMode: options.widthMode ?? this.#defaults.line.widthMode ?? "screen",
      space: spaceValue(options.space),
      layer: layer(options.layer ?? this.#defaults.line.layer),
      ...(dash === undefined ? {} : { dash }),
      ...(joint === undefined ? {} : { joint }),
    });
    return this;
  }

  /**
   * Path of segments, the 2D twin of `FrameDrawList.lineStrip`. Dash distance accumulates over
   * the whole path and an open strip joins only its interior vertices, matching the 3D layer.
   */
  lineStrip(points: readonly Vec2[], options: Line2DOptions = {}, closed = false): this {
    return this.#strip(points, options, undefined, closed);
  }

  /** Open strip dashed along its length. */
  lineStrip_d(
    points: readonly Vec2[],
    dash: readonly [number, number, number],
    options: Line2DOptions = {},
    closed = false,
  ): this {
    return this.#strip(points, options, dashValue(dash), closed);
  }

  /** Closed strip: the last point joins the first (the 3D `draw_line_loop`). */
  lineLoop(points: readonly Vec2[], options: Line2DOptions = {}): this {
    return this.#strip(points, options, undefined, true);
  }

  /** Closed strip dashed along its length. */
  lineLoop_d(
    points: readonly Vec2[],
    dash: readonly [number, number, number],
    options: Line2DOptions = {},
  ): this {
    return this.#strip(points, options, dashValue(dash), true);
  }

  #strip(
    points: readonly Vec2[],
    options: Line2DOptions,
    dash: readonly [number, number, number] | undefined,
    closed: boolean,
  ): this {
    this.#assertOpen();
    const vertexDistances: number[] = [0];
    let traveled = 0;
    const segment = (a: Vec2, b: Vec2): void => {
      this.#line(
        a,
        b,
        options,
        dash === undefined ? undefined : [dash[0], dash[1], dash[2] + traveled],
      );
      traveled += Math.hypot(b[0] - a[0], b[1] - a[1]);
      vertexDistances.push(traveled);
    };
    for (let i = 0; i + 1 < points.length; i++) segment(points[i]!, points[i + 1]!);
    if (closed && points.length > 1) segment(points[points.length - 1]!, points[0]!);
    const joint = options.joint ?? this.#defaults.line.joint;
    if (joint === "round" || joint === "bevel" || joint === "miter") {
      const count = points.length;
      const first = closed ? 0 : 1;
      const last = closed ? (count > 2 ? count : 0) : count - 1;
      for (let i = first; i < last; i++) {
        this.#jointCommand(
          points[(i - 1 + count) % count]!,
          points[i]!,
          points[(i + 1) % count]!,
          joint,
          options,
          dash,
          vertexDistances[i]!,
        );
      }
    }
    return this;
  }

  polyline(points: readonly Vec2[], options: Line2DOptions = {}, closed = false): this {
    return this.lineStrip(points, options, closed);
  }

  polyline_d(
    points: readonly Vec2[],
    dash: readonly [number, number, number],
    options: Line2DOptions = {},
    closed = false,
  ): this {
    return this.lineStrip_d(points, dash, options, closed);
  }

  /**
   * Cubic curve sampled into a polyline, the 2D twin of `FrameDrawList.curve`. The curve's own
   * `closed` flag decides whether the last point joins the first.
   */
  curve(curve: Curve2D, options: Curve2DOptions = {}): this {
    const { tolerance, transform, ...lineOptions } = options;
    return this.#strip(
      sampleCurve2D(curve, tolerance, transform),
      lineOptions,
      undefined,
      curve.closed ?? false,
    );
  }

  /** Cubic curve sampled into a dashed polyline. */
  curve_d(
    curve: Curve2D,
    dash: readonly [number, number, number],
    options: Curve2DOptions = {},
  ): this {
    const { tolerance, transform, ...lineOptions } = options;
    return this.#strip(
      sampleCurve2D(curve, tolerance, transform),
      lineOptions,
      dashValue(dash),
      curve.closed ?? false,
    );
  }

  /**
   * Axis-aligned grid of lines, the 2D twin of `FrameDrawList.grid` and bevy's `grid_2d`: `cells`
   * are the cells per axis, so the drawn line count is one more on each side.
   */
  grid(center: Vec2, cells: readonly [number, number], spacing: Vec2, options: Grid2DOptions = {}): this {
    return this.#grid(center, cells, spacing, options, undefined);
  }

  /** Grid whose lines are dashed along their length. */
  grid_d(
    center: Vec2,
    cells: readonly [number, number],
    spacing: Vec2,
    dash: readonly [number, number, number],
    options: Grid2DOptions = {},
  ): this {
    return this.#grid(center, cells, spacing, options, dashValue(dash));
  }

  #grid(
    center: Vec2,
    cells: readonly [number, number],
    spacing: Vec2,
    options: Grid2DOptions,
    dash: readonly [number, number, number] | undefined,
  ): this {
    this.#assertOpen();
    const { rotation = 0, skew = [0, 0], outer = "none", ...lineOptions } = options;
    const [columns, rows] = cells;
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
      throw new RangeError("grid cells must be positive integers");
    }
    const [stepX, stepY] = positiveSize(spacing, "spacing");
    const [centerX, centerY] = vec2(center, "center");
    const angle = finite(rotation, "rotation");
    const [skewX, skewY] = skew;
    finite(skewX, "skew x");
    finite(skewY, "skew y");
    if (outer !== "none" && outer !== "x" && outer !== "y" && outer !== "xy") {
      throw new RangeError('grid outer must be "none", "x", "y" or "xy"');
    }
    for (const [a, b] of gridLines2D([columns, rows], [stepX, stepY], [centerX, centerY], angle, [skewX, skewY], outer)) {
      this.#line(a, b, lineOptions, dash);
    }
    return this;
  }

  /**
   * Rectangle with the given full width and height, stroked by default like the 3D `draw_rect`.
   * `rect_s` fills it and `rect_d` dashes the outline.
   */
  rect(center: Vec2, size: Vec2, options: Shape2DOptions = {}): this {
    this.#rectVariant(center, size, options, WIRE);
    return this;
  }

  /** Solid rectangle (bevy `Rectangle`, the 3D `draw_rect_s`). */
  rect_s(center: Vec2, size: Vec2, options: Shape2DOptions = {}): this {
    this.#rectVariant(center, size, options, SOLID);
    return this;
  }

  /**
   * Rectangle outline dashed along its perimeter (the 3D `draw_rect_d`). `dash` is
   * `[visible, gap, phase]` in shape-space units, the same triple the line layer takes.
   */
  rect_d(
    center: Vec2,
    size: Vec2,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#rectVariant(center, size, options, dashed(dash));
    return this;
  }

  #rectVariant(
    center: Vec2,
    size: Vec2,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    const full = positiveSize(size, "size");
    this.#pushShape("rect", center, { size: [full[0] / 2, full[1] / 2] }, options, variant);
  }

  /** Rounded rectangle outline; the shader clamps the radius to half the shorter side. */
  rect_r(center: Vec2, size: Vec2, cornerRadius: number, options: Shape2DOptions = {}): this {
    this.#rectRVariant(center, size, cornerRadius, options, WIRE);
    return this;
  }

  /** Solid rounded rectangle (bevy `RoundedRectangle`, the 3D `_s` counterpart). */
  rect_r_s(center: Vec2, size: Vec2, cornerRadius: number, options: Shape2DOptions = {}): this {
    this.#rectRVariant(center, size, cornerRadius, options, SOLID);
    return this;
  }

  /** Rounded rectangle outline dashed along its perimeter. */
  rect_r_d(
    center: Vec2,
    size: Vec2,
    cornerRadius: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#rectRVariant(center, size, cornerRadius, options, dashed(dash));
    return this;
  }

  #rectRVariant(
    center: Vec2,
    size: Vec2,
    cornerRadius: number,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    const full = positiveSize(size, "size");
    this.#pushShape(
      "rounded-rect",
      center,
      { size: [full[0] / 2, full[1] / 2], cornerRadius: nonNegative(cornerRadius, "cornerRadius") },
      options,
      variant,
    );
  }

  /** Disc outline with the given radius (bevy `Circle`, the 3D `draw_circle`). */
  circle(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#circleVariant(center, radius, options, WIRE);
    return this;
  }

  /** Solid disc (bevy `Circle::new`, the 3D `draw_circle_s`). */
  circle_s(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#circleVariant(center, radius, options, SOLID);
    return this;
  }

  /** Dashed circle outline. */
  circle_d(
    center: Vec2,
    radius: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#circleVariant(center, radius, options, dashed(dash));
    return this;
  }

  #circleVariant(center: Vec2, radius: number, options: Shape2DOptions, variant: Shape2DVariant): void {
    const r = positive(radius, "radius");
    this.#pushShape("circle", center, { size: [r, r] }, options, variant);
  }

  /** Ellipse outline with independent x and y radii (bevy `Ellipse`). */
  ellipse(center: Vec2, radii: Vec2, options: Shape2DOptions = {}): this {
    this.#ellipseVariant(center, radii, options, WIRE);
    return this;
  }

  /** Solid ellipse (bevy `Ellipse::new`, the 3D `_s` counterpart). */
  ellipse_s(center: Vec2, radii: Vec2, options: Shape2DOptions = {}): this {
    this.#ellipseVariant(center, radii, options, SOLID);
    return this;
  }

  /** Dashed ellipse outline. */
  ellipse_d(
    center: Vec2,
    radii: Vec2,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#ellipseVariant(center, radii, options, dashed(dash));
    return this;
  }

  #ellipseVariant(center: Vec2, radii: Vec2, options: Shape2DOptions, variant: Shape2DVariant): void {
    const r = positiveSize(radii, "radii");
    this.#pushShape("ellipse", center, { size: r }, options, variant);
  }

  /**
   * Circular arc from `startAngle` through `sweep`. It is a curve without an interior, so it is
   * only ever stroked; `arc_s` would have nothing to fill.
   */
  arc(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#arcVariant(center, radius, options, WIRE);
    return this;
  }

  /** Arc outline dashed along its sweep. */
  arc_d(
    center: Vec2,
    radius: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#arcVariant(center, radius, options, dashed(dash));
    return this;
  }

  #arcVariant(center: Vec2, radius: number, options: Shape2DOptions, variant: Shape2DVariant): void {
    const r = positive(radius, "radius");
    const angles = angleRange(options);
    this.#pushShape("arc", center, { size: [r, r], ...angles }, options, variant);
  }

  /** Ring outline between two radii (bevy `Annulus`). */
  annulus(center: Vec2, innerRadius: number, outerRadius: number, options: Shape2DOptions = {}): this {
    this.#annulusVariant(center, innerRadius, outerRadius, options, WIRE);
    return this;
  }

  /** Filled ring band (bevy `Annulus::new`, the 3D `_s` counterpart). */
  annulus_s(center: Vec2, innerRadius: number, outerRadius: number, options: Shape2DOptions = {}): this {
    this.#annulusVariant(center, innerRadius, outerRadius, options, SOLID);
    return this;
  }

  /** Dashed annulus outline; both boundaries are stroked. */
  annulus_d(
    center: Vec2,
    innerRadius: number,
    outerRadius: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#annulusVariant(center, innerRadius, outerRadius, options, dashed(dash));
    return this;
  }

  #annulusVariant(
    center: Vec2,
    innerRadius: number,
    outerRadius: number,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    const inner = nonNegative(innerRadius, "innerRadius");
    const outer = positive(outerRadius, "outerRadius");
    if (inner >= outer) throw new RangeError("innerRadius must be smaller than outerRadius");
    this.#pushShape("annulus", center, { size: [outer, inner] }, options, variant);
  }

  /** Capsule outline whose straight section is `length` long along y (bevy `Capsule2d`). */
  capsule(center: Vec2, radius: number, length: number, options: Shape2DOptions = {}): this {
    this.#capsuleVariant(center, radius, length, options, WIRE);
    return this;
  }

  /** Solid capsule (bevy `Capsule2d::new`, the 3D `_s` counterpart). */
  capsule_s(center: Vec2, radius: number, length: number, options: Shape2DOptions = {}): this {
    this.#capsuleVariant(center, radius, length, options, SOLID);
    return this;
  }

  /** Dashed capsule outline. */
  capsule_d(
    center: Vec2,
    radius: number,
    length: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#capsuleVariant(center, radius, length, options, dashed(dash));
    return this;
  }

  #capsuleVariant(
    center: Vec2,
    radius: number,
    length: number,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    const r = positive(radius, "radius");
    const straight = nonNegative(length, "length");
    this.#pushShape("capsule", center, { size: [r, straight / 2] }, options, variant);
  }

  /** Regular polygon outline with a vertex on the +x axis (bevy `RegularPolygon`). */
  polygon(center: Vec2, circumradius: number, sides: number, options: Shape2DOptions = {}): this {
    this.#polygonVariant(center, circumradius, sides, options, WIRE);
    return this;
  }

  /** Solid regular polygon (bevy `RegularPolygon::new`, the 3D `_s` counterpart). */
  polygon_s(center: Vec2, circumradius: number, sides: number, options: Shape2DOptions = {}): this {
    this.#polygonVariant(center, circumradius, sides, options, SOLID);
    return this;
  }

  /** Dashed regular polygon outline. */
  polygon_d(
    center: Vec2,
    circumradius: number,
    sides: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#polygonVariant(center, circumradius, sides, options, dashed(dash));
    return this;
  }

  #polygonVariant(
    center: Vec2,
    circumradius: number,
    sides: number,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    const r = positive(circumradius, "circumradius");
    if (!Number.isInteger(sides) || sides < 3) throw new RangeError("sides must be an integer of at least 3");
    this.#pushShape("polygon", center, { size: [r, r], sides }, options, variant);
  }

  /** Triangle outline (bevy `Triangle2d`); `rotation` turns about its centroid. */
  triangle(a: Vec2, b: Vec2, c: Vec2, options: Shape2DOptions = {}): this {
    this.#triangleVariant(a, b, c, options, WIRE);
    return this;
  }

  /** Solid triangle (bevy `Triangle2d::new`, the 3D `_s` counterpart). */
  triangle_s(a: Vec2, b: Vec2, c: Vec2, options: Shape2DOptions = {}): this {
    this.#triangleVariant(a, b, c, options, SOLID);
    return this;
  }

  /** Dashed triangle outline. */
  triangle_d(
    a: Vec2,
    b: Vec2,
    c: Vec2,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#triangleVariant(a, b, c, options, dashed(dash));
    return this;
  }

  #triangleVariant(
    a: Vec2,
    b: Vec2,
    c: Vec2,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    const p0 = vec2(a, "a");
    const p1 = vec2(b, "b");
    const p2 = vec2(c, "c");
    const center: Vec2 = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3];
    this.#pushShape(
      "triangle",
      center,
      {
        size: [p0[0] - center[0], p0[1] - center[1]],
        vertexB: [p1[0] - center[0], p1[1] - center[1]],
        vertexC: [p2[0] - center[0], p2[1] - center[1]],
      },
      options,
      variant,
    );
  }

  /** Diamond outline with the given full diagonals (bevy `Rhombus`). */
  rhombus(center: Vec2, diagonals: Vec2, options: Shape2DOptions = {}): this {
    this.#rhombusVariant(center, diagonals, options, WIRE);
    return this;
  }

  /** Solid diamond (bevy `Rhombus::new`, the 3D `_s` counterpart). */
  rhombus_s(center: Vec2, diagonals: Vec2, options: Shape2DOptions = {}): this {
    this.#rhombusVariant(center, diagonals, options, SOLID);
    return this;
  }

  /** Dashed diamond outline. */
  rhombus_d(
    center: Vec2,
    diagonals: Vec2,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#rhombusVariant(center, diagonals, options, dashed(dash));
    return this;
  }

  #rhombusVariant(center: Vec2, diagonals: Vec2, options: Shape2DOptions, variant: Shape2DVariant): void {
    const d = positiveSize(diagonals, "diagonals");
    this.#pushShape("rhombus", center, { size: [d[0] / 2, d[1] / 2] }, options, variant);
  }

  /** Disc sector outline from `startAngle` through `sweep` (bevy `CircularSector`). */
  sector(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#sectorVariant(center, radius, options, WIRE);
    return this;
  }

  /** Solid disc sector (bevy `CircularSector`, the 3D `_s` counterpart). */
  sector_s(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#sectorVariant(center, radius, options, SOLID);
    return this;
  }

  /** Dashed sector outline: the arc plus both radii. */
  sector_d(
    center: Vec2,
    radius: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#sectorVariant(center, radius, options, dashed(dash));
    return this;
  }

  #sectorVariant(center: Vec2, radius: number, options: Shape2DOptions, variant: Shape2DVariant): void {
    const r = positive(radius, "radius");
    const angles = angleRange(options);
    this.#pushShape("sector", center, { size: [r, r], ...angles }, options, variant);
  }

  /** Disc segment outline between a chord and its arc (bevy `CircularSegment`). */
  segment(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#segmentVariant(center, radius, options, WIRE);
    return this;
  }

  /** Solid disc segment (bevy `CircularSegment`, the 3D `_s` counterpart). */
  segment_s(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    this.#segmentVariant(center, radius, options, SOLID);
    return this;
  }

  /** Dashed segment outline: the arc plus the chord. */
  segment_d(
    center: Vec2,
    radius: number,
    dash: readonly [number, number, number],
    options: Shape2DOptions = {},
  ): this {
    this.#segmentVariant(center, radius, options, dashed(dash));
    return this;
  }

  #segmentVariant(center: Vec2, radius: number, options: Shape2DOptions, variant: Shape2DVariant): void {
    const r = positive(radius, "radius");
    const angles = angleRange(options);
    this.#pushShape("segment", center, { size: [r, r], ...angles }, options, variant);
  }

  /**
   * One joint instance for a path vertex. Degenerate wedges whose centre coincides with a
   * neighbour are dropped, as in the 3D layer and the reference `emit_joint`.
   */
  #jointCommand(
    previous: Vec2,
    center: Vec2,
    next: Vec2,
    joint: RenderedJoint,
    options: Line2DOptions,
    dash: readonly [number, number, number] | undefined,
    distance: number,
  ): void {
    const resolvedPrevious = vec2(previous, "previous");
    const resolvedCenter = vec2(center, "center");
    const resolvedNext = vec2(next, "next");
    const same = (a: Vec2, b: Vec2): boolean => a[0] === b[0] && a[1] === b[1];
    if (same(resolvedPrevious, resolvedCenter) || same(resolvedCenter, resolvedNext)) return;
    const width = finite(options.width ?? this.#defaults.line.width ?? 1, "width");
    if (width <= 0) throw new RangeError("width must be greater than zero");
    jointValue(joint, "joint");
    this.#joints.push({
      kind: "joint2d",
      previous: resolvedPrevious,
      center: resolvedCenter,
      next: resolvedNext,
      color: color(options.color ?? this.#defaults.line.color),
      width,
      widthMode: options.widthMode ?? this.#defaults.line.widthMode ?? "screen",
      joint,
      space: spaceValue(options.space),
      layer: layer(options.layer ?? this.#defaults.line.layer),
      ...(dash === undefined ? {} : { dash: [dash[0], dash[1], dash[2] + distance] as const }),
    });
  }

  /** One instanced quad per shape is enough because the shader resolves the outline, and the
   * dash variant only needs one extra per-instance pattern. */
  #pushShape(
    shape: Shape2DKind,
    center: Vec2,
    fields: Shape2DFields,
    options: Shape2DOptions,
    variant: Shape2DVariant,
  ): void {
    this.#assertOpen();
    const thickness = positive(options.strokeWidth ?? DEFAULT_2D_STROKE_WIDTH, "strokeWidth");
    const rotation = finite(options.rotation ?? 0, "rotation");
    const cornerRadius = fields.cornerRadius ?? 0;
    if (cornerRadius < 0) throw new RangeError("cornerRadius must not be negative");
    const dash = variant?.dash;
    this.#shapes.push({
      kind: "shape2d",
      shape,
      center: vec2(center, "center"),
      size: fields.size ?? [0, 0],
      vertexB: fields.vertexB ?? [0, 0],
      vertexC: fields.vertexC ?? [0, 0],
      cornerRadius,
      thickness,
      filled: variant.filled,
      rotation,
      startAngle: fields.startAngle ?? 0,
      sweep: fields.sweep ?? 0,
      sides: fields.sides ?? 0,
      color: color(options.color),
      space: spaceValue(options.space),
      layer: layer(options.layer),
      ...(dash === undefined ? {} : { dash }),
    });
  }

  get points(): readonly Point2DCommand[] {
    return this.#points;
  }

  get lines(): readonly Line2DCommand[] {
    return this.#lines;
  }

  get joints(): readonly Joint2DCommand[] {
    return this.#joints;
  }

  get shapes(): readonly Shape2DCommand[] {
    return this.#shapes;
  }
}
