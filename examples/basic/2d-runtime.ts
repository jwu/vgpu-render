/**
 * Dispatch table for the 2D example pages.
 *
 * Each page lives in its own `examples/<slug>/scene.ts`; this module only maps an
 * example id to its draw function.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import { DEFAULT_VIEWPORT, type SceneContext, type Viewport2D } from "../shared/scene-context.js";
import { draw as index } from "./2d-index/scene.js";
import { draw as rect } from "./2d-rect/scene.js";
import { draw as rectR } from "./2d-rounded-rect/scene.js";
import { draw as circle } from "./2d-circle/scene.js";
import { draw as ellipse } from "./2d-ellipse/scene.js";
import { draw as arc } from "./2d-arc/scene.js";
import { draw as annulus } from "./2d-annulus/scene.js";
import { draw as capsule } from "./2d-capsule/scene.js";
import { draw as polygon } from "./2d-polygon/scene.js";
import { draw as triangle } from "./2d-triangle/scene.js";
import { draw as rhombus } from "./2d-rhombus/scene.js";
import { draw as sector } from "./2d-sector/scene.js";
import { draw as segment } from "./2d-segment/scene.js";
import { draw as lines } from "./2d-lines/scene.js";
import { draw as curves } from "./2d-curves/scene.js";
import { draw as markers } from "./2d-markers/scene.js";
import { draw as arrows } from "./2d-arrows/scene.js";
import { draw as spaces } from "./2d-spaces/scene.js";
import { draw as grid } from "./2d-grid/scene.js";
import { draw as order } from "./z-index/scene.js";
import { draw as worldSpaceWidth } from "./2d-world-space-width/scene.js";

const PAGES: Readonly<Record<string, (drawList: FrameDrawList, context: SceneContext) => void>> = {
  "2d-index": index,
  "2d-rect": rect,
  "2d-rounded-rect": rectR,
  "2d-circle": circle,
  "2d-ellipse": ellipse,
  "2d-arc": arc,
  "2d-annulus": annulus,
  "2d-capsule": capsule,
  "2d-polygon": polygon,
  "2d-triangle": triangle,
  "2d-rhombus": rhombus,
  "2d-sector": sector,
  "2d-segment": segment,
  "2d-lines": lines,
  "2d-curves": curves,
  "2d-markers": markers,
  "2d-arrows": arrows,
  "2d-spaces": spaces,
  "2d-grid": grid,
  "z-index": order,
  "2d-world-space-width": worldSpaceWidth,
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
