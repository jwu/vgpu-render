import { sampleCurve, type Curve3D, type CurveTransform } from "./curve.js";
import { FrameRecorder2D, type FrameCommand2D } from "./frame-recorder-2d.js";
import { gridLines } from "./geometry-generators.js";
import { DEFAULT_FONT_FAMILY } from "./text-font.js";
import { resolveTextAnchor, DEFAULT_LINE_HEIGHT_SCALE, type TextAnchor, type TextJustify, type TextLineBreak } from "./text-layout.js";

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
  /**
   * Per-vertex normals for path primitives (reference `*_n` variants). Every segment uses
   * the normal of its **start** vertex, matching `_emit_normal_line_strip` /
   * `_emit_normal_line_loop`, and the joints between them interpolate the two normals. A
   * closed path needs one entry per vertex, an open one per segment (as the reference
   * accepts). Takes precedence over `normal` when both are given.
   */
  normals?: readonly Vec3[];
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
  /**
   * Normal of the previous path vertex and of this one, mirroring
   * `_emit_normal_joint(previous, center, next, previous_normal, next_normal, ...)`.
   * The wedge interpolates between them so a normal-aware joint keeps the shading of the
   * segments it joins. Both are absent for plain joints.
   */
  readonly previousNormal?: Vec3;
  readonly nextNormal?: Vec3;
  readonly joint: RenderedJoint;
  readonly layer: LayerMask;
};

export type ArrowOptions = LineOptions & {
  headLength?: number;
  headAngle?: number;
};

export type FrameCommand =
  | PointCommand
  | LineCommand
  | JointCommand
  | TriangleCommand
  | TextCommand
  | FrameCommand2D;

export type TriangleCommand = {
  readonly kind: "triangle";
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  readonly color: Color;
  readonly layer: LayerMask;
};

/**
 * Where a text block is placed, mirroring bevy's split between world-space `Text2d` and the
 * screen-space UI `Text`:
 *
 * - `world-plane` puts the block on a fixed local XY plane at a world position, so it
 *   foreshortens with the camera like the reference `Label3D`.
 * - `world-billboard` keeps that plane facing the camera at all times.
 * - `screen` places the block at a **top-left origin pixel position** (`position.z` is
 *   ignored) at a fixed pixel size, independent of projection and depth.
 */
export type TextSpace = "world-plane" | "world-billboard" | "screen";

/** One section of a text block, the equivalent of a bevy `TextSpan`. */
export type TextSpanOptions = {
  readonly text: string;
  readonly color?: Color;
  readonly fontSize?: number;
  readonly fontFamily?: string;
};

export type TextOptions = {
  color?: Color;
  /**
   * Outline width in font pixels, drawn around every glyph in the block. `0` (the default) draws no
   * outline. Font pixels rather than screen pixels keeps the outline proportional to the glyphs:
   * a block scaled up by `pixelSize` carries its outline with it, and a `screen` block's outline is
   * in screen pixels, since there is nothing between those two units.
   */
  outlineWidth?: number;
  /**
   * Outline colour, its alpha giving how opaque the ring is. Defaults to the block's own colour,
   * which widens the glyphs rather than ringing them; give it a contrasting colour to make a block
   * readable against whatever it is drawn over.
   */
  outlineColor?: Color;
  /**
   * Block font size in pixels. It is both the layout unit and the glyph atlas' rasterisation
   * size, exactly as in the reference `Label3D.font_size`; the two world spaces scale it by
   * `pixelSize`, and `screen` uses it directly.
   */
  fontSize?: number;
  /**
   * World units per font pixel in the two world spaces, the reference `Label3D.pixel_size`.
   * Ignored by `screen`, which is already in pixels. Raise `fontSize` and lower this together
   * to keep a block's world size while gaining rasterisation detail.
   */
  pixelSize?: number;
  fontFamily?: string;
  /**
   * Absolute line height in pixels, bevy's `LineHeight::Px`. Exclusive with `lineHeightScale`;
   * omitting both leaves the line height at bevy's default, `RelativeToFont(1.2)`.
   */
  lineHeight?: number;
  /**
   * Line height as a multiple of the line's own largest span, bevy's `LineHeight::RelativeToFont`.
   * Exclusive with `lineHeight`.
   */
  lineHeightScale?: number;
  letterSpacing?: number;
  justify?: TextJustify;
  lineBreak?: TextLineBreak;
  /**
   * `TextBounds`. Only `width` feeds layout: it is the wrap width. `height` is deliberately not a
   * layout input, matching bevy, whose `Text2d` never truncates against it — a block that runs
   * past the height still draws every line.
   */
  bounds?: readonly [number, number];
  anchor?: TextAnchor;
  space?: TextSpace;
  /**
   * Which registered glyph source draws this block: its encoding and raster scale. Blocks that name
   * nothing use the first source, so a frame can mix a sharp pass and a cheap pass.
   */
  source?: string;
  /** Whether geometry in front of the block occludes it. Defaults to `true`, like bevy's `Text2d`. */
  depthTest?: boolean;
  layer?: LayerMask;
};

/** A span after the block defaults have been folded in, so the renderer never re-resolves them. */
export type ResolvedTextSpan = {
  readonly text: string;
  readonly color: Color;
  readonly fontSize: number;
  readonly fontFamily: string;
};

export type TextCommand = {
  readonly kind: "text";
  readonly position: Vec3;
  readonly spans: readonly ResolvedTextSpan[];
  readonly color: Color;
  readonly outlineWidth: number;
  readonly outlineColor: Color;
  readonly fontSize: number;
  readonly pixelSize: number;
  readonly fontFamily: string;
  /**
   * Resolved line height in pixels: the value a `LineHeight::Px` block asked for, or
   * `1.2 × fontSize` for the default, which `lineHeightScale` then marks as resolved per line.
   * Only block measurements read this; layout uses whichever of the two fields applies.
   */
  readonly lineHeight: number;
  /**
   * `LineHeight::RelativeToFont` multiple, present only when the block left the line height at
   * the default. Layout then resolves each line against that line's own largest span.
   */
  readonly lineHeightScale?: number;
  readonly letterSpacing: number;
  readonly justify: TextJustify;
  readonly lineBreak: TextLineBreak;
  readonly bounds?: readonly [number, number];
  readonly anchor: TextAnchor;
  readonly space: TextSpace;
  readonly source?: string;
  readonly depthTest: boolean;
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

export type TextDefaults = {
  color?: Color;
  outlineWidth?: number;
  outlineColor?: Color;
  fontSize?: number;
  pixelSize?: number;
  fontFamily?: string;
  /**
   * Absolute line height in pixels, bevy's `LineHeight::Px`. Omitted means bevy's default,
   * `RelativeToFont(1.2)`: every line is 1.2 times its own largest span, so a line holding a
   * larger span gets a taller box.
   */
  lineHeight?: number;
  /** Line height as a multiple of the line's largest span, bevy's `LineHeight::RelativeToFont`. */
  lineHeightScale?: number;
  letterSpacing?: number;
  justify?: TextJustify;
  lineBreak?: TextLineBreak;
  anchor?: TextAnchor;
  space?: TextSpace;
  source?: string;
  depthTest?: boolean;
  layer?: LayerMask;
};

export type FrameRecorderDefaults = {
  point?: PointDefaults;
  line?: LineDefaults;
  text?: TextDefaults;
};

export const DEFAULT_COLOR: Color = [1, 1, 1, 1];
export const DEFAULT_LAYER = 1;
/** Default block font size in pixels; the world spaces scale it by `DEFAULT_TEXT_PIXEL_SIZE`. */
export const DEFAULT_TEXT_SIZE = 16;
/** Default world units per font pixel, i.e. a 0.32 world-unit glyph at the default size. */
export const DEFAULT_TEXT_PIXEL_SIZE = 0.02;
/** bevy's `LineHeight` default is `RelativeToFont(1.2)`. */
export const DEFAULT_LINE_HEIGHT_RATIO = DEFAULT_LINE_HEIGHT_SCALE;

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

const TEXT_JUSTIFY: readonly TextJustify[] = ["left", "center", "right", "justified", "start", "end"];
const TEXT_LINE_BREAK: readonly TextLineBreak[] = ["word", "character", "word-or-character", "none"];
const TEXT_SPACES: readonly TextSpace[] = ["world-plane", "world-billboard", "screen"];

function textJustifyValue(value: string, name: string): TextJustify {
  if (!(TEXT_JUSTIFY as readonly string[]).includes(value)) {
    throw new RangeError(`${name} must be one of ${TEXT_JUSTIFY.join(", ")}`);
  }
  return value as TextJustify;
}

function textLineBreakValue(value: string, name: string): TextLineBreak {
  if (!(TEXT_LINE_BREAK as readonly string[]).includes(value)) {
    throw new RangeError(`${name} must be one of ${TEXT_LINE_BREAK.join(", ")}`);
  }
  return value as TextLineBreak;
}

function textSpaceValue(value: string, name: string): TextSpace {
  if (!(TEXT_SPACES as readonly string[]).includes(value)) {
    throw new RangeError(`${name} must be one of ${TEXT_SPACES.join(", ")}`);
  }
  return value as TextSpace;
}

function textBounds(value: readonly [number, number], name: string): readonly [number, number] {
  if (value.length !== 2) throw new RangeError(`${name} must contain two values`);
  if (!(value[0] > 0) || !(value[1] > 0)) throw new RangeError(`${name} values must be greater than zero`);
  return value;
}

/**
 * Folds the block defaults into every span so the renderer resolves a style once per span and
 * never has to guess what an omitted field meant.
 */
function resolveTextSpans(
  text: string | readonly TextSpanOptions[],
  options: TextOptions,
  defaults: ResolvedTextDefaults,
  baseFontSize: number,
  baseFontFamily: string,
): readonly ResolvedTextSpan[] {
  const input: readonly TextSpanOptions[] = typeof text === "string" ? [{ text }] : text;
  const baseColor = color(options.color ?? defaults.color);
  return input.map((span) => {
    const fontSize = span.fontSize ?? baseFontSize;
    if (!Number.isFinite(fontSize) || fontSize <= 0) throw new RangeError("span fontSize must be greater than zero");
    return {
      text: span.text,
      color: span.color === undefined ? baseColor : color(span.color),
      fontSize,
      fontFamily: span.fontFamily ?? baseFontFamily,
    };
  });
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

export type ResolvedTextDefaults = {
  color: Color | undefined;
  outlineWidth: number | undefined;
  outlineColor: Color | undefined;
  fontSize: number | undefined;
  pixelSize: number | undefined;
  fontFamily: string | undefined;
  lineHeight: number | undefined;
  lineHeightScale: number | undefined;
  letterSpacing: number | undefined;
  justify: TextJustify | undefined;
  lineBreak: TextLineBreak | undefined;
  anchor: TextAnchor | undefined;
  space: TextSpace | undefined;
  source: string | undefined;
  depthTest: boolean | undefined;
  layer: LayerMask | undefined;
};

export type ResolvedFrameRecorderDefaults = {
  point: ResolvedPointDefaults;
  line: ResolvedLineDefaults;
  text: ResolvedTextDefaults;
};

/** Validates and resolves style defaults so invalid values fail at construction time. */
export function resolveFrameRecorderDefaults(defaults: FrameRecorderDefaults = {}): ResolvedFrameRecorderDefaults {
  const point = defaults.point ?? {};
  const line = defaults.line ?? {};
  const text = defaults.text ?? {};
  const pointSize = point.size === undefined ? undefined : finite(point.size, "default point size");
  if (pointSize !== undefined && pointSize <= 0) {
    throw new RangeError("default point size must be greater than zero");
  }
  const lineWidth = line.width === undefined ? undefined : finite(line.width, "default line width");
  if (lineWidth !== undefined && lineWidth <= 0) {
    throw new RangeError("default line width must be greater than zero");
  }
  const textSize = text.fontSize === undefined ? undefined : finite(text.fontSize, "default text fontSize");
  if (textSize !== undefined && textSize <= 0) {
    throw new RangeError("default text fontSize must be greater than zero");
  }
  const textPixelSize = text.pixelSize === undefined ? undefined : finite(text.pixelSize, "default text pixelSize");
  if (textPixelSize !== undefined && textPixelSize <= 0) {
    throw new RangeError("default text pixelSize must be greater than zero");
  }
  const textLineHeight = text.lineHeight === undefined ? undefined : finite(text.lineHeight, "default text lineHeight");
  if (textLineHeight !== undefined && textLineHeight <= 0) {
    throw new RangeError("default text lineHeight must be greater than zero");
  }
  const textLineHeightScale = text.lineHeightScale === undefined ? undefined : finite(text.lineHeightScale, "default text lineHeightScale");
  if (textLineHeightScale !== undefined && textLineHeightScale <= 0) {
    throw new RangeError("default text lineHeightScale must be greater than zero");
  }
  if (textLineHeight !== undefined && textLineHeightScale !== undefined) {
    throw new RangeError("default text lineHeight and lineHeightScale are exclusive, like bevy's LineHeight variants");
  }
  const textAnchor = text.anchor;
  if (textAnchor !== undefined) resolveTextAnchor(textAnchor);
  const textOutlineWidth = text.outlineWidth === undefined ? undefined : finite(text.outlineWidth, "default text outlineWidth");
  if (textOutlineWidth !== undefined && textOutlineWidth < 0) {
    throw new RangeError("default text outlineWidth must not be negative");
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
    text: {
      color: text.color === undefined ? undefined : colorValue(text.color, "default text color"),
      outlineWidth: textOutlineWidth,
      outlineColor: text.outlineColor === undefined ? undefined : colorValue(text.outlineColor, "default text outlineColor"),
      fontSize: textSize,
      pixelSize: textPixelSize,
      fontFamily: text.fontFamily,
      lineHeight: textLineHeight,
      lineHeightScale: textLineHeightScale,
      letterSpacing: text.letterSpacing === undefined ? undefined : finite(text.letterSpacing, "default text letterSpacing"),
      justify: text.justify === undefined ? undefined : textJustifyValue(text.justify, "default text justify"),
      lineBreak: text.lineBreak === undefined ? undefined : textLineBreakValue(text.lineBreak, "default text lineBreak"),
      anchor: textAnchor,
      space: text.space === undefined ? undefined : textSpaceValue(text.space, "default text space"),
      source: text.source,
      depthTest: text.depthTest,
      layer: text.layer === undefined ? undefined : layerValue(text.layer, "default text layer"),
    },
  };
}

export class FrameRecorder {
  readonly #points: PointCommand[] = [];
  readonly #lines: LineCommand[] = [];
  readonly #joints: JointCommand[] = [];
  readonly #triangles: TriangleCommand[] = [];
  readonly #texts: TextCommand[] = [];
  readonly #defaults: ResolvedFrameRecorderDefaults;
  readonly #d2: FrameRecorder2D;
  #sealed = false;

  constructor(defaults: FrameRecorderDefaults = {}) {
    this.#defaults = resolveFrameRecorderDefaults(defaults);
    // The 2D layer shares this recorder's resolved point/line styles, so a style set on
    // `DebugDraw3D` cannot apply to one layer and not the other.
    this.#d2 = new FrameRecorder2D(
      { point: this.#defaults.point, line: this.#defaults.line },
      () => this.assertOpen(),
    );
  }

  /**
   * The 2D layer: `Vec2` primitives on the bevy-style `Camera2d` spaces described in
   * `camera-2d.ts`. Drawing here records into the same frame and layer mask as the 3D methods.
   */
  get d2(): FrameRecorder2D {
    this.assertOpen();
    return this.#d2;
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
    // Per-vertex normals mirror the reference `*_n` entry points: each segment is emitted
    // with its start vertex's normal instead of one normal for the whole path.
    const normals = options.normals;
    if (normals !== undefined) {
      // Reference `draw_line_strip_n` accepts one normal per segment, `draw_line_loop_n` one
      // per vertex; the loop's closing segment reuses the last vertex's normal.
      const required = closed ? points.length : Math.max(0, points.length - 1);
      if (normals.length < required) {
        throw new RangeError(`normals must have at least ${required} entries for this path`);
      }
    }
    const { normals: _normals, ...sharedOptions } = options;
    void _normals;
    const vertexDistances: number[] = [0];
    let traveled = 0;
    const segment = (a: Vec3, b: Vec3, index: number): void => {
      const normal = normals === undefined ? undefined : normals[index];
      const segmentOptions: LineOptions = {
        ...sharedOptions,
        ...(dash === undefined ? {} : { dash: [dash[0], dash[1], dash[2] + traveled] as const }),
        ...(normal === undefined ? {} : { normal }),
      };
      this.line(a, b, segmentOptions);
      traveled += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      vertexDistances.push(traveled);
    };
    for (let i = 0; i + 1 < points.length; i++) segment(points[i]!, points[i + 1]!, i);
    if (closed && points.length > 1) segment(points[points.length - 1]!, points[0]!, points.length - 1);
    const joint = options.joint ?? this.#defaults.line.joint;
    // Reference `_emit_line_strip` / `_emit_line_loop`: an open strip only joins its
    // interior vertices, while a loop also joins the two wrap-around seam vertices.
    if (joint === "round" || joint === "bevel" || joint === "miter") {
      const count = points.length;
      const first = closed ? 0 : 1;
      const last = closed ? (count > 2 ? count : 0) : count - 1;
      for (let i = first; i < last; i++) {
        const previousIndex = (i - 1 + count) % count;
        this.#jointCommand(
          points[previousIndex]!,
          points[i]!,
          points[(i + 1) % count]!,
          joint,
          sharedOptions,
          dash,
          vertexDistances[i]!,
          normals === undefined ? undefined : [normals[previousIndex]!, normals[i]!],
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
    normals?: readonly [Vec3, Vec3],
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
      ...(dash === undefined ? {} : { dash: [dash[0], dash[1], dash[2] + distance] as const }),
      ...(normals === undefined ? {} : { previousNormal: vec3(normals[0], "previousNormal"), nextNormal: vec3(normals[1], "nextNormal") }),
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

  /**
   * Records one text block. `text` is either the block's string or a list of spans, mirroring
   * bevy's `Text2d`/`Text` root plus its child `TextSpan`s; a span's own style overrides the
   * block default. Layout happens at draw time, because only the renderer knows where the
   * glyph atlas placed each character.
   */
  text(position: Vec3, text: string | readonly TextSpanOptions[], options: TextOptions = {}): this {
    this.assertOpen();
    const defaults = this.#defaults.text;
    const fontSize = finite(options.fontSize ?? defaults.fontSize ?? DEFAULT_TEXT_SIZE, "fontSize");
    if (fontSize <= 0) throw new RangeError("fontSize must be greater than zero");
    const pixelSize = finite(options.pixelSize ?? defaults.pixelSize ?? DEFAULT_TEXT_PIXEL_SIZE, "pixelSize");
    if (pixelSize <= 0) throw new RangeError("pixelSize must be greater than zero");
    const lineHeightOption = options.lineHeight ?? defaults.lineHeight;
    const lineHeightScaleOption = options.lineHeightScale ?? defaults.lineHeightScale;
    if (lineHeightOption !== undefined && lineHeightScaleOption !== undefined) {
      throw new RangeError("lineHeight and lineHeightScale are exclusive, like bevy's LineHeight variants");
    }
    // A relative line height stays relative all the way to layout, where each line resolves it
    // against that line's own largest span; only an explicit one is absolute.
    const lineHeightScale = lineHeightOption === undefined
      ? finite(lineHeightScaleOption ?? DEFAULT_LINE_HEIGHT_RATIO, "lineHeightScale")
      : undefined;
    if (lineHeightScale !== undefined && lineHeightScale <= 0) throw new RangeError("lineHeightScale must be greater than zero");
    const lineHeight = lineHeightScale === undefined ? finite(lineHeightOption!, "lineHeight") : fontSize * lineHeightScale;
    if (lineHeight <= 0) throw new RangeError("lineHeight must be greater than zero");
    const letterSpacing = finite(options.letterSpacing ?? defaults.letterSpacing ?? 0, "letterSpacing");
    const fontFamily = options.fontFamily ?? defaults.fontFamily ?? DEFAULT_FONT_FAMILY;
    const justify = options.justify ?? defaults.justify ?? "left";
    const lineBreak = options.lineBreak ?? defaults.lineBreak ?? "word";
    const anchor = options.anchor ?? defaults.anchor ?? "center";
    const space = options.space ?? defaults.space ?? "world-plane";
    const source = options.source ?? defaults.source;
    const bounds = options.bounds;
    if (bounds !== undefined) textBounds(bounds, "bounds");
    const outlineWidth = finite(options.outlineWidth ?? defaults.outlineWidth ?? 0, "outlineWidth");
    if (outlineWidth < 0) throw new RangeError("outlineWidth must not be negative");
    const outlineColor = color(options.outlineColor ?? defaults.outlineColor ?? options.color ?? defaults.color);
    // Validates the anchor name and the enumerated fields with the same messages defaults use.
    resolveTextAnchor(anchor);
    textJustifyValue(justify, "justify");
    textLineBreakValue(lineBreak, "lineBreak");
    textSpaceValue(space, "space");
    this.#texts.push({
      kind: "text",
      position: vec3(position, "position"),
      spans: resolveTextSpans(text, options, defaults, fontSize, fontFamily),
      color: color(options.color ?? defaults.color),
      outlineWidth,
      outlineColor,
      fontSize,
      pixelSize,
      fontFamily,
      lineHeight,
      ...(lineHeightScale === undefined ? {} : { lineHeightScale }),
      letterSpacing,
      justify,
      lineBreak,
      anchor,
      space,
      ...(source === undefined ? {} : { source }),
      depthTest: options.depthTest ?? defaults.depthTest ?? true,
      layer: layer(options.layer ?? defaults.layer),
      ...(bounds === undefined ? {} : { bounds }),
    });
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

  get texts(): readonly TextCommand[] {
    return this.#texts;
  }

  commands(visibleLayers: LayerMask = 0xffff_ffff): readonly FrameCommand[] {
    this.assertOpen();
    if (!Number.isInteger(visibleLayers) || visibleLayers < 0) {
      throw new RangeError("visibleLayers must be a non-negative integer bitmask");
    }
    // Text draws last: it is the only alpha-blended primitive that is not depth-sorted against
    // its own kind, so keeping it at the end preserves the reference's reading order. The 2D
    // commands follow the 3D ones because the renderer draws them as an overlay.
    return [
      ...this.#points,
      ...this.#lines,
      ...this.#joints,
      ...this.#triangles,
      ...this.#texts,
      ...this.#d2.points,
      ...this.#d2.lines,
      ...this.#d2.joints,
      ...this.#d2.shapes,
    ].filter((command) => (command.layer & visibleLayers) !== 0);
  }

  seal(): void {
    this.assertOpen();
    this.#sealed = true;
  }

  private assertOpen(): void {
    if (this.#sealed) throw new Error("frame recorder is sealed");
  }
}
