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
import { Separator } from "@/components/ui/separator";
import type { DemoConfig, LineJoint, ProjectionMode } from "@/demo-config.js";
import type { ControlHandlers } from "@/demo-hooks";
import { backgroundHex, gridColorToHex } from "@/demo-hooks";

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

/** Number-only row for wide-range values a slider cannot express well. */
function NumberRow({ id, label, min, max, step, value, integer, onValueChange }: {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly integer?: boolean;
  readonly onValueChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? trimNumber(value);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, min), max);
    onValueChange(integer === true ? Math.round(clamped) : clamped);
  };

  return (
    <ControlRow label={label}>
      <Input
        id={id}
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
          if (event.key === "Enter") event.currentTarget.blur();
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

/**
 * Grid section. Every field maps one to one onto a reference addon property
 * (`infinite_grid_3d.gd`), so the panel doubles as documentation of the ported
 * parameter set. Labels keep the reference snake_case names.
 */
function GridControls({ config, handlers }: DemoControlsProps) {
  const grid = config.grid;
  const patch = handlers.onGridOptionsChange;
  return (
    <>
      <Separator />
      <div className="eyebrow">infinite grid</div>
      <NumberRow
        id="grid-size"
        label="grid_size"
        min={1}
        max={20000}
        step={100}
        value={grid.gridSize}
        onValueChange={(value) => patch({ gridSize: value })}
      />
      <NumberRow
        id="grid-cell-size"
        label="cell_size"
        min={0.0001}
        max={1000}
        step={0.1}
        value={grid.cellSize}
        onValueChange={(value) => patch({ cellSize: value })}
      />
      <SliderInputRow
        id="grid-line-width"
        label="line_width_pixels"
        min={0.25}
        max={6}
        step={0.25}
        value={grid.lineWidthPixels}
        onValueChange={(value) => patch({ lineWidthPixels: value })}
        format={(value) => `${value.toFixed(2)}px`}
      />
      <NumberRow
        id="grid-lod-finer"
        label="lod_finer_levels"
        min={0}
        max={12}
        step={1}
        value={grid.lodFinerLevels}
        integer
        onValueChange={(value) => patch({ lodFinerLevels: value })}
      />
      <NumberRow
        id="grid-lod-total"
        label="lod_total_levels"
        min={3}
        max={24}
        step={1}
        value={grid.lodTotalLevels}
        integer
        onValueChange={(value) => patch({ lodTotalLevels: value })}
      />
      <NumberRow
        id="grid-center-fade-lines"
        label="lod_center_fade_line_count"
        min={1}
        max={4096}
        step={2}
        value={grid.lodCenterFadeLineCount}
        onValueChange={(value) => patch({ lodCenterFadeLineCount: value })}
      />
      <SliderInputRow
        id="grid-edge-start"
        label="edge_fade_start_ratio"
        min={0}
        max={1}
        step={0.05}
        value={grid.edgeFadeStartRatio}
        onValueChange={(value) => patch({ edgeFadeStartRatio: value })}
        format={(value) => value.toFixed(2)}
      />
      <SliderInputRow
        id="grid-edge-end"
        label="edge_fade_end_ratio"
        min={0}
        max={1}
        step={0.05}
        value={grid.edgeFadeEndRatio}
        onValueChange={(value) => patch({ edgeFadeEndRatio: value })}
        format={(value) => value.toFixed(2)}
      />
      <ToggleRow
        label="enable_grazing_opacity"
        checked={grid.enableGrazingOpacity}
        onCheckedChange={(checked) => patch({ enableGrazingOpacity: checked })}
      />
      <SliderInputRow
        id="grid-grazing-start"
        label="grazing_fade_start"
        min={0}
        max={90}
        step={0.5}
        value={grid.grazingFadeStart}
        onValueChange={(value) => patch({ grazingFadeStart: value })}
        format={(value) => `${value.toFixed(1)}°`}
      />
      <SliderInputRow
        id="grid-grazing-end"
        label="grazing_fade_end"
        min={0}
        max={90}
        step={0.5}
        value={grid.grazingFadeEnd}
        onValueChange={(value) => patch({ grazingFadeEnd: value })}
        format={(value) => `${value.toFixed(1)}°`}
      />
      <ToggleRow
        label="enable_lod_center_fade"
        checked={grid.enableLodCenterFade}
        onCheckedChange={(checked) => patch({ enableLodCenterFade: checked })}
      />
      <ToggleRow
        label="enable_stipple_discard"
        checked={grid.enableStippleDiscard}
        onCheckedChange={(checked) => patch({ enableStippleDiscard: checked })}
      />
      <ToggleRow
        label="debug_lod_colors"
        checked={grid.debugLodColors}
        onCheckedChange={(checked) => patch({ debugLodColors: checked })}
      />
      <ControlRow label="thin_line_color" value={gridColorToHex(grid.thinLineColor)}>
        <Input
          id="grid-thin-color"
          type="color"
          className="h-7 w-full cursor-pointer p-1"
          value={gridColorToHex(grid.thinLineColor)}
          onChange={(event) => handlers.onGridLineColorChange("thin", event.currentTarget.value)}
        />
      </ControlRow>
      <SliderInputRow
        id="grid-thin-alpha"
        label="thin_line_color alpha"
        min={0}
        max={1}
        step={0.05}
        value={grid.thinLineColor[3]}
        onValueChange={(value) => patch({ thinLineColor: [grid.thinLineColor[0], grid.thinLineColor[1], grid.thinLineColor[2], value] })}
        format={(value) => value.toFixed(2)}
      />
      <ControlRow label="thick_line_color" value={gridColorToHex(grid.thickLineColor)}>
        <Input
          id="grid-thick-color"
          type="color"
          className="h-7 w-full cursor-pointer p-1"
          value={gridColorToHex(grid.thickLineColor)}
          onChange={(event) => handlers.onGridLineColorChange("thick", event.currentTarget.value)}
        />
      </ControlRow>
      <SliderInputRow
        id="grid-thick-alpha"
        label="thick_line_color alpha"
        min={0}
        max={1}
        step={0.05}
        value={grid.thickLineColor[3]}
        onValueChange={(value) => patch({ thickLineColor: [grid.thickLineColor[0], grid.thickLineColor[1], grid.thickLineColor[2], value] })}
        format={(value) => value.toFixed(2)}
      />
    </>
  );
}

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
        <GridControls config={config} handlers={handlers} />
        <Button id="reset-config" type="button" variant="outline" onClick={handlers.onReset}>
          reset
        </Button>
      </div>
    </aside>
  );
}
