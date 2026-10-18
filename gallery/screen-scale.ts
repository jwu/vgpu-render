/**
 * Maps `screen`-space commands from CSS pixels to target pixels.
 *
 * The library defines `space: "screen"` in **target pixels** — the same units as the pass's
 * `viewportSize` — because it has no access to the DOM and must not guess a display density. The
 * gallery authors its pages in CSS pixels instead, so that a 18 px label is 18 CSS px on every
 * display. `devicePixelRatio` is what bridges the two, and it has to be applied to every quantity a
 * screen command carries in pixels: a position, a font size, a stroke width, a dash pattern.
 *
 * Commands that do not live in `screen` space are returned untouched: `world-plane`,
 * `world-billboard` and `world2d` geometry is already resolved through a projection, and a stroke
 * that explicitly asks for `widthMode: "world"` is in world units whatever its position space is.
 */

import type { FrameCommand, TextCommand } from "../src/frame-draw-list.js";
import type { Joint2DCommand, Line2DCommand, Point2DCommand, Shape2DCommand } from "../src/frame-draw-list-2d.js";

/** Scales one dash triple, or leaves it out so `exactOptionalPropertyTypes` stays satisfied. */
function scaleDash(dash: readonly [number, number, number] | undefined, ratio: number): readonly [number, number, number] | undefined {
  return dash === undefined ? undefined : [dash[0] * ratio, dash[1] * ratio, dash[2] * ratio];
}

function scalePoint2D(command: Point2DCommand, ratio: number): Point2DCommand {
  if (command.space !== "screen") return command;
  return {
    ...command,
    position: [command.position[0] * ratio, command.position[1] * ratio],
    size: command.sizeMode === "screen" ? command.size * ratio : command.size,
  };
}

function scaleLine2D(command: Line2DCommand, ratio: number): Line2DCommand {
  if (command.space !== "screen") return command;
  const dash = scaleDash(command.dash, ratio);
  return {
    ...command,
    start: [command.start[0] * ratio, command.start[1] * ratio],
    end: [command.end[0] * ratio, command.end[1] * ratio],
    width: command.widthMode === "screen" ? command.width * ratio : command.width,
    ...(dash === undefined ? {} : { dash }),
  };
}

function scaleJoint2D(command: Joint2DCommand, ratio: number): Joint2DCommand {
  if (command.space !== "screen") return command;
  const dash = scaleDash(command.dash, ratio);
  return {
    ...command,
    previous: [command.previous[0] * ratio, command.previous[1] * ratio],
    center: [command.center[0] * ratio, command.center[1] * ratio],
    next: [command.next[0] * ratio, command.next[1] * ratio],
    width: command.widthMode === "screen" ? command.width * ratio : command.width,
    ...(dash === undefined ? {} : { dash }),
  };
}

function scaleShape2D(command: Shape2DCommand, ratio: number): Shape2DCommand {
  if (command.space !== "screen") return command;
  return {
    ...command,
    center: [command.center[0] * ratio, command.center[1] * ratio],
    size: [command.size[0] * ratio, command.size[1] * ratio],
    vertexB: [command.vertexB[0] * ratio, command.vertexB[1] * ratio],
    vertexC: [command.vertexC[0] * ratio, command.vertexC[1] * ratio],
    cornerRadius: command.cornerRadius * ratio,
    // A shape's outline is a stroke in screen pixels whatever space the shape sits in.
    thickness: command.thickness * ratio,
  };
}

/**
 * A screen-space text block. Its line height, letter spacing, outline and bounds are all font
 * pixels, so they follow the font size into target pixels; `lineHeightScale` stays as it is, being a
 * multiple rather than a length.
 */
function scaleText(command: TextCommand, ratio: number): TextCommand {
  if (command.space !== "screen") return command;
  return {
    ...command,
    position: [command.position[0] * ratio, command.position[1] * ratio, command.position[2]],
    spans: command.spans.map((span) => ({ ...span, fontSize: span.fontSize * ratio })),
    fontSize: command.fontSize * ratio,
    lineHeight: command.lineHeight * ratio,
    letterSpacing: command.letterSpacing * ratio,
    outlineWidth: command.outlineWidth * ratio,
    ...(command.bounds === undefined
      ? {}
      : { bounds: [command.bounds[0] * ratio, command.bounds[1] * ratio] as const }),
  };
}

function scaleScreenCommand(command: FrameCommand, ratio: number): FrameCommand {
  switch (command.kind) {
    case "text": return scaleText(command, ratio);
    case "point2d": return scalePoint2D(command, ratio);
    case "line2d": return scaleLine2D(command, ratio);
    case "joint2d": return scaleJoint2D(command, ratio);
    case "shape2d": return scaleShape2D(command, ratio);
    default: return command;
  }
}

/**
 * Converts every `screen`-space command from CSS pixels to target pixels. A ratio of `1` returns the
 * same array, which is what a 1x display and every test wants.
 */
export function scaleScreenCommands(commands: readonly FrameCommand[], ratio: number): readonly FrameCommand[] {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("ratio must be greater than zero");
  }
  if (ratio === 1) return commands;
  return commands.map((command) => scaleScreenCommand(command, ratio));
}
