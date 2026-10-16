/**
 * Multi-channel signed distance field generation from glyph outlines.
 *
 * A single distance channel stores one number per texel: how far the nearest edge is. That is
 * enough everywhere except near a corner, where two edges meet and the single value can only
 * describe one of them, so the corner rounds off when it is rebuilt. MSDF stores a distance per
 * *edge group* instead — three of them, in RGB — and the shader takes the median. At a corner the
 * three channels disagree and the median keeps the one that is still nearly correct, which is what
 * preserves the point.
 *
 * Curves are chopped into short straight pieces before distances are measured: exact distances to a
 * bezier would need a numerical solve per texel, while a chord error under half a texel is invisible
 * at the sizes this is used at. Edge group assignment follows msdfgen's rule of thumb — adjacent
 * edges that run nearly straight through their shared vertex keep the same group, everything else
 * advances around a three-colour wheel.
 */

export type Point = readonly [number, number];

/** One outline segment: a straight line, or a curve carrying its control points. */
export type OutlineSegment = {
  readonly from: Point;
  readonly control1?: Point;
  readonly control2?: Point;
  readonly to: Point;
};

/** Straight pieces a curve is chopped into. Eight keeps the chord error well under a texel. */
const CURVE_STEPS = 8;

/** Directions closer than this count as one continuous edge, so they share a channel. */
const COLLINEAR_COSINE = 0.9986;

type ColoredLine = {
  readonly from: Point;
  readonly to: Point;
  readonly channel: 0 | 1 | 2;
};

function unit(dx: number, dy: number): Point {
  const length = Math.hypot(dx, dy);
  return length === 0 ? [0, 0] : [dx / length, dy / length];
}

/** Tangent leaving a segment's start, which is where its colour has to agree with the previous one. */
function outgoingDirection(segment: OutlineSegment): Point {
  const reference = segment.control1 ?? segment.to;
  return unit(reference[0] - segment.from[0], reference[1] - segment.from[1]);
}

/** Tangent arriving at a segment's end, the other half of the join test. */
function incomingDirection(segment: OutlineSegment): Point {
  const reference = segment.control2 ?? segment.control1 ?? segment.from;
  return unit(segment.to[0] - reference[0], segment.to[1] - reference[1]);
}

function continuesEdge(previous: OutlineSegment, next: OutlineSegment): boolean {
  const incoming = incomingDirection(previous);
  const outgoing = outgoingDirection(next);
  return incoming[0] * outgoing[0] + incoming[1] * outgoing[1] >= COLLINEAR_COSINE;
}

/**
 * Assigns each segment to one of three channels. Segments that continue the same edge share a
 * channel; a join that actually turns the outline advances to the next one, so the three edges of a
 * corner end up on three different channels.
 */
export function colorOutlineEdges(segments: readonly OutlineSegment[]): Uint8Array {
  const channels = new Uint8Array(segments.length);
  let channel = 0;
  for (let index = 0; index < segments.length; index++) {
    if (index > 0 && !continuesEdge(segments[index - 1]!, segments[index]!)) channel = (channel + 1) % 3;
    channels[index] = channel;
  }
  return channels;
}

function evaluate(segment: OutlineSegment, t: number): Point {
  const { from, to, control1, control2 } = segment;
  const u = 1 - t;
  if (control1 === undefined) return to;
  if (control2 === undefined) {
    return [
      u * u * from[0] + 2 * u * t * control1[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control1[1] + t * t * to[1],
    ];
  }
  return [
    u * u * u * from[0] + 3 * u * u * t * control1[0] + 3 * u * t * t * control2[0] + t * t * t * to[0],
    u * u * u * from[1] + 3 * u * u * t * control1[1] + 3 * u * t * t * control2[1] + t * t * t * to[1],
  ];
}

/** Chops curves into straight pieces, each inheriting its parent's channel. */
export function flattenOutline(segments: readonly OutlineSegment[], channels: Uint8Array, steps: number = CURVE_STEPS): readonly ColoredLine[] {
  const lines: ColoredLine[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const channel = ((channels[index] ?? 0) % 3) as 0 | 1 | 2;
    if (segment.control1 === undefined) {
      lines.push({ from: segment.from, to: segment.to, channel });
      continue;
    }
    for (let step = 0; step < steps; step++) {
      lines.push({ from: evaluate(segment, step / steps), to: evaluate(segment, (step + 1) / steps), channel });
    }
  }
  return lines;
}

/** Even-odd containment: a horizontal ray from the point, counting crossings to its right. */
function isInside(px: number, py: number, lines: readonly ColoredLine[]): boolean {
  let inside = false;
  for (const line of lines) {
    const [ax, ay] = line.from;
    const [bx, by] = line.to;
    if (ay > py !== by > py) {
      const crossing = ax + ((py - ay) / (by - ay)) * (bx - ax);
      if (px < crossing) inside = !inside;
    }
  }
  return inside;
}

function distanceToLine(px: number, py: number, line: ColoredLine): number {
  const [ax, ay] = line.from;
  const [bx, by] = line.to;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const projected = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  const t = projected < 0 ? 0 : projected > 1 ? 1 : projected;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Renders one glyph outline into an RGBA8 distance field.
 *
 * Each channel holds the signed distance to the nearest edge in its group, averaged over the texel
 * centre, and encoded as `distance / (2 × range) + 0.5` so 128 is the edge. Channels no edge was
 * assigned to saturate, because a median over two real distances and one saturated value still
 * resolves to a real edge.
 */
export function msdfFromOutline(
  segments: readonly OutlineSegment[],
  width: number,
  height: number,
  range: number,
  steps: number = CURVE_STEPS,
): Uint8Array {
  if (!(range > 0)) throw new RangeError("msdf range must be greater than zero");
  const lines = flattenOutline(segments, colorOutlineEdges(segments), steps);
  const texels = new Uint8Array(width * height * 4);
  const scale = 1 / (2 * range);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const inside = isInside(px, py, lines);
      const nearest = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      const signed = [0, 0, 0];
      for (const line of lines) {
        const distance = distanceToLine(px, py, line);
        if (distance < nearest[line.channel]!) {
          nearest[line.channel] = distance;
          signed[line.channel] = inside ? distance : -distance;
        }
      }
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = nearest[channel] === Number.POSITIVE_INFINITY ? (inside ? range : -range) : signed[channel]!;
        const encoded = Math.round((value * scale + 0.5) * 255);
        texels[target + channel] = encoded < 0 ? 0 : encoded > 255 ? 255 : encoded;
      }
      texels[target + 3] = 255;
    }
  }
  return texels;
}
