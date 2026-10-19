# vgpu-render

**[Examples gallery →](https://jwu.github.io/vgpu-render/)**

A 3D debug-draw and gizmo layer built on top of `vgpu`, porting the reference
debug-draw addon's examples and its shader-driven infinite grid to TypeScript +
WGSL.

The current implementation is **partial parity**, not a complete migration. The
Circle/Line runtime screenshot comparison in
[`docs/visual-comparison.md`](docs/visual-comparison.md) records the remaining
layout, dash, rotation, normal-aware width, color, grid and label differences;
round/bevel/miter line joins are built in the vertex stage like the reference.
Passing GPU smoke tests does not establish visual equivalence.

Text rendering (see [Text](#text)) is vgpu's own capability rather than a port: the reference addon
has no text API at all, and the labels in its examples are plain billboard nodes.

## Install

```bash
bun add vgpu-render vgpu
# or
npm install vgpu-render vgpu
```

`vgpu` is a peer dependency: the host application owns the WebGPU device and the frame loop, so both
packages must resolve the same `vgpu` copy. `@vgpu/wgsl` and `opentype.js` ship as regular
dependencies of this package.

## Usage

The public API uses an explicit frame draw list:

```ts
const drawList = debug.beginFrame();
drawList.point([0, 0, 0], { color: [1, 0, 0, 1], size: 8 });
drawList.line([0, 0, 0], [1, 0, 0], { color: [0, 1, 0, 1], width: 2 });
drawList.arrow([0, 0, 0], [1, 1, 0], { color: [0, 0.5, 1, 1] });
drawList.lineStrip([[0, 0, 0], [1, 0, 1], [2, 0, 0]], { width: 4, joint: "round" }, false);
// Per-vertex normals select the reference `*_n` shading: each segment uses its start
// vertex's normal and the joints between them blend the two normals.
drawList.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { width: 4, joint: "round", normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]] }, false);
drawList.grid([0, 0, 0], [4, 4], [0.5, 0.5], { color: [0.4, 0.4, 0.5, 1] });
drawList.curve(cubicBezier, { color: [1, 1, 1, 1], tolerance: 0.08 });
drawList.mesh(sphere(0.5), { solid: true, color: [0.2, 0.6, 1, 0.8] });
drawList.text([0, 1, 0], "world label", { fontSize: 32, pixelSize: 0.01, color: [1, 0.8, 0.2, 1] });
drawList.text([24, 24, 0], "screen HUD", { space: "screen", anchor: "top-left", fontSize: 16 });
const commands = debug.finishFrame(drawList);

// `view` is the world-to-view matrix; normal-aware strokes read it like the reference view matrix.
renderer.prepare(commands, { viewProjection, view });
grid.prepare({ viewProjection, cameraPosition, cameraForward, projection, farClip });
frame(gpu, (f) => f.pass({ target, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
  grid.draw(pass);
  renderer.draw(pass);
}));
```

`grid.prepare()` takes the camera state the reference addon reads from its
camera node: position, normalized forward, projection mode, and far clip. The LOD
distance is derived from that state (see below), so there is no separate
`fadeDistance` parameter.

## Infinite grid

`InfiniteGrid3D` is a faithful port of the reference grid addon, including its parameter
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

The `direction-facing` difference: the reference renders through a linear-space
pipeline and encodes to sRGB on output, while the WebGPU canvas here
is `bgra8unorm` (Chromium rejects `bgra8unorm-srgb` as a canvas format). Line
positions, LOD banding and coverage therefore match, but blended line pixels are
darker than the reference. See `docs/visual-comparison.md`.

### Dot lattice (gallery extension, not reference parity)

`displayMode` and the `dot*` options ride on the existing infinite-grid shaders — the 3D finite
quad and the 2D full-viewport quad — so the endless dot lattice needs no extra geometry, draw call
or LOD scheme of its own. `InfiniteGrid3D` and `InfiniteGrid2D` share the option names, defaults
and shader maths; the 2D grid derives the pixel scale from `zoom`, the 3D one from `dpdx/dpdy` of
the world position:

| Option | Default | Meaning |
| --- | --- | --- |
| `displayMode` | `"grid"` | `"grid"` (reference lines) or `"dots"` (lattice) |
| `dotRadiusPixels` | `2` | dot radius, held in screen pixels |
| `dotFadeFromPixels` / `dotFadeToPixels` | `6` / `20` | on-screen spacing at which a layer fades out / reaches full strength |
| `dotSpacingFactor` | `4` | spacing factor between neighbouring dot layers |
| `dotColor` | `[0.62, 0.62, 0.62, 0.55]` | dot color; alpha participates like the line alphas |

The lattice is ported from the tldraw-style canvas dots in
`~/dev/tools/ai-workflow/src/canvas/dots.tsx`: a dot keeps a fixed screen radius, a
4x spacing ladder keeps its on-screen density roughly constant, and layers whose
spacing gets too narrow fade out instead of turning into a grey wash. Four layers
(-1..2 in the ladder) are combined with `max` so overlapping lattice points do not
brighten. On the 3D plane the edge, grazing, far-clip and center fades still apply
unchanged; the 2D quad has no such fades to begin with, so it only gates the lattice
by on-screen spacing. `displayMode` is an exclusive choice: the lattice replaces the
reference lines rather than blending with them, so the two sets of panel options never
apply at the same time.
Because the reference addon has no dot field, nothing here counts as parity — the
gallery exposes it purely as a configurable option.

`setOpacity()` is a gallery extension: it scales the two reference line-colour
alphas plus the dot alpha, which the addon does not expose.
```

## Pipeline

```text
FrameDrawList -> FrameCommand[] -> GpuDebugDraw3D
  points    -> instanced billboards
  lines     -> screen-space or world-space quads, dash + normal aware
  triangles -> transient solid meshes
  text      -> per-glyph instanced quads sampling a generated glyph atlas
  2D        -> GpuDebugDraw2D: 2D lines/points/joints + SDF shape quads, drawn as an overlay
```

Points and lines are instanced; the CPU never expands a line into triangles. The
infinite grid is a single finite plane whose fragment shader derives minor/major
LOD grid lines.

## 2D

`frame.d2` records 2D primitives into the same frame and layer mask as the 3D calls:

```ts
const frame = debug.beginFrame();
frame.d2.line([0, 0], [120, 40], { width: 2, color: [1, 0, 0, 1] });
frame.d2.lineStrip([[0, 0], [40, 80], [90, 10]], { width: 4, joint: "round" });
frame.d2.grid([0, 0], [8, 5], [40, 40], { color: [0.4, 0.4, 0.5, 1] });
frame.d2.rect([0, 0], [80, 40], { strokeWidth: 2 });
frame.d2.rect_s([160, 0], [80, 40], { color: [0.9, 0.9, 1, 1] });
frame.d2.rect_d([320, 0], [80, 40], [12, 6, 0], { strokeWidth: 2 });
frame.d2.rect_r_s([0, -60], [120, 40], 12, { color: [1, 0.7, 0.3, 1] });
frame.d2.circle_s([0, 120], 60, { color: [0, 0.5, 1, 1] });
frame.d2.arc([0, 120], 80, { strokeWidth: 3, startAngle: 0, sweep: Math.PI / 2 });
const commands = debug.finishFrame(frame);
// The third argument is the 2D camera; omit it and the last one stays in effect.
renderer.prepare(commands, { viewProjection, view }, { pan: [0, 0], zoom: 1 });
```

Two coordinate spaces share one pixel-based pipeline:

| `space` | Origin | +y | Unit | Affected by the 2D camera |
| --- | --- | --- | --- | --- |
| `world2d` (default) | canvas centre | up | one canvas pixel at `zoom = 1` | yes |
| `screen` | top-left corner | down | one canvas pixel | no |

`world2d` mirrors the reference 2D camera: the origin is the centre of the target, `+y` points up and
`zoom` is canvas pixels per world unit. Both spaces are in **target pixels**, like the text `screen`
space, so a HiDPI caller scales `screen` content itself (`gallery/screen-scale.ts` does that for the
gallery); `world2d` needs no such step because its projection already reads the target size. `2d_shapes`' `X_EXTENT = 1000` is a pixel-scale world
coordinate in that sense, not a top-left one — the top-left, +y-down space is the reference UI space,
and here it is `screen`, the same one `TextSpace "screen"` already uses.

- Strokes: `line`, `ray`, `lineStrip`/`polyline`, `lineLoop`, `grid`, `point`; every stroke has a
`_d` twin (`line_d`, `ray_d`, `lineStrip_d`, `polyline_d`, `lineLoop_d`, `grid_d`) that takes the
same `[visible, gap, phase]` triple and phase accumulation as the 3D dashed paths. Screen-pixel or
world widths, and round/bevel/miter joints.
- Arrows: `arrow` / `arrow_s` / `arrow_d` / `arrow_s_d` — the open V head by default, a filled head
for `_s`, and the same two forms dashed for `_d`, with `headLength` / `headAngle` options.
- Curves: `curve(curve, options)` / `curve_d(curve, dash, options)` sample a cubic control polygon
(`Curve2D`, the 2D twin of `Curve3D`) into a strip, with `tolerance`, `transform.center/rotation/scale`
and `closed` the same way the 3D page uses them. The 2D Curve page mirrors the 3D one: a
construction band below the matrix draws every control point (pink anchors, amber handles) for the
seven reference curve shapes.
- Shapes: `rect`, `rect_r`, `circle`, `ellipse`, `arc`, `annulus`, `capsule`, `polygon`,
`triangle`, `rhombus`, `sector`, `segment`. Each is one instanced quad evaluated as a signed
distance field in the fragment stage, so nothing is triangulated on the CPU. An outline is a
canvas-pixel count by default; `strokeWidthMode: "world"` reads `strokeWidth` in `world2d` units
instead, so the outline thickens with the camera zoom exactly like a stroke's `widthMode: "world"`.
Every primitive follows the 3D naming: `<shape>` strokes
the outline, `<shape>_s` fills it and `<shape>_d` dashes the outline along its perimeter,
taking the same `[visible, gap, phase]` triple as the line layer. `arc` has no interior, so it
has no `_s` variant, and `Shape2DOptions` no longer carries `fill` — the method name decides.
Dashes are cut from the shape's perimeter parameter, a closed form for every primitive except
the ellipse (Simpson-integrated arc length), so they stay continuous across corners.
- The layer is an overlay: it draws after every 3D primitive and pins itself to the near plane
without writing depth.
- **Layering:** `zIndex` — an integer in `-8..8`, default `0` — is shared by the 2D primitives and
the text blocks, so the two are directly comparable. Segments are drawn in ascending key order, so
a higher key covers a lower one; equal keys keep the pre-`zIndex` order, 2D first, then text. It is
never depth: nothing in this layer writes the depth buffer, the key only orders draw calls. See
`docs/z-index.md`.
- `InfiniteGrid2D` renders the reference's 2D grid as a full-viewport shader quad: decimal LOD levels,
  screen-space line width and the same three-layer alpha de-duplication as the 3D grid. It reads
  `cellSize`, `lineWidthPixels`, `minPixelsBetweenCells`, the LOD range and both line colors from
  the gallery's grid panel, and draws as the 2D layer's background. The same `displayMode` and
  `dot*` options give it the endless dot lattice too, with the identical 4x ladder, screen radius
  and spacing fade as the 3D grid (see *Dot lattice* above).
- The 2D camera is independent of the 3D one (`mode: "3d" | "2d"` in the gallery config); the
`2d-*` pages fit their declared `view2d` extent, drag or hold WASD to pan, hold shift to sprint, and scroll to zoom. The gallery
classifies the 2D layer like the 3D scenes: `2d-index` is the API index, the twelve shape pages
(`2d-rect`, `2d-rounded-rect`, `2d-circle`, `2d-ellipse`, `2d-arc`, `2d-annulus`, `2d-capsule`,
`2d-polygon`, `2d-triangle`, `2d-rhombus`, `2d-sector`, `2d-segment`) each own one primitive, and
`2d-lines`, `2d-curves`, `2d-markers`, `2d-arrows`, `2d-spaces`, `2d-grid` cover the stroke API
families, `z-index` shows the `zIndex` layering key against shapes and text, and
`2d-world-space-width` puts the same width number in both units so scrolling proves which one
follows the zoom. Every matrix page's column
titles and sample labels are `world2d` text, so they pan
and zoom with the geometry they annotate.

## Text

`drawList.text(position, text, options)` draws one block per call. `text` is a string or a list
of spans, the equivalent of a text root entity plus its child span entities.

Three placement spaces share one pipeline and are selected per block:

| `space` | Position | Size |
| --- | --- | --- |
| `world-plane` (default) | world units, block on a fixed local XY plane | `fontSize × pixelSize` |
| `world-billboard` | world units, block rebuilt from the camera's axes | `fontSize × pixelSize` |
| `screen` | **top-left origin pixels** (`position.z` ignored) | `fontSize` pixels |

The `screen` space is in **target pixels** — the same units as the pass's viewport — because the
library has no DOM access and must not guess a display density. A caller on a HiDPI display owns the
conversion: the gallery authors its pages in CSS pixels and multiplies every screen-space command by
`devicePixelRatio` before handing the frame over (`gallery/screen-scale.ts`). A block placed at
`[24, 24]` with `fontSize: 18` in CSS pixels then draws at `[48, 48]` and 36 target pixels on a 2×
display, which is what keeps a label the same physical size on every screen.

`fontSize` is in **font pixels** and is the layout unit; `pixelSize` is world units per font pixel.
That pair is the reference `font_size` / `pixel_size`, and it lets a block keep a fixed world
size while its glyphs are rasterised at any resolution. Which resolution that is belongs to the glyph
source: one that can rasterise on demand is asked for the size the block covers on screen (see
[Raster size](#raster-size)), while one that declares `dynamicRaster: false` stays at
`fontSize × rasterScale`. Layout options follow the reference layout model: `justify`, `lineBreak`,
`bounds` (`TextBounds`, in font pixels), `anchor`, `lineHeight` and `letterSpacing`.

`rotation` turns a `world-plane` block away from the XY plane, with the reference `Label3D.rotation`
Euler order (Y, then X, then Z) in radians. `[-Math.PI / 2, 0, 0]` lays a block flat on the XZ plane
so it reads from above, which is what the reference example labels do; the two camera-relative
spaces ignore it. The basis travels in the instance world matrix, so the text pipeline stays inside
the device's vertex attribute budget.

`lineHeight` is the absolute pixel form when you pass one, and the default is a `1.2` multiple of the
font size otherwise — which means a line's box is that multiple of **the line's own
largest span**, so a line holding a bigger span is taller. `lineHeightScale` names that multiple
explicitly; the two are exclusive. Only `bounds.width` feeds layout:
`bounds.height` is not a layout input, so a block runs past it instead of being
truncated. `letterSpacing` lands after every character, the last one on a line included, because the
shaping pass adds it to each cluster's advance.

World text is depth-tested but never depth-written, so geometry in front of it
occludes it; `screen` text pins itself to the near plane and always wins.

### Font face

`weight` (1–1000, default `400`), `style` (`normal` or `italic`) and `width` (the nine
`font-stretch` keywords) select the face a block is rasterised in, mirroring bevy's `TextFont`.
They are block defaults, and a span overrides one axis of them at a time rather than replacing the
whole face. The glyph atlas keys on all three, so two weights of one character cannot share texels.

How much of that a browser can honour depends on the loaded face, and the limits are real:

| option | what Canvas2D does |
| --- | --- |
| `weight` | A weight the loaded family does not carry is **synthesised** in one step (the threshold sits between 500 and 600), so `700` and `900` then look identical and the advance never changes. A variable font's real `wght` axis is not reachable — Canvas2D has no `font-variation-settings` — but the browser **does** pick a face by the weight it was registered with, so registering the same family once per weight gives real weights. |
| `style` | `italic` is the only slant the font shorthand keeps; `oblique <angle>` reads back as plain `italic`, which is why bevy's `FontStyle::Oblique(a)` is not exposed. A face without an italic is slanted by the browser. |
| `width` | The keyword only reaches the font when the face has a `wdth` axis. The bundled static subset has none, so every stop draws at normal width there. A percentage is rejected by the shorthand, so only the nine named stops exist here. |

The bundled Fira Mono subset is a static Medium face, so out of the box `weight` only ever produces
one synthesised step. `loadFontFaces(family, faces)` is the way out: it registers each entry as a face
of `family` with its own `weight` descriptor, so `weight: 200` through `900` select genuinely different
faces. The gallery does exactly that for the `text-font-query` page, which draws with eight instances
of a variable font built by `bun scripts/build-font-faces.ts` (see
`gallery/assets/`). That is gallery-only payload: the library's own entry point does not
carry it.

A custom glyph source receives the resolved face — `{ family, weight, style, width }` — instead of a
family string, because those are the fields the atlas keys on. A source that holds one fixed face (a
prebaked page, one parsed font buffer) sets `faceKey` to the part it can honour, so a weight it cannot
rasterise does not multiply identical atlas entries.

### Outline

`outlineWidth` (in font pixels) rings every glyph in the block in `outlineColor`, which defaults to
the block's own colour. Font pixels rather than screen pixels keeps a ring proportional to the
glyphs: a block magnified by `pixelSize` carries its outline with it, and a `screen` block's ring is
in screen pixels, because nothing sits between those two units.

How the ring is built depends on the encoding. `sdf` and `msdf` put the true distance to the shape in
alpha — msdfgen's `mtsdf` layout — and the ring reads that, so it holds its width through a corner,
which is exactly where the RGB median disagrees with the true distance. `bitmap` has no distance to
read, so its ring is the furthest coverage eight directions report at the outline's radius: an
approximation, and one that samples outside the glyph, so a wide ring wants a wider page padding. A
width of `0` draws nothing and never reads alpha, which is what keeps a page baked before alpha
carried distances from flooding its quads.

An outline is the cheap way to keep a label readable over whatever it is drawn on — the alternative
is fighting the geometry behind it with `depthTest: false`.

### Glyph encoding

The atlas stores glyphs one of three ways. The encoding belongs to the **glyph source**, not to a
render option, so the atlas and the shader always agree:

| Encoding | Stored | Scaling | Cost |
| --- | --- | --- | --- |
| `bitmap` | tintable alpha mask (RGB 255, coverage in A) — the reference atlas layout | the shader interpolates coverage, so magnifying softens it | cheapest; one byte of signal |
| `sdf` | signed distance in red, true distance in alpha | the shader rebuilds the edge from the distance, so it stays sharp at any size | one CPU distance transform per glyph |
| `msdf` | per-edge signed distance in RGB, true distance in alpha | as `sdf`, but the median keeps the corners a single channel rounds off | three channels, and outlines rather than a mask |

`CanvasGlyphRasterizer` produces `bitmap` and `sdf` from Canvas2D coverage, running an exact
Euclidean distance transform and letting partially covered texels place the edge sub-texel. Two
sources produce `msdf`, and both ship:

- **On demand** — `OutlineGlyphRasterizer` parses the inlined TrueType with `opentype.js` and encodes
the first time each glyph appears. Any character the face covers, and any face at all, at the cost
of a runtime dependency and an encoder pass; `rasterScale` works here too, encoding at a multiple of
the layout size while the quad stays put.
- **Prebaked** — `BakedMsdfRasterizer` reads the page `bun scripts/bake-msdf-atlas.ts` produced: 586
glyphs at a 24 px raster in a 512² page, gzipped to 313 KiB and carried as raw texels (not a PNG, so
no image decoder has to run and the payload still loads under Node). No `opentype.js`, and no
encoding ever runs — but the character set is fixed and the payload ships whether or not it is used. Its
glyphs are also stuck at the 24 px they were baked at: the further a block sits from that size, the
softer the reconstruction, which is why the default source rasterises on demand at the size a block
actually covers (see [Raster size](#raster-size)).

### Raster size

A glyph is a bitmap, so it is only sharp when it is rasterised at the size it is drawn at. The
reference gets there by keying its atlas set by font size and rasterising every size at the physical
pixel size it will be shown at. That is affordable because its text sizes change rarely; a debug draw
block's size follows its camera, and a CJK block has thousands of candidate glyphs, so one atlas per
size is not something this library can spend.

The default source keeps the screen-facing half of that answer: glyphs are rasterised at **the size
the block covers on screen**, quantised onto a ladder of sizes (`text-raster.ts` — one step every
1.25×, 6 px to 256 px). A block asks for the smallest rung that covers it, so a glyph is never
magnified when it is decoded, at most oversampled by one step, which the mip chain then covers.
Because the **rung**, not the font size, is the atlas key, a block whose size changes every frame
rasterises each character about once per rung it passes rather than once per frame.

- A `screen` block's font pixels are canvas pixels, so it asks for exactly what it draws.
- A world block multiplies `pixelSize` by the projection scale at its position
  (`viewProjection[1][1] × viewportSize.y × 0.5 / clip.w`, the same estimate the width shaders use),
  so a label that grows as the camera approaches keeps its glyphs sharp instead of only being sharp at
  the one size its source was rasterised for.
- Coverage sampling puts the mip level on the floor: while the ladder oversamples by less than a step,
  blending level 0 against a half-resolution level is exactly what softens a stem that is already the
  right size. A block that really has shrunk into the chain still reads it.

A source's `rasterScale` becomes a lower bound rather than the whole story, and `dynamicRaster: false`
pins a source to that bound. The comparison scenes pin theirs, so one encoding still sits next to
another at a known raster size, and `text-reference.html` pins its `bitmap` source because it is
compared against the reference glyph by glyph.

The design, the reference correspondence it came from, and the measured sharpness numbers are in
[`docs/text-rasterization.md`](docs/text-rasterization.md).

### CJK

Chinese, Japanese and Korean text has no spaces to break at and thousands of distinct glyphs, which
are the two assumptions the word breaking and per-size rasters above make. What the layout does about
the first:

- **Breaks between characters.** Ideographs, kana, hangul and CJK punctuation become their own tokens,
  so `lineBreak: "word"` wraps between any two of them while latin text still wraps at spaces.
- **Kinsoku (禁则).** Punctuation that may not open a line is glued to the run before it, and opening
  brackets to the character after it — expressed as token gluing because the breaker only moves whole
  tokens.

Glyphs come from whatever face the family resolves to. The bundled subset has **no CJK coverage**, so
the canvas falls back to a system CJK face, which is the same arrangement the reference text stack
has with its system fallback; pass a `fontFamily` (bundled, or loaded into the document) to choose
one on purpose.
The side of the reference's raster handling that shows up here is [Raster size](#raster-size): each
ideograph is
rasterised at the rung it lands on, so a screenful of Chinese costs a few rungs' worth of glyphs
rather than one set per font size.

### Anti-aliasing

A glyph edge is a texture alpha ramp inside a quad, so the scene target's `msaa: 4` cannot help it —
it anti-aliases triangle edges, not texel contents. What is actually in play:

- **Rasterisation coverage.** Canvas2D anti-aliases every glyph it draws. That is the whole of the
`bitmap` path's AA, and the input `sdf` is derived from.
- **Distance reconstruction.** `sdf` and `msdf` rebuild the edge with an `fwidth`-scaled ramp, so the
transition stays one pixel wide however far the camera pushes the glyph. The scale is the *average*
of both axes' derivatives — the reference shader's `0.5 * dot(px_range / msdf_size, dest_size)` —
because each derivative already spans one screen pixel: summing them counts it twice, and a ramp
half a pixel wide drops the rim pixels a correct one leaves at partial coverage, which reads as a
thinner, toothed glyph. `docs/visual-comparison.md` records the comparison that pinned this down.
- **Error correction.** The median of the three channels only equals the distance to the *nearest*
edge where two of them saturate, so inside a stroke it lands on the middle distance and the rebuilt
edge drifts. `msdfFromOutline` therefore corrects each texel's median against the exact shape
distance before packing, moving only the channel needed to keep that distance the middle value. At
24 px, measured against a super-sampled coverage reference: mean error 0.073 → 0.043, and edge-band
texels whose median is off by more than half a texel 71% → 0%. Equalising flagged texels to their own
median — the form msdfgen's error correction takes — was measured too and makes this encoder *worse*
(0.078), because its channels share the texel's own inside/outside sign instead of carrying
per-edge signed distances. `bun scripts/measure-msdf-error.ts` prints the numbers for the bundled
face; `tests/text-msdf.test.ts` locks the property against analytic square and circle distances.
- **Supersampling.** `rasterScale` rasterises glyphs at a multiple of their layout size while quads
stay put — the lever that matters for `bitmap` and for high-DPR displays.
- **Outline.** A ring is a second coverage ramp around the first, so it is only as smooth as what it
reads: the true distance for `sdf`/`msdf`, eight samples of the mask for `bitmap`. It is not part of
the edge reconstruction and does not change it.
- **Mip chain.** WebGPU has no `generateMipmap` and vgpu exposes none, so levels are filtered on the
CPU and uploaded level by level. `mipLevels` defaults to 4, taking a 512 px page down to 64 px;
deeper chains start bleeding through the 2 px packing padding. A coverage mask averages; a distance
field is resampled **through coverage** (`downsampleDistancePage`) instead, and the shader scales its
decode range by the level it sampled, because a level's value describes one texel of that level.
Those two have to agree — averaging distances and then decoding with a level-scaled range, or the
reverse, each measured an order of magnitude worse. `bun scripts/measure-glyph-accuracy.ts` measures
the result as total ink against the geometric coverage of the same glyphs: every source lands within
about 3% of it, where sampling a level with the level-0 range lost about a tenth.
- **Atlas pages and uploads.** Pages are layers of one 2D array texture, so a glyph that lands
outside the first page costs no extra draw call. The page count defaults to a fixed texel budget —
four 512 px pages' worth — so a 1024 px page set stays one page deep instead of quadrupling the
memory each glyph source holds. A page whose glyphs were all
requested in an earlier frame is blanked and repacked as a whole, and a page that mixes current and
stale glyphs hands the stale rectangles back one at a time, so a bounded atlas recycles instead of
failing. When every page is full and nothing on them can be recycled, the renderer drops that glyph
(`onFull: "skip"`, the default) and counts it in `GpuText3D.skippedGlyphs`, because a frame that is
quietly missing a character has to be tellable apart from one the font never had; a probe or a test
that would rather fail loudly asks for `onFull: "throw"`. Only the rectangles written since the last
upload reach the GPU — a new glyph costs a few hundred bytes rather than a whole page, and each mip
level is re-sent for the region that maps to it.

Two limits are worth knowing about before blaming the renderer for an ugly block:

- **Magnification.** A distance field is only as fine as the raster it was built at, so a block pushed
  far past the size its glyphs were rasterised at shows the texel grid they were reconstructed from.
  The default source follows the screen and re-rasterises when the block climbs a rung, which spends
  atlas area instead of sharpness. A source pinned to a fixed raster — `dynamicRaster: false`, which is
  what the comparison scenes and the prebaked page use — keeps its own knob instead: `rasterScale`
  rasterises at a multiple of the layout size while the quad stays put, and twice the scale costs four
  times the atlas area, so raise `atlasSize` with it. The prebaked MSDF source has the equivalent knob
  at bake time rather than at run time.
- **Depth.** Text is depth-tested, so anything that writes depth in front of it clips it. That
  includes the infinite grid: it is a full-screen translucent plane that writes depth, matching the
  reference's `depth_draw_always`, and when the camera looks along the ground its lines shatter
  every letter behind them. It is the reference behaviour and not a bug, but debug labels that must
  stay readable pass `depthTest: false`.

### Multiple sources

A `GpuDebugDraw3D` registers **named glyph sources**, and a block picks one through
`TextOptions.source`. Encoding and rasterisation scale belong to the source, so one frame can mix
quality levels — or put two of them side by side. The renderer may override a source's raster size per
block; `dynamicRaster: false` opts a source out of that, which is what the comparison scenes do (see
[Raster size](#raster-size)).

```ts
const renderer = new GpuDebugDraw3D(gpu, {
  text: {
    sources: {
      sharp: new CanvasGlyphRasterizer({ encoding: "sdf", rasterScale: 4 }),
      cheap: new CanvasGlyphRasterizer({ encoding: "bitmap" }),
      baked: new BakedMsdfRasterizer(),
    },
  },
});

drawList.text([0, 0, 0], "read me", { source: "sharp" });
drawList.text([0, -1, 0], "and me", { source: "cheap" });
```

Blocks that name nothing use the first source registered, and `defaultTextStyle` can set one for the
whole frame. Each source gets its own atlas and pipeline, and one is only built once something
actually names it, so registering sources you never draw costs nothing.

Seven scenes exercise text end to end, and none of them is a port — the reference addon has no text
API; the layout they run follows the reference layout model, and `docs/text-reference.md` records how
that was verified. The geometry examples also draw their own labels, because the reference scenes
own `Label3D` captions for every column and row; those go through the same pipeline, lying flat on
the ground with `rotation: [-Math.PI / 2, 0, 0]`. A `GpuDebugDraw3D` built without a `text` option
skips those blocks instead of failing, so geometry-only callers keep working.

`text-compare` is the parity matrix, in the shape of the line/circle examples: rows are glyph sources,
columns are font sizes, transposed relative to those because text grows sideways. The six
screen-space pages answer one question each, because a page that answers eight is comparable to
nothing:

| scene | the question it answers |
| --- | --- |
| `text-encodings` | the same text from four glyph sources, at two sizes, plus the outline pair |
| `text-scale` | the same text at six sizes, over three raster strategies at one size |
| `text-world-zoom` | four sources in world space, magnified with the camera — the only honest test of what a source does past its own raster |
| `text-layout` | wrapping, justification, bounds, line height, letter spacing and spans |
| `text-anchor` | the nine anchors against the marker they land on and their own bounds |
| `text-cjk` | CJK wrapping per character, kinsoku and mixed scripts |

Two conventions run through the screen-space pages: every page repeats one text per condition with the
condition labelled above it, and each ends with a 1 px rule, because judging whether an edge is clean
needs something of a known width next to it.

Every world-space row in the matrix floats above the grid plane. The grid writes depth, and a block
crossing `y = 0` would be clipped along its lines.

### Bundled font

The library inlines a **Fira Mono subset** (ASCII, Latin-1, Latin Extended-A, Greek, punctuation,
arrows, math and geometric symbols — 591 glyphs, 19 KB WOFF2 plus a 43 KB TrueType of the same
subset, SIL OFL 1.1). It is embedded the way the reference embeds its default font with
`include_bytes!`, so
nothing is fetched at runtime. WOFF2 feeds `FontFace` for the Canvas2D path; the TrueType is there
because `opentype.js` cannot decompress WOFF2. The subset has **no CJK coverage**: CJK labels fall back to a system face, and a `fontFamily` bundled
here or loaded into the document picks one on purpose. See [CJK](#cjk).

`?scene=<id>` opens any scene directly, including every text page (`text-compare`, `text-encodings`,
`text-scale`, `text-world-zoom`, `text-layout`, `text-anchor`, `text-cjk`). `?text=<name>` narrows the
gallery to a single glyph source (`auto`, `bitmap`, `bitmap4x`, `sdf`, `sdf4x`, `msdf`, `msdf2x`,
`baked`).

## Capabilities

- Points (screen/world size), lines (screen/world width, dash, normal), triangles.
- 2D layer (`frame.d2`): `world2d` and `screen` spaces, strokes with dashes and joints, and
  twelve SDF shape primitives with fill or pixel-width outlines, drawn as a depth-free overlay.
- `InfiniteGrid2D`: the addon's full-viewport 2D grid (decimal LOD, screen-space width, debug
  palette), driven by the same grid panel as the 3D one.
- Text blocks: three placement spaces, wrapping (latin words and CJK characters), justification, span
  styling, per-block anchor, line height, letter spacing and a per-block outline, drawn from an inlined
  Fira Mono subset that falls back to the system for scripts it does not cover. The atlas can hold
  `bitmap`, `sdf` or `msdf` glyphs (see [Text](#text)), rasterised at the size each block covers on
  screen, with supersampling and a mip chain.
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
- `InfiniteGrid3D` shader-driven ground grid ported from the reference grid addon
  (decimal LOD layers, screen-space width, edge/grazing/center/far fades).
- Orbit/pan/zoom camera controls in the gallery, tuned to the reference
  `entities/free_camera.gd` and layered on a velocity model (`gallery/demo-camera.ts`): a drag is
  an angular velocity (0.25°/px) or a linear velocity (`distance`/FOV in perspective,
  `orthographicHeight` in orthographic), a wheel notch is a scalar velocity in log₂ space
  (1.08× per notch), and a released drag keeps its velocity and glides — the exact integral of
  an exponentially decaying velocity (halflife 0.14 s), capped at 60°, half a screen of pan and
  0.75 doublings of zoom. Releasing more than 90 ms after the last sample is treated as a stop.
  The right button drops into a pointer-locked free-fly camera instead (WASD to move, Q/E for
  up/down, shift to sprint at 3×), while the middle button pans and the left button orbits.
- Example switching frames the selected scene (`frameBounds`): the orbit pivot moves to the
  scene's bounding-box centre and the distance/height fit its projected corners, so rotating
  turns around the geometry instead of the origin. `?camera=reference` disables that framing so
  the reference pose stays put for comparisons.

See `docs/reference-parity.md` for the scene-by-scene parity status and the
known approximations, `docs/visual-comparison.md` for the reference-vs-vgpu
screenshot comparisons and measured alignment, and `docs/text-reference.md` for the run-time
comparison of text layout against the reference.

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

`gallery/demo-config.ts` contains independently validated camera/view configuration
and injected storage helpers. Gallery controls support grid, opacity, animation,
width multiplier, projection, background, camera preset and reset; camera
interaction is persisted. The sidebar groups them into three collapsible
sections — display, Geometry 3D and Infinite Grid — and remembers which ones are
open next to the config. The infinite-grid section follows `displayMode`: `grid` shows only the
line fields and `dots` only the lattice fields, while `cellSize` and the 3D plane
size/edge/grazing/center fades stay visible in every mode because they gate both layers.
The display group (background, projection, animation,
grid visibility, grid opacity) is stored per example: switching examples restores
what that scene was set up with, and a scene that hides the grid opens with the
toggle off. Line width, joints and the infinite grid options stay shared. The camera preset offers three poses of the same gallery
distance, FOV and clipping, so switching is purely a change of angle: the gallery's own
orbit, a 45° oblique view (off the +X/+Z diagonal, so nothing sits edge-on) and a 45° front
view (square on to the origin from the +Z axis, so the X/Y plane reads straight off the
screen). `?camera=` also takes the
reference scene pose (`examples/*.tscn` `FreeCamera`, `/?scene=line&camera=reference`),
which stays URL-only because it exists for paired captures. Screenshot mode uses a
deterministic preset without localStorage: `/?compare=1&scene=circle`. Orthographic zoom
changes the orthographic extent.

The gallery UI is built with **Base UI + shadcn (base-lyra preset) + Tailwind v4**
in `gallery/components/`, and the imperative WebGPU side lives in `gallery/demo-engine.ts`.
React only renders chrome; the render loop, camera, and persistence stay outside
React and are read through `useSyncExternalStore`
(`gallery/demo-hooks.ts`). `gallery/demo.tsx` mounts the shell, `gallery/index.css` holds the base-lyra
theme tokens, and `gallery/demo.css` keeps the three-column layout, compare mode
and code highlighting.

Runtime comparison viewers (see `docs/visual-comparison.md` and `docs/text-reference.md`):
`http://127.0.0.1:5174/artifacts/{visual-baseline,text-reference}/index.html`. The whole
`artifacts/` tree is git-ignored — captures and comparison pages are regenerated locally, so run
the capture scripts before opening a page.

## Development

```bash
bun run typecheck
bun test
bun run build
bun run dev
```

`bun run build` emits the static gallery that `.github/workflows/deploy-pages.yml` publishes to
GitHub Pages (<https://jwu.github.io/vgpu-render/>) on every push to `main`. Only the production
build is re-based to `/vgpu-render/` — override it with `VGPU_BASE` if the site path changes — while
the dev server and the capture scripts below keep addressing the app from `/`.

`bun run dev` serves the gallery; open the printed URL in a WebGPU-capable browser. On Linux, Chrome
only creates a hardware WebGPU adapter when its Vulkan feature is on — without it
`navigator.gpu.requestAdapter()` returns `null`. Either set `chrome://flags/#enable-vulkan` to
Enabled, or start the browser with `--enable-features=Vulkan`.

Visual baselines:

```bash
# Reference capture (independent copy, real Vulkan). The engine binary and the script live in a
# local `/tmp/vgpu-parity-*` checkout; see `docs/visual-comparison.md` for the exact invocation.

# vgpu capture over CDP (needs a GPU display + dev server)
# CHROME_PATH selects the browser binary (default: first known install path, then PATH).
# VGPU_OZONE_PLATFORM pins the display server, e.g. `x11`; unset lets Chrome choose.
bun scripts/capture-vgpu.ts circle line
```

Both sides write into `artifacts/`, which is entirely git-ignored: captures are recaptured locally
on demand and never committed. The reference capture is machine-specific (engine 4.7.2 / Vulkan /
RTX 4070 SUPER, see the capture conditions in `docs/visual-comparison.md`), so check that table
before recapturing it elsewhere.
