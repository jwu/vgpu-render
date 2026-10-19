/**
 * Preview workspace: canvas, status, description, and the highlighted source.
 *
 * `#canvas` and `#counts` are kept as DOM ids because the capture harness reads
 * them over CDP.
 */

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DemoSnapshot } from "@/demo-engine";
import type { SourceToken } from "@/demo-source";
import { useHighlightedSource } from "@/demo-hooks";
import type { SceneSet } from "@examples/sets.js";

export type DemoWorkspaceProps = {
  readonly snapshot: DemoSnapshot;
  readonly sceneSet: SceneSet;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

const TOKEN_CLASS: Readonly<Record<SourceToken["kind"], string>> = {
  plain: "",
  comment: "token-comment",
  string: "token-string",
  number: "token-number",
  boolean: "token-boolean",
  keyword: "token-keyword",
  property: "token-property",
  function: "token-function",
};

function SourcePreview({ sceneSetId, exampleId }: { readonly sceneSetId: string; readonly exampleId: string }) {
  const tokens = useHighlightedSource(sceneSetId, exampleId);
  return (
    <pre id="example-code" className="code">
      <code>
        {tokens.map((token, index) => (
          <span key={index} className={TOKEN_CLASS[token.kind]}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}

export function DemoWorkspace({ snapshot, sceneSet, canvasRef }: DemoWorkspaceProps) {
  const { selected, status, statusDetail, counts } = snapshot;
  const description = selected.notes ? `${selected.description} — ${selected.notes}` : selected.description;
  // The battle pages add a timeline on top of the 2D camera, so their hint mentions both.
  const hint = sceneSet.id === "vfx"
    ? "拖拽/WASD 平移 · 滚轮缩放 · 时间轴可拖拽"
    : selected.family === "2d"
      ? "拖拽/WASD 平移 · Shift 加速 · 滚轮缩放"
      : "拖拽旋转 · 滚轮缩放";

  return (
    <section className="workspace" aria-label="示例预览">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">{sceneSet.workspaceEyebrow}</div>
          <h1 id="example-title">{selected.title}</h1>
        </div>
        <div className="status-group">
          <Badge id="status" variant={status === "error" ? "destructive" : status === "ready" ? "secondary" : "outline"}>
            {statusDetail}
          </Badge>
        </div>
      </header>
      <p id="example-description" className="description">
        {description}
      </p>
      <div className="preview-frame">
        <canvas id="canvas" ref={canvasRef} />
      </div>
      <section className="details" aria-live="polite">
        <div className="details-heading">
          <div>
            <div id="example-family" className="eyebrow">
              源码 · source code
            </div>
            <span id="counts" className="counts">
              {counts}
            </span>
          </div>
          <span className="hint">{hint}</span>
        </div>
        <Separator />
        <SourcePreview sceneSetId={sceneSet.id} exampleId={selected.id} />
      </section>
    </section>
  );
}
