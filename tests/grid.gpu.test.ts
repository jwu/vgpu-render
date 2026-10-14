import { expect, test } from "vitest";
import { init, target, frame } from "vgpu/node";
import { InfiniteGrid3D } from "../src/infinite-grid-3d.js";

test("infinite grid produces visible LOD lines in an offscreen target", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [256, 256], depth: true });
    const grid = new InfiniteGrid3D(gpu, { size: 20, cellSize: 1, lineWidth: 2, fadeDistance: 20 });
    const viewProjection = new Float32Array([
      0.12, 0, 0, 0,
      0, 0, 0, 0,
      0, 0.12, 0, 0,
      0, 0, 0, 1,
    ]);
    grid.prepare({ viewProjection, cameraPosition: [0, 8, 8], gridCenter: [0, 0], viewportSize: [256, 256] });
    frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (p) => grid.draw(p)));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    const lit = Array.from(pixels).filter((value, index) => index % 4 !== 3 && value > 4).length;
    expect(lit).toBeGreaterThan(256);
    grid.destroy();
  } finally {
    gpu.dispose();
  }
});
