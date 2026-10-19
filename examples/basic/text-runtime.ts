/**
 * Dispatch table for the screen-space text pages.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { draw as encodings } from "./text-encodings/scene.js";
import { draw as scale } from "./text-scale/scene.js";
import { draw as worldZoom } from "./text-world-zoom/scene.js";
import { draw as layout } from "./text-layout/scene.js";
import { draw as anchor } from "./text-anchor/scene.js";
import { draw as cjk } from "./text-cjk/scene.js";
import { draw as fontQuery } from "./text-font-query/scene.js";

const PAGES: Readonly<Record<string, (drawList: FrameDrawList, context: SceneContext) => void>> = {
  "text-encodings": encodings,
  "text-scale": scale,
  "text-world-zoom": worldZoom,
  "text-layout": layout,
  "text-anchor": anchor,
  "text-cjk": cjk,
  "text-font-query": fontQuery,
};

export const SCENE_IDS_TEXT: readonly string[] = Object.keys(PAGES);

/** Dispatches one of the text pages by scene id. */
export function textScene(id: string, drawList: FrameDrawList, context: SceneContext): void {
  PAGES[id]?.(drawList, context);
}
