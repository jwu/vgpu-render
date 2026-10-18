import { describe, expect, test } from "vitest";
import { LABELS_2D } from "../examples/shared/2d-labels.js";
import { buildScene2D } from "../examples/2d-runtime.js";
import { FrameDrawList } from "../src/frame-draw-list.js";
import { buildScene } from "../examples/runtime.js";
import { SCENE_EXAMPLES } from "../examples/registry.js";

const twoDimensional = SCENE_EXAMPLES.filter((example) => example.family === "2d");
const matrixPages = Object.keys(LABELS_2D);

const textOf = (drawList: FrameDrawList): readonly string[] =>
  drawList.commands().flatMap((command) =>
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
      const drawList = new FrameDrawList();
      buildScene(example.id, drawList, 0.5);
      const commands = drawList.commands();
      expect(commands.length, `${example.id} produced no commands`).toBeGreaterThan(0);
      for (const command of commands) {
        expect(["line2d", "joint2d", "point2d", "shape2d", "text"]).toContain(command.kind);
      }
      // Highlights are screen-space headings; matrix pages add world-space column and row labels.
      for (const command of commands) {
        if (command.kind === "text") expect(["screen", "world-plane"]).toContain(command.space);
      }
      expect(textOf(drawList).length, `${example.id} has no heading`).toBeGreaterThan(0);
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

      const drawList = new FrameDrawList();
      buildScene2D(id, drawList, 0);
      const drawn = textOf(drawList);
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
      const drawList = new FrameDrawList();
      buildScene2D(id, drawList, 0);
      const halfWidth = example.view2d!.width / 2;
      const halfHeight = example.view2d!.height / 2;
      for (const command of drawList.commands()) {
        if (command.kind !== "text" || command.space !== "world-plane") continue;
        expect(Math.abs(command.position[0]), `${id} label off the fitted width`).toBeLessThan(halfWidth);
        expect(Math.abs(command.position[1]), `${id} label off the fitted height`).toBeLessThan(halfHeight);
      }
    }
  });

  test("matrix pages draw their primitive family", () => {
    for (const id of matrixPages) {
      const drawList = new FrameDrawList();
      buildScene2D(id, drawList, 0);
      const total = drawList.d2.lines.length + drawList.d2.points.length + drawList.d2.shapes.length;
      expect(total, `${id} drew no 2D primitives`).toBeGreaterThan(0);
    }
  });

  test("the shapes page covers every bevy primitive it claims", () => {
    const drawList = new FrameDrawList();
    buildScene("2d-shapes", drawList, 0);
    const kinds = new Set(drawList.d2.shapes.map((shape) => shape.shape));
    expect(kinds).toEqual(new Set([
      "circle", "sector", "segment", "ellipse", "annulus", "capsule",
      "rhombus", "rect", "polygon", "triangle",
    ]));
    // The two polyline primitives are strokes, not SDF shapes.
    expect(drawList.d2.lines.length).toBeGreaterThan(0);
  });

  test("the gizmos page uses strokes, joints, shapes and points", () => {
    const drawList = new FrameDrawList();
    buildScene("2d-gizmos", drawList, 0);
    const kinds = new Set(drawList.d2.shapes.map((shape) => shape.shape));
    expect(kinds.has("rect")).toBe(true);
    expect(kinds.has("rounded-rect")).toBe(true);
    expect(kinds.has("circle")).toBe(true);
    expect(kinds.has("ellipse")).toBe(true);
    expect(kinds.has("arc")).toBe(true);
    expect(kinds.has("triangle")).toBe(true);
    expect(drawList.d2.lines.length).toBeGreaterThan(0);
    expect(drawList.d2.joints.length).toBeGreaterThan(0);
    expect(drawList.d2.points.length).toBeGreaterThan(0);
  });

  test("2d-lines animates the dash phase", () => {
    const still = new FrameDrawList();
    buildScene2D("2d-lines", still, 0);
    const moving = new FrameDrawList();
    buildScene2D("2d-lines", moving, 0.5);
    const phases = (drawList: FrameDrawList): number[] =>
      drawList.d2.lines.flatMap((line) => (line.dash === undefined ? [] : [line.dash[2]]));
    expect(phases(still).length).toBeGreaterThan(0);
    expect(phases(moving)).not.toEqual(phases(still));
    expect(phases(moving)[0]).toBeCloseTo(15);
  });

  test("the spaces page draws both 2D spaces", () => {
    const drawList = new FrameDrawList();
    buildScene2D("2d-spaces", drawList, 0);
    expect(drawList.d2.lines.some((line) => line.space === "screen")).toBe(true);
    expect(drawList.d2.lines.some((line) => line.space === "world2d")).toBe(true);
    expect(drawList.d2.shapes.some((shape) => shape.space === "screen")).toBe(true);
  });

  test("leaves the 3D scenes alone", () => {
    const drawList = new FrameDrawList();
    expect(buildScene2D("circle", drawList, 0)).toBe(false);
    expect(drawList.commands()).toHaveLength(0);
    expect(buildScene2D("2d-shapes", drawList, 0)).toBe(true);
    expect(drawList.commands().length).toBeGreaterThan(0);
  });

  test("is deterministic apart from the animated arrow and curve", () => {
    const first = new FrameDrawList();
    buildScene("2d-shapes", first, 0);
    const second = new FrameDrawList();
    buildScene("2d-shapes", second, 3);
    expect(second.d2.shapes.length).toBe(first.d2.shapes.length);

    const animated = new FrameDrawList();
    buildScene("2d-gizmos", animated, 3);
    const still = new FrameDrawList();
    buildScene("2d-gizmos", still, 0);
    // The arrow head and the sine strip move, so the command count is the same but the
    // geometry is not.
    expect(animated.d2.lines.length).toBe(still.d2.lines.length);
    expect(animated.d2.shapes).not.toEqual(still.d2.shapes);
  });
});
