/** Sidebar metadata for the `z-index` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "z-index",
  "The `zIndex` key that orders 2D shapes against each other and against text: a higher key is drawn later, so it covers a lower one.",
  "`zIndex` is not depth. Nothing in this layer writes the depth buffer, so the key only orders draw calls: 2D primitives and text sort into the same key space and one pass emits them key by key. Columns 1-3 hold the object layout fixed and change only the keys, so the first two columns prove the key decides the order rather than the recording order, and the third shows equal keys falling back to it. The bottom row uses the same four rules with text in place of the second shape; its last cell puts the label between two shapes, which a depth buffer cannot express without sorting. This page is a vgpu extension, not a Godot or bevy parity item.",
);
