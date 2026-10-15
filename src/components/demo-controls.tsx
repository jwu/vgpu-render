/**
 * Render controls sidebar.
 *
 * All controls are controlled components driven by the engine snapshot, so the
 * sidebar always reflects the persisted config (including URL overrides).
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { DemoConfig, LineJoint, ProjectionMode } from "@/demo-config.js";
import type { ControlHandlers } from "@/demo-hooks";
import { backgroundHex } from "@/demo-hooks";

const PROJECTIONS: readonly { value: ProjectionMode; label: string }[] = [
  { value: "perspective", label: "perspective" },
  { value: "orthographic", label: "orthographic" },
];

const JOINTS: readonly { value: LineJoint; label: string }[] = [
  { value: "none", label: "none" },
  { value: "round", label: "round" },
  { value: "bevel", label: "bevel" },
  { value: "miter", label: "miter" },
];

type ControlRowProps = {
  readonly label: string;
  readonly value?: string;
  readonly children: ReactNode;
};

function ControlRow({ label, value, children }: ControlRowProps) {
  return (
    <div className="grid gap-2">
      <Label className="justify-between">
        <span className="text-muted-foreground">{label}</span>
        {value === undefined ? null : (
          <span className="font-mono text-muted-foreground tabular-nums">{value}</span>
        )}
      </Label>
      {children}
    </div>
  );
}

type SliderInputRowProps = {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly format: (value: number) => string;
};

/**
 * Slider plus a numeric field sharing one value.
 *
 * The field keeps its own draft string while focused so intermediate states
 * (empty input, a lone `-`, `1.`) stay editable; the draft is dropped on blur
 * or Enter, falling back to the engine value.
 */
function SliderInputRow({ id, label, min, max, step, value, onValueChange, format }: SliderInputRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? trimNumber(value);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) onValueChange(parsed);
  };

  const nudge = (direction: 1 | -1) => {
    setDraft(null);
    onValueChange(value + step * direction);
  };

  return (
    <ControlRow label={label} value={format(value)}>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        // A single-element array keeps this a one-thumb slider: the generated
        // wrapper falls back to `[min, max]` (two thumbs) for a bare number.
        value={[value]}
        onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] ?? value) : next)}
        aria-label={label}
      />
      <Input
        id={`${id}-number`}
        type="number"
        className="h-7"
        min={min}
        max={max}
        step={step}
        value={display}
        aria-label={`${label} value`}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            nudge(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            nudge(-1);
          }
        }}
      />
    </ControlRow>
  );
}

/** Renders a number without float noise (`1` instead of `1.0000000000000002`). */
function trimNumber(value: number): string {
  return String(Number.parseFloat(value.toFixed(4)));
}

type ToggleRowProps = {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
};

/**
 * Base UI renders the checkbox as a visible `<span>` plus a visually hidden
 * `<input>` (`id` belongs to that hidden input). Wrapping the control in the
 * label keeps the click target correct, and `aria-label` names the visible
 * checkbox instead of the `aria-hidden` input.
 */
function ToggleRow({ label, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <Label className="justify-between">
      <span className="text-muted-foreground">{label}</span>
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </Label>
  );
}

export type DemoControlsProps = {
  readonly config: DemoConfig;
  readonly handlers: ControlHandlers;
};

export function DemoControls({ config, handlers }: DemoControlsProps) {
  return (
    <aside className="sidebar sidebar-controls" aria-label="Render controls">
      <header className="sidebar-header">
        <div className="eyebrow">render controls</div>
        <h2>Display</h2>
      </header>
      <div className="control-list">
        <ToggleRow
          label="animate"
          checked={config.view.animate}
          onCheckedChange={handlers.onAnimateChange}
        />
        <ToggleRow
          label="grid"
          checked={config.view.showGrid}
          onCheckedChange={handlers.onShowGridChange}
        />
        <SliderInputRow
          id="line-width-scale"
          label="line width"
          min={0.25}
          max={3}
          step={0.05}
          value={config.view.lineWidthScale}
          onValueChange={handlers.onLineWidthScaleChange}
          format={(value) => `${value.toFixed(2)}×`}
        />
        <SliderInputRow
          id="grid-opacity"
          label="grid opacity"
          min={0}
          max={1}
          step={0.05}
          value={config.view.gridOpacity}
          onValueChange={handlers.onGridOpacityChange}
          format={(value) => value.toFixed(2)}
        />
        <ControlRow label="projection">
          <Select
            value={config.camera.projection}
            onValueChange={(value) => handlers.onProjectionChange(value as ProjectionMode)}
          >
            <SelectTrigger id="projection" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlRow>
        <ControlRow label="joint">
          <Select
            value={config.view.lineJoint}
            onValueChange={(value) => handlers.onLineJointChange(value as LineJoint)}
          >
            <SelectTrigger id="line-joint" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOINTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlRow>
        <ControlRow label="background" value={backgroundHex(config)}>
          <Input
            id="background"
            type="color"
            className="h-7 w-full cursor-pointer p-1"
            value={backgroundHex(config)}
            onChange={(event) => handlers.onBackgroundChange(event.currentTarget.value)}
          />
        </ControlRow>
        <Button id="reset-config" type="button" variant="outline" onClick={handlers.onReset}>
          reset
        </Button>
      </div>
    </aside>
  );
}
