/**
 * `index`: the DebugDraw3D API matrix, and the `apiMatrix` builder it shares with `world-space-width`.
 */

import { ARROW_BASE_HEAD_ANGLE, IDENTITY_BASIS, INDEX_BRIGHT_CYAN, INDEX_CURVE, INDEX_DASH_OFFSET, INDEX_DASH_SPACE, INDEX_DASH_WIDTH, INDEX_GOLD, INDEX_LAVENDER, INDEX_MAGENTA, INDEX_MINT, INDEX_UP, WHITE, arcPoints, capsuleWireNormals, circleSolidMesh, coneSolidMesh, coneWireNormals, cylinderSolidMesh, cylinderWireNormals, drawArcNormals, drawArrowHead, drawArrowLine, drawAxes, drawAxesN, drawBox, drawBoxNormals, drawCircleNormals, drawLineList, drawRectNormals, drawShapeWire, indexPath, rectLoop, rectMesh, rotateBasis, sphereSolidMesh, sphereWireNormals, transformMeshByBasis, type ApiMatrixConfig } from "../shared/draw-3d.js";
import type { FrameDrawList, LineOptions, Vec3 } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { box, capsuleWire, circlePoints, coneWire, cylinderWire, sphereWire, type ShapeWire } from "../../src/geometry-generators.js";
import { referenceOffset } from "../shared/layout-3d.js";

export function apiMatrix(drawList: FrameDrawList, config: ApiMatrixConfig): void {
  const { width: w, widthMode, solids } = config;
  const dash: readonly [number, number, number] = [INDEX_DASH_WIDTH, INDEX_DASH_SPACE, INDEX_DASH_OFFSET];

  drawAxes(drawList, referenceOffset([0, 0, 0]), IDENTITY_BASIS, 0.75, w(2), widthMode);

  // line
  drawList.line(indexPath(0, 0), indexPath(0, 0, 1, 0, 0.9), { color: WHITE, width: w(2), widthMode });
  drawList.line(indexPath(0, 1), indexPath(0, 1, 1, 0, 0.9), { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, normal: INDEX_UP });
  drawList.line(indexPath(0, 2), indexPath(0, 2, 1, 0, 0.9), { color: INDEX_GOLD, width: w(2), widthMode, dash });
  drawList.line(indexPath(0, 3), indexPath(0, 3, 1, 0, 0.9), { color: INDEX_MINT, width: w(2), widthMode, normal: INDEX_UP, dash });

  // ray
  const ray = (row: number, options: LineOptions): void => {
    const origin = indexPath(1, row);
    drawList.line(origin, [origin[0] + 1, origin[1] + 0.35, origin[2]], options);
  };
  ray(0, { color: WHITE, width: w(2), widthMode });
  ray(1, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, normal: INDEX_UP });
  ray(2, { color: INDEX_GOLD, width: w(2), widthMode, dash });
  ray(3, { color: INDEX_MINT, width: w(2), widthMode, normal: INDEX_UP, dash });

  // arrow
  drawArrowHead(drawList, indexPath(2, 0, 1, 0, 0.9), [0.55, 0.2, 0], { color: WHITE, width: w(2), widthMode, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "round" });
  drawArrowHead(drawList, indexPath(2, 1, 1, 0, 0.9), [0.55, 0.2, 0], { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "bevel", normal: INDEX_UP });
  drawArrowLine(drawList, indexPath(2, 2), indexPath(2, 2, 1, 0, 0.9), { color: INDEX_GOLD, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "round" });
  drawArrowLine(drawList, indexPath(2, 3), indexPath(2, 3, 1, 0, 0.9), { color: INDEX_MINT, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "bevel", normal: INDEX_UP });
  drawArrowLine(drawList, indexPath(2, 4), indexPath(2, 4, 1, 0, 0.9), { color: INDEX_MAGENTA, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "miter", dash });
  drawArrowLine(drawList, indexPath(2, 5), indexPath(2, 5, 1, 0, 0.9), { color: INDEX_LAVENDER, width: w(2), widthMode, headLength: 0.25, headAngle: ARROW_BASE_HEAD_ANGLE, joint: "round", normal: INDEX_UP, dash });

  // axes
  drawAxes(drawList, indexPath(3, 0, 0.5), IDENTITY_BASIS, 0.55, w(2), widthMode);
  drawAxesN(drawList, indexPath(3, 1, 0.5), rotateBasis(IDENTITY_BASIS, INDEX_UP, Math.PI * 0.25), 0.55, w(2), widthMode);

  // line_list: four independent point pairs — horizontal, vertical and two opposed diagonals —
  // instead of the reference's two. The pairs cross without joining, which is what makes the
  // "consecutive pairs, not a path" semantics visible; the reference's two short parallel pairs
  // read as one stroke at gallery distance. `_n` gives each pair its own normal so the back-face
  // fade shows up as a brightness difference.
  const listPoints = (column: number, row: number): Vec3[] => [
    indexPath(column, row, 0, 0, 0.55),
    indexPath(column, row, 0.7, 0, 0.55),
    indexPath(column, row, 0.35, 0, 0.55),
    indexPath(column, row, 0.35, 0, 0.95),
    indexPath(column, row, 0.05, 0.35, 0.55),
    indexPath(column, row, 0.75, 0.35, 0.85),
    indexPath(column, row, 0.75, 0.5, 0.85),
    indexPath(column, row, 0.05, 0.5, 0.55),
  ];
  const listNormals: readonly Vec3[] = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [0, 0, -1]];
  drawLineList(drawList, listPoints(4, 0), { color: WHITE, width: w(2), widthMode });
  drawLineList(drawList, listPoints(4, 1), { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode }, listNormals);

  // strip
  const stripPoints = (column: number, row: number): Vec3[] => [indexPath(column, row), indexPath(column, row, 0.45, 0.18, 0.95), indexPath(column, row, 1, 0, 0.7)];
  drawList.lineStrip(stripPoints(5, 0), { color: WHITE, width: w(4), widthMode, joint: "round" }, false);
  drawList.lineStrip(stripPoints(5, 1), { color: INDEX_BRIGHT_CYAN, width: w(4), widthMode, joint: "bevel", normal: INDEX_UP }, false);
  drawList.lineStrip(stripPoints(5, 2), { color: INDEX_GOLD, width: w(4), widthMode, joint: "miter", dash }, false);
  drawList.lineStrip(stripPoints(5, 3), { color: INDEX_MINT, width: w(4), widthMode, joint: "round", normal: INDEX_UP, dash }, false);

  // loop
  const loopPoints = (column: number, row: number): Vec3[] => [indexPath(column, row), indexPath(column, row, 0.55, 0.25, 0.95), indexPath(column, row, 1, 0, 0.65)];
  drawList.lineStrip(loopPoints(6, 0), { color: WHITE, width: w(4), widthMode, joint: "round" }, true);
  drawList.lineStrip(loopPoints(6, 1), { color: INDEX_BRIGHT_CYAN, width: w(4), widthMode, joint: "bevel", normal: INDEX_UP }, true);
  drawList.lineStrip(loopPoints(6, 2), { color: INDEX_GOLD, width: w(4), widthMode, joint: "miter", dash }, true);
  drawList.lineStrip(loopPoints(6, 3), { color: INDEX_MINT, width: w(4), widthMode, joint: "round", normal: INDEX_UP, dash }, true);

  // curve
  drawList.curve(INDEX_CURVE, { color: WHITE, width: w(2.5), widthMode, tolerance: 0.04, joint: "round", transform: { center: indexPath(7, 0, 0.5, 0, 0.65) } });
  drawList.curve(INDEX_CURVE, { color: INDEX_GOLD, width: w(2.5), widthMode, tolerance: 0.04, joint: "bevel", dash, transform: { center: indexPath(7, 1, 0.5, 0, 0.65) } });

  // grid
  drawList.grid(indexPath(8, 0, 0.5, 0, 0.05), [4, 3], [0.25, 0.25], { color: WHITE, width: w(1.5), widthMode, outer: "xz", skew: [0, 0] });
  drawList.grid(indexPath(8, 1, 0.5), [4, 3], [0.25, 0.25], { color: INDEX_BRIGHT_CYAN, width: w(1.5), widthMode, rotation: [Math.PI * 0.5, 0, 0], outer: "xz", skew: [0, 0], normal: INDEX_UP });

  // rect: base, [solid], normal, dashed, normal + dashed
  // `index.gd` passes `Quaternion.IDENTITY` for this column, so the rect lies in the XY plane
  // rather than the ground plane (unlike `rect.gd`, whose own flat basis is the XZ plane).
  let rectRow = 0;
  const rectAt = (row: number): Vec3[] => rectLoop(indexPath(9, row, 0.5), IDENTITY_BASIS, 0.8, 0.5);
  drawList.lineStrip(rectAt(rectRow++), { color: WHITE, width: w(2), widthMode, joint: "round" }, true);
  if (solids) drawList.mesh(rectMesh(indexPath(9, rectRow++, 0.5), IDENTITY_BASIS, 0.8, 0.5), { color: [1, 0.25, 0.25, 0.45], solid: true });
  drawRectNormals(drawList, rectAt(rectRow++), IDENTITY_BASIS, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" });
  drawList.lineStrip(rectAt(rectRow++), { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, true);
  drawRectNormals(drawList, rectAt(rectRow++), IDENTITY_BASIS, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash });

  // box: base, [solid], normal, dashed, normal + dashed
  const boxSize: Vec3 = [0.7, 0.7, 0.7];
  let boxRow = 0;
  const wireBox = (row: number, options: LineOptions): void => {
    drawBox(drawList, indexPath(10, row, 0.5), IDENTITY_BASIS, boxSize, options);
  };
  const wireBoxNormals = (row: number, options: LineOptions): void => {
    drawBoxNormals(drawList, indexPath(10, row, 0.5), IDENTITY_BASIS, boxSize, options);
  };
  wireBox(boxRow++, { color: WHITE, width: w(2), widthMode });
  if (solids) drawList.mesh(transformMeshByBasis(box(boxSize), indexPath(10, boxRow++, 0.5), IDENTITY_BASIS), { color: [1, 0.45, 0.2, 0.35], solid: true });
  wireBoxNormals(boxRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode });
  wireBox(boxRow++, { color: INDEX_GOLD, width: w(2), widthMode, dash });
  wireBoxNormals(boxRow++, { color: INDEX_MINT, width: w(2), widthMode, dash });

  // circle: base, [solid], normal, dashed, normal + dashed
  // `Quaternion.IDENTITY` in `index.gd` puts this column in the XY plane as well, so the ring and
  // its solid fan are vertical here while `circle.gd`'s own flat basis stays on the ground.
  let circleRow = 0;
  const circleRing = (row: number): Vec3[] => circlePoints(indexPath(11, row, 0.5), 0.4, 32, IDENTITY_BASIS);
  drawList.lineStrip(circleRing(circleRow++), { color: WHITE, width: w(2), widthMode, joint: "round" }, true);
  if (solids) drawList.mesh(circleSolidMesh(0.4, 32, indexPath(11, circleRow++, 0.5), IDENTITY_BASIS), { color: [0.25, 0.65, 1, 0.45], solid: true });
  drawCircleNormals(drawList, circleRing(circleRow++), 32, IDENTITY_BASIS, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" });
  drawList.lineStrip(circleRing(circleRow++), { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, true);
  drawCircleNormals(drawList, circleRing(circleRow++), 32, IDENTITY_BASIS, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash });

  // arc
  const arcAt = (row: number): Vec3[] => arcPoints(indexPath(12, row, 0.5), 0.45, Math.PI * 1.25, 32, IDENTITY_BASIS);
  drawList.lineStrip(arcAt(0), { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  drawArcNormals(drawList, arcAt(1), Math.PI * 1.25, 32, IDENTITY_BASIS, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" });
  drawList.lineStrip(arcAt(2), { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, false);
  drawArcNormals(drawList, arcAt(3), Math.PI * 1.25, 32, IDENTITY_BASIS, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash });

  // sphere: base, [solid], normal, dashed, normal + dashed
  const sphereAt = (row: number): ShapeWire => sphereWire(0.4, 32, 2, 2, indexPath(13, row, 0.5), IDENTITY_BASIS);
  const wireSphere = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = sphereAt(row);
    drawShapeWire(drawList, shape, options, normalAware ? sphereWireNormals(indexPath(13, row, 0.5), shape) : undefined);
  };
  let sphereRow = 0;
  wireSphere(sphereRow++, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  if (solids) drawList.mesh(sphereSolidMesh(0.4, indexPath(13, sphereRow++, 0.5), IDENTITY_BASIS), { color: [0.35, 0.75, 1, 0.35], solid: true });
  wireSphere(sphereRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);
  wireSphere(sphereRow++, { color: INDEX_GOLD, width: w(2), widthMode, joint: "miter", dash }, false);
  wireSphere(sphereRow++, { color: INDEX_MINT, width: w(2), widthMode, joint: "round", dash }, true);

  // cone: base, [solid], normal
  const coneAt = (row: number): ShapeWire => coneWire(0.35, 0.8, 32, 8, indexPath(14, row, 0.5), IDENTITY_BASIS);
  const wireCone = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = coneAt(row);
    drawShapeWire(drawList, shape, options, normalAware ? coneWireNormals(shape, 0.35, 0.8, 8, IDENTITY_BASIS) : undefined);
  };
  let coneRow = 0;
  wireCone(coneRow++, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  if (solids) drawList.mesh(coneSolidMesh(0.35, 0.8, indexPath(14, coneRow++, 0.5), IDENTITY_BASIS), { color: [1, 0.45, 0.25, 0.35], solid: true });
  wireCone(coneRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);

  // cylinder: base, [solid], normal
  const cylinderAt = (row: number): ShapeWire => cylinderWire(0.35, 0.4, 32, 8, indexPath(15, row, 0.5), IDENTITY_BASIS);
  const wireCylinder = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = cylinderAt(row);
    drawShapeWire(drawList, shape, options, normalAware ? cylinderWireNormals(shape, 0.35, 0.4, 8, IDENTITY_BASIS) : undefined);
  };
  let cylinderRow = 0;
  wireCylinder(cylinderRow++, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  if (solids) drawList.mesh(cylinderSolidMesh(0.35, 0.4, indexPath(15, cylinderRow++, 0.5), IDENTITY_BASIS), { color: [0.6, 0.45, 1, 0.35], solid: true });
  wireCylinder(cylinderRow++, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);

  // capsule: base, normal
  const capsuleAt = (row: number): ShapeWire => capsuleWire(0.32, 0.45, 32, 2, indexPath(16, row, 0.5), IDENTITY_BASIS);
  const wireCapsule = (row: number, options: LineOptions, normalAware: boolean): void => {
    const shape = capsuleAt(row);
    drawShapeWire(drawList, shape, options, normalAware ? capsuleWireNormals(shape, 0.45, indexPath(16, row, 0.5), IDENTITY_BASIS) : undefined);
  };
  wireCapsule(0, { color: WHITE, width: w(2), widthMode, joint: "round" }, false);
  wireCapsule(1, { color: INDEX_BRIGHT_CYAN, width: w(2), widthMode, joint: "bevel" }, true);
}


/** `index.gd`: screen-space widths, with the `*_s` solid columns. */
export function draw(drawList: FrameDrawList, context: SceneContext): void {
  apiMatrix(drawList, { width: (pixels) => pixels, widthMode: "screen", solids: true });
}
