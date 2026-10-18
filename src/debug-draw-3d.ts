import {
  FrameDrawList,
  resolveFrameDrawListDefaults,
  type FrameCommand,
  type FrameDrawListDefaults,
  type LayerMask,
  type LineDefaults,
  type PointDefaults,
} from "./frame-draw-list.js";

export type DebugDrawOptions = {
  defaultVisibleLayers?: LayerMask;
  /** Style applied to every point that does not override it. */
  defaultPointStyle?: PointDefaults;
  /** Style applied to every line-like primitive that does not override it. */
  defaultLineStyle?: LineDefaults;
};

export class DebugDraw3D {
  readonly #visibleLayers: LayerMask;
  readonly #defaults: FrameDrawListDefaults;
  #active: FrameDrawList | undefined;

  constructor(options: DebugDrawOptions = {}) {
    const visibleLayers = options.defaultVisibleLayers ?? 0xffff_ffff;
    if (!Number.isInteger(visibleLayers) || visibleLayers < 0) {
      throw new RangeError("defaultVisibleLayers must be a non-negative integer bitmask");
    }
    this.#visibleLayers = visibleLayers;
    this.#defaults = {
      ...(options.defaultPointStyle === undefined ? {} : { point: { ...options.defaultPointStyle } }),
      ...(options.defaultLineStyle === undefined ? {} : { line: { ...options.defaultLineStyle } }),
    };
    // Validate eagerly so invalid defaults fail at construction, not on the first frame.
    resolveFrameDrawListDefaults(this.#defaults);
  }

  beginFrame(): FrameDrawList {
    if (this.#active !== undefined) {
      throw new Error("a debug draw frame is already active");
    }
    const drawList = new FrameDrawList(this.#defaults);
    this.#active = drawList;
    return drawList;
  }

  finishFrame(drawList: FrameDrawList): readonly FrameCommand[] {
    if (this.#active !== drawList) {
      throw new Error("drawList does not belong to this debug draw instance");
    }
    const commands = drawList.commands(this.#visibleLayers);
    drawList.seal();
    this.#active = undefined;
    return commands;
  }
}
