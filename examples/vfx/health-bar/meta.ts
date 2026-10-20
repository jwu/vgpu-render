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
  // Four columns, so the bar may not grow into its neighbour's slice of the page.
  { key: "unitRadius", label: "单位半径", name: "unitRadius", min: 1, max: 1.9, step: 0.05, default: 1.5, unit: "u" },
  { key: "barWidth", label: "条宽", name: "barWidth", min: 3.2, max: 7, step: 0.05, default: 6.2, unit: "u" },
  { key: "barHeight", label: "条高", name: "barHeight", min: 0.4, max: 1.6, step: 0.05, default: 1, unit: "u" },
  { key: "damage", label: "掉血比例", name: "damage", min: 0.05, max: 0.95, step: 0.01, default: 0.55 },
  // How much shield the shield example opens with, in units of one full health bar.
  { key: "shieldMax", label: "护盾上限", name: "shieldMax", min: 0, max: 1.2, step: 0.05, default: 0.8 },
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
    "一页四个例子，共用一条时钟、一个播放窗口与一套参数。`受击` 照 `~/gamedev/battle` 的血条做的：黑色槽里一条暗红填充，掉血那一刻白条留在原处，先停 0.22 秒再花 0.38 秒追平。`治疗`：红条**长**回去而不是瞬间跳回，补上的那一段先是草绿、再褪回血色。`上盾`：一块比血条大一圈的蓝色护盾板从上方落下、缩紧贴合血条（`inOutCubic`，落定那一下描边一顿），护盾段**在贴合那一帧整条出现**、不渐变——读作「加固」，不是进度条。`破盾`：一开始就顶着满护盾；第一击削掉 2/3（血条不动），第二击把剩下的打碎——吃不下的一部分溢到血量，白条从那一帧开始追平，同时白色碎片朝血条缩短的**反方向**（向右）喷出。四个例子同一帧起手，正下方各有一组曲线，窗口与刻度一致。",
  notes:
    "**为什么拆成四个例子**：一个单位在同一时刻只能挨打、被治疗、上盾或破盾，把几段串成一条会读成同一件事的几个阶段；拆开之后四边同一帧起手，只是收招有先后——先演完的一边停在最后一帧，等最慢的那边结束再一起从头播放，`duration` 滑块只能在那之后加停顿。上盾与破盾刻意分成两列：上盾只演示「额外那一层怎么出现」，破盾才演示「护盾状态下挨打，血也会掉」——所以破盾那一列分成两击：先削掉 2/3，把护盾削到一击必碎的厚度，第二击才打得穿并溢出。细节取自参考实现的部分：白条只从红条**右沿**画起、槽是不透明的黑、受击闪白 18 帧 `1 - expo(inOut)`。**回血与两列护盾是这一页自己设计的**：参考里血条只是读数，没有回血动画也没有护盾；这里红条用 `outQuad` 长回去、绿段平方淡出回血色，护盾用蓝色（不是白——白已经表示「刚掉了多少」）——上盾是护盾板缩紧贴合、护盾整条落下即满，破盾是先削 2/3 再打碎并溢出，碎屑用白色（蓝色已经跟着护盾走了）朝血条缩短的反方向喷出。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: HEALTH_VIEW,
  duration: LOOP_SECONDS,
  params: HEALTH_BAR_PARAMS,
};
