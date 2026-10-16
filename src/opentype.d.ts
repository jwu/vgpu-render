/**
 * Minimal declarations for `opentype.js`.
 *
 * The published package ships no types at 2.0, and `@types/opentype.js` describes the 1.x API, so
 * depending on it would type a shape that does not match the installed build. This declares exactly
 * the surface `OutlineGlyphRasterizer` reads and nothing else. It is a declaration file rather than
 * a module, so it patches the ambient module without an import.
 */
declare module "opentype.js" {
  export type PathCommand =
    | { readonly type: "M"; readonly x: number; readonly y: number }
    | { readonly type: "L"; readonly x: number; readonly y: number }
    | { readonly type: "Q"; readonly x1: number; readonly y1: number; readonly x: number; readonly y: number }
    | { readonly type: "C"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly x: number; readonly y: number }
    | { readonly type: "Z" };

  export type BoundingBox = {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };

  export type Path = {
    readonly commands: readonly PathCommand[];
    getBoundingBox(): BoundingBox;
  };

  export type Glyph = {
    readonly advanceWidth?: number;
    /** Outline scaled to `fontSize`, with the pen at the origin and y growing downwards. */
    getPath(x: number, y: number, fontSize: number): Path;
  };

  export type Font = {
    readonly unitsPerEm: number;
    readonly ascender: number;
    readonly descender: number;
    charToGlyph(character: string): Glyph;
  };

  export function parse(buffer: ArrayBuffer, options?: unknown): Font;
}
