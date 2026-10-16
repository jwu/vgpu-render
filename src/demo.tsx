/**
 * Examples gallery entry point.
 *
 * Boots React, resolves the initial config from the URL and storage, and mounts
 * the shell around the imperative {@link DemoEngine}.
 */

import { createRoot } from "react-dom/client";
import { DemoApp } from "@/components/demo-app";
import { cameraPoseFor, DemoEngine, displayOverridesFrom, resolveInitialConfig } from "@/demo-engine";
import "./index.css";
import "./demo.css";

const params = new URLSearchParams(location.search);
const compareMode = params.get("compare") === "1";
// A named `?camera=` pose is pinned: example switches must not re-frame it (see `cameraPoseFor`).
const autoFrame = !compareMode && cameraPoseFor(params.get("camera")) === undefined;
if (compareMode) document.documentElement.classList.add("compare-mode");

function createEngine(): DemoEngine {
  // Storage can be unavailable (private mode, blocked cookies); fall back to
  // URL-only configuration instead of failing the page.
  // URL-pinned display fields are handed to the engine too, so an example switch
  // cannot overwrite them with a stored record.
  try {
    return new DemoEngine({
      compareMode,
      config: resolveInitialConfig(compareMode, params, window.localStorage),
      autoFrame,
      displayOverrides: displayOverridesFrom(params),
    });
  } catch (error) {
    document.documentElement.dataset.configError = error instanceof Error ? error.message : String(error);
    return new DemoEngine({
      compareMode,
      config: resolveInitialConfig(compareMode, params),
      autoFrame,
      displayOverrides: displayOverridesFrom(params),
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
createRoot(container).render(<DemoApp engine={engine} />);
