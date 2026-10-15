import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { FrameRecorder, type LineOptions, type Vec3 } from "../src/frame-recorder.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";

/**
 * Reference back-face fade (`debug_normal_line_3d.gdshader` / `normal_fade`).
 *
 * These tests use an identity view matrix, so the "camera" sits at the world origin and
 * `viewDirection = normalize(-viewPosition)`. Placing the strokes at `y = +0.5` gives a
 * well-defined direction to compare normals against: a normal pointing down (-Y) faces the
 * camera, +Y points away by 180°, and ±X is sideways (100°+ away from the view direction is
 * where the reference starts fading, so sideways normals stay at full brightness).
 */

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const SIZE = 256;
const STROKE = 40;
const PX_PER_UNIT = SIZE / 2;
const HALF = STROKE / 2 / PX_PER_UNIT;

type InitGpu = Awaited<ReturnType<typeof init>>;
type RenderTarget = ReturnType<typeof target>;

function pixelAt(pixels: Uint8Array, worldX: number, worldY: number): readonly [number, number, number] {
  const x = Math.min(SIZE - 1, Math.max(0, Math.round((worldX + 1) * PX_PER_UNIT - 0.5)));
  const y = Math.min(SIZE - 1, Math.max(0, Math.round((1 - worldY) * PX_PER_UNIT - 0.5)));
  const i = (y * SIZE + x) * 4;
  return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
}

async function render(
  gpu: InitGpu,
  renderer: GpuDebugDraw3D,
  output: RenderTarget,
  draw: (recorder: FrameRecorder) => void,
): Promise<Uint8Array> {
  const recorder = new FrameRecorder();
  draw(recorder);
  renderer.prepare(recorder.commands(), { viewProjection: identity, view: identity });
  frame(gpu, (f) => {
    renderer.updateIndirect(f);
    f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
  });
  return output.color.read({ mipLevel: 0, region: "all" });
}

const white = [1, 1, 1, 1] as const;

test("a stroke whose normal points away keeps only the 20% fade floor", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 8, joints: 8 });
  const output = target(gpu, { size: [SIZE, SIZE], depth: true });
  try {
    const line = (options: LineOptions): Promise<Uint8Array> =>
      render(gpu, renderer, output, (recorder) => {
        recorder.line([-0.4, 0.5, 0], [0.4, 0.5, 0], { color: white, width: STROKE, ...options });
      });

    const facing = pixelAt(await line({ normal: [0, -1, 0] }), 0, 0.5);
    const away = pixelAt(await line({ normal: [0, 1, 0] }), 0, 0.5);
    const sideways = pixelAt(await line({ normal: [1, 0, 0] }), 0, 0.5);
    const plain = pixelAt(await line({}), 0, 0.5);

    // A camera-facing normal keeps the authored color.
    expect(facing).toEqual(plain);
    expect(facing[0]).toBeGreaterThan(240);
    // Sideways sits inside the reference `back_fade_start` angle, so it is not faded either.
    expect(sideways).toEqual(facing);
    // 180° away clamps to the reference floor: `mix(0.2, 1.0, smoothstep(...))` = 0.2. The
    // scene target is 8-bit linear, so the white stroke lands on 0.2 * 255 = 51.
    expect(away[0]).toBe(51);
    expect(away[0]).toBeLessThan(facing[0]);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});

test("normal-aware joints blend both path normals across the wedge", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 16, joints: 16 });
  const output = target(gpu, { size: [SIZE, SIZE], depth: true });
  try {
    // The right-angle turn sits at (0, 0.5), so its view direction is -Y. The miter tip below
    // the corner is reached by the wedge only, which is what makes it a joint-only sample.
    const path: Vec3[] = [[-0.4, 0.5, 0], [0, 0.5, 0], [0, 0.9, 0]];
    const tip = { x: 0.9 * HALF, y: 0.5 - 0.9 * HALF };
    const corner = async (normals?: readonly Vec3[]): Promise<readonly [number, number, number]> =>
      pixelAt(
        await render(gpu, renderer, output, (recorder) => {
          recorder.lineStrip(path, { joint: "miter", width: STROKE, color: white, ...(normals === undefined ? {} : { normals }) }, false);
        }),
        tip.x,
        tip.y,
      );

    const facingNormals: readonly Vec3[] = [[0, -1, 0], [0, -1, 0], [0, -1, 0]];
    const awayNormals: readonly Vec3[] = [[0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const plain = await corner();
    const facing = await corner(facingNormals);
    const away = await corner(awayNormals);
    // `_emit_normal_joint` only changes the shading: a wedge-facing normal pair keeps the
    // authored color, and the wedge tip follows the previous normal.
    expect(plain[0]).toBeGreaterThan(240);
    expect(facing).toEqual(plain);
    expect(away[0]).toBeLessThan(facing[0]);
    // A facing previous normal with an away-facing next normal blends between the extremes
    // (`normalize(mix(previous, next, normal_t))`), so it matches neither of them.
    const blended = await corner([[0, -1, 0], [0, 1, 0], [0, 1, 0]]);
    expect(blended[0]!).toBeGreaterThan(away[0]!);
    expect(blended[0]!).toBeLessThan(facing[0]!);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});
