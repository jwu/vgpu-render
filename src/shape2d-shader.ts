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

/** Sector of at most half a turn: the intersection of the disc and the two edge half-planes. */
fn sd_convex_sector(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  let end = start + sweep;
  // Inward normals of the two straight edges, in the order the sweep turns.
  let startEdge = vec2f(sin(start), -cos(start));
  let endEdge = vec2f(-sin(end), cos(end));
  return max(length(p) - radius, max(dot(p, startEdge), dot(p, endEdge)));
}

/**
 * Sector of any sweep. Past half a turn the two half-planes would bound the complementary wedge
 * instead, so the complement is subtracted from the disc. A negative sweep runs the other way.
 */
fn sd_sector(p: vec2f, radius: f32, start: f32, sweep: f32) -> f32 {
  let disc = length(p) - radius;
  if (abs(sweep) >= TAU - EPSILON) { return disc; }
  if (abs(sweep) <= PI) { return max(disc, sd_convex_sector(p, radius, start, sweep)); }
  let complementSweep = select(TAU + sweep, TAU - sweep, sweep > 0.0);
  let complement = sd_convex_sector(p, radius, start + sweep, complementSweep);
  return max(disc, -complement);
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
    // An arc has no interior: its distance is unsigned, so filling one yields a hairline.
    case SHAPE_ARC: { return abs(length(p) - size.x); }
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
  let coverage = clamp(0.5 - signedPixel / width, 0.0, 1.0);
  if (coverage <= 0.0) { discard; }
  return vec4f(input.color.rgb, input.color.a * coverage);
}
`;
}
