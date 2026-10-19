/**
 * Gallery shell.
 *
 * One shell serves both scene sets. The switcher swaps the registry inside the running engine —
 * the WebGPU device and render loop stay up — and the sidebar, workspace and control panels follow
 * the active set, so the basic gallery and the battle page stay independent without a reload.
 */

import { useEffect, useRef } from "react";
import { DemoControls } from "@/components/demo-controls";
import { DemoExampleList } from "@/components/demo-example-list";
import { DemoWorkspace } from "@/components/demo-workspace";
import { VfxControls } from "@/components/vfx-controls";
import type { BattleParamStore } from "@/battle-params";
import type { DemoEngine } from "@/demo-engine";
import { useControlHandlers, useEngineSnapshot } from "@/demo-hooks";
import { SCENE_SETS, sceneSetFromId, type SceneSet } from "@examples/sets.js";

function PageSwitcher({ current, onSelect }: { readonly current: SceneSet; readonly onSelect: (set: SceneSet) => void }) {
  return (
    <div className="page-switcher" role="tablist" aria-label="页面">
      {SCENE_SETS.map((set) => {
        const active = set.id === current.id;
        return (
          <button
            key={set.id}
            type="button"
            role="tab"
            className="page-tab"
            aria-selected={active}
            data-active={active ? "true" : "false"}
            onClick={() => onSelect(set)}
          >
            {set.label}
          </button>
        );
      })}
    </div>
  );
}

export type DemoAppProps = {
  readonly engine: DemoEngine;
  /** Effect parameter state; only the battle page reads it, the basic gallery leaves it untouched. */
  readonly params: BattleParamStore;
};

export function DemoApp({ engine, params }: DemoAppProps) {
  const snapshot = useEngineSnapshot(engine);
  const sceneSet = sceneSetFromId(snapshot.sceneSetId);
  const handlers = useControlHandlers(engine);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    void engine.start(canvas);
    return () => engine.destroy();
  }, [engine]);

  return (
    <div className="app-shell" data-page={sceneSet.id}>
      <PageSwitcher current={sceneSet} onSelect={(set) => engine.switchSceneSet(set)} />
      {/* Keyed by set: the fold state of one sidebar must not leak into the other. */}
      <DemoExampleList
        key={sceneSet.id}
        sceneSet={sceneSet}
        selectedId={snapshot.selected.id}
        onSelect={(example) => engine.selectExample(example)}
      />
      <DemoWorkspace snapshot={snapshot} sceneSet={sceneSet} canvasRef={canvasRef} />
      {sceneSet.id === "vfx" ? (
        <VfxControls config={snapshot.config} handlers={handlers} snapshot={snapshot} engine={engine} store={params} />
      ) : (
        <DemoControls config={snapshot.config} handlers={handlers} />
      )}
    </div>
  );
}
