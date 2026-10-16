/**
 * Outline-backed glyph source, using `opentype.js` to read the bundled TrueType face.
 *
 * Canvas2D can only hand back a coverage mask, and a mask has lost the edges that a multi-channel
 * distance field is built from. Outlines are where those edges still exist, so this source parses
 * the inlined subset and encodes each glyph with `msdfFromOutline`.
 *
 * It is the on-demand counterpart to a prebaked atlas: it works for any character the face covers
 * and any face at all, at the cost of running the encoder on the first frame each glyph appears.
 * Coordinates follow the Canvas2D convention the rest of the text stack uses — x to the right, y
 * down, the pen at (0, 0) and the baseline at y = 0 — which is also what `glyph.getPath` produces.
 */

import { parse, type Font } from "opentype.js";
import { decodeEmbeddedTrueTypeFont, type GlyphRasterizer, type RasterizedGlyph } from "./text-font.js";
import { msdfFromOutline, type OutlineSegment, type Point } from "./text-msdf.js";
import { DEFAULT_SDF_RANGE } from "./text-sdf.js";
import type { GlyphMetrics, TextMeasurer, VerticalMetrics } from "./text-layout.js";

/** The subset of `opentype.js`'s path commands this source understands. */
type OutlineCommand =
  | { readonly type: "M"; readonly x: number; readonly y: number }
  | { readonly type: "L"; readonly x: number; readonly y: number }
  | { readonly type: "Q"; readonly x1: number; readonly y1: number; readonly x: number; readonly y: number }
  | { readonly type: "C"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly x: number; readonly y: number }
  | { readonly type: "Z" };

export type OutlineGlyphRasterizerOptions = {
  /** TrueType bytes to read. Defaults to the inlined subset. */
  readonly font?: ArrayBuffer;
  /** Distance in texels either side of the edge that the encoded field covers. */
  readonly distanceRange?: number;
  /**
   * Default rasterisation scale: a request that names no scale of its own is encoded at
   * `fontSize * rasterScale` texels while layout and quads stay in font pixels, exactly as the
   * Canvas2D sources do it. The renderer overrides it per block with the size the block covers on
   * screen (see `text-raster`), so the atlas asks for the finer size and the same outline is encoded
   * at a raster that matches it.
   */
  readonly rasterScale?: number;
  /**
   * Whether the renderer drives this source's raster size from the size a block covers on screen.
   * Outlines encode at any size, so it defaults to `true`; a fixed raster is only for a comparison
   * that has to stay at one raster size on purpose.
   */
  readonly dynamicRaster?: boolean;
};

/** Turns a path's command list into outline segments, offset so the ink box starts at the origin. */
export function commandsToSegments(commands: readonly OutlineCommand[], offsetX: number, offsetY: number): readonly OutlineSegment[] {
  const segments: OutlineSegment[] = [];
  let current: Point | undefined;
  let subpathStart: Point | undefined;

  for (const command of commands) {
    const to: Point | undefined = command.type === "Z" ? undefined : [command.x - offsetX, command.y - offsetY];
    switch (command.type) {
      case "M":
        current = to;
        subpathStart = to;
        break;
      case "L":
        if (current !== undefined && to !== undefined) segments.push({ from: current, to });
        current = to;
        break;
      case "Q":
        if (current !== undefined && to !== undefined) {
          segments.push({ from: current, control1: [command.x1 - offsetX, command.y1 - offsetY], to });
        }
        current = to;
        break;
      case "C":
        if (current !== undefined && to !== undefined) {
          segments.push({
            from: current,
            control1: [command.x1 - offsetX, command.y1 - offsetY],
            control2: [command.x2 - offsetX, command.y2 - offsetY],
            to,
          });
        }
        current = to;
        break;
      case "Z":
        // An explicit closing edge only if the contour did not already return to its start.
        if (current !== undefined && subpathStart !== undefined) {
          const [cx, cy] = current;
          const [sx, sy] = subpathStart;
          if (cx !== sx || cy !== sy) segments.push({ from: current, to: subpathStart });
          current = subpathStart;
        }
        break;
    }
  }
  return segments;
}

export class OutlineGlyphRasterizer implements GlyphRasterizer, TextMeasurer {
  readonly encoding = "msdf" as const;
  readonly distanceRange: number;
  readonly rasterScale: number;
  /** Whether the renderer drives this source's raster per block. See `dynamicRaster` in the options. */
  readonly dynamicRaster: boolean;
  readonly #font: Font;
  readonly #metrics = new Map<string, GlyphMetrics>();
  readonly #vertical = new Map<string, VerticalMetrics>();

  constructor(options: OutlineGlyphRasterizerOptions = {}) {
    this.#font = parse(options.font ?? decodeEmbeddedTrueTypeFont().buffer);
    this.distanceRange = options.distanceRange ?? DEFAULT_SDF_RANGE;
    this.rasterScale = options.rasterScale ?? 1;
    this.dynamicRaster = options.dynamicRaster ?? true;
  }

  /** The face this source reads, for callers that want to name it. */
  get font(): Font {
    return this.#font;
  }

  #scale(fontSize: number): number {
    return fontSize / this.#font.unitsPerEm;
  }

  /** Ink box of one character at `fontSize`, in the pen's own coordinates. */
  #inkBox(character: string, fontSize: number): { readonly left: number; readonly top: number; readonly width: number; readonly height: number } {
    const path = this.#font.charToGlyph(character).getPath(0, 0, fontSize);
    if (path.commands.length === 0) return { left: 0, top: 0, width: 0, height: 0 };
    const box = path.getBoundingBox();
    const left = Number.isFinite(box.x1) ? box.x1 : 0;
    const top = Number.isFinite(box.y1) ? box.y1 : 0;
    const right = Number.isFinite(box.x2) ? box.x2 : left;
    const bottom = Number.isFinite(box.y2) ? box.y2 : top;
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  verticalMetrics(_fontFamily: string, fontSize: number): VerticalMetrics {
    const cached = this.#vertical.get(String(fontSize));
    if (cached !== undefined) return cached;
    const scale = this.#scale(fontSize);
    const value = { ascent: this.#font.ascender * scale, descent: -this.#font.descender * scale };
    this.#vertical.set(String(fontSize), value);
    return value;
  }

  glyphMetrics(character: string, _fontFamily: string, fontSize: number): GlyphMetrics {
    const key = `${fontSize}|${character}`;
    const cached = this.#metrics.get(key);
    if (cached !== undefined) return cached;
    const ink = this.#inkBox(character, fontSize);
    const advance = (this.#font.charToGlyph(character).advanceWidth ?? 0) * this.#scale(fontSize);
    const value: GlyphMetrics = {
      advance,
      width: ink.width,
      height: ink.height,
      bearingLeft: ink.left,
      bearingTop: ink.top,
    };
    this.#metrics.set(key, value);
    return value;
  }

  rasterize(character: string, _fontFamily: string, rasterSize: number): RasterizedGlyph | undefined {
    const ink = this.#inkBox(character, rasterSize);
    if (!(ink.width > 0) || !(ink.height > 0)) return undefined;
    const width = Math.max(1, Math.ceil(ink.width));
    const height = Math.max(1, Math.ceil(ink.height));
    const path = this.#font.charToGlyph(character).getPath(0, 0, rasterSize);
    const segments = commandsToSegments(path.commands as readonly OutlineCommand[], ink.left, ink.top);
    return {
      width,
      height,
      texels: msdfFromOutline(segments, width, height, this.distanceRange),
      inkWidth: ink.width,
      inkHeight: ink.height,
      bearingLeft: ink.left,
      bearingTop: ink.top,
      advance: (this.#font.charToGlyph(character).advanceWidth ?? 0) * this.#scale(rasterSize),
    };
  }
}
