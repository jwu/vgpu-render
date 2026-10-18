/**
 * Dispatches an example id to its page.
 *
 * Every 2D, 3D and text page lives in `examples/<slug>/scene.ts`; this module is the
 * only place that knows the full id table. It also owns the scene-wide scaffolding:
 * the reference axes, the 2D fall-through and the shared labels.
 */

import type { FrameDrawList } from "../src/frame-draw-list.js";
import { buildScene2D } from "./2d-runtime.js";
import { textScene } from "./text-runtime.js";
import { AXES_LENGTH, SCENE_LABEL_SPECS } from "./shared/draw-3d.js";
import { DEFAULT_VIEWPORT, type SceneContext, type Viewport2D } from "./shared/scene-context.js";
import { SCENE_LABELS, drawSceneLabels } from "./shared/labels-3d.js";
import { referenceOffset } from "./shared/layout-3d.js";
import { draw as indexScene } from "./index/scene.js";
import { draw as lineScene } from "./line/scene.js";
import { draw as arrowScene } from "./arrow/scene.js";
import { draw as axesScene } from "./axes/scene.js";
import { draw as gridScene } from "./grid/scene.js";
import { draw as rectScene } from "./rect/scene.js";
import { draw as boxScene } from "./box/scene.js";
import { draw as circleScene } from "./circle/scene.js";
import { draw as arcScene } from "./arc/scene.js";
import { draw as curveScene } from "./curve/scene.js";
import { draw as sphere } from "./sphere/scene.js";
import { draw as cone } from "./cone/scene.js";
import { draw as cylinder } from "./cylinder/scene.js";
import { draw as capsule } from "./capsule/scene.js";
import { draw as worldSpaceWidthScene } from "./world-space-width/scene.js";
import { draw as textCompareScene } from "./text-compare/scene.js";

export function buildScene(
  id: string,
  drawList: FrameDrawList,
  time: number,
  lineJoint?: SceneContext["lineJoint"],
  viewport?: Viewport2D,
): void {
  // The 2D pages live in their own module and own their camera space entirely. `screen` space is
  // top-left canvas pixels, so those pages also read the viewport the frame targets.
  const resolvedViewport = viewport ?? DEFAULT_VIEWPORT;
  if (buildScene2D(id, drawList, time, resolvedViewport)) return;
  const context: SceneContext = {
    time,
    viewport: resolvedViewport,
    ...(lineJoint === undefined ? {} : { lineJoint }),
  };
  // Reference: every example's first `_process()` line is
  // `draw_axes(Vector3.ZERO, IDENTITY, 0.75, 2.0)`. `DebugDraw3D` is a child of the scene
  // root, so the local `ZERO` picks up the capture harness's scene translation and the axes
  // land on the shifted origin. `_validate_global_basis()` only rejects rotation/scale, which
  // is what allows that translation. The axes are unconditional scene content, not a
  // toggle: `EndlessGrid3D` and `DebugDraw3D` are sibling nodes that never know about each
  // other, so the grid has no bearing on whether the axes show.
  // The screen-space text pages are their own content in pixel space, so the world axes would only be
  // clutter in front of them; `text-compare` keeps its axes, being a world-space matrix.
  const screenTextPage =
    id === "text-encodings" ||
    id === "text-scale" ||
    id === "text-world-zoom" ||
    id === "text-layout" ||
    id === "text-anchor" ||
    id === "text-cjk" ||
    id === "text-font-query";
  const selfAxes = screenTextPage || id === "index" || id === "grid" || id === "world_space_width";
  // index/grid/world_space_width draw their own translated origin axes (and
  // world_space_width needs world-space widths), so they opt out of the generic one.
  if (!selfAxes) drawList.axes(referenceOffset([0, 0, 0]), AXES_LENGTH, 2);
  switch (id) {
    case "index": indexScene(drawList, context); break;
    case "line": lineScene(drawList, context); break;
    case "arrow": arrowScene(drawList, context); break;
    case "axes": axesScene(drawList, context); break;
    case "grid": gridScene(drawList, context); break;
    case "rect": rectScene(drawList, context); break;
    case "box": boxScene(drawList, context); break;
    case "circle": circleScene(drawList, context); break;
    case "arc": arcScene(drawList, context); break;
    case "curve": curveScene(drawList, context); break;
    case "sphere": sphere(drawList, context); break;
    case "cone": cone(drawList, context); break;
    case "cylinder": cylinder(drawList, context); break;
    case "capsule": capsule(drawList, context); break;
    case "world_space_width": worldSpaceWidthScene(drawList, context); break;
    case "text-compare": textCompareScene(drawList, context); break;
    case "text-encodings":
    case "text-scale":
    case "text-world-zoom":
    case "text-layout":
    case "text-anchor":
    case "text-cjk":
    case "text-font-query": textScene(id, drawList, context); break;
    default: break;
  }
  const labelSpec = SCENE_LABEL_SPECS[id];
  const labels = SCENE_LABELS[id];
  if (labelSpec !== undefined && labels !== undefined) drawSceneLabels(drawList, labels, labelSpec);
}
