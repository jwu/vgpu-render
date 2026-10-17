# vgpu-render

**[Examples gallery →](https://jwu.github.io/vgpu-render/)**

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

Text rendering (see [Text](#text)) is vgpu's own capability rather than a port: the reference addon
has no text API at all, and the labels in its examples are plain `Label3D` nodes.

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
recorder.text([0, 1, 0], "world label", { fontSize: 32, pixelSize: 0.01, color: [1, 0.8, 0.2, 1] });
recorder.text([24, 24, 0], "screen HUD", { space: "screen", anchor: "top-left", fontSize: 16 });
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
  text      -> per-glyph instanced quads sampling a generated glyph atlas
```

Points and lines are instanced; the CPU never expands a line into triangles. The
infinite grid is a single finite plane whose fragment shader derives minor/major
LOD grid lines.

## Text

`recorder.text(position, text, options)` draws one block per call. `text` is a string or a list
of spans, the equivalent of bevy's `Text2d` root plus its child `TextSpan`s.

Three placement spaces share one pipeline and are selected per block:

| `space` | Position | Size |
| --- | --- | --- |
| `world-plane` (default) | world units, block on a fixed local XY plane | `fontSize × pixelSize` |
| `world-billboard` | world units, block rebuilt from the camera's axes | `fontSize × pixelSize` |
| `screen` | **top-left origin pixels** (`position.z` ignored) | `fontSize` pixels |

`fontSize` is in **font pixels** and is the layout unit; `pixelSize` is world units per font pixel.
That pair is the reference `Label3D.font_size` / `pixel_size`, and it lets a block keep a fixed world
size while its glyphs are rasterised at any resolution. Which resolution that is belongs to the glyph
source: one that can rasterise on demand is asked for the size the block covers on screen (see
[Raster size](#raster-size)), while one that declares `dynamicRaster: false` stays at
`fontSize × rasterScale`. Layout options follow bevy: `justify`, `lineBreak`, `bounds`
(`TextBounds`, in font pixels), `anchor`, `lineHeight` and `letterSpacing`.

`lineHeight` is bevy's `LineHeight::Px` when you pass one, and bevy's default
`RelativeToFont(1.2)` otherwise — which means a line's box is that multiple of **the line's own
largest span**, so a line holding a bigger span is taller. `lineHeightScale` names that multiple
explicitly; the two are exclusive, like bevy's variants. Only `bounds.width` feeds layout:
`bounds.height` is not a layout input, matching bevy, so a block runs past it instead of being
truncated. `letterSpacing` lands after every character, the last one on a line included, because
parley adds it to each cluster's advance.

World text is depth-tested but never depth-written, so geometry in front of it
occludes it; `screen` text pins itself to the near plane and always wins.

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
| `bitmap` | tintable alpha mask (RGB 255, coverage in A) — bevy's `FontAtlas` layout | the shader interpolates coverage, so magnifying softens it | cheapest; one byte of signal |
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

A glyph is a bitmap, so it is only sharp when it is rasterised at the size it is drawn at. bevy gets
there by keying its `FontAtlasSet` by font size and rasterising every size at the physical pixel size
it will be shown at. That is affordable because bevy's text sizes change rarely; a debug draw block's
size follows its camera, and a CJK block has thousands of candidate glyphs, so one atlas per size is
not something this library can spend.

The default source keeps the screen-facing half of bevy's answer: glyphs are rasterised at **the size
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
compared against bevy glyph by glyph.

The design, the bevy correspondence it came from, and the measured sharpness numbers are in
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
the canvas falls back to a system CJK face, which is the same arrangement bevy has with fontique's
system fallback; pass a `fontFamily` (bundled, or loaded into the document) to choose one on purpose.
The side of bevy's raster handling that shows up here is [Raster size](#raster-size): each ideograph is
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

recorder.text([0, 0, 0], "read me", { source: "sharp" });
recorder.text([0, -1, 0], "and me", { source: "cheap" });
```

Blocks that name nothing use the first source registered, and `defaultTextStyle` can set one for the
whole frame. Each source gets its own atlas and pipeline, and one is only built once something
actually names it, so registering sources you never draw costs nothing.

Seven scenes exercise text end to end, and none of them is a port — the addon has no text API; the
layout they run follows bevy's, and `docs/text-reference.md` records how that was verified against
bevy itself.

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
subset, SIL OFL 1.1). It is embedded the way bevy embeds its default font with `include_bytes!`, so
nothing is fetched at runtime. WOFF2 feeds `FontFace` for the Canvas2D path; the TrueType is there
because `opentype.js` cannot decompress WOFF2. The subset has **no CJK coverage**: CJK labels fall back to a system face, and a `fontFamily` bundled
here or loaded into the document picks one on purpose. See [CJK](#cjk).

`?scene=<id>` opens any scene directly, including every text page (`text-compare`, `text-encodings`,
`text-scale`, `text-world-zoom`, `text-layout`, `text-anchor`, `text-cjk`). `?text=<name>` narrows the
gallery to a single glyph source (`auto`, `bitmap`, `bitmap4x`, `sdf`, `sdf4x`, `msdf`, `msdf2x`,
`baked`).

## Capabilities

- Points (screen/world size), lines (screen/world width, dash, normal), triangles.
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
- `InfiniteGrid3D` shader-driven ground grid ported from `godot-infinite-grid`
  (decimal LOD layers, screen-space width, edge/grazing/center/far fades).
- Orbit/pan/zoom camera controls in the gallery, tuned to the reference
  `entities/free_camera.gd` and layered on a velocity model (`src/demo-camera.ts`): a drag is
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

See `docs/godot-debug-draw-parity.md` for the scene-by-scene parity status and the
known approximations, `docs/visual-comparison.md` for the Godot-vs-vgpu
screenshot comparisons and measured alignment, and `docs/text-reference.md` for the run-time
comparison of text layout against bevy itself.

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
interaction is persisted. The sidebar groups them into three collapsible
sections — display, Geometry 3D and Infinite Grid — and remembers which ones are
open next to the config. The display group (background, projection, animation,
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
in `src/components/`, and the imperative WebGPU side lives in `src/demo-engine.ts`.
React only renders chrome; the render loop, camera, and persistence stay outside
React and are read through `useSyncExternalStore`
(`src/demo-hooks.ts`). `src/demo.tsx` mounts the shell, `src/index.css` holds the base-lyra
theme tokens, and `src/demo.css` keeps the three-column layout, compare mode
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
# Godot reference capture (independent copy, real Vulkan)
godot --path /tmp/vgpu-parity-godot --display-driver x11 --audio-driver Dummy \
  --resolution 1920x1080 --script /tmp/vgpu-parity-godot/capture.gd -- \
  circle "$PWD/artifacts/visual-baseline/godot-circle.png"

# vgpu capture over CDP (needs a GPU display + dev server)
# CHROME_PATH selects the browser binary (default: first known install path, then PATH).
# VGPU_OZONE_PLATFORM pins the display server, e.g. `x11`; unset lets Chrome choose.
bun scripts/capture-vgpu.ts circle line
```

Both sides write into `artifacts/`, which is entirely git-ignored: captures are recaptured locally
on demand and never committed. The Godot reference is machine-specific (Godot 4.7.2 / Vulkan /
RTX 4070 SUPER, see the capture conditions in `docs/visual-comparison.md`), so check that table
before recapturing it elsewhere.
