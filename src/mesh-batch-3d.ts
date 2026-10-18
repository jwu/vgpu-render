import { draw, geometry, type Draw, type FramePass, type Gpu } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { DEFAULT_DEPTH_BIAS } from "./gpu-debug-draw-3d.js";
import type { MeshData } from "./geometry-generators.js";
import type { Color } from "./frame-draw-list.js";

/** Mirrors the reference mesh/rect shaders: `depth_draw_always` plus the same depth bias. */
const SHADER = prepareShader(`
struct Camera { viewProjection: mat4x4f }
@group(0) @binding(0) var<uniform> camera: Camera;
const DEPTH_BIAS: f32 = ${DEFAULT_DEPTH_BIAS};
const DEPTH_BIAS_EPSILON: f32 = 0.000488;

fn apply_depth_bias(clip: vec4f) -> f32 {
  let bias = clamp(DEPTH_BIAS, -1.0, 1.0);
  if (bias >= 0.0) {
    return clip.z * (1.0 - bias);
  }
  let safe_depth = max(clip.z, DEPTH_BIAS_EPSILON);
  let depth_ratio = max(clip.w / safe_depth - DEPTH_BIAS_EPSILON, DEPTH_BIAS_EPSILON);
  return clip.z * exp2(-bias * log2(depth_ratio));
}

struct In { @location(0) position: vec3f, @location(1) color: vec4f }
struct Out { @builtin(position) clip: vec4f, @location(0) color: vec4f }
@vertex fn vs_main(input: In) -> Out {
  let clip = camera.viewProjection * vec4f(input.position, 1.0);
  var out: Out;
  out.clip = vec4f(clip.xy, apply_depth_bias(clip), clip.w);
  out.color = input.color;
  return out;
}
@fragment fn fs_main(input: Out) -> @location(0) vec4f { return input.color; }
`);

function flatten(mesh: MeshData, color: Color, solid: boolean): Float32Array {
  const points = solid ? mesh.triangles.flatMap((triangle) => triangle) : mesh.segments.flatMap((segment) => segment);
  const data = new Float32Array(points.length * 7);
  for (let i = 0; i < points.length; i++) {
    const offset = i * 7; const point = points[i]!;
    data.set([point[0], point[1], point[2], color[0], color[1], color[2], color[3]], offset);
  }
  return data;
}

export class MeshBatch3D {
  readonly #draw: Draw;
  readonly #geometry: ReturnType<typeof geometry>;
  readonly #solid: boolean;

  constructor(gpu: Gpu, mesh: MeshData, color: Color, solid: boolean) {
    this.#solid = solid;
    const data = flatten(mesh, color, solid);
    this.#geometry = geometry(gpu, {
      buffers: [{ attributes: { position: "float32x3", color: "float32x4" }, data: data as Float32Array<ArrayBuffer> }],
      vertexCount: data.length / 7,
      topology: solid ? "triangle-list" : "line-list",
    });
    const options = { shader: SHADER, geometry: this.#geometry, depth: { write: true, compare: "less-equal" } as const };
    // Filled rects disable culling in the reference; solids keep back-face culling.
    this.#draw = draw(gpu, solid ? { ...options, blend: "alpha", cull: "back" } : { ...options, cull: "none" });
  }

  draw(pass: FramePass, viewProjection: ArrayLike<number>): void {
    this.#draw.set({ camera: { viewProjection } });
    pass.draw(this.#draw);
  }

  destroy(): void {
    this.#draw.dispose();
    this.#geometry.destroy();
  }

  get solid(): boolean { return this.#solid; }
}
