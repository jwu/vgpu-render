/**
 * React bindings for the imperative demo engine.
 *
 * The engine owns all mutable render state; React subscribes to its snapshot so
 * the animation loop never re-renders the chrome.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { CameraPreset, DemoConfig, DemoGridConfig, LineJoint, ProjectionMode } from "./demo-config.js";
import { backgroundToHex, type DemoEngine } from "./demo-engine.js";
import type { SceneExample } from "../examples/registry.js";
import { SCENE_EXAMPLES } from "../examples/registry.js";
import { sourceForExample, tokenizeSource, type SourceToken } from "./demo-source.js";

/** Every page module, keyed by its path, with the preview sources already scrubbed. */
const SCENE_SOURCES = import.meta.glob("../examples/*/scene.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Readonly<Record<string, string>>;

/** `world_space_width` uses an underscore id but a hyphenated directory. */
const pageSource = (id: string): string => SCENE_SOURCES[`../examples/${id.replaceAll("_", "-")}/scene.ts`] ?? "";

export function useEngineSnapshot(engine: DemoEngine) {
  const subscribe = useCallback((listener: () => void) => engine.subscribe(listener), [engine]);
  return useSyncExternalStore(subscribe, () => engine.snapshot(), () => engine.snapshot());
}

export function useExamples(): readonly SceneExample[] {
  return SCENE_EXAMPLES;
}

export function useHighlightedSource(exampleId: string): readonly SourceToken[] {
  return useMemo(() => tokenizeSource(sourceForExample(pageSource(exampleId))), [exampleId]);
}

export type ControlHandlers = {
  readonly onAnimateChange: (value: boolean) => void;
  readonly onShowGridChange: (value: boolean) => void;
  readonly onLineWidthScaleChange: (value: number) => void;
  readonly onGridOpacityChange: (value: number) => void;
  readonly onProjectionChange: (value: ProjectionMode) => void;
  readonly onLineJointChange: (value: LineJoint) => void;
  readonly onCameraPresetChange: (value: CameraPreset) => void;
  readonly onBackgroundChange: (value: string) => void;
  readonly onGridOptionsChange: (patch: Partial<DemoGridConfig>) => void;
  readonly onGridLineColorChange: (target: "thin" | "thick" | "dot", hex: string) => void;
  readonly onReset: () => void;
};

/** Builds the control callbacks once so control components keep stable props. */
export function useControlHandlers(engine: DemoEngine): ControlHandlers {
  return useMemo(
    () => ({
      onAnimateChange: (value: boolean) => engine.setAnimate(value),
      onShowGridChange: (value: boolean) => engine.setShowGrid(value),
      onLineWidthScaleChange: (value: number) => engine.setLineWidthScale(value),
      onGridOpacityChange: (value: number) => engine.setGridOpacity(value),
      onProjectionChange: (value: ProjectionMode) => engine.setProjection(value),
      onLineJointChange: (value: LineJoint) => engine.setLineJoint(value),
      onCameraPresetChange: (value: CameraPreset) => engine.setCameraPreset(value),
      onBackgroundChange: (value: string) => engine.setBackgroundHex(value),
      onGridOptionsChange: (patch: Partial<DemoGridConfig>) => engine.setGridOptions(patch),
      onGridLineColorChange: (target: "thin" | "thick" | "dot", hex: string) => engine.setGridLineColor(target, hex),
      onReset: () => engine.resetConfig(),
    }),
    [engine],
  );
}

export function backgroundHex(config: DemoConfig): string {
  return backgroundToHex(config.view.background);
}

/** Renders an RGBA 0-1 line color as a `#rrggbb` input value. */
export function gridColorToHex(color: readonly number[]): string {
  return backgroundToHex(color);
}
