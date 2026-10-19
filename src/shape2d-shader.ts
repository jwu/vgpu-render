/**
 * WGSL for the 2D shape pipeline.
 *
 * One instanced quad per shape; the fragment stage evaluates a signed distance field, so a
 * rounded rectangle, an ellipse, an annulus or a regular polygon are all the same pipeline and
 * none of them is expanded to triangles on the CPU. Coverage comes from the screen-space
 * derivative of the distance, which keeps edges one pixel wide at any magnification.
 *
 * The distance is evaluated in the shape's own space (the space its coordinates were given in),
 * then converted to canvas pixels, so a stroke width is always a pixel count. `pixelsPerUnit`
 * and `yFlip` are what make that conversion exact for both 2D spaces: `world2d` has +y up and
 * `zoom` pixels per unit, `screen` has +y down and one.
 */

export function shape2dShader(): string {
  return `
const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const EPSILON: f32 = 1e-6;

struct Camera2D {
  viewProjection: mat4x4f,
  viewportSize: vec2f,
  /** +1 when the space has +y down (screen), -1 when it has +y up (world2d). */
  yFlip: f32,
  /** Canvas pixels one shape-space unit covers. */
  pixelsPerUnit: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera2D;

const SHAPE_RECT: u32 = 0u;
const SHAPE_ROUNDED_RECT: u32 = 1u;
const SHAPE_CIRCLE: u32 = 2u;
const SHAPE_ELLIPSE: u32 = 3u;
const SHAPE_ARC: u32 = 4u;
const SHAPE_ANNULUS: u32 = 5u;
const SHAPE_CAPSULE: u32 = 6u;
const SHAPE_POLYGON: u32 = 7u;
const SHAPE_TRIANGLE: u32 = 8u;
const SHAPE_RHOMBUS: u32 = 9u;
const SHAPE_SECTOR: u32 = 10u;
const SHAPE_SEGMENT: u32 = 11u;

struct In {
  // The base quad vertex and the per-instance transform the shared instancing layer always
  // provides; both are unused here because the quad is placed from vertex_index.
  @location(0) position: vec3f,
  @location(1) world0: vec4f, @location(2) world1: vec4f,
  @location(3) world2: vec4f, @location(4) world3: vec4f,
  @location(5) shape: u32,
  @location(6) center: vec3f,
  /** Primary half-size: box half extents, ellipse radii, circumradius, capsule radius/half length, annulus outer/inner, or a triangle's first vertex offset. */
  @location(7) size: vec2f,
  @location(8) vertexB: vec2f,
  @location(9) vertexC: vec2f,
  /** (cornerRadius, strokeWidthPixels, startAngle, sweep). */
  @location(10) params: vec4f,
  /** (rotation, bounding radius of the instanced quad). */
  @location(11) rotationRadius: vec2f,
  @location(12) color: vec4f,
  /** bit0: filled; bits 8..15: polygon vertex count. */
  @location(13) flags: u32,
  /** (visible, gap, phase) of a dashed outline in shape-space units; gap 0 disables it. */
  @location(14) dash: vec3f,
}

struct Out {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  // Integer varyings have to be flat, and this device runs in WebGPU compatibility mode where
  // flat's default "first" sampling is rejected: either is the portable form.
  @location(1) @interpolate(flat, either) shape: u32,
  @location(2) centerPixel: vec2f,
  @location(3) size: vec2f,
  @location(4) vertexB: vec2f,
  @location(5) vertexC: vec2f,
  @location(6) params: vec4f,
  @location(7) rotation: f32,
  @location(8) @interpolate(flat, either) sides: u32,
  @location(9) @interpolate(flat, either) flags: u32,
  @location(10) dash: vec3f,
}

fn rotate2(p: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

/** Floored modulo: WGSL's % truncates, which would fold negative angles the wrong way. */
fn floored_mod(value: f32, period: f32) -> f32 {
  return value - period * floor(value / period);
}

fn sd_box(p: vec2f, halfSize: vec2f) -> f32 {
  let d = abs(p) - halfSize;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}

fn sd_rounded_box(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
  let r = min(max(radius, 0.0), min(halfSize.x, halfSize.y));
  return sd_box(p, halfSize - vec2f(r)) - r;
}

/**
 * Ellipse distance (iq's approximation). It is exact when the two axes are equal, which is why
 * circle shares it, and within a fraction of a pixel elsewhere.
 *
 * Both k terms divide by a different power of the radii: k1 by the radii and k2 by their square.
 * Dividing both by the square collapses the result to a constant and paints the whole quad.
 */
fn sd_ellipse(p: vec2f, radii: vec2f) -> f32 {
  let ab = max(radii, vec2f(EPSILON));
  let ab2 = ab * ab;
  let k1 = length(p / ab);
  let k2 = length(p / ab2);
  if (k2 < EPSILON) { return -min(ab.x, ab.y); }
  return k1 * (k1 - 1.0) / k2;
}

fn sd_segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), EPSILON), 0.0, 1.0);
  return length(pa - ba * h);
}

/** Ring band: negative between inner and outer. */
fn sd_annulus(p: vec2f, inner: f32, outer: f32) -> f32 {
  let mid = (inner + outer) * 0.5;
  return abs(length(p) - mid) - (outer - inner) * 0.5;
}

fn sd_capsule(p: vec2f, halfLength: f32, radius: f32) -> f32 {
  return sd_segment(p, vec2f(0.0, -halfLength), vec2f(0.0, halfLength)) - radius;
}

/** Regular polygon with a vertex on the +x axis: distance to the edge of the nearest sector. */
fn sd_regular_polygon(p: vec2f, radius: f32, sides: u32) -> f32 {
  let n = max(f32(sides), 3.0);
  let apothem = PI / n;
  let angle = atan2(p.y, p.x);
  // Fold the angle into the sector around the nearest edge midpoint, which sits apothem away
  // from a vertex. Zero means the point is dead on an edge normal.
  let alpha = abs(floored_mod(angle, 2.0 * apothem) - apothem);
  // Every edge is a line perpendicular to its midpoint radius at radius * cos(apothem).
  return length(p) * cos(alpha) - radius * cos(apothem);
}

/** Arbitrary triangle, signed distance (iq). */
fn sd_triangle(p: vec2f, p0: vec2f, p1: vec2f, p2: vec2f) -> f32 {
  let e0 = p1 - p0;
  let v0 = p - p0;
  let e1 = p2 - p1;
  let v1 = p - p1;
  let e2 = p0 - p2;
  let v2 = p - p2;
  let pq0 = v0 - e0 * clamp(dot(v0, e0) / max(dot(e0, e0), EPSILON), 0.0, 1.0);
  let pq1 = v1 - e1 * clamp(dot(v1, e1) / max(dot(e1, e1), EPSILON), 0.0, 1.0);
  let pq2 = v2 - e2 * clamp(dot(v2, e2) / max(dot(e2, e2), EPSILON), 0.0, 1.0);
  let s = sign(e0.x * e2.y - e0.y * e2.x);
  let d0 = vec2f(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x));
  let d1 = vec2f(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x));
  let d2 = vec2f(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x));
  let d = min(min(d0, d1), d2);
  return -sqrt(max(d.x, 0.0)) * sign(d.y);
}

/** Diamond with half diagonals a and b; the gradient is constant, so this is exact. */
fn sd_rhombus(p: vec2f, a: f32, b: f32) -> f32 {
  let dx = max(a, EPSILON);
  let dy = max(b, EPSILON);
  let value = abs(p.x) / dx + abs(p.y) / dy - 1.0;
  return value / length(vec2f(1.0 / dx, 1.0 / dy));
}

/**
 * Angular wedge of sweep radians from start: at most zero inside, and outside it returns the
 * distance to the nearer end, measured along the arc at the sample's radius.
 *
 * Clamping with a pair of half-planes works for wide sweeps but degenerates as the sweep closes:
 * their intersection collapses onto a line through the centre, so a point on the far side of the
 * ring reads a near-zero distance and a shrinking arc paints a sliver opposite its start. The
 * angular form keeps growing with the angle there, stays exact on the ring itself, and still
 * narrows to the centre, so a nearly closed wedge keeps its point instead of a flat end.
 */
fn sd_wedge(p: vec2f, start: f32, sweep: f32) -> f32 {
  let sweepAbs = abs(sweep);
  // A sweep that closed completely has no wedge at all; reporting the whole plane as covered
  // would paint a dot at the start of a zero-length arc.
  if (sweepAbs <= EPSILON) { return 1e6; }
  let angle = wrap_tau(atan2(p.y, p.x));
  var offset = wrap_tau(angle - start);
  if (sweep < 0.0) { offset = wrap_tau(start - angle); }
  // Negative while inside the wedge, otherwise the angle past the nearer end.
  let over = min(offset - sweepAbs, TAU - offset);
  return over * length(p);
}

/** Sector of any sweep: the disc, clipped to the angular wedge. A negative sweep runs the other way. */
fn sd_sector(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  let disc = length(p) - radius;
  if (abs(sweep) >= TAU - EPSILON) { return disc; }
  return max(disc, sd_wedge(p, start, sweep));
}

/** Circular segment: the disc on the arc side of the chord. Always convex. */
fn sd_segment_shape(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  if (abs(sweep) >= TAU - EPSILON) { return length(p) - radius; }
  let a = vec2f(cos(start), sin(start)) * radius;
  let b = vec2f(cos(start + sweep), sin(start + sweep)) * radius;
  let middle = vec2f(cos(start + sweep * 0.5), sin(start + sweep * 0.5)) * radius;
  var normal = vec2f(-(b.y - a.y), b.x - a.x);
  if (dot(normal, middle - a) < 0.0) { normal = -normal; }
  let unit = normal * inverseSqrt(max(dot(normal, normal), EPSILON));
  return max(length(p) - radius, -dot(p - a, unit));
}

fn shape_distance(shape: u32, p: vec2f, size: vec2f, vertexB: vec2f, vertexC: vec2f, params: vec4f, sides: u32) -> f32 {
  let cornerRadius = params.x;
  let startAngle = params.z;
  let sweep = params.w;
  switch shape {
    case SHAPE_RECT: { return sd_rounded_box(p, size, 0.0); }
    case SHAPE_ROUNDED_RECT: { return sd_rounded_box(p, size, cornerRadius); }
    case SHAPE_CIRCLE: { return sd_ellipse(p, size); }
    case SHAPE_ELLIPSE: { return sd_ellipse(p, size); }
    // An arc has no interior: the ring alone ignores the angles, so it is clipped to the swept
    // wedge. Filling one still yields a hairline, because the distance stays unsigned.
    case SHAPE_ARC: { return max(abs(length(p) - size.x), sd_sector(p, size.x, startAngle, sweep)); }
    case SHAPE_ANNULUS: { return sd_annulus(p, size.y, size.x); }
    case SHAPE_CAPSULE: { return sd_capsule(p, size.y, size.x); }
    case SHAPE_POLYGON: { return sd_regular_polygon(p, size.x, sides); }
    case SHAPE_TRIANGLE: { return sd_triangle(p, size, vertexB, vertexC); }
    case SHAPE_RHOMBUS: { return sd_rhombus(p, size.x, size.y); }
    case SHAPE_SECTOR: { return sd_sector(p, size.x, startAngle, sweep); }
    case SHAPE_SEGMENT: { return sd_segment_shape(p, size.x, startAngle, sweep); }
    default: { return 1e6; }
  }
}

/**
 * Perimeter parameter of the point on a rectangle's outline nearest to the sample, measured
 * anticlockwise from the (sx, sy) corner. The stroke only touches pixels within a pixel or two
 * of the outline, so picking the closer of the two candidate edges there is exact.
 */
fn rect_perimeter(p: vec2f, halfSize: vec2f) -> f32 {
  let sx = halfSize.x;
  let sy = halfSize.y;
  let q = clamp(p, -halfSize, halfSize);
  let overX = abs(p.x) - sx;
  let overY = abs(p.y) - sy;
  if (overY >= overX) {
    if (p.y >= 0.0) { return sx - q.x; }
    return 2.0 * sx + 2.0 * sy + (sx + q.x);
  }
  if (p.x < 0.0) { return 2.0 * sx + (sy - q.y); }
  return 4.0 * sx + 2.0 * sy + (q.y + sy);
}

/**
 * Closed-outline length in shape-space units, or -1 for an open outline (an arc). A closed
 * outline snaps its dash period to a whole number of periods, so the pattern meets itself at the
 * perimeter start instead of jumping by P mod period. An annulus strokes two separate circles, so
 * the length follows whichever ring the sample sits on and each ring closes on its own.
 */
fn perimeter_total(shape: u32, p: vec2f, size: vec2f, vertexB: vec2f, vertexC: vec2f, params: vec4f, sides: u32) -> f32 {
  switch shape {
    case SHAPE_RECT: { return 4.0 * (size.x + size.y); }
    case SHAPE_ROUNDED_RECT: {
      let corner = clamp(params.x, 0.0, min(size.x, size.y));
      let inner = max(size - vec2f(corner), vec2f(0.0));
      return 4.0 * (inner.x + inner.y) + 2.0 * PI * corner;
    }
    case SHAPE_CIRCLE: { return TAU * size.x; }
    case SHAPE_ELLIPSE: { return ellipse_arc(TAU, size); }
    case SHAPE_ARC: { return -1.0; }
    case SHAPE_ANNULUS: {
      if (abs(length(p) - size.x) <= abs(length(p) - size.y)) { return TAU * size.x; }
      return TAU * size.y;
    }
    case SHAPE_CAPSULE: { return 2.0 * PI * size.x + 4.0 * size.y; }
    case SHAPE_POLYGON: {
      let count = max(sides, 3u);
      return 2.0 * f32(count) * size.x * sin(PI / f32(count));
    }
    case SHAPE_TRIANGLE: {
      return length(vertexB - size) + length(vertexC - vertexB) + length(size - vertexC);
    }
    case SHAPE_RHOMBUS: { return 4.0 * length(vec2f(0.0, size.y) - vec2f(size.x, 0.0)); }
    case SHAPE_SECTOR: { return abs(params.w) * size.x + 2.0 * size.x; }
    case SHAPE_SEGMENT: {
      let sweepAbs = abs(params.w);
      return sweepAbs * size.x + 2.0 * size.x * sin(sweepAbs * 0.5);
    }
    default: { return -1.0; }
  }
}

/** Wraps an angle into [0, TAU). */
fn wrap_tau(angle: f32) -> f32 {
  let wrapped = angle % TAU;
  return select(wrapped + TAU, wrapped, wrapped >= 0.0);
}

/** Distance from the sample to the segment a-b, and how far along that segment it sits. */
fn nearest_edge(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let edge = b - a;
  let along = clamp(dot(p - a, edge) / max(dot(edge, edge), EPSILON), 0.0, 1.0);
  return vec2f(length(p - (a + edge * along)), along * length(edge));
}

/**
 * Arc length of an ellipse from angle 0 to theta, Simpson-integrated in 12 steps. The ellipse
 * has no elementary arc-length formula, so this is the one shape whose dash spacing is an
 * approximation rather than a closed form.
 */
fn ellipse_arc(theta: f32, radii: vec2f) -> f32 {
  let steps = 12u;
  let h = theta / f32(steps);
  var sum = 0.0;
  for (var i = 0u; i <= steps; i += 1u) {
    let a = h * f32(i);
    let speed = sqrt(radii.x * radii.x * sin(a) * sin(a) + radii.y * radii.y * cos(a) * cos(a));
    var weight = 2.0;
    if (i == 0u || i == steps) { weight = 1.0; }
    else if (i % 2u == 1u) { weight = 4.0; }
    sum = sum + weight * speed;
  }
  return sum * h / 3.0;
}

/** Rounded rectangle: four straight edges and four quarter arcs, from the top-right corner. */
fn rounded_rect_perimeter(p: vec2f, halfSize: vec2f, cornerRadius: f32) -> f32 {
  let corner = clamp(cornerRadius, 0.0, min(halfSize.x, halfSize.y));
  let inner = max(halfSize - vec2f(corner), vec2f(0.0));
  let center = clamp(p, -inner, inner);
  let delta = p - center;
  let straightX = 2.0 * inner.x;
  let straightY = 2.0 * inner.y;
  let quarter = corner * PI * 0.5;
  let leftBase = straightX + quarter;
  let bottomBase = straightX + 2.0 * quarter + straightY;
  // Right edge starts after the bottom-right quarter arc: two straight runs, three quarter
  // arcs and one straight height have already been walked.
  let rightBase = 2.0 * straightX + 3.0 * quarter + straightY;
  let topRightBase = 2.0 * straightX + 2.0 * straightY + 3.0 * quarter;
  if (abs(delta.x) > EPSILON && abs(delta.y) > EPSILON) {
    let phi = wrap_tau(atan2(delta.y, delta.x));
    if (phi < PI * 0.5) { return topRightBase + phi * corner; }
    if (phi < PI) { return straightX + (phi - PI * 0.5) * corner; }
    if (phi < PI * 1.5) { return leftBase + straightY + (phi - PI) * corner; }
    return bottomBase + straightX + (phi - PI * 1.5) * corner;
  }
  if (abs(delta.y) > EPSILON) {
    if (delta.y > 0.0) { return inner.x - p.x; }
    return bottomBase + (p.x + inner.x);
  }
  if (delta.x > 0.0) { return rightBase + (p.y + inner.y); }
  return leftBase + (inner.y - p.y);
}

/** Capsule: upper cap, left edge, lower cap, right edge, from the upper-right cap start. */
fn capsule_perimeter(p: vec2f, radius: f32, halfLength: f32) -> f32 {
  let arc = PI * radius;
  if (p.y >= halfLength) {
    return clamp(atan2(p.y - halfLength, p.x), 0.0, PI) * radius;
  }
  if (p.y <= -halfLength) {
    let angle = clamp(wrap_tau(atan2(p.y + halfLength, p.x)), PI, TAU);
    return arc + 2.0 * halfLength + (angle - PI) * radius;
  }
  if (p.x >= 0.0) { return 2.0 * arc + 2.0 * halfLength + (p.y + halfLength); }
  return arc + (halfLength - p.y);
}

/**
 * Annulus: the outer boundary is walked forwards and the inner one backwards, both from the +x
 * seam. Each ring measures its own circumference, so both close there instead of the inner ring
 * inheriting the outer one's leftover phase (which left a stub at the seam).
 */
fn annulus_perimeter(p: vec2f, outer: f32, inner: f32) -> f32 {
  let radius = length(p);
  let angle = wrap_tau(atan2(p.y, p.x));
  if (abs(radius - outer) <= abs(radius - inner)) { return angle * outer; }
  return (TAU - angle) * inner;
}

/**
 * Arc: only the swept wedge has a perimeter. A sample past an end reads the nearer end, because the
 * half stroke left over the cap sits within a couple of pixels of it: clamping every one of them to
 * the far end instead would paint a stub in the far end's phase. The value has to stay
 * non-negative, since the fragment stage reads a negative perimeter as "this shape has no dash".
 */
fn arc_perimeter(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  let sweepAbs = abs(sweep);
  let angle = wrap_tau(atan2(p.y, p.x));
  var offset = wrap_tau(angle - start);
  if (sweep < 0.0) { offset = wrap_tau(start - angle); }
  if (offset <= sweepAbs) { return offset * radius; }
  let pastEnd = offset - sweepAbs;
  let pastStart = TAU - offset;
  if (pastStart < pastEnd) { return 0.0; }
  return sweepAbs * radius;
}

/** Sector: arc, then the radius at the arc end, then the radius back to the arc start. */
fn sector_perimeter(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  let sweepAbs = abs(sweep);
  let angle = wrap_tau(atan2(p.y, p.x));
  var offset = wrap_tau(angle - start);
  if (sweep < 0.0) { offset = wrap_tau(start - angle); }
  let startDir = vec2f(cos(start), sin(start)) * radius;
  let endDir = vec2f(cos(start + sweep), sin(start + sweep)) * radius;
  let startEdge = nearest_edge(p, vec2f(0.0), startDir);
  let endEdge = nearest_edge(p, vec2f(0.0), endDir);
  let arcLength = sweepAbs * radius;
  let arcDistance = select(abs(length(p) - radius), min(length(p - startDir), length(p - endDir)), offset > sweepAbs);
  if (arcDistance <= startEdge.x && arcDistance <= endEdge.x) {
    return min(offset, sweepAbs) * radius;
  }
  if (endEdge.x <= startEdge.x) { return arcLength + (radius - endEdge.y); }
  return arcLength + radius + startEdge.y;
}

/** Segment: the arc, then the chord from the arc end back to its start. */
fn segment_perimeter(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  let sweepAbs = abs(sweep);
  let angle = wrap_tau(atan2(p.y, p.x));
  var offset = wrap_tau(angle - start);
  if (sweep < 0.0) { offset = wrap_tau(start - angle); }
  let arcStart = vec2f(cos(start), sin(start)) * radius;
  let arcEnd = vec2f(cos(start + sweep), sin(start + sweep)) * radius;
  let chord = nearest_edge(p, arcEnd, arcStart);
  let arcLength = sweepAbs * radius;
  let arcDistance = select(abs(length(p) - radius), min(length(p - arcStart), length(p - arcEnd)), offset > sweepAbs);
  if (arcDistance <= chord.x) { return min(offset, sweepAbs) * radius; }
  return arcLength + chord.y;
}

/** Regular polygon: pick the angular sector, then the projection onto that edge. */
fn polygon_perimeter(p: vec2f, radius: f32, sides: u32) -> f32 {
  let count = max(sides, 3u);
  let step = TAU / f32(count);
  let edgeLength = 2.0 * radius * sin(PI / f32(count));
  let angle = wrap_tau(atan2(p.y, p.x));
  let index = min(u32(floor(angle / step)), count - 1u);
  let start = vec2f(cos(step * f32(index)), sin(step * f32(index))) * radius;
  let end = vec2f(cos(step * f32(index + 1u)), sin(step * f32(index + 1u))) * radius;
  return f32(index) * edgeLength + nearest_edge(p, start, end).y;
}

/** Triangle: three edges, from the first vertex. */
fn triangle_perimeter(p: vec2f, a: vec2f, b: vec2f, c: vec2f) -> f32 {
  let ab = nearest_edge(p, a, b);
  let bc = nearest_edge(p, b, c);
  let ca = nearest_edge(p, c, a);
  let lab = length(b - a);
  let lbc = length(c - b);
  if (ab.x <= bc.x && ab.x <= ca.x) { return ab.y; }
  if (bc.x <= ca.x) { return lab + bc.y; }
  return lab + lbc + ca.y;
}

/** Rhombus: four edges through the four diagonal tips, from the +x tip. */
fn rhombus_perimeter(p: vec2f, halfWidth: f32, halfHeight: f32) -> f32 {
  let v0 = vec2f(halfWidth, 0.0);
  let v1 = vec2f(0.0, halfHeight);
  let v2 = vec2f(-halfWidth, 0.0);
  let v3 = vec2f(0.0, -halfHeight);
  let e0 = nearest_edge(p, v0, v1);
  let e1 = nearest_edge(p, v1, v2);
  let e2 = nearest_edge(p, v2, v3);
  let e3 = nearest_edge(p, v3, v0);
  let l0 = length(v1 - v0);
  let l1 = length(v2 - v1);
  let l2 = length(v3 - v2);
  if (e0.x <= e1.x && e0.x <= e2.x && e0.x <= e3.x) { return e0.y; }
  if (e1.x <= e2.x && e1.x <= e3.x) { return l0 + e1.y; }
  if (e2.x <= e3.x) { return l0 + l1 + e2.y; }
  return l0 + l1 + l2 + e3.y;
}

/**
 * Arc length along the outline at the nearest outline point, in shape-space units. Every
 * primitive now has a closed form except the ellipse, which is integrated numerically.
 */
fn perimeter_length(shape: u32, p: vec2f, size: vec2f, vertexB: vec2f, vertexC: vec2f, params: vec4f, sides: u32) -> f32 {
  switch shape {
    case SHAPE_RECT: { return rect_perimeter(p, size); }
    case SHAPE_ROUNDED_RECT: { return rounded_rect_perimeter(p, size, params.x); }
    case SHAPE_CIRCLE: { return wrap_tau(atan2(p.y, p.x)) * size.x; }
    case SHAPE_ELLIPSE: {
      let theta = wrap_tau(atan2(p.y / max(size.y, EPSILON), p.x / max(size.x, EPSILON)));
      return ellipse_arc(theta, size);
    }
    case SHAPE_ARC: { return arc_perimeter(p, size.x, params.z, params.w); }
    case SHAPE_ANNULUS: { return annulus_perimeter(p, size.x, size.y); }
    case SHAPE_CAPSULE: { return capsule_perimeter(p, size.x, size.y); }
    case SHAPE_POLYGON: { return polygon_perimeter(p, size.x, sides); }
    case SHAPE_TRIANGLE: { return triangle_perimeter(p, size, vertexB, vertexC); }
    case SHAPE_RHOMBUS: { return rhombus_perimeter(p, size.x, size.y); }
    case SHAPE_SECTOR: { return sector_perimeter(p, size.x, params.z, params.w); }
    case SHAPE_SEGMENT: { return segment_perimeter(p, size.x, params.z, params.w); }
    default: { return -1.0; }
  }
}

fn clip_to_framebuffer(clip: vec4f) -> vec2f {
  let ndc = clip.xy / max(clip.w, EPSILON);
  return vec2f((ndc.x * 0.5 + 0.5) * camera.viewportSize.x, (0.5 - ndc.y * 0.5) * camera.viewportSize.y);
}

@vertex fn vs_main(input: In, @builtin(vertex_index) vertex: u32) -> Out {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let clip = camera.viewProjection * vec4f(input.center, 1.0);
  let scale = max(camera.pixelsPerUnit, EPSILON);
  let rotation = input.rotationRadius.x;
  let radius = input.rotationRadius.y;
  // A stroke extends past the shape, so the quad has to cover its outer edge too.
  let stroke = select(input.params.y, 0.0, (input.flags & 1u) != 0u);
  let extent = radius + stroke * 0.5 / scale;
  let offset = corners[vertex] * extent * scale;

  var out: Out;
  out.position = vec4f(
    clip.x + offset.x / camera.viewportSize.x * 2.0 * clip.w,
    clip.y - offset.y / camera.viewportSize.y * 2.0 * clip.w,
    // The 2D layer pins itself to the near plane and never writes depth, like screen-space text.
    0.0,
    clip.w,
  );
  out.color = input.color;
  out.shape = input.shape;
  out.centerPixel = clip_to_framebuffer(clip);
  out.size = input.size;
  out.vertexB = input.vertexB;
  out.vertexC = input.vertexC;
  out.params = input.params;
  out.rotation = rotation;
  out.sides = (input.flags >> 8u) & 0xffu;
  out.flags = input.flags;
  out.dash = input.dash;
  return out;
}

@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let pixelOffset = input.position.xy - input.centerPixel;
  let scale = max(camera.pixelsPerUnit, EPSILON);
  // Undo the space's y direction so the shape sees the coordinates it was authored in.
  let offset = vec2f(pixelOffset.x, pixelOffset.y * camera.yFlip) / scale;
  let local = rotate2(offset, -input.rotation);

  let distanceLocal = shape_distance(input.shape, local, input.size, input.vertexB, input.vertexC, input.params, input.sides);
  let distancePixel = distanceLocal * scale;
  let filled = (input.flags & 1u) != 0u;
  // Relative to the outer edge of the stroke, so one coverage ramp serves fill and stroke alike.
  let signedPixel = select(abs(distancePixel) - max(input.params.y, 0.0) * 0.5, distancePixel, filled);
  let width = max(fwidth(signedPixel), EPSILON);
  var coverage = clamp(0.5 - signedPixel / width, 0.0, 1.0);
  if (coverage <= 0.0) { discard; }

  // Dashed outlines: walk the perimeter parameter and cut the stroke in the gaps. The transition
  // is spread over one canvas pixel so a dash edge is as soft as the shape's own edge.
  if ((input.flags & 1u) == 0u && input.dash.y > 0.0) {
    let path = perimeter_length(input.shape, local, input.size, input.vertexB, input.vertexC, input.params, input.sides);
    if (path >= 0.0) {
      let requested = input.dash.x + input.dash.y;
      let total = perimeter_total(input.shape, local, input.size, input.vertexB, input.vertexC, input.params, input.sides);
      var period = requested;
      var visible = input.dash.x;
      if (total > 0.0) {
        // Snap the period to a whole number of turns, keeping the requested duty cycle: the
        // closed outline then ends exactly where its dash pattern started.
        let count = max(round(total / requested), 1.0);
        period = total / count;
        visible = period * (input.dash.x / requested);
      }
      let along = fract((path + input.dash.z) / period) * period;
      let pixel = 1.0 / scale;
      // Distance to the nearest pattern boundary: the dash start, the dash end, and the next
      // dash start that fract() wraps around to.
      let edge = min(min(along, abs(along - visible)), period - along);
      var dashCoverage = smoothstep(0.0, pixel, edge);
      if (along > visible) { dashCoverage = 1.0 - dashCoverage; }
      coverage = coverage * dashCoverage;
    }
  }
  if (coverage <= 0.0) { discard; }
  return vec4f(input.color.rgb, input.color.a * coverage);
}
`;
}
