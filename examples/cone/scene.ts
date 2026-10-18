/**
 * `cone`: cone wire and solid meshes across width, radius, height, segment, rotation, joint and normal rows.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { shapeScene } from "../shared/shapes-3d.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  shapeScene(drawList, "cone", context);
}
