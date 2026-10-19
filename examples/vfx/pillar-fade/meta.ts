/** Sidebar metadata for the `pillar-burst` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the bursting column.
 *
 * `spread` is the one the sibling page does not have: it decides how much wider the column gets as
 * it scatters, which is what makes the burst read as an explosion rather than a fade.
 */
export const PILLAR_FADE_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole burst rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "width", label: "宽度", name: "width", min: 0.2, max: 1.2, step: 0.02, default: 0.7, unit: "u" },
  { key: "height", label: "高度", name: "height", min: 0.6, max: 1.8, step: 0.05, default: 1.6, unit: "u" },
  { key: "spread", label: "扩散量", name: "spread", min: 0, max: 1.6, step: 0.05, default: 0.8 },
  { key: "hue", label: "色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "saturation", label: "饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 1 },
];

export const meta: SceneExample = {
  id: "pillar-fade",
  title: "光柱消散",
  description:
    "和「光柱出现」反着来：第一帧就是满高的柱子，之后被拿走的是“形”——柱身向两侧扩开、整体淡掉，最后只剩一层宽而暗的雾。同样只有柱体本身，没有圆点、光环或地面光晕。",
  notes:
    "柱身形状与「光柱出现」共用 `drawPillarShaft`，同样单色，只有 alpha 阶梯分层。这一页的唯一动作是扩散：宽度乘 `1 + spread × eased`，所以同一时刻每格的宽窄就是那条曲线跑到的位置。`fade` 越界（`back`/`elastic` 超调）先钳到 0 再取幂，否则负底数的分数次幂会给出 NaN。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: PILLAR_FADE_PARAMS,
};
