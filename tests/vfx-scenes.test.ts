import { describe, expect, test } from "vitest";
import { DEMO_CONFIG_KEY, DEMO_DISPLAY_CONFIG_KEY } from "../gallery/demo-config.js";
import { BASIC_SCENE_SET, SCENE_SETS, VFX_SCENE_SET, sceneSetFromId } from "../examples/sets.js";
import { clampParams, defaultParams } from "../examples/vfx/params.js";
import { VFX_EXAMPLES } from "../examples/vfx/registry.js";
import { buildVfxScene, defaultVfxParams, vfxParamSpecs } from "../examples/vfx/runtime.js";
import { cellX, cellY } from "../examples/vfx/matrix.js";
import { LOOP_SECONDS, slashPhase } from "../examples/vfx/slash-arc/scene.js";
import { battleSwingPhase } from "../examples/vfx/battle-slash/scene.js";
import { actionPhase } from "../examples/vfx/action-phase.js";
import { PILLAR_LAYER_COUNT } from "../examples/vfx/pillar.js";
import {
  BURST_RATIO as PILLAR_BURST_RATIO,
  breath as pillarBreath,
  FADE_RATIO as PILLAR_FADE_RATIO,
  HOLD_RATIO as PILLAR_HOLD_RATIO,
  LOOP_SECONDS as PILLAR_LOOP_SECONDS,
  RING_LIFE as PILLAR_RING_LIFE,
  RISE_RATIO as PILLAR_RISE_RATIO,
  pillarPhaseAt,
  poolBrightness,
  poolSpread as pillarPoolSpread,
  pushRingBrightness,
  pushRingReach,
  ringReach,
  shaftBrightness,
  shaftHeight,
  shaftScatter,
  shaftWidth,
} from "../examples/vfx/light-pillar/scene.js";
import {
  BEAM_BAND_COUNT,
  GROW_RATIO,
  TIMELINE_LAYOUT,
  healPhase,
  sparkBrightness,
} from "../examples/vfx/heal-beam/scene.js";
import {
  BODY_RADIUS,
  BURST_OPEN,
  BURST_SPAN,
  CASTER,
  CHARGE_RATIO,
  EMBER_TRAVEL,
  HIT_RATIO,
  SPARK_TRAVEL,
  TARGET,
  TIMELINE_LAYOUT as FIREBALL_TIMELINE_LAYOUT,
  burstBrightness,
  burstRadius,
  emberBrightness,
  fireballPhase,
  fireballPhaseAt,
  fireballPosition,
  fireballRadius,
  flashBrightness,
  ringRadius,
  slowRingRadius,
  sparkBrightness as fireballSparkBrightness,
  tailBrightness,
} from "../examples/vfx/fireball/scene.js";
import {
  CASTER as CHAIN_CASTER,
  CHAIN_VIEW,
  CHARGE_RATIO as CHAIN_CHARGE_RATIO,
  BOLT_LIFE,
  BOLT_PULSES,
  ENEMY_RADIUS,
  ENEMY_SLOTS,
  FLICKER_FPS,
  STRIKE_RATIO,
  TIMELINE_LAYOUT as CHAIN_TIMELINE_LAYOUT,
  boltFlicker,
  boltPath,
  chainPhase,
  chainPhaseAt,
  enemyCount,
  strikePulse,
} from "../examples/vfx/chain-lightning/scene.js";
import {
  CUT_LIFE,
  CUT_START,
  DASH_END,
  DASH_START,
  TIMELINE_LAYOUT as DASH_TIMELINE_LAYOUT,
  cutBrightness,
  cutGrow,
  cutStart,
  dashSlashPhaseAt,
} from "../examples/vfx/dash-slash/scene.js";
import { inCirc, outCirc } from "../examples/vfx/easing.js";
import {
  CHARGE_RATIO as ULT_CHARGE_RATIO,
  LOOP_SECONDS as ULT_LOOP_SECONDS,
  RING_SPAN as ULT_RING_SPAN,
  SPIKE_CLOSE as ULT_SPIKE_CLOSE,
  SPIKE_OPEN as ULT_SPIKE_OPEN,
  UNIT as ULT_UNIT,
  ringBrightness as ultRingBrightness,
  ringRadius as ultRingRadius,
  spikeLength as ultSpikeLength,
  starBrightness as ultStarBrightness,
  ultFlashPhaseAt,
} from "../examples/vfx/ult-flash/scene.js";
import {
  EASING_DIRECTIONS,
  EASING_FAMILIES,
  easingName,
  easingOf,
  inElastic,
  inExpo,
  linear,
  outBack,
  outExpo,
} from "../examples/vfx/easing.js";
import { FrameDrawList } from "../src/frame-draw-list.js";

describe("scene sets", () => {
  test("keep the basic storage keys the gallery has always used", () => {
    // Pinned deliberately: changing these orphans every visitor's saved layout.
    expect(BASIC_SCENE_SET.storageKeys.config).toBe(DEMO_CONFIG_KEY);
    expect(BASIC_SCENE_SET.storageKeys.display).toBe(DEMO_DISPLAY_CONFIG_KEY);
  });

  test("give each set its own storage record", () => {
    const configs = SCENE_SETS.map((set) => set.storageKeys.config);
    const displays = SCENE_SETS.map((set) => set.storageKeys.display);
    expect(new Set(configs).size).toBe(SCENE_SETS.length);
    expect(new Set(displays).size).toBe(SCENE_SETS.length);
  });

  test("resolve a set id, falling back to the basic gallery", () => {
    expect(sceneSetFromId("vfx")).toBe(VFX_SCENE_SET);
    expect(sceneSetFromId("basic")).toBe(BASIC_SCENE_SET);
    expect(sceneSetFromId(null)).toBe(BASIC_SCENE_SET);
    expect(sceneSetFromId("nope")).toBe(BASIC_SCENE_SET);
  });

  test("cover every example with exactly one family", () => {
    for (const set of SCENE_SETS) {
      for (const example of set.examples) {
        const families = set.families.filter((family) => family.matches(example));
        expect(families, `${set.id}/${example.id} should land in one group`).toHaveLength(1);
      }
    }
  });
});

describe("battle pages", () => {
  test("declare the battle-page contract", () => {
    expect(VFX_EXAMPLES.length).toBeGreaterThan(0);
    for (const example of VFX_EXAMPLES) {
      expect(example.family, `${example.id} must drive the 2D camera`).toBe("2d");
      expect(example.duration, `${example.id} needs a loop duration`).toBeGreaterThan(0);
      expect(example.view2d, `${example.id} needs a view extent`).toBeDefined();
      const specs = example.params ?? [];
      expect(specs.length, `${example.id} needs parameters`).toBeGreaterThan(0);
      const keys = specs.map((spec) => spec.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const spec of specs) {
        expect(spec.step, `${example.id}/${spec.key} needs a step`).toBeGreaterThan(0);
        expect(spec.min).toBeLessThan(spec.max);
        expect(spec.default, `${example.id}/${spec.key} default must be in range`).toBeGreaterThanOrEqual(spec.min);
        expect(spec.default).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  test("share one default duration and all be recolourable", () => {
    for (const example of VFX_EXAMPLES) {
      const durationSpec = example.params?.find((spec) => spec.key === "duration");
      expect(durationSpec, `${example.id} needs a duration parameter`).toBeDefined();
      // One default for every page: switching pages should not change how long a hit takes.
      expect(durationSpec!.default, `${example.id} default duration`).toBe(0.8);
      expect(example.duration).toBe(0.8);
      // Every page exposes at least one hue slider; `hit-mark` has two (unit + mark).
      expect(example.params?.some((spec) => spec.key.toLowerCase().includes("hue"))).toBe(true);
      expect(example.params?.some((spec) => spec.key.toLowerCase().includes("saturation"))).toBe(true);
    }
  });

  test("publish the loop duration its scene actually runs", () => {
    const slashArc = VFX_EXAMPLES.find((example) => example.id === "slash-arc");
    expect(slashArc?.duration).toBe(LOOP_SECONDS);
    // The page also exposes that duration as an editable parameter, so the timeline can re-time it.
    const durationSpec = slashArc?.params?.find((spec) => spec.key === "duration");
    expect(durationSpec).toBeDefined();
    expect(durationSpec!.default).toBe(LOOP_SECONDS);
    expect(durationSpec!.min).toBeLessThan(durationSpec!.default);
    expect(durationSpec!.max).toBeGreaterThan(durationSpec!.default);
  });

  test("build 2D commands at any point of the loop", () => {
    for (const example of VFX_EXAMPLES) {
      for (const time of [0, 0.1, 0.36, 0.8, LOOP_SECONDS - 0.01]) {
        const drawList = new FrameDrawList();
        buildVfxScene(example.id, drawList, time);
        const commands = drawList.commands();
        // Even the reset frame draws each column's target arc and heading.
        expect(commands.length, `${example.id} at ${time}s should draw something`).toBeGreaterThan(0);
        for (const command of commands) {
          expect(["shape2d", "line2d", "text"]).toContain(command.kind);
        }
      }
    }
  });

  test("lay out one family per column and one direction per row", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("slash-arc", drawList, 0.4);
    const texts = drawList
      .commands()
      .flatMap((command) => (command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : []));

    // Family titles then direction labels: a cell's name is the column and row it sits in, so no
    // per-cell label is drawn.
    const expected = [
      ...EASING_FAMILIES.map((family) => family.label),
      ...EASING_DIRECTIONS.map((direction) => direction.label),
    ];
    expect(texts).toEqual(expected);

    const columns = EASING_FAMILIES.length;
    const rows = EASING_DIRECTIONS.length;
    // Every anime.js family: linear plus the nine that have a direction.
    expect(columns).toBe(11);
    expect(columns * rows).toBe(33);
    // Symmetric around the origin in both axes, so the fitted extent has no dead margin.
    expect(cellX(0, columns) + cellX(columns - 1, columns)).toBeCloseTo(0, 9);
    expect(cellY(0, rows) + cellY(rows - 1, rows)).toBeCloseTo(0, 9);
    expect(cellY(0, rows)).toBeGreaterThan(0);
    expect(cellY(rows - 1, rows)).toBeLessThan(0);
  });

  test("name every cell the way anime.js does", () => {
    const names = EASING_FAMILIES.flatMap((family) =>
      EASING_DIRECTIONS.map((direction) => easingName(family, direction.id)),
    );
    expect(names).toHaveLength(33);
    // `linear` has no direction, so its three cells share one name.
    expect(names.filter((name) => name === "linear")).toHaveLength(3);
    expect(names).toContain("inQuad");
    expect(names).toContain("outQuart");
    expect(names).toContain("inOutSine");
    expect(names).toContain("inExpo");
    expect(names).toContain("outCirc");
    expect(names).toContain("outBack");
    expect(names).toContain("inOutElastic");
    expect(names).toContain("outBounce");
    expect(names).not.toContain("inLinear");
    expect(new Set(names).size).toBe(names.length - 2);
  });

  test("cover the whole anime.js easing set", () => {
    expect(EASING_FAMILIES.map((family) => family.id)).toEqual([
      "linear", "quad", "cubic", "quart", "quint", "sine", "expo", "circ", "back", "elastic", "bounce",
    ]);
    for (const family of EASING_FAMILIES) {
      // Every direction is a curve that starts at 0 and lands on 1; the intermediates differ.
      for (const direction of EASING_DIRECTIONS) {
        const ease = easingOf(family, direction.id);
        expect(ease(0)).toBeCloseTo(0, 6);
        expect(ease(1)).toBeCloseTo(1, 6);
        expect(Number.isFinite(ease(0.5))).toBe(true);
      }
    }
  });

  test("draw a curve plot in every cell", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("slash-arc", drawList, 0.4);
    const lines = drawList.commands().filter((command) => command.kind === "line2d");
    // Thirty-three plots, each an x axis, a y axis, an identity guide and 14 curve segments.
    expect(lines.length).toBeGreaterThanOrEqual(33 * (3 + 14));
  });

  test("resolve parameters for an unknown id harmlessly", () => {
    expect(vfxParamSpecs("nope")).toEqual([]);
    expect(defaultVfxParams("nope")).toEqual({});
    const drawList = new FrameDrawList();
    buildVfxScene("nope", drawList, 0.4);
    expect(drawList.commands()).toEqual([]);
  });
});

describe("effect parameters", () => {
  const specs = vfxParamSpecs("slash-arc");

  test("open at the authored defaults", () => {
    const values = defaultParams(specs);
    for (const spec of specs) expect(values[spec.key]).toBe(spec.default);
  });

  test("clamp stored values instead of trusting them", () => {
    const values = clampParams(specs, { radius: 99, stroke: -5, fill: "x", extra: 1 });
    expect(values.radius).toBe(specs.find((spec) => spec.key === "radius")?.max);
    expect(values.stroke).toBe(specs.find((spec) => spec.key === "stroke")?.min);
    // A non-numeric entry falls back to the default rather than to the range end.
    expect(values.fill).toBe(specs.find((spec) => spec.key === "fill")?.default);
    expect("extra" in values).toBe(false);
  });
});

describe("slash arc timeline", () => {
  const sweep = Math.PI;

  test("charges before it swings", () => {
    // Half way through the windup, which is the first 12% of the loop.
    const phase = slashPhase(LOOP_SECONDS * 0.06, sweep);
    expect(phase.charge).toBeCloseTo(0.5, 5);
    expect(phase.arc).toBe(0);
    expect(phase.vanish).toBe(1);
  });

  test("sweeps monotonically and settles", () => {
    let previous = 0;
    for (let time = 0; time <= LOOP_SECONDS; time += 0.02) {
      const phase = slashPhase(time, sweep);
      expect(phase.arc).toBeGreaterThanOrEqual(previous);
      expect(phase.arc).toBeLessThanOrEqual(sweep + 1e-9);
      previous = phase.arc;
    }
    // The swing is complete well before the loop ends, so the fade has time to read.
    expect(slashPhase(LOOP_SECONDS * 0.36 + LOOP_SECONDS * 0.2, sweep).arc).toBeCloseTo(sweep, 6);
    expect(slashPhase(LOOP_SECONDS - 0.01, sweep).vanish).toBeLessThan(0.2);
  });

  test("separate the cells by easing alone", () => {
    const sweep = Math.PI;
    // Half way through the strike window, which spans 12%-36% of the loop.
    const time = LOOP_SECONDS * 0.24;
    const linearArc = slashPhase(time, sweep, linear).arc;
    // Half way in: the accel curve lags the line, the decel curve leads it.
    expect(slashPhase(time, sweep, inExpo).arc).toBeLessThan(linearArc);
    expect(slashPhase(time, sweep, outExpo).arc).toBeGreaterThan(linearArc);
    // Every cell still lands on the same total sweep, which is what keeps the comparison fair.
    for (const family of EASING_FAMILIES) {
      for (const direction of EASING_DIRECTIONS) {
        expect(slashPhase(LOOP_SECONDS * 0.36, sweep, easingOf(family, direction.id)).arc).toBeCloseTo(sweep, 6);
      }
    }
  });

  test("carry the overshoot of back and elastic into the sweep", () => {
    const sweep = Math.PI;
    // The swing is over at 36% of the loop; mid-window is 24%.
    const time = LOOP_SECONDS * 0.36;
    // `outBack` settles from above: the solved angle never quite returns to the mark mid-flight,
    // so sample the middle of the window instead of the end.
    const mid = LOOP_SECONDS * 0.24;
    const peak = Math.max(...Array.from({ length: 21 }, (_, index) => outBack(index / 20)));
    expect(peak).toBeGreaterThan(1);
    expect(outBack(1)).toBeCloseTo(1, 9);
    expect(slashPhase(mid, sweep, outBack).arc).toBeGreaterThan(sweep * 0.9);
    // `inElastic` dips below zero; the arc is clamped so it can never sweep backwards, but its
    // value still comes out at zero rather than negative.
    const dip = Math.min(...Array.from({ length: 21 }, (_, index) => inElastic(index / 20)));
    expect(dip).toBeLessThan(0);
    expect(slashPhase(LOOP_SECONDS * 0.18, sweep, inElastic).arc).toBeGreaterThanOrEqual(0);
    expect(slashPhase(time, sweep, outBack).arc).toBeCloseTo(sweep, 6);
  });

  test("keep every cell's sweep inside one turn", () => {
    const FULL_TURN = Math.PI * 2;
    // The widest sweep the sidebar allows, at every easing family and direction, sampled across the
    // whole window: `back`/`elastic` overshoot, which is what used to tip the sweep past 360° and
    // make the shape layer throw.
    const widest = 330 * (Math.PI / 180);
    for (const family of EASING_FAMILIES) {
      for (const direction of EASING_DIRECTIONS) {
        const ease = easingOf(family, direction.id);
        for (let step = 0; step <= 40; step++) {
          const arc = slashPhase((step / 40) * LOOP_SECONDS, widest, ease).arc;
          expect(arc).toBeLessThanOrEqual(FULL_TURN + 1e-9);
          expect(arc).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test("report the raw progress the plot playhead rides on", () => {
    const phase = slashPhase(LOOP_SECONDS * 0.24, Math.PI, outExpo);
    expect(phase.progress).toBeGreaterThan(0);
    expect(phase.progress).toBeLessThan(1);
    expect(phase.arc).toBeCloseTo(Math.PI * outExpo(phase.progress), 9);
  });

  test("re-time the whole swing when the duration changes", () => {
    const sweep = Math.PI;
    // At 1.5 s the swing is over at 36% of the loop; at 3 s that is 1.08 s.
    expect(slashPhase(LOOP_SECONDS * 0.36, sweep).arc).toBeCloseTo(sweep, 6);
    expect(slashPhase(3 * 0.36, sweep, undefined, 3).arc).toBeCloseTo(sweep, 6);
    // The same wall-clock instant is further along when the loop is shorter: 0.5 s is past the
    // swing in a 1.5 s loop, and still mid-swing in a 3 s one.
    expect(slashPhase(0.5, sweep, outExpo, 1.5).arc).toBeGreaterThan(sweep * 0.99);
    expect(slashPhase(0.5, sweep, outExpo, 3).arc).toBeLessThan(slashPhase(0.5, sweep, outExpo, 1.5).arc);
    expect(slashPhase(0.5, sweep, outExpo, 3).arc).toBeLessThan(sweep);
    // The progress fraction is duration-independent, which is what the plot playhead rides on.
    expect(slashPhase(1.5 * 0.2, sweep, outExpo, 1.5).progress).toBeCloseTo(
      slashPhase(3 * 0.2, sweep, outExpo, 3).progress,
      6,
    );
  });

  test("wraps a time past the loop", () => {
    const at = LOOP_SECONDS * 0.06;
    expect(slashPhase(LOOP_SECONDS + at, sweep)).toEqual(slashPhase(at, sweep));
    // A negative clock (a scrub beyond the start) lands in the same window.
    expect(slashPhase(-LOOP_SECONDS + at, sweep)).toEqual(slashPhase(at, sweep));
  });
});

describe("battle swing", () => {
  const sweep = 240 * (Math.PI / 180);

  test("start at a full arc and retract, never grow", () => {
    const first = battleSwingPhase(0, sweep);
    expect(first.progress).toBe(0);
    expect(first.eased).toBeCloseTo(0, 6);
    expect(first.remaining).toBeCloseTo(sweep, 6);
    expect(first.fade).toBe(1);

    let previous = sweep;
    for (let time = 0; time <= LOOP_SECONDS; time += 0.02) {
      const phase = battleSwingPhase(time, sweep);
      expect(phase.remaining).toBeLessThanOrEqual(previous + 1e-9);
      expect(phase.remaining).toBeGreaterThanOrEqual(0);
      expect(phase.fade).toBeGreaterThanOrEqual(0);
      expect(phase.fade).toBeLessThanOrEqual(1);
      previous = phase.remaining;
    }
    // The action window is half the loop; after it the arc and the hit mark are gone.
    expect(battleSwingPhase(LOOP_SECONDS * 0.55, sweep).fade).toBe(0);
    expect(battleSwingPhase(LOOP_SECONDS * 0.55, sweep).remaining).toBe(0);
  });

  test("re-time with the duration parameter", () => {
    // A quarter of the way into the action window is the same progress at any duration.
    expect(battleSwingPhase(3 * 0.5 * 0.25, sweep, undefined, 3).progress).toBeCloseTo(0.25, 6);
    expect(battleSwingPhase(LOOP_SECONDS * 0.5 * 0.25, sweep).progress).toBeCloseTo(0.25, 6);
  });

  test("draw one arc per cell on the first frame, and no hit mark", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("battle-slash", drawList, 0);
    const shapes = drawList.commands().filter((command) => command.kind === "shape2d");
    const arcs = shapes.filter((command) => command.kind === "shape2d" && command.shape === "arc");
    expect(arcs).toHaveLength(33);
    // The simulator's rhombus hit mark is intentionally not part of this page.
    expect(shapes.some((command) => command.kind === "shape2d" && command.shape === "rhombus")).toBe(false);
  });

  test("keep the retract eating the same edge on both sides", () => {
    // `heading` decides which edge is the start edge; with the heading pointing right (0) the start
    // edge sits above, and with it pointing left (pi) it still sits above.
    const startOf = (heading: number): readonly [number, number] => {
      const sign = Math.cos(heading) < 0 ? 1 : -1;
      // Three quarters in: the retract has started but the start edge is still above the heading.
      const remaining = sweep * 0.75;
      return [heading - sign * (remaining - sweep / 2), sign * remaining];
    };
    const right = startOf(0);
    const left = startOf(Math.PI);
    // Both end edges stay pinned at heading ± sweep/2; the start edges both sit above the centre.
    expect(right[0] + right[1]).toBeCloseTo(-sweep / 2, 9);
    expect(left[0] + left[1]).toBeCloseTo(Math.PI + sweep / 2, 9);
    // Both start edges are 60° above the heading, i.e. the top side in `world2d`.
    expect(right[0]).toBeCloseTo(Math.PI / 3, 6);
    expect(left[0]).toBeCloseTo(Math.PI - Math.PI / 3, 6);
    expect(Math.sin(right[0])).toBeGreaterThan(0);
    expect(Math.sin(left[0])).toBeGreaterThan(0);
  });
});

describe("hit mark", () => {
  test("draw the unit under the mark", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("hit-mark", drawList, 0);
    const shapes = drawList.commands().flatMap((command) => (command.kind === "shape2d" ? [command] : []));

    // `circle_s` is used by two things in a cell: the navy body and the blue-white plot playhead.
    // The body is the one with the dark red channel.
    const bodies = shapes.filter((command) => command.shape === "circle" && command.filled && command.color[0] < 0.5);
    const rims = shapes.filter((command) => command.shape === "circle" && !command.filled);
    const marks = shapes.filter((command) => command.shape === "rhombus" && command.filled);
    // The simulator's white hit flash is intentionally not drawn: it would cover the unit.
    const flashes = shapes.filter(
      (command) => command.shape === "circle" && command.filled && command.color[0] === 1 && command.color[1] === 1,
    );

    expect(bodies).toHaveLength(33);
    expect(rims).toHaveLength(33);
    expect(marks).toHaveLength(33);
    expect(flashes).toHaveLength(0);

    // The body is drawn before the mark, so the cut reads as being on the unit rather than beside it.
    const firstMark = shapes.findIndex((command) => command.shape === "rhombus");
    const beforeMark = shapes.slice(0, firstMark);
    expect(beforeMark.some((command) => command.shape === "circle")).toBe(true);
  });

  test("drop the mark once the action window is over", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("hit-mark", drawList, LOOP_SECONDS * 0.6);
    const shapes = drawList.commands().flatMap((command) => (command.kind === "shape2d" ? [command] : []));
    // The hit itself is over: no mark — the body, its rim and the plot playhead remain.
    expect(shapes.filter((command) => command.shape === "rhombus")).toHaveLength(0);
    expect(shapes.filter((command) => command.shape === "circle" && !command.filled)).toHaveLength(33);
    expect(shapes.filter((command) => command.shape === "circle" && command.filled && command.color[0] < 0.5)).toHaveLength(33);
  });

  test("stretch the long axis only", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("hit-mark", drawList, 0);
    const first = drawList
      .commands()
      .flatMap((command) => (command.kind === "shape2d" && command.shape === "rhombus" ? [command] : []))[0];
    expect(first).toBeDefined();
    // `size` holds the half diagonals; the short one is 0.225 of the long one at the first frame.
    expect(first!.size[1] / first!.size[0]).toBeCloseTo(0.225, 6);
  });
});

describe("hit flash", () => {
  const shapesOf = (time: number) => {
    const drawList = new FrameDrawList();
    buildVfxScene("hit-flash", drawList, time);
    return drawList.commands().flatMap((command) => (command.kind === "shape2d" ? [command] : []));
  };
  const isWhite = (color: readonly number[]): boolean => color[0] === 1 && color[1] === 1 && color[2] === 1;

  test("cover the body with a white flash on the first frame", () => {
    const shapes = shapesOf(0);
    const bodies = shapes.filter((command) => command.shape === "circle" && command.filled && command.color[0] < 0.5);
    const rims = shapes.filter((command) => command.shape === "circle" && !command.filled);
    const flashes = shapes.filter((command) => command.shape === "circle" && command.filled && isWhite(command.color));

    expect(bodies).toHaveLength(33);
    expect(rims).toHaveLength(33);
    expect(flashes).toHaveLength(33);
    // The flash covers the body, so it is drawn after it — the body is the first thing in a cell.
    const firstFlash = shapes.findIndex((command) => command.shape === "circle" && command.filled && isWhite(command.color));
    expect(shapes.slice(0, firstFlash).some((command) => command.shape === "circle" && !command.filled)).toBe(true);
  });

  test("drop the flash once the action window is over", () => {
    const shapes = shapesOf(LOOP_SECONDS * 0.6);
    expect(shapes.filter((command) => command.shape === "circle" && command.filled && isWhite(command.color))).toHaveLength(0);
    // The body and its rim stay: the unit is not the effect.
    expect(shapes.filter((command) => command.shape === "circle" && !command.filled)).toHaveLength(33);
  });

  test("decay on the cell's own curve", () => {
    const at = LOOP_SECONDS * 0.24;
    const slow = actionPhase(at, inCirc, LOOP_SECONDS, 0.5, LOOP_SECONDS);
    const fast = actionPhase(at, outCirc, LOOP_SECONDS, 0.5, LOOP_SECONDS);
    // `inCirc` is the simulator's timing: the flash is still bright there, while `outCirc` has
    // almost finished. Same instant, same flash, different curve.
    expect(slow.fade).toBeGreaterThan(0.7);
    expect(fast.fade).toBeLessThan(0.2);
  });

  test("tint the flash with its own hue and saturation", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("hit-flash", drawList, 0, undefined, undefined, {
      duration: LOOP_SECONDS,
      unitRadius: 0.55,
      flash: 1,
      unitHue: 0.6,
      unitSaturation: 0.82,
      flashHue: 0,
      flashSaturation: 1,
    });
    const shapes = drawList.commands().flatMap((command) => (command.kind === "shape2d" ? [command] : []));
    const reds = shapes.filter((command) => command.shape === "circle" && command.filled && command.color[0] === 1 && command.color[1] < 0.1);
    expect(reds).toHaveLength(33);
  });
});

describe("light pillar", () => {
  const shapesOf = (time: number, params: Record<string, number> = {}) => {
    const drawList = new FrameDrawList();
    buildVfxScene("light-pillar", drawList, time, undefined, undefined, params);
    return drawList.commands().flatMap((command) => (command.kind === "shape2d" ? [command] : []));
  };
  // The curve rows are filled rectangles too, so the shaft is the stage only: everything the column
  // and its pool draw stands above the timeline.
  const stageOf = (shapes: ReturnType<typeof shapesOf>) => shapes.filter((command) => command.center[1] > 0);
  const layersOf = (shapes: ReturnType<typeof shapesOf>) =>
    stageOf(shapes).filter((command) => command.shape === "rect" && command.filled);
  const poolsOf = (shapes: ReturnType<typeof shapesOf>) =>
    stageOf(shapes).filter((command) => command.shape === "ellipse" && command.filled);
  const ringsOf = (shapes: ReturnType<typeof shapesOf>) =>
    stageOf(shapes).filter((command) => command.shape === "ellipse" && !command.filled);
  /** Loop position `share` of the way through the rise, the hold or the scatter. */
  const at = (share: number): number => PILLAR_LOOP_SECONDS * share;
  const widest = (shapes: ReturnType<typeof shapesOf>): number =>
    Math.max(...layersOf(shapes).map((command) => command.size[0] * 2));

  test("start from nothing and rise out of the floor", () => {
    const first = shapesOf(0);
    // Nothing is lit on the first frame: no shaft, and no pool under where it will stand.
    expect(layersOf(first)).toHaveLength(0);
    expect(poolsOf(first)).toHaveLength(0);

    const rising = shapesOf(at(PILLAR_RISE_RATIO * 0.12));
    expect(layersOf(rising)).toHaveLength(PILLAR_LAYER_COUNT);
    expect(poolsOf(rising)).toHaveLength(2);
    // Early in the rise it is still shorter than the settled column.
    const tallest = (shapes: ReturnType<typeof shapesOf>): number =>
      Math.max(...layersOf(shapes).map((command) => command.size[1] * 2));
    expect(tallest(rising)).toBeLessThan(tallest(shapesOf(at(PILLAR_HOLD_RATIO * 0.6))));
  });

  test("plant the column: overshoot the height, then settle onto it", () => {
    expect(shaftHeight(pillarPhaseAt(0))).toBe(0);
    // The snap goes past the final height before the settle brings it back — that is the beat the
    // eye reads as the column being driven into the floor instead of fading in at its own size.
    expect(shaftHeight(pillarPhaseAt(PILLAR_RISE_RATIO * 0.3))).toBeGreaterThan(1);
    expect(shaftHeight(pillarPhaseAt(PILLAR_RISE_RATIO))).toBeCloseTo(1, 6);
    // Nothing moves during the hold, and the hold is long enough to see.
    expect(shaftHeight(pillarPhaseAt(PILLAR_HOLD_RATIO))).toBeCloseTo(1, 6);
    expect((PILLAR_HOLD_RATIO - PILLAR_RISE_RATIO) * PILLAR_LOOP_SECONDS).toBeGreaterThan(0.25);
  });

  test("push the floor pool open instead of popping it into place", () => {
    // The pool is opened *by* the column: nothing there on the first frame, narrow while the column
    // is still climbing, full by the time it has arrived.
    expect(pillarPoolSpread(pillarPhaseAt(0))).toBe(0);
    expect(poolBrightness(pillarPhaseAt(0))).toBe(0);
    expect(pillarPoolSpread(pillarPhaseAt(PILLAR_RISE_RATIO * 0.3))).toBeLessThan(
      pillarPoolSpread(pillarPhaseAt(PILLAR_RISE_RATIO * 0.8)),
    );
    // Sampled mid-hold, where the breath is back at zero.
    expect(pillarPoolSpread(pillarPhaseAt((PILLAR_RISE_RATIO + PILLAR_HOLD_RATIO) / 2))).toBeCloseTo(1, 6);
    // And the ring it drives out of the floor runs ahead of the pool, then is gone.
    expect(pushRingReach(pillarPhaseAt(0))).toBe(0);
    expect(pushRingReach(pillarPhaseAt(PILLAR_RISE_RATIO * 0.5))).toBeGreaterThan(0.5);
    expect(pushRingBrightness(pillarPhaseAt(PILLAR_RISE_RATIO * 0.5))).toBeGreaterThan(0);
    expect(pushRingBrightness(pillarPhaseAt(PILLAR_RISE_RATIO))).toBe(0);
  });

  /** The phase `share` of the way through the hold: 0 is the end of the snap, 1 the burst frame. */
  const duringHold = (share: number) =>
    pillarPhaseAt(PILLAR_RISE_RATIO + (PILLAR_HOLD_RATIO - PILLAR_RISE_RATIO) * share);
  const holdTime = (share: number): number =>
    PILLAR_LOOP_SECONDS * (PILLAR_RISE_RATIO + (PILLAR_HOLD_RATIO - PILLAR_RISE_RATIO) * share);

  test("breathe while it holds: size and light swing, both ends on zero", () => {
    // One cycle across the hold, and both ends land on zero so the snap and the burst stay clean.
    expect(pillarBreath(duringHold(0))).toBeCloseTo(0, 6);
    expect(pillarBreath(duringHold(0.25))).toBeCloseTo(1, 6);
    expect(pillarBreath(duringHold(0.5))).toBeCloseTo(0, 6);
    expect(pillarBreath(duringHold(0.75))).toBeCloseTo(-1, 6);
    expect(pillarBreath(duringHold(1))).toBeCloseTo(0, 6);
    // The swing shows up in the width, the height and the light, all in phase.
    expect(shaftWidth(duringHold(0.25))).toBeGreaterThan(shaftWidth(duringHold(0.75)));
    expect(shaftHeight(duringHold(0.25))).toBeGreaterThan(shaftHeight(duringHold(0.75)));
    expect(shaftBrightness(duringHold(0.25))).toBeGreaterThan(shaftBrightness(duringHold(0.75)));
    // Nothing breathes while the column is being planted or thrown open.
    expect(pillarBreath(pillarPhaseAt(PILLAR_RISE_RATIO * 0.5))).toBe(0);
    expect(pillarBreath(pillarPhaseAt(PILLAR_HOLD_RATIO + 0.05))).toBe(0);
  });

  test("swing the colour with the breath", () => {
    const coloursAt = (share: number) => layersOf(shapesOf(holdTime(share)))[0]!.color;
    const swollen = coloursAt(0.25);
    const sunken = coloursAt(0.75);
    expect(swollen).not.toEqual(sunken);
    // The swell is the paler one: its blue stays and the other channels climb towards white.
    expect(swollen[0]).toBeGreaterThan(sunken[0]);
  });

  test("hold at full height in between the two phases", () => {
    const height = shaftHeight(pillarPhaseAt((PILLAR_RISE_RATIO + PILLAR_HOLD_RATIO) / 2));
    expect(height).toBeCloseTo(1, 6);
    // Brightness is already full before the height is, and stays there through the hold.
    expect(shaftBrightness(pillarPhaseAt(PILLAR_RISE_RATIO * 0.6))).toBeCloseTo(1, 6);
    expect(shaftBrightness(pillarPhaseAt((PILLAR_RISE_RATIO + PILLAR_HOLD_RATIO) / 2))).toBeCloseTo(1, 6);
  });

  /** The phase `share` of the way through the scatter: 0 is the burst frame, 1 its end. */
  const atShare = (share: number) => pillarPhaseAt(PILLAR_HOLD_RATIO + (PILLAR_FADE_RATIO - PILLAR_HOLD_RATIO) * share);
  /** The same point in the loop, for the draw-list tests. */
  const atShareTime = (share: number): number =>
    PILLAR_LOOP_SECONDS * (PILLAR_HOLD_RATIO + (PILLAR_FADE_RATIO - PILLAR_HOLD_RATIO) * share);

  test("burst: open the shaft and drop the light in the first third of the scatter", () => {
    // `outExpo` inside `BURST_RATIO`: most of the widening is already done a tenth in.
    expect(shaftScatter(atShare(0))).toBe(0);
    expect(shaftScatter(atShare(0.1))).toBeGreaterThan(0.5);
    expect(shaftScatter(atShare(PILLAR_BURST_RATIO))).toBeCloseTo(1, 6);
    // The light follows the burst down and leaves a haze behind, rather than easing out all the way.
    const afterBurst = shaftBrightness(atShare(PILLAR_BURST_RATIO));
    expect(afterBurst).toBeGreaterThan(0.1);
    expect(afterBurst).toBeLessThan(0.35);
    expect(shaftBrightness(atShare(0.05))).toBeLessThan(0.9);
    // And the haze keeps fading from there instead of holding.
    expect(shaftBrightness(atShare(0.7))).toBeLessThan(afterBurst);
  });

  test("scatter wider, and fold the layers into one haze", () => {
    const held = shapesOf(at(PILLAR_HOLD_RATIO * 0.8));
    const scattered = shapesOf(at(PILLAR_HOLD_RATIO + (PILLAR_FADE_RATIO - PILLAR_HOLD_RATIO) * 0.85));
    expect(widest(scattered)).toBeGreaterThan(widest(held));

    // The four fills are a shaft while it stands and a single width once it has scattered, so the
    // narrowest/outermost ratio climbs towards 1: that fold is what makes it a haze.
    const foldRatio = (shapes: ReturnType<typeof shapesOf>): number => {
      const widths = layersOf(shapes).map((command) => command.size[0] * 2);
      return Math.min(...widths) / Math.max(...widths);
    };
    expect(foldRatio(scattered)).toBeGreaterThan(foldRatio(held));
    expect(shaftScatter(pillarPhaseAt(PILLAR_FADE_RATIO))).toBeCloseTo(1, 6);
    expect(shaftScatter(pillarPhaseAt(PILLAR_HOLD_RATIO))).toBe(0);
  });

  test("open the pool with the column and take it away with it", () => {
    const held = shapesOf(at(PILLAR_HOLD_RATIO * 0.8));
    expect(poolBrightness(pillarPhaseAt(PILLAR_HOLD_RATIO * 0.8))).toBeGreaterThan(0.9);
    const poolWidth = (shapes: ReturnType<typeof shapesOf>): number => Math.max(...poolsOf(shapes).map((c) => c.size[0]));
    const bursting = shapesOf(at(PILLAR_HOLD_RATIO + (PILLAR_FADE_RATIO - PILLAR_HOLD_RATIO) * 0.25));
    expect(poolWidth(bursting)).toBeGreaterThan(poolWidth(held));
    // The pool hands the floor over to the ring: it is gone well before the shaft is.
    expect(poolsOf(shapesOf(at(PILLAR_HOLD_RATIO + (PILLAR_FADE_RATIO - PILLAR_HOLD_RATIO) * 0.8)))).toHaveLength(0);
  });

  test("throw a shock ring off the pool on the burst frame", () => {
    const ringAt = (share: number) => ringsOf(shapesOf(atShareTime(share)));
    // Nothing on the floor before the burst: only the pool is lit during the hold.
    expect(ringAt(-0.1)).toHaveLength(0);
    const early = ringAt(0.1);
    const later = ringAt(0.3);
    expect(early).toHaveLength(1);
    expect(later).toHaveLength(1);
    // It outruns the pool and thins as it goes.
    expect(later[0]!.size[0]).toBeGreaterThan(early[0]!.size[0]);
    expect(later[0]!.thickness).toBeLessThan(early[0]!.thickness);
    // Its reach is flat on the floor, not a circle standing around the shaft.
    expect(later[0]!.size[1]).toBeCloseTo(later[0]!.size[0] * 0.18, 6);
    // Gone by `RING_LIFE`, which is exactly when it is at its widest.
    expect(ringReach(atShare(1))).toBeCloseTo(1, 6);
    expect(ringAt(1)).toHaveLength(0);
  });

  test("drop the ring when its slider is zero", () => {
    const shapes = shapesOf(at(PILLAR_HOLD_RATIO + (PILLAR_FADE_RATIO - PILLAR_HOLD_RATIO) * 0.2), { ring: 0 });
    expect(ringsOf(shapes)).toHaveLength(0);
    // The shaft still bursts; only the floor layer is missing.
    expect(layersOf(shapes).length).toBe(PILLAR_LAYER_COUNT);
  });

  test("leave the stage empty once the scatter is over", () => {
    const shapes = shapesOf(PILLAR_LOOP_SECONDS * 0.95);
    expect(layersOf(shapes)).toHaveLength(0);
    expect(poolsOf(shapes)).toHaveLength(0);
    expect(ringsOf(shapes)).toHaveLength(0);
  });

  test("tint the column without adding a second colour", () => {
    const shapes = shapesOf(at(PILLAR_HOLD_RATIO * 0.8), { hue: 0, saturation: 1 });
    const reds = layersOf(shapes).filter((command) => command.color[0] > 0.9 && command.color[1] < 0.2);
    expect(reds.length).toBeGreaterThan(0);
    // The pool is the same colour as the shaft, not a second one.
    for (const pool of poolsOf(shapes)) expect(pool.color[1]).toBeLessThan(0.2);
  });

  test("label every element row and draw one shared playhead", () => {
    const drawList = new FrameDrawList();
    buildVfxScene("light-pillar", drawList, at(PILLAR_HOLD_RATIO));
    const texts = drawList
      .commands()
      .flatMap((command) => (command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : []));
    expect(texts).toEqual(
      expect.arrayContaining(["光柱 · 升起", "光柱 · 扩散", "光柱 · 亮度", "地面 · 光池 / 撑开", "地面 · 冲击环"]),
    );
    expect(texts).toEqual(expect.arrayContaining(["0.00s", "0.40s", "0.80s"]));
  });
});

describe("heal beam", () => {
  const shapesOf = (time: number, params?: Record<string, number>) => {
    const drawList = new FrameDrawList();
    buildVfxScene("heal-beam", drawList, time, undefined, undefined, params);
    return drawList.commands().flatMap((command) => (command.kind === "shape2d" ? [command] : []));
  };
  /** The column's bands: vertical strokes sized in world units, which is what the effect draws. */
  const bandsOf = (time: number, params?: Record<string, number>) => {
    const drawList = new FrameDrawList();
    buildVfxScene("heal-beam", drawList, time, undefined, undefined, params);
    return drawList
      .commands()
      .flatMap((command) => (command.kind === "line2d" ? [command] : []))
      .filter((command) => command.widthMode === "world" && command.start[0] === command.end[0]);
  };
  const textsOf = (time: number) => {
    const drawList = new FrameDrawList();
    buildVfxScene("heal-beam", drawList, time);
    return drawList
      .commands()
      .flatMap((command) => (command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : []));
  };

  test("phase splits the loop into spread, grow and fade", () => {
    const first = healPhase(0);
    expect(first.progress).toBe(0);
    expect(first.spread).toBe(0);
    // Nothing has grown on the first frame: the column exists only once the loop starts.
    expect(first.grow).toBe(0);
    expect(first.fade).toBe(1);

    // The column is up at the end of the grow window and holds there; the pool never stops opening.
    expect(healPhase(LOOP_SECONDS * GROW_RATIO).grow).toBeCloseTo(1, 6);
    expect(healPhase(LOOP_SECONDS * 0.6).grow).toBeCloseTo(1, 6);
    expect(healPhase(LOOP_SECONDS * 0.6).spread).toBeGreaterThan(healPhase(LOOP_SECONDS * 0.3).spread);
    // Fade is the straight line down, and it reaches zero at the end of the loop.
    expect(healPhase(LOOP_SECONDS * 0.25).fade).toBeCloseTo(0.75, 6);
    expect(healPhase(LOOP_SECONDS - 1e-9).fade).toBeCloseTo(0, 6);
    // A clock outside the loop wraps instead of extrapolating.
    expect(healPhase(LOOP_SECONDS + LOOP_SECONDS * 0.25).progress).toBeCloseTo(0.25, 6);
    expect(healPhase(-LOOP_SECONDS * 0.25).progress).toBeCloseTo(0.75, 6);
  });

  test("sparks ride staggered phases and die at both ends", () => {
    const count = 4;
    for (let index = 0; index < count; index++) {
      // Spark `index` wraps once per loop: its birth and its death are the same instant, at
      // `1 - index/count`. That is the seam the sine exists to hide.
      const seam = (1 - index / count) % 1;
      expect(sparkBrightness(seam, index, count, 1)).toBeCloseTo(0, 6);
      // …and its peak sits half a window later.
      expect(sparkBrightness((seam + 0.5) % 1, index, count, 1)).toBeCloseTo(1, 6);
    }
    // The fade scales every spark at once; a zero count draws no spark at all.
    expect(sparkBrightness(0.5, 0, count, 0.5)).toBeCloseTo(0.5, 6);
    expect(sparkBrightness(0.5, 0, 0, 1)).toBe(0);
  });

  test("grow the column from nothing and hold it at full height", () => {
    // The first frame has no column at all — the pool and the body only.
    expect(bandsOf(0)).toHaveLength(0);
    const tallest = (time: number): number =>
      Math.max(...bandsOf(time).map((command) => Math.abs(command.end[1] - command.start[1])));
    expect(tallest(LOOP_SECONDS * GROW_RATIO)).toBeGreaterThan(0);
    // Once the grow window is over the column holds its height; only its alpha keeps falling.
    expect(tallest(LOOP_SECONDS * 0.5)).toBeCloseTo(tallest(LOOP_SECONDS * GROW_RATIO), 6);
    // The stack is the cone-shaped ladder: each band narrower than the one outside it and no wider
    // than the column's declared width.
    const bands = bandsOf(LOOP_SECONDS * 0.5);
    expect(bands).toHaveLength(BEAM_BAND_COUNT);
    const widths = bands.map((command) => command.width);
    for (let index = 1; index < widths.length; index++) expect(widths[index]!).toBeLessThan(widths[index - 1]!);
    // Every band goes transparent at the top, which is the 2D layer's only gradient.
    for (const band of bands) expect(band.colorEnd[3]).toBe(0);
  });

  test("spread the ground pool and fade the whole effect out", () => {
    const pool = (time: number): number =>
      Math.max(...shapesOf(time).filter((command) => command.shape === "ellipse").map((command) => command.size[0]));
    // Two concentric ellipses: a wide dim one that spreads, and a bright core inside it.
    const ellipses = shapesOf(LOOP_SECONDS * 0.5).filter((command) => command.shape === "ellipse");
    expect(ellipses).toHaveLength(2);
    expect(ellipses[1]!.size[0]).toBeCloseTo(ellipses[0]!.size[0] * 0.5, 6);
    expect(ellipses[0]!.size[1]).toBeCloseTo(ellipses[0]!.size[0] * 0.42, 6);
    // The pool opens over the whole loop, and its alpha is the square of the fade.
    expect(pool(LOOP_SECONDS * 0.6)).toBeGreaterThan(pool(LOOP_SECONDS * 0.2));
    const late = shapesOf(LOOP_SECONDS * 0.9).filter((command) => command.shape === "ellipse")[0]!;
    const early = shapesOf(LOOP_SECONDS * 0.1).filter((command) => command.shape === "ellipse")[0]!;
    expect(late.color[3]).toBeLessThan(early.color[3]);
  });

  test("draw one spark per slice, and none when the slider is at zero", () => {
    // The sparks are the stage's small green-dominant filled circles: the unit body is a big one,
    // and the timeline's curve dots live to the right of the rows' left edge.
    const sparksAt = (params: Record<string, number>): number =>
      shapesOf(LOOP_SECONDS * 0.3, params).filter(
        (command) =>
          command.shape === "circle" &&
          command.filled &&
          command.center[0] < TIMELINE_LAYOUT.left &&
          command.size[0] < 0.5 &&
          command.color[1] > command.color[0],
      ).length;
    expect(sparksAt({ duration: LOOP_SECONDS, sparks: 5 })).toBe(5);
    expect(sparksAt({ duration: LOOP_SECONDS, sparks: 0 })).toBe(0);
  });

  test("label every element row and draw one shared playhead", () => {
    const texts = textsOf(LOOP_SECONDS * 0.4);
    expect(texts).toEqual(expect.arrayContaining(["地面光斑", "柱身", "柱身亮度", "上升光点"]));
    // Time ticks under the last row: 0, half the loop, the whole loop.
    expect(texts).toEqual(expect.arrayContaining(["0.00s", "0.40s", "0.80s"]));

    // One screen-space vertical spanning every row; its x is the same progress the stage uses.
    const drawList = new FrameDrawList();
    buildVfxScene("heal-beam", drawList, LOOP_SECONDS * 0.5);
    const verticals = drawList
      .commands()
      .flatMap((command) => (command.kind === "line2d" ? [command] : []))
      .filter(
        (command) =>
          command.widthMode !== "world" && command.start[0] === command.end[0] && Math.abs(command.end[1] - command.start[1]) > 5,
      );
    expect(verticals).toHaveLength(1);
    expect(verticals[0]!.start[0]).toBeCloseTo(TIMELINE_LAYOUT.left + TIMELINE_LAYOUT.width * 0.5, 6);
  });
});

describe("fireball", () => {
  const commandsOf = (progress: number) => {
    const drawList = new FrameDrawList();
    buildVfxScene("fireball", drawList, progress * LOOP_SECONDS);
    return drawList.commands();
  };
  const shapesOf = (progress: number) =>
    commandsOf(progress).flatMap((command) => (command.kind === "shape2d" ? [command] : []));
  /** The column's bands are the only world-width vertical strokes on this page. */
  const textsOf = (progress: number) =>
    commandsOf(progress).flatMap((command) =>
      command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : [],
    );

  test("split the loop into windup, flight and blast", () => {
    const start = fireballPhase(0);
    expect(start.charge).toBe(0);
    expect(start.flight).toBe(0);
    expect(start.blast).toBe(0);
    // The windup saturates exactly at the launch, and the launch is where flight leaves zero.
    expect(fireballPhase(LOOP_SECONDS * CHARGE_RATIO).charge).toBeCloseTo(1, 6);
    expect(fireballPhase(LOOP_SECONDS * CHARGE_RATIO).flight).toBeCloseTo(0, 6);
    expect(fireballPhase(LOOP_SECONDS * CHARGE_RATIO * 2).flight).toBeGreaterThan(0);
    // The ball lands at `HIT_RATIO`: flight is complete and the blast opens from zero.
    expect(fireballPhase(LOOP_SECONDS * HIT_RATIO).flight).toBeCloseTo(1, 6);
    expect(fireballPhase(LOOP_SECONDS * HIT_RATIO).blast).toBeCloseTo(0, 6);
    expect(fireballPhase(LOOP_SECONDS * HIT_RATIO + 1e-6).blast).toBeGreaterThan(0);
    // Nothing flies after the hit.
    expect(fireballPhase(LOOP_SECONDS * 0.9).flight).toBeCloseTo(1, 6);
    // A clock outside the loop wraps instead of extrapolating.
    expect(fireballPhase(LOOP_SECONDS * 1.25).progress).toBeCloseTo(0.25, 6);
    expect(fireballPhase(-LOOP_SECONDS * 0.25).progress).toBeCloseTo(0.75, 6);
  });

  test("ease the flight so the ball is fastest mid-air", () => {
    // Equal time steps cover more distance in the middle of the flight window than at its ends.
    const at = (t: number) => fireballPosition(fireballPhaseAt(t))[0];
    const step = 0.02;
    const middle = (CHARGE_RATIO + HIT_RATIO) / 2;
    const here = at(middle + step) - at(middle);
    expect(here).toBeGreaterThan(at(CHARGE_RATIO + step) - at(CHARGE_RATIO));
    expect(here).toBeGreaterThan(at(HIT_RATIO) - at(HIT_RATIO - step));
    // It still starts at the caster's edge and ends on the target, and never goes backwards.
    expect(at(CHARGE_RATIO)).toBeCloseTo(CASTER[0] + BODY_RADIUS * 0.55, 6);
    expect(at(HIT_RATIO)).toBeCloseTo(TARGET[0], 6);
    let previous = -Infinity;
    for (let index = 0; index <= 40; index++) {
      const value = at((index / 40) * HIT_RATIO);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  test("draw one fireball: the windup ember hands over to the ball", () => {
    // On the first frame the ball has no size at all, and the ember is at the caster.
    expect(fireballRadius(fireballPhase(0))).toBeCloseTo(0.42, 6);
    // Half way through the windup it is bigger, and at the launch it is full size.
    expect(fireballRadius(fireballPhase(LOOP_SECONDS * CHARGE_RATIO * 0.5))).toBeGreaterThan(0.42);
    expect(fireballRadius(fireballPhase(LOOP_SECONDS * CHARGE_RATIO))).toBeCloseTo(1, 6);
    // In flight the ball is a body plus a halo plus a core, and the tail is behind it.
    const flying = shapesOf(0.3).filter((command) => command.shape === "circle");
    expect(flying.length).toBeGreaterThan(0);
    // After the hit the ball is gone: every blast circle sits within the blast's reach of the target,
    // and none of them is anywhere near the caster. Stage layers carry a zIndex; the timeline's curve
    // dots do not, which is how this stays a test about the stage.
    const blast = shapesOf(0.6).filter((command) => command.shape === "circle" && command.zIndex > 0);
    expect(blast.length).toBeGreaterThan(0);
    for (const circle of blast) {
      expect(Math.abs(circle.center[0] - TARGET[0])).toBeLessThan(BODY_RADIUS * 6);
      expect(Math.abs(circle.center[0] - CASTER[0])).toBeGreaterThan(BODY_RADIUS * 4);
    }
    // The ember only exists while the ball has not launched.
    expect(tailBrightness(fireballPhase(0))).toBe(0);
    expect(tailBrightness(fireballPhase(LOOP_SECONDS * 0.3))).toBeGreaterThan(0);
    expect(tailBrightness(fireballPhase(LOOP_SECONDS * 0.6))).toBe(0);
  });

  test("open the four blast layers on four different clocks", () => {
    // On the hit frame the flash is full and both rings are still at zero.
    const hit = fireballPhase(LOOP_SECONDS * HIT_RATIO + 1e-6);
    expect(flashBrightness(hit)).toBeGreaterThan(0.99);
    expect(ringRadius(hit)).toBeLessThan(0.01);
    expect(slowRingRadius(hit)).toBeLessThan(0.01);

    // A fifth of the way in: the flash is gone, the fast ring is nearly done, the slow one lags.
    const early = fireballPhase(LOOP_SECONDS * HIT_RATIO + (LOOP_SECONDS * (1 - HIT_RATIO)) / 5);
    expect(flashBrightness(early)).toBe(0);
    expect(ringRadius(early)).toBeGreaterThan(slowRingRadius(early));
    expect(slowRingRadius(early)).toBeLessThan(1);

    // The sparks are out and gone before the slow ring has finished travelling.
    expect(fireballSparkBrightness(early)).toBeGreaterThan(0);
    const later = fireballPhase(LOOP_SECONDS * HIT_RATIO + (LOOP_SECONDS * (1 - HIT_RATIO)) * 0.7);
    expect(fireballSparkBrightness(later)).toBe(0);
    // The slow ring is still short of its full travel there — it is the longest of the four clocks.
    expect(slowRingRadius(later)).toBeLessThan(1);
    const last = fireballPhase(LOOP_SECONDS * HIT_RATIO + (LOOP_SECONDS * (1 - HIT_RATIO)) * 0.9);
    expect(slowRingRadius(last)).toBeCloseTo(1, 6);

    // Embers outlive every other layer — they are still dimly there at the end of the loop.
    expect(emberBrightness(last)).toBeGreaterThan(0);
    expect(emberBrightness(fireballPhase(LOOP_SECONDS - 1e-6))).toBeCloseTo(0, 5);
    // Sparks are thrown far and die young; embers stay near the target and outlive them. That
    // separation is what keeps the two from reading as one layer.
    expect(SPARK_TRAVEL).toBeGreaterThan(EMBER_TRAVEL);
    const sparksGone = fireballPhase(LOOP_SECONDS * HIT_RATIO + (LOOP_SECONDS * (1 - HIT_RATIO)) * 0.6);
    expect(fireballSparkBrightness(sparksGone)).toBe(0);
    expect(emberBrightness(sparksGone)).toBeGreaterThan(0.3);
  });

  test("contract the fire body instead of fading it", () => {
    // It opens to full size and then shrinks back to nothing: the body leaves the stage by
    // contracting, because a half-transparent orange disc over a dark background is brown.
    // `t` here is the blast fraction the module measures against its own span.
    const at = (t: number) => burstRadius(fireballPhaseAt(HIT_RATIO + (1 - HIT_RATIO) * t));
    expect(at(0)).toBeCloseTo(0, 6);
    expect(at(BURST_SPAN * BURST_OPEN)).toBeCloseTo(1, 6);
    expect(at(BURST_SPAN * 0.8)).toBeLessThan(1);
    expect(at(BURST_SPAN)).toBeCloseTo(0, 6);
    // Its brightness never fades: the radius is what ends the layer.
    expect(burstBrightness(fireballPhaseAt(HIT_RATIO + (1 - HIT_RATIO) * BURST_SPAN * 0.9))).toBe(1);
  });

  test("label every element row and draw one shared playhead", () => {
    const texts = textsOf(0.4);
    expect(texts).toEqual(expect.arrayContaining(["火球 · 飞行", "火球 · 大小", "爆炸 · 闪光 / 冲击环", "爆炸 · 火花 / 余烬"]));
    expect(texts).toEqual(expect.arrayContaining(["0.00s", "0.40s", "0.80s"]));

    // One screen-space vertical spanning every row, at the playhead's x.
    const verticals = commandsOf(0.5)
      .flatMap((command) => (command.kind === "line2d" ? [command] : []))
      .filter(
        (command) =>
          command.widthMode !== "world" &&
          command.start[0] === command.end[0] &&
          Math.abs(command.end[1] - command.start[1]) > 5,
      );
    expect(verticals).toHaveLength(1);
    expect(verticals[0]!.start[0]).toBeCloseTo(FIREBALL_TIMELINE_LAYOUT.left + FIREBALL_TIMELINE_LAYOUT.width * 0.5, 6);
  });
});

describe("chain lightning", () => {
  const commandsOf = (time: number, params: Record<string, number> = {}) => {
    const drawList = new FrameDrawList();
    buildVfxScene("chain-lightning", drawList, time, undefined, undefined, params);
    return drawList.commands();
  };

  const widthsOf = (commands: ReturnType<typeof commandsOf>) =>
    commands.flatMap((command) =>
      command.kind === "line2d" && command.widthMode === "world" ? [command.width] : [],
    );

  test("charge, strike, then fork on the hit frame", () => {
    // The caster only charges: no bolt exists before the hit frame.
    expect(chainPhaseAt(0).charge).toBe(0);
    expect(chainPhaseAt(CHAIN_CHARGE_RATIO * 0.5).charge).toBeCloseTo(0.5, 6);
    expect(chainPhaseAt(CHAIN_CHARGE_RATIO * 0.5).strike).toBe(0);
    expect(chainPhaseAt(STRIKE_RATIO - 1e-9).fork).toBe(0);
    expect(chainPhaseAt(STRIKE_RATIO - 1e-9).flash).toBe(0);
    expect(chainPhaseAt(STRIKE_RATIO - 1e-9).ring).toBe(0);
    expect(chainPhaseAt(STRIKE_RATIO - 1e-9).fade).toBe(0);
    // The hit frame is the whole strike: full-length main bolt, every fork present, full brightness.
    expect(chainPhaseAt(STRIKE_RATIO).strike).toBeCloseTo(1, 6);
    const after = STRIKE_RATIO + 1e-6;
    expect(chainPhaseAt(after).fork).toBe(1);
    expect(chainPhaseAt(after).flash).toBeGreaterThan(0.999);
    expect(chainPhaseAt(after).fade).toBeGreaterThan(0.999);
    // It lands inside the first tenth of the loop, and the forks are never partially drawn.
    expect(STRIKE_RATIO).toBeLessThan(0.1);
  });

  test("flick twice, then leave the rest of the loop empty", () => {
    // Three kicks, each weaker than the one before: the strike plus two afterglow beats.
    const kick = (index: number) => strikePulse(index / BOLT_PULSES);
    expect(kick(0)).toBeCloseTo(1, 6);
    expect(kick(1)).toBeCloseTo(1 - 1 / BOLT_PULSES, 6);
    expect(kick(2)).toBeCloseTo(1 - 2 / BOLT_PULSES, 6);
    expect(kick(1)).toBeLessThan(kick(0));
    expect(kick(2)).toBeLessThan(kick(1));
    // Between the kicks the tree is dark: that gap is what makes it a strike rather than a fade.
    expect(strikePulse(1 / BOLT_PULSES - 1e-9)).toBeLessThan(1e-6);
    // After `BOLT_LIFE` nothing is left for the rest of the loop — the empty air is the effect.
    expect(chainPhaseAt(STRIKE_RATIO + BOLT_LIFE * 0.5).fade).toBeGreaterThan(0);
    expect(chainPhaseAt(STRIKE_RATIO + BOLT_LIFE).fade).toBe(0);
    expect(chainPhaseAt(STRIKE_RATIO + BOLT_LIFE + 1e-6).fade).toBe(0);
    expect(chainPhaseAt(1 - 1e-9).fade).toBe(0);
    expect(STRIKE_RATIO + BOLT_LIFE).toBeLessThan(0.5);
    // A clock outside the loop wraps instead of extrapolating.
    expect(chainPhase(LOOP_SECONDS + LOOP_SECONDS * 0.5).progress).toBeCloseTo(0.5, 6);
    expect(chainPhase(-LOOP_SECONDS * 0.25).progress).toBeCloseTo(0.75, 6);
  });

  test("clamp the target count to the fixed slots", () => {
    expect(enemyCount({})).toBe(4);
    expect(enemyCount({ targets: 0 })).toBe(1);
    expect(enemyCount({ targets: 2.4 })).toBe(2);
    expect(enemyCount({ targets: 99 })).toBe(ENEMY_SLOTS.length);
    // Fixed slots, not a generated arc: every body stays inside the fitted extent and the first one
    // is the only enemy the main bolt can reach.
    for (const slot of ENEMY_SLOTS) {
      expect(Math.abs(slot[0])).toBeLessThan(CHAIN_VIEW.width / 2 - ENEMY_RADIUS);
      expect(Math.abs(slot[1])).toBeLessThan(CHAIN_VIEW.height / 2 - ENEMY_RADIUS);
    }
    expect(ENEMY_SLOTS[0]![0]).toBeGreaterThan(CHAIN_CASTER[0]);
    // One fork per extra enemy. Sampled just after the hit, while the tree is still lit.
    expect(widthsOf(commandsOf(LOOP_SECONDS * 0.1, { targets: 6 })).length).toBeGreaterThan(
      widthsOf(commandsOf(LOOP_SECONDS * 0.1, { targets: 1 })).length,
    );
  });

  test("zig-zag the bolt with hard corners instead of waving it", () => {
    const from: [number, number] = [0, 0];
    const to: [number, number] = [10, 0];
    const path = boltPath(from, to, 1, 1.8, 9);
    // Both ends stay locked to the bodies, whatever happens in between.
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // Few legs, big throws: the path crosses its own straight line instead of bending to one side.
    expect(path.length).toBe(10);
    const deviations = path.slice(1, -1).map((point) => point[1]);
    expect(Math.max(...deviations)).toBeGreaterThan(1);
    expect(Math.min(...deviations)).toBeLessThan(-1);
    // The corners are hard: at least one joint turns the path sharply, which is what a wave never does.
    const heading = (a: readonly [number, number], b: readonly [number, number]) =>
      Math.atan2(b[1] - a[1], b[0] - a[0]);
    let sharpest = 0;
    for (let index = 1; index + 1 < path.length; index++) {
      const turn = heading(path[index]!, path[index + 1]!) - heading(path[index - 1]!, path[index]!);
      sharpest = Math.max(sharpest, Math.abs(turn));
    }
    expect(sharpest).toBeGreaterThan(0.4);
  });

  test("rebuild every bolt from a deterministic hash", () => {
    // The same loop position always yields the same shape, which is what makes a scrub or a
    // screenshot comparison reproducible.
    expect(boltFlicker(0.42, 3)).toBe(boltFlicker(0.42, 3));
    // Successive frames re-crack the bolt, and neighbouring bolts do not share a phase.
    const frame = Math.floor(0.42 * FLICKER_FPS);
    const shapes = new Set(Array.from({ length: 8 }, (_, step) => boltFlicker((frame + step) / FLICKER_FPS, 3)));
    expect(shapes.size).toBeGreaterThan(1);
    expect(boltFlicker(0.42, 1)).not.toBe(boltFlicker(0.42, 2));
    for (let step = 0; step <= 60; step++) {
      for (let index = 0; index < ENEMY_SLOTS.length; index++) {
        const value = boltFlicker(step / 60, index);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  test("flash every enemy on the same frame", () => {
    const at = (targets: number) =>
      commandsOf(LOOP_SECONDS * (STRIKE_RATIO + 0.01), { targets }).filter(
        (command) => command.kind === "shape2d" && command.zIndex === 6,
      );
    // Two tiers of flash per body, all of them on the hit frame.
    expect(at(1)).toHaveLength(2);
    expect(at(4)).toHaveLength(8);
  });

  test("label every element row and draw one shared playhead", () => {
    const texts = commandsOf(LOOP_SECONDS * 0.4).flatMap((command) =>
      command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : [],
    );
    expect(texts).toEqual(expect.arrayContaining(["劈中 · 主弧", "电弧 · 余闪", "命中 · 闪光"]));
    expect(texts).toEqual(expect.arrayContaining(["0.00s", "0.40s", "0.80s"]));

    // One vertical spanning every row, at the playhead's x.
    const verticals = commandsOf(LOOP_SECONDS * 0.5)
      .flatMap((command) => (command.kind === "line2d" ? [command] : []))
      .filter(
        (command) =>
          command.widthMode !== "world" &&
          command.start[0] === command.end[0] &&
          Math.abs(command.end[1] - command.start[1]) > 4,
      );
    expect(verticals).toHaveLength(1);
    expect(verticals[0]!.start[0]).toBeCloseTo(CHAIN_TIMELINE_LAYOUT.left + CHAIN_TIMELINE_LAYOUT.width * 0.5, 6);
  });
});

describe("dash slash", () => {
  const commandsOf = (time: number, params: Record<string, number> = {}) => {
    const drawList = new FrameDrawList();
    buildVfxScene("dash-slash", drawList, time, undefined, undefined, params);
    return drawList.commands();
  };

  test("dash, blink, pause, then the cuts", () => {
    expect(dashSlashPhaseAt(0).dash).toBe(0);
    expect(dashSlashPhaseAt(DASH_START).dash).toBe(0);
    expect(dashSlashPhaseAt(DASH_END).dash).toBeCloseTo(1, 6);
    // The blink belongs to the arrival: nothing before it, gone shortly after.
    expect(dashSlashPhaseAt(DASH_END - 1e-9).blink).toBe(0);
    expect(dashSlashPhaseAt(DASH_END).blink).toBeCloseTo(1, 6);
    expect(dashSlashPhaseAt(DASH_END + 1e-6).blink).toBeGreaterThan(0.999);
    expect(dashSlashPhaseAt(DASH_END + 0.05).blink).toBe(0);
    // The pause is real: no cut exists while the caster is travelling or right after arriving.
    expect(cutBrightness(DASH_END, 0)).toBe(0);
    expect(cutBrightness(CUT_START - 1e-9, 0)).toBe(0);
    expect(cutBrightness(CUT_START + 1e-6, 0)).toBeGreaterThan(0.9);
  });

  test("land one cut after another, all inside the loop", () => {
    // Each cut opens later than the one before it, and the flurry is staggered rather than simultaneous.
    for (let index = 1; index < 6; index++) {
      expect(cutStart(index)).toBeGreaterThan(cutStart(index - 1));
      expect(cutBrightness(cutStart(index) - 1e-9, index)).toBe(0);
      expect(cutBrightness(cutStart(index - 1), index)).toBe(0);
    }
    // The last of six cuts opens and fades out before the loop wraps.
    expect(cutStart(5) + CUT_LIFE).toBeLessThan(1);
    // One cut keeps its longest stretch for a moment and then fades monotonically.
    const values = Array.from({ length: 20 }, (_, step) => cutBrightness(CUT_START + (step / 19) * CUT_LIFE, 0));
    for (let index = 1; index < values.length; index++) {
      expect(values[index]).toBeLessThanOrEqual(values[index - 1]!);
    }
    expect(cutGrow(CUT_START, 0)).toBe(0);
    expect(cutGrow(CUT_START + CUT_LIFE, 0)).toBe(1);
  });

  test("draw three rungs per open cut, and no trail when the slider is zero", () => {
    // Sampled while the first cut is open and the second one has not started yet.
    const time = LOOP_SECONDS * (CUT_START + 0.02);
    const marks = commandsOf(time).filter((command) => command.kind === "shape2d" && command.zIndex >= 4);
    // Halo, cut and core — three rhombi for one cut.
    expect(marks).toHaveLength(3);
    // With no afterimages selected there is nothing lit behind the caster.
    const trailDiscs = commandsOf(LOOP_SECONDS * 0.2, { trails: 0 }).filter(
      (command) => command.kind === "shape2d" && command.zIndex === 1,
    );
    expect(trailDiscs).toHaveLength(0);
  });

  test("label every element row and draw one shared playhead", () => {
    const texts = commandsOf(LOOP_SECONDS * 0.5).flatMap((command) =>
      command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : [],
    );
    expect(texts).toEqual(expect.arrayContaining(["位移 · 冲刺", "刀痕 · 连斩", "刀痕 · 拉伸", "一闪 · 亮度"]));
    expect(texts).toEqual(expect.arrayContaining(["0.00s", "0.40s", "0.80s"]));

    const verticals = commandsOf(LOOP_SECONDS * 0.5)
      .flatMap((command) => (command.kind === "line2d" ? [command] : []))
      .filter(
        (command) =>
          command.widthMode !== "world" &&
          command.start[0] === command.end[0] &&
          Math.abs(command.end[1] - command.start[1]) > 4,
      );
    expect(verticals).toHaveLength(1);
    expect(verticals[0]!.start[0]).toBeCloseTo(DASH_TIMELINE_LAYOUT.left + DASH_TIMELINE_LAYOUT.width * 0.5, 6);
  });
});

describe("ult flash", () => {
  const commandsOf = (time: number, params: Record<string, number> = {}) => {
    const drawList = new FrameDrawList();
    buildVfxScene("ult-flash", drawList, time, undefined, undefined, params);
    return drawList.commands();
  };
  const shapesOf = (time: number, params: Record<string, number> = {}) =>
    commandsOf(time, params).flatMap((command) => (command.kind === "shape2d" ? [command] : []));
  /**
   * The flash's own shapes. The curve rows draw a dot per element below the stage, so a count over
   * every shape would include them; everything the effect draws sits on the body at `UNIT`.
   */
  const stageShapesOf = (time: number, params: Record<string, number> = {}) =>
    shapesOf(time, params).filter((command) => command.center[1] > 0);
  /** Loop position `burst` of the way into the burst; 0 is the pop frame itself. */
  const atBurst = (burst: number): number => ULT_CHARGE_RATIO + burst * (1 - ULT_CHARGE_RATIO);

  test("gather a cross on the body, with no ring yet", () => {
    const shapes = stageShapesOf(ULT_LOOP_SECONDS * 0.14);
    // Two tiers per arm times four arms, plus the three discs of the core and the body itself.
    expect(shapes.filter((command) => command.shape === "triangle")).toHaveLength(8);
    expect(shapes.filter((command) => command.shape === "circle" && command.filled)).toHaveLength(4);
    // The only outline is the unit's own rim: nothing has been thrown off the body yet.
    expect(shapes.filter((command) => command.shape === "circle" && !command.filled)).toHaveLength(1);
  });

  test("peak on the pop frame, then close the arms back down", () => {
    expect(ultStarBrightness(ultFlashPhaseAt(0))).toBe(0);
    // The pop is a jump: the gathered light is well below the burst's first frame, which is 1.
    expect(ultStarBrightness(ultFlashPhaseAt(ULT_CHARGE_RATIO))).toBeLessThan(0.25);
    expect(ultStarBrightness(ultFlashPhaseAt(ULT_CHARGE_RATIO + 1e-9))).toBeCloseTo(1, 6);
    const gathered = ultSpikeLength(ultFlashPhaseAt(ULT_CHARGE_RATIO));
    const opening = ultSpikeLength(ultFlashPhaseAt(atBurst(ULT_SPIKE_OPEN)));
    const closing = ultSpikeLength(ultFlashPhaseAt(atBurst(ULT_SPIKE_CLOSE)));
    expect(opening).toBeGreaterThan(gathered);
    // The star leaves by pulling back, not only by fading: at the end the arms are the gathered
    // cross again, which is where the next windup starts from.
    expect(closing).toBeLessThan(opening);
    expect(closing).toBeCloseTo(gathered, 6);
  });

  test("throw one ring off the body, and let it die at its full reach", () => {
    expect(ultRingRadius(ultFlashPhaseAt(ULT_CHARGE_RATIO))).toBe(0);
    const reachAt = (burst: number): number => {
      const shapes = shapesOf(ULT_LOOP_SECONDS * atBurst(burst));
      const outline = shapes.filter(
        (command) => command.shape === "circle" && !command.filled && command.size[0] > 1.5,
      );
      return outline[0]?.size[0] ?? 0;
    };
    expect(reachAt(0.1)).toBeGreaterThan(0);
    expect(reachAt(0.4)).toBeGreaterThan(reachAt(0.1));
    // Full reach is also the end of its life: the last frame it exists is the widest one.
    expect(ultRingRadius(ultFlashPhaseAt(atBurst(ULT_RING_SPAN)))).toBeCloseTo(1, 6);
    expect(ultRingBrightness(ultFlashPhaseAt(atBurst(ULT_RING_SPAN)))).toBeCloseTo(0, 6);
    expect(reachAt(ULT_RING_SPAN)).toBe(0);
  });

  test("leave only the unit once the burst is over", () => {
    const shapes = stageShapesOf(ULT_LOOP_SECONDS * atBurst(0.7));
    expect(shapes.filter((command) => command.shape === "triangle")).toHaveLength(0);
    // The body and its rim stay: the unit is not the effect.
    expect(shapes.filter((command) => command.shape === "circle" && command.filled)).toHaveLength(1);
    expect(shapes.filter((command) => command.shape === "circle" && !command.filled)).toHaveLength(1);
    // The body is drawn first, so the flash can sit on top of it.
    expect(shapes[0]!.center).toEqual([ULT_UNIT[0], ULT_UNIT[1]]);
  });

  test("recolour the flash without tinting the body", () => {
    const shapes = shapesOf(ULT_LOOP_SECONDS * 0.14, { hue: 0, saturation: 1 });
    // The haze tier of the arms carries the hue; the tier on top of it is a lightened copy, so even
    // at full saturation the middle of the star stays white-hot.
    expect(shapes.some((command) => command.shape === "triangle" && command.color[0] === 1 && command.color[1] < 0.5)).toBe(
      true,
    );
    const body = shapes.find((command) => command.shape === "circle" && command.filled);
    expect(body!.color[0]).toBeLessThan(0.5);
  });

  test("label every element row and draw one shared playhead", () => {
    const texts = commandsOf(ULT_LOOP_SECONDS * 0.5).flatMap((command) =>
      command.kind === "text" ? [command.spans.map((span) => span.text).join("")] : [],
    );
    expect(texts).toEqual(expect.arrayContaining(["闪光 · 星核", "闪光 · 十字芒", "光圈 · 半径", "光圈 · 亮度"]));
    expect(texts).toEqual(expect.arrayContaining(["0.00s", "0.40s", "0.80s"]));
  });
});
