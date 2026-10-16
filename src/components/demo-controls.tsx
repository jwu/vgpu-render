/**
 * Render controls sidebar.
 *
 * All controls are controlled components driven by the engine snapshot, so the
 * sidebar always reflects the persisted config (including URL overrides).
 *
 * Labels lead with Chinese UI text and keep the reference parameter name
 * (`infinite_grid_3d.gd` snake_case) as a secondary monospace hint, so the panel
 * stays readable while still mapping one to one onto the ported addon property.
 */

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
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
import type { CameraPreset, DemoConfig, LineJoint, ProjectionMode } from "@/demo-config.js";
import type { ControlHandlers } from "@/demo-hooks";
import { backgroundHex, gridColorToHex } from "@/demo-hooks";

const PROJECTIONS: readonly { value: ProjectionMode; label: string }[] = [
  { value: "perspective", label: "透视 perspective" },
  { value: "orthographic", label: "正交 orthographic" },
];

const JOINTS: readonly { value: LineJoint; label: string }[] = [
  { value: "none", label: "不处理 none" },
  { value: "round", label: "圆角 round" },
  { value: "bevel", label: "斜切 bevel" },
  { value: "miter", label: "尖角 miter" },
];

// Buttons rather than a select: the pose is an action (the camera keeps orbiting freely
// afterwards), so there is no maintained "current preset" state to show.
const CAMERA_PRESETS: readonly { value: CameraPreset; label: string }[] = [
  { value: "default", label: "默认 gallery" },
  { value: "oblique", label: "斜 45°" },
  { value: "front", label: "正 45°" },
];

/** Chinese label with the reference parameter name as a secondary hint. */
function ControlLabel({ label, name }: { readonly label: string; readonly name?: string | undefined }) {
  return (
    <span className="control-label">
      <span>{label}</span>
      {name === undefined ? null : <span className="control-name">{name}</span>}
    </span>
  );
}

type ControlRowProps = {
  readonly label: string;
  readonly name?: string | undefined;
  readonly value?: string | undefined;
  readonly children: ReactNode;
};

function ControlRow({ label, name, value, children }: ControlRowProps) {
  return (
    <div className="control-row">
      <Label className="control-head">
        <ControlLabel label={label} name={name} />
        {value === undefined ? null : (
          <span className="control-value font-mono tabular-nums">{value}</span>
        )}
      </Label>
      {children}
    </div>
  );
}

type SliderInputRowProps = {
  readonly id: string;
  readonly label: string;
  readonly name?: string | undefined;
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
function SliderInputRow({ id, label, name, min, max, step, value, onValueChange, format }: SliderInputRowProps) {
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
    <ControlRow label={label} name={name} value={format(value)}>
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
        aria-label={`${label} 数值`}
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
function NumberRow({ id, label, name, min, max, step, value, integer, onValueChange }: {
  readonly id: string;
  readonly label: string;
  readonly name?: string | undefined;
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
    <ControlRow label={label} name={name}>
      <Input
        id={id}
        type="number"
        className="h-7"
        min={min}
        max={max}
        step={step}
        value={display}
        aria-label={`${label} 数值`}
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
  readonly name?: string | undefined;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
};

/**
 * Base UI renders the checkbox as a visible `<span>` plus a visually hidden
 * `<input>` (`id` belongs to that hidden input). Wrapping the control in the
 * label keeps the click target correct, and `aria-label` names the visible
 * checkbox instead of the `aria-hidden` input.
 */
function ToggleRow({ label, name, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <Label className="control-head control-head-toggle">
      <ControlLabel label={label} name={name} />
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </Label>
  );
}

/** Color row: swatch input without an outline, plus the hex readout. */
function ColorRow({ id, label, name, value, onValueChange }: {
  readonly id: string;
  readonly label: string;
  readonly name?: string | undefined;
  readonly value: string;
  readonly onValueChange: (hex: string) => void;
}) {
  return (
    <ControlRow label={label} name={name} value={value}>
      <Input
        id={id}
        type="color"
        className="color-input h-7 w-full cursor-pointer"
        value={value}
        aria-label={label}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
    </ControlRow>
  );
}

export type DemoControlsProps = {
  readonly config: DemoConfig;
  readonly handlers: ControlHandlers;
};

/** Display section: background, camera projection, animation and visibility. */
function DisplayControls({ config, handlers }: DemoControlsProps) {
  return (
    <>
      <ColorRow
        id="background"
        label="背景色"
        name="background"
        value={backgroundHex(config)}
        onValueChange={handlers.onBackgroundChange}
      />
      <ControlRow label="投影" name="projection">
        <Select
          value={config.camera.projection}
          onValueChange={(value) => handlers.onProjectionChange(value as ProjectionMode)}
        >
          <SelectTrigger id="projection" className="w-full">
            {/* Without an explicit formatter Base UI prints the raw value
             * (`perspective`); map it back to the localized option label. */}
            <SelectValue>
              {(value: ProjectionMode) => PROJECTIONS.find((option) => option.value === value)?.label ?? value}
            </SelectValue>
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
      <ToggleRow
        label="动画"
        name="animate"
        checked={config.view.animate}
        onCheckedChange={handlers.onAnimateChange}
      />
      <ToggleRow
        label="显示网格"
        name="grid"
        checked={config.view.showGrid}
        onCheckedChange={handlers.onShowGridChange}
      />
      <SliderInputRow
        id="grid-opacity"
        label="网格不透明度"
        name="grid opacity"
        min={0}
        max={1}
        step={0.05}
        value={config.view.gridOpacity}
        onValueChange={handlers.onGridOpacityChange}
        format={(value) => value.toFixed(2)}
      />
      <ControlRow label="视角预设" name="camera">
        {/* The buttons keep their own widths (`Button` is `shrink-0`), so the row wraps in the
         * 224px sidebar instead of pushing the page wider than the viewport. */}
        <div className="flex flex-wrap gap-2">
          {CAMERA_PRESETS.map((option) => (
            <Button
              key={option.value}
              id={`camera-${option.value}`}
              type="button"
              variant="outline"
              onClick={() => handlers.onCameraPresetChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </ControlRow>
    </>
  );
}

/** Geometry section: line width scaling and joint handling of the debug-draw layer. */
function GeometryControls({ config, handlers }: DemoControlsProps) {
  return (
    <>
      <SliderInputRow
        id="line-width-scale"
        label="线宽倍率"
        name="line width"
        min={0.25}
        max={3}
        step={0.05}
        value={config.view.lineWidthScale}
        onValueChange={handlers.onLineWidthScaleChange}
        format={(value) => `${value.toFixed(2)}×`}
      />
      <ControlRow label="拐角" name="joint">
        <Select
          value={config.view.lineJoint}
          onValueChange={(value) => handlers.onLineJointChange(value as LineJoint)}
        >
          <SelectTrigger id="line-joint" className="w-full">
            <SelectValue>
              {(value: LineJoint) => JOINTS.find((option) => option.value === value)?.label ?? value}
            </SelectValue>
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
    </>
  );
}

/**
 * Grid section. Every field maps one to one onto a reference addon property
 * (`infinite_grid_3d.gd`), so the panel doubles as documentation of the ported
 * parameter set. Labels lead with Chinese and keep the reference snake_case
 * name as a hint.
 */
function GridControls({ config, handlers }: DemoControlsProps) {
  const grid = config.grid;
  const patch = handlers.onGridOptionsChange;
  return (
    <>
      <NumberRow
        id="grid-size"
        label="网格范围"
        name="grid_size"
        min={1}
        max={20000}
        step={100}
        value={grid.gridSize}
        onValueChange={(value) => patch({ gridSize: value })}
      />
      <NumberRow
        id="grid-cell-size"
        label="单元尺寸"
        name="cell_size"
        min={0.0001}
        max={1000}
        step={0.1}
        value={grid.cellSize}
        onValueChange={(value) => patch({ cellSize: value })}
      />
      <SliderInputRow
        id="grid-line-width"
        label="网格线宽"
        name="line_width_pixels"
        min={0.25}
        max={6}
        step={0.25}
        value={grid.lineWidthPixels}
        onValueChange={(value) => patch({ lineWidthPixels: value })}
        format={(value) => `${value.toFixed(2)}px`}
      />
      <NumberRow
        id="grid-lod-finer"
        label="精细层级数"
        name="lod_finer_levels"
        min={0}
        max={12}
        step={1}
        value={grid.lodFinerLevels}
        integer
        onValueChange={(value) => patch({ lodFinerLevels: value })}
      />
      <NumberRow
        id="grid-lod-total"
        label="总层级数"
        name="lod_total_levels"
        min={3}
        max={24}
        step={1}
        value={grid.lodTotalLevels}
        integer
        onValueChange={(value) => patch({ lodTotalLevels: value })}
      />
      <NumberRow
        id="grid-center-fade-lines"
        label="中心淡出线条数"
        name="lod_center_fade_line_count"
        min={1}
        max={4096}
        step={2}
        value={grid.lodCenterFadeLineCount}
        onValueChange={(value) => patch({ lodCenterFadeLineCount: value })}
      />
      <SliderInputRow
        id="grid-edge-start"
        label="边缘淡出起点"
        name="edge_fade_start_ratio"
        min={0}
        max={1}
        step={0.05}
        value={grid.edgeFadeStartRatio}
        onValueChange={(value) => patch({ edgeFadeStartRatio: value })}
        format={(value) => value.toFixed(2)}
      />
      <SliderInputRow
        id="grid-edge-end"
        label="边缘淡出终点"
        name="edge_fade_end_ratio"
        min={0}
        max={1}
        step={0.05}
        value={grid.edgeFadeEndRatio}
        onValueChange={(value) => patch({ edgeFadeEndRatio: value })}
        format={(value) => value.toFixed(2)}
      />
      <ToggleRow
        label="掠射淡出"
        name="enable_grazing_opacity"
        checked={grid.enableGrazingOpacity}
        onCheckedChange={(checked) => patch({ enableGrazingOpacity: checked })}
      />
      <SliderInputRow
        id="grid-grazing-start"
        label="掠射淡出起点"
        name="grazing_fade_start"
        min={0}
        max={90}
        step={0.5}
        value={grid.grazingFadeStart}
        onValueChange={(value) => patch({ grazingFadeStart: value })}
        format={(value) => `${value.toFixed(1)}°`}
      />
      <SliderInputRow
        id="grid-grazing-end"
        label="掠射淡出终点"
        name="grazing_fade_end"
        min={0}
        max={90}
        step={0.5}
        value={grid.grazingFadeEnd}
        onValueChange={(value) => patch({ grazingFadeEnd: value })}
        format={(value) => `${value.toFixed(1)}°`}
      />
      <ToggleRow
        label="中心淡出"
        name="enable_lod_center_fade"
        checked={grid.enableLodCenterFade}
        onCheckedChange={(checked) => patch({ enableLodCenterFade: checked })}
      />
      <ToggleRow
        label="点刻剔除"
        name="enable_stipple_discard"
        checked={grid.enableStippleDiscard}
        onCheckedChange={(checked) => patch({ enableStippleDiscard: checked })}
      />
      <ToggleRow
        label="LOD 调试配色"
        name="debug_lod_colors"
        checked={grid.debugLodColors}
        onCheckedChange={(checked) => patch({ debugLodColors: checked })}
      />
      <ColorRow
        id="grid-thin-color"
        label="细线颜色"
        name="thin_line_color"
        value={gridColorToHex(grid.thinLineColor)}
        onValueChange={(hex) => handlers.onGridLineColorChange("thin", hex)}
      />
      <SliderInputRow
        id="grid-thin-alpha"
        label="细线透明度"
        name="thin_line_color alpha"
        min={0}
        max={1}
        step={0.05}
        value={grid.thinLineColor[3]}
        onValueChange={(value) => patch({ thinLineColor: [grid.thinLineColor[0], grid.thinLineColor[1], grid.thinLineColor[2], value] })}
        format={(value) => value.toFixed(2)}
      />
      <ColorRow
        id="grid-thick-color"
        label="粗线颜色"
        name="thick_line_color"
        value={gridColorToHex(grid.thickLineColor)}
        onValueChange={(hex) => handlers.onGridLineColorChange("thick", hex)}
      />
      <SliderInputRow
        id="grid-thick-alpha"
        label="粗线透明度"
        name="thick_line_color alpha"
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

/** The three sidebar groups; the ids double as the persisted open-state keys. */
type SectionId = "display" | "geometry" | "infinite-grid";

const SECTION_IDS: readonly SectionId[] = ["display", "geometry", "infinite-grid"];
const SECTION_STATE_KEY = "vgpu-render:control-sections";

/**
 * Open state of the sidebar groups, restored from storage so a reload keeps the
 * layout the user set up. Every section starts open; a stored value only
 * overrides the ones the user actually toggled.
 */
function loadSectionState(): Record<SectionId, boolean> {
  const state: Record<SectionId, boolean> = { display: true, geometry: true, "infinite-grid": true };
  try {
    const raw = globalThis.localStorage.getItem(SECTION_STATE_KEY);
    if (raw === null) return state;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return state;
    const stored = parsed as Record<string, unknown>;
    for (const id of SECTION_IDS) {
      const value = stored[id];
      if (typeof value === "boolean") state[id] = value;
    }
  } catch {
    // Missing or full storage must not break the panel: fall back to the defaults.
  }
  return state;
}

function useControlSections(): {
  readonly open: Record<SectionId, boolean>;
  readonly setOpen: (id: SectionId, open: boolean) => void;
} {
  const [open, setOpenState] = useState<Record<SectionId, boolean>>(loadSectionState);

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(open));
    } catch {
      // Persisting is best effort; the panel already shows the new state.
    }
  }, [open]);

  const setOpen = useCallback((id: SectionId, next: boolean) => {
    setOpenState((current) => ({ ...current, [id]: next }));
  }, []);

  return { open, setOpen };
}

type ControlSectionProps = {
  readonly id: SectionId;
  readonly title: string;
  readonly subtitle: string;
  readonly open: boolean;
  readonly onOpenChange: (id: SectionId, open: boolean) => void;
  readonly children: ReactNode;
};

/**
 * Collapsible group. The panels are independent rather than an accordion, so
 * two sections can stay open while comparing a grid value against a geometry one.
 */
function ControlSection({ id, title, subtitle, open, onOpenChange, children }: ControlSectionProps) {
  return (
    <Collapsible.Root
      className="control-section"
      open={open}
      onOpenChange={(next) => onOpenChange(id, next)}
    >
      <Collapsible.Trigger type="button" className="control-section-trigger">
        <ChevronRight className="control-section-chevron" aria-hidden="true" />
        <span className="control-section-heading">
          <span className="control-section-title">{title}</span>
          <span className="control-section-subtitle">{subtitle}</span>
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="control-section-panel">
        <div className="control-section-body">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export function DemoControls({ config, handlers }: DemoControlsProps) {
  const { open, setOpen } = useControlSections();
  return (
    <aside className="sidebar sidebar-controls" aria-label="渲染控制">
      <div className="control-list">
        <ControlSection
          id="display"
          title="显示"
          subtitle="display"
          open={open.display}
          onOpenChange={setOpen}
        >
          <DisplayControls config={config} handlers={handlers} />
        </ControlSection>
        <ControlSection
          id="geometry"
          title="3D 图形"
          subtitle="Geometry 3D"
          open={open.geometry}
          onOpenChange={setOpen}
        >
          <GeometryControls config={config} handlers={handlers} />
        </ControlSection>
        <ControlSection
          id="infinite-grid"
          title="无限网格"
          subtitle="Infinite Grid"
          open={open["infinite-grid"]}
          onOpenChange={setOpen}
        >
          <GridControls config={config} handlers={handlers} />
        </ControlSection>
      </div>
      <div className="control-actions">
        <Button id="reset-config" type="button" variant="outline" onClick={handlers.onReset}>
          恢复默认
        </Button>
      </div>
    </aside>
  );
}
