# Bundled font

The text renderer ships three artefacts derived from the same Fira Mono subset, plus a gallery-only
sans family. All of them are inlined the way bevy inlines its own font with `include_bytes!`, so
nothing is fetched at runtime.

| Artefact | Consumer | Produced by |
| --- | --- | --- |
| `fira-mono-medium-subset.woff2` | `FontFace`, which Canvas2D rasterises for the `bitmap` and `sdf` encodings | `fontTools.subset` |
| `fira-mono-medium-subset.ttf` | `opentype.js`, which reads outlines for the on-demand `msdf` encoding | `fontTools.subset` |
| `src/assets/fira-mono-msdf-atlas.ts` | `BakedMsdfRasterizer`, the prebaked `msdf` encoding | `bun scripts/bake-msdf-atlas.ts` |

The gallery also ships a second family, used only by the `text-font-query` page:

| Artefact | Consumer | Produced by |
| --- | --- | --- |
| `src/assets/vgpu-sans-faces.ts` | `loadFontFaces`, which registers eight faces under `vgpu-render-sans` | `bun scripts/build-font-faces.ts` |

That one is **not** part of the library entry point — `demo-engine.ts` imports it, `tsconfig.build.json`
excludes it — because a multi-weight family costs ~350 KiB of base64 and only one gallery page needs it.

Two containers are needed because `opentype.js` reads glyph outlines and cannot decompress WOFF2.
The generated TypeScript modules are plain base64 arrays with no bundler-specific import, so tests
and any toolchain can read them.

## Provenance

| | |
| --- | --- |
| Original | `FiraMono-Medium.ttf` (Fira Mono 3.2, Medium weight) |
| Upstream copy used | `~/src/bevy@bevyengine/assets/fonts/FiraMono-Medium.ttf` |
| Licence | SIL Open Font License 1.1 — see `FiraMono-LICENSE.txt` |
| Copyright | Digitized data copyright (c) 2012-2015, The Mozilla Foundation and Telefonica S.A. |

Only the font data is redistributed here; the OFL permits this as long as the licence travels with
it, which `FiraMono-LICENSE.txt` does.

## Subset

Both containers carry the same 591 glyphs, generated with `fontTools.subset` keeping
`--no-hinting` (glyph rasterisation is scaled at draw time, matching `FontHinting::Disabled` on
bevy's `Text2d`) and `--no-glyph-names`. Retained blocks:

```
U+0020-007E  Basic Latin
U+00A0-00FF  Latin-1 Supplement
U+0100-017F  Latin Extended-A
U+0370-03FF  Greek and Coptic
U+2000-206F  General Punctuation
U+2070-209F  Superscripts and Subscripts
U+2100-214F  Letterlike Symbols
U+2190-21FF  Arrows
U+2200-22FF  Mathematical Operators
U+25A0-25FF  Geometric Shapes
U+2600-26FF  Miscellaneous Symbols
```

WOFF2 is 19 KB, TrueType 43 KB. **No CJK coverage**: the bundled font cannot render Chinese labels,
by design. Pass a different font to the text API if those are required — the Canvas2D encodings take
any family the document has loaded, and `OutlineGlyphRasterizer` accepts any TrueType buffer.

## Multi-weight sans family

Canvas2D cannot read a variable font's axes, but it does select a face by the `weight` descriptor it was
registered with. The `font-query` page therefore uses eight **static instances** of one variable font,
registered under one family. `scripts/build-font-faces.ts` produces them:

1. `fontTools.varLib.instancer` pins `wght` to 200/300/400/500/600/700/800/900.
2. The `name` table is rewritten to `vgpu-render Sans`: the source is OFL with the reserved name
   "Mona", which a modified copy may not keep.
3. `fontTools.subset` keeps `U+0020-007E,U+00B7,U+2013-2014,U+2026` with `--no-hinting
   --no-glyph-names`, and the WOFF2 is base64-inlined.

| | |
| --- | --- |
| Source | `MonaSans-VariableFont.ttf` (`wght` 200–900, `wdth` 75–125) |
| Upstream copy used | `~/src/bevy@bevyengine/assets/fonts/MonaSans-VariableFont.ttf` |
| Licence | SIL Open Font License 1.1 — see `vgpu-sans-OFL.txt` |
| Copyright | Copyright 2022 The Mona Sans Project Authors |

There is no 100 (Thin) instance: the source starts at 200, so the page's weight column starts there
too. The instances are static, so they carry no `wdth` axis — which is why the page's `width` column
repeats one width and says so.

```bash
bun scripts/build-font-faces.ts
```

Set `MONA_SANS_SOURCE` to point at another checkout of the variable font.

## Regenerating

```bash
# 1. Rebuild both subsets from the upstream font (needs fonttools, and brotli for woff2):
UNICODES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0370-03FF,U+2000-206F,U+2070-209F,U+2100-214F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+2600-26FF"
uv run --with fonttools --with brotli python -m fontTools.subset \
  ~/src/bevy@bevyengine/assets/fonts/FiraMono-Medium.ttf \
  --unicodes="$UNICODES" --no-hinting --no-glyph-names \
  --output-file=src/assets/fonts/fira-mono-medium-subset.woff2 --flavor=woff2
uv run --with fonttools python -m fontTools.subset \
  ~/src/bevy@bevyengine/assets/fonts/FiraMono-Medium.ttf \
  --unicodes="$UNICODES" --no-hinting --no-glyph-names \
  --output-file=src/assets/fonts/fira-mono-medium-subset.ttf

# 2. Re-embed the bytes into the generated TypeScript module:
bun scripts/embed-font.ts

# 3. Re-bake the MSDF atlas (reads the TrueType from step 1):
bun scripts/bake-msdf-atlas.ts
```

`tests/font-asset.test.ts` fails if the embedded constants and the font files drift apart, so always
run the embed step after changing a subset. The bake has its own knobs at the top of
`scripts/bake-msdf-atlas.ts`: a 24 px raster in a 512² page is 313 KiB gzipped and fits all 586
ink-bearing glyphs; raising the raster costs payload roughly quadratically and eventually needs a
1024² page.
