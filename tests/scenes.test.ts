import { expect, test } from "vitest";
import { init, target, frame } from "vgpu/node";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import { GODOT_EXAMPLES } from "../src/godot-examples.js";
import { buildScene } from "../src/godot-scenes.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function commandsFor(id: string, time = 0): number {
  const debug = new DebugDraw3D();
  const recorder = debug.beginFrame();
  buildScene(id, recorder, time);
  return debug.finishFrame(recorder).length;
}

test("every Godot example builds transient commands", () => {
  for (const example of GODOT_EXAMPLES) {
    const count = commandsFor(example.id, 0.4);
    expect(count, `${example.id} produced no commands`).toBeGreaterThan(0);
  }
});

test("animated scenes react to time", () => {
  const first = commandsFor("line", 0);
  const second = commandsFor("line", 1.5);
  expect(first).toBeGreaterThan(0);
  expect(second).toBeGreaterThan(0);
});

test("real GPU renders every Godot example without errors", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [160, 120], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 32768, lines: 131072, triangles: 131072 });
    for (const example of GODOT_EXAMPLES) {
      const debug = new DebugDraw3D();
      const recorder = debug.beginFrame();
      buildScene(example.id, recorder, 0.6);
      const commands = debug.finishFrame(recorder);
      renderer.prepare(commands, { viewProjection: identity });
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      const pixels = await output.color.read({ mipLevel: 0, region: "all" });
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 10 || pixels[i + 1]! > 10 || pixels[i + 2]! > 10) lit++;
      expect(lit, `${example.id} rendered no visible pixels`).toBeGreaterThan(0);
    }
    renderer.destroy();
  } finally {
    gpu.dispose();
  }
}, 60000);
