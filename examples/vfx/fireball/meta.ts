/** Sidebar metadata for the `fireball` battle page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { FIREBALL_VIEW, LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the projectile.
 *
 * `radius`, `blast`, `sparks` and `embers` scale the blast's three size knobs; the two colour pairs
 * recolour the fire and the two bodies separately, since a fireball on an ally-blue and an enemy-red
 * body reads differently.
 */
export const FIREBALL_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one: it is rendered next to the scrub slider instead of with the effect
  // parameters, and it re-times the whole clip rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "radius", label: "火球大小", name: "radius", min: 0.4, max: 2, step: 0.05, default: 1, unit: "×" },
  { key: "blast", label: "爆炸范围", name: "blast", min: 0.3, max: 2, step: 0.05, default: 1, unit: "×" },
  { key: "sparks", label: "火花数量", name: "sparks", min: 0, max: 24, step: 1, default: 12, integer: true },
  { key: "embers", label: "余烬数量", name: "embers", min: 0, max: 20, step: 1, default: 8, integer: true },
  { key: "hue", label: "火焰色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.06 },
  { key: "saturation", label: "火焰饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 1 },
  { key: "casterHue", label: "施法者色相", name: "casterHue", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "casterSaturation", label: "施法者饱和度", name: "casterSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
  { key: "targetHue", label: "目标色相", name: "targetHue", min: 0, max: 1, step: 0.01, default: 0.74 },
  { key: "targetSaturation", label: "目标饱和度", name: "targetSaturation", min: 0, max: 1, step: 0.05, default: 0.62 },
];

export const meta: SceneExample = {
  id: "fireball",
  title: "火球术",
  description:
    "施法者在左、目标在右：起手时火苗在施法者身上涨起来，火球沿直线飞过去、身后拖着渐隐的尾焰，命中后闪光、冲击环、火花与余烬四层同时炸开。下方四行曲线是这一发火球的完整时序：飞行位置、火球大小、爆炸的闪光与快慢两圈冲击环、火花与余烬亮度 —— 播放头与上方的画面共用同一个时钟。",
  notes:
    "参照 `~/gamedev/battle` 的招式节奏：起手 12%、飞行到 55%、之后全是爆炸。爆炸四层各走自己的时间：闪光在爆炸前 16% 内消失，快环 30% 走完（`outCirc`，冲击波先快后慢），慢环 75% 走完并扩得更远，火花 42% 飞到位、50% 熄灭，余烬一直活到循环结束。飞行用 `easeInOutQuad`：直线弹道没有重力，加速度是它区别于「沿轨道滑行」的唯一线索。火球本体是「光晕 + 本体 + 亮芯」三层同心圆，拖尾是一条 `colorEnd` 归零的线 —— 一串缩小圆点会被读成第二颗更慢的火球。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: FIREBALL_VIEW,
  duration: LOOP_SECONDS,
  params: FIREBALL_PARAMS,
};
