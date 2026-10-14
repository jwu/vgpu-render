import { draw, geometry, type Draw, type FramePass, type Gpu } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";

const GRID_SHADER = prepareShader(`
struct GridUniforms {
  viewProjection: mat4x4f,
  cameraPosition: vec3f,
  cellSize: f32,
  gridCenter: vec2f,
  lineWidth: f32,
  minorAlpha: f32,
  majorAlpha: f32,
  fadeDistance: f32,
  viewportSize: vec2f,
}
@group(0) @binding(0) var<uniform> grid: GridUniforms;

struct In { @location(0) position: vec3f }
struct Out {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
}

@vertex fn vs_main(input: In) -> Out {
  var out: Out;
  let world = input.position + vec3f(grid.gridCenter.x, 0.0, grid.gridCenter.y);
  out.world = world;
  out.clip = grid.viewProjection * vec4f(world, 1.0);
  return out;
}

fn lineCoverage(coord: vec2f, cell: f32) -> f32 {
  let scaled = coord / cell;
  let derivative = max(fwidth(scaled), vec2f(0.00001));
  let distanceToLine = min(fract(scaled), 1.0 - fract(scaled));
  let distancePixels = distanceToLine / derivative;
  let halfWidth = max(grid.lineWidth, 0.25) * 0.5;
  let coverage = 1.0 - smoothstep(vec2f(max(halfWidth - 0.5, 0.0)), vec2f(halfWidth + 0.5), distancePixels);
  return max(coverage.x, coverage.y);
}

@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let minor = lineCoverage(input.world.xz, max(grid.cellSize, 0.0001));
  let major = lineCoverage(input.world.xz, max(grid.cellSize * 10.0, 0.0001));
  let distanceFade = 1.0 - smoothstep(grid.fadeDistance * 0.35, grid.fadeDistance, distance(input.world, grid.cameraPosition));
  let alpha = max(minor * grid.minorAlpha, major * grid.majorAlpha) * distanceFade;
  if (alpha < 0.002) { discard; }
  let color = mix(vec3f(0.30, 0.36, 0.45), vec3f(0.70, 0.78, 0.88), step(minor, major));
  return vec4f(color, alpha);
}
`);

type GridCamera = {
  viewProjection: ArrayLike<number>;
  cameraPosition: readonly [number, number, number];
  gridCenter: readonly [number, number];
  viewportSize: readonly [number, number];
};

export type InfiniteGridOptions = {
  size?: number;
  cellSize?: number;
  lineWidth?: number;
  minorAlpha?: number;
  majorAlpha?: number;
  fadeDistance?: number;
};

export class InfiniteGrid3D {
  readonly #draw: Draw;
  readonly #geometry: ReturnType<typeof geometry>;
  readonly #options: Required<InfiniteGridOptions>;
  readonly #baseMinorAlpha: number;
  readonly #baseMajorAlpha: number;
  #camera: GridCamera = {
    viewProjection: new Float32Array(16),
    cameraPosition: [0, 5, 8],
    gridCenter: [0, 0],
    viewportSize: [1, 1],
  };

  constructor(gpu: Gpu, options: InfiniteGridOptions = {}) {
    this.#options = {
      size: options.size ?? 2000,
      cellSize: options.cellSize ?? 1,
      lineWidth: options.lineWidth ?? 1,
      minorAlpha: options.minorAlpha ?? 0.28,
      majorAlpha: options.majorAlpha ?? 0.58,
      fadeDistance: options.fadeDistance ?? 120,
    };
    this.#baseMinorAlpha = this.#options.minorAlpha;
    this.#baseMajorAlpha = this.#options.majorAlpha;
    const half = this.#options.size * 0.5;
    this.#geometry = geometry(gpu, {
      buffers: [{
        attributes: { position: "float32x3" },
        data: new Float32Array([
          -half, 0, -half, half, 0, -half, half, 0, half,
          -half, 0, -half, half, 0, half, -half, 0, half,
        ]),
      }],
      vertexCount: 6,
    });
    this.#draw = draw(gpu, {
      shader: GRID_SHADER,
      geometry: this.#geometry,
      blend: "alpha",
      depth: { write: false, compare: "less-equal" },
    });
  }

  prepare(camera: GridCamera): void {
    this.#camera = camera;
  }

  draw(pass: FramePass): void {
    this.#draw.set({
      grid: {
        viewProjection: this.#camera.viewProjection,
        cameraPosition: this.#camera.cameraPosition,
        cellSize: this.#options.cellSize,
        gridCenter: this.#camera.gridCenter,
        lineWidth: this.#options.lineWidth,
        minorAlpha: this.#options.minorAlpha,
        majorAlpha: this.#options.majorAlpha,
        fadeDistance: this.#options.fadeDistance,
        viewportSize: pass.target.size,
      },
    });
    pass.draw(this.#draw);
  }

  setOpacity(opacity: number): void {
    this.#options.minorAlpha = this.#baseMinorAlpha * Math.max(0, Math.min(1, opacity));
    this.#options.majorAlpha = this.#baseMajorAlpha * Math.max(0, Math.min(1, opacity));
  }

  destroy(): void {
    this.#draw.dispose();
    this.#geometry.destroy();
  }
}
