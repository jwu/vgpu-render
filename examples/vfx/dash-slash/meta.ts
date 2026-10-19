/** Sidebar metadata for the `dash-slash` battle page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { DASH_VIEW, LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the dash and the cuts.
 *
 * `cuts` is the one that changes the action rather than its style: it is how many wounds open on the
 * enemy, staggered by a fixed gap. `length` and `trails` are the two size knobs — how long one cut is
 * and how many afterimages the dash leaves. The colour pairs recolour the cuts and the two bodies
 * separately.
 */
export const DASH_SLASH_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one: it is rendered next to the scrub slider instead of with the effect
  // parameters, and it re-times the whole clip rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "cuts", label: "刀痕数量", name: "cuts", min: 1, max: 12, step: 1, default: 6, unit: "刀", integer: true },
  { key: "length", label: "刀痕长度", name: "length", min: 0.8, max: 3, step: 0.05, default: 2, unit: "×" },
  { key: "trails", label: "残影数量", name: "trails", min: 0, max: 4, step: 1, default: 3, unit: "个", integer: true },
  { key: "hue", label: "刀痕色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.13 },
  { key: "saturation", label: "刀痕饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 0.45 },
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
  { key: "enemyHue", label: "敌人色相", name: "enemyHue", min: 0, max: 1, step: 0.01, default: 0.75 },
  { key: "enemySaturation", label: "敌人饱和度", name: "enemySaturation", min: 0, max: 1, step: 0.05, default: 0.62 },
];

export const meta: SceneExample = {
  id: "dash-slash",
  title: "闪影连斩",
  description:
    "角色从画面左侧冲到敌人身后，途中留下几道残影，到位的一瞬有一道竖直的白闪；之后画面停一下，敌人才开始掉血 —— 六道刀痕在它身上依次炸开，每刀各走自己的朝向、拉伸与淡出。下方四行曲线是这一下的完整时序：冲刺位置、每一刀的亮度、一道刀痕的拉伸、以及到位的一闪 —— 播放头与上方的画面共用同一个时钟。",
  notes:
    "没有引擎参考，来自「冲刺 → 一闪 → 停顿 → 伤害才追上」这个招式节奏。关键在于停顿：冲刺在循环的前 27% 就结束了，第一刀要到 42% 才出现，这 15% 的空档是让玩家先看清「人已经过去了」，六刀才像迟到的伤害，而不是位移的尾焰。六道刀痕用黄金角散开（无随机源，同一个敌人每次都是同样的六刀），每刀以 60% 长度出现、在极短时间内被拉到满长，再按剩余寿命的平方淡出；三层同心菱形（宽而淡的光晕、本体、近白内核）是 2D 层唯一的发光做法。残影不是跟随当前位置的运动模糊，而是留在路径固定点上的印记 —— 角色经过时点亮，到位后一起淡出，这样读起来是「已经穿过去了」。刀痕数量、长度与残影数量都在参数面板里可调。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: DASH_VIEW,
  duration: LOOP_SECONDS,
  params: DASH_SLASH_PARAMS,
};
