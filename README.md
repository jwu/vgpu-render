# vgpu-render

A 3D debug-draw and gizmo layer built on top of `vgpu`, porting the
[godot-debug-draw](https://github.com/hardpixel/godot-debug-draw) examples and
[godot-infinite-grid](https://github.com/hardpixel/godot-infinite-grid) shader
grid to TypeScript + WGSL.

The current implementation is **partial parity**, not a complete migration. The
Circle/Line runtime screenshot comparison in
[`docs/visual-comparison.md`](docs/visual-comparison.md) records the remaining
layout, dash, rotation, normal-aware width, color, grid and label differences;
round/bevel/miter line joins are built in the vertex stage like the reference.
Passing GPU smoke tests does not establish visual equivalence.

## Usage

The public API uses an explicit frame recorder:

```ts
const recorder = debug.beginFrame();
recorder.point([0, 0, 0], { color: [1, 0, 0, 1], size: 8 });
recorder.line([0, 0, 0], [1, 0, 0], { color: [0, 1, 0, 1], width: 2 });
recorder.arrow([0, 0, 0], [1, 1, 0], { color: [0, 0.5, 1, 1] });
recorder.lineStrip([[0, 0, 0], [1, 0, 1], [2, 0, 0]], { width: 4, joint: "round" }, false);
// Per-vertex normals select the reference `*_n` shading: each segment uses its start
// vertex's normal and the joints between them blend the two normals.
recorder.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { width: 4, joint: "round", normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]] }, false);
recorder.grid([0, 0, 0], [4, 4], [0.5, 0.5], { color: [0.4, 0.4, 0.5, 1] });
recorder.curve(cubicBezier, { color: [1, 1, 1, 1], tolerance: 0.08 });
recorder.mesh(sphere(0.5), { solid: true, color: [0.2, 0.6, 1, 0.8] });
const commands = debug.finishFrame(recorder);

// `view` is the world-to-view matrix; normal-aware strokes read it like Godot's VIEW_MATRIX.
renderer.prepare(commands, { viewProjection, view });
grid.prepare({ viewProjection, cameraPosition, cameraForward, projection, farClip });
frame(gpu, (f) => f.pass({ target, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
  grid.draw(pass);
  renderer.draw(pass);
}));
```

`grid.prepare()` takes the camera state the reference addon reads from Godot's
`Camera3D`: position, normalized forward, projection mode, and far clip. The LOD
distance is derived from that state (see below), so there is no separate
`fadeDistance` parameter.

## Infinite grid

`InfiniteGrid3D` is a faithful port of the Godot addon
[`hardpixel/godot-infinite-grid`](https://github.com/hardpixel/godot-infinite-grid)
(`addons/infinite_grid/infinite_grid_3d.{gd,gdshader}`), including its parameter
names, decimal LOD scheme and fade stack:

| Option | Reference property | Default |
| --- | --- | --- |
| `size` | `grid_size` | `2000` |
| `edgeFadeStartRatio` / `edgeFadeEndRatio` | `edge_fade_*_ratio` | `0` / `1` |
| `cellSize` | `cell_size` | `1` |
| `lineWidthPixels` | `line_width_pixels` | `1` |
| `lodFinerLevels` / `lodTotalLevels` | `lod_*_levels` | `3` / `8` |
| `enableGrazingOpacity`, `grazingFadeStart/End` | `enable_grazing_opacity`, `grazing_fade_*` | `true`, `3°`, `20°` |
| `enableLodCenterFade`, `lodCenterFadeLineCount` | `enable_lod_center_fade`, `lod_center_fade_line_count` | `true`, `151` |
| `enableStippleDiscard` | `enable_stipple_discard` | `false` |
| `thinLineColor` / `thickLineColor` | `thin_line_color` / `thick_line_color` | `[0.42,0.42,0.42,0.45]` / `[0.62,0.62,0.62,0.65]` |
| `debugLodColors` | `debug_lod_colors` | `false` |

Behavior preserved from the reference:

- Three decimal LOD layers (finer / current / coarser) are combined with
de-duplicated alpha, and the current layer fades toward the next coarser cell
size. With `cellSize = 1`, `lodFinerLevels = 3` and `lodTotalLevels = 8` the
range is `0.001 … 10000`.
- The camera LOD distance uses the reference rule: the view-to-ground distance
blended toward camera height near grazing angles, clamped to the finest LOD cell
size; orthographic projection uses `size` instead, and the focus point comes
from the ray-plane intersection.
- Edge, grazing, far-clip and per-LOD center fades, plus optional low-alpha
stipple discard, run in the same order and with the same clamps.
- The plane follows the camera on XZ (`follow_viewport_camera`) and writes depth,
so it composites like the reference `depth_draw_always`, two-sided material.

The `direction-facing` difference: the reference renders through Godot's
linear-space pipeline and encodes to sRGB on output, while the WebGPU canvas here
is `bgra8unorm` (Chromium rejects `bgra8unorm-srgb` as a canvas format). Line
positions, LOD banding and coverage therefore match, but blended line pixels are
darker than the Godot reference. See `docs/visual-comparison.md`.

`setOpacity()` is a gallery extension: it scales the two reference line-colour
alphas, which the addon does not expose.
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
- Normal-aware strokes: `LineOptions.normal` for a single normal, `LineOptions.normals` for
  per-vertex normals (one per segment on an open path, one per vertex on a closed one). Lines
  and joints apply the reference back-face fade (`back_fade_start = 100°`,
  `back_fade_transition = 20°`, `0.2` floor) from the `view` matrix `prepare()` receives.
- Procedural helpers: `ray`, `arrow`, `axes`, `grid`, `curve`, `lineStrip`,
  `lineLoop`, `mesh`, `triangle`.
- Geometry generators: `rect`, `box`, `disc`, `arc`, `cylinder`, `cone`,
  `sphere`, `capsule`, `gridLines`, and cubic `sampleCurve`.
- Reference wireframe generators: `sphereWire`, `capsuleWire`, `coneWire`,
  `cylinderWire` and `circlePoints` return `draw_line_loop` rings plus
  `draw_line_list` segments, so `shape.y`/`z`/`side` parameters select ring counts
  exactly like `draw_sphere`/`draw_capsule`/`draw_cone`/`draw_cylinder` rather than
  mesh subdivisions.
- `InfiniteGrid3D` shader-driven ground grid ported from `godot-infinite-grid`
  (decimal LOD layers, screen-space width, edge/grazing/center/far fades).
- Orbit/pan/zoom camera controls in the gallery, tuned to the reference
  `entities/free_camera.gd` and layered on a velocity model (`src/demo-camera.ts`): a drag is
  an angular velocity (0.25°/px) or a linear velocity (`distance`/FOV in perspective,
  `orthographicHeight` in orthographic), a wheel notch is a scalar velocity in log₂ space
  (1.08× per notch), and a released drag keeps its velocity and glides — the exact integral of
  an exponentially decaying velocity (halflife 0.14 s), capped at 60°, half a screen of pan and
  0.75 doublings of zoom. Releasing more than 90 ms after the last sample is treated as a stop.
- Example switching frames the selected scene (`frameBounds`): the orbit pivot moves to the
  scene's bounding-box centre and the distance/height fit its projected corners, so rotating
  turns around the geometry instead of the origin. `?camera=reference` disables that framing so
  the reference pose stays put for comparisons.

See `docs/godot-debug-draw-parity.md` for the scene-by-scene parity status and the
known approximations, and `docs/visual-comparison.md` for the Godot-vs-vgpu
screenshot comparisons and measured alignment.

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
width multiplier, projection, background, camera preset and reset; camera
interaction is persisted. The camera preset switches between the gallery orbit
pose and the reference scene pose (`examples/*.tscn` `FreeCamera`, also reachable
as `/?scene=line&camera=reference`). Screenshot mode uses a deterministic preset
without localStorage: `/?compare=1&scene=circle`. Orthographic zoom changes the
orthographic extent.

The gallery UI is built with **Base UI + shadcn (base-lyra preset) + Tailwind v4**
in `src/components/`, and the imperative WebGPU side lives in `src/demo-engine.ts`.
React only renders chrome; the render loop, camera, and persistence stay outside
React and are read through `useSyncExternalStore`
(`src/demo-hooks.ts`). `src/demo.tsx` mounts the shell, `src/index.css` holds the base-lyra
theme tokens, and `src/demo.css` keeps the three-column layout, compare mode
and code highlighting.

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
