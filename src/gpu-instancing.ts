/**
 * Instancing plumbing shared by the debug-draw and text renderers.
 *
 * Both renderers have the same shape: one `instances()` collection per primitive kind, an
 * indirect draw whose arguments a one-thread compute shader refreshes each frame, and a
 * transient mesh that only has to supply a vertex count. Keeping the helpers here means the
 * two renderers cannot drift apart on trim, publish or indirect-argument bookkeeping.
 */

import { compute, geometry, type Compute, type Gpu, type StorageBuffer } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import type { InstanceCollection, InstanceId } from "vgpu/scene";

/** Epsilon floors of the reference depth-bias formula (`debug_line_3d_common.gdshaderinc`). */
const DEPTH_BIAS_EPSILON = 0.000488;
const NEAR_CLIP_EPSILON = 0.000488;

/**
 * Shared WGSL for depth handling, ported from `debug_line_3d_common.gdshaderinc`.
 *
 * `apply_depth_bias` keeps the reference's exponential form so a `-0.001` bias behaves
 * like Godot's and Bevy's (`depth * exp2(-bias * log2(clip.w / depth))`). `depth_bias`
 * is baked into the source instead of a uniform: the reference sets it once per scene
 * and it keeps the camera uniform layout identical across all pipelines.
 */
export function depthBiasHelpers(depthBias: number): string {
  return `
const DEPTH_BIAS: f32 = ${depthBias};
const DEPTH_BIAS_EPSILON: f32 = ${DEPTH_BIAS_EPSILON};
const NEAR_CLIP_EPSILON: f32 = ${NEAR_CLIP_EPSILON};

fn apply_depth_bias(clip: vec4f) -> f32 {
  let bias = clamp(DEPTH_BIAS, -1.0, 1.0);
  if (bias >= 0.0) {
    return clip.z * (1.0 - bias);
  }
  let safe_depth = max(clip.z, DEPTH_BIAS_EPSILON);
  let depth_ratio = max(clip.w / safe_depth - DEPTH_BIAS_EPSILON, DEPTH_BIAS_EPSILON);
  return clip.z * exp2(-bias * log2(depth_ratio));
}

fn clip_near_plane_t(a: vec4f, b: vec4f) -> f32 {
  if (a.z > a.w && b.z <= b.w) {
    let distance_a = a.z - a.w;
    let distance_b = b.z - b.w;
    return clamp(distance_a / (distance_a - distance_b) + NEAR_CLIP_EPSILON, 0.0, 1.0);
  }
  return 0.0;
}
`;
}

export function identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** Instances carry no per-instance transform; the vertex stage places them from attributes. */
export function world(collection: InstanceCollection, id: InstanceId): void {
  collection.setWorld(id, identity());
}

/** Removes the instances past `count` and reports whether the collection shrank. */
export function trim(collection: InstanceCollection, ids: InstanceId[], count: number): boolean {
  let changed = false;
  for (let index = ids.length - 1; index >= count; index--) {
    collection.remove(ids.pop()!);
    changed = true;
  }
  return changed;
}

export function indirectArgs(buffer: StorageBuffer, vertexCount: number, instanceCount: number): void {
  buffer.write(new Uint32Array([vertexCount, instanceCount, 0, 0]));
}

/**
 * Copies the current vertex/instance counts into a draw's indirect buffer. The counts live in
 * a uniform so the pass needs no CPU-side buffer writes: one dispatch per draw rewrites the
 * four `drawIndirect` words.
 */
export const INDIRECT_SHADER = prepareShader(`
struct Params { vertexCount: u32, instanceCount: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> args: array<u32>;
@compute @workgroup_size(1)
fn cs_main() {
  args[0] = params.vertexCount;
  args[1] = params.instanceCount;
  args[2] = 0u;
  args[3] = 0u;
}
`);

export function indirectCompute(gpu: Gpu): Compute {
  return compute(gpu, INDIRECT_SHADER);
}

/** A six-vertex quad whose corners the vertex stage derives from `vertex_index`. */
export function zeroGeometry(gpu: Gpu) {
  return geometry(gpu, {
    buffers: [{ attributes: { position: "float32x3" }, data: new Float32Array(18) }],
    vertexCount: 6,
  });
}
