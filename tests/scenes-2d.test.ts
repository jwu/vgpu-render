import { describe, expect, test } from "vitest";
import { LABELS_2D } from "../examples/shared/2d-labels.js";
import { buildScene2D } from "../examples/2d-runtime.js";
import { FrameDrawList } from "../src/frame-draw-list.js";
import { buildScene } from "../examples/runtime.js";
import { SCENE_EXAMPLES } from "../examples/registry.js";

const twoDimensional = SCENE_EXAMPLES.filter((example) => example.family === "2d");
const matrixPages = Object.keys(LABELS_2D);

/** Each shape page owns one primitive; the page must not drift into a neighbour's shape. */
const SHAPE_PAGES = {
  "2d-rect": "rect",
  "2d-rounded-rect": "rounded-rect",
  "2d-circle": "circle",
  "2d-ellipse": "ellipse",
  "2d-arc": "arc",
  "2d-annulus": "annulus",
  "2d-capsule": "capsule",
  "2d-polygon": "polygon",
  "2d-triangle": "triangle",
  "2d-rhombus": "rhombus",
  "2d-sector": "sector",
  "2d-segment": "segment",
} as const;

const textOf = (drawList: FrameDrawList): readonly string[] =>
  drawList.commands().flatMap((command) =>
    command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : [],
  );

describe("2D pages", () => {
  test("declare the 2D family and a view extent", () => {
    expect(twoDimensional).toHaveLength(matrixPages.length + 1);
    expect(new Set(twoDimensional.map((example) => example.id))).toEqual(
      new Set(["2d-index", ...matrixPages]),
    );
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

  test("every shape page draws only its own primitive", () => {
    for (const [id, kind] of Object.entries(SHAPE_PAGES)) {
      const drawList = new FrameDrawList();
      buildScene(id, drawList, 0);
      const shapes = drawList.d2.shapes;
      expect(new Set(shapes.map((shape) => shape.shape)), `${id} draws a foreign shape`).toEqual(
        new Set([kind]),
      );
      // Each page pairs filled samples with stroked ones, so both branches of the SDF shader run.
      // An arc encloses no interior, so its page is strokes only.
      if (kind !== "arc") {
        expect(shapes.some((shape) => shape.filled), `${id} has no filled sample`).toBe(true);
      }
      expect(shapes.some((shape) => !shape.filled), `${id} has no stroked sample`).toBe(true);
    }
  });

  test("the index page covers every primitive family", () => {
    const drawList = new FrameDrawList();
    buildScene("2d-index", drawList, 0);
    const kinds = new Set(drawList.d2.shapes.map((shape) => shape.shape));
    const expected = ["rect", "rounded-rect", "circle", "ellipse", "arc", "annulus", "capsule", "polygon", "triangle", "rhombus", "sector", "segment"] as const;
    for (const kind of expected) {
      expect(kinds.has(kind), `index is missing ${kind}`).toBe(true);
    }
    expect(drawList.d2.lines.length).toBeGreaterThan(0);
    expect(drawList.d2.joints.length).toBeGreaterThan(0);
    expect(drawList.d2.points.length).toBeGreaterThan(0);
    // The index also names the dashed and solid trio forms.
    expect(drawList.d2.shapes.some((shape) => shape.dash !== undefined)).toBe(true);
    expect(drawList.d2.shapes.some((shape) => shape.filled)).toBe(true);
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

  test("2d-rect animates the dashed outlines", () => {
    const still = new FrameDrawList();
    buildScene2D("2d-rect", still, 0);
    const moving = new FrameDrawList();
    buildScene2D("2d-rect", moving, 0.5);
    const phases = (drawList: FrameDrawList): number[] =>
      drawList.d2.shapes.flatMap((shape) => (shape.dash === undefined ? [] : [shape.dash[2]]));
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
    expect(buildScene2D("2d-rect", drawList, 0)).toBe(true);
    expect(drawList.commands().length).toBeGreaterThan(0);
  });

  test("is deterministic apart from the animated dash phases", () => {
    const first = new FrameDrawList();
    buildScene("2d-rect", first, 0);
    const second = new FrameDrawList();
    buildScene("2d-rect", second, 3);
    expect(second.d2.shapes.length).toBe(first.d2.shapes.length);

    // The index page is a static catalogue: only the pages with a travelling dash phase move.
    const indexA = new FrameDrawList();
    buildScene("2d-index", indexA, 0);
    const indexB = new FrameDrawList();
    buildScene("2d-index", indexB, 3);
    expect(indexB.d2.shapes).toEqual(indexA.d2.shapes);
    expect(indexB.d2.lines).toEqual(indexA.d2.lines);
  });
});
