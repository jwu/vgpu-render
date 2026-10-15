import { expect, test } from "vitest";
import { FrameRecorder } from "../src/frame-recorder.js";

test("open strips join interior vertices only", () => {
  const frame = new FrameRecorder();
  frame.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]], { joint: "bevel" });
  expect(frame.lines).toHaveLength(3);
  expect(frame.joints).toHaveLength(2);
  expect(frame.joints.map((joint) => joint.center)).toEqual([[1, 0, 0], [1, 1, 0]]);
  expect(frame.joints.every((joint) => joint.joint === "bevel")).toBe(true);
  expect(frame.joints[0]!.previous).toEqual([0, 0, 0]);
  expect(frame.joints[0]!.next).toEqual([1, 1, 0]);
});

test("loops join every vertex including the seam", () => {
  const frame = new FrameRecorder();
  frame.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], { joint: "round" }, true);
  expect(frame.lines).toHaveLength(4);
  expect(frame.joints).toHaveLength(4);
  expect(frame.joints.map((joint) => joint.center)).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
  // The seam vertex joins the last and the first point, mirroring `_emit_line_loop`.
  expect(frame.joints[0]!.previous).toEqual([0, 1, 0]);
  expect(frame.joints[0]!.next).toEqual([1, 0, 0]);
  expect(frame.joints[3]!.previous).toEqual([1, 1, 0]);
  expect(frame.joints[3]!.next).toEqual([0, 0, 0]);
});

test("joint none and degenerate vertices emit no joint", () => {
  const none = new FrameRecorder();
  none.lineStrip([[0, 0, 0], [1, 0, 0], [2, 0, 0]], { joint: "none" });
  expect(none.joints).toHaveLength(0);

  // Both neighbouring vertices collapse onto the repeated point, so `emit_joint` skips them.
  const degenerate = new FrameRecorder();
  degenerate.lineStrip([[0, 0, 0], [1, 0, 0], [1, 0, 0], [2, 0, 0]], { joint: "round" });
  expect(degenerate.joints).toHaveLength(0);
});

test("dashed joints carry the accumulated path distance in the dash phase", () => {
  const frame = new FrameRecorder();
  frame.lineStrip([[0, 0, 0], [1, 0, 0], [1, 1, 0]], { joint: "miter", dash: [0.2, 0.3, 0.05] });
  // The joined vertex sits at arc length 1.0, which joins the dash offset already folded
  // into the commands of the segments that meet it.
  expect(frame.joints[0]!.dash).toEqual([0.2, 0.3, 1.05]);
  expect(frame.lines.map((line) => line.dash![2])).toEqual([0.05, 1.05]);
});

test("joints inherit the resolved line style and layer filtering", () => {
  const frame = new FrameRecorder({ line: { color: [0.1, 0.2, 0.3, 1], width: 6, widthMode: "world", layer: 4 } });
  frame.lineStrip([[0, 0, 0], [1, 0, 0], [2, 0, 0]], { joint: "round" });
  const joint = frame.joints[0]!;
  expect(joint.color).toEqual([0.1, 0.2, 0.3, 1]);
  expect(joint.width).toBe(6);
  expect(joint.widthMode).toBe("world");
  expect(joint.layer).toBe(4);

  const layered = new FrameRecorder();
  layered.lineStrip([[0, 0, 0], [1, 0, 0], [2, 0, 0]], { joint: "round", layer: 2 });
  expect(layered.commands(1).some((command) => command.kind === "joint")).toBe(false);
  expect(layered.commands(2).some((command) => command.kind === "joint")).toBe(true);
});
