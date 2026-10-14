# vgpu-render

A 3D debug-draw and gizmo layer built on top of `vgpu`, porting the
[godot-debug-draw](https://github.com/hardpixel/godot-debug-draw) examples and
[godot-infinite-grid](https://github.com/hardpixel/godot-infinite-grid) shader
grid to TypeScript + WGSL.

The current implementation is **partial parity**, not a complete migration. The
Circle/Line runtime screenshot comparison in
[`docs/visual-comparison.md`](docs/visual-comparison.md) identifies unresolved
layout, dash, rotation, normal, joint, color, grid and label differences. Passing
GPU smoke tests does not establish visual equivalence.

## Usage

The public API uses an explicit frame recorder:

```ts
const recorder = debug.beginFrame();
recorder.point([0, 0, 0], { color: [1, 0, 0, 1], size: 8 });
recorder.line([0, 0, 0], [1, 0, 0], { color: [0, 1, 0, 1], width: 2 });
recorder.arrow([0, 0, 0], [1, 1, 0], { color: [0, 0.5, 1, 1] });
recorder.lineStrip([[0, 0, 0], [1, 0, 1], [2, 0, 0]], { width: 4, joint: "round" }, false);
recorder.grid([0, 0, 0], [4, 4], [0.5, 0.5], { color: [0.4, 0.4, 0.5, 1] });
recorder.curve(cubicBezier, { color: [1, 1, 1, 1], tolerance: 0.08 });
recorder.mesh(sphere(0.5), { solid: true, color: [0.2, 0.6, 1, 0.8] });
const commands = debug.finishFrame(recorder);

renderer.prepare(commands, { viewProjection });
grid.prepare({ viewProjection, cameraPosition, gridCenter, viewportSize });
frame(gpu, (f) => f.pass({ target, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
  grid.draw(pass);
  renderer.draw(pass);
}));
```

## Pipeline

```text
FrameRecorder -> FrameCommand[] -> GpuDebugDraw3D
  points    -> instanced billboards
  lines     -> screen-space or world-space quads, dash + normal aware
  triangles -> transient solid meshes
```

Points and lines are instanced; the CPU never expands a line into triangles. The
infinite grid is a single finite plane whose fragment shader derives minor/major
LOD grid lines.

## Capabilities

- Points (screen/world size), lines (screen/world width, dash, normal), triangles.
- Procedural helpers: `ray`, `arrow`, `axes`, `grid`, `curve`, `lineStrip`,
  `lineLoop`, `mesh`, `triangle`.
- Geometry generators: `rect`, `box`, `disc`, `arc`, `cylinder`, `cone`,
  `sphere`, `capsule`, `gridLines`, and cubic `sampleCurve`.
- `InfiniteGrid3D` shader-driven ground grid.
- Orbit/pan/zoom camera controls in the gallery.

See `docs/godot-debug-draw-parity.md` for the scene-by-scene parity status and the
known approximations, and `docs/visual-comparison.md` for the live Circle/Line
Godot-vs-vgpu screenshot comparison and measured alignment.

## Global configuration

Library defaults are separate from gallery state. Explicit primitive options
have priority over constructor defaults:

```ts
const debug = new DebugDraw3D({
  defaultVisibleLayers: 1,
  defaultPointStyle: { color: [1, 1, 1, 1], size: 8 },
  defaultLineStyle: { color: [0.2, 0.8, 1, 1], width: 2, widthMode: "screen" },
});
```

`src/demo-config.ts` contains independently validated camera/view configuration
and injected storage helpers. Gallery controls support grid, opacity, animation,
width multiplier, projection, background and reset; camera interaction is
persisted. Screenshot mode uses a deterministic preset without localStorage:
`/?compare=1&scene=circle`. Orthographic zoom changes the orthographic extent.

Runtime comparison viewer:
`http://127.0.0.1:5174/artifacts/visual-baseline/index.html`.

## Development

```bash
bun run typecheck
bun test
bun run build
bun run dev
```

Visual baselines:

```bash
# Godot reference capture (independent copy, real Vulkan)
godot --path /tmp/vgpu-parity-godot --display-driver x11 --audio-driver Dummy \
  --resolution 1920x1080 --script /tmp/vgpu-parity-godot/capture.gd -- \
  circle "$PWD/artifacts/visual-baseline/godot-circle.png"

# vgpu capture over CDP (needs a GPU display + dev server)
bun scripts/capture-vgpu.ts circle line
```
