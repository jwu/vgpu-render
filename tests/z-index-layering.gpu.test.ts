import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameDrawList } from "../src/frame-draw-list.js";
import { SyntheticFont } from "./support/synthetic-font.js";

/**
 * The layering contract in `docs/z-index.md`: 2D primitives and text share one `zIndex` key, a
 * higher key is drawn later and therefore covers a lower one, and equal keys keep the pre-`zIndex`
 * order of 2D first, then text.
 *
 * The scene is one opaque red rectangle with one green label inside it. Red and green never share
 * a channel, so counting green pixels answers "did the label survive" without tolerance picking.
 */

const WIDTH = 128;
const HEIGHT = 64;
const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const RED = [1, 0, 0, 1] as const;
const GREEN = [0, 1, 0, 1] as const;

/** The rectangle covers x 40..88, y 20..44; the label's 8×8 ink box sits inside it. */
const RECT_CENTER = [64, 32] as const;
const RECT_SIZE = [48, 24] as const;
const LABEL_AT = [44, 24, 0] as const;

function greenCount(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 1; index < pixels.length; index += 4) if (pixels[index]! > 40) count++;
  return count;
}

function redCount(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) if (pixels[index]! > 100) count++;
  return count;
}

async function render(build: (drawList: FrameDrawList) => void): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { text: { sources: { default: new SyntheticFont("bitmap") } } });
    const debug = new DebugDraw3D();
    const drawList = debug.beginFrame();
    build(drawList);
    renderer.prepare(debug.finishFrame(drawList), { viewProjection: identity, view: identity });
    frame(gpu, (f) => {
      renderer.updateIndirect(f);
      f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
    });
    return await output.color.read({ mipLevel: 0, region: "all" });
  } finally {
    gpu.dispose();
  }
}

/** A screen-space label at `zIndex`, inside an opaque rectangle at `rectZIndex`. */
function scene(rectZIndex: number, labelZIndex: number) {
  return (drawList: FrameDrawList): void => {
    drawList.d2.rect_s(RECT_CENTER, RECT_SIZE, { color: RED, space: "screen", zIndex: rectZIndex });
    drawList.text(LABEL_AT, "A", { fontSize: 16, space: "screen", anchor: "top-left", color: GREEN, zIndex: labelZIndex });
  };
}

test("equal keys keep the pre-zIndex order: the 2D layer draws first, so text stays on top", async () => {
  const pixels = await render(scene(0, 0));
  expect(redCount(pixels)).toBeGreaterThan(500);
  expect(greenCount(pixels)).toBeGreaterThan(0);
});

test("a higher 2D key covers the label", async () => {
  const pixels = await render(scene(1, 0));
  expect(redCount(pixels)).toBeGreaterThan(500);
  expect(greenCount(pixels)).toBe(0);
});

test("a higher text key covers the 2D layer", async () => {
  const pixels = await render(scene(0, 1));
  expect(redCount(pixels)).toBeGreaterThan(500);
  expect(greenCount(pixels)).toBeGreaterThan(0);
});

test("the key decides across the whole range, not just adjacent values", async () => {
  const under = await render(scene(8, -8));
  expect(greenCount(under)).toBe(0);
  const over = await render(scene(-8, 8));
  expect(greenCount(over)).toBeGreaterThan(0);
});
