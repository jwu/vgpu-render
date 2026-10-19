/** Sidebar metadata for the `hit-flash` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the hit flash.
 *
 * The defaults are the simulator's: a 0.55-unit body and a full-strength white flash over it. The
 * flash's own hue/saturation sit at 0 saturation, so raising them tints it without changing how the
 * white version reads.
 */
export const HIT_FLASH_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole flash rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "unitRadius", label: "单位半径", name: "unitRadius", min: 0.3, max: 0.8, step: 0.05, default: 0.55, unit: "u" },
  { key: "flash", label: "闪白强度", name: "flash", min: 0, max: 1, step: 0.05, default: 1 },
  // The body is the simulator's ally palette (#1a4a8f / #7be0ff); the flash is pure white.
  { key: "unitHue", label: "单位色相", name: "unitHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "unitSaturation", label: "单位饱和度", name: "unitSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
  { key: "flashHue", label: "闪白色相", name: "flashHue", min: 0, max: 1, step: 0.01, default: 0.58 },
  { key: "flashSaturation", label: "闪白饱和度", name: "flashSaturation", min: 0, max: 1, step: 0.05, default: 0 },
];

export const meta: SceneExample = {
  id: "hit-flash",
  title: "受击闪白",
  description:
    "照 `~/gamedev/battle` 的受击反馈做的：一个与单位同半径的实心圆，从完全不透明开始、按 `1 - eased` 退掉，把本体和描边一起盖住——没有环、没有贴图，就是“这一下打在身上”。铺成同一套 11×3 缓动矩阵，`circ` 的 `in` 行正是引擎自己的时序。",
  notes:
    "闪白画在本体之上（引擎里它在 `fx` 层，盖住圆盘、描边与圆内首字），半径与单位相同，所以整块身体一起变亮。矩阵里每格的衰减都不同：`in` 行慢、`out` 行几乎立刻退掉，同一时刻哪一格还亮着就是那条曲线的形状。单位颜色与闪白颜色各自一套色相/饱和度，默认是引擎的我方蓝加纯白。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: HIT_FLASH_PARAMS,
};
