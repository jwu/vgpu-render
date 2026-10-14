# Godot Debug Draw Parity Plan

This document tracks parity with `~/src/godot-debug-draw@hardpixel/examples` and
`~/src/godot-infinite-grid@hardpixel`.

## Status

The current port is **partial parity**. The live Circle/Line comparison in
[visual-comparison.md](visual-comparison.md) demonstrates mismatched layout,
rotation, dashes, normal samples, solid color/alpha, grid and missing labels.
Since then the Circle and Line scenes were ported faithfully from the reference
sources, and their primitive bounding boxes now align within 1-2 px of the Godot
screenshots; bevel/miter joins, the grid, AA, labels and the remaining scenes are
still incomplete. `demo.gd` is absent from the manifest. The current 15 entries
render geometry, but that is not proof of scene or visual equivalence. GPU scene
tests are smoke tests, not full visual regression baselines.

## Example scenes

Each scene is produced by `src/godot-scenes.ts`. `circle` and `line` are faithful
ports of the reference sources: real column/row coordinates, colors, widths, the
rotation-tunnel basis, and cumulative-arc-length dashes. `tests/reference-scenes.test.ts`
locks those coordinates and parameters. The remaining scenes still use a compressed
`slot()` layout and simplified parameter columns.

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
| `sphere`/`cone`/`cylinder`/`capsule` | Wire and solid generated meshes with rotation rows. |
| `world_space_width` | Screen-space vs world-space width scaling from the projection matrix. |

## Real renderer capabilities

- Point instances with screen/world size.
- Line instances with screen/world width, endpoint colors, dash phase, and
  normal-oriented width axis.
- Polyline/loop topology; screen-space round joins are emitted as disc caps.
- Triangle instances for transient solid meshes.
- Procedural helpers: `ray`, `arrow`, `axes`, `grid`, `circle`, `arc`, `curve`,
  `mesh`, `triangle`.
- Wire and solid geometry: `rect`, `box`, `disc`/`circle`, `arc`, `sphere`,
  `cone`, `cylinder`, `capsule`.
- Infinite shader grid with minor/major LOD and `fwidth` anti-aliasing.
- Layer filtering, alpha blend, depth test, and depth write for solids.

## Known approximations

These are deliberately not claimed as exact parity:

- **Joints**: round joins render as real screen-space disc caps. `bevel` and `miter` remain plain segments and are flagged as approximations in the manifest.
- **Arrow head geometry**: head length and angle are now wired into `FrameRecorder.arrow()` and the scene matrix.
- **Grid outer edges**: `grid()` now supports `none`, `x`, `z`, and `xz` boundary modes.
- **Normal orientation**: normal-aware lines compute the width axis from `cross(direction, normal)` projected to screen; degenerate cases fall back to the screen-space perpendicular.
- **Curve construction points**: control handles are not drawn as separate markers; only the sampled curve geometry is rendered.

Anything flagged `implemented: false` in `src/godot-examples.ts` is shown with a
`·` marker in the gallery.
