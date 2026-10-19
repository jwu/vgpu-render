/**
 * Examples gallery entry point.
 *
 * Boots React, resolves the initial config from the URL and storage, and mounts
 * the shell around the imperative {@link DemoEngine}.
 *
 * `?page=vfx` opens the battle-effects set instead of the basic gallery. Both pages share this
 * entry (and the one WebGPU device): the switcher inside the shell calls `switchSceneSet`, which
 * only swaps the registry, storage record and camera.
 */

import { createRoot } from "react-dom/client";
import { BattleParamStore } from "@/battle-params";
import { DemoApp } from "@/components/demo-app";
import { cameraPoseFor, DemoEngine, displayOverridesFrom, resolveInitialConfig } from "@/demo-engine";
import { sceneSetFromId } from "@examples/sets.js";
import "./index.css";
import "./demo.css";

const params = new URLSearchParams(location.search);
const compareMode = params.get("compare") === "1";
// A named `?camera=` pose is pinned: example switches must not re-frame it (see `cameraPoseFor`).
const autoFrame = !compareMode && cameraPoseFor(params.get("camera")) === undefined;
// The scene set is part of the address, so a shared link reopens the same page.
const sceneSet = sceneSetFromId(params.get("page"));
if (compareMode) document.documentElement.classList.add("compare-mode");

/** Storage can be unavailable (private mode, blocked cookies); callers fall back to URL-only config. */
function galleryStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Effect parameters for the battle page; the basic gallery never reads them. */
const parameters = new BattleParamStore({ storage: galleryStorage() });

/** The battle page keeps its grid as a ground reference, dimmed behind the effect. */
const displayDefaults = sceneSet.id === "vfx" ? { gridOpacity: 0.45 } : undefined;

function createEngine(): DemoEngine {
  const storage = galleryStorage();
  // URL-pinned display fields are handed to the engine too, so an example switch
  // cannot overwrite them with a stored record.
  try {
    return new DemoEngine({
      compareMode,
      sceneSet,
      sceneParams: () => parameters.current(),
      config: resolveInitialConfig(compareMode, params, storage ?? undefined, sceneSet.storageKeys.config),
      autoFrame,
      displayOverrides: displayOverridesFrom(params),
      displayDefaults,
    });
  } catch (error) {
    document.documentElement.dataset.configError = error instanceof Error ? error.message : String(error);
    return new DemoEngine({
      compareMode,
      sceneSet,
      sceneParams: () => parameters.current(),
      config: resolveInitialConfig(compareMode, params, undefined, sceneSet.storageKeys.config),
      autoFrame,
      displayOverrides: displayOverridesFrom(params),
      displayDefaults,
    });
  }
}

const engine = createEngine();
// Resolve `?scene=` / `#hash` before the first render so the initial snapshot is final.
engine.selectInitialFromLocation(params);

const container = document.querySelector<HTMLDivElement>("#root");
if (container === null) throw new Error("#root container is missing from index.html");

// No StrictMode: its double effect invocation would boot WebGPU twice and leak
// the first surface, since the engine holds the device for the page lifetime.
createRoot(container).render(<DemoApp engine={engine} params={parameters} />);
