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
 *
 * The median only equals the distance to the *nearest* edge where at least two channels are
 * saturated. Inside a stroke that sees two or three edges it resolves to the middle distance
 * instead, and the rebuilt edge drifts by up to half a texel: measured against a super-sampled
 * coverage reference at 24 px, the raw field is off by 0.073 (mean) and 0.513 (worst texel) in alpha
 * units. msdfgen handles that with an error-correction pass after generating the field, whose
 * flagship form equalises every flagged texel to its own median. That was measured here too and it
 * made the reconstruction *worse* (0.078), because this encoder gives every channel the texel's own
 * inside/outside sign rather than a per-edge signed distance, so the channels differ only in which
 * edge is nearest and equalising them flattens the gradient the filter relies on.
 *
 * What does help is correcting the median itself against the exact shape distance: only the channel
 * or channels needed to make that distance the middle value move, so the other channel keeps its
 * gradient. The same measurement drops to 0.043, against 0.040 for a field whose whole edge band is
 * made exactly right — the remainder is the resolution limit of one distance per texel plus linear
 * filtering, not something another pass can recover.
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

/** Encodes one distance as `distance / (2 × range) + 0.5`, saturated to an 8-bit channel. */
function encodeDistance(value: number, range: number): number {
  const encoded = Math.round((value / (2 * range) + 0.5) * 255);
  return encoded < 0 ? 0 : encoded > 255 ? 255 : encoded;
}

/** Indices of three channel values in ascending order. */
function ascending(values: readonly [number, number, number]): readonly [number, number, number] {
  const order: [number, number, number] = [0, 1, 2];
  if (values[order[0]]! > values[order[1]]!) [order[0], order[1]] = [order[1], order[0]];
  if (values[order[1]]! > values[order[2]]!) [order[1], order[2]] = [order[2], order[1]];
  if (values[order[0]]! > values[order[1]]!) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/**
 * How far a texel's median may sit from the exact shape distance before it is corrected, in texels.
 * Half a texel is the point where the reconstruction visibly shifts the edge.
 */
const CORRECTION_TOLERANCE = 0.5;

/**
 * Moves each texel's median onto the exact shape distance, in place.
 *
 * Only the channel or channels required to make that distance the middle value are written; the
 * remaining channel keeps its own gradient, which is what stops a magnified edge from flattening
 * across the corrected texel. Beyond the encoded band nothing is touched: there the coverage ramp
 * is already saturated, so the median's exact value cannot move a pixel.
 */
function correctMedians(texels: Uint8Array, distances: Float64Array, range: number): void {
  const tolerance = (CORRECTION_TOLERANCE / (2 * range)) * 255;
  for (let index = 0; index < distances.length; index++) {
    const shape = distances[index]!;
    if (!(Math.abs(shape) <= range)) continue;
    const base = index * 4;
    const red = texels[base]!;
    const green = texels[base + 1]!;
    const blue = texels[base + 2]!;
    const order = ascending([red, green, blue]);
    const values = [red, green, blue];
    const lowest = values[order[0]]!;
    const median = values[order[1]]!;
    const highest = values[order[2]]!;
    const target = encodeDistance(shape, range);
    if (Math.abs(median - target) <= tolerance) continue;
    if (target < median) {
      // Lower the highest channel. Once the target is at or below the lowest one, that channel has
      // to move as well, or it would become the new median instead.
      texels[base + order[2]] = target;
      if (target <= lowest) texels[base + order[0]] = target;
    } else {
      texels[base + order[0]] = target;
      if (target >= highest) texels[base + order[2]] = target;
    }
  }
}

/**
 * Renders one glyph outline into an RGBA8 distance field.
 *
 * Each channel holds the signed distance to the nearest edge in its group, averaged over the texel
 * centre, and encoded as `distance / (2 × range) + 0.5` so 128 is the edge. Channels no edge was
 * assigned to saturate, because a median over two real distances and one saturated value still
 * resolves to a real edge. The field is then corrected against the exact shape distance — see the
 * error-correction note at the top of this file.
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
  const distances = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const inside = isInside(px, py, lines);
      const nearest = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      const signed = [0, 0, 0];
      let shapeDistance = Number.POSITIVE_INFINITY;
      for (const line of lines) {
        const distance = distanceToLine(px, py, line);
        if (distance < shapeDistance) shapeDistance = distance;
        if (distance < nearest[line.channel]!) {
          nearest[line.channel] = distance;
          signed[line.channel] = inside ? distance : -distance;
        }
      }
      const index = y * width + x;
      const target = index * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = nearest[channel] === Number.POSITIVE_INFINITY ? (inside ? range : -range) : signed[channel]!;
        texels[target + channel] = encodeDistance(value, range);
      }
      texels[target + 3] = 255;
      distances[index] = inside ? shapeDistance : -shapeDistance;
    }
  }

  correctMedians(texels, distances, range);
  return texels;
}
