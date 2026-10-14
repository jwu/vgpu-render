import { expect, test } from "vitest";
import { init, target, frame } from "vgpu/node";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameCommand } from "../src/frame-recorder.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

test("real GPU renders continuous lines and centered pixel-sized points", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [256, 128], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4 });
    const commands: FrameCommand[] = [{
      kind: "line", start: [-0.8, 0, 0], end: [0.8, 0, 0],
      color: [0, 1, 0, 1], colorEnd: [0, 0, 1, 1],
      width: 16, widthMode: "screen", layer: 1,
    }];
    const render = async () => {
      renderer.prepare(commands, { viewProjection: identity });
      frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (p) => renderer.draw(p)));
      return output.color.read({ mipLevel: 0, region: "all" });
    };
    const pixels = await render();
    const lit = (data: Uint8Array, x: number, y: number) => {
      const i = (y * 256 + x) * 4;
      return data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10;
    };
    for (const x of [30, 64, 128, 192, 225]) expect(lit(pixels, x, 64)).toBe(true);
    let height = 0;
    for (let y = 0; y < 128; y++) if (lit(pixels, 128, y)) height++;
    expect(height).toBe(16);
    expect(lit(pixels, 128, 55)).toBe(false);
    commands.splice(0, 1, {
      kind: "point", position: [0, 0, 0], color: [1, 0, 0, 1],
      size: 16, sizeMode: "screen", layer: 1,
    });
    const pointPixels = await render();
    let count = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) if (lit(pointPixels, x, y)) count++;
    expect(count).toBe(256);
    expect(lit(pointPixels, 120, 56)).toBe(true);
    expect(lit(pointPixels, 135, 71)).toBe(true);
    expect(lit(pointPixels, 119, 64)).toBe(false);
    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});

test("real GPU preserves dash gaps along a line", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [256, 64], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 1 });
    renderer.prepare([{
      kind: "line", start: [-0.9, 0, 0], end: [0.9, 0, 0],
      color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1], width: 10,
      widthMode: "screen", dash: [0.18, 0.18, 0], layer: 1,
    }], { viewProjection: identity });
    frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (p) => renderer.draw(p)));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    const lit = (x: number) => pixels[(32 * 256 + x) * 4]! > 20;
    expect(lit(20)).toBe(true);
    expect(lit(45)).toBe(false);
    expect(lit(75)).toBe(true);
    renderer.destroy();
  } finally { gpu.dispose(); }
});

test("real GPU scales world-space line width with the projection", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [128, 128], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 1 });
    renderer.prepare([{
      kind: "line", start: [-0.5, 0, 0], end: [0.5, 0, 0],
      color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1], width: 0.25,
      widthMode: "world", layer: 1,
    }], { viewProjection: identity });
    frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (p) => renderer.draw(p)));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    let height = 0;
    for (let y = 0; y < 128; y++) if (pixels[(y * 128 + 64) * 4]! > 20) height++;
    expect(height).toBe(16);
    renderer.destroy();
  } finally { gpu.dispose(); }
});

test("real GPU fills triangles from transient solid commands", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [64, 64], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 1, triangles: 1 });
    renderer.prepare([{
      kind: "triangle", a: [-0.75, -0.75, 0], b: [0.75, -0.75, 0], c: [0, 0.75, 0],
      color: [1, 0.5, 0, 1], layer: 1,
    }], { viewProjection: identity });
    frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (p) => renderer.draw(p)));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    const lit = (x: number, y: number) => pixels[(y * 64 + x) * 4]! > 20;
    expect(lit(32, 40)).toBe(true);
    expect(lit(5, 30)).toBe(false);
    let count = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (lit(x, y)) count++;
    expect(count).toBeGreaterThan(1000);
    renderer.destroy();
  } finally { gpu.dispose(); }
});
