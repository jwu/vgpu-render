# Godot Debug Draw Parity Plan

This document tracks parity with `~/src/godot-debug-draw@hardpixel/examples` and
`~/src/godot-infinite-grid@hardpixel`.

## Status

The current port is **partial parity**. The live Circle/Line comparison in
[visual-comparison.md](visual-comparison.md) demonstrates mismatched layout,
rotation, dashes, normal samples, solid color/alpha and grid.
Since then the Circle and Line scenes were ported faithfully from the reference
sources, and their primitive bounding boxes now align within 1-2 px of the Godot
screenshots; the grid, the round/bevel/miter line joints, the curve control-point
markers, the Sphere/Cone/Cylinder/Capsule wireframes and the normal-aware line and
joint shading are ported, while AA is still incomplete.
Text rendering is vgpu's own capability rather than part of the port: the labels in the reference
examples are `Label3D` nodes owned by those scenes, not output of the addon. The port redraws them
anyway, because they are part of what an example looks like: `examples/shared/labels-3d.ts` carries the
reference column/row strings and `examples/<slug>/scene.ts` places them at the reference coordinates, on
the ground plane (`rotation: [-PI/2, 0, 0]`) at the reference `font_size`/`pixel_size`, so the
gallery and its sidebar finally agree with the reference text. The fonts differ, so glyph shapes
are not pixel-identical. See the README's Text section for the three placement spaces, the
`world-plane` rotation, the inlined Fira Mono subset, the `text-compare` matrix and the `text-*`
screen-space pages.
The 2D pages are likewise not reference ports: the addon has no 2D API, so they follow bevy's
`2d_gizmos` and `2d_shapes` examples and use the 2D layer documented in [2d-parity.md](2d-parity.md).
They are now classified like the 3D scenes rather than as two collages: `2d-index` stays an
overview, each shape primitive owns a page (`2d-rect`, `2d-rounded-rect`, `2d-circle`, `2d-ellipse`,
`2d-arc`, `2d-annulus`, `2d-capsule`, `2d-polygon`, `2d-triangle`, `2d-rhombus`, `2d-sector`,
`2d-segment`), and `2d-lines`, `2d-curves`, `2d-markers`, `2d-arrows`, `2d-spaces`, `2d-grid` give
each API family a column-by-row table with world-space labels.
`demo.gd` is absent from the manifest, and text rendering is not a reference
port. The current 17 entries
render geometry, but that is not proof of scene or visual equivalence. GPU scene
tests are smoke tests, not full visual regression baselines.

## Example scenes

Each scene is dispatched by `examples/runtime.ts` and implemented in its own `examples/<slug>/scene.ts`. `circle`, `line`,
`sphere`, `cone`, `cylinder` and `capsule` are faithful ports of the reference
sources: real column/row coordinates, colors, widths, the rotation-tunnel basis,
cumulative-arc-length dashes, and the reference wireframe topology (latitude rings and
meridian great circles for `sphere`, cap rings plus side silhouettes for `capsule`, base
ring plus side lines for `cone`/`cylinder`), and every `*_n` column (including the flat
`rect`/`box`/`circle`/`arc` families) draws the normals the reference computes for it.
`tests/reference-scenes.test.ts` locks those coordinates and parameters. Every scene uses the
reference layout; what is still approximate per scene is listed under *Known approximations*.

| Scene | Real capability |
| --- | --- |
| `index` | Overview of every primitive family across base/normal/dashed rows. |
| `line` | Width, alpha, dash, strip/loop topology, and normal-aware ribbons. |
| `arrow` | Arrow direction/width, arrow-line via polyline strips, normal-aware arrows. |
| `axes` | Axis length, width, and normal-aware variants. |
| `grid` | Width, cell count, spacing, skew, color, and rotated grids. |
| `rect` | Wire and solid rectangles with size, rotation, dash, normal rows. |
| `box` | Wire and solid boxes with size, rotation, dash, normal rows. |
| `circle` | Width, radius, segments, rotation, dash, normal, solid discs. |
| `arc` | Width, radius, angle, segments, rotation, dash, normal. |
| `curve` | Cubic Bezier sampling by tolerance, closed loops, dash, joints. |
| `sphere`/`cone`/`cylinder`/`capsule` | Reference wire and solid geometry: latitude rings + meridian great circles, base ring + side lines, cap rings + side silhouettes, and `*_s` meshes. |
| `world_space_width` | Screen-space vs world-space width scaling from the projection matrix. |

## Real renderer capabilities

- Point instances with screen/world size.
- Line instances with screen/world width, endpoint colors, dash phase, and
  normal-oriented width axis.
- Polyline/loop topology; round/bevel/miter joints are rebuilt in the vertex stage
  from the reference joint renderer and shaders (one instance per joined vertex,
  a shared fan mesh, `round_joint_resolution = 8`, `miter_limit = 4.0`).
- `curve` construction band: anchor and control-point markers ported from
  `_draw_curve_control_points` (pink anchor rings, yellow handle edges and rings).
- Normal-aware strokes: `*_n` lines and joints apply the reference back-face fade from a
  per-vertex normal (`LineOptions.normals`, `JointCommand.previousNormal` / `nextNormal`,
  `back_fade_start = 100°`, `back_fade_transition = 20°`, `0.2` floor).
- Triangle instances for transient solid meshes.
- Procedural helpers: `ray`, `arrow`, `axes`, `grid`, `circle`, `arc`, `curve`,
  `mesh`, `triangle`.
- Wire and solid geometry: `rect`, `box`, `disc`/`circle`, `arc`, `sphere`,
  `cone`, `cylinder`, `capsule`. The four shape wireframes are emitted as the reference
  does, one closed path per ring (`draw_line_loop`) plus loose side lines
  (`draw_line_list`), through `sphereWire`, `capsuleWire`, `coneWire` and
  `cylinderWire`; the `*_s` columns fill with the equivalent of Godot's `SphereMesh`
  (64 radial segments / 32 rings) and `CylinderMesh` (64 radial segments).
- Infinite shader grid ported from `godot-infinite-grid`: decimal LOD layers with
  de-duplicated alpha, screen-space line width, and edge/grazing/center/far fades
  driven by the reference camera-state rules. The addon's 2D grid is ported too, as
  `InfiniteGrid2D`: a full-viewport shader quad with the same decimal LOD scheme but without
  the 3D-only fades (see [2d-parity.md](2d-parity.md)).
- Layer filtering and alpha blend on a linear `rgba16float` target with an sRGB
  present pass (matching Godot `blend_mix` and bevy's `Rgba16Float` + `add_srgb_suffix`).
- Depth write for every primitive (`depth_draw_always`), a `-0.001` depth bias, and manual
  near-plane clipping, all ported from the reference line shader.

## Known approximations

These are deliberately not claimed as exact parity:

- **Index / World Space Width `line_list`**: the reference draws two short parallel point pairs.
  The port draws four pairs (horizontal, vertical and two opposed diagonals) and gives each
  `line_list_n` pair its own normal. At gallery distance the reference's two pairs overlap into
  what reads as one stroke and hide the back-face fade; the column, its row labels and its
  position are unchanged.
- **Grid**: `InfiniteGrid3D` mirrors `addons/infinite_grid/infinite_grid_3d`
  (parameter names, LOD range, fade stack, camera LOD distance). The earlier
  brightness gap is fixed: primitives blend on a linear `rgba16float` target and a
  present pass encodes to sRGB, so grid peak luminance now matches the reference.
  See `docs/visual-comparison.md`. Its `displayMode` / `dot*` options are a
  **gallery extension, not parity**: the reference addon has no dot lattice, so the
  endless dot field (ported from the tldraw-style canvas dots in
  `~/dev/tools/ai-workflow`) is documented in the README and is never counted as a
  reference behaviour.
- **Joints**: round, bevel and miter use the reference wedge geometry instead of
the earlier disc-cap patch. Out-of-range fan vertices are parked behind the far
plane, which is how one 24-vertex pipeline draws all three kinds. Normal-aware
joints (`debug_normal_line_joint_*`) blend the two path normals across the wedge
(`round_normal_t` / `bevel_normal_t` / `miter_normal_t` plus `joint_normal_fade`),
so `_n(joint)` columns shade like the segments they join. The reference passes the
two normals packed into two floats (octahedral, 8 bits each); this port sends them
as two `vec3` instance attributes instead of paying the quantisation, which is the
only difference from the reference encoding.
- **Arrow head geometry**: head length and angle are now wired into `FrameDrawList.arrow()` and the scene matrix.
- **Grid outer edges**: `grid()` now supports `none`, `x`, `z`, and `xz` boundary modes.
- **Normal-aware shading**: `*_n` lines and joints apply the reference back-face fade
  (`normal_fade`: full brightness until the surface normal is more than
  `back_fade_start = 100°` away from the view direction, then down to the `0.2` floor over
  `back_fade_transition = 20°`). `LineOptions.normals` carries one normal per path vertex
  and every segment uses its start vertex's normal, mirroring `_emit_normal_line_strip` /
  `_emit_normal_line_loop`; `JointCommand.previousNormal` / `nextNormal` are the two
  normals `_emit_normal_joint` receives. Every `*_n` entry point now supplies the reference's
  own normals: `sphereRingNormals`, `capsuleOutlineNormals`, `circleNormals`, `arcNormals`,
  `rectNormals`, `boxEdgeNormals`, `coneSideLineNormals`, `cylinderSideLineNormals`, plus the
  single per-primitive normals the reference passes for `line`/`ray`/`arrow`/`axes`/`grid`/
  `curve`. `GpuDebugDraw3D`'s `prepare()` requires the `view` matrix alongside
  `viewProjection` for the fade.
- **Column bases**: the reference scenes do not all draw the "flat" primitives in the same
  plane. `circle.gd` / `arc.gd` / `rect.gd` use their own flat rotation (the ground XZ plane),
  while `index.gd` / `world_space_width.gd` pass `Quaternion.IDENTITY`, which puts those
  columns in the XY plane. Both are reproduced per column now.
- **Curve construction points**: the construction band draws the reference anchor rings
  (pink, radius 0.045) plus the yellow handle edges and rings for every non-zero `in`/`out`
  control point, with `_get_curve_marker_rotation` swapping the basis columns so the rings lie
  in the XZ plane. Curve *sampling* still differs: the reference uses `tessellate_even_length`
  while this port subdivides with a fixed step count, so vertex counts differ even though the
  shape matches.

Anything flagged `implemented: false` in `examples/registry.ts` is shown with a
`·` marker in the gallery.
