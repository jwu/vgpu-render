/**
 * Shared scaffolding for the screen-space text pages: palette, captions, the 1 px ruler
 * and the block helper that leaves the glyph source to the caller's default.
 */

import type { Color, FrameDrawList, TextOptions, TextSpanOptions } from "../../src/frame-draw-list.js";

export const LABEL: Color = [0.62, 0.68, 0.78, 1];
export const TITLE: Color = [0.92, 0.95, 1, 1];
export const INK: Color = [0.93, 0.95, 0.98, 1];
export const ACCENT: Color = [1, 0.85, 0.35, 1];
export const FRAME: Color = [0.52, 0.6, 0.72, 1];
export const HINT: Color = [0.55, 0.62, 0.72, 1];

/** The sentence every page repeats, chosen for its straights, round bowls and diagonal. */
export const SENTENCE = "Handgloves 0123";
/** The first word alone, for columns that cannot afford the whole sentence. */
export const WORD = "Handgloves";

export const MARGIN = 24;

/** A page heading plus its one-line explanation. */
export function heading(drawList: FrameDrawList, title: string, note: string): void {
  drawList.text([MARGIN, 16, 0], title, { fontSize: 17, space: "screen", anchor: "top-left", color: TITLE });
  drawList.text([MARGIN, 38, 0], note, { fontSize: 12, space: "screen", anchor: "top-left", color: HINT });
}

/** A column caption: what condition this column shows, with an optional second line. */
export function caption(drawList: FrameDrawList, x: number, y: number, text: string, color: Color = LABEL, size = 12): void {
  drawList.text([x, y, 0], text, { fontSize: size, space: "screen", anchor: "top-left", color });
}

/**
 * A 1 px ruler, drawn with screen-space points.
 *
 * `drawList.line` has no screen-space mode: a line is always a segment in the world, projected through
 * whatever camera is looking, so a "pixel" line drawn with it lands as an arbitrary diagonal. Until
 * there is a screen-space line, one-pixel points are the only primitive that lands on the pixel grid.
 */
export function pixelLine(drawList: FrameDrawList, from: readonly [number, number], to: readonly [number, number], color: Color): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    drawList.point([from[0] + dx * t, from[1] + dy * t, 0], { color, size: 1, sizeMode: "screen", round: false, layer: 0 });
  }
}

/** The 1 px rule that gives a page a width reference. */
export function pixelRule(drawList: FrameDrawList, x: number, y: number): void {
  caption(drawList, x, y - 15, "1 px");
  pixelLine(drawList, [x, y], [x + 48, y], [0.75, 0.8, 0.9, 1]);
}

/** A one-pixel rectangle outline, in the top-left pixel convention the layout speaks. */
export function boundsBox(drawList: FrameDrawList, x: number, y: number, width: number, height: number, color: Color = FRAME): void {
  const corners: readonly (readonly [number, number])[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  for (let index = 0; index < corners.length; index++) {
    pixelLine(drawList, corners[index]!, corners[(index + 1) % corners.length]!, color);
  }
}

/** Screen-space text that names no source, so it moves with the gallery's source selection. */
export function block(
  drawList: FrameDrawList,
  position: readonly [number, number],
  text: string | readonly TextSpanOptions[],
  options: TextOptions,
): void {
  drawList.text([position[0], position[1], 0], text, { space: "screen", anchor: "top-left", color: INK, ...options });
}
