import { compute, draw, geometry, storage, type Compute, type Draw, type Frame, type FramePass, type Gpu, type StorageBuffer } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";

import { instanceGeometry, type InstanceGeometry } from "vgpu/scene/gpu";
import { instances, type InstanceCollection, type InstanceId } from "vgpu/scene";
import type { FrameCommand, PointCommand, LineCommand, TriangleCommand, Vec3 } from "./frame-recorder.js";

const POINT_SHADER = `
struct Camera { viewProjection: mat4x4f, viewportSize: vec2f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct In {
  @location(0) position: vec3f,
  @location(1) world0: vec4f, @location(2) world1: vec4f,
  @location(3) world2: vec4f, @location(4) world3: vec4f,
  @location(5) point: vec3f, @location(6) color: vec4f,
  @location(7) size: f32, @location(8) flags: u32,
}
struct Out { @builtin(position) clip: vec4f, @location(0) color: vec4f, @location(1) uv: vec2f, @location(2) roundShape: f32 }
@vertex fn vs_main(input: In, @builtin(vertex_index) vertex: u32) -> Out {
  let corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let clip = camera.viewProjection * vec4f(input.point, 1.0);
  var size = input.size;
  if ((input.flags & 1u) != 0u) {
    let projectionScale = length(vec3f(camera.viewProjection[0][1], camera.viewProjection[1][1], camera.viewProjection[2][1]));
    size *= projectionScale * camera.viewportSize.y * 0.5 / max(clip.w, 0.0001);
  }
  let offset = corners[vertex] * size / camera.viewportSize * clip.w;
  var out: Out;
  out.clip = clip + vec4f(offset, 0.0, 0.0);
  out.color = input.color;
  out.uv = corners[vertex];
  out.roundShape = f32(input.flags & 2u);
  return out;
}
@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  if (input.roundShape > 0.5 && dot(input.uv, input.uv) > 1.0) { discard; }
  return input.color;
}
`;

const LINE_SHADER = `
struct Camera { viewProjection: mat4x4f, viewportSize: vec2f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct In {
  @location(0) position: vec3f,
  @location(1) world0: vec4f, @location(2) world1: vec4f,
  @location(3) world2: vec4f, @location(4) world3: vec4f,
  @location(5) start: vec3f, @location(6) end: vec3f,
  @location(7) color: vec4f, @location(8) colorEnd: vec4f,
  @location(9) width: f32, @location(10) flags: u32,
  @location(11) dash: vec3f,
  @location(12) normal: vec3f, @location(13) joint: u32,
}
struct Out { @builtin(position) clip: vec4f, @location(0) color: vec4f, @location(1) dash: vec3f, @location(2) distance: f32 }
@vertex fn vs_main(input: In, @builtin(vertex_index) vertex: u32) -> Out {
  let corners = array<vec2f, 6>(vec2f(-1,0), vec2f(1,0), vec2f(-1,1), vec2f(-1,1), vec2f(1,0), vec2f(1,1));
  let a = camera.viewProjection * vec4f(input.start, 1.0);
  let b = camera.viewProjection * vec4f(input.end, 1.0);
  let t = corners[vertex].y;
  let center = mix(a, b, t);
  let delta = ((b.xy / max(b.w, 0.0001)) - (a.xy / max(a.w, 0.0001))) * camera.viewportSize;
  let baseDir = delta / max(length(delta), 0.0001);
  var axis = vec2f(-baseDir.y, baseDir.x);
  if (length(input.normal) > 0.0001) {
    let dir = normalize(input.end - input.start);
    let flat = cross(dir, normalize(input.normal));
    if (length(flat) > 0.0001) {
      let mid = mix(input.start, input.end, t);
      let p0 = camera.viewProjection * vec4f(mid, 1.0);
      let p1 = camera.viewProjection * vec4f(mid + normalize(flat) * 0.001, 1.0);
      let delta2 = ((p1.xy / max(p1.w, 0.0001)) - (p0.xy / max(p0.w, 0.0001))) * camera.viewportSize;
      if (length(delta2) > 0.00001) { axis = normalize(delta2); }
    }
  }
  var pixelWidth = input.width;
  if (input.flags == 1u) {
    let scale = camera.viewProjection[1][1] * camera.viewportSize.y * 0.5 / max(center.w, 0.0001);
    pixelWidth = input.width * scale;
  }
  let side = axis * corners[vertex].x * pixelWidth / camera.viewportSize * center.w;
  var out: Out;
  out.clip = center + vec4f(side, 0.0, 0.0);
  out.color = mix(input.color, input.colorEnd, t);
  out.dash = input.dash;
  out.distance = t * length(input.end - input.start) + input.dash.z;
  return out;
}
@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let period = input.dash.x + input.dash.y;
  if (period > 0.0 && input.dash.x > 0.0 && fract(input.distance / period) > input.dash.x / period) { discard; }
  return input.color;
}
`;

type Camera = { viewProjection: ArrayLike<number> };

const INDIRECT_SHADER = prepareShader(`
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

const TRIANGLE_SHADER = `
struct Camera { viewProjection: mat4x4f }
@group(0) @binding(0) var<uniform> camera: Camera;
struct In {
  @location(0) position: vec3f,
  @location(1) world0: vec4f, @location(2) world1: vec4f,
  @location(3) world2: vec4f, @location(4) world3: vec4f,
  @location(5) a: vec3f, @location(6) b: vec3f, @location(7) c: vec3f,
  @location(8) color: vec4f,
}
struct Out { @builtin(position) clip: vec4f, @location(0) color: vec4f }
@vertex fn vs_main(input: In, @builtin(vertex_index) vertex: u32) -> Out {
  var p = input.a;
  if (vertex == 1u) { p = input.b; } else if (vertex == 2u) { p = input.c; }
  var out: Out;
  out.clip = camera.viewProjection * vec4f(p, 1.0);
  out.color = input.color;
  return out;
}
@fragment fn fs_main(input: Out) -> @location(0) vec4f { return input.color; }
`;

type TriangleCollection = InstanceCollection<{
  a: "float32x3";
  b: "float32x3";
  c: "float32x3";
  color: "float32x4";
}>;
type PointCollection = InstanceCollection<{
  point: "float32x3";
  color: "float32x4";
  size: "float32";
  flags: "uint32";
}>;
type LineCollection = InstanceCollection<{
  start: "float32x3";
  end: "float32x3";
  color: "float32x4";
  colorEnd: "float32x4";
  width: "float32";
  flags: "uint32";
  dash: "float32x3";
  normal: "float32x3";
  joint: "uint32";
}>;

function identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function world(collection: InstanceCollection, id: InstanceId): void {
  collection.setWorld(id, identity());
}
function sameVec3(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
function sameColor(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
function samePoint(a: PointCommand, b: PointCommand): boolean {
  return sameVec3(a.position, b.position) && sameColor(a.color, b.color) && a.size === b.size && a.sizeMode === b.sizeMode && a.round === b.round;
}
function sameLine(a: LineCommand, b: LineCommand): boolean {
  return sameVec3(a.start, b.start) && sameVec3(a.end, b.end) && sameColor(a.color, b.color) && sameColor(a.colorEnd, b.colorEnd)
    && a.width === b.width && a.widthMode === b.widthMode && a.dash?.[0] === b.dash?.[0] && a.dash?.[1] === b.dash?.[1] && a.dash?.[2] === b.dash?.[2]
    && (a.normal === undefined ? b.normal === undefined : b.normal !== undefined && sameVec3(a.normal, b.normal)) && a.joint === b.joint;
}
function sameTriangle(a: TriangleCommand, b: TriangleCommand): boolean {
  return sameVec3(a.a, b.a) && sameVec3(a.b, b.b) && sameVec3(a.c, b.c) && sameColor(a.color, b.color);
}
function trim(collection: InstanceCollection, ids: InstanceId[], count: number): boolean {
  let changed = false;
  for (let i = ids.length - 1; i >= count; i--) {
    collection.remove(ids.pop()!);
    changed = true;
  }
  return changed;
}
function indirectArgs(buffer: StorageBuffer, vertexCount: number, instanceCount: number): void {
  buffer.write(new Uint32Array([vertexCount, instanceCount, 0, 0]));
}
function zeroGeometry(gpu: Gpu) {
  return geometry(gpu, {
    buffers: [{ attributes: { position: "float32x3" }, data: new Float32Array(18) }],
    vertexCount: 6,
  });
}
function triangleGeometry(gpu: Gpu) {
  return geometry(gpu, {
    buffers: [{ attributes: { position: "float32x3" }, data: new Float32Array(9) }],
    vertexCount: 3,
    topology: "triangle-list",
  });
}

export class GpuDebugDraw3D {
  readonly #points: PointCollection;
  readonly #lines: LineCollection;
  readonly #triangles: TriangleCollection;
  readonly #pointIds: InstanceId[] = [];
  readonly #lineIds: InstanceId[] = [];
  readonly #triangleIds: InstanceId[] = [];
  readonly #pointCache: PointCommand[] = [];
  readonly #lineCache: LineCommand[] = [];
  readonly #triangleCache: TriangleCommand[] = [];
  readonly #pointBridge: InstanceGeometry;
  readonly #lineBridge: InstanceGeometry;
  readonly #triangleBridge: InstanceGeometry;
  readonly #pointDraw: Draw;
  readonly #lineDraw: Draw;
  readonly #triangleDraw: Draw;
  readonly #pointIndirect: StorageBuffer;
  readonly #lineIndirect: StorageBuffer;
  readonly #triangleIndirect: StorageBuffer;
  readonly #indirectCompute: Compute;
  #viewProjection: ArrayLike<number> = identity();
  #pointCount = 0;
  #lineCount = 0;
  #triangleCount = 0;
  #pointDirty = true;
  #lineDirty = true;
  #triangleDirty = true;

  constructor(gpu: Gpu, capacities: { points?: number; lines?: number; triangles?: number } = {}) {
    const points = capacities.points ?? 4096;
    const lines = capacities.lines ?? 16384;
    const triangles = capacities.triangles ?? 8192;
    this.#points = instances({ capacity: points, attributes: { point: "float32x3", color: "float32x4", size: "float32", flags: "uint32" } });
    this.#lines = instances({ capacity: lines, attributes: { start: "float32x3", end: "float32x3", color: "float32x4", colorEnd: "float32x4", width: "float32", flags: "uint32", dash: "float32x3", normal: "float32x3", joint: "uint32" } });
    this.#triangles = instances({ capacity: triangles, attributes: { a: "float32x3", b: "float32x3", c: "float32x3", color: "float32x4" } });
    const pointMesh = zeroGeometry(gpu);
    const lineMesh = zeroGeometry(gpu);
    const triangleMesh = triangleGeometry(gpu);
    this.#pointBridge = instanceGeometry(gpu, this.#points, { mesh: pointMesh });
    this.#lineBridge = instanceGeometry(gpu, this.#lines, { mesh: lineMesh });
    this.#triangleBridge = instanceGeometry(gpu, this.#triangles, { mesh: triangleMesh });
    this.#pointDraw = draw(gpu, { shader: prepareShader(POINT_SHADER), geometry: this.#pointBridge.geometry, instances: 0, blend: "alpha", depth: { write: false, compare: "less-equal" } });
    this.#lineDraw = draw(gpu, { shader: prepareShader(LINE_SHADER), geometry: this.#lineBridge.geometry, instances: 0, blend: "alpha", depth: { write: false, compare: "less-equal" } });
    this.#triangleDraw = draw(gpu, { shader: prepareShader(TRIANGLE_SHADER), geometry: this.#triangleBridge.geometry, instances: 0, blend: "alpha", depth: { write: true, compare: "less-equal" } });
    this.#pointIndirect = storage(gpu, 16, { access: "read-write", indirect: true });
    this.#lineIndirect = storage(gpu, 16, { access: "read-write", indirect: true });
    this.#triangleIndirect = storage(gpu, 16, { access: "read-write", indirect: true });
    this.#indirectCompute = compute(gpu, INDIRECT_SHADER);
    indirectArgs(this.#pointIndirect, 6, 0);
    indirectArgs(this.#lineIndirect, 6, 0);
    indirectArgs(this.#triangleIndirect, 3, 0);
  }

  prepare(commands: readonly FrameCommand[], camera: Camera): void {
    let pointCount = 0;
    let lineCount = 0;
    let triangleCount = 0;
    this.#pointDirty = false;
    this.#lineDirty = false;
    this.#triangleDirty = false;
    for (const command of commands) {
      if (command.kind === "point") this.addPoint(command, pointCount++);
      else if (command.kind === "triangle") this.addTriangle(command, triangleCount++);
      else this.addLine(command, lineCount++);
    }
    if (trim(this.#points, this.#pointIds, pointCount)) this.#pointDirty = true;
    if (trim(this.#lines, this.#lineIds, lineCount)) this.#lineDirty = true;
    if (trim(this.#triangles, this.#triangleIds, triangleCount)) this.#triangleDirty = true;
    if (this.#pointCache.length !== pointCount) this.#pointDirty = true;
    if (this.#lineCache.length !== lineCount) this.#lineDirty = true;
    if (this.#triangleCache.length !== triangleCount) this.#triangleDirty = true;
    this.#pointCache.length = pointCount;
    this.#lineCache.length = lineCount;
    this.#triangleCache.length = triangleCount;
    if (this.#pointDirty) {
      this.#pointCount = this.#pointBridge.publish();
      indirectArgs(this.#pointIndirect, 6, this.#pointCount);
    }
    if (this.#lineDirty) {
      this.#lineCount = this.#lineBridge.publish();
      indirectArgs(this.#lineIndirect, 6, this.#lineCount);
    }
    if (this.#triangleDirty) {
      this.#triangleCount = this.#triangleBridge.publish();
      indirectArgs(this.#triangleIndirect, 3, this.#triangleCount);
    }
    this.#viewProjection = camera.viewProjection;
  }

  updateIndirect(frame: Frame): void {
    frame.computePass((pass) => {
      this.#indirectCompute.set({ params: { vertexCount: 6, instanceCount: this.#pointCount }, args: this.#pointIndirect });
      pass.dispatch(this.#indirectCompute, 1);
      this.#indirectCompute.set({ params: { vertexCount: 6, instanceCount: this.#lineCount }, args: this.#lineIndirect });
      pass.dispatch(this.#indirectCompute, 1);
      this.#indirectCompute.set({ params: { vertexCount: 3, instanceCount: this.#triangleCount }, args: this.#triangleIndirect });
      pass.dispatch(this.#indirectCompute, 1);
    });
  }

  draw(pass: FramePass): void {
    const camera = { viewProjection: this.#viewProjection, viewportSize: pass.target.size };
    this.#pointDraw.set({ camera });
    this.#lineDraw.set({ camera });
    this.#triangleDraw.set({ camera: { viewProjection: this.#viewProjection } });
    if (this.#triangleCount > 0) pass.draw(this.#triangleDraw, { indirect: this.#triangleIndirect });
    if (this.#pointCount > 0) pass.draw(this.#pointDraw, { indirect: this.#pointIndirect });
    if (this.#lineCount > 0) pass.draw(this.#lineDraw, { indirect: this.#lineIndirect });
  }

  destroy(): void {
    this.#pointDraw.dispose();
    this.#lineDraw.dispose();
    this.#triangleDraw.dispose();
    this.#indirectCompute.dispose();
    this.#pointBridge.destroy();
    this.#lineBridge.destroy();
    this.#triangleBridge.destroy();
  }

  private addTriangle(command: TriangleCommand, index: number): void {
    const previous = this.#triangleCache[index];
    this.#triangleCache[index] = command;
    if (previous !== undefined && sameTriangle(previous, command)) return;
    this.#triangleDirty = true;
    const id = this.#triangleIds[index] ?? this.#addTriangleId(index);
    this.#triangles.set(id, { a: command.a, b: command.b, c: command.c, color: command.color });
  }

  #addTriangleId(index: number): InstanceId {
    const id = this.#triangles.add({ a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], color: [0, 0, 0, 0] });
    world(this.#triangles, id);
    this.#triangleIds[index] = id;
    return id;
  }

  private addPoint(command: PointCommand, index: number): void {
    const previous = this.#pointCache[index];
    this.#pointCache[index] = command;
    if (previous !== undefined && samePoint(previous, command)) return;
    this.#pointDirty = true;
    const id = this.#pointIds[index] ?? this.#addPointId(index);
    this.#points.set(id, { point: command.position, color: command.color, size: command.size, flags: (command.sizeMode === "world" ? 1 : 0) | (command.round ? 2 : 0) });
  }

  #addPointId(index: number): InstanceId {
    const id = this.#points.add({ point: [0, 0, 0], color: [0, 0, 0, 0], size: 0, flags: 0 });
    world(this.#points, id);
    this.#pointIds[index] = id;
    return id;
  }

  private addLine(command: LineCommand, index: number): void {
    const previous = this.#lineCache[index];
    this.#lineCache[index] = command;
    if (previous !== undefined && sameLine(previous, command)) return;
    this.#lineDirty = true;
    const id = this.#lineIds[index] ?? this.#addLineId(index);
    const dash = command.dash ?? [0, 0, 0];
    const normal = command.normal ?? [0, 0, 0];
    const joint = command.joint === "round" ? 1 : command.joint === "bevel" ? 2 : command.joint === "miter" ? 3 : 0;
    this.#lines.set(id, { start: command.start, end: command.end, color: command.color, colorEnd: command.colorEnd, width: command.width, flags: command.widthMode === "world" ? 1 : 0, dash, normal, joint });
  }

  #addLineId(index: number): InstanceId {
    const id = this.#lines.add({ start: [0, 0, 0], end: [0, 0, 0], color: [0, 0, 0, 0], colorEnd: [0, 0, 0, 0], width: 0, flags: 0, dash: [0, 0, 0], normal: [0, 0, 0], joint: 0 });
    world(this.#lines, id);
    this.#lineIds[index] = id;
    return id;
  }
}
