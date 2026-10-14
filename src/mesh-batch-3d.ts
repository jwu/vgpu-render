import { draw, geometry, type Draw, type FramePass, type Gpu } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import type { MeshData } from "./geometry-generators.js";
import type { Color } from "./frame-recorder.js";

const SHADER = prepareShader(`
struct Camera { viewProjection: mat4x4f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct In { @location(0) position: vec3f, @location(1) color: vec4f }
struct Out { @builtin(position) clip: vec4f, @location(0) color: vec4f }
@vertex fn vs_main(input: In) -> Out { var out: Out; out.clip = camera.viewProjection * vec4f(input.position, 1.0); out.color = input.color; return out; }
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
    const options = { shader: SHADER, geometry: this.#geometry, depth: { write: false, compare: "less-equal" } as const };
    this.#draw = draw(gpu, solid ? { ...options, blend: "alpha" } : options);
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
