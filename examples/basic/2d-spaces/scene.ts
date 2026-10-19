/**
 * `2d-spaces`: `world2d` versus `screen`, plus the width and size modes of each.
 *
 * The `screen` column is placed from the viewport rather than from a fixed pixel coordinate: it is
 * a fixed-position overlay, so its labels and geometry have to agree with whatever canvas the page
 * is rendered into.
 */

import type { FrameDrawList } from "../../../src/frame-draw-list.js";
import type { SceneContext } from "../../shared/scene-context.js";
import { COLUMN_TITLE_FONT, LABELS_2D, SAMPLE_LABEL_FONT } from "../../shared/2d-labels.js";
import {
  ACCENT,
  ACTION,
  COOL,
  FILL,
  HINT,
  RING,
  TITLE,
} from "../../shared/2d-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const labels = LABELS_2D["2d-spaces"];
  if (labels === undefined) return;
  const { d2 } = drawList;
  const viewport = context.viewport;
  const rows = 4;
  const worldX = -220;
  const modeX = 60;
  const rowY = (row: number): number => 120 - row * 110;
  const screenX = viewport[0] * 0.74;
  const screenTop = viewport[1] * 0.2;
  const screenStep = Math.max(viewport[1] * 0.18, 108);
  const screenY = (row: number): number => screenTop + row * screenStep;

  // Column titles and sample labels for the two world-space columns.
  labels.columns.forEach((column, index) => {
    if (index === 1) return;
    const x = index === 0 ? worldX : modeX;
    drawList.text([x, rowY(0) + 92, 0], column.title, {
      space: "world-plane",
      pixelSize: 1,
      fontSize: COLUMN_TITLE_FONT,
      anchor: "bottom-center",
      color: TITLE,
      depthTest: false,
    });
    column.samples.forEach((sample, row) => {
      drawList.text([x - 78, rowY(row), 0], sample, {
        space: "world-plane",
        pixelSize: 1,
        fontSize: SAMPLE_LABEL_FONT,
        anchor: "center-right",
        color: HINT,
        depthTest: false,
      });
    });
  });

  // The `screen` column labels itself in screen space, above each fixed-pixel sample.
  drawList.text([screenX, screenTop - 26, 0], labels.columns[1]!.title, {
    space: "screen",
    fontSize: 34,
    anchor: "bottom-center",
    color: TITLE,
  });
  labels.columns[1]!.samples.forEach((sample, row) => {
    drawList.text([screenX, screenY(row) + 38, 0], sample, {
      space: "screen",
      fontSize: 26,
      anchor: "top-center",
      color: HINT,
    });
  });

  for (let row = 0; row < rows; row++) {
    const y = rowY(row);
    const sy = screenY(row);
    // Row 0: a line in both spaces. `screen` keeps its pixel width while the world line moves
    // with pan and zoom.
    if (row === 0) {
      d2.line([worldX - 46, y], [worldX + 46, y], { width: 6, color: FILL });
      d2.line([screenX - 46, sy], [screenX + 46, sy], { width: 6, color: FILL, space: "screen" });
    }
    // Row 1: a point, sized in canvas pixels on both sides.
    if (row === 1) {
      d2.point([worldX, y], { size: 16, color: ACCENT });
      d2.point([screenX, sy], { size: 16, color: ACCENT, space: "screen" });
    }
    // Row 2: an outline, which strokes in pixels in both spaces.
    if (row === 2) {
      d2.rect([worldX, y], [92, 60], { strokeWidth: 4, color: COOL });
      d2.rect([screenX, sy], [92, 60], { strokeWidth: 4, color: COOL, space: "screen" });
    }
    // Row 3: the grid primitive in both spaces.
    if (row === 3) {
      d2.grid([worldX, y], [3, 2], [24, 20], { width: 2, color: RING });
      d2.grid([screenX, sy], [3, 2], [24, 20], { width: 2, color: RING, space: "screen" });
    }
    // The mode column: one nominal width under `screen` and `world`, then the two point size
    // modes. Only the `world` variants change with the camera zoom.
    if (row === 0) d2.line([modeX - 46, y], [modeX + 46, y], { width: 14, color: ACTION });
    if (row === 1) d2.line([modeX - 46, y], [modeX + 46, y], { width: 4, widthMode: "world", color: COOL });
    if (row === 2) d2.point([modeX, y], { size: 14, color: ACTION });
    if (row === 3) d2.point([modeX, y], { size: 14, sizeMode: "world", color: COOL });
  }
}
