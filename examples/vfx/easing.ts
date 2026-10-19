/**
 * The easing curves of anime.js, laid out as a matrix: one column per family, one row per direction.
 *
 * `quad`, `cubic`, `quart`, `quint`, `sine`, `expo`, `circ` are the polynomial / trigonometric
 * families, `back`, `elastic` and `bounce` are the three that overshoot or rebound, and `linear` is
 * the baseline — the only family with no direction, so its three rows are the same curve.
 *
 * The curves are the anime.js definitions (`inExpo`, `outBack`, `inOutElastic`, …) written out here
 * rather than pulled from a library: the timing *is* the parameter under test, so each cell must be
 * a curve anyone can read off the source. `back` and `elastic` overshoot on purpose — a swing that
 * runs past its target and settles back is exactly the difference those families are chosen for, so
 * the sweep is not clamped to 0-1.
 */

export type Easing = (t: number) => number;

/** The identity curve, kept as the reference the other families are read against. */
export const linear: Easing = (t) => t;

export type EasingDirection = "in" | "out" | "inOut";

export type EasingDirectionInfo = {
  readonly id: EasingDirection;
  /** Row label: the anime.js direction name plus a plain-language gloss. */
  readonly label: string;
};

export type EasingFamily = {
  readonly id: string;
  /** Column title: the anime.js family name. */
  readonly label: string;
  readonly in: Easing;
  readonly out: Easing;
  readonly inOut: Easing;
  /**
   * True for a family whose three directions are the same curve (`linear`). Its cells are all
   * named after the family instead of `inLinear`/`outLinear`, which anime.js does not define.
   */
  readonly directionless?: boolean;
};

/** Rows of the matrix, top to bottom. */
export const EASING_DIRECTIONS: readonly EasingDirectionInfo[] = [
  { id: "in", label: "in" },
  { id: "out", label: "out" },
  { id: "inOut", label: "inOut" },
];

// --- polynomial families ----------------------------------------------------

export const inQuad: Easing = (t) => t * t;
export const outQuad: Easing = (t) => 1 - (1 - t) ** 2;
export const inOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export const inCubic: Easing = (t) => t ** 3;
export const outCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const inOutCubic: Easing = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export const inQuart: Easing = (t) => t ** 4;
export const outQuart: Easing = (t) => 1 - (1 - t) ** 4;
export const inOutQuart: Easing = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

export const inQuint: Easing = (t) => t ** 5;
export const outQuint: Easing = (t) => 1 - (1 - t) ** 5;
export const inOutQuint: Easing = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

// --- sine -------------------------------------------------------------------

export const inSine: Easing = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const outSine: Easing = (t) => Math.sin((t * Math.PI) / 2);
export const inOutSine: Easing = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// --- circ -------------------------------------------------------------------

export const inCirc: Easing = (t) => 1 - Math.sqrt(1 - t ** 2);
export const outCirc: Easing = (t) => Math.sqrt(1 - (t - 1) ** 2);
export const inOutCirc: Easing = (t) =>
  t < 0.5
    ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
    : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;

// --- expo -------------------------------------------------------------------

export const inExpo: Easing = (t) => (t === 0 ? 0 : 2 ** (10 * t - 10));
export const outExpo: Easing = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
export const inOutExpo: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
};

// --- back -------------------------------------------------------------------

const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;

export const inBack: Easing = (t) => BACK_C3 * t * t * t - BACK_C1 * t * t;
export const outBack: Easing = (t) => 1 + BACK_C3 * (t - 1) ** 3 + BACK_C1 * (t - 1) ** 2;
export const inOutBack: Easing = (t) =>
  t < 0.5
    ? ((2 * t) ** 2 * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
    : ((2 * t - 2) ** 2 * ((BACK_C2 + 1) * (2 * t - 2) + BACK_C2) + 2) / 2;

// --- elastic ----------------------------------------------------------------

const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;

export const inElastic: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ELASTIC_C4);
};
export const outElastic: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;
};
export const inOutElastic: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  return t < 0.5
    ? -((2 ** (20 * t - 10)) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
    : ((2 ** (-20 * t + 10)) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1;
};

// --- bounce -----------------------------------------------------------------

const BOUNCE_N1 = 7.5625;
const BOUNCE_D1 = 2.75;

export const outBounce: Easing = (t) => {
  if (t < 1 / BOUNCE_D1) return BOUNCE_N1 * t * t;
  if (t < 2 / BOUNCE_D1) {
    const u = t - 1.5 / BOUNCE_D1;
    return BOUNCE_N1 * u * u + 0.75;
  }
  if (t < 2.5 / BOUNCE_D1) {
    const u = t - 2.25 / BOUNCE_D1;
    return BOUNCE_N1 * u * u + 0.9375;
  }
  const u = t - 2.625 / BOUNCE_D1;
  return BOUNCE_N1 * u * u + 0.984375;
};
export const inBounce: Easing = (t) => 1 - outBounce(1 - t);
export const inOutBounce: Easing = (t) =>
  t < 0.5 ? (1 - outBounce(1 - 2 * t)) / 2 : (1 + outBounce(2 * t - 1)) / 2;

/**
 * The columns of the matrix, left to right, in the order anime.js documents them.
 *
 * The headings are the bare family names: ten columns are narrow enough that a Chinese gloss would
 * collide with its neighbour, and the name is what the cells are called (`inQuart`, `outElastic`).
 */
export const EASING_FAMILIES: readonly EasingFamily[] = [
  // The baseline first: everything on its right is read as "faster" or "slower" than this.
  { id: "linear", label: "linear", in: linear, out: linear, inOut: linear, directionless: true },
  { id: "quad", label: "quad", in: inQuad, out: outQuad, inOut: inOutQuad },
  { id: "cubic", label: "cubic", in: inCubic, out: outCubic, inOut: inOutCubic },
  { id: "quart", label: "quart", in: inQuart, out: outQuart, inOut: inOutQuart },
  { id: "quint", label: "quint", in: inQuint, out: outQuint, inOut: inOutQuint },
  { id: "sine", label: "sine", in: inSine, out: outSine, inOut: inOutSine },
  { id: "expo", label: "expo", in: inExpo, out: outExpo, inOut: inOutExpo },
  { id: "circ", label: "circ", in: inCirc, out: outCirc, inOut: inOutCirc },
  { id: "back", label: "back", in: inBack, out: outBack, inOut: inOutBack },
  { id: "elastic", label: "elastic", in: inElastic, out: outElastic, inOut: inOutElastic },
  { id: "bounce", label: "bounce", in: inBounce, out: outBounce, inOut: inOutBounce },
];

/** One resolved cell of the matrix. */
export function easingOf(family: EasingFamily, direction: EasingDirection): Easing {
  return direction === "in" ? family.in : direction === "out" ? family.out : family.inOut;
}

const capitalize = (value: string): string => `${value[0]!.toUpperCase()}${value.slice(1)}`;

/** The anime.js name of one cell, e.g. `inExpo`, `outBack`, `inOutElastic`, or just `linear`. */
export function easingName(family: EasingFamily, direction: EasingDirection): string {
  return family.directionless === true ? family.id : `${direction}${capitalize(family.id)}`;
}
