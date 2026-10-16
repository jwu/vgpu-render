import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameRecorder } from "../src/frame-recorder.js";
import { OutlineGlyphRasterizer } from "../src/text-msdf-font.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WIDTH = 128;
const HEIGHT = 64;


function litCount(pixels: Uint8Array): number {
  let lit = 0;
  for (let index = 1; index < pixels.length; index += 4) if (pixels[index]! > 40) lit++;
  return lit;
}

async function render(build: (recorder: FrameRecorder) => void, font: OutlineGlyphRasterizer): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { text: { sources: { default: font } } });
    const debug = new DebugDraw3D();
    const recorder = debug.beginFrame();
    build(recorder);
    renderer.prepare(debug.finishFrame(recorder), { viewProjection: identity, view: identity });
    frame(gpu, (f) => {
      renderer.updateIndirect(f);
      f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
    });
    return await output.color.read({ mipLevel: 0, region: "all" });
  } finally {
    gpu.dispose();
  }
}

test("renders bundled TrueType outlines through the msdf path", async () => {
  const pixels = await render((recorder) => {
    // A 20 px "M" at 0.1 units/px is 2 world units, about 64 px on this target — magnified well past
    // the size it was encoded at. The anchor and position keep the block on screen.
    recorder.text([-0.55, 1.2, 0.5], "M", { fontSize: 20, pixelSize: 0.1, space: "world-billboard", anchor: "top-left", color: [0, 1, 0, 1] });
  }, new OutlineGlyphRasterizer());
  const lit = litCount(pixels);
  expect(lit).toBeGreaterThan(600);
  // "M" is two stems and a valley: real ink, but nowhere near a filled box of the same size.
  expect(lit).toBeLessThan(2500);
});

test("an msdf block still draws nothing when it is empty", async () => {
  const pixels = await render((recorder) => {
    recorder.text([0, 0, 0.5], "", { fontSize: 20, pixelSize: 0.1, space: "world-billboard" });
  }, new OutlineGlyphRasterizer());
  expect(litCount(pixels)).toBe(0);
});
