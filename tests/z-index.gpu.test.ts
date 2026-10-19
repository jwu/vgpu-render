import { expect, test } from "vitest";
import { draw, geometry } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { init, target, frame } from "vgpu/node";
import { instanceGeometry } from "vgpu/scene/gpu";
import { instances } from "vgpu/scene";

/**
 * Feasibility checks for the z-index plan in `docs/z-index.md`.
 *
 * The plan rests on two properties of the existing renderers. These tests pin them down, so a
 * future change to `vgpu`, to `trim()` or to the draw path fails here instead of silently
 * degrading 2D/text layering into "whatever the visit order happened to be".
 *
 * 1. An instance buffer can be regrouped without moving any instance, because `ids[n]` keeps
 *    slot `n` as long as removal only happens at the tail — which is what `trim()` does.
 * 2. One `draw` object can be invoked several times inside one render pass, each call covering
 *    a contiguous slice of the instance buffer via per-call `{ instances, firstInstance }`.
 */

const WIDTH = 256;
const HEIGHT = 64;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const COLUMNS = [-0.6, -0.2, 0.2, 0.6] as const;
const RED = [1, 0, 0, 1] as const;
const BLUE = [0, 0, 1, 1] as const;

const SHADER = `
struct In {
  @location(0) position: vec3f,
  @location(1) world0: vec4f, @location(2) world1: vec4f,
  @location(3) world2: vec4f, @location(4) world3: vec4f,
  @location(5) offset: vec2f, @location(6) color: vec4f,
}
struct Out { @builtin(position) clip: vec4f, @location(0) color: vec4f }
@vertex fn vs_main(input: In, @builtin(vertex_index) vertex: u32) -> Out {
  let corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  var out: Out;
  out.clip = vec4f(input.offset + corners[vertex] * 0.12, 0.0, 1.0);
  out.color = input.color;
  return out;
}
@fragment fn fs_main(input: Out) -> @location(0) vec4f { return input.color; }
`;

type Tag = "R" | "B" | ".";

/** Reads the colour under each column centre and names it: red, blue, or nothing. */
function tags(data: Uint8Array): Tag[] {
  return COLUMNS.map((x) => {
    const i = (Math.round(HEIGHT / 2) * WIDTH + Math.round(((x + 1) / 2) * WIDTH)) * 4;
    const red = data[i] ?? 0;
    const blue = data[i + 2] ?? 0;
    if (red <= 40 && blue <= 40) return ".";
    return red > blue ? "R" : "B";
  });
}

test("per-call instance slicing draws only the requested instance range", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const collection = instances({ capacity: 4, attributes: { offset: "float32x2", color: "float32x4" } });
    const bridge = instanceGeometry(gpu, collection, {
      mesh: geometry(gpu, { buffers: [{ attributes: { position: "float32x3" }, data: new Float32Array(18) }], vertexCount: 6 }),
    });
    COLUMNS.forEach((x, index) => {
      const id = collection.add({ offset: [x, 0], color: index < 2 ? RED : BLUE });
      collection.setWorld(id, IDENTITY);
    });
    bridge.publish();
    const pipeline = draw(gpu, { shader: prepareShader(SHADER), geometry: bridge.geometry, instances: 4, blend: "alpha", cull: "none" });

    const render = async (slices: readonly (readonly [number, number])[]) => {
      frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => {
        for (const [firstInstance, instanceCount] of slices) pass.draw(pipeline, { instances: instanceCount, firstInstance });
      }));
      return tags(await output.color.read({ mipLevel: 0, region: "all" }));
    };

    expect(await render([[0, 4]])).toEqual(["R", "R", "B", "B"]);
    expect(await render([[0, 2]])).toEqual(["R", "R", ".", "."]);
    expect(await render([[2, 2]])).toEqual([".", ".", "B", "B"]);
    // Two calls in one pass cover both halves, which is what a segmented layer needs.
    expect(await render([[0, 2], [2, 2]])).toEqual(["R", "R", "B", "B"]);
    // Per-instance slices work too, so a segment need not align with any kind boundary.
    expect(await render([[0, 1], [1, 1], [2, 1], [3, 1]])).toEqual(["R", "R", "B", "B"]);
    expect(await render([])).toEqual([".", ".", ".", "."]);

    pipeline.dispose();
    bridge.destroy();
  } finally {
    gpu.dispose();
  }
});

test("visiting commands in a new order regroups the buffer without moving instances", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const collection = instances({ capacity: 4, attributes: { offset: "float32x2", color: "float32x4" } });
    const bridge = instanceGeometry(gpu, collection, {
      mesh: geometry(gpu, { buffers: [{ attributes: { position: "float32x3" }, data: new Float32Array(18) }], vertexCount: 6 }),
    });
    // Slots are allocated once and the tail is never removed, so `ids[n]` owns slot `n` forever.
    const ids = COLUMNS.map((x) => {
      const id = collection.add({ offset: [x, 0], color: RED });
      collection.setWorld(id, IDENTITY);
      return id;
    });
    expect(ids.map((id) => collection.slotOf(id))).toEqual([0, 1, 2, 3]);

    const pipeline = draw(gpu, { shader: prepareShader(SHADER), geometry: bridge.geometry, instances: 4, blend: "alpha", cull: "none" });

    /** Writes the n-th command of the sorted order into slot n: visit order decides the layout. */
    const writeOrder = (colors: readonly (readonly [number, number, number, number])[]) => {
      colors.forEach((color, slot) => collection.set(ids[slot]!, { color }));
      bridge.publish();
    };

    const render = async (slices: readonly (readonly [number, number])[]) => {
      frame(gpu, (f) => f.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => {
        for (const [firstInstance, instanceCount] of slices) pass.draw(pipeline, { instances: instanceCount, firstInstance });
      }));
      return tags(await output.color.read({ mipLevel: 0, region: "all" }));
    };

    writeOrder([RED, RED, BLUE, BLUE]);
    expect(await render([[0, 4]])).toEqual(["R", "R", "B", "B"]);
    expect(await render([[0, 2]])).toEqual(["R", "R", ".", "."]);

    // Same slots, different visit order: no instance moved, only which slot holds which command.
    writeOrder([BLUE, BLUE, RED, RED]);
    expect(ids.map((id) => collection.slotOf(id))).toEqual([0, 1, 2, 3]);
    expect(await render([[0, 4]])).toEqual(["B", "B", "R", "R"]);
    expect(await render([[0, 2]])).toEqual(["B", "B", ".", "."]);
    expect(await render([[2, 2]])).toEqual([".", ".", "R", "R"]);

    pipeline.dispose();
    bridge.destroy();
  } finally {
    gpu.dispose();
  }
});
