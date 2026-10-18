/** Sidebar metadata for the `2d-fill` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
    "2d-fill",
    "Filled shapes with their parameters as rows: rotation, sweep, side count and capsule length.",
    "Where `2d-shapes` shows one primitive per column at fixed parameters, this page varies one parameter down each column. Rotation is anticlockwise in world2d; a sector and a segment share the angle pair but differ in what they enclose.",
  );
