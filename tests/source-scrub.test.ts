import { describe, expect, it } from "vitest";
import { sanitizeSource } from "../scripts/source-scrub.js";

describe("sanitizeSource", () => {
  it("replaces brand mentions inside line and block comments", () => {
    const source = "// bevy's `Camera2d`\n/* the reference addon default */\nconst addon = 1;";
    expect(sanitizeSource(source)).toBe("// reference `Camera2d`\n/* the reference default */\nconst addon = 1;");
  });

  it("leaves code and string literals untouched", () => {
    const source = `drawList.text("bevy", { space: "screen" });`;
    expect(sanitizeSource(source)).toBe(source);
  });

  it("rewrites the parity doc path", () => {
    expect(sanitizeSource("// see docs/godot-debug-draw-parity.md")).toBe("// see the parity notes");
    expect(sanitizeSource("// see docs/reference-parity.md")).toBe("// see the parity notes");
  });

  it("collapses upstream paths and addon phrases instead of leaving fragments", () => {
    expect(sanitizeSource("// ported from `~/src/godot-debug-draw@hardpixel/examples`")).toBe(
      "// ported from `the upstream reference`",
    );
    expect(sanitizeSource("// (`crates/bevy_text/src/font_atlas.rs`): packed")).toBe(
      "// (`the reference implementation`): packed",
    );
    expect(sanitizeSource("// the reference addon has no text API")).toBe("// the reference has no text API");
  });

  it("is idempotent", () => {
    const source = "// bevy's `Camera2d`\nconst x = 1; // addon default";
    expect(sanitizeSource(sanitizeSource(source))).toBe(sanitizeSource(source));
  });
});
