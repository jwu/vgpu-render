/**
 * What a battle page receives besides its draw list.
 *
 * Battle pages are `world2d` content on a timeline, so they read the loop time and their own
 * resolved parameters. `viewport` stays in the context for pages that place `screen`-space HUD
 * overlays; a pure `world2d` page ignores it.
 */

import type { EffectParams } from "../shared/meta.js";
import type { Viewport2D } from "../shared/scene-context.js";

export type VfxSceneContext = {
  readonly time: number;
  readonly viewport: Viewport2D;
  /** Values resolved from the page's `ParamSpec[]`, already clamped to their ranges. */
  readonly params: EffectParams;
};
