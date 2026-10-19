/** Sidebar metadata for the `battle-slash` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { MATRIX_VIEW } from "../matrix.js";
import { LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the simulator-style swing.
 *
 * The defaults are the simulator's own numbers: a 240° arc, a stroke as wide as the radius, a 0.55
 * opening alpha and a 0.8-unit hit mark.
 */
export const BATTLE_SLASH_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole swing rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "radius", label: "半径", name: "radius", min: 0.5, max: 1.1, step: 0.05, default: 0.9, unit: "u" },
  { key: "sweep", label: "张角", name: "sweep", min: 120, max: 330, step: 5, default: 240, unit: "°" },
  // The simulator draws the arc with `strokeWidth: 0.8` on `radius: 0.8`: as thick as it is wide.
  { key: "stroke", label: "笔宽", name: "strokeWidth", min: 0.2, max: 1.2, step: 0.05, default: 0.9, unit: "u" },
  { key: "alpha", label: "起始不透明度", name: "alpha", min: 0.2, max: 1, step: 0.05, default: 0.55 },
  { key: "heading", label: "朝向角", name: "heading", min: 0, max: 360, step: 5, default: 0, unit: "°" },
  // The simulator draws this arc pure white, so the hue only shows once saturation leaves 0.
  { key: "hue", label: "色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.58 },
  { key: "saturation", label: "饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 0 },
];

export const meta: SceneExample = {
  id: "battle-slash",
  title: "战场挥砍",
  description:
    "照 `~/gamedev/battle` 里的挥砍做的：不是扫出来，而是第一帧就满弧，然后起端朝末端收回去、同步淡出。同样铺成 11×3 的缓动矩阵，每格只是“擦掉同一道痕”的快慢不同。",
  notes:
    "只画弧，不带引擎里的受击菱形——那道痕属于命中判定，不属于挥砍本身，多一个形状只会和要对比的角度打架。弧用 `arc`（SDF 环带）画，笔宽和半径同一量级，所以是一道粗带而不是细线；`world2d` 世界单位，缩放时跟着战场一起变粗变细。收缩方向沿用引擎口径：起端总在上方，目标在左角度递增、在右递减，于是两边都是“从上往下收”。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: MATRIX_VIEW,
  duration: LOOP_SECONDS,
  params: BATTLE_SLASH_PARAMS,
};
