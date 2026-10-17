/**
 * 2D projection math for the debug-draw layer.
 *
 * Two spaces share one pixel-based pipeline:
 *
 * - `world2d` mirrors bevy's `Camera2d`: the origin sits at the canvas centre, +y points up,
 *   and at `zoom = 1` one world unit covers one canvas pixel. `pan` translates the view in
 *   world units, `zoom` magnifies it. `2d_shapes`' `X_EXTENT = 1000` is such a pixel-scale
 *   world coordinate, not a top-left origin one.
 * - `screen` is the top-left origin, +y down pixel space the text renderer already uses for
 *   `TextSpace "screen"`, unaffected by pan or zoom.
 *
 * Both end up as a clip-space matrix, which is what lets the 2D primitives reuse the 3D line,
 * point and joint shaders unchanged: those already compute their screen-space geometry after
 * the projection, so they only need `viewProjection * position` to land the primitive. The
 * matrices below produce `z = 0, w = 1`, i.e. the near plane, which is also where a screen-space
 * text block pins itself.
 */

/** A point or direction in one of the 2D spaces. */
export type Vec2 = readonly [number, number];

/** Which 2D space a command is drawn in. See the module comment for the difference. */
export type Space2D = "world2d" | "screen";

export type Camera2D = {
  /** View translation in `world2d` units. Ignored by `screen` space. */
  readonly pan: Vec2;
  /** Canvas pixels per `world2d` unit. Larger magnifies; must be greater than zero. */
  readonly zoom: number;
};

export const DEFAULT_CAMERA_2D: Camera2D = { pan: [0, 0], zoom: 1 };

/**
 * Floors a target size at one pixel. `pass.target.size` is `[0, 0]` until the first resize,
 * and a degenerate matrix would make the whole layer disappear rather than merely misfit.
 */
function extent(viewportSize: Vec2): Vec2 {
  return [Math.max(viewportSize[0], 1), Math.max(viewportSize[1], 1)];
}

/**
 * Clip matrix for `world2d`, column-major like the view matrices in `demo-camera.ts`.
 *
 * `x_clip = 2 · zoom · (x - pan.x) / width`, and `y_clip` keeps +y up: a point above the pan
 * lands nearer the top of the target.
 */
export function world2dProjection(camera: Camera2D, viewportSize: Vec2): Float32Array {
  if (!(camera.zoom > 0)) {
    throw new RangeError("camera2d.zoom must be greater than zero");
  }
  const [width, height] = extent(viewportSize);
  const scaleX = (2 * camera.zoom) / width;
  const scaleY = (2 * camera.zoom) / height;
  return new Float32Array([
    scaleX, 0, 0, 0,
    0, scaleY, 0, 0,
    0, 0, 0, 0,
    -scaleX * camera.pan[0], -scaleY * camera.pan[1], 0, 1,
  ]);
}

/** Clip matrix for the top-left origin `screen` space: `x_clip = 2x/width - 1`, `y` flipped. */
export function screenProjection(viewportSize: Vec2): Float32Array {
  const [width, height] = extent(viewportSize);
  return new Float32Array([
    2 / width, 0, 0, 0,
    0, -2 / height, 0, 0,
    0, 0, 0, 0,
    -1, 1, 0, 1,
  ]);
}

export function projection2D(space: Space2D, camera: Camera2D, viewportSize: Vec2): Float32Array {
  return space === "screen" ? screenProjection(viewportSize) : world2dProjection(camera, viewportSize);
}

/** Converts a `world2d` point to top-left origin canvas pixels, the inverse of {@link screenToWorld2d}. */
export function world2dToScreen(point: Vec2, camera: Camera2D, viewportSize: Vec2): Vec2 {
  const [width, height] = extent(viewportSize);
  return [
    (point[0] - camera.pan[0]) * camera.zoom + width / 2,
    height / 2 - (point[1] - camera.pan[1]) * camera.zoom,
  ];
}

/** Converts top-left origin canvas pixels to a `world2d` point, the inverse of {@link world2dToScreen}. */
export function screenToWorld2d(point: Vec2, camera: Camera2D, viewportSize: Vec2): Vec2 {
  const [width, height] = extent(viewportSize);
  return [
    (point[0] - width / 2) / camera.zoom + camera.pan[0],
    (height / 2 - point[1]) / camera.zoom + camera.pan[1],
  ];
}
