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

export type DemoWorkspaceProps = {
  readonly snapshot: DemoSnapshot;
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

function SourcePreview({ exampleId }: { readonly exampleId: string }) {
  const tokens = useHighlightedSource(exampleId);
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

export function DemoWorkspace({ snapshot, canvasRef }: DemoWorkspaceProps) {
  const { selected, status, statusDetail, counts } = snapshot;
  const description = selected.notes ? `${selected.description} — ${selected.notes}` : selected.description;
  const hint = selected.family === "2d" ? "拖拽平移 · 滚轮缩放" : "拖拽旋转 · 滚轮缩放";

  return (
    <section className="workspace" aria-label="示例预览">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">交互示例 · interactive example</div>
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
              源码预览 · source preview
            </div>
            <span id="counts" className="counts">
              {counts}
            </span>
          </div>
          <span className="hint">{hint}</span>
        </div>
        <Separator />
        <SourcePreview exampleId={selected.id} />
      </section>
    </section>
  );
}
