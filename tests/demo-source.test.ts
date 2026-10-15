import { describe, expect, it } from "vitest";
import { sourceForExample, tokenizeSource } from "../src/demo-source.js";

const SCENE_SOURCE = `// header comment
function overviewMatrix(recorder: FrameRecorder, context: SceneContext): void {
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
    expect(source).not.toContain("overviewMatrix");
    expect(source).not.toContain("shapeScene");
  });

  it("maps solid shapes to the shared shapeScene function", () => {
    for (const id of ["sphere", "cone", "cylinder", "capsule"]) {
      expect(sourceForExample(id, SCENE_SOURCE).startsWith("function shapeScene(")).toBe(true);
    }
  });

  it("falls back to overviewMatrix for unknown ids", () => {
    expect(sourceForExample("does-not-exist", SCENE_SOURCE).startsWith("function overviewMatrix(")).toBe(true);
  });

  it("returns an empty string when the function is absent", () => {
    expect(sourceForExample("circle", "// no functions here\n")).toBe("");
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
