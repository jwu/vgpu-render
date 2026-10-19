/**
 * Effect parameter resolution shared by the battle pages.
 *
 * A page declares its sliders once in `meta.ts` (`ParamSpec[]`); this module turns that
 * declaration into concrete values. Everything a scene reads comes through here, so a scene
 * never has to re-check a range and a stored record can never put a slider out of bounds.
 */

import type { EffectParams, ParamSpec } from "../shared/meta.js";

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** The parameter values a page opens with, straight from its specs. */
export function defaultParams(specs: readonly ParamSpec[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const spec of specs) values[spec.key] = spec.default;
  return values;
}

/**
 * Keeps a stored record inside the ranges its specs declare. Missing keys fall back to the
 * spec default, unknown keys are dropped (a spec removed later must not keep feeding the scene),
 * and non-finite numbers are ignored the same way a missing key is.
 */
export function clampParams(
  specs: readonly ParamSpec[],
  stored: Readonly<Record<string, unknown>> = {},
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const spec of specs) {
    const raw = stored[spec.key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? clamp(raw, spec.min, spec.max) : spec.default;
    values[spec.key] = value;
  }
  return values;
}

/**
 * One page's resolved params, falling back to the spec defaults.
 *
 * `params` reaches a scene as a plain record, so an id that the caller does not know (a stale URL,
 * a page removed since the record was written) still yields something the scene can read.
 */
export function paramsFor(specs: readonly ParamSpec[], passed: EffectParams | undefined): Readonly<Record<string, number>> {
  return passed === undefined ? defaultParams(specs) : clampParams(specs, passed);
}

/** The same RGB with a different alpha, for the fading layers. */
export function withAlpha(
  color: readonly [number, number, number, number],
  alpha: number,
): readonly [number, number, number, number] {
  return [color[0], color[1], color[2], alpha];
}

/** HSV (hue in turns, saturation/value in 0-1) to the linear-ish RGBA the draw list takes. */
export function hueColor(hue: number, saturation: number, value: number, alpha = 1): readonly [number, number, number, number] {
  const h = ((hue % 1) + 1) % 1;
  const sector = h * 6;
  const index = Math.floor(sector);
  const fraction = sector - index;
  const p = value * (1 - saturation);
  const q = value * (1 - saturation * fraction);
  const t = value * (1 - saturation * (1 - fraction));
  switch (index % 6) {
    case 0: return [value, t, p, alpha];
    case 1: return [q, value, p, alpha];
    case 2: return [p, value, t, alpha];
    case 3: return [p, q, value, alpha];
    case 4: return [t, p, value, alpha];
    default: return [value, p, q, alpha];
  }
}
