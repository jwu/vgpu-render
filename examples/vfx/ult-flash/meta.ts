/** Sidebar metadata for the `ult-flash` page. */

import type { ParamSpec, SceneExample } from "../../shared/meta.js";
import { DEFAULT_UNIT_RADIUS, LOOP_SECONDS, ULT_VIEW } from "./scene.js";

/**
 * The sliders for the ultimate flash.
 *
 * `starSize`, `spike` and `ring` are sizes in body radii, so the whole flash can be scaled without
 * touching the body; the two colour pairs are the flash and the body, kept apart because a golden
 * cast on an ally-blue body and on an enemy-red one reads differently.
 */
export const ULT_FLASH_PARAMS: readonly ParamSpec[] = [
  // The timeline owns this one; it re-times the whole clip rather than one phase of it.
  { key: "duration", label: "时长", name: "duration", min: 0.3, max: 10, step: 0.1, default: LOOP_SECONDS, unit: "s" },
  { key: "unitRadius", label: "单位半径", name: "unitRadius", min: 0.8, max: 1.5, step: 0.05, default: DEFAULT_UNIT_RADIUS, unit: "u" },
  { key: "starSize", label: "星核大小", name: "starSize", min: 0.2, max: 1.2, step: 0.02, default: 0.78, unit: "×" },
  { key: "spike", label: "十字芒长度", name: "spike", min: 0.8, max: 2.4, step: 0.05, default: 2.2, unit: "×" },
  { key: "ring", label: "光圈范围", name: "ring", min: 0.8, max: 2.6, step: 0.05, default: 2.3, unit: "×" },
  // The flash is white-hot in the middle; the hue only shows at the edges of the arms and the ring.
  { key: "hue", label: "光色色相", name: "hue", min: 0, max: 1, step: 0.01, default: 0.12 },
  { key: "saturation", label: "光色饱和度", name: "saturation", min: 0, max: 1, step: 0.05, default: 0.22 },
  // The body is the simulator's ally palette (#1a4a8f / #7be0ff); the flash never tints it.
  { key: "unitHue", label: "单位色相", name: "unitHue", min: 0, max: 1, step: 0.01, default: 0.6 },
  { key: "unitSaturation", label: "单位饱和度", name: "unitSaturation", min: 0, max: 1, step: 0.05, default: 0.82 },
];

export const meta: SceneExample = {
  id: "ult-flash",
  title: "大招闪光",
  description:
    "放大招那一下身上的闪光：先在角色身上聚起一个小十字，随后十字冲成四芒亮星、同时甩出一圈向外扩散的光环，等光圈走完星芒已经收回并退掉。星核是三层同心圆叠出来的白热中心，芒是从中心向外收尖的四片三角形，光环是一圈越散越细的描边。画面下方四行曲线是这一下的完整时序：星核亮度、十字芒长度、光圈半径与光圈亮度，播放头与上方的画面共用同一个时钟。",
  notes:
    "和受击闪白不同，这层光不染角色：单位盘照常画，闪光作为独立对象盖在它上面，所以它既能当大招起手的“点亮”，也不会把角色读成一团白。光芒用三角形而不是线段——线段是等宽的，一条等宽的光柱看着像棍子；三角形从中心向外收尖，读起来才是光。芒长走 `outCirc` 冲出去再收回，所以星是“收”没的，不只是淡掉。光圈半径用 `outCirc`（冲击波先快后慢），亮度按剩余生命平方退，否则它在外扩到最大的那一刻正好还剩下两成不透明度，看着像已经没了。",
  columns: [],
  implemented: true,
  family: "2d",
  hideGrid: false,
  view2d: ULT_VIEW,
  duration: LOOP_SECONDS,
  params: ULT_FLASH_PARAMS,
};
