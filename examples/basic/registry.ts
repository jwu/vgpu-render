/**
 * The gallery's example registry. Every page owns its metadata in `examples/<slug>/meta.ts`;
 * this module only fixes the sidebar order.
 */

import type { SceneExample } from "../shared/meta.js";
import { meta as page0 } from "./index/meta.js";
import { meta as page1 } from "./line/meta.js";
import { meta as page2 } from "./arrow/meta.js";
import { meta as page3 } from "./axes/meta.js";
import { meta as page4 } from "./grid/meta.js";
import { meta as page5 } from "./rect/meta.js";
import { meta as page6 } from "./box/meta.js";
import { meta as page7 } from "./circle/meta.js";
import { meta as page8 } from "./arc/meta.js";
import { meta as page9 } from "./curve/meta.js";
import { meta as page10 } from "./sphere/meta.js";
import { meta as page11 } from "./cone/meta.js";
import { meta as page12 } from "./cylinder/meta.js";
import { meta as page13 } from "./capsule/meta.js";
import { meta as page14 } from "./world-space-width/meta.js";
import { meta as page15 } from "./text-compare/meta.js";
import { meta as page16 } from "./text-encodings/meta.js";
import { meta as page17 } from "./text-scale/meta.js";
import { meta as page18 } from "./text-world-zoom/meta.js";
import { meta as page19 } from "./text-layout/meta.js";
import { meta as page20 } from "./text-anchor/meta.js";
import { meta as page21 } from "./text-cjk/meta.js";
import { meta as page22 } from "./text-font-query/meta.js";
import { meta as page23 } from "./2d-index/meta.js";
import { meta as page2dRect } from "./2d-rect/meta.js";
import { meta as page2dRoundedRect } from "./2d-rounded-rect/meta.js";
import { meta as page2dCircle } from "./2d-circle/meta.js";
import { meta as page2dEllipse } from "./2d-ellipse/meta.js";
import { meta as page2dArc } from "./2d-arc/meta.js";
import { meta as page2dAnnulus } from "./2d-annulus/meta.js";
import { meta as page2dCapsule } from "./2d-capsule/meta.js";
import { meta as page2dPolygon } from "./2d-polygon/meta.js";
import { meta as page2dTriangle } from "./2d-triangle/meta.js";
import { meta as page2dRhombus } from "./2d-rhombus/meta.js";
import { meta as page2dSector } from "./2d-sector/meta.js";
import { meta as page2dSegment } from "./2d-segment/meta.js";
import { meta as page2dLines } from "./2d-lines/meta.js";
import { meta as page2dCurves } from "./2d-curves/meta.js";
import { meta as page2dMarkers } from "./2d-markers/meta.js";
import { meta as page2dArrows } from "./2d-arrows/meta.js";
import { meta as page2dSpaces } from "./2d-spaces/meta.js";
import { meta as page2dGrid } from "./2d-grid/meta.js";
import { meta as page2dZIndex } from "./z-index/meta.js";
import { meta as page2dWorldSpaceWidth } from "./2d-world-space-width/meta.js";

export type { ExampleColumn, SceneExample } from "../shared/meta.js";

export const SCENE_EXAMPLES: readonly SceneExample[] = [
  page0,
  page1,
  page2,
  page3,
  page4,
  page5,
  page6,
  page7,
  page8,
  page9,
  page10,
  page11,
  page12,
  page13,
  page14,
  page15,
  page16,
  page17,
  page18,
  page19,
  page20,
  page21,
  page22,
  page23,
  page2dRect,
  page2dRoundedRect,
  page2dCircle,
  page2dEllipse,
  page2dArc,
  page2dAnnulus,
  page2dCapsule,
  page2dPolygon,
  page2dTriangle,
  page2dRhombus,
  page2dSector,
  page2dSegment,
  page2dLines,
  page2dCurves,
  page2dMarkers,
  page2dArrows,
  page2dSpaces,
  page2dGrid,
  page2dZIndex,
  page2dWorldSpaceWidth,
];
