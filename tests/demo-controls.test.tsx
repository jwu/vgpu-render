/**
 * The grid panel follows `displayMode`: line-only fields disappear in `dots`, dot-only fields in
 * `grid`, while the shared `cellSize` and the 3D plane fades stay in every mode. The panel is
 * rendered through `react-dom/server`, so the test reads the same JSX the sidebar mounts.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DemoControls } from "../gallery/components/demo-controls.js";
import { parseDemoConfig, type GridDisplayMode } from "../gallery/demo-config.js";
import type { ControlHandlers } from "../gallery/demo-hooks.js";

const noopHandlers: ControlHandlers = {
  onAnimateChange: () => {},
  onShowGridChange: () => {},
  onLineWidthScaleChange: () => {},
  onGridOpacityChange: () => {},
  onProjectionChange: () => {},
  onLineJointChange: () => {},
  onCameraPresetChange: () => {},
  onBackgroundChange: () => {},
  onGridOptionsChange: () => {},
  onGridLineColorChange: () => {},
  onReset: () => {},
};

function controlIds(displayMode: GridDisplayMode, mode: "3d" | "2d" = "3d"): ReadonlySet<string> {
  const config = parseDemoConfig({ camera: { mode }, grid: { displayMode } });
  const html = renderToStaticMarkup(<DemoControls config={config} handlers={noopHandlers} />);
  return new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]!));
}

const LINE_FIELDS = ["grid-line-width", "grid-lod-finer", "grid-lod-total", "grid-thin-color", "grid-thick-color"] as const;
const DOT_FIELDS = ["grid-dot-radius", "grid-dot-fade-from", "grid-dot-fade-to", "grid-dot-spacing-factor", "grid-dot-color"] as const;
const SHARED_FIELDS = ["grid-display-mode", "grid-cell-size", "grid-size", "grid-edge-start", "grid-grazing-end", "grid-center-fade-lines"] as const;

describe("grid panel follows the display mode", () => {
  test("grid keeps the line fields and hides the lattice ones", () => {
    const ids = controlIds("grid");
    for (const id of [...LINE_FIELDS, ...SHARED_FIELDS]) expect(ids.has(id), id).toBe(true);
    for (const id of DOT_FIELDS) expect(ids.has(id), id).toBe(false);
  });

  test("dots hides the line fields but keeps the shared plane fades", () => {
    const ids = controlIds("dots");
    for (const id of DOT_FIELDS) expect(ids.has(id), id).toBe(true);
    for (const id of SHARED_FIELDS) expect(ids.has(id), id).toBe(true);
    for (const id of LINE_FIELDS) expect(ids.has(id), id).toBe(false);
  });

  test("2D pages swap the 3D-only fields for the minimum pixel spacing", () => {
    const lines = controlIds("grid", "2d");
    expect(lines.has("grid-min-pixels")).toBe(true);
    expect(lines.has("grid-size")).toBe(false);
    expect(lines.has("grid-edge-start")).toBe(false);

    const dots = controlIds("dots", "2d");
    expect(dots.has("grid-dot-radius")).toBe(true);
    for (const id of LINE_FIELDS) expect(dots.has(id), id).toBe(false);
  });
});
