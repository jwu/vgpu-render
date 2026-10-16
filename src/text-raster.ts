/**
 * Raster-size selection for the on-demand glyph atlas.
 *
 * bevy keys a `FontAtlas` by font size and rasterises each size at the physical pixel size it will be
 * drawn at, so every font size comes out sharp and every font size pays for its own atlas. A debug
 * draw frame cannot afford that shape: its text changes size continuously (a world block follows the
 * camera) and a CJK glyph set is large, so one atlas per size would re-rasterise the same character
 * over and over and grow without any eviction.
 *
 * The fix is the one browsers use for their glyph cache: rasterise at the *screen* size the glyph
 * will occupy, quantised onto a fixed ladder of sizes. A size between two rungs takes the rung above
 * it — at most `step`× oversampled, which the mip chain covers when the block is drawn smaller — so
 * the glyphs the atlas holds stay bounded while the size keeps moving.
 */

/** Ratio between neighbouring rungs. 1.25 keeps the worst-case oversampling at a quarter of a texel. */
export const DEFAULT_RASTER_STEP = 1.25;

/** Smallest and largest raster rungs, in texels along the font size. Below `MIN_RASTER_PX` a stem is
 * thinner than a texel; above `MAX_RASTER_PX` a glyph costs more atlas area than it can pay for. */
export const MIN_RASTER_PX = 6;
export const MAX_RASTER_PX = 256;

/**
 * The smallest raster size on the ladder that covers `screenPx`.
 *
 * Rounding up rather than to the nearest rung is what keeps the atlas an upper bound on what the
 * screen asks for: a glyph is never magnified when it is decoded, only minified through the mip
 * chain, which is the direction that still looks sharp.
 */
export function quantizeRasterPx(
  screenPx: number,
  step: number = DEFAULT_RASTER_STEP,
  min: number = MIN_RASTER_PX,
  max: number = MAX_RASTER_PX,
): number {
  if (Number.isNaN(screenPx) || !(screenPx > min)) return min;
  if (screenPx >= max) return max;
  if (!(step > 1)) return Math.min(max, Math.ceil(screenPx));
  const exponent = Math.ceil(Math.log(screenPx / min) / Math.log(step));
  return Math.min(max, Math.max(min, Math.ceil(min * Math.pow(step, exponent))));
}

/** The raster scale a glyph of `fontSize` layout pixels needs in order to land on `rasterPx` texels. */
export function rasterScaleFor(rasterPx: number, fontSize: number): number {
  return fontSize > 0 ? rasterPx / fontSize : 1;
}

/**
 * Screen pixels one world unit covers at `point`, for the perspective and orthographic matrices the
 * camera writes.
 *
 * This is the same estimate the world-width shaders use (`viewProjection[1][1] * viewportSize.y *
 * 0.5 / clip.w`), so a raster size picked here agrees with the width the shaders compute for the
 * block. It ignores how the block's own plane is angled to the camera, which only matters for the
 * rung chosen; `quantizeRasterPx` absorbs a miss of one rung by oversampling.
 */
export function screenPixelsPerWorldUnit(
  viewProjection: ArrayLike<number>,
  point: readonly [number, number, number],
  viewportHeight: number,
): number {
  const [x, y, z] = point;
  const clipW = viewProjection[3]! * x + viewProjection[7]! * y + viewProjection[11]! * z + viewProjection[15]!;
  // Behind or on the near plane the projection has no finite scale; fall back to one pixel per unit
  // rather than returning a value that would send the raster ladder to its top rung.
  if (!(clipW > 1e-4)) return 1;
  const scale = Math.abs(viewProjection[5]!) * viewportHeight * 0.5 / clipW;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
