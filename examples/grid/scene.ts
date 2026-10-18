/**
 * `grid`: width, cell count, spacing, skew, outer edges, rotation, color, and normal rows.
 */

import { GRID_SCENE_CELL_VALUES, GRID_SCENE_COLOR_COUNT, GRID_SCENE_NORMAL_COUNT, GRID_SCENE_OUTER_VALUES, GRID_SCENE_ROTATION_COUNT, GRID_SCENE_SKEW_VALUES, GRID_SCENE_SPACING_VALUES, GRID_SCENE_WIDTH_VALUES, IDENTITY_BASIS, WHITE, drawAxes, gridSceneCellCount, gridSceneCenter, gridSceneRotation, gridSceneSkew, gridSceneSpacing } from "../shared/draw-3d.js";
import type { Color, FrameDrawList, Vec3 } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { normalSampleColor, normalSampleWidth, referenceOffset } from "../shared/layout-3d.js";

const GRID_SCENE_BASE_LINE_WIDTH = 2;

function gridSceneOuter(column: number, row: number): (typeof GRID_SCENE_OUTER_VALUES)[number] {
  return column === 4 ? GRID_SCENE_OUTER_VALUES[row]! : "none";
}


/** `_get_color_sample_color`. */
function gridSceneColorSample(row: number): Color {
  if (row === 1) return [1, 0.85, 0.1, 0.35];
  if (row === 2) return [1, 0.45, 0.2, 1];
  if (row === 3) return [0.25, 0.6, 1, 1];
  return WHITE;
}

function gridSceneDraw(drawList: FrameDrawList, column: number, row: number, color: Color, width: number, normal?: Vec3): void {
  drawList.grid(gridSceneCenter(column, row), gridSceneCellCount(column, row), gridSceneSpacing(column, row), {
    color,
    width,
    rotation: gridSceneRotation(column, row),
    skew: gridSceneSkew(column, row),
    outer: gridSceneOuter(column, row),
    ...(normal === undefined ? {} : { normal }),
  });
}

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  drawAxes(drawList, referenceOffset([0, 0, 0]), IDENTITY_BASIS, 0.75, 2);

  // grid(width)
  GRID_SCENE_WIDTH_VALUES.forEach((width, row) => gridSceneDraw(drawList, 0, row, WHITE, width));
  // grid(cells)
  GRID_SCENE_CELL_VALUES.forEach((_cells, row) => gridSceneDraw(drawList, 1, row, [0.15, 0.85, 1, 0.95], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(spacing)
  GRID_SCENE_SPACING_VALUES.forEach((_spacing, row) => gridSceneDraw(drawList, 2, row, [0.7, 1, 0.25, 1], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(skew)
  GRID_SCENE_SKEW_VALUES.forEach((_skew, row) => gridSceneDraw(drawList, 3, row, [1, 0.45, 0.2, 1], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(outer)
  GRID_SCENE_OUTER_VALUES.forEach((_outer, row) => gridSceneDraw(drawList, 4, row, [1, 0.7, 0.2, 1], GRID_SCENE_BASE_LINE_WIDTH));
  // grid(rotation)
  for (let row = 0; row < GRID_SCENE_ROTATION_COUNT; row++) gridSceneDraw(drawList, 5, row, [0.75, 0.45, 1, 1 - row * 0.08], GRID_SCENE_BASE_LINE_WIDTH);
  // grid(color)
  for (let row = 0; row < GRID_SCENE_COLOR_COUNT; row++) gridSceneDraw(drawList, 6, row, gridSceneColorSample(row), GRID_SCENE_BASE_LINE_WIDTH);
  // grid_n
  for (let row = 0; row < GRID_SCENE_NORMAL_COUNT; row++) gridSceneDraw(drawList, 7, row, normalSampleColor(row), normalSampleWidth(row, GRID_SCENE_BASE_LINE_WIDTH), [0, 1, 0]);
}
