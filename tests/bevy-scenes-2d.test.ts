import { describe, expect, test } from "vitest";
import { buildScene2D } from "../src/bevy-scenes-2d.js";
import { FrameRecorder } from "../src/frame-recorder.js";
import { buildScene } from "../src/godot-scenes.js";
import { GODOT_EXAMPLES } from "../src/godot-examples.js";

const twoDimensional = GODOT_EXAMPLES.filter((example) => example.family === "2d");

describe("2D pages", () => {
  test("declare the 2D family and a view extent", () => {
    expect(twoDimensional.map((example) => example.id)).toEqual(["2d-gizmos", "2d-shapes"]);
    for (const example of twoDimensional) {
      expect(example.view2d, `${example.id} needs a view2d extent`).toBeDefined();
      expect(example.view2d!.width).toBeGreaterThan(0);
      expect(example.view2d!.height).toBeGreaterThan(0);
      // Every 2D page asks for the infinite grid: it is part of what the page shows.
      expect(example.hideGrid).toBe(false);
    }
  });

  test("build only 2D commands plus their screen-space headings", () => {
    for (const example of twoDimensional) {
      const recorder = new FrameRecorder();
      buildScene(example.id, recorder, 0.5);
      const commands = recorder.commands();
      expect(commands.length, `${example.id} produced no commands`).toBeGreaterThan(0);
      for (const command of commands) {
        expect(["line2d", "joint2d", "point2d", "shape2d", "text"]).toContain(command.kind);
      }
      // The heading is the only 3D-layer command on these pages, and it is screen space.
      for (const command of commands) {
        if (command.kind === "text") expect(command.space).toBe("screen");
      }
    }
  });

  test("the shapes page covers every bevy primitive it claims", () => {
    const recorder = new FrameRecorder();
    buildScene("2d-shapes", recorder, 0);
    const kinds = new Set(recorder.d2.shapes.map((shape) => shape.shape));
    expect(kinds).toEqual(new Set([
      "circle", "sector", "segment", "ellipse", "annulus", "capsule",
      "rhombus", "rect", "polygon", "triangle",
    ]));
    // The two polyline primitives are strokes, not SDF shapes.
    expect(recorder.d2.lines.length).toBeGreaterThan(0);
  });

  test("the gizmos page uses strokes, joints, shapes and points", () => {
    const recorder = new FrameRecorder();
    buildScene("2d-gizmos", recorder, 0);
    const kinds = new Set(recorder.d2.shapes.map((shape) => shape.shape));
    expect(kinds.has("rect")).toBe(true);
    expect(kinds.has("rounded-rect")).toBe(true);
    expect(kinds.has("circle")).toBe(true);
    expect(kinds.has("ellipse")).toBe(true);
    expect(kinds.has("arc")).toBe(true);
    expect(kinds.has("triangle")).toBe(true);
    expect(recorder.d2.lines.length).toBeGreaterThan(0);
    expect(recorder.d2.joints.length).toBeGreaterThan(0);
    expect(recorder.d2.points.length).toBeGreaterThan(0);
  });

  test("leaves the 3D scenes alone", () => {
    const recorder = new FrameRecorder();
    expect(buildScene2D("circle", recorder, 0)).toBe(false);
    expect(recorder.commands()).toHaveLength(0);
    expect(buildScene2D("2d-shapes", recorder, 0)).toBe(true);
    expect(recorder.commands().length).toBeGreaterThan(0);
  });

  test("is deterministic apart from the animated arrow and curve", () => {
    const first = new FrameRecorder();
    buildScene("2d-shapes", first, 0);
    const second = new FrameRecorder();
    buildScene("2d-shapes", second, 3);
    expect(second.d2.shapes.length).toBe(first.d2.shapes.length);

    const animated = new FrameRecorder();
    buildScene("2d-gizmos", animated, 3);
    const still = new FrameRecorder();
    buildScene("2d-gizmos", still, 0);
    // The arrow head and the sine strip move, so the command count is the same but the
    // geometry is not.
    expect(animated.d2.lines.length).toBe(still.d2.lines.length);
    expect(animated.d2.shapes).not.toEqual(still.d2.shapes);
  });
});
