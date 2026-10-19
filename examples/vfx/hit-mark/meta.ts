/** Sidebar metadata for the `hit-mark` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the hit mark.
 *
 * The defaults keep the simulator's proportions: a 0.55-unit body (the simulator's 0.32 scaled up so
 * it reads at gallery zoom) under a 1.4-unit mark, i.e. the same 1 : 2.5 body-to-mark ratio.
 */
export const HIT_MARK_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole hit rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "unitRadius", label: "单位半径", name: "unitRadius", min: 0.3, max: 0.8, step: 0.05, default: 0.55, unit: "u" },
  { key: "mark", label: "受击痕长度", name: "markLength", min: 0.6, max: 2.2, step: 0.05, default: 1.4, unit: "u" },
  { key: "stretch", label: "拉伸量", name: "stretch", min: 0, max: 2, step: 0.1, default: 1 },
  { key: "heading", label: "朝向角", name: "heading", min: 0, max: 360, step: 5, default: 0, unit: "°" },
  // Defaults match the simulator: the ally navy rim (#1a4a8f / #7be0ff) and the #ffd23f cut.
  { key: "unitHue", label: "单位色相", name: "unitHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "unitSaturation", label: "单位饱和度", name: "unitSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
  { key: "markHue", label: "痕迹色相", name: "markHue", min: 0, max: 1, step: 0.01, default: 0.13 },
  { key: "markSaturation", label: "痕迹饱和度", name: "markSaturation", min: 0, max: 1, step: 0.05, default: 0.75 },
];

export const meta: SceneExample = {
  id: "hit-mark",
  title: "受击痕",
  description:
    "照 `~/gamedev/battle` 的命中判定做的：明黄细菱在战斗单位身上划开，长轴两端向外拉伸、同步淡出。铺成同一套 11×3 缓动矩阵，每格只是“这道口子被拉开得多快”。",
  notes:
    "菱形是 `rhombus_s`，短轴固定为长轴的 0.225（引擎的 0.18 / 0.8），只有长轴被拉伸——两端一起拉长才读得出“裂口在原地被撑开”。单位本体是 `circle_s` + `circle` 描边，取引擎的我方配色（`#1a4a8f` / `#7be0ff`）。没有单位时这道痕只是一个悬空的菱形，所以这页把受击者一起画出来；引擎里的受击闪白没有带过来——那层白会把要看的身体盖住。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: HIT_MARK_PARAMS,
};
