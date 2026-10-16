import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameRecorder } from "../src/frame-recorder.js";
import { BAKED_MSDF_PAGE_GZIP_BASE64 } from "../src/assets/fira-mono-msdf-atlas.js";
import type { TextFontSource } from "../src/gpu-text-3d.js";
import { decodeBase64Bytes } from "../src/text-font.js";
import { BakedMsdfRasterizer } from "../src/text-msdf-baked.js";
import { OutlineGlyphRasterizer } from "../src/text-msdf-font.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WIDTH = 128;
const HEIGHT = 64;

function litCount(pixels: Uint8Array): number {
  let lit = 0;
  for (let index = 1; index < pixels.length; index += 4) if (pixels[index]! > 40) lit++;
  return lit;
}

async function renderM(font: TextFontSource): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { text: { sources: { default: font } } });
    const debug = new DebugDraw3D();
    const recorder = debug.beginFrame();
    recorder.text([-0.55, 1.2, 0.5], "M", { fontSize: 20, pixelSize: 0.1, space: "world-billboard", anchor: "top-left", color: [0, 1, 0, 1] });
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

test("the prebaked atlas decompresses into a page", async () => {
  // The payload travels gzipped and base64'd, which is what keeps image decoding out of the path.
  expect(Array.from(decodeBase64Bytes(BAKED_MSDF_PAGE_GZIP_BASE64).subarray(0, 2))).toEqual([0x1f, 0x8b]);

  const font = new BakedMsdfRasterizer();
  expect(font.ready).toBe(false);
  await font.load();
  expect(font.ready).toBe(true);
  expect(font.encoding).toBe("msdf");
  expect(font.bakeSize).toBe(24);
});

test("metrics scale with the requested font size", async () => {
  const font = new BakedMsdfRasterizer();
  await font.load();
  const small = font.glyphMetrics("M", "test", 24);
  const large = font.glyphMetrics("M", "test", 48);
  expect(large.advance).toBeCloseTo(small.advance * 2, 3);
  expect(large.bearingTop).toBeCloseTo(small.bearingTop * 2, 3);
});

test("agrees with the on-demand encoder", async () => {
  const baked = new BakedMsdfRasterizer();
  await baked.load();
  const live = new OutlineGlyphRasterizer();
  const fromBake = baked.glyphMetrics("M", "test", 48);
  const fromLive = live.glyphMetrics("M", "test", 48);
  expect(fromBake.advance).toBeCloseTo(fromLive.advance, 3);
  expect(fromBake.bearingTop).toBeCloseTo(fromLive.bearingTop, 2);
  // The bake quantises ink boxes to whole texels at 24 px, so a sub-texel difference is expected —
  // and it doubles when the metrics are scaled to 48 px here.
  expect(Math.abs(fromBake.width - fromLive.width)).toBeLessThan(2);
});

test("has nothing for characters outside the baked set", async () => {
  const font = new BakedMsdfRasterizer();
  await font.load();
  expect(font.rasterize("中", "test", 24)).toBeUndefined();
  expect(font.rasterize(" ", "test", 24)).toBeUndefined();
});

test("draws the same block as the on-demand encoder", async () => {
  const baked = new BakedMsdfRasterizer();
  await baked.load();
  const [fromBake, fromLive] = await Promise.all([renderM(baked), renderM(new OutlineGlyphRasterizer())]);
  const bakedLit = litCount(fromBake);
  expect(bakedLit).toBeGreaterThan(600);
  // Same glyph from the same outlines: coverage should agree well within a tenth.
  expect(Math.abs(bakedLit - litCount(fromLive))).toBeLessThan(bakedLit * 0.1);
});
