/**
 * Dev-only reference page: renders one case from `tools/bevy-text-reference/cases.json` with
 * vgpu's own text renderer, at the case's own pixel size, so it can sit beside the bevy render of
 * the same case.
 *
 * Not part of the gallery: it is not in `SCENE_EXAMPLES` and nothing links to it. Open it as
 * `?case=<id>` with the Vite dev server running, or let `scripts/capture-text-reference.ts` drive
 * it through CDP and write `artifacts/text-reference/vgpu-<id>.png`.
 *
 * The block always draws with `space: "screen"` and the `bitmap` glyph source: screen space is the
 * placement both sides can express directly (top-left origin pixels), and `bitmap` is the coverage
 * encoding bevy's `FontAtlas` also stores, which is what makes the two comparable pixel for pixel.
 */

import { effect, frame, init, sampler, surface, target } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import {
  CanvasGlyphRasterizer,
  DebugDraw3D,
  DEFAULT_FONT_FAMILY,
  GpuDebugDraw3D,
  loadDefaultFont,
  type TextAnchor,
  type TextJustify,
  type TextLineBreak,
} from "./index.js";
import { linearClearColor, linearGridColor } from "./color-space.js";

/** Same present step as the gallery: blend in linear light, encode once on output. */
const PRESENT_SHADER = prepareShader(`
@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;

fn encode_srgb(value: vec3f) -> vec3f {
  let low = value * 12.92;
  let high = 1.055 * pow(max(value, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, value <= vec3f(0.0031308));
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(sceneTexture));
  let uv = position.xy / dims;
  let scene = textureSample(sceneTexture, sceneSampler, uv);
  return vec4f(encode_srgb(scene.rgb), scene.a);
}
`);

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

type ReferenceSpan = {
  readonly text: string;
  readonly color?: readonly number[];
  readonly fontSize?: number;
};

type ReferenceCase = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly background: readonly number[];
  readonly fontSize: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly justify?: string;
  readonly lineBreak?: string;
  readonly bounds?: readonly (number | null)[];
  readonly anchor?: string;
  readonly position: readonly [number, number];
  readonly text?: string;
  readonly spans?: readonly ReferenceSpan[];
};

const fail = (message: string): never => {
  document.documentElement.dataset.renderError = message;
  throw new Error(message);
};

const caseId = new URLSearchParams(location.search).get("case") ?? fail("?case=<id> is required");
const spec = (await (await fetch("/tools/bevy-text-reference/cases.json")).json()) as {
  cases: readonly ReferenceCase[];
};
const reference = spec.cases.find((entry) => entry.id === caseId) ?? fail(`unknown case ${caseId}`);

const canvas = document.createElement("canvas");
canvas.width = reference.width;
canvas.height = reference.height;
canvas.style.width = `${reference.width}px`;
canvas.style.height = `${reference.height}px`;
document.body.append(canvas);

const gpu = await init();
const output = surface(gpu, canvas);
const scene = target(gpu, { size: output.size, format: "rgba16float", depth: true, msaa: 4 });
const present = effect(gpu, PRESENT_SHADER, {
  set: { sceneTexture: scene, sceneSampler: sampler(gpu) },
});

await loadDefaultFont();
const renderer = new GpuDebugDraw3D(gpu, {
  points: 256,
  lines: 256,
  triangles: 256,
  joints: 256,
  // Fixed raster on purpose: this page is compared against bevy glyph by glyph, so the glyphs have to
  // be rasterised at exactly the size the case asks for rather than at the size the screen drives.
  text: { sources: { bitmap: new CanvasGlyphRasterizer({ encoding: "bitmap", dynamicRaster: false }) }, atlasSize: 1024 },
});

const debug = new DebugDraw3D();
const drawList = debug.beginFrame();
const spans = reference.spans ?? [{ text: reference.text ?? "" }];
// Cases author colours the way bevy's `TextColor` takes them: sRGB. The drawList's own colour
// convention is the reference primitives' one — passed through as authored, i.e. linear — so a
// colour that has to match a `Color::srgb` is decoded here rather than at the API boundary.
const decode = (rgba: readonly number[]): readonly [number, number, number, number] =>
  linearGridColor([rgba[0]!, rgba[1]!, rgba[2]!, rgba[3]!], rgba[3]!);
drawList.text(
  [reference.position[0], reference.position[1], 0],
  spans.map((span) => ({
    text: span.text,
    ...(span.color === undefined ? {} : { color: decode(span.color) }),
    ...(span.fontSize === undefined ? {} : { fontSize: span.fontSize }),
  })),
  {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: reference.fontSize,
    // The case list carries bevy's `LineHeight::RelativeToFont` multiple, which is what keeps a
    // line holding a larger span taller here too.
    ...(reference.lineHeight === undefined ? {} : { lineHeightScale: reference.lineHeight }),
    letterSpacing: reference.letterSpacing ?? 0,
    justify: (reference.justify ?? "left") as TextJustify,
    lineBreak: (reference.lineBreak ?? "word") as TextLineBreak,
    ...(reference.bounds === undefined
      ? {}
      : { bounds: [reference.bounds[0] ?? Number.POSITIVE_INFINITY, reference.bounds[1] ?? Number.POSITIVE_INFINITY] as const }),
    anchor: (reference.anchor ?? "top-left") as TextAnchor,
    space: "screen",
    source: "bitmap",
  },
);
const commands = debug.finishFrame(drawList);

renderer.prepare(commands, { viewProjection: IDENTITY, view: IDENTITY });
frame(gpu, (f) => {
  renderer.updateIndirect(f);
  f.pass(
    {
      target: scene,
      clear: linearClearColor([
        reference.background[0]!,
        reference.background[1]!,
        reference.background[2]!,
        reference.background[3]!,
      ]),
      clearDepth: 1,
    },
    (pass) => renderer.draw(pass),
  );
  f.pass({ target: output }, (pass) => pass.draw(present));
});

document.documentElement.dataset.renderReady = "true";
