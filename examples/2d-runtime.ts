/**
 * Dispatch table for the 2D example pages.
 *
 * Each page lives in its own `examples/<slug>/scene.ts`; this module only maps an
 * example id to its draw function.
 */

import type { FrameDrawList } from "../src/frame-draw-list.js";
import { DEFAULT_VIEWPORT, type SceneContext, type Viewport2D } from "./shared/scene-context.js";
import { draw as gizmos } from "./2d-gizmos/scene.js";
import { draw as shapes } from "./2d-shapes/scene.js";
import { draw as lines } from "./2d-lines/scene.js";
import { draw as curves } from "./2d-curves/scene.js";
import { draw as markers } from "./2d-markers/scene.js";
import { draw as arrows } from "./2d-arrows/scene.js";
import { draw as outlines } from "./2d-outlines/scene.js";
import { draw as fill } from "./2d-fill/scene.js";
import { draw as spaces } from "./2d-spaces/scene.js";
import { draw as grid } from "./2d-grid/scene.js";

const PAGES: Readonly<Record<string, (drawList: FrameDrawList, context: SceneContext) => void>> = {
  "2d-gizmos": gizmos,
  "2d-shapes": shapes,
  "2d-lines": lines,
  "2d-curves": curves,
  "2d-markers": markers,
  "2d-arrows": arrows,
  "2d-outlines": outlines,
  "2d-fill": fill,
  "2d-spaces": spaces,
  "2d-grid": grid,
};

export const SCENE_IDS_2D: readonly string[] = Object.keys(PAGES);

/**
 * Dispatches the 2D pages. Returns false for every other id so `buildScene` can fall through to
 * the 3D scenes. `viewport` is only read by `screen`-space content, which is in canvas pixels.
 */
export function buildScene2D(
  id: string,
  drawList: FrameDrawList,
  time: number,
  viewport: Viewport2D = DEFAULT_VIEWPORT,
): boolean {
  const page = PAGES[id];
  if (page === undefined) return false;
  page(drawList, { time, viewport });
  return true;
}
