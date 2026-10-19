/**
 * Effect parameter state for the battle page.
 *
 * The values live outside React's render cycle as far as the renderer is concerned: the engine reads
 * them through a plain getter once per frame, so dragging a slider never re-enters the snapshot
 * cycle. React subscribes through `useBattleParams` for the sliders themselves, and the store keeps
 * one record per effect in storage so a reload reopens the panel as it was left.
 */

import type { ParamSpec } from "../examples/shared/meta.js";
import { clampParams, defaultParams } from "../examples/vfx/params.js";
import type { ConfigStorage } from "./demo-config.js";

/** One record per effect id; the values are already clamped to their specs. */
type StoredParams = Record<string, Record<string, number>>;

export const VFX_PARAMS_KEY = "vgpu-render:vfx-params";

function readStored(storage: ConfigStorage | undefined, key: string): StoredParams {
  if (storage === undefined) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return {};
  }
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const records: StoredParams = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    records[id] = value as Record<string, number>;
  }
  return records;
}

export class BattleParamStore {
  private readonly storage: ConfigStorage | undefined;
  private readonly key: string;
  private records: StoredParams;
  private exampleId = "";
  private specs: readonly ParamSpec[] = [];
  private values: Record<string, number> = {};
  private readonly listeners = new Set<() => void>();

  constructor(options: { readonly storage?: ConfigStorage | undefined; readonly key?: string | undefined } = {}) {
    this.storage = options.storage;
    this.key = options.key ?? VFX_PARAMS_KEY;
    this.records = readStored(this.storage, this.key);
  }

  /**
   * Points the store at one effect and loads its record. Called from an effect on the selected
   * page, so switching effects swaps the whole slider set.
   */
  select(exampleId: string, specs: readonly ParamSpec[]): void {
    if (exampleId === this.exampleId) return;
    this.exampleId = exampleId;
    this.specs = specs;
    this.values = clampParams(specs, this.records[exampleId] ?? {});
    this.emit();
  }

  /** Current values. The reference only changes when a value does, which `useSyncExternalStore` needs. */
  current(): Record<string, number> {
    return this.values;
  }

  set(key: string, value: number): void {
    this.values = clampParams(this.specs, { ...this.values, [key]: value });
    this.commit();
  }

  /** Drops the record for the selected effect and restores the authored defaults. */
  reset(): void {
    this.values = defaultParams(this.specs);
    this.commit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private commit(): void {
    if (this.exampleId !== "") {
      this.records = { ...this.records, [this.exampleId]: this.values };
      this.persist();
    }
    this.emit();
  }

  private persist(): void {
    if (this.storage === undefined) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.records));
    } catch {
      /* Storage can be unavailable; the panel already shows the new value. */
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
