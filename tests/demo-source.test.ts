import { describe, expect, it } from "vitest";
import { sourceForExample, tokenizeSource } from "../gallery/demo-source.js";

const SAMPLE = `// note
const color = 12;
const name = "line";
const flag = true;
drawList.line();
`;

describe("sourceForExample", () => {
  it("returns the page module unchanged except for surrounding whitespace", () => {
    expect(sourceForExample("\n  const x = 1;\n")).toBe("const x = 1;");
  });

  it("keeps the comments that explain the page", () => {
    expect(sourceForExample("// note\nexport function draw(): void {}\n")).toContain("// note");
  });

  it("returns an empty string for a page without a source", () => {
    expect(sourceForExample("   ")).toBe("");
  });
});

describe("tokenizeSource", () => {
  it("round-trips the original text exactly", () => {
    const tokens = tokenizeSource(SAMPLE);
    expect(tokens.map((token) => token.text).join("")).toBe(SAMPLE);
  });

  it("classifies comments, strings, numbers, keywords and properties", () => {
    const kinds = new Map(tokenizeSource(SAMPLE).map((token) => [token.text, token.kind]));
    expect(kinds.get("// note")).toBe("comment");
    expect(kinds.get('"line"')).toBe("string");
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
