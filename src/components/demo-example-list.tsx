/**
 * Example picker sidebar.
 *
 * The list is rendered from `GODOT_EXAMPLES`; selection is written back through
 * the engine so the URL hash stays the single source of truth.
 */

import type { GodotExample } from "@/godot-examples.js";

export type DemoExampleListProps = {
  readonly examples: readonly GodotExample[];
  readonly selectedId: string;
  readonly onSelect: (example: GodotExample) => void;
};

export function DemoExampleList({ examples, selectedId, onSelect }: DemoExampleListProps) {
  return (
    <aside className="sidebar sidebar-examples">
      <header className="sidebar-header">
        <div className="brand">
          vgpu-render <span>示例</span>
        </div>
        <div className="eyebrow">3D 调试绘制管线</div>
      </header>
      <nav id="example-list" className="example-list" aria-label="示例列表">
        {examples.map((example) => {
          const active = example.id === selectedId;
          return (
            <button
              key={example.id}
              type="button"
              className="example-button"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(example)}
            >
              <strong>{example.title}</strong>
            </button>
          );
        })}
      </nav>
      <footer className="sidebar-footer">WebGPU · vgpu · WGSL</footer>
    </aside>
  );
}
