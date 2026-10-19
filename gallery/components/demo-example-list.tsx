/**
 * Example picker sidebar.
 *
 * The list is rendered from the active scene set: `sceneSet.families` decides the groups and
 * `sceneSet.examples` the entries, so the basic gallery keeps its 3D / 2D / text split while the
 * battle page shows its own single group. Selection is written back through the engine so the URL
 * hash stays the single source of truth.
 */

import { useState } from "react";
import type { SceneSet } from "@examples/sets.js";
import type { SceneExample } from "@examples/shared/meta.js";

export type DemoExampleListProps = {
  readonly sceneSet: SceneSet;
  readonly selectedId: string;
  readonly onSelect: (example: SceneExample) => void;
};

export function DemoExampleList({ sceneSet, selectedId, onSelect }: DemoExampleListProps) {
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
          {sceneSet.brand} <span>{sceneSet.label}</span>
        </div>
        <div className="eyebrow">{sceneSet.eyebrow}</div>
      </header>
      <nav id="example-list" className="example-list" aria-label="示例列表">
        {sceneSet.families.map((family) => {
          const entries = sceneSet.examples.filter(family.matches);
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
      <footer className="sidebar-footer">{sceneSet.footer}</footer>
    </aside>
  );
}
