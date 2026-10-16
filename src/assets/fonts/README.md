# Bundled font

The text renderer ships three artefacts derived from the same Fira Mono subset. All of them are
inlined the way bevy inlines its own font with `include_bytes!`, so nothing is fetched at runtime.

| Artefact | Consumer | Produced by |
| --- | --- | --- |
| `fira-mono-medium-subset.woff2` | `FontFace`, which Canvas2D rasterises for the `bitmap` and `sdf` encodings | `fontTools.subset` |
| `fira-mono-medium-subset.ttf` | `opentype.js`, which reads outlines for the on-demand `msdf` encoding | `fontTools.subset` |
| `src/assets/fira-mono-msdf-atlas.ts` | `BakedMsdfRasterizer`, the prebaked `msdf` encoding | `bun scripts/bake-msdf-atlas.ts` |

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
`scripts/bake-msdf-atlas.ts`: a 24 px raster in a 512² page is 335 KiB gzipped and fits all 586
ink-bearing glyphs; raising the raster costs payload roughly quadratically and eventually needs a
1024² page.
