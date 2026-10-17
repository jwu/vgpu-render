import { describe, expect, test } from "vitest";
import { LABELS_2D, buildScene2D } from "../src/scenes-2d.js";
import { FrameRecorder } from "../src/frame-recorder.js";
import { buildScene } from "../src/scenes-3d.js";
import { SCENE_EXAMPLES } from "../src/scene-examples.js";

const twoDimensional = SCENE_EXAMPLES.filter((example) => example.family === "2d");
const matrixPages = Object.keys(LABELS_2D);

const textOf = (recorder: FrameRecorder): readonly string[] =>
  recorder.commands().flatMap((command) =>
    command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : [],
  );

describe("2D pages", () => {
  test("declare the 2D family and a view extent", () => {
    expect(twoDimensional.map((example) => example.id)).toEqual([
      "2d-gizmos",
      "2d-shapes",
      ...matrixPages,
    ]);
    for (const example of twoDimensional) {
      expect(example.view2d, `${example.id} needs a view2d extent`).toBeDefined();
      expect(example.view2d!.width).toBeGreaterThan(0);
      expect(example.view2d!.height).toBeGreaterThan(0);
      // Every 2D page asks for the infinite grid: it is part of what the page shows.
      expect(example.hideGrid).toBe(false);
    }
  });

  test("build only 2D commands plus their labels", () => {
    for (const example of twoDimensional) {
      const recorder = new FrameRecorder();
      buildScene(example.id, recorder, 0.5);
      const commands = recorder.commands();
      expect(commands.length, `${example.id} produced no commands`).toBeGreaterThan(0);
      for (const command of commands) {
        expect(["line2d", "joint2d", "point2d", "shape2d", "text"]).toContain(command.kind);
      }
      // Highlights are screen-space headings; matrix pages add world-space column and row labels.
      for (const command of commands) {
        if (command.kind === "text") expect(["screen", "world-plane"]).toContain(command.space);
      }
      expect(textOf(recorder).length, `${example.id} has no heading`).toBeGreaterThan(0);
    }
  });

  test("matrix pages share their label table with the sidebar", () => {
    for (const id of matrixPages) {
      const labels = LABELS_2D[id]!;
      const example = SCENE_EXAMPLES.find((entry) => entry.id === id);
      expect(example, `${id} is missing from SCENE_EXAMPLES`).toBeDefined();
      expect(example!.title).toBe(labels.title);
      expect(example!.columns.map((column) => column.label)).toEqual(
        labels.columns.map((column) => column.title),
      );
      expect(example!.columns.map((column) => [...column.samples])).toEqual(
        labels.columns.map((column) => [...column.samples]),
      );

      const recorder = new FrameRecorder();
      buildScene2D(id, recorder, 0);
      const drawn = textOf(recorder);
      expect(drawn, `${id} dropped its heading`).toContain(labels.title);
      for (const column of labels.columns) {
        expect(drawn, `${id} dropped the column title "${column.title}"`).toContain(column.title);
        for (const sample of column.samples) {
          expect(drawn, `${id} dropped the sample label "${sample}"`).toContain(sample);
        }
      }
    }
  });

  test("matrix labels sit inside the extent the camera fits", () => {
    for (const id of matrixPages) {
      const example = SCENE_EXAMPLES.find((entry) => entry.id === id)!;
      const recorder = new FrameRecorder();
      buildScene2D(id, recorder, 0);
      const halfWidth = example.view2d!.width / 2;
      const halfHeight = example.view2d!.height / 2;
      for (const command of recorder.commands()) {
        if (command.kind !== "text" || command.space !== "world-plane") continue;
        expect(Math.abs(command.position[0]), `${id} label off the fitted width`).toBeLessThan(halfWidth);
        expect(Math.abs(command.position[1]), `${id} label off the fitted height`).toBeLessThan(halfHeight);
      }
    }
  });

  test("matrix pages draw their primitive family", () => {
    for (const id of matrixPages) {
      const recorder = new FrameRecorder();
      buildScene2D(id, recorder, 0);
      const total = recorder.d2.lines.length + recorder.d2.points.length + recorder.d2.shapes.length;
      expect(total, `${id} drew no 2D primitives`).toBeGreaterThan(0);
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

  test("the spaces page draws both 2D spaces", () => {
    const recorder = new FrameRecorder();
    buildScene2D("2d-spaces", recorder, 0);
    expect(recorder.d2.lines.some((line) => line.space === "screen")).toBe(true);
    expect(recorder.d2.lines.some((line) => line.space === "world2d")).toBe(true);
    expect(recorder.d2.shapes.some((shape) => shape.space === "screen")).toBe(true);
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
