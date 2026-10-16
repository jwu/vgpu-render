/**
 * Signed distance field generation for the glyph atlas.
 *
 * Canvas2D hands back an anti-aliased coverage mask, which is enough for the bitmap path but
 * cannot be rescaled: a texel says "80% ink", not "the edge is 0.3 px that way". A distance field
 * stores the latter, so the fragment stage can rebuild the edge at whatever magnification the
 * camera asks for instead of interpolating coverage between texels.
 *
 * The mask is binarised, an exact Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012)
 * gives the distance to the opposite side away from the edge, and partially covered texels override
 * that with the sub-texel offset their own coverage implies — the coverage carries the detail a
 * binary transform would throw away.
 *
 * Values are stored as `distance / (2 × range) + 0.5`, so 128 is the edge, and the field saturates
 * `range` texels either side. `range` is small on purpose: only the neighbourhood of the edge is
 * ever resampled, and a smaller range spends the 8 available bits on a narrower band.
 */

/** Distance in atlas texels that one side of the encoded range covers. */
export const DEFAULT_SDF_RANGE = 4;

const FAR = 1e20;

/**
 * Squared 1D distance transform, in place through `out`.
 *
 * Each input sample seeds a parabola `(q - i)² + f[i]` and the lower envelope of all of them is the
 * transform. The stack of parabolas is built in one forward pass and sampled in a second, which is
 * what makes this O(n) rather than O(n²) while staying exact.
 */
function edt1d(column: Float64Array, length: number, out: Float64Array): void {
  const vertex = new Int32Array(length);
  const boundary = new Float64Array(length + 1);
  let top = 0;
  vertex[0] = 0;
  boundary[0] = -FAR;
  boundary[1] = FAR;

  for (let q = 1; q < length; q++) {
    const qValue = column[q]! + q * q;
    let intersection = (qValue - (column[vertex[top]!]! + vertex[top]! * vertex[top]!)) / (2 * q - 2 * vertex[top]!);
    while (intersection <= boundary[top]!) {
      top--;
      intersection = (qValue - (column[vertex[top]!]! + vertex[top]! * vertex[top]!)) / (2 * q - 2 * vertex[top]!);
    }
    top++;
    vertex[top] = q;
    boundary[top] = intersection;
    boundary[top + 1] = FAR;
  }

  top = 0;
  for (let q = 0; q < length; q++) {
    while (boundary[top + 1]! < q) top++;
    const delta = q - vertex[top]!;
    out[q] = delta * delta + column[vertex[top]!]!;
  }
}

/** Exact squared Euclidean distance from every texel to the nearest set texel of `seeds`. */
function edtSquared(seeds: Uint8Array, width: number, height: number): Float64Array {
  const field = new Float64Array(width * height);
  for (let index = 0; index < field.length; index++) field[index] = seeds[index] !== 0 ? 0 : FAR;

  const longest = Math.max(width, height);
  const line = new Float64Array(longest);
  const transformed = new Float64Array(longest);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = field[y * width + x]!;
    edt1d(line.subarray(0, height), height, transformed.subarray(0, height));
    for (let y = 0; y < height; y++) field[y * width + x] = transformed[y]!;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) line[x] = field[row + x]!;
    edt1d(line.subarray(0, width), width, transformed.subarray(0, width));
    for (let x = 0; x < width; x++) field[row + x] = transformed[x]!;
  }
  return field;
}

/**
 * Turns one glyph's coverage mask into an 8-bit distance field, one byte per texel.
 *
 * Positive means inside the glyph. Wholly covered and wholly empty texels take their distance from
 * the transform; partially covered ones use `coverage - 0.5` instead, which is the sub-texel edge
 * offset for a straight edge crossing that texel and is what keeps the field smooth across the
 * boundary rather than quantised to whole texels.
 */
export function coverageToSdf(coverage: Uint8Array, width: number, height: number, range: number = DEFAULT_SDF_RANGE): Uint8Array {
  if (!(range > 0)) throw new RangeError("sdf range must be greater than zero");
  const size = width * height;
  if (coverage.length !== size) throw new RangeError(`coverage must hold ${size} texels`);

  const insideSeeds = new Uint8Array(size);
  const outsideSeeds = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    if (coverage[index]! > 127) insideSeeds[index] = 1;
    else outsideSeeds[index] = 1;
  }

  const distanceToInside = edtSquared(insideSeeds, width, height);
  const distanceToOutside = edtSquared(outsideSeeds, width, height);

  const scale = 1 / (2 * range);
  const result = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    const ink = coverage[index]! / 255;
    let signed: number;
    if (ink > 0 && ink < 1) signed = ink - 0.5;
    else if (ink >= 1) signed = Math.sqrt(distanceToOutside[index]!) - 0.5;
    else signed = -(Math.sqrt(distanceToInside[index]!) - 0.5);
    const encoded = Math.round((signed * scale + 0.5) * 255);
    result[index] = encoded < 0 ? 0 : encoded > 255 ? 255 : encoded;
  }
  return result;
}
