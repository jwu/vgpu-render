# 文本光栅化：按屏幕尺寸取档

这份文档记录默认文本源"按屏幕像素光栅化 + 档位阶梯"的设计、它与 bevy 的对应关系、以及验证到的
数据。布局语义的对照（逐 glyph 几何、block 尺寸）在 `docs/text-reference.md`，那篇与本篇互不覆盖。

## 要解决的问题

三个约束同时成立时，bevy 那套"每个字号一份图集"不再够用：

1. **中文**：常用字就有 3500+，一屏可能几百字，字号档数会被字数放大。
2. **字号不固定**：世界空间文本的字号随相机距离连续变化，屏幕空间 HUD 也可能逐帧改字号。
3. **尽量清晰**：字形是位图，只有"光栅化尺寸 ≈ 屏幕像素尺寸"时才最锐利。

bevy 的做法（`~/src/bevy@bevyengine`，0.20.0-dev）是 `FontAtlasKey` 带 `font_size_bits`
（`crates/bevy_text/src/font_atlas_set.rs:12`），Text2d 再按 `camera.target_scaling_factor()` 以物理
像素光栅化（`crates/bevy_sprite/src/text2d.rs`），绘制时 quad 用 `1/scale` 缩回。清晰度最好，代价是
字号档数 × 字数的显存，且 `FontAtlasSet` 只有 `clear()`，没有淘汰。

我们取它的"面向屏幕"那一半，另一半交给档位阶梯。

## 设计

| 环节 | 实现 |
| --- | --- |
| 光栅尺寸 | `quantizeRasterPx(screenPx)` 把"该 block 在屏幕上的字形尺寸"抬到阶梯上的档位（`src/text-raster.ts`，步进 1.25×，6–256 px） |
| 缓存键 | `family\|rasterPx\|character`（`src/text-atlas.ts` 的 `GlyphAtlas.glyph`）——**档位**而不是字号进 key，所以不同字号落在同一档时共享一次光栅化 |
| 屏幕尺寸来源 | `screen` 空间为 1（布局单位就是画布像素）；world 空间用 `pixelSize × viewProjection[1][1] × viewportSize.y × 0.5 / clip.w`，与线宽着色器同一套估算 |
| 缩小 | 现成的 4 级 mip 链 + 距离场感知降采样（`downsampleDistancePage`） |
| 采样 | coverage（bitmap）源对 mip 级别取 `floor`：阶梯最多过采样一档，此时把 level 0 与半分辨率级别混合正是"把已经对尺寸的笔画糊掉"的原因；真正缩小进入 mip 链后才用链 |
| 固定档位 | `dynamicRaster: false` 的源退回 `fontSize × rasterScale`；对照场景与 `text-reference.html` 用它保持"同一光栅尺寸并排比较" |
| 容量 | 多页 texture array + `beginFrame` 页回收 / 单矩形回收；全部页都满且无可回收时按 `onFull` 处理（默认 `"skip"` 丢弃并计入 `GpuText3D.skippedGlyphs`，`"throw"` 则抛错） |

### 为什么向上取档

取"覆盖请求的最小档位"（而不是最近档），保证字形在解码时永远不会被放大，只会被缩小——缩小是 mip 链
能处理的方向。过采样最多一档（≤25%），由 mip 与 floor 采样兜住。

### 中文断行与禁则

`src/text-layout.ts` 的 `tokenize` 把 CJK 汉字、假名、谚文与全角标点切成独立 token，于是
`lineBreak: "word"` 也会在任意两字之间换行（拉丁词仍按空格换行）。禁则（行首不留闭合标点、行尾不留开
括号）用"把标点粘到相邻 token"表达，因为断行器只能整 token 搬移。

字体本身不内嵌 CJK：canvas 回退到系统 CJK 字体，与 bevy 用 fontique 做系统回退是同一种安排；需要固定
字形时传 `fontFamily`（项目内嵌或由文档加载）。

## 验证数据

### 与 bevy 的放大对比（`artifacts/text-reference/`）

同一份用例、两侧都用 coverage 位图，放大 4× 后逐像素差几乎没有增长，说明两侧在放大下是同一种重采样：

| case | 1:1 MAE | 4× 后 MAE |
| --- | --- | --- |
| coverage-36 | 1.59 | 1.76 |
| coverage-20 | 1.18 | 1.33 |
| multiline-explicit | 0.51 | 0.58 |
| spans-mixed | 0.52 | 0.58 |

### 中文清晰度（拆分前的 `text-hud` 页，1600×1000，DPR 1）

同一帧内三行中文（12/18/28 px），量的是字形边缘"1 px 过渡"占比：

| 行 | floor(lod) 之前 | 之后 |
| --- | --- | --- |
| 12 px | 32.1% | 32.1%（lod 已在 0 附近） |
| 18 px | 27.8% | **48.0%** |
| 28 px | 38.2% | **52.8%** |

## 复现方式

```bash
bun run dev -- --host 127.0.0.1 --port 5175
# 浏览器打开 http://127.0.0.1:5175/?scene=text-cjk（中文断行、禁则与四档字号）
bun scripts/capture-vgpu.ts text-cjk   # 固定分辨率截图（注意会覆盖 artifacts 里的基线）
```

单测覆盖档位量化与 CJK 断行：`bun test tests/text-raster.test.ts tests/text-layout.test.ts`。

## 已知限制与可调参数

- **档位步进**：`DEFAULT_RASTER_STEP`（1.25）与 `MIN/MAX_RASTER_PX` 是清晰度与图集面积的旋钮；步进更细
  更接近 1:1，代价是每字多几份光栅化。
- **世界空间的估算**：`screenPixelsPerWorldUnit` 忽略 block 自身平面与相机的夹角，只按点处的投影缩放
  估；差一档由"向上取档"吸收。
- **hinting 与子像素**：Canvas2D 走系统设置；不像 bevy 那样按子像素偏移分 bin，同一档位每个字符只光栅化
  一次（bevy 0.20-dev 的 `GlyphCacheKey` 也只带 glyph id）。
- **距离场源不参与档位**：`sdf`/`msdf` 源按 `dynamicRaster` 决定是否跟随屏幕；距离场本身不需要档位，它们的采样走连续
  lod。预烘焙的 `baked` 源则是**固定在 24 px 烘焙尺度**上的：它离烘焙尺寸越远（放大到 28 px 或缩小到 14 px）
  重建误差越明显，笔画会发虚或有毛刺 —— 所以默认源不是它，而是按屏幕尺寸取档的位图；`baked` 适合在接近
  烘焙尺寸处使用，或作为“无运行时编码”的取舍。若要把预烘焙也抬到逐字号质量，需要提高烘焙尺寸（页面面积
  与载荷随之上升）或烘焙多档。
- **脚本覆盖**：本布局不做 shaping，需要连字/复杂脚本（阿拉伯、印度系）的文本不支持。
