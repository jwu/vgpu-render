/**
 * Battle page control sidebar.
 *
 * Adds two sections above the gallery's display / geometry / grid panel: the loop timeline
 * (play-pause, rewind, scrub) and the selected effect's parameter sliders. Both read the effect
 * metadata, so adding a page needs no change here — it only has to declare `duration` and `params`.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  ControlSection,
  DemoControls,
  NumberRow,
  SliderInputRow,
  useControlSections,
  type ControlSectionProps,
  type DemoControlsProps,
} from "@/components/demo-controls";
import type { BattleParamStore } from "@/battle-params";
import type { DemoEngine, DemoSnapshot } from "@/demo-engine";
import type { ControlHandlers } from "@/demo-hooks";
import type { ParamSpec } from "@examples/shared/meta.js";

/** Subscribes to the store for the selected effect and keeps it pointed at that effect's record. */
function useBattleParams(store: BattleParamStore, exampleId: string, specs: readonly ParamSpec[]) {
  useEffect(() => {
    store.select(exampleId, specs);
  }, [store, exampleId, specs]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  return useSyncExternalStore(subscribe, () => store.current(), () => store.current());
}

type SectionState = Pick<ControlSectionProps, "open" | "onOpenChange">;

function TimelineSection({
  engine,
  snapshot,
  handlers,
  section,
  duration,
  durationSpec,
  onDurationChange,
}: {
  readonly engine: DemoEngine;
  readonly snapshot: DemoSnapshot;
  readonly handlers: ControlHandlers;
  readonly section: SectionState;
  /** Loop length currently in force, mirrored from the effect parameters. */
  readonly duration: number;
  /** The `duration` parameter spec when the page exposes one; it is edited here, not with the effect. */
  readonly durationSpec: ParamSpec | undefined;
  readonly onDurationChange: (value: number) => void;
}) {
  const progressRef = useRef<HTMLInputElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  // While the pointer is down the slider owns the clock; the loop must not fight the drag.
  const scrubbing = useRef(false);

  // The timeline repaints outside React's cycle: one `requestAnimationFrame` writes the slider
  // position and the readout directly, so a 60 Hz loop never re-renders the control tree.
  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      // Both ends are read every frame: `duration` is a live parameter, so the slider's range has to
      // follow it without waiting for a React render.
      const span = engine.getDuration() ?? 1;
      const time = Math.min(engine.getTime(), span);
      if (progressRef.current !== null) {
        progressRef.current.max = String(span);
        if (!scrubbing.current) progressRef.current.value = String(time);
      }
      if (readoutRef.current !== null) readoutRef.current.textContent = `${time.toFixed(2)}s`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  return (
    <ControlSection id="timeline" title="时间轴" subtitle="Timeline" {...section}>
      <div className="timeline-actions">
        <Button type="button" variant="outline" onClick={() => handlers.onAnimateChange(!snapshot.playing)}>
          {snapshot.playing ? "暂停" : "播放"}
        </Button>
        <Button type="button" variant="outline" onClick={() => engine.restartTime()}>
          重播
        </Button>
        <span className="timeline-readout font-mono tabular-nums">
          <span ref={readoutRef}>0.00s</span>
          <span className="timeline-total"> / {duration.toFixed(2)}s</span>
        </span>
      </div>
      <input
        ref={progressRef}
        id="timeline-scrub"
        className="timeline-scrub"
        type="range"
        min={0}
        max={duration}
        step={0.01}
        defaultValue={0}
        aria-label="时间轴位置"
        onPointerDown={() => {
          scrubbing.current = true;
        }}
        onPointerUp={() => {
          scrubbing.current = false;
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
        }}
        onChange={(event) => engine.setTime(Number(event.currentTarget.value))}
      />
      {durationSpec === undefined ? null : (
        <NumberRow
          id="timeline-duration"
          label="时长"
          name={durationSpec.name}
          min={durationSpec.min}
          max={durationSpec.max}
          step={durationSpec.step}
          value={duration}
          onValueChange={onDurationChange}
        />
      )}
      <p className="control-hint">
        拖拽定位到任意时刻；暂停后拖动可以逐帧观察。改时长会把整段挥砍一起拉长或压短（各阶段占比不变）。
      </p>
    </ControlSection>
  );
}

function EffectParamsSection({
  specs,
  store,
  values,
  section,
}: {
  readonly specs: readonly ParamSpec[];
  readonly store: BattleParamStore;
  readonly values: Readonly<Record<string, number>>;
  readonly section: SectionState;
}) {
  if (specs.length === 0) return null;
  const format = (spec: ParamSpec) => (value: number): string =>
    spec.integer === true ? String(Math.round(value)) : spec.unit === undefined ? value.toFixed(2) : `${value.toFixed(2)}${spec.unit}`;
  return (
    <ControlSection id="effect-params" title="特效参数" subtitle="Effect params" {...section}>
      {specs.map((spec) => (
        <SliderInputRow
          key={spec.key}
          id={`effect-param-${spec.key}`}
          label={spec.label}
          name={spec.name}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={values[spec.key] ?? spec.default}
          onValueChange={(value) => store.set(spec.key, value)}
          format={format(spec)}
        />
      ))}
      <div className="vfx-reset">
        <Button type="button" variant="outline" onClick={() => store.reset()}>
          重置参数
        </Button>
      </div>
    </ControlSection>
  );
}

export type VfxControlsProps = Pick<DemoControlsProps, "config" | "handlers"> & {
  readonly snapshot: DemoSnapshot;
  readonly engine: DemoEngine;
  readonly store: BattleParamStore;
};

export function VfxControls({ config, handlers, snapshot, engine, store }: VfxControlsProps) {
  const specs = snapshot.selected.params ?? [];
  const values = useBattleParams(store, snapshot.selected.id, specs);
  // `duration` belongs to the timeline panel, not to the effect's own parameter list.
  const durationSpec = specs.find((spec) => spec.key === "duration");
  const effectSpecs = specs.filter((spec) => spec.key !== "duration");
  const duration = values.duration ?? snapshot.duration ?? 1;
  const sections = useControlSections();
  const section = (id: "timeline" | "effect-params"): SectionState => ({
    open: sections.open[id] ?? true,
    onOpenChange: sections.setOpen,
  });
  return (
    <DemoControls config={config} handlers={handlers} sections={sections}>
      <TimelineSection
        engine={engine}
        snapshot={snapshot}
        handlers={handlers}
        section={section("timeline")}
        duration={duration}
        durationSpec={durationSpec}
        onDurationChange={(value) => store.set("duration", value)}
      />
      <EffectParamsSection specs={effectSpecs} store={store} values={values} section={section("effect-params")} />
    </DemoControls>
  );
}
