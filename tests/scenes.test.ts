import { expect, test } from "vitest";
import { init, target, frame } from "vgpu/node";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import { SCENE_EXAMPLES } from "../examples/basic/registry.js";
import { buildScene } from "../examples/basic/runtime.js";
import { SyntheticFont } from "./support/synthetic-font.js";

// A unit-scale projection would clip the text scenes away: the source/size matrix spans about 20 world
// units. The `view` matrix stays a pure identity because billboards read the camera axes out of it,
// and a scaled one would scale their quads too.
const SCALE = 1 / 24;
const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const wideCamera = new Float32Array([SCALE, 0, 0, 0, 0, SCALE, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function commandsFor(id: string, time = 0): number {
  const debug = new DebugDraw3D();
  const drawList = debug.beginFrame();
  buildScene(id, drawList, time);
  return debug.finishFrame(drawList).length;
}

test("every Godot example builds transient commands", () => {
  for (const example of SCENE_EXAMPLES) {
    const count = commandsFor(example.id, 0.4);
    expect(count, `${example.id} produced no commands`).toBeGreaterThan(0);
  }
});

test("animated scenes react to time", () => {
  const first = commandsFor("line", 0);
  const second = commandsFor("line", 1.5);
  expect(first).toBeGreaterThan(0);
  expect(second).toBeGreaterThan(0);
});

/** Start points of the red axis line, which is what `draw_axes` emits first. */
function redAxisStarts(id: string): number[][] {
  const debug = new DebugDraw3D();
  const drawList = debug.beginFrame();
  buildScene(id, drawList, 0);
  const starts: number[][] = [];
  for (const command of debug.finishFrame(drawList)) {
    if (command.kind !== "line") continue;
    const [r, g, b] = command.color;
    if (r === 1 && g === 0 && b === 0) starts.push([...command.start]);
  }
  return starts;
}

test("origin axes sit on the world origin, where the grid's lines cross", () => {
  // The infinite grid computes its lines from world XZ and never moves, so the gizmo has to stay on
  // the world origin instead of following the scene layout. See `docs/reference-parity.md`.
  //
  // The three ways the gizmo reaches a frame: the `index`/`world_space_width` matrix, `grid`'s own
  // call, and the shared one in `runtime.ts` for every other 3D page.
  for (const id of ["index", "world_space_width", "grid", "line"]) {
    const atOrigin = redAxisStarts(id).some((start) => start[0] === 0 && start[1] === 0 && start[2] === 0);
    expect(atOrigin, `${id} is missing the origin gizmo`).toBe(true);
  }
});

test("real GPU renders every Godot example without errors", async () => {
  const gpu = await init();
  try {
    // Large enough for the screen-space HUD example: those blocks sit at fixed pixel positions, so
    // a small target clips them entirely and the example looks like it renders nothing.
    const output = target(gpu, { size: [512, 384], depth: true });
    // The text examples need glyph sources, and Node has no Canvas2D or font outlines, so the
    // synthetic one stands in. The comparison scene names every source the gallery registers.
    const renderer = new GpuDebugDraw3D(gpu, {
      points: 32768,
      lines: 131072,
      triangles: 131072,
      text: {
        atlasSize: 1024,
        sources: {
          default: new SyntheticFont(),
          bitmap: new SyntheticFont("bitmap"),
          bitmap4x: new SyntheticFont("bitmap", 4),
          sdf: new SyntheticFont("sdf"),
          sdf4x: new SyntheticFont("sdf", 4),
          msdf: new SyntheticFont("msdf"),
          msdf2x: new SyntheticFont("msdf", 2),
          baked: new SyntheticFont("msdf"),
        },
      },
    });
    for (const example of SCENE_EXAMPLES) {
      const debug = new DebugDraw3D();
      const drawList = debug.beginFrame();
      buildScene(example.id, drawList, 0.6);
      const commands = debug.finishFrame(drawList);
      renderer.prepare(commands, { viewProjection: wideCamera, view: identity });
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      const pixels = await output.color.read({ mipLevel: 0, region: "all" });
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 10 || pixels[i + 1]! > 10 || pixels[i + 2]! > 10) lit++;
      expect(lit, `${example.id} rendered no visible pixels`).toBeGreaterThan(0);
    }
    renderer.destroy();
  } finally {
    gpu.dispose();
  }
}, 60000);
