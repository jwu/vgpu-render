import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { DebugDraw3D } from "../src/debug-draw-3d.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameDrawList } from "../src/frame-draw-list.js";
import type { GlyphEncoding } from "../src/text-atlas.js";
import { SyntheticFont } from "./support/synthetic-font.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** A camera yawed 90°: the fixed plane is edge-on, a billboard is still face-on. */
const yawed = new Float32Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);

const WIDTH = 128;
const HEIGHT = 64;

function channel(pixels: Uint8Array, x: number, y: number, component: number): number {
  return pixels[(y * WIDTH + x) * 4 + component]!;
}

/** Pixels where the green channel is clearly lit. */
function litCount(pixels: Uint8Array): number {
  let lit = 0;
  for (let index = 1; index < pixels.length; index += 4) if (pixels[index]! > 40) lit++;
  return lit;
}

/** Pixels where the red channel is clearly lit. */
function redCount(pixels: Uint8Array): number {
  let red = 0;
  for (let index = 0; index < pixels.length; index += 4) if (pixels[index]! > 100) red++;
  return red;
}

/** Pixels on an anti-aliased rim: lit, but nowhere near full intensity. */
function softCount(pixels: Uint8Array): number {
  let soft = 0;
  for (let index = 1; index < pixels.length; index += 4) {
    const green = pixels[index]!;
    if (green > 40 && green < 200) soft++;
  }
  return soft;
}

async function render(
  build: (drawList: FrameDrawList) => void,
  view: Float32Array = identity,
  encoding: GlyphEncoding = "bitmap",
  rasterScale = 1,
  mipLevels?: number,
): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, {
      text: {
        sources: { default: new SyntheticFont(encoding, rasterScale) },
        ...(mipLevels === undefined ? {} : { mipLevels }),
      },
    });
    const debug = new DebugDraw3D();
    const drawList = debug.beginFrame();
    build(drawList);
    renderer.prepare(debug.finishFrame(drawList), { viewProjection: view, view });
    frame(gpu, (f) => {
      renderer.updateIndirect(f);
      f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
    });
    return await output.color.read({ mipLevel: 0, region: "all" });
  } finally {
    gpu.dispose();
  }
}

test("screen text lands at its top-left pixel position in the span colour", async () => {
  const pixels = await render((drawList) => {
    drawList.text([8, 8, 0], "A", { fontSize: 16, space: "screen", anchor: "top-left", color: [1, 0, 0, 1] });
  });
  // A 16px synthetic glyph has an 8×8 ink box that starts at its anchor: x 8..16, y 15..23.
  expect(channel(pixels, 12, 18, 0)).toBeGreaterThan(200);
  expect(channel(pixels, 12, 18, 1)).toBeLessThan(40);
  expect(channel(pixels, 12, 18, 2)).toBeLessThan(40);
  // The row above the ink box is still the clear colour.
  expect(channel(pixels, 12, 10, 0)).toBeLessThan(40);
});

test("world-plane text projects through the camera and flips its local y", async () => {
  const pixels = await render((drawList) => {
    // 20px glyphs at 0.025 world units per pixel are 0.5 world units tall.
    drawList.text([0, 0, 0.5], "A", { fontSize: 20, pixelSize: 0.025, space: "world-plane", anchor: "top-left", color: [0, 1, 0, 1] });
  });
  // Ink centre lands on NDC (0.125, -0.3425) at 128×64, i.e. pixel (72, 43).
  expect(channel(pixels, 72, 42, 1)).toBeGreaterThan(200);
  expect(channel(pixels, 72, 30, 1)).toBeLessThan(40);
});

test("a world-plane block lies flat when rotated onto the ground plane", async () => {
  // A top-down camera: world +X is screen right, world -Z is screen up, world +Y is towards the eye.
  const topDown = new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  const options = { fontSize: 20, pixelSize: 0.025, anchor: "top-left", color: [0, 1, 0, 1] } as const;
  const flat = await render((drawList) => {
    // The reference `Label3D` rotation: the block lies on XZ and reads from above.
    drawList.text([0, 0, 0], "A", { ...options, rotation: [-Math.PI / 2, 0, 0] });
  }, topDown);
  const upright = await render((drawList) => drawList.text([0, 0, 0], "A", options), topDown);
  expect(litCount(flat)).toBeGreaterThan(0);
  // Unrotated, the block still faces +Z and is edge-on to a camera looking straight down.
  expect(litCount(upright)).toBeLessThan(litCount(flat) / 4);
});

test("a billboard keeps facing the camera where the fixed plane goes edge-on", async () => {
  const options = { fontSize: 20, pixelSize: 0.025, anchor: "top-left", color: [0, 1, 0, 1] } as const;
  const billboard = await render((drawList) => drawList.text([0, 0, 0.5], "A", { ...options, space: "world-billboard" }), yawed);
  const plane = await render((drawList) => drawList.text([0, 0, 0.5], "A", { ...options, space: "world-plane" }), yawed);
  expect(litCount(billboard)).toBeGreaterThan(0);
  // Edge-on, the plane collapses to a sliver while the billboard keeps its full width.
  expect(litCount(billboard)).toBeGreaterThan(litCount(plane) * 2);
});

test("world text is occluded by geometry drawn in front of it", async () => {
  const pixels = await render((drawList) => {
    drawList.text([0, 0, 0.6], "A", { fontSize: 20, pixelSize: 0.025, space: "world-plane", anchor: "top-left", color: [0, 1, 0, 1] });
    drawList.triangle([-1, -1, 0.2], [1, -1, 0.2], [1, 1, 0.2], { color: [0, 0, 1, 1] });
    drawList.triangle([-1, -1, 0.2], [1, 1, 0.2], [-1, 1, 0.2], { color: [0, 0, 1, 1] });
  });
  // The closer opaque quad won the depth test and the glyph was rejected.
  expect(channel(pixels, 72, 42, 2)).toBeGreaterThan(200);
  expect(channel(pixels, 72, 42, 1)).toBeLessThan(40);
});

test("distant text still resolves through the mip chain", async () => {
  const pixels = await render((drawList) => {
    // 20 px glyphs at 0.01 units/px are 0.2 world units, roughly 6 px tall on this target: small
    // enough that minification has to select a mip level rather than texel-sample level 0.
    drawList.text([-0.6, 0, 0.5], "MMMM", { fontSize: 20, pixelSize: 0.01, space: "world-billboard", anchor: "top-left", color: [0, 1, 0, 1] });
  });
  const lit = litCount(pixels);
  expect(lit).toBeGreaterThan(4);
  // The block covers about 30×6 px unscaled, so a chained minification cannot bloom past that.
  expect(lit).toBeLessThan(400);
});

test("a minified distance field keeps its ink opaque through the mip chain", async () => {
  // The source rasterises at 16x, so the atlas holds sixteen texels per screen pixel and the chain has
  // to minify — which needs five levels, i.e. more than the four-level default reaches. With the levels
  // it needs, the interior of the blob is saturated ink and has to stay opaque: the reference answer is
  // the block's coverage, and that is one.
  const pixels = await render(
    (drawList) => {
      drawList.text([8, 8, 0], "A", { fontSize: 16, space: "screen", anchor: "top-left", color: [0, 1, 0, 1] });
    },
    identity,
    "sdf",
    16,
    5,
  );
  // The 8×8 ink box sits at x 8..16, y 15..23, so (12, 19) is four texels inside the blob's rim.
  expect(channel(pixels, 12, 19, 1)).toBeGreaterThan(230);
});

test("an outline rings a distance-field glyph in its own colour", async () => {
  const draw = (outlineWidth: number, outlineColor?: readonly [number, number, number, number]) =>
    render(
      (drawList) => {
        drawList.text([8, 8, 0], "A", {
          fontSize: 16,
          space: "screen",
          anchor: "top-left",
          color: [0, 1, 0, 1],
          outlineWidth,
          ...(outlineColor === undefined ? {} : { outlineColor }),
        });
      },
      identity,
      "sdf",
    );
  const plain = await draw(0);
  const zeroWidth = await draw(0, [1, 0, 0, 1]);
  const outlined = await draw(2, [1, 0, 0, 1]);
  // The ring is the only red in the frame, and a zero width draws none of it however opaque alpha is:
  // that channel holds a distance, so reading it without a width would flood the whole quad.
  expect(redCount(plain)).toBe(0);
  expect(redCount(zeroWidth)).toBe(0);
  expect(redCount(outlined)).toBeGreaterThan(30);
  // The ring sits outside the glyph, and the fill keeps its own colour.
  expect(channel(outlined, 12, 19, 1)).toBeGreaterThan(200);
  expect(channel(outlined, 12, 19, 0)).toBeLessThan(40);
});

test("a bitmap glyph is outlined by sampling its mask in eight directions", async () => {
  const draw = (outlineWidth: number) =>
    render(
      (drawList) => {
        drawList.text([8, 8, 0], "A", {
          fontSize: 16,
          space: "screen",
          anchor: "top-left",
          color: [0, 1, 0, 1],
          outlineWidth,
          outlineColor: [1, 0, 0, 1],
        });
      },
      identity,
      "bitmap",
    );
  const plain = await draw(0);
  const outlined = await draw(2);
  // A coverage mask has no distance to read, so the ring comes from the mask itself: eight samples at
  // the outline's radius, which is what puts the ring at roughly the width the block asked for.
  expect(redCount(plain)).toBe(0);
  expect(redCount(outlined)).toBeGreaterThan(30);
  expect(channel(outlined, 12, 19, 1)).toBeGreaterThan(200);
  expect(channel(outlined, 12, 19, 0)).toBeLessThan(40);
});

test("a one-to-one distance field keeps as soft a rim as the coverage mask", async () => {
  const build = (drawList: FrameDrawList): void => {
    drawList.text([8, 8, 0], "A", { fontSize: 16, space: "screen", anchor: "top-left", color: [0, 1, 0, 1] });
  };
  const bitmap = await render(build, identity, "bitmap");
  const distance = await render(build, identity, "sdf");
  // Both encodings describe the same shape at the same size, so their rims should carry the same
  // partial-coverage pixels. A ramp narrower than a screen pixel leaves the distance field without
  // them, which is what makes a rebuilt glyph read thinner and toothed next to a rasterised one.
  expect(softCount(distance)).toBeGreaterThan(softCount(bitmap) * 0.8);
});

test("a magnified distance field keeps a tighter edge than the coverage mask", async () => {  const build = (drawList: FrameDrawList): void => {
    // 20 px glyphs at 0.1 units/px are 2 world units, about 64 px tall on this target — a 3x
    // magnification, which is where interpolating coverage smears and reconstructing a distance
    // does not.
    drawList.text([-0.6, 0, 0.5], "A", { fontSize: 20, pixelSize: 0.1, space: "world-billboard", anchor: "top-left", color: [0, 1, 0, 1] });
  };
  const bitmap = await render(build, identity, "bitmap");
  const distance = await render(build, identity, "sdf");
  expect(litCount(distance)).toBeGreaterThan(0);
  // The bitmap rim is spread over the magnification factor, the distance field's stays one pixel.
  expect(softCount(distance)).toBeLessThan(softCount(bitmap));
});

test("an empty block draws nothing", async () => {
  const pixels = await render((drawList) => {
    drawList.text([0, 0, 0.5], "", { fontSize: 20, pixelSize: 0.025, space: "world-plane" });
  });
  expect(litCount(pixels)).toBe(0);
});

/** Render one screen-space block with a bounded atlas and read the pixels back. */
async function renderWithAtlas(pages: number, text: string, onFull: "throw" | "skip" = "skip"): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    // A 64px page holds 36 of the synthetic 16px glyphs (six 10px shelves of six), so 40 distinct
    // characters cannot fit one page.
    const renderer = new GpuDebugDraw3D(gpu, { text: { sources: { default: new SyntheticFont("bitmap") }, atlasSize: 64, pages, onFull } });
    const debug = new DebugDraw3D();
    const drawList = debug.beginFrame();
    drawList.text([0, 0, 0], text, { space: "screen", anchor: "top-left", fontSize: 16, bounds: [WIDTH, HEIGHT] });
    renderer.prepare(debug.finishFrame(drawList), { viewProjection: identity, view: identity });
    frame(gpu, (f) => {
      renderer.updateIndirect(f);
      f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
    });
    return await output.color.read({ mipLevel: 0, region: "all" });
  } finally {
    gpu.dispose();
  }
}

const OVERFLOWING = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";

test("draws text that spills onto a second atlas page", async () => {
  expect(litCount(await renderWithAtlas(4, OVERFLOWING))).toBeGreaterThan(30);
});

test("reports a full atlas rather than dropping glyphs when the caller asks it to", async () => {
  await expect(renderWithAtlas(1, OVERFLOWING, "throw")).rejects.toThrow(RangeError);
});

test("drops the glyphs a full atlas cannot hold instead of taking the frame down", async () => {
  // One page holds 36 of the 40 glyphs, so the frame is missing characters but still draws — which is
  // what a live game wants from a cache it sized too small. `GpuText3D.skippedGlyphs` reports the cost.
  expect(litCount(await renderWithAtlas(1, OVERFLOWING))).toBeGreaterThan(20);
});

test("keeps drawing after a page is recycled between frames", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { text: { sources: { default: new SyntheticFont("bitmap") }, atlasSize: 64, pages: 1 } });
    const debug = new DebugDraw3D();
    const draw = async (text: string): Promise<Uint8Array> => {
      const drawList = debug.beginFrame();
      drawList.text([0, 0, 0], text, { space: "screen", anchor: "top-left", fontSize: 16, bounds: [WIDTH, HEIGHT] });
      renderer.prepare(debug.finishFrame(drawList), { viewProjection: identity, view: identity });
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };
    // Both frames fill the single page; the second one only fits because the first is recycled.
    // Both blocks are 36 distinct glyphs, which is exactly one 64px page; the second block can only
    // be drawn because the first one's glyphs are recycled.
    expect(litCount(await draw("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))).toBeGreaterThan(30);
    expect(litCount(await draw("abcdefghijklmnopqrstuvwxyz!@#$%^&*()"))).toBeGreaterThan(30);
  } finally {
    gpu.dispose();
  }
});
