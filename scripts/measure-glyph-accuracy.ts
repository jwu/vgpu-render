// Measure how much ink each glyph source actually puts on the screen, against the geometry.
//
// Usage:
//   bun scripts/measure-glyph-accuracy.ts
//
// The reference is the shape itself: every glyph's outline is sampled 16×16 per pixel to get the
// coverage the glyph really has on the pixel grid the text is laid out on. Ink — the sum of coverage
// over every pixel — is translation invariant, so the layout offsets do not have to match.
//
// The render happens on a headless GPU target with no scene behind it, and the coverage the shader
// wrote is read back through a calibration: opaque white rectangles at known alpha, which pins the
// `coverage -> channel value` mapping instead of assuming it. On the machines this was written on that
// mapping is linear to within one 8-bit step, but it is worth measuring rather than believing.
//
// This exists because measuring ink off a gallery screenshot does not work: the infinite grid writes
// bright lines over the text, the page layout shifts between captures with the browser's font stack,
// and a window narrower than the glyph box clips it. Every one of those produced a wrong answer here
// before the target was moved off the browser; `docs/visual-comparison.md` records the details.
//
// Reported per source: total ink in fully-covered pixels, and the error against the geometric truth.

import { frame, init, target } from "vgpu/node";
import { parse, type Path } from "opentype.js";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameDrawList } from "../src/frame-draw-list.js";
import { decodeEmbeddedTrueTypeFont, type GlyphRasterizer } from "../src/text-font.js";
import type { TextMeasurer } from "../src/text-layout.js";
import { BakedMsdfRasterizer } from "../src/text-msdf-baked.js";
import { OutlineGlyphRasterizer } from "../src/text-msdf-font.js";

/** The string both the reference and the render use. */
const SAMPLE = "Handgloves 0123";
const FONT_SIZE = 20;
const SUB = 16;
const WIDTH = 400;
const HEIGHT = 80;
/** Page background, in 8-bit channel units. Matches the gallery canvas. */
const BACKGROUND = 30;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

type Point = readonly [number, number];

/** Flattens a glyph outline into closed contours, dense enough that the chords are not the error. */
function contoursOf(path: Path, steps = 24): readonly (readonly Point[])[] {
  const contours: Point[][] = [];
  let current: Point[] = [];
  let start: Point | undefined;
  let pen: Point = [0, 0];
  const push = (point: Point): void => {
    current.push(point);
    pen = point;
  };
  for (const command of path.commands as readonly { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]) {
    if (command.type === "M") {
      if (current.length > 2) contours.push(current);
      current = [];
      start = [command.x!, command.y!];
      push(start);
    } else if (command.type === "L") {
      push([command.x!, command.y!]);
    } else if (command.type === "Q") {
      const [x0, y0] = pen;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        push([u * u * x0 + 2 * u * t * command.x1! + t * t * command.x!, u * u * y0 + 2 * u * t * command.y1! + t * t * command.y!]);
      }
    } else if (command.type === "C") {
      const [x0, y0] = pen;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        push([
          u * u * u * x0 + 3 * u * u * t * command.x1! + 3 * u * t * t * command.x2! + t * t * t * command.x!,
          u * u * u * y0 + 3 * u * u * t * command.y1! + 3 * u * t * t * command.y2! + t * t * t * command.y!,
        ]);
      }
    } else if (command.type === "Z" && start !== undefined) {
      push(start);
      if (current.length > 2) contours.push(current);
      current = [];
      start = undefined;
    }
  }
  if (current.length > 2) contours.push(current);
  return contours;
}

function inside(px: number, py: number, contours: readonly (readonly Point[])[]): boolean {
  let isInside = false;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const [ax, ay] = contour[i]!;
      const [bx, by] = contour[(i + 1) % contour.length]!;
      if (ay > py !== by > py) {
        if (px < ax + ((py - ay) / (by - ay)) * (bx - ax)) isInside = !isInside;
      }
    }
  }
  return isInside;
}

/** Total coverage of the string, in pixels, on the grid the glyphs are laid out on. */
function geometricInk(): number {
  const font = parse(decodeEmbeddedTrueTypeFont().buffer);
  let total = 0;
  for (const character of SAMPLE) {
    if (character === " ") continue;
    const path = font.charToGlyph(character).getPath(0, 0, FONT_SIZE);
    const box = path.getBoundingBox();
    const contours = contoursOf(path);
    for (let y = Math.floor(box.y1) - 1; y < Math.ceil(box.y2) + 1; y++) {
      for (let x = Math.floor(box.x1) - 1; x < Math.ceil(box.x2) + 1; x++) {
        let covered = 0;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            if (inside(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB, contours)) covered++;
          }
        }
        total += covered / (SUB * SUB);
      }
    }
  }
  return total;
}

async function onTarget(build: (drawList: FrameDrawList) => void, source: GlyphRasterizer & TextMeasurer, mipLevels?: number): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, {
      text: {
        sources: { default: source },
        atlasSize: 256,
        ...(mipLevels === undefined ? {} : { mipLevels }),
      },
    });
    const debug = new DebugDraw3D();
    const drawList = debug.beginFrame();
    build(drawList);
    renderer.prepare(debug.finishFrame(drawList), { viewProjection: IDENTITY, view: IDENTITY });
    frame(gpu, (f) => {
      renderer.updateIndirect(f);
      f.pass({ target: output, clear: [BACKGROUND / 255, BACKGROUND / 255, BACKGROUND / 255, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
    });
    return await output.color.read({ mipLevel: 0, region: "all" });
  } finally {
    gpu.dispose();
  }
}

const channel = (pixels: Uint8Array, x: number, y: number): number => pixels[(y * WIDTH + x) * 4]!;

// 1. Calibration: opaque rectangles at known alpha, so `coverage -> value` is measured, not assumed.
const ALPHAS = [1, 0.75, 0.5, 0.25];
const calibrated = await onTarget((drawList) => {
  ALPHAS.forEach((alpha, index) => {
    const x0 = -0.95 + index * 0.475;
    const x1 = x0 + 0.4;
    drawList.triangle([x0, -0.6, 0], [x1, -0.6, 0], [x1, 0.6, 0], { color: [1, 1, 1, alpha] });
    drawList.triangle([x0, -0.6, 0], [x1, 0.6, 0], [x0, 0.6, 0], { color: [1, 1, 1, alpha] });
  });
}, new OutlineGlyphRasterizer());
console.log(`calibration, background ${BACKGROUND}/255 (measured vs linear expectation):`);
let calibrationError = 0;
ALPHAS.forEach((alpha, index) => {
  const x = Math.round((-0.95 + index * 0.475 + 0.2 + 1) / 2 * WIDTH);
  const measured = channel(calibrated, x, Math.floor(HEIGHT / 2));
  const linear = BACKGROUND + alpha * (255 - BACKGROUND);
  calibrationError = Math.max(calibrationError, Math.abs(measured - linear));
  console.log(`  alpha ${String(alpha).padEnd(5)} ${String(measured).padStart(3)} vs ${linear.toFixed(0).padStart(3)}`);
});

// 2. Ink per source, with the chain on and off so a mip problem cannot hide behind a good average.
const baked = new BakedMsdfRasterizer();
await baked.load();
const sources: readonly (readonly [string, GlyphRasterizer & TextMeasurer])[] = [
  ["msdf 1x (20px raster)", new OutlineGlyphRasterizer()],
  ["msdf 2x (40px raster)", new OutlineGlyphRasterizer({ rasterScale: 2, distanceRange: 8 })],
  ["msdf 4x (80px raster)", new OutlineGlyphRasterizer({ rasterScale: 4, distanceRange: 16 })],
  ["msdf baked (24px page)", baked],
];

const truth = geometricInk();
console.log(`\n"${SAMPLE}" at ${FONT_SIZE}px, geometric ink ${truth.toFixed(1)} px, calibration error <= ${calibrationError.toFixed(1)}/255`);
console.log(`each source draws the same string on a clean ${WIDTH}x${HEIGHT} target`);
for (const [name, source] of sources) {
  const withMip = await onTarget((drawList) => {
    drawList.text([4, 8, 0], SAMPLE, { fontSize: FONT_SIZE, space: "screen", anchor: "top-left", color: [1, 1, 1, 1] });
  }, source);
  const withoutMip = await onTarget((drawList) => {
    drawList.text([4, 8, 0], SAMPLE, { fontSize: FONT_SIZE, space: "screen", anchor: "top-left", color: [1, 1, 1, 1] });
  }, source, 1);
  const inkOf = (pixels: Uint8Array): number => {
    let ink = 0;
    for (let index = 0; index < pixels.length; index += 4) ink += Math.max(pixels[index]! - BACKGROUND, 0);
    return ink / (255 - BACKGROUND);
  };
  const withMipInk = inkOf(withMip);
  const withoutMipInk = inkOf(withoutMip);
  console.log(
    `  ${name.padEnd(24)} mip chain ${withMipInk.toFixed(1).padStart(7)} (${(100 * (withMipInk / truth - 1)).toFixed(1).padStart(5)}%)` +
      `   no mip ${withoutMipInk.toFixed(1).padStart(7)} (${(100 * (withoutMipInk / truth - 1)).toFixed(1).padStart(5)}%)`,
  );
}
