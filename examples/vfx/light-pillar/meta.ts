/** Sidebar metadata for the `light-pillar` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { LOOP_SECONDS, PILLAR_VIEW } from "./scene.js";

/**
 * The sliders for the column.
 *
 * `spread` is what the rise does not need: it decides how much wider the column gets while it
 * scatters, which is the difference between a column that disperses and one that simply dims. The
 * height ceiling sits just under the space between the stage and the first curve row.
 */
export const LIGHT_PILLAR_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole column rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "width", label: "宽度", name: "width", min: 0.4, max: 2.2, step: 0.05, default: 1.5, unit: "u" },
  { key: "height", label: "高度", name: "height", min: 1.4, max: 6.4, step: 0.05, default: 5.4, unit: "u" },
  { key: "spread", label: "扩散量", name: "spread", min: 0, max: 1.6, step: 0.05, default: 0.9 },
  // 0 turns the ring off, which is what "more explosive" is being compared against.
  { key: "ring", label: "冲击环范围", name: "ring", min: 0, max: 2, step: 0.05, default: 1 },
  { key: "hue", label: "色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.55 },
  { key: "saturation", label: "饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 0.85 },
];

export const meta: SceneExample = {
  id: "light-pillar",
  title: "光柱",
  description:
    "一根光柱的完整一生：从地面一下立起来、停在半空亮着（0.8s 循环里约 0.3s，这期间它会呼吸）、然后炸开——柱身一下子被撑宽、亮度掉到只剩一层淡雾，同一瞬间地面上甩出一圈向外扩的光环，环走完就是雾散去。以前「光柱出现」和「光柱消散」是两页各自演示一头，这里合成一条时间轴：升起结束的位置就是爆散开始的位置。六层同色矩形由外向内收窄、由暗到亮构成柱身，地面两片扁椭圆、撑开时被柱身推开的一圈涟漪、爆散时甩出的冲击环，是它唯一沾地的地方。",
  notes:
    "柱身只靠 alpha 阶梯分层，单色，没有尖端光爆、没有第二种颜色。爆散不是“淡出得更快”，而是把三件事压进消散的前 34%（`BURST_RATIO`）：宽度按 `spread × outExpo` 一下撑开（`outExpo` 在十分之一的时间内就给出近一半行程，看起来是“被撑开”而不是“被吹胀”）、六层宽度向最外层折叠且柱芯先退（`drawPillarShaft` 的 `blur`）、亮度在 `outQuad` 时间里掉到两成 —— 剩下的两成才慢慢退，那一段才是雾。只把 alpha 调低会得到一根“半透明的柱子”，不是雾。地面在同一帧甩出一圈 `outCirc` 外扩的扁椭圆环，亮度平方衰减，扩到最大时正好消失；光池在环接手的瞬间就先灭了，两个都亮着只会糊成一团。升起不是“长”，是“被钉进地面”：高度走 `snapRise` —— 在升起的前 55% 里用 `outExpo` 冲过最终值 14%，再用 `inOutQuad` 落回来，眼睛真正看到的是那一下回弹，而不是跳跃本身；宽度、亮度也在头几帧就到位（`outExpo` / `rise / 0.25` 取 0.5 次幂）。地面不是自己亮起来，而是**被柱身撑开**的：光池半径走 `outQuad`，比柱身的 `outExpo` 慢半拍，所以永远是柱子先冲上去、地面随后被顶开；同时一圈更细的涟漪（`pushRingReach`）从柱脚推到光池外沿，在柱子到顶前就散掉——环还在、光池没跟上，看着就是“地面被撑开了”。光池亮度用 `outCirc` 先起来：若跟着半径一起慢，前半段屏幕上就只有一圈环、下面什么都没有。升起约占循环的 18%，停留约 38%（0.8s 里约 0.3s），剩下的才是爆散与空场。停留段里柱子会呼吸：一个正弦周期正好铺满停留段，两端都归零，所以既不会和升起打架、也不会让爆散第一帧显得在抖。呼吸同时作用在尺寸（宽 ±9%、高 ±5%）、亮度（±12%）和颜色上——胀起来时色相往青偏 0.015 圈、饱和度降 0.1，看起来是“光在发力”，而不是同一块颜色被放大；地面光池跟着 ±7% 一起起伏。`ring` 调到 0 就是没有冲击环的消散。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: PILLAR_VIEW,
  duration: LOOP_SECONDS,
  params: LIGHT_PILLAR_PARAMS,
};
