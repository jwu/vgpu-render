/**
 * Gallery shell.
 *
 * Creates the engine once, wires the canvas into a ref, and renders the three
 * column layout (examples · workspace · controls) that the page has always had.
 */

import { useEffect, useRef } from "react";
import { DemoControls } from "@/components/demo-controls";
import { DemoExampleList } from "@/components/demo-example-list";
import { DemoWorkspace } from "@/components/demo-workspace";import type { DemoEngine } from "@/demo-engine";
import { useControlHandlers, useEngineSnapshot, useExamples } from "@/demo-hooks";

export function DemoApp({ engine }: { readonly engine: DemoEngine }) {
  const snapshot = useEngineSnapshot(engine);
  const examples = useExamples();
  const handlers = useControlHandlers(engine);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    void engine.start(canvas);
    return () => engine.destroy();
  }, [engine]);

  return (
    <div className="app-shell">
      <DemoExampleList
        examples={examples}
        selectedId={snapshot.selected.id}
        onSelect={(example) => engine.selectExample(example)}
      />
      <DemoWorkspace snapshot={snapshot} canvasRef={canvasRef} />
      <DemoControls config={snapshot.config} handlers={handlers} />
    </div>
  );
}
