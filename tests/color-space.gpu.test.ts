import { expect, test } from "vitest";
import { effect, frame, init, sampler, target } from "vgpu/node";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import { linearClearColor } from "../src/color-space.js";
import type { FrameCommand } from "../src/frame-recorder.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Same encode step the demo's present pass performs. */
const PRESENT_SHADER = prepareShader(`
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;

fn encode_srgb(value: vec3f) -> vec3f {
  let low = value * 12.92;
  let high = 1.055 * pow(max(value, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, value <= vec3f(0.0031308));
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(sceneTexture));
  let uv = position.xy / dims;
  let scene = textureSample(sceneTexture, sceneSampler, uv);
  return vec4f(encode_srgb(scene.rgb), scene.a);
}
`);

/**
 * Reproduces the reference capture path end to end: linear scene target, then the sRGB
 * encode on present. Asserted values are the pixels measured from the Godot reference
 * screenshots (`artifacts/visual-baseline/godot-line.png`), so this test fails if the
 * port ever drifts back to writing authored colors into an encoded buffer.
 */
test("linear blending plus sRGB present matches the Godot reference pixels", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 16 });
  try {
    const size = [64, 64] as const;
    const scene = target(gpu, { size, format: "rgba16float", depth: true });
    const output = target(gpu, { size });
    const present = effect(gpu, PRESENT_SHADER, { set: { sceneTexture: scene, sceneSampler: sampler(gpu) } });

    // The reference `line(alpha)` column: Color(1.0, 0.85, 0.1) at four alphas, over the
    // reference clear color. Rendered one at a time so the sampled pixel is always the
    // exact center of that line and never a neighbouring band.
    const alphas = [1, 0.65, 0.35, 0.1];
    const render = async (alpha: number) => {
      const commands: FrameCommand[] = [{
        kind: "line",
        start: [-0.9, 0, 0],
        end: [0.9, 0, 0],
        color: [1, 0.85, 0.1, alpha],
        colorEnd: [1, 0.85, 0.1, alpha],
        width: 16,
        widthMode: "screen",
        layer: 1,
      }];
      renderer.prepare(commands, { viewProjection: identity });
      frame(gpu, (f) => {
        f.pass({ target: scene, clear: linearClearColor([30 / 255, 30 / 255, 30 / 255, 1]), clearDepth: 1 }, (pass) => renderer.draw(pass));
        f.pass({ target: output }, (pass) => pass.draw(present));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    const at = (pixels: Uint8Array, x: number, y: number): [number, number, number] => {
      const i = (y * size[0] + x) * 4;
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    };
    // Measured Godot pixels for `Color(1.0, 0.85, 0.1)` over the clear color.
    const expected: readonly (readonly [number, number, number])[] = [
      [255, 237, 89],
      [211, 197, 75],
      [161, 150, 59],
      [94, 88, 40],
    ];
    for (let i = 0; i < alphas.length; i++) {
      const sampled = at(await render(alphas[i]!), 32, 32);
      for (let channel = 0; channel < 3; channel++) {
        // Tolerance 2/255 covers the float16 scene target's quantization.
        expect(Math.abs(sampled[channel]! - expected[i]![channel]!)).toBeLessThanOrEqual(2);
      }
    }
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});

test("solid primitives keep the reference translucent color", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 1, triangles: 4 });
  try {
    const size = [64, 64] as const;
    const scene = target(gpu, { size, format: "rgba16float", depth: true });
    const output = target(gpu, { size });
    const present = effect(gpu, PRESENT_SHADER, { set: { sceneTexture: scene, sceneSampler: sampler(gpu) } });

    // Reference `draw_circle_s` color: Color(0.25, 0.65, 1.0, 0.45).
    const color = [0.25, 0.65, 1, 0.45] as const;
    const commands: FrameCommand[] = [{
      kind: "triangle", a: [-0.8, -0.8, 0], b: [0.8, -0.8, 0], c: [0, 0.8, 0], color, layer: 1,
    }];
    renderer.prepare(commands, { viewProjection: identity });
    frame(gpu, (f) => {
      f.pass({ target: scene, clear: linearClearColor([30 / 255, 30 / 255, 30 / 255, 1]), clearDepth: 1 }, (pass) => renderer.draw(pass));
      f.pass({ target: output }, (pass) => pass.draw(present));
    });
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    const i = (32 * size[0] + 32) * 4;
    // Godot reference pixel for the same color over the same clear color.
    expect(Math.abs(pixels[i]! - 97)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixels[i + 1]! - 149)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixels[i + 2]! - 180)).toBeLessThanOrEqual(2);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});

test("sub-pixel line widths fade alpha instead of collapsing to a sliver", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 1, lines: 4 });
  try {
    const size = [64, 64] as const;
    const scene = target(gpu, { size, format: "rgba16float", depth: true });
    const output = target(gpu, { size });
    const present = effect(gpu, PRESENT_SHADER, { set: { sceneTexture: scene, sceneSampler: sampler(gpu) } });

    const render = async (width: number) => {
      const commands: FrameCommand[] = [{
        kind: "line", start: [-0.9, 0, 0], end: [0.9, 0, 0],
        color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1],
        width, widthMode: "screen", layer: 1,
      }];
      renderer.prepare(commands, { viewProjection: identity });
      frame(gpu, (f) => {
        f.pass({ target: scene, clear: linearClearColor([0, 0, 0, 1]), clearDepth: 1 }, (pass) => renderer.draw(pass));
        f.pass({ target: output }, (pass) => pass.draw(present));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    const thin = await render(0.5);
    const solid = await render(1);
    // Scan the column through the line rather than assuming a sub-pixel quad lands on an
    // exact pixel boundary, then compare the brightest coverage of each width.
    const brightest = (pixels: Uint8Array): number => {
      let best = 0;
      for (let y = 16; y < 48; y++) best = Math.max(best, pixels[(y * size[0] + 32) * 4]!);
      return best;
    };
    const thinPeak = brightest(thin);
    const solidPeak = brightest(solid);
    // A 0.5px line keeps its coverage but at half alpha, so it is dimmer than the fully
    // opaque 1px line and brighter than the black background.
    expect(thinPeak).toBeGreaterThan(100);
    expect(thinPeak).toBeLessThan(solidPeak);
    expect(solidPeak).toBeGreaterThan(240);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});
