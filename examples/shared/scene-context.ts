/**
 * What every example page receives besides its draw list.
 *
 * 2D pages read `viewport`, 3D pages read `lineJoint`, and text pages ignore
 * both; sharing one type keeps the page entry signature identical everywhere.
 */

import type { LineJoint } from "../../src/frame-draw-list.js";

export type Viewport2D = readonly [number, number];

/** Used when a caller has no viewport, e.g. a unit test building a frame. */
export const DEFAULT_VIEWPORT: Viewport2D = [1280, 720];

export type SceneContext = {
  readonly time: number;
  readonly viewport: Viewport2D;
  readonly lineJoint?: LineJoint;
};
