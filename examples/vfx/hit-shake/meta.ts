/** Sidebar metadata for the `hit-shake` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the shake.
 *
 * `amplitude` is in `world2d` units and opens well under the body radius: this page is the small
 * nudge a hit gives a body that stays where it stands, not a knockback. `cycles` is how many times
 * it swings inside the action window — the one number that turns the same envelope into a single
 * heavy shove or a fast chatter.
 */
export const HIT_SHAKE_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole shake rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "unitRadius", label: "单位半径", name: "unitRadius", min: 0.3, max: 0.8, step: 0.05, default: 0.55, unit: "u" },
  { key: "amplitude", label: "震动幅度", name: "amplitude", min: 0.05, max: 0.8, step: 0.01, default: 0.25, unit: "u" },
  { key: "cycles", label: "震动次数", name: "cycles", min: 1, max: 8, step: 0.5, default: 3, unit: "次" },
  // The body is the simulator's ally palette (#1a4a8f / #7be0ff), same as the two hit pages beside.
  { key: "unitHue", label: "单位色相", name: "unitHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "unitSaturation", label: "单位饱和度", name: "unitSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
];

export const meta: SceneExample = {
  id: "hit-shake",
  title: "受击震动",
  description:
    "受击反馈的第三条通道：前两页（受击痕、受击闪白）把这一下花在叠在单位之上的东西，这一页花在单位自己的位置上——本体被推得左右晃几下再归位，幅度不到自己半径的一半。铺成同一套 11×3 缓动矩阵，每格只是“这次震动消失得多快”：`out` 行是一下打回去就站定，`in` 行是被顶到最后才停。",
  notes:
    "位移是 `amplitude × (1 - eased) × cos(progress × cycles × 2π)`：包络走 `1 - eased`，与受击闪白的 alpha 同一个口径——曲线管的是这一下多久被消化掉，不是推了多远；余弦负责摆动，且在动作窗口第一帧就是满幅（用 `sin` 会从 0 起步，看起来什么都没发生）。只有水平一个轴：受击震动是“被打得晃了一下”，加上第二个轴就变成绕圈跑开了。幅度开在 0.25u，不到 0.55u 半径的一半——再大就不像原地挨了一下，像被击退。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: HIT_SHAKE_PARAMS,
};
