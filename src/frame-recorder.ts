import { sampleCurve, type Curve3D, type CurveTransform } from "./curve.js";
import { gridLines } from "./geometry-generators.js";

export type Vec3 = readonly [number, number, number];
export type Color = readonly [number, number, number, number];
export type LayerMask = number;

export type PointOptions = {
  color?: Color;
  size?: number;
  sizeMode?: "screen" | "world";
  round?: boolean;
  layer?: LayerMask;
};

export type LineJoint = "none" | "round" | "bevel" | "miter";
/** Joint kinds the reference renders as geometry (`_is_rendered_line_joint`). */
export type RenderedJoint = Exclude<LineJoint, "none">;

export type LineOptions = {
  color?: Color;
  colorEnd?: Color;
  width?: number;
  widthMode?: "screen" | "world";
  dash?: readonly [number, number, number];
  normal?: Vec3;
  joint?: LineJoint;
  layer?: LayerMask;
};

export type PointCommand = {
  readonly kind: "point";
  readonly position: Vec3;
  readonly color: Color;
  readonly size: number;
  readonly sizeMode: "screen" | "world";
  readonly round?: boolean;
  readonly layer: LayerMask;
};

export type LineCommand = {
  readonly kind: "line";
  readonly start: Vec3;
  readonly end: Vec3;
  readonly color: Color;
  readonly colorEnd: Color;
  readonly width: number;
  readonly widthMode: "screen" | "world";
  readonly dash?: readonly [number, number, number];
  readonly normal?: Vec3;
  readonly joint?: LineJoint;
  readonly layer: LayerMask;
};

/**
 * One path vertex of a `lineStrip`/`lineLoop` that the reference turns into a joint
 * instance (`_emit_joint`). The renderer rebuilds the round/bevel/miter wedge on the GPU
 * from `previous`, `center`, and `next`, so no CPU-side expansion happens here.
 */
export type JointCommand = {
  readonly kind: "joint";
  readonly previous: Vec3;
  readonly center: Vec3;
  readonly next: Vec3;
  readonly color: Color;
  readonly width: number;
  readonly widthMode: "screen" | "world";
  /**
   * Same `[visible, space, offset]` shape as `LineCommand.dash`, with the accumulated
   * path distance of this vertex already folded into `offset` so the wedge keeps the
   * dash phase of the segments that meet it.
   */
  readonly dash?: readonly [number, number, number];
  readonly joint: RenderedJoint;
  readonly layer: LayerMask;
};

export type ArrowOptions = LineOptions & {
  headLength?: number;
  headAngle?: number;
};

export type FrameCommand = PointCommand | LineCommand | JointCommand | TriangleCommand;

export type TriangleCommand = {
  readonly kind: "triangle";
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  readonly color: Color;
  readonly layer: LayerMask;
};

export type MeshOptions = { color?: Color; solid?: boolean; layer?: LayerMask };
export type CurveOptions = LineOptions & { tolerance?: number; transform?: CurveTransform };
export type GridOptions = LineOptions & { rotation?: readonly [number, number, number]; skew?: readonly [number, number]; outer?: "none" | "x" | "z" | "xz" };

export type PointDefaults = {
  color?: Color;
  size?: number;
  sizeMode?: "screen" | "world";
  layer?: LayerMask;
};

export type LineDefaults = {
  color?: Color;
  colorEnd?: Color;
  width?: number;
  widthMode?: "screen" | "world";
  dash?: readonly [number, number, number];
  normal?: Vec3;
  joint?: LineJoint;
  layer?: LayerMask;
};

export type FrameRecorderDefaults = {
  point?: PointDefaults;
  line?: LineDefaults;
};

export const DEFAULT_COLOR: Color = [1, 1, 1, 1];
export const DEFAULT_LAYER = 1;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
  return value;
}

function vec3(value: Vec3, name: string): Vec3 {
  if (value.length !== 3) {
    throw new RangeError(`${name} must contain three values`);
  }
  return [finite(value[0], `${name}[0]`), finite(value[1], `${name}[1]`), finite(value[2], `${name}[2]`)];
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
  return value === undefined ? DEFAULT_COLOR : colorValue(value, "color");
}

function layerValue(value: number, name: string): LayerMask {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer bitmask`);
  }
  return value;
}

function layer(value: number | undefined): LayerMask {
  return value === undefined ? DEFAULT_LAYER : layerValue(value, "layer");
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

export type ResolvedPointDefaults = {
  color: Color | undefined;
  size: number | undefined;
  sizeMode: "screen" | "world" | undefined;
  layer: LayerMask | undefined;
};

export type ResolvedLineDefaults = {
  color: Color | undefined;
  colorEnd: Color | undefined;
  width: number | undefined;
  widthMode: "screen" | "world" | undefined;
  dash: readonly [number, number, number] | undefined;
  normal: Vec3 | undefined;
  joint: LineJoint | undefined;
  layer: LayerMask | undefined;
};

export type ResolvedFrameRecorderDefaults = {
  point: ResolvedPointDefaults;
  line: ResolvedLineDefaults;
};

/** Validates and resolves style defaults so invalid values fail at construction time. */
export function resolveFrameRecorderDefaults(defaults: FrameRecorderDefaults = {}): ResolvedFrameRecorderDefaults {
  const point = defaults.point ?? {};
  const line = defaults.line ?? {};
  const pointSize = point.size === undefined ? undefined : finite(point.size, "default point size");
  if (pointSize !== undefined && pointSize <= 0) {
    throw new RangeError("default point size must be greater than zero");
  }
  const lineWidth = line.width === undefined ? undefined : finite(line.width, "default line width");
  if (lineWidth !== undefined && lineWidth <= 0) {
    throw new RangeError("default line width must be greater than zero");
  }
  return {
    point: {
      color: point.color === undefined ? undefined : colorValue(point.color, "default point color"),
      size: pointSize,
      sizeMode: point.sizeMode === undefined ? undefined : sizeModeValue(point.sizeMode, "default point sizeMode"),
      layer: point.layer === undefined ? undefined : layerValue(point.layer, "default point layer"),
    },
    line: {
      color: line.color === undefined ? undefined : colorValue(line.color, "default line color"),
      colorEnd: line.colorEnd === undefined ? undefined : colorValue(line.colorEnd, "default line colorEnd"),
      width: lineWidth,
      widthMode: line.widthMode === undefined ? undefined : sizeModeValue(line.widthMode, "default line widthMode"),
      dash: line.dash,
      normal: line.normal === undefined ? undefined : vec3(line.normal, "default line normal"),
      joint: line.joint === undefined ? undefined : jointValue(line.joint, "default line joint"),
      layer: line.layer === undefined ? undefined : layerValue(line.layer, "default line layer"),
    },
  };
}

export class FrameRecorder {
  readonly #points: PointCommand[] = [];
  readonly #lines: LineCommand[] = [];
  readonly #joints: JointCommand[] = [];
  readonly #triangles: TriangleCommand[] = [];
  readonly #defaults: ResolvedFrameRecorderDefaults;
  #sealed = false;

  constructor(defaults: FrameRecorderDefaults = {}) {
    this.#defaults = resolveFrameRecorderDefaults(defaults);
  }

  point(position: Vec3, options: PointOptions = {}): this {
    this.assertOpen();
    const size = finite(options.size ?? this.#defaults.point.size ?? 1, "size");
    if (size <= 0) throw new RangeError("size must be greater than zero");
    this.#points.push({
      kind: "point",
      position: vec3(position, "position"),
      color: color(options.color ?? this.#defaults.point.color),
      size,
      sizeMode: options.sizeMode ?? this.#defaults.point.sizeMode ?? "screen",
      layer: layer(options.layer ?? this.#defaults.point.layer),
      ...(options.round === undefined ? {} : { round: options.round }),
    });
    return this;
  }

  line(start: Vec3, end: Vec3, options: LineOptions = {}): this {
    this.assertOpen();
    const resolvedStart = vec3(start, "start");
    const resolvedEnd = vec3(end, "end");
    if (resolvedStart.every((value, index) => value === resolvedEnd[index])) {
      return this;
    }
    const width = finite(options.width ?? this.#defaults.line.width ?? 1, "width");
    if (width <= 0) throw new RangeError("width must be greater than zero");
    const dash = options.dash ?? this.#defaults.line.dash;
    const normal = options.normal ?? this.#defaults.line.normal;
    const joint = options.joint ?? this.#defaults.line.joint;
    const command: LineCommand = {
      kind: "line",
      start: resolvedStart,
      end: resolvedEnd,
      color: color(options.color ?? this.#defaults.line.color),
      colorEnd: color(options.colorEnd ?? options.color ?? this.#defaults.line.colorEnd ?? this.#defaults.line.color),
      width,
      widthMode: options.widthMode ?? this.#defaults.line.widthMode ?? "screen",
      layer: layer(options.layer ?? this.#defaults.line.layer),
      ...(dash === undefined ? {} : { dash }),
      ...(normal === undefined ? {} : { normal: vec3(normal, "normal") }),
      ...(joint === undefined ? {} : { joint }),
    };
    this.#lines.push(command);
    return this;
  }

  ray(origin: Vec3, direction: Vec3, options: LineOptions = {}): this {
    return this.line(origin, [origin[0] + direction[0], origin[1] + direction[1], origin[2] + direction[2]], options);
  }

  arrow(origin: Vec3, direction: Vec3, options: ArrowOptions = {}): this {
    const end: Vec3 = [origin[0] + direction[0], origin[1] + direction[1], origin[2] + direction[2]];
    this.line(origin, end, options);
    const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    const headLength = options.headLength ?? Math.min(0.18, length * 0.25);
    const headAngle = options.headAngle ?? Math.PI / 6;
    const forward: Vec3 = [direction[0] / length, direction[1] / length, direction[2] / length];
    const reference: Vec3 = Math.abs(forward[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const side: Vec3 = [forward[1] * reference[2] - forward[2] * reference[1], forward[2] * reference[0] - forward[0] * reference[2], forward[0] * reference[1] - forward[1] * reference[0]];
    const sideLength = Math.hypot(side[0], side[1], side[2]) || 1;
    const unitSide: Vec3 = [side[0] / sideLength, side[1] / sideLength, side[2] / sideLength];
    const back = Math.cos(headAngle) * headLength;
    const spread = Math.sin(headAngle) * headLength;
    const left: Vec3 = [end[0] - forward[0] * back + unitSide[0] * spread, end[1] - forward[1] * back + unitSide[1] * spread, end[2] - forward[2] * back + unitSide[2] * spread];
    const right: Vec3 = [end[0] - forward[0] * back - unitSide[0] * spread, end[1] - forward[1] * back - unitSide[1] * spread, end[2] - forward[2] * back - unitSide[2] * spread];
    this.line(end, left, options);
    this.line(end, right, options);
    return this;
  }


  axes(origin: Vec3, length = 1, width = 2): this {
    // Reference `draw_axes` emits three unadorned axis lines (no arrowheads).
    this.line(origin, [origin[0] + length, origin[1], origin[2]], { color: [1, 0, 0, 1], width });
    this.line(origin, [origin[0], origin[1] + length, origin[2]], { color: [0, 1, 0, 1], width });
    this.line(origin, [origin[0], origin[1], origin[2] + length], { color: [0, 0, 1, 1], width });
    return this;
  }

  lineStrip(points: readonly Vec3[], options: LineOptions = {}, closed = false): this {
    this.assertOpen();
    // Dash distance must accumulate across the whole path, otherwise each segment
    // restarts the pattern and closed shapes render as a nearly continuous line.
    const dash = options.dash ?? this.#defaults.line.dash;
    const vertexDistances: number[] = [0];
    let traveled = 0;
    const segment = (a: Vec3, b: Vec3): void => {
      if (dash === undefined) this.line(a, b, options);
      else this.line(a, b, { ...options, dash: [dash[0], dash[1], dash[2] + traveled] });
      traveled += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      vertexDistances.push(traveled);
    };
    for (let i = 0; i + 1 < points.length; i++) segment(points[i]!, points[i + 1]!);
    if (closed && points.length > 1) segment(points[points.length - 1]!, points[0]!);
    const joint = options.joint ?? this.#defaults.line.joint;
    // Reference `_emit_line_strip` / `_emit_line_loop`: an open strip only joins its
    // interior vertices, while a loop also joins the two wrap-around seam vertices.
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

  /**
   * Emits one joint instance for a path vertex. The reference skips degenerate wedges
   * where the center coincides with a neighbour (`emit_joint`), and reuses the resolved
   * line width/color/layer so segment and joint strokes cannot drift apart.
   */
  #jointCommand(
    previous: Vec3,
    center: Vec3,
    next: Vec3,
    joint: RenderedJoint,
    options: LineOptions,
    dash: readonly [number, number, number] | undefined,
    distance: number,
  ): void {
    const resolvedPrevious = vec3(previous, "previous");
    const resolvedCenter = vec3(center, "center");
    const resolvedNext = vec3(next, "next");
    const same = (a: Vec3, b: Vec3): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    if (same(resolvedPrevious, resolvedCenter) || same(resolvedCenter, resolvedNext)) return;
    const width = finite(options.width ?? this.#defaults.line.width ?? 1, "width");
    if (width <= 0) throw new RangeError("width must be greater than zero");
    this.#joints.push({
      kind: "joint",
      previous: resolvedPrevious,
      center: resolvedCenter,
      next: resolvedNext,
      color: color(options.color ?? this.#defaults.line.color),
      width,
      widthMode: options.widthMode ?? this.#defaults.line.widthMode ?? "screen",
      joint,
      layer: layer(options.layer ?? this.#defaults.line.layer),
      ...(dash === undefined ? {} : { dash: [dash[0], dash[1], dash[2] + distance] }),
    });
  }

  polyline(points: readonly Vec3[], options: LineOptions = {}, closed = false): this {
    return this.lineStrip(points, options, closed);
  }

  triangle(a: Vec3, b: Vec3, c: Vec3, options: { color?: Color; layer?: LayerMask } = {}): this {
    this.assertOpen();
    this.#triangles.push({
      kind: "triangle",
      a: vec3(a, "a"),
      b: vec3(b, "b"),
      c: vec3(c, "c"),
      color: color(options.color),
      layer: layer(options.layer),
    });
    return this;
  }

  mesh(mesh: { readonly triangles: readonly (readonly [Vec3, Vec3, Vec3])[]; readonly segments: readonly (readonly [Vec3, Vec3])[] }, options: MeshOptions = {}): this {
    const shared = {
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.layer === undefined ? {} : { layer: options.layer }),
    };
    if (options.solid) {
      for (const [a, b, c] of mesh.triangles) this.triangle(a, b, c, shared);
    } else {
      for (const [a, b] of mesh.segments) this.line(a, b, shared);
    }
    return this;
  }

  curve(curve: Curve3D, options: CurveOptions = {}): this {
    const points = sampleCurve(curve, options.tolerance, options.transform);
    const { tolerance: _tolerance, transform: _transform, ...lineOptions } = options;
    void _tolerance; void _transform;
    return this.lineStrip(points, lineOptions, curve.closed ?? false);
  }

  grid(center: Vec3, cells: readonly [number, number], spacing: readonly [number, number], options: GridOptions = {}): this {
    const { rotation, skew, outer, ...lineOptions } = options;
    for (const [a, b] of gridLines(cells, spacing, center, rotation, skew, outer)) this.line(a, b, lineOptions);
    return this;
  }

  get points(): readonly PointCommand[] {
    return this.#points;
  }

  get lines(): readonly LineCommand[] {
    return this.#lines;
  }

  get joints(): readonly JointCommand[] {
    return this.#joints;
  }

  commands(visibleLayers: LayerMask = 0xffff_ffff): readonly FrameCommand[] {
    this.assertOpen();
    if (!Number.isInteger(visibleLayers) || visibleLayers < 0) {
      throw new RangeError("visibleLayers must be a non-negative integer bitmask");
    }
    return [...this.#points, ...this.#lines, ...this.#joints, ...this.#triangles].filter((command) => (command.layer & visibleLayers) !== 0);
  }

  seal(): void {
    this.assertOpen();
    this.#sealed = true;
  }

  private assertOpen(): void {
    if (this.#sealed) throw new Error("frame recorder is sealed");
  }
}
