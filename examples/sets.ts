/**
 * The two scene sets the gallery serves.
 *
 * `basic` is the API / parity gallery every page in `examples/basic/` belongs to; `vfx` is the
 * battle-effects page in `examples/vfx/`. They are separate sets rather than one list with a flag
 * because they differ in every dimension the shell cares about: their sidebars, their storage
 * records, their camera (the battle page is `world2d` on a loop timeline) and their parameters.
 */

import type { FrameDrawList, LineJoint } from "../src/frame-draw-list.js";
import type { EffectParams, SceneExample } from "./shared/meta.js";
import type { Viewport2D } from "./shared/scene-context.js";
import { SCENE_EXAMPLES } from "./basic/registry.js";
import { buildScene } from "./basic/runtime.js";
import { VFX_EXAMPLES } from "./vfx/registry.js";
import { buildVfxScene, defaultVfxParams } from "./vfx/runtime.js";

export type SceneSetId = "basic" | "vfx";

/** One sidebar group. The shell renders the groups; the set decides which pages fall into them. */
export type SceneFamily = {
  readonly id: string;
  readonly title: string;
  readonly matches: (example: SceneExample) => boolean;
};

/**
 * Dispatches one frame of one page.
 *
 * `params` is the battle page's effect parameters; the basic pages ignore it and read the same
 * signature so the engine can hold both sets behind one type.
 */
export type SceneBuilder = (
  id: string,
  drawList: FrameDrawList,
  time: number,
  lineJoint?: LineJoint,
  viewport?: Viewport2D,
  params?: EffectParams,
) => void;

export type SceneSet = {
  readonly id: SceneSetId;
  /** Text of the page switcher tab. */
  readonly label: string;
  /** Sidebar brand line and its secondary label. */
  readonly brand: string;
  readonly eyebrow: string;
  readonly footer: string;
  /** Workspace eyebrow + hint, so each page describes what its camera does. */
  readonly workspaceEyebrow: string;
  readonly examples: readonly SceneExample[];
  readonly families: readonly SceneFamily[];
  readonly buildScene: SceneBuilder;
  /**
   * Storage keys for this set's config and per-page display records.
   *
   * The basic keys must stay identical to `DEMO_CONFIG_KEY` / `DEMO_DISPLAY_CONFIG_KEY` in
   * `gallery/demo-config.ts`: they are what every existing visitor's saved layout lives under.
   * `tests/scene-sets.test.ts` pins the two pairs together so they cannot drift.
   */
  readonly storageKeys: { readonly config: string; readonly display: string };
  /** Starting parameters for one page of this set. */
  readonly paramsFor: (id: string) => EffectParams;
};

const groupOf = (example: SceneExample): string => example.group ?? example.family ?? "3d";

const BASIC_FAMILIES: readonly SceneFamily[] = [
  { id: "3d", title: "3D Graphics", matches: (example) => groupOf(example) === "3d" },
  { id: "2d", title: "2D Graphics", matches: (example) => groupOf(example) === "2d" },
  { id: "text", title: "Text", matches: (example) => example.group === "text" },
];

/**
 * The hit-feedback pages: two strikes, the mark one leaves and the flash on the frame it lands.
 *
 * They are grouped apart from the full clips because they answer a different question. Each is one
 * instant drawn across the easing matrix, so the only variable between two cells is the curve; a
 * case-study page is a whole cast — a windup, the effect and its aftermath — on one timeline.
 */
const GAME_FEEL_IDS: readonly string[] = ["hit-mark", "hit-flash", "slash-arc", "battle-slash"];

const VFX_FAMILIES: readonly SceneFamily[] = [
  { id: "game-feel", title: "Game Feel", matches: (example) => GAME_FEEL_IDS.includes(example.id) },
  { id: "case-study", title: "真实案例", matches: (example) => !GAME_FEEL_IDS.includes(example.id) },
];

/** The basic API / parity gallery: the page the project has always served at `/`. */
export const BASIC_SCENE_SET: SceneSet = {
  id: "basic",
  label: "基础示例",
  brand: "vgpu-render",
  eyebrow: "3D 调试绘制管线",
  footer: "WebGPU · vgpu · WGSL",
  workspaceEyebrow: "交互示例 · interactive example",
  examples: SCENE_EXAMPLES,
  families: BASIC_FAMILIES,
  buildScene,
  storageKeys: {
    config: "vgpu-render:demo-config",
    display: "vgpu-render:display-configs",
  },
  paramsFor: () => ({}),
};

/** The battle-effects page: `world2d` scenes staged on a loop timeline. */
export const VFX_SCENE_SET: SceneSet = {
  id: "vfx",
  label: "战斗特效",
  brand: "vgpu-render",
  eyebrow: "游戏战斗特效 · battle VFX",
  footer: "WebGPU · vgpu · WGSL",
  workspaceEyebrow: "战斗特效 · battle effect",
  examples: VFX_EXAMPLES,
  families: VFX_FAMILIES,
  buildScene: buildVfxScene,
  storageKeys: {
    config: "vgpu-render:vfx-config",
    display: "vgpu-render:vfx-display-configs",
  },
  paramsFor: defaultVfxParams,
};

export const SCENE_SETS: readonly SceneSet[] = [BASIC_SCENE_SET, VFX_SCENE_SET];

/** Resolves a set id from a URL parameter, falling back to the basic gallery. */
export function sceneSetFromId(id: string | null | undefined): SceneSet {
  return SCENE_SETS.find((set) => set.id === id) ?? BASIC_SCENE_SET;
}
