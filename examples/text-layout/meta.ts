/** Sidebar metadata for the `text-layout` page. */

import type { SceneExample } from "../shared/meta.js";
import { column } from "../shared/meta.js";

export const meta: SceneExample = { id: "text-layout", title: "Text Layout", description: "Wrapping, justification, bounds, line height, letter spacing and spans.", notes: "Not a reference port. The layout follows the documented wrapping and justification semantics, and `docs/text-reference.md` records how each capability is verified. Each row is one capability, labelled on the left, and every bounded row draws the box it wrapped into — a wrapping rule is unreadable without it.", implemented: true, group: "text", hideGrid: true, columns: [column("capability", ["word wrap", "character wrap", "justify", "line height", "letter spacing", "spans"]), column("option", ["lineBreak", "lineBreak", "justify", "lineHeight", "letterSpacing", "TextSpan"])] };
