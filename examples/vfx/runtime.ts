/**
 * Dispatches a battle effect id to its page.
 *
 * The battle pages are `world2d` scenes on a timeline, so the context carries the loop time and the
 * page's resolved parameters instead of the gallery's 3D scaffolding. Resolution happens here, once
 * per frame, so a page always receives every key its `ParamSpec[]` declares.
 */

import type { FrameDrawList, LineJoint } from "../../src/frame-draw-list.js";
import { DEFAULT_VIEWPORT, type Viewport2D } from "../shared/scene-context.js";
import type { EffectParams } from "../shared/meta.js";
import type { VfxSceneContext } from "./scene-context.js";
import { defaultParams, paramsFor } from "./params.js";
import { VFX_EXAMPLES } from "./registry.js";
import { draw as healBeam } from "./heal-beam/scene.js";
import { draw as fireball } from "./fireball/scene.js";
import { draw as chainLightning } from "./chain-lightning/scene.js";
import { draw as dashSlash } from "./dash-slash/scene.js";
import { draw as slashArc } from "./slash-arc/scene.js";
import { draw as battleSlash } from "./battle-slash/scene.js";
import { draw as hitMark } from "./hit-mark/scene.js";
import { draw as hitFlash } from "./hit-flash/scene.js";
import { draw as hitShake } from "./hit-shake/scene.js";
import { draw as healthBar } from "./health-bar/scene.js";
import { draw as lightPillar } from "./light-pillar/scene.js";
import { draw as ultFlash } from "./ult-flash/scene.js";

const PAGES: Readonly<Record<string, (drawList: FrameDrawList, context: VfxSceneContext) => void>> = {
  "heal-beam": healBeam,
  "fireball": fireball,
  "chain-lightning": chainLightning,
  "dash-slash": dashSlash,
  "slash-arc": slashArc,
  "battle-slash": battleSlash,
  "hit-mark": hitMark,
  "hit-flash": hitFlash,
  "hit-shake": hitShake,
  "health-bar": healthBar,
  "light-pillar": lightPillar,
  "ult-flash": ultFlash,
};

export const VFX_SCENE_IDS: readonly string[] = Object.keys(PAGES);

/** The parameter specs one page declares, or an empty list for an id this set does not know. */
export function vfxParamSpecs(id: string) {
  return VFX_EXAMPLES.find((example) => example.id === id)?.params ?? [];
}

/** The values an effect opens with, straight from its specs. */
export function defaultVfxParams(id: string): EffectParams {
  return defaultParams(vfxParamSpecs(id));
}

/**
 * Draws one battle effect. `lineJoint` is accepted for signature parity with the basic dispatcher
 * (the 2D layer picks its own joins per strip) and ignored; `params` is optional so a caller
 * without a parameter panel still gets the authored defaults.
 */
export function buildVfxScene(
  id: string,
  drawList: FrameDrawList,
  time: number,
  lineJoint?: LineJoint,
  viewport: Viewport2D = DEFAULT_VIEWPORT,
  params?: EffectParams,
): void {
  void lineJoint;
  const page = PAGES[id];
  if (page === undefined) return;
  page(drawList, { time, viewport, params: paramsFor(vfxParamSpecs(id), params) });
}
