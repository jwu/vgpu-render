import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { InfiniteGrid2D, type InfiniteGrid2DOptions } from "../src/infinite-grid-2d.js";

const WIDTH = 256;
const HEIGHT = 128;

function channel(pixels: Uint8Array, x: number, y: number): number {
  return pixels[(y * WIDTH + x) * 4]!;
}

function lit(pixels: Uint8Array, x: number, y: number): boolean {
  return channel(pixels, x, y) > 10;
}

/**
 * Renders one frame of the grid. The white line colors keep the `source_color` decode out of the
 * thresholds, and a 2 px width makes a one-pixel rasterisation shift impossible to miss.
 */
async function render(
  camera: { readonly position: readonly [number, number]; readonly zoom: number },
  options: InfiniteGrid2DOptions = {},
  opacity = 1,
): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const grid = new InfiniteGrid2D(gpu, {
      thinLineColor: [1, 1, 1, 1],
      thickLineColor: [1, 1, 1, 1],
      lineWidthPixels: 2,
      ...options,
    });
    grid.setOpacity(opacity);
    frame(gpu, (f) => {
      f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => grid.draw(p, camera, [WIDTH, HEIGHT]));
    });
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    grid.destroy();
    return pixels;
  } finally {
    gpu.dispose();
  }
}

test("real GPU draws the decimal LOD grid for the 2D camera", async () => {
  const pixels = await render({ position: [0, 0], zoom: 1 });
  // Defaults: 10-unit cells at zoom 1, so lines land every 10 pixels around the canvas centre.
  // Row 58 is world y = 6, which is between the horizontal lines, so it isolates the verticals.
  expect(lit(pixels, 128, 58)).toBe(true);
  expect(lit(pixels, 138, 58)).toBe(true);
  expect(lit(pixels, 133, 58)).toBe(false);
  // Row 64 is the world-origin horizontal line, lit at every x.
  expect(lit(pixels, 134, 64)).toBe(true);
  expect(lit(pixels, 134, 58)).toBe(false);
  // The quad is transparent between lines, not filled.
  expect(lit(pixels, 133, 29)).toBe(false);
});

test("real GPU pans and zooms the 2D grid with the camera", async () => {
  const panned = await render({ position: [5, 0], zoom: 1 });
  // Panning by +5 world units moves the world-origin line 5 pixels left.
  expect(lit(panned, 123, 58)).toBe(true);
  expect(lit(panned, 128, 58)).toBe(false);

  const zoomed = await render({ position: [0, 0], zoom: 2 });
  // At 2 px per unit, a 10-unit cell spans 20 pixels.
  expect(lit(zoomed, 128, 58)).toBe(true);
  expect(lit(zoomed, 148, 58)).toBe(true);
  expect(lit(zoomed, 138, 58)).toBe(false);

  const hidden = await render({ position: [0, 0], zoom: 1 }, {}, 0);
  expect(lit(hidden, 128, 58)).toBe(false);
});

test("real GPU switches the 2D grid to the debug LOD palette", async () => {
  const pixels = await render({ position: [0, 0], zoom: 1 }, { debugLodColors: true });
  // The palette tints the coarse layer red at 100-unit cells; the thin layer stays blue.
  let red = 0;
  let blue = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index]! > 120) red++;
    if (pixels[index + 2]! > 120) blue++;
  }
  expect(red).toBeGreaterThan(0);
  expect(blue).toBeGreaterThan(0);
});
