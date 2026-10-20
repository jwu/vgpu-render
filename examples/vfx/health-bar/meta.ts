/** Sidebar metadata for the `health-bar` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { HEALTH_VIEW, LOOP_SECONDS } from "./scene.js";

/**
 * The sliders both examples share.
 *
 * The two ghost timings (`ghostDelay` / `ghostChase`) open on the simulator's own 0.22 s / 0.38 s,
 * and the bar's fill opens on its blood red. `damage` and `heal` are the loop: how much one hit
 * takes off, and how much of it comes back. `healSpan` / `healFade` are the part the simulator does
 * not have — a heal there is a jump — and they are what turns the refill into something you watch.
 */
export const HEALTH_BAR_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one: it re-times the whole loop rather than one phase of it.
  // The loop ends when the longer effect does; the slider only adds a pause after it (see
  // `loopSecondsOf`), so its range starts below the effects' own length.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.05, default: LOOP_SECONDS, unit: "s" },
  // Two columns, so the bar may not grow into its neighbour's half of the page.
  { key: "unitRadius", label: "单位半径", name: "unitRadius", min: 1.2, max: 2.4, step: 0.05, default: 1.9, unit: "u" },
  { key: "barWidth", label: "条宽", name: "barWidth", min: 4, max: 9, step: 0.05, default: 7.2, unit: "u" },
  { key: "barHeight", label: "条高", name: "barHeight", min: 0.4, max: 1.6, step: 0.05, default: 1, unit: "u" },
  { key: "damage", label: "掉血比例", name: "damage", min: 0.05, max: 0.95, step: 0.01, default: 0.55 },
  { key: "heal", label: "治疗回补", name: "heal", min: 0, max: 1, step: 0.05, default: 1 },
  { key: "healSpan", label: "回血时长", name: "healSpan", min: 0.05, max: 0.8, step: 0.01, default: 0.25, unit: "s" },
  { key: "healFade", label: "回血褪色", name: "healFade", min: 0.05, max: 1, step: 0.01, default: 0.25, unit: "s" },
  { key: "ghostDelay", label: "残影延迟", name: "ghostDelay", min: 0, max: 0.8, step: 0.01, default: 0.22, unit: "s" },
  { key: "ghostChase", label: "残影追平", name: "ghostChase", min: 0.05, max: 1.2, step: 0.01, default: 0.38, unit: "s" },
  // The fill is the simulator's blood red: hue 0, saturation 0.98 at a fixed value of 0.54.
  { key: "healthHue", label: "血条色相", name: "healthHue", min: 0, max: 1, step: 0.01, default: 0 },
  { key: "healthSaturation", label: "血条饱和度", name: "healthSaturation", min: 0, max: 1, step: 0.02, default: 0.98 },
  { key: "unitHue", label: "单位色相", name: "unitHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "unitSaturation", label: "单位饱和度", name: "unitSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
];

export const meta: SceneExample = {
  id: "health-bar",
  title: "血条残影",
  description:
    "一页两个例子，共用一条时钟与一套参数。左边 `受击` 照 `~/gamedev/battle` 的血条做的：黑色槽里一条暗红填充，掉血那一刻白条留在原处，先停 0.22 秒让人看清「掉了多少」，再花 0.38 秒追平到当前血量——追平是 `outQuad`，先把缺口的大半收回来、尾巴慢下来。右边 `治疗`：血条一开始就是挨过打的样子，治疗落地时红条**长**回去而不是瞬间跳回，补上的那一段先是草绿（比治疗光柱的薄荷更偏黄，亮度压到血色同一档），再褪回血色。两边**同时开始**，共用同一个窗口（0.6s，取两者中较长的那个）：先演完的一边停在最后一帧等另一边，两边都结束后再从头播放。每个例子**正下方**是它的曲线组，窗口一致所以刻度一致（0.00–0.60s）：受击是血条 / 残影 / 闪白，治疗是血条 / 补上。曲线铺满整行，不会拉出一条“什么都没发生”的长平线；长度一致，两组的斜率也才可比。",
  notes:
    "**为什么拆成两个例子**：一个单位在同一时刻只能挨打或被治疗，把两段串成一条会读成同一件事的两个阶段；拆开之后两边的起手时刻一样，只是收招有先后——一边还在追平，另一边已经补满在等。以后要加护甲，只是往 `EXAMPLES` 里再加一项：列位置、曲线组和窗口长度都会自己重排。三处细节取自参考实现：白条只从红条**右沿**画起（红条 0.95 半透明，垫在白底上会被提亮成一道白边）；槽是不透明的黑（半透明时网格与单位描边会从条里透出来）；受击闪白 18 帧、`1 - expo(inOut)` 衰减。**回血是唯一偏离参考的地方**：参考里血条只是读数，`heal` 一来数字就跳；这里红条用 `outQuad` 长回去，补上的那一段先绿后褪。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: HEALTH_VIEW,
  duration: LOOP_SECONDS,
  params: HEALTH_BAR_PARAMS,
};
