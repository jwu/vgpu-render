// Compare the two sides of the bevy text reference, case by case.
//
// Usage:
//   bun scripts/compare-text-reference.ts [case ...]
//
// Reads the same case list the renderers use, lays every case out with `layoutText` (against the
// bundled font's outlines, which is the measurer both sides share), and diffs the result against
// `artifacts/text-reference/bevy-<id>.glyphs.json`. Then it compares the two PNGs pixel for pixel.
//
// Three numbers per case, in the order they should be trusted:
//
//   glyphs   the per-glyph geometry, matched line by line. This is the layout verdict: a wrong
//            wrap point or alignment box shows up here as tens of pixels, not fractions.
//   block    the reported block size. bevy rounds it up and counts the whitespace a line breaks
//            at, so this catches the two conventions that do not move any glyph.
//   ink      summed luma above the background, i.e. how much ink each renderer put down. The two
//            rasterisers (swash vs Canvas2D) differ here; it is a known difference, not a defect,
//            and it grows as the font gets smaller.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { OutlineGlyphRasterizer } from "../src/text-msdf-font.js";
import {
  layoutText,
  resolveTextAnchor,
  type TextJustify,
  type TextLayoutOptions,
  type TextLineBreak,
} from "../src/text-layout.js";

const ROOT = resolve(import.meta.dir, "..");
const REFERENCE = resolve(ROOT, "artifacts", "text-reference");
const CASES = resolve(ROOT, "tools", "bevy-text-reference", "cases.json");

type Span = { readonly text: string; readonly color?: readonly number[]; readonly fontSize?: number };
type ReferenceCase = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly justify?: string;
  readonly lineBreak?: string;
  readonly bounds?: readonly (number | null)[];
  readonly anchor?: string;
  readonly position: readonly [number, number];
  readonly text?: string;
  readonly spans?: readonly Span[];
};
type GlyphDump = {
  readonly blockWidth: number;
  readonly blockHeight: number;
  readonly glyphs: readonly { readonly x: number; readonly y: number; readonly line: number; readonly w: number; readonly h: number }[];
};

const JUSTIFY: Readonly<Record<string, TextJustify>> = {
  left: "left",
  center: "center",
  right: "right",
  justified: "justified",
  start: "start",
  end: "end",
};
const BREAK: Readonly<Record<string, TextLineBreak>> = {
  word: "word",
  character: "character",
  "word-or-character": "word-or-character",
  none: "none",
};

/** Minimal PNG reader: 8-bit RGB/RGBA, the two shapes these captures come in. */
function readPng(path: string): { width: number; height: number; channels: number; pixels: Uint8Array } {
  const data = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("latin1");
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const colorType = chunk[9]!;
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
      if (channels === 0) throw new Error(`${path}: only 8-bit RGB/RGBA PNGs are supported`);
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++]!;
    const line = new Uint8Array(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = previous[i]!;
      const c = i >= channels ? previous[i - channels]! : 0;
      if (filter === 1) line[i] = (line[i]! + a) & 0xff;
      else if (filter === 2) line[i] = (line[i]! + b) & 0xff;
      else if (filter === 3) line[i] = (line[i]! + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i]! + predictor) & 0xff;
      }
    }
    pixels.set(line, y * stride);
    previous = line;
  }
  return { width, height, channels, pixels };
}

/** Summed luma above the background: how much ink a render put down, colours included. */
function ink(image: { channels: number; pixels: Uint8Array }): number {
  const { channels, pixels } = image;
  const background = [pixels[0]!, pixels[1]!, pixels[2]!];
  let total = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    total += Math.max(
      0,
      0.2126 * (pixels[i]! - background[0]!) +
        0.7152 * (pixels[i + 1]! - background[1]!) +
        0.0722 * (pixels[i + 2]! - background[2]!),
    );
  }
  return total;
}

const spec = JSON.parse(readFileSync(CASES, "utf8")) as { cases: readonly ReferenceCase[] };
const wanted = process.argv.slice(2);
const cases = wanted.length === 0 ? spec.cases : spec.cases.filter((entry) => wanted.includes(entry.id));
if (cases.length === 0) throw new Error(`no cases matched ${wanted.join(", ")}`);

const measurer = new OutlineGlyphRasterizer();
const rows: string[] = [];

for (const entry of cases) {
  const fontSize = entry.fontSize;
  const spans = (entry.spans ?? [{ text: entry.text ?? "" }]).map((span) => ({
    text: span.text,
    color: (span.color ?? [1, 1, 1, 1]) as readonly [number, number, number, number],
    fontSize: span.fontSize ?? fontSize,
  }));
  const options: TextLayoutOptions = {
    color: [1, 1, 1, 1],
    fontSize,
    fontFamily: "fira",
    letterSpacing: entry.letterSpacing ?? 0,
    justify: JUSTIFY[entry.justify ?? "left"]!,
    lineBreak: BREAK[entry.lineBreak ?? "word"]!,
    bounds: [entry.bounds?.[0] ?? Number.POSITIVE_INFINITY, entry.bounds?.[1] ?? Number.POSITIVE_INFINITY],
    anchor: resolveTextAnchor(entry.anchor ?? "top-left"),
    ...(entry.lineHeight === undefined ? {} : { lineHeightScale: entry.lineHeight }),
  };
  const ours = layoutText(spans, options, measurer);
  const bevy = JSON.parse(readFileSync(resolve(REFERENCE, `bevy-${entry.id}.glyphs.json`), "utf8")) as GlyphDump;

  // bevy emits a zero-sized glyph for every space; ours never does, so drop them before pairing.
  const theirs = bevy.glyphs.filter((glyph) => glyph.w > 0 && glyph.h > 0);
  const mine = ours.glyphs.map((glyph) => ({
    x: entry.position[0] + glyph.center[0],
    y: entry.position[1] + glyph.center[1],
  }));

  let maxDx = 0;
  let maxDy = 0;
  let glyphNote = "";
  if (mine.length !== theirs.length) {
    glyphNote = `glyph count ${mine.length} vs ${theirs.length}`;
  } else {
    for (let i = 0; i < mine.length; i++) {
      maxDx = Math.max(maxDx, Math.abs(mine[i]!.x - theirs[i]!.x));
      maxDy = Math.max(maxDy, Math.abs(mine[i]!.y - theirs[i]!.y));
    }
    glyphNote = `dx ${maxDx.toFixed(2)} dy ${maxDy.toFixed(2)}`;
  }

  const bevyPng = readPng(resolve(REFERENCE, `bevy-${entry.id}.png`));
  const vgpuPng = readPng(resolve(REFERENCE, `vgpu-${entry.id}.png`));
  const bevyInk = ink(bevyPng);
  const vgpuInk = ink(vgpuPng);

  rows.push(
    [
      entry.id.padEnd(24),
      glyphNote.padEnd(18),
      `${ours.size[0]}x${ours.size[1]} vs ${bevy.blockWidth}x${bevy.blockHeight}`.padEnd(24),
      `${(((vgpuInk - bevyInk) / bevyInk) * 100).toFixed(2)}%`,
    ].join(" "),
  );
}

console.log(`cases: ${cases.length}\n`);
console.log(`${"case".padEnd(24)} ${"glyphs".padEnd(18)} ${"block (vgpu vs bevy)".padEnd(24)} ink Δ`);
console.log("-".repeat(90));
console.log(rows.join("\n"));
