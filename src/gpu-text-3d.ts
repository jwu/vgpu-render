/**
 * GPU text renderer.
 *
 * One instanced quad per glyph, sampling a glyph atlas page, exactly the shape bevy's
 * sprite text takes: `TextPipeline` lays the glyphs out, `FontAtlas` holds the rasterised
 * coverage, and the render pass instantiates one quad per `PositionedGlyph`
 * (`crates/bevy_text/src/pipeline.rs`, `crates/bevy_sprite_render/src/text2d/mod.rs`).
 *
 * The atlas stores a tintable alpha mask (RGB = 255, A = coverage) like bevy's `FontAtlas`,
 * so the fragment stage only has to multiply the coverage into the span colour's alpha. When
 * the glyph source encodes a distance field instead, the fragment stage reconstructs the edge
 * from it, which keeps the glyph sharp at any magnification. Three
 * placement spaces share the pipeline and are selected per instance:
 *
 * Layout and the atlas both work in font pixels and the two world spaces scale the result by
 * `pixelSize`. That split is the reference `Label3D.font_size` / `pixel_size` pair, and it is
 * what lets a block keep a fixed world size while its glyphs are rasterised at any resolution.
 *
 * - `world-plane` builds the block on a fixed local XY plane, so it foreshortens with the
 *   camera the way a reference `Label3D` does.
 * - `world-billboard` builds it from the camera's own right/up axes, read out of the view
 *   matrix, so the block always faces the camera.
 * - `screen` places it at a top-left origin pixel position with no projection at all.
 *
 * Depth is tested but never written. World text is therefore occluded by geometry in front of
 * it, while screen text sits at the near plane and always wins; not writing depth keeps a
 * glyph's translucent ink box from clipping the glyphs drawn after it.
 */

import { compute, draw, sampler, storage, texture, type Compute, type Draw, type FrameComputePass, type FramePass, type Gpu, type StorageBuffer, type Texture } from "vgpu";
import { prepareShader } from "@vgpu/wgsl/prepare";
import { instanceGeometry, type InstanceGeometry } from "vgpu/scene/gpu";
import { instances, type InstanceCollection, type InstanceId } from "vgpu/scene";
import type { TextCommand } from "./frame-recorder.js";
import { depthBiasHelpers, identity, indirectArgs, INDIRECT_SHADER, trim, world, zeroGeometry } from "./gpu-instancing.js";
import { DEFAULT_ATLAS_SIZE, buildMipChain, GlyphAtlas, padMipRows, type GlyphEncoding } from "./text-atlas.js";
import { DEFAULT_SDF_RANGE } from "./text-sdf.js";
import { layoutText, resolveTextAnchor, type TextMeasurer } from "./text-layout.js";
import type { GlyphRasterizer } from "./text-font.js";

/** Both halves of a font: metrics for layout and pixels for the atlas. */
export type TextFontSource = GlyphRasterizer & TextMeasurer;

export type GpuText3DOptions = {
  readonly font: TextFontSource;
  /** Maximum glyph instances. Defaults to 16384. */
  readonly capacity?: number;
  /**
   * Atlas page size. Must be a multiple of 64 so a page row is a multiple of WebGPU's 256 byte
   * `bytesPerRow` alignment. Defaults to 512, bevy's minimum atlas size.
   */
  readonly atlasSize?: number;
  /** Depth bias baked into the shader, matching the reference primitive bias. */
  readonly depthBias?: number;
  /**
   * Mip levels for the atlas page, including level 0. A chain is what stops distant text from
   * shimmering, but the packing padding shrinks with every level, so a deep chain eventually
   * bleeds between neighbours. Defaults to 4, which takes a 512 px page down to 64 px.
   */
  readonly mipLevels?: number;
};

const DEFAULT_TEXT_DEPTH_BIAS = -0.001;
/** Levels of the atlas mip chain. A 512 px page reaches 64 px; beyond that the padding bleeds. */
const DEFAULT_MIP_LEVELS = 4;

/** Placement space, encoded in the low two bits of an instance's flags. */
const SPACE_WORLD_PLANE = 0;
const SPACE_WORLD_BILLBOARD = 1;
const SPACE_SCREEN = 2;
/** Third flag bit: skip depth comparison entirely and sit at the near plane. */
const FLAG_NO_DEPTH = 4;

function textShader(depthBias: number, encoding: GlyphEncoding, distanceRange: number): string {
  // The atlas holds either an anti-aliased coverage mask (bevy's `FontAtlas` layout) or a distance
  // field. Coverage is already the answer; a distance has to be turned back into it, and the
  // screen-space derivative is what keeps that transition one pixel wide however far the camera
  // pushes the glyph — which is the whole point of storing a distance.
  const reconstruct = (stored: string, helper: string): string => `${helper}@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  // One screen pixel of edge is the goal. Two separate things have to be right for that:
  //
  // 1. The derivative is taken on the UV coordinate, not on the decoded distance. The stored distance
  //    is quantised to 8 bits, so its own derivative jumps between zero and a quantisation step and
  //    stencils a regular dot pattern over the glyph. UV interpolation is smooth.
  // 2. The range spans the whole encoded field, not half of it: stored 0 to 1 covers
  //    2 * DISTANCE_RANGE texels, and getting that factor wrong makes the transition narrower than a
  //    pixel, which reads as a hard, comb-toothed edge.
  let unitRange = vec2f(2.0 * DISTANCE_RANGE) / vec2f(textureDimensions(atlas, 0));
  let screenTexSize = vec2f(1.0) / fwidth(input.uv);
  let screenPxRange = max(dot(unitRange, screenTexSize), 1.0);
  let distance = screenPxRange * (${stored} - 0.5);
  return vec4f(input.color.rgb, input.color.a * clamp(distance + 0.5, 0.0, 1.0));
}
`;
  const fragment =
    encoding === "sdf"
      ? reconstruct("textureSample(atlas, atlasSampler, input.uv).r", "")
      : encoding === "msdf"
        ? reconstruct(
            "median3(textureSample(atlas, atlasSampler, input.uv).rgb)",
            `// The median of the three per-edge distances is the distance to the nearest edge, which is
// what preserves the corners a single channel rounds off.
fn median3(value: vec3f) -> f32 {
  return max(min(value.r, value.g), min(max(value.r, value.g), value.b));
}
`,
          )
        : `@fragment fn fs_main(input: Out) -> @location(0) vec4f {
  let coverage = textureSample(atlas, atlasSampler, input.uv).a;
  return vec4f(input.color.rgb, input.color.a * coverage);
}
`;
  return `
struct Camera { viewProjection: mat4x4f, view: mat4x4f, viewportSize: vec2f }
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;
${depthBiasHelpers(depthBias)}${encoding === "bitmap" ? "" : `\nconst DISTANCE_RANGE: f32 = ${distanceRange};`}
struct In {
  @location(0) position: vec3f,
  @location(1) world0: vec4f, @location(2) world1: vec4f,
  @location(3) world2: vec4f, @location(4) world3: vec4f,
  @location(5) origin: vec3f,
  @location(6) offset: vec2f,
  @location(7) size: vec2f,
  @location(8) uv: vec4f,
  @location(9) color: vec4f,
  @location(10) flags: u32,
}
struct Out { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f }

@vertex fn vs_main(input: In, @builtin(vertex_index) vertex: u32) -> Out {
  let corners = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  let corner = corners[vertex];
  // Layout space has y growing downwards: \`offset\` is the ink box centre and \`size\` its extent.
  let local = (corner - vec2f(0.5)) * input.size + input.offset;
  let space = input.flags & 3u;

  var clip: vec4f;
  if (space == ${SPACE_SCREEN}u) {
    // \`origin.xy\` is a top-left origin pixel position; z is ignored.
    let pixels = input.origin.xy + local;
    clip = vec4f(pixels.x / camera.viewportSize.x * 2.0 - 1.0, 1.0 - pixels.y / camera.viewportSize.y * 2.0, 0.0, 1.0);
  } else {
    var worldPosition: vec3f;
    if (space == ${SPACE_WORLD_BILLBOARD}u) {
      // The rotation rows of the world-to-view matrix are the camera's axes in world space.
      let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
      let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
      worldPosition = input.origin + right * local.x - up * local.y;
    } else {
      worldPosition = input.origin + vec3f(local.x, -local.y, 0.0);
    }
    clip = camera.viewProjection * vec4f(worldPosition, 1.0);
  }

  var out: Out;
  // Screen and explicitly depth-free blocks pin themselves to the near plane, where a
  // "less-equal" test against anything already drawn succeeds.
  let depth = select(apply_depth_bias(clip), 0.0, (input.flags & ${FLAG_NO_DEPTH}u) != 0u);
  out.clip = vec4f(clip.xy, depth, clip.w);
  out.uv = mix(input.uv.xy, input.uv.zw, corner);
  out.color = input.color;
  return out;
}

${fragment}`;
}

export class GpuText3D {
  readonly #gpu: Gpu;
  readonly #font: TextFontSource;
  readonly #atlas: GlyphAtlas;
  readonly #glyphs: InstanceCollection;
  readonly #ids: InstanceId[] = [];
  readonly #bridge: InstanceGeometry;
  readonly #draw: Draw;
  readonly #indirect: StorageBuffer;
  readonly #indirectCompute: Compute;
  readonly #page: Texture;
  readonly #sampler: GPUSampler;
  readonly #mipLevels: number;
  #uploadedRevision = -1;
  #viewProjection: ArrayLike<number> = identity();
  #view: ArrayLike<number> = identity();
  #count = 0;

  constructor(gpu: Gpu, options: GpuText3DOptions) {
    const capacity = options.capacity ?? 16384;
    const atlasSize = options.atlasSize ?? DEFAULT_ATLAS_SIZE;
    if (atlasSize % 64 !== 0) {
      throw new RangeError("atlasSize must be a multiple of 64 so an atlas row meets WebGPU's 256 byte alignment");
    }
    this.#gpu = gpu;
    this.#font = options.font;
    // One page only: a second page would need a second draw call and a second indirect buffer,
    // and the caller can always raise `atlasSize` instead.
    // The source owns the rasterisation scale, so two sources of one encoding can coexist in a frame.
    this.#atlas = new GlyphAtlas(options.font, { size: atlasSize, maxPages: 1 });
    // A chain cannot outrun the page: a 512 px atlas only has ten levels down to 1×1.
    this.#mipLevels = Math.max(1, Math.min(options.mipLevels ?? DEFAULT_MIP_LEVELS, Math.floor(Math.log2(atlasSize)) + 1));
    this.#glyphs = instances({
      capacity,
      attributes: {
        // Named `origin`, not `position`: the shared quad mesh already claims `position` for the
        // base layout, and vgpu rejects an attribute that both layouts define.
        origin: "float32x3",
        offset: "float32x2",
        size: "float32x2",
        uv: "float32x4",
        color: "float32x4",
        flags: "uint32",
      },
    });
    const mesh = zeroGeometry(gpu);
    this.#bridge = instanceGeometry(gpu, this.#glyphs, { mesh });
    this.#draw = draw(gpu, {
      shader: prepareShader(textShader(options.depthBias ?? DEFAULT_TEXT_DEPTH_BIAS, this.#atlas.encoding, this.#atlas.distanceRange ?? DEFAULT_SDF_RANGE)),
      geometry: this.#bridge.geometry,
      instances: 0,
      blend: "alpha",
      cull: "none",
      depth: { write: false, compare: "less-equal" },
    });
    this.#indirect = storage(gpu, 16, { access: "read-write", indirect: true });
    this.#indirectCompute = compute(gpu, INDIRECT_SHADER);
    indirectArgs(this.#indirect, 6, 0);
    this.#page = texture(gpu, {
      kind: "2d",
      size: [atlasSize, atlasSize],
      format: "rgba8unorm",
      usage: ["texture_binding", "copy_dst"],
      mipLevelCount: this.#mipLevels,
    });
    this.#sampler = sampler(gpu, {
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
  }

  /** Lays out every block, fills the glyph atlas, and refreshes the instance buffer. */
  prepare(commands: readonly TextCommand[], camera: { readonly viewProjection: ArrayLike<number>; readonly view: ArrayLike<number> }): void {
    let index = 0;
    for (const command of commands) {
      const layout = layoutText(
        command.spans,
        {
          color: command.color,
          fontSize: command.fontSize,
          fontFamily: command.fontFamily,
          lineHeight: command.lineHeight,
          letterSpacing: command.letterSpacing,
          justify: command.justify,
          lineBreak: command.lineBreak,
          bounds: command.bounds,
          anchor: resolveTextAnchor(command.anchor),
        },
        this.#font,
      );
      const space = command.space === "world-billboard" ? SPACE_WORLD_BILLBOARD : command.space === "screen" ? SPACE_SCREEN : SPACE_WORLD_PLANE;
      // Screen text never takes part in depth testing, whatever the command asked for.
      const flags = space | (command.depthTest && space !== SPACE_SCREEN ? 0 : FLAG_NO_DEPTH);
      // The quad's size comes from the layout, not from the atlas. A distance field can be drawn at
      // any size, and a prebaked page stores every glyph at one fixed raster whatever font size is
      // asked for, so only the UV rectangle is tied to the stored texels.
      const scale = space === SPACE_SCREEN ? 1 : command.pixelSize;
      for (const glyph of layout.glyphs) {
        const entry = this.#atlas.glyph(glyph.character, glyph.fontFamily, glyph.fontSize);
        if (entry === undefined) continue;
        const id = this.#ids[index] ?? this.#addInstance(index);
        this.#glyphs.set(id, {
          origin: command.position,
          offset: [glyph.center[0] * scale, glyph.center[1] * scale],
          size: [glyph.width * scale, glyph.height * scale],
          uv: entry.uv,
          color: glyph.color,
          flags,
        });
        index++;
      }
    }
    trim(this.#glyphs, this.#ids, index);
    this.#count = this.#bridge.publish();
    indirectArgs(this.#indirect, 6, this.#count);
    this.#viewProjection = camera.viewProjection;
    this.#view = camera.view;
    this.#uploadAtlas();
  }

  #addInstance(index: number): InstanceId {
    const id = this.#glyphs.add({ origin: [0, 0, 0], offset: [0, 0], size: [0, 0], uv: [0, 0, 0, 0], color: [0, 0, 0, 0], flags: 0 });
    world(this.#glyphs, id);
    this.#ids[index] = id;
    return id;
  }

  /**
   * Copies the atlas page into its GPU texture when new glyphs landed in it, rebuilding the whole
   * mip chain. WebGPU has no `generateMipmap` and vgpu exposes none, so the levels are filtered on
   * the CPU — the coverage channel averages correctly, and the chain only has to be rebuilt on the
   * frames that actually added a glyph. Uploads use the native queue directly, which is what
   * `Texture.gpu` exists for.
   */
  #uploadAtlas(): void {
    const page = this.#atlas.pages[0];
    if (page === undefined || page.revision === this.#uploadedRevision) return;
    const chain = buildMipChain(page.data, page.size, this.#mipLevels);
    for (let level = 0; level < chain.length; level++) {
      const mip = chain[level]!;
      const rows = padMipRows(mip.data, mip.size);
      this.#gpu.gpu.queue.writeTexture(
        { texture: this.#page.gpu, mipLevel: level },
        rows.data,
        { bytesPerRow: rows.bytesPerRow, rowsPerImage: mip.size },
        { width: mip.size, height: mip.size, depthOrArrayLayers: 1 },
      );
    }
    this.#uploadedRevision = page.revision;
  }

  /**
   * Refreshes this draw's indirect arguments inside an already-open compute pass, so a frame
   * only needs one pass for every indirect draw in it.
   */
  dispatchIndirect(pass: FrameComputePass): void {
    this.#indirectCompute.set({ params: { vertexCount: 6, instanceCount: this.#count }, args: this.#indirect });
    pass.dispatch(this.#indirectCompute, 1);
  }

  draw(pass: FramePass): void {
    if (this.#count === 0) return;
    this.#draw.set({
      camera: { viewProjection: this.#viewProjection, view: this.#view, viewportSize: pass.target.size },
      atlas: this.#page,
      atlasSampler: this.#sampler,
    });
    pass.draw(this.#draw, { indirect: this.#indirect });
  }

  get glyphCount(): number {
    return this.#count;
  }

  destroy(): void {
    this.#draw.dispose();
    this.#bridge.destroy();
    this.#indirectCompute.dispose();
    this.#page.dispose();
  }
}
