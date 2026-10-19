/** Sidebar metadata for the `chain-lightning` battle page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { CHAIN_VIEW, LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the chain lightning.
 *
 * `targets` is the one that changes the shape of the clip rather than its style: the first enemy is
 * always the one the main bolt hits, and every extra target adds a fork out of it. `jitter`, `split`
 * and `glow` are the bolt's three knobs — how far it cracks, how many side branches hang off it and
 * how wide the halo around it is. The two colour pairs recolour the electricity and the bodies
 * separately, since a bolt over a navy ally and a red enemy reads differently.
 */
export const CHAIN_LIGHTNING_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one: it is rendered next to the scrub slider instead of with the effect
  // parameters, and it re-times the whole clip rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "targets", label: "目标数量", name: "targets", min: 1, max: 6, step: 1, default: 4, unit: "个", integer: true },
  { key: "jitter", label: "折线幅度", name: "jitter", min: 0, max: 2, step: 0.05, default: 1, unit: "×" },
  { key: "split", label: "分叉枝数", name: "split", min: 0, max: 3, step: 1, default: 1, unit: "枝", integer: true },
  { key: "glow", label: "外辉光", name: "glow", min: 0, max: 2, step: 0.05, default: 1, unit: "×" },
  { key: "hue", label: "电弧色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.57 },
  { key: "saturation", label: "电弧饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 0.92 },
  { key: "casterHue", label: "施法者色相", name: "casterHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  {
    key: "casterSaturation",
    label: "施法者饱和度",
    name: "casterSaturation",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.82,
  },
  { key: "targetHue", label: "目标色相", name: "targetHue", min: 0, max: 1, step: 0.01, default: 0.74 },
  { key: "targetSaturation", label: "目标饱和度", name: "targetSaturation", min: 0, max: 1, step: 0.05, default: 0.62 },
];

export const meta: SceneExample = {
  id: "chain-lightning",
  title: "闪电链",
  description:
    "施法者身上先亮起一点电光，随即「啪」地劈中第一名敌人；命中的同一帧，电弧从那名敌人身上一次分叉到其余所有目标，整棵电弧树再闪两下余电就彻底消失，剩下大半圈时间是留白。下方三行曲线是这一下的完整时序：主弧劈中、每根电弧的余闪、命中闪光与冲击环 —— 播放头与上方的画面共用同一个时钟。",
  notes:
    "这道闪电链没有引擎参考，是按「先命中第一个目标、再从它身上同时分叉」的招式节奏设计的，节奏上刻意做成雷劈：前 8% 只蓄一点光，电弧在两三帧内到位，命中后按 0.26 个循环的窗口闪三次（一次主击 + 两次余电），之后整棵树完全归零 —— 留白是效果的一部分，电弧如果一直连着就变成光束而不是一击。形制是硬折而不是平滑：每道电弧由 9 条长直腿组成，折点少、折角大，横向抛掷按弧长的 18% 封顶，读起来是一道劈穿空气的折线，而不是平滑弧线或毛毛的抖动；“折线幅度”滑块管的就是这个抛掷量。施法者本人不带电弧，只有一点蓄力光。同一个时间点永远得到同一张图，scrub、重载和截图对比看到的是同一帧。三层同一路径的描边（宽而暗的外辉光、本体、近白内核）就是 2D 层唯一的辉光做法，分叉枝只画两层更细的。目标位置是固定槽位而不是随机散布，弧与弧之间高低错开，六个目标时也不会糊成一片。目标数量改变的是分支数，主弧始终打在最近的第一名敌人身上。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: CHAIN_VIEW,
  duration: LOOP_SECONDS,
  params: CHAIN_LIGHTNING_PARAMS,
};
