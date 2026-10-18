/**
 * Screen-space commands are authored in CSS pixels and rendered in target pixels.
 *
 * The library defines `space: "screen"` in target pixels; the gallery is what decides that its pages
 * mean CSS pixels, and `scaleScreenCommands` is the single multiplication between the two. These
 * tests pin which fields count as pixels — a position obviously does, a line height or a dash
 * pattern less obviously — and which ones must be left alone.
 */

import { describe, expect, test } from "vitest";
import { FrameDrawList } from "../src/frame-draw-list.js";
import { scaleScreenCommands } from "../gallery/screen-scale.js";

function screenFrame(): FrameDrawList {
  const frame = new FrameDrawList();
  frame.text([10, 20, 7], [{ text: "A" }, { text: "B", fontSize: 10 }], {
    space: "screen",
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 1,
    outlineWidth: 2,
    bounds: [200, 100],
  });
  frame.text([0, 0, 0], "world label");
  return frame;
}

describe("scaleScreenCommands", () => {
  test("returns the same array at ratio 1", () => {
    const commands = screenFrame().commands();
    expect(scaleScreenCommands(commands, 1)).toBe(commands);
  });

  test("scales a screen text block's pixels and leaves its z and scale factors alone", () => {
    const [command] = scaleScreenCommands(screenFrame().commands(), 2);
    if (command?.kind !== "text") throw new Error("expected a text command");
    expect(command.position).toEqual([20, 40, 7]);
    expect(command.fontSize).toBe(36);
    expect(command.spans.map((span) => span.fontSize)).toEqual([36, 20]);
    expect(command.lineHeight).toBe(48);
    expect(command.letterSpacing).toBe(2);
    expect(command.outlineWidth).toBe(4);
    expect(command.bounds).toEqual([400, 200]);
  });

  test("leaves world-space text untouched", () => {
    const [, command] = scaleScreenCommands(screenFrame().commands(), 2);
    if (command?.kind !== "text") throw new Error("expected a text command");
    expect(command.position).toEqual([0, 0, 0]);
    expect(command.fontSize).toBe(16);
  });

  test("scales 2D positions, pixel widths and dashes", () => {
    const frame = new FrameDrawList();
    frame.d2.point([5, 6], { space: "screen", size: 3, sizeMode: "screen" });
    frame.d2.point([5, 6], { space: "screen", size: 3, sizeMode: "world" });
    frame.d2.line([0, 0], [10, 20], { space: "screen", width: 2, widthMode: "screen", dash: [4, 2, 1] });
    frame.d2.line([0, 0], [10, 20], { space: "screen", width: 2, widthMode: "world", dash: [4, 2, 1] });
    frame.d2.line([0, 0], [10, 20], { space: "world2d", width: 2 });

    const commands = scaleScreenCommands(frame.commands(), 2);
    const points = commands.filter((command) => command.kind === "point2d");
    const lines = commands.filter((command) => command.kind === "line2d");

    expect(points[0]).toMatchObject({ position: [10, 12], size: 6 });
    expect(points[1]).toMatchObject({ position: [10, 12], size: 3 });
    expect(lines[0]).toMatchObject({ start: [0, 0], end: [20, 40], width: 4, dash: [8, 4, 2] });
    // A world-unit width is not a pixel count, so only the dash (which is) follows the ratio.
    expect(lines[1]).toMatchObject({ end: [20, 40], width: 2, dash: [8, 4, 2] });
    expect(lines[2]).toMatchObject({ start: [0, 0], end: [10, 20], width: 2 });
  });

  test("scales every pixel length a 2D screen shape carries", () => {
    const frame = new FrameDrawList();
    frame.d2.rect([1, 2], [4, 6], { space: "screen", fill: false, strokeWidth: 3 });
    const [command] = scaleScreenCommands(frame.commands(), 2);
    if (command?.kind !== "shape2d") throw new Error("expected a shape2d command");
    expect(command.center).toEqual([2, 4]);
    // `rect` stores half extents, so the recorded 4×6 rect is [2, 3] and doubles with the ratio.
    expect(command.size).toEqual([4, 6]);
    expect(command.vertexB).toEqual([0, 0]);
    expect(command.vertexC).toEqual([0, 0]);
    expect(command.thickness).toBe(6);
  });

  test("rejects a ratio that is not a positive finite number", () => {
    const commands = screenFrame().commands();
    expect(() => scaleScreenCommands(commands, 0)).toThrow("greater than zero");
    expect(() => scaleScreenCommands(commands, Number.NaN)).toThrow("greater than zero");
  });
});
