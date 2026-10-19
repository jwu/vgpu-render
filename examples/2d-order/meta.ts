/** Sidebar metadata for the `2d-order` page. */

import type { SceneExample } from "../shared/meta.js";
import { page2D } from "../shared/meta.js";

export const meta: SceneExample = page2D(
  "2d-order",
  "The `zIndex` layering key shared by 2D primitives and text: a higher key is drawn later and covers a lower one.",
  "`zIndex` is not depth. Nothing in this layer writes the depth buffer, so the key only orders draw calls: 2D primitives and text sort into the same key space, and one pass emits them key by key. Equal keys keep the pre-`zIndex` order — 2D first, then text — so an unannotated frame renders exactly as before. This page is a vgpu extension, not a Godot or bevy parity item.",
);
