import { describe, expect, it } from "vitest";
import { sanitizeSource, sourceForExample, tokenizeSource } from "../src/demo-source.js";

const SCENE_SOURCE = `// header comment
function apiMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const labels = ["line", "ray"];
  recorder.line("line", [0, 0, 0], [1, 1, 1], { width: 2, joint: "round" });
}

function circleMatrix(recorder: FrameRecorder, context: SceneContext): void {
  const flat = circleBasis([0, 1, 0], 0);
}

function shapeScene(recorder: FrameRecorder): void {
  const count = 12;
}
`;

describe("sourceForExample", () => {
  it("extracts only the scene function the example runs", () => {
    const source = sourceForExample("circle", SCENE_SOURCE);
    expect(source.startsWith("function circleMatrix(")).toBe(true);
    expect(source).toContain("circleBasis");
    expect(source).not.toContain("apiMatrix");
    expect(source).not.toContain("shapeScene");
  });

  it("maps solid shapes to the shared shapeScene function", () => {
    for (const id of ["sphere", "cone", "cylinder", "capsule"]) {
      expect(sourceForExample(id, SCENE_SOURCE).startsWith("function shapeScene(")).toBe(true);
    }
  });

  it("extracts an exported block, which is the shape the screen-space text pages have", () => {
    // `text-scenes.ts` exports its pages so the dispatcher can reach them, so the block starts with
    // `export function` rather than `function`; both shapes have to be recognised.
    const exported = `
export function textScaleScene(recorder: FrameRecorder): void {
  const sizes = [8, 12, 18];
}

export function textScene(id: string, recorder: FrameRecorder): void {
  textScaleScene(recorder);
}
`;
    const extracted = sourceForExample("text-scale", exported);
    expect(extracted.startsWith("export function textScaleScene(")).toBe(true);
    expect(extracted).toContain("const sizes");
    expect(extracted).not.toContain("textScene(");
  });

  it("falls back to the matrix function for unknown ids", () => {
    expect(sourceForExample("does-not-exist", SCENE_SOURCE).startsWith("function apiMatrix(")).toBe(true);
  });

  it("returns an empty string when the function is absent", () => {
    expect(sourceForExample("circle", "// no functions here\n")).toBe("");
  });

  it("never previews upstream brand names from the scene comments", () => {
    const source = `function apiMatrix(recorder: FrameRecorder): void {
  // bevy's \`2d_gizmos\` example and Godot's addon both draw here.
  recorder.line([0, 0, 0], [1, 1, 1]);
  /* docs/godot-debug-draw-parity.md notes the addon default. */
}
`;
    const preview = sourceForExample("index", source);
    expect(preview).not.toMatch(/bevy|godot|addon/i);
    expect(preview).toContain("recorder.line([0, 0, 0], [1, 1, 1]);");
  });
});

describe("sanitizeSource", () => {
  it("replaces brand mentions inside line and block comments", () => {
    const source = "// bevy's `Camera2d`\n/* the reference addon default */\nconst addon = 1;";
    expect(sanitizeSource(source)).toBe("// reference `Camera2d`\n/* the reference default */\nconst addon = 1;");
  });

  it("leaves code and string literals untouched", () => {
    const source = `recorder.text("bevy", { space: "screen" });`;
    expect(sanitizeSource(source)).toBe(source);
  });

  it("rewrites the parity doc path", () => {
    expect(sanitizeSource("// see docs/godot-debug-draw-parity.md")).toBe("// see the parity notes");
  });
});

describe("tokenizeSource", () => {
  it("round-trips the original text exactly", () => {
    const tokens = tokenizeSource(SCENE_SOURCE);
    expect(tokens.map((token) => token.text).join("")).toBe(SCENE_SOURCE);
  });

  it("classifies comments, strings, numbers, keywords and properties", () => {
    const tokens = tokenizeSource(`// note\nconst color = 12;\nconst name = "line";\nconst flag = true;\nrecorder.line();`);
    const kinds = new Map(tokens.map((token) => [token.text, token.kind]));
    expect(kinds.get("// note")).toBe("comment");
    expect(kinds.get(`"line"`)).toBe("string");
    expect(kinds.get("12")).toBe("number");
    expect(kinds.get("const")).toBe("keyword");
    expect(kinds.get("true")).toBe("boolean");
    expect(kinds.get("color")).toBe("property");
    expect(kinds.get("line")).toBe("function");
  });

  it("keeps non-token text plain", () => {
    const tokens = tokenizeSource("const x = 1;");
    const plain = tokens.filter((token) => token.kind === "plain").map((token) => token.text).join("");
    expect(plain).toContain(" ");
    expect(plain).toContain("=");
    expect(plain).toContain(";");
  });

  it("handles empty input", () => {
    expect(tokenizeSource("")).toEqual([]);
  });
});
