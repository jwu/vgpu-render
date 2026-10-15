/**
 * Color-space helpers for the debug-draw port.
 *
 * Both reference implementations blend in a linear working space and encode only on
 * output: Godot renders with `blend_mix` and encodes into its sRGB framebuffer, and Bevy
 * blends on a linear target and presents the swapchain through an sRGB view
 * (`add_srgb_suffix`). This port therefore renders into a linear `rgba16float` target and
 * re-encodes in the present pass.
 *
 * Which colors need an sRGB decode depends on how the reference declares them:
 *
 * - **Primitive colors are passed through as authored.** Godot's debug shaders do
 *   `ALBEDO = COLOR.rgb`, and `COLOR` carries no `source_color` qualifier, so
 *   `Color(1, 0.85, 0.1)` reaches the linear shading math unchanged. Decoding here would
 *   darken every debug primitive.
 * - **Grid colors are decoded.** The infinite-grid uniforms are declared
 *   `uniform vec4 thin_line_color : source_color`, so Godot converts them from sRGB to
 *   linear before the shader sees them. Skipping the decode renders the grid far too
 *   bright.
 * - **The clear color is decoded.** Godot's `default_clear_color` is an sRGB-authored
 *   project setting that the engine converts before clearing.
 */

/** sRGB EOTF: decodes one sRGB-encoded component to linear. */
function decodeComponent(value: number): number {
  // `!(value > 0)` also catches NaN, which would otherwise escape as NaN.
  if (!(value > 0)) return 0;
  if (value >= 1) return 1;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/**
 * Decodes an sRGB-authored clear color into the linear value the scene pass clears to.
 * Returns a new tuple so the caller cannot alias the config array.
 */
export function linearClearColor(color: readonly [number, number, number, number]): [number, number, number, number] {
  return [decodeComponent(color[0]), decodeComponent(color[1]), decodeComponent(color[2]), color[3]];
}

/**
 * Decodes an sRGB-authored grid color to linear, preserving a caller-supplied alpha.
 * The grid scales alpha per frame, so alpha is passed in separately.
 */
export function linearGridColor(color: readonly [number, number, number, number], alpha: number): [number, number, number, number] {
  return [decodeComponent(color[0]), decodeComponent(color[1]), decodeComponent(color[2]), alpha];
}
