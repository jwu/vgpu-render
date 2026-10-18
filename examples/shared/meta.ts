/**
 * Shared metadata helpers for the example registry.
 *
 * A page's `meta.ts` owns its title, description and sidebar columns; this module
 * holds the types and the helpers that derive columns from the same label tables
 * the scene draws from.
 */

import { SCENE_LABELS } from "./labels-3d.js";
import { LABELS_2D, page2DView } from "./2d-labels.js";

export type ExampleColumn = {
  readonly label: string;
  readonly samples: readonly string[];
  readonly implemented: boolean;
};

export type SceneExample = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly notes?: string;
  readonly columns: readonly ExampleColumn[];
  readonly implemented: boolean;
  /** Which camera drives the page: the gallery's 3D orbit camera by default, or the 2D pan/zoom one. */
  readonly family?: "2d" | "3d";
  /**
   * Sidebar grouping. Defaults to `family`, so the 2D pages land in "2D Graphics" and every 3D
   * page in "3D Graphics"; the text pages name "text" explicitly, since they use the 3D camera
   * without being 3D geometry pages.
   */
  readonly group?: "3d" | "2d" | "text";
  /**
   * World-space extent the 2D camera fits to this page, in `world2d` units. Only read when
   * `family` is "2d"; the page draws around the origin.
   */
  readonly view2d?: { readonly width: number; readonly height: number };
  /**
   * Hide the infinite grid while this example is selected.
   *
   * A screen-space page is its own content in pixel space, so the grid is a world-space reference
   * that can only cross it as diagonal lines, so those pages set `true`. A world-space page that
   * wants the grid as its ground plane says `false` explicitly; leaving the flag unset keeps whatever
   * the sidebar shows, which is what every other world-space example wants.
   */
  readonly hideGrid?: boolean;
};

// Columns whose reference variants are only approximated by this vgpu port are flagged false so the
// gallery never claims parity it does not have: grid boundary (`outer`) handling still differs.
const approximated = /outer/;

export const column = (label: string, samples: readonly string[]): ExampleColumn => ({
  label,
  samples,
  implemented: !approximated.test(label),
});

export const jointNote = "Round, bevel and miter joins are rebuilt in the vertex stage from the reference joint shaders.";

/** A gallery page's columns come from the same table the 3D scene draws its labels from. */
export const columnsOf = (id: string): readonly ExampleColumn[] =>
  (SCENE_LABELS[id]?.columns ?? []).map((entry) => column(entry.title, entry.samples));

/** A 2D matrix page's columns come from the same label table the page draws its labels from. */
export const columns2D = (id: string): readonly ExampleColumn[] =>
  (LABELS_2D[id]?.columns ?? []).map((entry) => column(entry.title, entry.samples));

/** One 2D matrix page: its camera extent is derived from the same table as its labels. */
export const page2D = (id: string, description: string, notes: string): SceneExample => {
  const labels = LABELS_2D[id];
  if (labels === undefined) throw new Error(`no 2D label table for "${id}"`);
  return {
    id,
    title: labels.title,
    description,
    notes,
    implemented: true,
    family: "2d",
    hideGrid: false,
    view2d: page2DView(id),
    columns: columns2D(id),
  };
};
