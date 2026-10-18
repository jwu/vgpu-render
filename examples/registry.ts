/**
 * The gallery's example registry. Every page owns its metadata in `examples/<slug>/meta.ts`;
 * this module only fixes the sidebar order.
 */

import type { SceneExample } from "./shared/meta.js";
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
import { meta as page23 } from "./2d-gizmos/meta.js";
import { meta as page24 } from "./2d-shapes/meta.js";
import { meta as page25 } from "./2d-lines/meta.js";
import { meta as page26 } from "./2d-curves/meta.js";
import { meta as page27 } from "./2d-markers/meta.js";
import { meta as page28 } from "./2d-outlines/meta.js";
import { meta as page29 } from "./2d-fill/meta.js";
import { meta as page30 } from "./2d-spaces/meta.js";
import { meta as page31 } from "./2d-grid/meta.js";

export type { ExampleColumn, SceneExample } from "./shared/meta.js";

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
  page24,
  page25,
  page26,
  page27,
  page28,
  page29,
  page30,
  page31,
];
