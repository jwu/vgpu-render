import { expect, test } from "vitest";
import { init, target, frame } from "vgpu/node";
import { box, rect } from "../src/geometry-generators.js";
import { MeshBatch3D } from "../src/mesh-batch-3d.js";

test("mesh batch renders solid and wire geometry", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [128, 128], depth: true });
    const projection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const solid = new MeshBatch3D(gpu, rect([1.4, 1.4]), [1, 0.2, 0.1, 0.8], true);
    const wire = new MeshBatch3D(gpu, box([1.2, 1.2, 1.2]), [0.1, 0.8, 1, 1], false);
    frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (p) => { solid.draw(p, projection); wire.draw(p, projection); }));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    const visible = Array.from(pixels).filter((value, index) => index % 4 !== 3 && value > 8).length;
    expect(visible).toBeGreaterThan(128);
    solid.destroy(); wire.destroy();
  } finally { gpu.dispose(); }
});
