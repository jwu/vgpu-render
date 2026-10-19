/** Sidebar metadata for the `light-pillar` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the column.
 *
 * `height` is capped just under the gap between two rows: the plot above a cell belongs to the
 * neighbouring row, and a taller shaft would grow into it.
 */
export const LIGHT_PILLAR_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole column rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "width", label: "宽度", name: "width", min: 0.2, max: 1.2, step: 0.02, default: 0.7, unit: "u" },
  { key: "height", label: "高度", name: "height", min: 0.6, max: 1.9, step: 0.05, default: 1.8, unit: "u" },
  { key: "hue", label: "色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "saturation", label: "饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 1 },
];

export const meta: SceneExample = {
  id: "pillar-appear",
  title: "光柱出现",
  description:
    "一束逐渐出现的光柱：四层同族矩形由外向内收窄、由暗到亮，只有这一种颜色，没有光斑、光点或光环。柱高随曲线从零爬升、不透明度同步退掉——早期是一截短而亮的碎片，晚期是一根高而淡的光柱。",
  notes:
    "全部单一色：四层的层次只靠 alpha 阶梯，不掺第二种颜色。高度和透明度都读同一个 `eased`，所以两者永远不会互相矛盾：同一格看到的是同一条曲线上的同一个时刻，`outExpo` 一冲就散、`inQuad` 几乎没离开地面。全部 `world2d` 世界单位，缩放时跟着画面一起变粗变细。高度上限压在行距之内——每格上方的曲线图属于上一行，再高就会顶进去。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: LIGHT_PILLAR_PARAMS,
};
