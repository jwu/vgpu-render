/**
 * The battle page registry.
 *
 * Same shape as `examples/basic/registry.ts`: every page owns its metadata in
 * `examples/vfx/<slug>/meta.ts`, and this module only fixes the order the sidebar shows.
 */

import type { SceneExample } from "../shared/meta.js";
import { meta as healBeam } from "./heal-beam/meta.js";
import { meta as fireball } from "./fireball/meta.js";
import { meta as slashArc } from "./slash-arc/meta.js";
import { meta as battleSlash } from "./battle-slash/meta.js";
import { meta as hitMark } from "./hit-mark/meta.js";
import { meta as hitFlash } from "./hit-flash/meta.js";
import { meta as pillarAppear } from "./pillar-appear/meta.js";
import { meta as pillarFade } from "./pillar-fade/meta.js";

export type { SceneExample } from "../shared/meta.js";

export const VFX_EXAMPLES: readonly SceneExample[] = [
  healBeam,
  fireball,
  slashArc,
  battleSlash,
  hitMark,
  hitFlash,
  pillarAppear,
  pillarFade,
];
