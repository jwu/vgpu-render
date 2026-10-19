/** Sidebar metadata for the `slash-arc` battle page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders the battle page renders for this effect.
 *
 * Angles are degrees in the UI and radians in the scene; `min`/`max`/`step` are the authored range,
 * and `clampParams` keeps a stored record inside it.
 */
export const SLASH_ARC_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one: it is rendered next to the scrub slider instead of with the effect
  // parameters, and it re-times the whole swing rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  // Capped at 1.1 so the widest swing still clears the plot stacked above it in the cell.
  { key: "radius", label: "半径", name: "radius", min: 0.5, max: 1.1, step: 0.05, default: 0.9, unit: "u" },
  { key: "sweep", label: "扫掠角", name: "sweep", min: 40, max: 330, step: 5, default: 200, unit: "°" },
  { key: "start", label: "起始角", name: "startAngle", min: 0, max: 360, step: 5, default: 210, unit: "°" },
  { key: "stroke", label: "描边宽度", name: "strokeWidth", min: 0.02, max: 0.4, step: 0.01, default: 0.12, unit: "u" },
  { key: "fill", label: "填充强度", name: "sector_s", min: 0, max: 1, step: 0.05, default: 0.4 },
  { key: "hue", label: "色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.55 },
  // 1 keeps the authored blue-cyan mix; 0 lands on white, which is the battle page's default look.
  { key: "saturation", label: "饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 1 },
];

export const meta: SceneExample = {
  id: "slash-arc",
  title: "斩击弧光",
  description:
    "anime.js 的全部缓动曲线铺成 11×3 的矩阵：列是 `linear` / `quad` / `cubic` / `quart` / `quint` / `sine` / `expo` / `circ` / `back` / `elastic` / `bounce`，行是 `in` / `out` / `inOut`，33 格共享时钟、几何与参数，同一时刻扫到的角度不同，曲线的手感差别就成了看得见的角度差。",
  notes:
    "斩击只有两层：`sector_s` 实心扇形 + `arc` 描边（2D 层没有 `arc_s`，弧没有内部）。没有拖尾、火花、刃尖与爆点——每格形状完全一致，只有扫掠角不同，曲线差异才读得干净。`linear` 是第一列基线，没有方向，三行是同一条曲线；每张图的横轴是挥砍窗口的原始进度、纵轴是缓动值，对角参考线就是 `linear`，游标与刀锋同步。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: SLASH_ARC_PARAMS,
};
