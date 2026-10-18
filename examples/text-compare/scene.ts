/**
 * `text-compare`: one sentence across glyph sources and font sizes, in world space.
 */

import type { FrameDrawList } from "../../src/frame-draw-list.js";
import type { SceneContext } from "../shared/scene-context.js";


/**
 * Encoding, raster-scale and placement matrix.
 *
 * Not a reference port — the addon has no text API, so this is vgpu's own capability.
 * Two matrices share one view, because the
 * placement space changes how much of an encoding's quality survives:
 *
 * - a **world-billboard** matrix, six glyph sources by three font sizes — the full encoding axis,
 *   drawn facing the camera;
 * - a **world-plane** matrix, the same three font sizes under three representative sources, drawn on
 *   a fixed plane so it foreshortens as the camera orbits.
 *
 * The layout follows the line/circle matrices: one axis enumerates the variants and the other the
 * values, and every cell is a sample. It is **transposed** relative to those scenes because text
 * grows sideways — six source columns would be wider than any camera wants to frame. So reading down
 * a column compares encodings at one size, and reading across a row compares sizes under one encoding.
 *
 * Every row floats above the grid plane. The grid is a full-screen translucent plane that writes
 * depth to match the reference, so a block crossing `y = 0` would be clipped along the grid lines.
 */
export function draw(drawList: FrameDrawList, context: SceneContext): void {
  const sizes = [16, 24, 36];
  const pixelSize = 0.022;
  const sample = "Handgloves";

  const groups: readonly {
    readonly space: "world-plane" | "world-billboard";
    readonly title: string;
    readonly labelX: number;
    readonly columnX: readonly number[];
    readonly firstRowY: number;
    readonly rows: readonly (readonly [source: string, label: string])[];
  }[] = [
    {
      space: "world-billboard",
      title: "world-billboard",
      labelX: -0.6,
      columnX: [0, 5.0, 10.0],
      firstRowY: 10.4,
      rows: [
        ["bitmap", "bitmap 1x"],
        ["bitmap4x", "bitmap 4x"],
        ["sdf", "sdf 1x"],
        ["sdf4x", "sdf 4x"],
        ["msdf", "msdf outline"],
        ["baked", "msdf baked"],
      ],
    },
    {
      space: "world-plane",
      title: "world-plane",
      // Side by side rather than stacked, with a wide gutter: the camera frames the matrix by width and
      // height together, so a wide, short layout leaves room for the rows to breathe, and the gutter
      // keeps the leaning plane group from sweeping back through the billboard one. The rows match the
      // billboard group one for one, so a row can be read across both spaces.
      labelX: 26.0,
      columnX: [26.6, 31.6, 36.6],
      firstRowY: 10.4,
      rows: [
        ["bitmap", "bitmap 1x"],
        ["bitmap4x", "bitmap 4x"],
        ["sdf", "sdf 1x"],
        ["sdf4x", "sdf 4x"],
        ["msdf", "msdf outline"],
        ["baked", "msdf baked"],
      ],
    },
  ];
  // Height costs framing distance just as width does, so the rows stay as tight as they can while still
  // clearing one another. Screen size of the glyphs is set by how much of the bounds the matrix fills,
  // and scaling the whole thing does not change that — only drawing less of it would.
  const rowStep = 1.45;
  const titleY = 12.2;

  for (const group of groups) {
    drawList.text([group.labelX - 5.6, titleY, 0], group.title, {
      fontSize: 24,
      pixelSize,
      space: "world-billboard",
      source: "baked",
      anchor: "center-right",
      color: [1, 0.85, 0.4, 1],
    });
    for (let column = 0; column < sizes.length; column++) {
      drawList.text([group.columnX[column]!, titleY, 0], `${sizes[column]}px`, {
        fontSize: 22,
        pixelSize,
        space: "world-billboard",
        source: "baked",
        anchor: "top-left",
        color: [0.6, 0.8, 1, 1],
      });
    }

    for (let row = 0; row < group.rows.length; row++) {
      const [source, label] = group.rows[row]!;
      const y = group.firstRowY - row * rowStep;
      // The row label always faces the camera so the row stays identifiable, and only the samples
      // follow the space under test. It is drawn by its own source, so the label column doubles as a
      // sample.
      drawList.text([group.labelX, y, 0], label, {
        fontSize: 20,
        pixelSize,
        space: "world-billboard",
        source,
        anchor: "center-right",
        color: [1, 1, 1, 1],
      });
      for (let column = 0; column < sizes.length; column++) {
        drawList.text([group.columnX[column]!, y, 0], sample, {
          fontSize: sizes[column]!,
          pixelSize,
          space: group.space,
          source,
          anchor: "center-left",
          color: [1, 1, 1, 1],
        });
      }
    }
  }
}
