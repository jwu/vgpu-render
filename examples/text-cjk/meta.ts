/** Sidebar metadata for the `text-cjk` page. */

import type { SceneExample } from "../shared/meta.js";
import { column } from "../shared/meta.js";

export const meta: SceneExample = { id: "text-cjk", title: "Text CJK", description: "Wrapping per character, kinsoku, mixed scripts and four sizes.", notes: "Not a reference port. CJK has no spaces to break at, so the layout breaks between characters and applies kinsoku: a closing mark never opens a line and an opening bracket never ends one, and the narrow column is tuned so those rules have to act. The family is the bundled latin face, and the canvas falls back to a system CJK face for the ideographs — the same arrangement a system font fallback provides.", implemented: true, group: "text", hideGrid: true, columns: [column("rule", ["per character", "kinsoku", "mixed script"]), column("sizes", ["12 px", "18 px", "28 px", "48 px"])] };
