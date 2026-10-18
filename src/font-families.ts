/**
 * The font families the gallery registers, kept apart from the data that defines them.
 *
 * A scene names a family; it must not import the embedded bytes of one, or every consumer of the
 * scene module would carry a payload only the gallery can use. The bytes live in
 * `src/assets/vgpu-sans-faces.ts` and are imported by `demo-engine.ts` alone.
 */

/** The multi-weight sans family the font-query page draws with. */
export const MULTI_WEIGHT_SANS_FAMILY = "vgpu-render-sans";
