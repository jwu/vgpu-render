import { expect, test } from "vitest";
import { sampleCurve, type Curve3D } from "../src/curve.js";
import { gridLines } from "../src/geometry-generators.js";
import { FrameRecorder } from "../src/frame-recorder.js";

const curve: Curve3D = {
  points: [
    { position: [-0.55, 0, 0.2], out: [0.28, 0, -0.35] },
    { position: [0, 0, -0.2], in: [-0.28, 0, 0.35], out: [0.28, 0, -0.35] },
    { position: [0.55, 0, 0.2], in: [-0.28, 0, 0.35] },
  ],
};

test("sampleCurve subdivides cubic Bezier segments", () => {
  const coarse = sampleCurve(curve, 0.32);
  const fine = sampleCurve(curve, 0.02);
  expect(coarse[0]).toEqual([-0.55, 0, 0.2]);
  expect(coarse[coarse.length - 1]).toEqual([0.55, 0, 0.2]);
  expect(fine.length).toBeGreaterThan(coarse.length);
  expect(coarse.length).toBeGreaterThan(4);
});

test("sampleCurve closes loops through the first anchor", () => {
  const closed: Curve3D = {
    closed: true,
    points: [
      { position: [-0.45, 0, 0], in: [0, 0, 0.24], out: [0, 0, -0.24] },
      { position: [0, 0, -0.35], in: [-0.28, 0, 0], out: [0.28, 0, 0] },
      { position: [0.45, 0, 0], in: [0, 0, -0.24], out: [0, 0, 0.24] },
      { position: [0, 0, 0.35], in: [0.28, 0, 0], out: [-0.28, 0, 0] },
    ],
  };
  const points = sampleCurve(closed, 0.16);
  expect(points.length).toBeGreaterThan(12);
});

test("gridLines emits the reference line count per axis and honors skew", () => {
  // `outer = "xz"` is the full grid: cellCount + 1 lines along each axis.
  const full = gridLines([4, 3], [0.25, 0.3], [0, 0, 0], [0, 0, 0], [0, 0], "xz");
  expect(full.length).toBe(5 + 4);
  const skewed = gridLines([4, 3], [0.25, 0.3], [0, 0, 0], [0, 0, 0], [0.5, 0], "xz");
  expect(skewed[0]).not.toEqual(full[0]);
});

test("gridLines outer modes keep boundary lines instead of dropping them", () => {
  // Reference `_emit_grid_lines`: without a boundary bit the outermost line on that axis is
  // skipped (`start = 1`, `end = cellCount`), so "none" keeps interior lines only.
  const counts = (outer: "none" | "x" | "z" | "xz") =>
    gridLines([4, 3], [0.25, 0.3], [0, 0, 0], [0, 0, 0], [0, 0], outer).length;
  expect(counts("none")).toBe(2 + 3);
  expect(counts("x")).toBe(4 + 3);
  expect(counts("z")).toBe(2 + 5);
  expect(counts("xz")).toBe(4 + 5);
});

test("arrow head parameters change generated geometry", () => {
  const short = new FrameRecorder();
  short.arrow([0, 0, 0], [1, 0, 0], { headLength: 0.1, headAngle: Math.PI / 9 });
  const wide = new FrameRecorder();
  wide.arrow([0, 0, 0], [1, 0, 0], { headLength: 0.4, headAngle: Math.PI / 3 });
  expect(short.lines[1]!.end).not.toEqual(wide.lines[1]!.end);
});
test("recorder expands curve and grid into transient commands", () => {
  const recorder = new FrameRecorder();
  recorder.curve(curve, { color: [1, 1, 1, 1], width: 2, tolerance: 0.16 });
  recorder.grid([0, 0, 0], [2, 2], [0.5, 0.5], { color: [0, 1, 0, 1] });
  const commands = recorder.commands();
  const gridCount = 3 + 3;
  expect(commands.filter((command) => command.kind === "line").length).toBeGreaterThan(gridCount);
});

test("recorder emits solid triangles for mesh and triangle commands", () => {
  const recorder = new FrameRecorder();
  recorder.triangle([0, 0, 0], [1, 0, 0], [0, 1, 0], { color: [1, 0, 0, 1] });
  recorder.mesh({ triangles: [[[0, 0, 0], [1, 0, 0], [1, 1, 0]]], segments: [[[0, 0, 0], [1, 1, 0]]] }, { solid: true, color: [0, 0, 1, 1] });
  recorder.mesh({ triangles: [[[0, 0, 0], [1, 0, 0], [1, 1, 0]]], segments: [[[0, 0, 0], [1, 1, 0]]] }, { color: [0, 1, 0, 1] });
  const commands = recorder.commands();
  expect(commands.filter((command) => command.kind === "triangle").length).toBe(2);
  expect(commands.filter((command) => command.kind === "line").length).toBe(1);
});
