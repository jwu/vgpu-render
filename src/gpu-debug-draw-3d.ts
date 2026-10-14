import { draw, geometry, type Draw, type FramePass, type Gpu } from "vgpu";
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
function clear(collection: InstanceCollection, ids: InstanceId[]): void {
  for (const id of ids) collection.remove(id);
  ids.length = 0;
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
  readonly #pointBridge: InstanceGeometry;
  readonly #lineBridge: InstanceGeometry;
  readonly #triangleBridge: InstanceGeometry;
  readonly #pointDraw: Draw;
  readonly #lineDraw: Draw;
  readonly #triangleDraw: Draw;
  #viewProjection: ArrayLike<number> = identity();
  #pointCount = 0;
  #lineCount = 0;
  #triangleCount = 0;

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
  }

  prepare(commands: readonly FrameCommand[], camera: Camera): void {
    clear(this.#points, this.#pointIds);
    clear(this.#lines, this.#lineIds);
    clear(this.#triangles, this.#triangleIds);
    for (const command of commands) {
      if (command.kind === "point") this.addPoint(command);
      else if (command.kind === "triangle") this.addTriangle(command);
      else this.addLine(command);
    }
    this.#pointCount = this.#pointBridge.publish();
    this.#lineCount = this.#lineBridge.publish();
    this.#triangleCount = this.#triangleBridge.publish();
    this.#viewProjection = camera.viewProjection;
  }

  draw(pass: FramePass): void {
    const camera = { viewProjection: this.#viewProjection, viewportSize: pass.target.size };
    this.#pointDraw.set({ camera });
    this.#lineDraw.set({ camera });
    this.#triangleDraw.set({ camera: { viewProjection: this.#viewProjection } });
    if (this.#triangleCount > 0) pass.draw(this.#triangleDraw, { instances: this.#triangleCount });
    if (this.#pointCount > 0) pass.draw(this.#pointDraw, { instances: this.#pointCount });
    if (this.#lineCount > 0) pass.draw(this.#lineDraw, { instances: this.#lineCount });
  }

  destroy(): void {
    this.#pointDraw.dispose();
    this.#lineDraw.dispose();
    this.#triangleDraw.dispose();
    this.#pointBridge.destroy();
    this.#lineBridge.destroy();
    this.#triangleBridge.destroy();
  }

  private addTriangle(command: TriangleCommand): void {
    const id = this.#triangles.add({ a: command.a, b: command.b, c: command.c, color: command.color });
    world(this.#triangles, id);
    this.#triangleIds.push(id);
  }

  private addPoint(command: PointCommand): void {
    const id = this.#points.add({ point: command.position, color: command.color, size: command.size, flags: (command.sizeMode === "world" ? 1 : 0) | (command.round ? 2 : 0) });
    world(this.#points, id);
    this.#pointIds.push(id);
  }

  private addLine(command: LineCommand): void {
    const dash = command.dash ?? [0, 0, 0];
    const normal = command.normal ?? [0, 0, 0];
    const joint = command.joint === "round" ? 1 : command.joint === "bevel" ? 2 : command.joint === "miter" ? 3 : 0;
    const id = this.#lines.add({ start: command.start, end: command.end, color: command.color, colorEnd: command.colorEnd, width: command.width, flags: command.widthMode === "world" ? 1 : 0, dash, normal, joint });
    world(this.#lines, id);
    this.#lineIds.push(id);
  }
}
