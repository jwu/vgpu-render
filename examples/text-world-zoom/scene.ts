/**
 * `text-world-zoom`: rows meant to be magnified.
 *
 * Screen-space text cannot be magnified: its pixel size is fixed, so a bigger block is simply a
 * request for a new rasterisation. World-space text is where the camera does the magnifying, which is
 * the only honest test of what a raster does past its own size — a coverage source runs into the
 * texels it stored, a distance field keeps rebuilding the edge from them. The whole page is world
 * space, captions included, so the framing sees one coordinate system.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";
import { ACCENT, HINT, INK, LABEL, WORD } from "../shared/text-page.js";

export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const rows: readonly (readonly [source: string, label: string])[] = [
    ["bitmap", "bitmap 1×"],
    ["bitmap4x", "bitmap 4×"],
    ["sdf4x", "sdf 4×"],
    ["baked", "msdf baked"],
  ];
  const pixelSize = 0.02;
  for (let index = 0; index < rows.length; index++) {
    const [source, label] = rows[index]!;
    // Above `y = 0` with room to spare: the grid writes depth, so a row that dips below the plane
    // gets clipped along its lines. The lowest row's ink box still starts well above it.
    const y = 3.6 - index * 0.9;
    drawList.text([-2.05, y, 0], label, {
      fontSize: 12,
      pixelSize: 0.012,
      space: "world-billboard",
      anchor: "center-right",
      color: index === 2 ? ACCENT : LABEL,
    });
    drawList.text([-1.95, y, 0], WORD, {
      fontSize: 30,
      pixelSize,
      space: "world-billboard",
      anchor: "center-left",
      color: INK,
      source,
    });
  }

  drawList.text([-1.95, 0.15, 0], "scroll to magnify", {
    fontSize: 13,
    pixelSize: 0.012,
    space: "world-billboard",
    anchor: "top-left",
    color: HINT,
  });
}
