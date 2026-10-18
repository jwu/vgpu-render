import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { FrameDrawList, type Vec3 } from "../src/frame-draw-list.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

test("subdividing a dashed path preserves every GPU dash and gap pixel", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 64 });
  try {
    const output = target(gpu, { size: [256, 64], depth: true });
    const render = async (points: readonly Vec3[]) => {
      const drawList = new FrameDrawList();
      drawList.lineStrip(points, { width: 10, dash: [0.18, 0.18, -0.07] });
      renderer.prepare(drawList.commands(), { viewProjection: identity, view: identity });
      frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => renderer.draw(pass)));
      return output.color.read({ mipLevel: 0, region: "all" });
    };
    const single = await render([[-0.9, 0, 0], [0.9, 0, 0]]);
    const segmented = await render(Array.from({ length: 33 }, (_, i): Vec3 => [-0.9 + i * 1.8 / 32, 0, 0]));
    for (let x = 16; x < 240; x++) {
      expect(segmented[(32 * 256 + x) * 4]! > 20).toBe(single[(32 * 256 + x) * 4]! > 20);
    }
    const lit = Array.from({ length: 224 }, (_, i) => single[(32 * 256 + 16 + i) * 4]! > 20);
    expect(lit.filter(Boolean).length).toBeGreaterThan(70);
    expect(lit.filter((v) => !v).length).toBeGreaterThan(70);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});

test("closed and inherited dashed paths accumulate phase without mutating defaults", () => {
  const dash = [0.1, 0.2, 0.07] as const;
  const drawList = new FrameDrawList({ line: { dash } });
  drawList.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], {}, true);
  expect(drawList.lines.map((line) => line.dash![2])).toEqual([0.07, 1.07, 2.07]);
  drawList.line([0, 0, 0], [1, 0, 0]);
  expect(drawList.lines[3]!.dash).toEqual(dash);
});

test("dash gaps keep their joint command and defer the phase to the GPU", () => {
  const drawList = new FrameDrawList();
  drawList.lineStrip([[0, 0, 0], [0.15, 0, 0], [0.3, 0, 0]], { joint: "round", dash: [0.1, 0.2, 0] });
  // The wedge is emitted for every joined vertex; whether it survives the phase test is
  // decided per fragment on the GPU, exactly like the reference joint shader.
  expect(drawList.points).toHaveLength(0);
  expect(drawList.joints).toHaveLength(1);
  expect(drawList.joints[0]!.center).toEqual([0.15, 0, 0]);
  expect(drawList.joints[0]!.dash).toEqual([0.1, 0.2, 0.15]);
});

test("round GPU points discard corners while preserving square point behavior", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 1 });
  try {
    const output = target(gpu, { size: [64, 64], depth: true });
    const drawList = new FrameDrawList();
    drawList.point([0, 0, 0], { size: 16, round: true });
    renderer.prepare(drawList.commands(), { viewProjection: identity, view: identity });
    frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => renderer.draw(pass)));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    expect(pixels[(32 * 64 + 32) * 4]! > 20).toBe(true);
    expect(pixels[(24 * 64 + 24) * 4]! > 20).toBe(false);
    const count = Array.from(pixels).filter((value, i) => i % 4 === 0 && value > 20).length;
    expect(count).toBeGreaterThan(180);
    expect(count).toBeLessThan(230);
  } finally { renderer.destroy(); gpu.dispose(); }
});
