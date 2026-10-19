/** Sidebar metadata for the `heal-beam` battle page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { HEAL_VIEW, LOOP_SECONDS } from "./scene.js";

/**
 * The sliders for the healing effect.
 *
 * `spread`, `sparks` and the two colour pairs are what the page adds over a bare column: how far the
 * ground pool opens, how many sparks ride the beam, and separate hues for the effect and the body it
 * lands on. `height` and `width` scale the column's two axes independently.
 */
export const HEAL_BEAM_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one: it is rendered next to the scrub slider instead of with the effect
  // parameters, and it re-times the whole playback rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "height", label: "柱身高度", name: "height", min: 1.5, max: 10, step: 0.1, default: 8, unit: "u" },
  { key: "width", label: "柱身宽度", name: "width", min: 0.3, max: 2.2, step: 0.05, default: 1, unit: "×" },
  { key: "spread", label: "光斑扩散", name: "spread", min: 0, max: 2.2, step: 0.05, default: 1, unit: "×" },
  { key: "sparks", label: "光点数量", name: "sparks", min: 0, max: 6, step: 1, default: 4, integer: true },
  { key: "hue", label: "特效色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.42 },
  { key: "saturation", label: "特效饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 0.85 },
  { key: "unitHue", label: "单位色相", name: "unitHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "unitSaturation", label: "单位饱和度", name: "unitSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
];

export const meta: SceneExample = {
  id: "heal-beam",
  title: "治疗光柱",
  description:
    "一个特效占满画面：治疗落在单位身上的那一下 —— 地面光斑从脚下铺开、柱身从身上升起、几颗光点沿柱身往上飘，最后一起淡掉。右边四行曲线是这个特效的时间轴：每一行画的是某个元素在这一刻真正被驱动的那个值，播放头与左边的特效共用同一个时钟。",
  notes:
    "参照 `~/gamedev/battle` 的治疗效果：光斑两层同心扁椭圆（外层铺开、内层亮斑），柱身 28 层同心竖线（横向柔边靠层叠、纵向渐隐靠 `colorEnd`），光点按黄金角错相沿柱身上升。曲线行与画面读的是同一组相位函数，所以「柱身已长满、光斑还在扩、亮度在直线下降」这件事在时间轴上一眼可见，而不是两套各说各话的动画。`spark × N · 各相位亮度` 里每颗光点一条曲线，`sin(π·相位)` 让它们出现与消失都不留接缝。拖时间轴 scrub 可以逐帧对照。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: HEAL_VIEW,
  duration: LOOP_SECONDS,
  params: HEAL_BEAM_PARAMS,
};
