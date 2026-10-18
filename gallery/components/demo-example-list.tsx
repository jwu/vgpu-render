/**
 * Example picker sidebar.
 *
 * The list is rendered from `SCENE_EXAMPLES`; selection is written back through
 * the engine so the URL hash stays the single source of truth. Entries are grouped
 * by capability: 3D graphics, 2D graphics and text drive different cameras and
 * different layers, so one flat list would hide that.
 */

import { useState } from "react";
import type { SceneExample } from "@examples/registry.js";

export type DemoExampleListProps = {
  readonly examples: readonly SceneExample[];
  readonly selectedId: string;
  readonly onSelect: (example: SceneExample) => void;
};

const FAMILIES: readonly { readonly id: string; readonly title: string; readonly matches: (example: SceneExample) => boolean }[] = [
  { id: "3d", title: "3D Graphics", matches: (example) => (example.group ?? example.family ?? "3d") === "3d" },
  { id: "2d", title: "2D Graphics", matches: (example) => (example.group ?? example.family ?? "3d") === "2d" },
  { id: "text", title: "Text", matches: (example) => example.group === "text" },
];

export function DemoExampleList({ examples, selectedId, onSelect }: DemoExampleListProps) {
  // Each family folds independently; the 3D list alone is long enough that collapsing 2D or text
  // saves a lot of scrolling.
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  const toggle = (id: string): void =>
    setCollapsed((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  return (
    <aside className="sidebar sidebar-examples">
      <header className="sidebar-header">
        <div className="brand">
          vgpu-render <span>示例</span>
        </div>
        <div className="eyebrow">3D 调试绘制管线</div>
      </header>
      <nav id="example-list" className="example-list" aria-label="示例列表">
        {FAMILIES.map((family) => {
          const entries = examples.filter(family.matches);
          if (entries.length === 0) return null;
          const folded = collapsed.includes(family.id);
          const entriesId = `example-group-${family.id}`;
          return (
            <div key={family.id} className="example-group" data-collapsed={folded ? "true" : "false"}>
              <button
                type="button"
                className="example-group-toggle"
                aria-expanded={!folded}
                aria-controls={entriesId}
                onClick={() => toggle(family.id)}
              >
                <span className="eyebrow example-group-title">{family.title}</span>
                <span className="example-group-chevron" aria-hidden="true">
                  ▾
                </span>
              </button>
              <div id={entriesId} className="example-group-entries" hidden={folded}>
                {entries.map((example) => {
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
              </div>
            </div>
          );
        })}
      </nav>
      <footer className="sidebar-footer">WebGPU · vgpu · WGSL</footer>
    </aside>
  );
}
