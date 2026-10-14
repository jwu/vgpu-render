import {
  FrameRecorder,
  resolveFrameRecorderDefaults,
  type FrameCommand,
  type FrameRecorderDefaults,
  type LayerMask,
  type LineDefaults,
  type PointDefaults,
} from "./frame-recorder.js";

export type DebugDrawOptions = {
  defaultVisibleLayers?: LayerMask;
  /** Style applied to every point that does not override it. */
  defaultPointStyle?: PointDefaults;
  /** Style applied to every line-like primitive that does not override it. */
  defaultLineStyle?: LineDefaults;
};

export class DebugDraw3D {
  readonly #visibleLayers: LayerMask;
  readonly #defaults: FrameRecorderDefaults;
  #active: FrameRecorder | undefined;

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
    resolveFrameRecorderDefaults(this.#defaults);
  }

  beginFrame(): FrameRecorder {
    if (this.#active !== undefined) {
      throw new Error("a debug draw frame is already active");
    }
    const recorder = new FrameRecorder(this.#defaults);
    this.#active = recorder;
    return recorder;
  }

  finishFrame(recorder: FrameRecorder): readonly FrameCommand[] {
    if (this.#active !== recorder) {
      throw new Error("recorder does not belong to this debug draw instance");
    }
    const commands = recorder.commands(this.#visibleLayers);
    recorder.seal();
    this.#active = undefined;
    return commands;
  }
}
