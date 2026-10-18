/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FIRA_MONO_MEDIUM_SUBSET_BASE64, FIRA_MONO_MEDIUM_SUBSET_TTF_BASE64 } from "../src/assets/fira-mono-medium-subset.js";
import { VGPU_SANS_FACES, VGPU_SANS_WEIGHTS } from "../gallery/assets/vgpu-sans-faces.js";
import { decodeBase64Bytes, decodeEmbeddedFont, decodeEmbeddedTrueTypeFont } from "../src/text-font.js";

const SOURCE = new URL("../src/assets/fonts/fira-mono-medium-subset.woff2", import.meta.url);
const SOURCE_TTF = new URL("../src/assets/fonts/fira-mono-medium-subset.ttf", import.meta.url);

describe("bundled font", () => {
  test("the embedded bytes match the source woff2 exactly", () => {
    const source = readFileSync(SOURCE);
    const embedded = decodeEmbeddedFont();
    expect(embedded.byteLength).toBe(source.byteLength);
    expect(Buffer.from(embedded).equals(source)).toBe(true);
  });

  test("the payload is woff2, which is what FontFace accepts", () => {
    // "wOF2", the WOFF2 signature.
    expect(Array.from(decodeEmbeddedFont().slice(0, 4))).toEqual([0x77, 0x4f, 0x46, 0x32]);
  });

  test("the generated constant carries no stray whitespace", () => {
    expect(FIRA_MONO_MEDIUM_SUBSET_BASE64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  test("the embedded TrueType bytes match the source exactly", () => {
    const source = readFileSync(SOURCE_TTF);
    const embedded = decodeEmbeddedTrueTypeFont();
    expect(embedded.byteLength).toBe(source.byteLength);
    expect(Buffer.from(embedded).equals(source)).toBe(true);
  });

  test("the TrueType payload is a TrueType outline font", () => {
    // 0x00010000 is the scaler type `opentype.js` expects before it will parse anything.
    expect(Array.from(decodeEmbeddedTrueTypeFont().slice(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
    expect(FIRA_MONO_MEDIUM_SUBSET_TTF_BASE64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe("multi-weight sans family", () => {
  test("carries one face per declared weight, ascending", () => {
    expect(VGPU_SANS_FACES.map((face) => face.weight)).toEqual([...VGPU_SANS_WEIGHTS]);
    expect(VGPU_SANS_WEIGHTS).toEqual([200, 300, 400, 500, 600, 700, 800, 900]);
  });

  test("every face is a woff2 container with real bytes", () => {
    for (const face of VGPU_SANS_FACES) {
      const bytes = decodeBase64Bytes(face.woff2Base64);
      // "wOF2", the WOFF2 signature.
      expect(Array.from(bytes.slice(0, 4))).toEqual([0x77, 0x4f, 0x46, 0x32]);
      // A subset Latin face is far smaller than the variable source, and a missing payload would be
      // far smaller still; the bound catches a truncated build.
      expect(bytes.byteLength).toBeGreaterThan(8 * 1024);
    }
  });

  test("the base64 payloads carry no stray whitespace", () => {
    for (const face of VGPU_SANS_FACES) expect(face.woff2Base64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});
