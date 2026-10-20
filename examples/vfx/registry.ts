/**
 * The battle page registry.
 *
 * Same shape as `examples/basic/registry.ts`: every page owns its metadata in
 * `examples/vfx/<slug>/meta.ts`, and this module only fixes the order the sidebar shows.
 *
 * The order is grouped, not alphabetical: `sets.ts` splits the list into the hit-feedback pages and
 * the full battle cases, and each group reads in the order it builds up — one strike, then the mark
 * it leaves, then whole clips.
 */

import type { SceneExample } from "../shared/meta.js";
import { meta as hitMark } from "./hit-mark/meta.js";
import { meta as hitFlash } from "./hit-flash/meta.js";
import { meta as hitShake } from "./hit-shake/meta.js";
import { meta as healthBar } from "./health-bar/meta.js";
import { meta as slashArc } from "./slash-arc/meta.js";
import { meta as battleSlash } from "./battle-slash/meta.js";
import { meta as healBeam } from "./heal-beam/meta.js";
import { meta as fireball } from "./fireball/meta.js";
import { meta as chainLightning } from "./chain-lightning/meta.js";
import { meta as dashSlash } from "./dash-slash/meta.js";
import { meta as lightPillar } from "./light-pillar/meta.js";
import { meta as ultFlash } from "./ult-flash/meta.js";

export type { SceneExample } from "../shared/meta.js";

export const VFX_EXAMPLES: readonly SceneExample[] = [
  hitMark,
  hitFlash,
  hitShake,
  healthBar,
  slashArc,
  battleSlash,
  healBeam,
  fireball,
  chainLightning,
  dashSlash,
  lightPillar,
  ultFlash,
];
