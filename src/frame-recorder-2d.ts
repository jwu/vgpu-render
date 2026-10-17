/**
 * 2D debug-draw commands and their recorder.
 *
 * The 2D layer is the same data flow as the 3D one — `FrameRecorder -> FrameCommand[] -> GPU` —
 * reached through `frame.d2` instead of a second entry point, so a frame has one lifecycle, one
 * layer mask and one set of defaults. The commands are separate types rather than 3D commands
 * with a `space` flag because a 2D point is a `Vec2` and 2D strokes carry no surface normal;
 * keeping them apart stops a 3D-only field from silently meaning something different here.
 *
 * See `camera-2d.ts` for what `world2d` and `screen` mean.
 */

import type { Space2D, Vec2 } from "./camera-2d.js";
import type {
  Color,
  LayerMask,
  LineJoint,
  RenderedJoint,
  ResolvedLineDefaults,
  ResolvedPointDefaults,
} from "./frame-recorder.js";

export type Line2DOptions = {
  color?: Color;
  colorEnd?: Color;
  /** Stroke width in canvas pixels (`widthMode: "screen"`) or world2d units. */
  width?: number;
  widthMode?: "screen" | "world";
  dash?: readonly [number, number, number];
  joint?: LineJoint;
  /** Defaults to `world2d`; see `camera-2d.ts`. */
  space?: Space2D;
  layer?: LayerMask;
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
  /** Filled by default; `false` strokes the outline with `strokeWidth`. */
  fill?: boolean;
  /** Outline width in canvas pixels; only read when `fill` is false. */
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

/** Everything a `FrameRecorder2D` can emit. */
export type FrameCommand2D = Point2DCommand | Line2DCommand | Joint2DCommand | Shape2DCommand;

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

/** The 3D recorder's resolved point/line styles, reused so 2D and 3D defaults cannot drift. */
export type FrameRecorder2DStyleDefaults = {
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
 * Records 2D primitives for one frame. Obtained through `FrameRecorder.d2`; it seals with its
 * parent, so a caller cannot keep drawing into a finished frame.
 */
export class FrameRecorder2D {
  readonly #points: Point2DCommand[] = [];
  readonly #lines: Line2DCommand[] = [];
  readonly #joints: Joint2DCommand[] = [];
  readonly #shapes: Shape2DCommand[] = [];
  readonly #defaults: FrameRecorder2DStyleDefaults;
  readonly #assertOpen: () => void;

  constructor(defaults: FrameRecorder2DStyleDefaults, assertOpen: () => void) {
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

  line(start: Vec2, end: Vec2, options: Line2DOptions = {}): this {
    this.#assertOpen();
    const resolvedStart = vec2(start, "start");
    const resolvedEnd = vec2(end, "end");
    if (resolvedStart[0] === resolvedEnd[0] && resolvedStart[1] === resolvedEnd[1]) {
      return this;
    }
    const width = finite(options.width ?? this.#defaults.line.width ?? 1, "width");
    if (width <= 0) throw new RangeError("width must be greater than zero");
    const dash = options.dash ?? this.#defaults.line.dash;
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

  ray(origin: Vec2, direction: Vec2, options: Line2DOptions = {}): this {
    return this.line(origin, [origin[0] + direction[0], origin[1] + direction[1]], options);
  }

  /**
   * Path of segments, the 2D twin of `FrameRecorder.lineStrip`. Dash distance accumulates over
   * the whole path and an open strip joins only its interior vertices, matching the 3D layer.
   */
  lineStrip(points: readonly Vec2[], options: Line2DOptions = {}, closed = false): this {
    this.#assertOpen();
    const dash = options.dash ?? this.#defaults.line.dash;
    const vertexDistances: number[] = [0];
    let traveled = 0;
    const segment = (a: Vec2, b: Vec2): void => {
      this.line(a, b, {
        ...options,
        ...(dash === undefined ? {} : { dash: [dash[0], dash[1], dash[2] + traveled] as const }),
      });
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

  /**
   * Axis-aligned grid of lines, the 2D twin of `FrameRecorder.grid` and bevy's `grid_2d`: `cells`
   * are the cells per axis, so the drawn line count is one more on each side.
   */
  grid(center: Vec2, cells: readonly [number, number], spacing: Vec2, options: Line2DOptions = {}): this {
    this.#assertOpen();
    const [columns, rows] = cells;
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
      throw new RangeError("grid cells must be positive integers");
    }
    const [stepX, stepY] = positiveSize(spacing, "spacing");
    const [centerX, centerY] = vec2(center, "center");
    const halfWidth = (columns * stepX) / 2;
    const halfHeight = (rows * stepY) / 2;
    for (let column = 0; column <= columns; column++) {
      const x = centerX - halfWidth + column * stepX;
      this.line([x, centerY - halfHeight], [x, centerY + halfHeight], options);
    }
    for (let row = 0; row <= rows; row++) {
      const y = centerY - halfHeight + row * stepY;
      this.line([centerX - halfWidth, y], [centerX + halfWidth, y], options);
    }
    return this;
  }

  /** Rectangle with the given full width and height (bevy `Rectangle::new`). */
  rect(center: Vec2, size: Vec2, options: Shape2DOptions = {}): this {
    const full = positiveSize(size, "size");
    this.#pushShape("rect", center, { size: [full[0] / 2, full[1] / 2] }, options);
    return this;
  }

  /** Rectangle with rounded corners; the shader clamps the radius to half the shorter side. */
  roundedRect(center: Vec2, size: Vec2, cornerRadius: number, options: Shape2DOptions = {}): this {
    const full = positiveSize(size, "size");
    this.#pushShape(
      "rounded-rect",
      center,
      { size: [full[0] / 2, full[1] / 2], cornerRadius: nonNegative(cornerRadius, "cornerRadius") },
      options,
    );
    return this;
  }

  /** Filled disc with the given radius (bevy `Circle::new`). */
  circle(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    const r = positive(radius, "radius");
    this.#pushShape("circle", center, { size: [r, r] }, options);
    return this;
  }

  /** Ellipse with independent x and y radii (bevy `Ellipse::new(x_radius, y_radius)`). */
  ellipse(center: Vec2, radii: Vec2, options: Shape2DOptions = {}): this {
    const r = positiveSize(radii, "radii");
    this.#pushShape("ellipse", center, { size: r }, options);
    return this;
  }

  /**
   * Circular arc from `startAngle` through `sweep`. It is a curve without an interior, so an
   * unfilled arc (the default) strokes it with `strokeWidth` while `fill: true` leaves a hairline.
   */
  arc(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    const r = positive(radius, "radius");
    const angles = angleRange(options);
    this.#pushShape("arc", center, { size: [r, r], ...angles }, options);
    return this;
  }

  /** Ring band between two radii (bevy `Annulus::new(inner_radius, outer_radius)`). */
  annulus(center: Vec2, innerRadius: number, outerRadius: number, options: Shape2DOptions = {}): this {
    const inner = nonNegative(innerRadius, "innerRadius");
    const outer = positive(outerRadius, "outerRadius");
    if (inner >= outer) throw new RangeError("innerRadius must be smaller than outerRadius");
    this.#pushShape("annulus", center, { size: [outer, inner] }, options);
    return this;
  }

  /** Capsule whose straight section is `length` long along y (bevy `Capsule2d::new(radius, length)`). */
  capsule(center: Vec2, radius: number, length: number, options: Shape2DOptions = {}): this {
    const r = positive(radius, "radius");
    const straight = nonNegative(length, "length");
    this.#pushShape("capsule", center, { size: [r, straight / 2] }, options);
    return this;
  }

  /** Regular polygon with a vertex on the +x axis (bevy `RegularPolygon::new(circumradius, sides)`). */
  polygon(center: Vec2, circumradius: number, sides: number, options: Shape2DOptions = {}): this {
    const r = positive(circumradius, "circumradius");
    if (!Number.isInteger(sides) || sides < 3) throw new RangeError("sides must be an integer of at least 3");
    this.#pushShape("polygon", center, { size: [r, r], sides }, options);
    return this;
  }

  /** Arbitrary triangle (bevy `Triangle2d::new(a, b, c)`); `rotation` turns about its centroid. */
  triangle(a: Vec2, b: Vec2, c: Vec2, options: Shape2DOptions = {}): this {
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
    );
    return this;
  }

  /** Diamond with the given full diagonals (bevy `Rhombus::new(horizontal, vertical)`). */
  rhombus(center: Vec2, diagonals: Vec2, options: Shape2DOptions = {}): this {
    const d = positiveSize(diagonals, "diagonals");
    this.#pushShape("rhombus", center, { size: [d[0] / 2, d[1] / 2] }, options);
    return this;
  }

  /** Disc sector from `startAngle` through `sweep` (bevy `CircularSector`). */
  sector(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    const r = positive(radius, "radius");
    const angles = angleRange(options);
    this.#pushShape("sector", center, { size: [r, r], ...angles }, options);
    return this;
  }

  /** Disc region between a chord and its arc (bevy `CircularSegment`). */
  segment(center: Vec2, radius: number, options: Shape2DOptions = {}): this {
    const r = positive(radius, "radius");
    const angles = angleRange(options);
    this.#pushShape("segment", center, { size: [r, r], ...angles }, options);
    return this;
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

  /** Records one shape once its per-shape arguments have been validated. */
  #pushShape(shape: Shape2DKind, center: Vec2, fields: Shape2DFields, options: Shape2DOptions): void {
    this.#assertOpen();
    const thickness = positive(options.strokeWidth ?? DEFAULT_2D_STROKE_WIDTH, "strokeWidth");
    const rotation = finite(options.rotation ?? 0, "rotation");
    const cornerRadius = fields.cornerRadius ?? 0;
    if (cornerRadius < 0) throw new RangeError("cornerRadius must not be negative");
    this.#shapes.push({
      kind: "shape2d",
      shape,
      center: vec2(center, "center"),
      size: fields.size ?? [0, 0],
      vertexB: fields.vertexB ?? [0, 0],
      vertexC: fields.vertexC ?? [0, 0],
      cornerRadius,
      thickness,
      filled: options.fill ?? true,
      rotation,
      startAngle: fields.startAngle ?? 0,
      sweep: fields.sweep ?? 0,
      sides: fields.sides ?? 0,
      color: color(options.color),
      space: spaceValue(options.space),
      layer: layer(options.layer),
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
