/**
 * `world-space-width`: the index matrix with world-space line widths and no solid columns.
 */

import { apiMatrix } from "../index/scene.js";
import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";

const WSW_LINE_WIDTH_SCALE = 0.01;


/** `world_space_width.gd`: the same matrix with world-space widths and no solid columns. */
export function draw(drawList: FrameDrawList, context: SceneContext): void {
  apiMatrix(drawList, { width: (pixels) => pixels * WSW_LINE_WIDTH_SCALE, widthMode: "world", solids: false });
}

