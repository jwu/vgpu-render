# bevy / vgpu 文字对照

## 结论

`src/text-layout.ts` 声称移植自 bevy 的 `TextPipeline::update_text_layout_info`。这份文档记录用
**真实 bevy** 逐 glyph、逐像素验收那套布局语义的结果，以及为此修掉的六处偏差。

对照后的状态（`bun scripts/compare-text-reference.ts` 的输出）：

| 维度 | 结果 |
| --- | --- |
| 逐 glyph 几何 | 最大偏差 `dx ≤ 0.41 px`、`dy ≤ 1.16 px`，来自两侧光栅化器 ink box 的亚像素取整 |
| block 尺寸 | 13/13 用例完全一致（含 `ceil` 取整与行尾空白） |
| 墨量 | 相差 1.4%–4.9%，差在两套光栅化器（bevy 用 swash，浏览器用 Canvas2D） |

这不是「与 bevy 像素等价」的声明：编码（SDF/MSDF/outline）、颜色约定和光栅化都不同于 bevy，
只有**布局语义**以 bevy 为准。针对 Godot 的像素对照（图元与网格）在 `docs/visual-comparison.md`。

## 怎么跑

复现前提：bevy 侧需要 `~/src/bevy@bevyengine` 的 **0.20.0-dev** 检出（`Cargo.toml` 里是绝对路径，
换机器需按实际位置修改）。仓库只能确定这个版本号：path 依赖不携带来源 commit，`Cargo.lock` 也不含，
而原检出已不在，所以重新生成的是「同版本」而非「同一份」参照。完整的外部依赖清单见
`docs/visual-comparison.md` 的「复现前提」。

两侧读同一份用例表 `tools/bevy-text-reference/cases.json`，所以用例不会各自漂移。

```bash
# bevy 侧：离屏渲染 + dump 每个 glyph 的几何
CARGO_TARGET_DIR=~/src/bevy@bevyengine/target \
  cargo run --offline --manifest-path tools/bevy-text-reference/Cargo.toml -- \
  tools/bevy-text-reference/cases.json artifacts/text-reference

# vgpu 侧：浏览器渲染同样的用例，CDP 截图
bun run dev -- --host 127.0.0.1 --port 5174      # 另开一个 shell
bun scripts/capture-text-reference.ts [case ...]

# 两侧一起比，并打印上面那张表
bun scripts/compare-text-reference.ts [case ...]

# 并排 + 差异页
# http://127.0.0.1:5174/artifacts/text-reference/index.html
```

产物：`artifacts/text-reference/bevy-<id>.png`、`vgpu-<id>.png`，以及
`bevy-<id>.glyphs.json`（bevy 实际解析出的 glyph 矩形，图像像素坐标）。这些产物与对比页
都不入库（整个 `artifacts/` 在 `.gitignore` 里），由上面两条命令按需重新生成。

`tools/bevy-text-reference/Cargo.toml` 里的 `bevy` 是指向本地检出的 `path` 依赖，因为要对照的
就是那棵树的文字实现；用 **debug profile** 跑能直接复用 `~/src/bevy@bevyengine/target` 里已编译的
产物（`--release` 会从零重编整套 bevy）。

## 两侧怎么搭

**bevy 侧**（`tools/bevy-text-reference/src/main.rs`）是一个独立 crate，故意不复刻本仓库的任何设置
——它要显示的是 bevy 的行为本身，不是把 bevy 掰成和 vgpu 一致。

- 一台正交相机，投影恰好等于用例尺寸，于是 **1 世界单位 = 1 像素**，用例里的左上原点像素坐标直接可用。
- 每个用例渲染到自己的离屏 image target，`Screenshot::image` 落 PNG。
- `Text2d` 挂上用例点名的组件：`TextFont`、`TextColor`、`TextLayout`（justify / linebreak）、
  `LineHeight`、`LetterSpacing`、`TextBounds`、`Anchor`；分 span 的用例用 `TextSpan` 子实体。

**vgpu 侧**（`text-reference.html` + `src/text-reference.ts`）是一个 dev-only 页面，不在
`GODOT_EXAMPLES` 里、也不进生产构建。它固定用 `space: "screen"` 与 `bitmap` 字形源：

- `screen` 是两侧都能直接表达的放置方式（左上原点像素），不必绕相机矩阵。
- `bitmap` 是 bevy 的 `FontAtlas` 同为 coverage 的编码，因此可以和 bevy 逐像素比。

色彩路径与 gallery 相同：线性 `rgba16float` 工作空间 + present pass 一次编码。

## 怎么判

`scripts/compare-text-reference.ts` 按可靠性从高到低给三个数：

1. **逐 glyph 几何**：把 bevy dump 的每个 glyph 中心对 `layoutText` 的输出按行配对，取最大偏差。
   换行点或对齐框错一处，这里立刻是几十像素。bevy 会为空格也发一个 0×0 的 glyph，配对前先滤掉。
2. **block 尺寸**：bevy 会向上取整，并把每行断行处的空白算进宽度——这两个约定不移动任何 glyph，
   只能靠尺寸比。
3. **墨量**：逐像素 `luma(pixel) - luma(background)` 求和。这项差在两套光栅化器，是已知差异。

## 发布用例（13 个）

用例表只保留代表性的一组：一个用例对一个值得守的结论，`notes` 字段写明它测什么，对照页会显示出来。
完整的对照矩阵还跑过另外三组用例——`justify` 的其余方向、另两种 linebreak、12/16/24 px 的覆盖率和
其余 anchor——它们是被当作冗余精简掉的，不是「跑不过」。

| 用例 | 守住什么 |
| --- | --- |
| `justify-center` | 行宽含行尾空白（bevy 的 `Layout::full_width`），对齐在**那个**盒子里 |
| `justify-justified` | 除最后一行外拉伸到 bounds 宽度；最后一行保持自然宽度 |
| `linebreak-character` | 断行处的空格归上一行，不会成为下一行的行首 |
| `linebreak-none` | `NoWrap` 完全忽略 bounds 宽度 |
| `multiline-explicit` | 显式换行；空行照样占一个行盒 |
| `lineheight-1.6` | 行高是**相对于行内最大字号**的倍率，不是绝对像素 |
| `letterspacing-2` | letterSpacing 也加在行末字符之后（parley 加进每个 cluster 的 advance） |
| `spans-mixed` | 行盒取行内最大 span；逐 span 颜色 |
| `bounds-height-truncate` | `bounds` 高度不参与布局，不截断 |
| `coverage-20` | 正文字号的覆盖率基线（与 bevy 差 1.4%） |
| `coverage-36` | 展示字号：边缘带更宽，两侧漂得更远（4.6%） |
| `anchor-center` | anchor 偏移用的是向上取整后的 block 尺寸 |
| `anchor-bottom-right` | 反方向的 anchor 偏移，同时验符号与取整 |

## 修掉的六处偏差

修复前逐 glyph 偏差能到几十像素（换行点或对齐框不同，后续行整体错位）。六处都是 bevy/parley
的行为，本仓库原来的实现与之不符：

| # | 偏差 | bevy 的行为 | 修前 → 修后 |
| --- | --- | --- | --- |
| 1 | 行宽含行尾空格 | `Layout::full_width` 把每行断行处的空白算进去，block 宽度取它的最大值 | `justify-center` block 宽 228 → 240，居中偏移差 6.3 px → 0.37 px |
| 2 | 行高按行内最大 span 字号 | `LineHeight::RelativeToFont(v)` = `v × 该 run 自己的字号`，行盒取行内所有 run 的最大值 | `spans-mixed` 行高 24 → 34，glyph 纵向差 7.6 px → 0.52 px |
| 3 | `bounds` 高度不参与布局 | `Text2d` 从不按 `TextBounds.height` 截断；它只用来定节点尺寸 | `bounds-height-truncate` 由 2 行 30 glyph → 3 行 40 glyph，与 bevy 一致 |
| 4 | block 尺寸向上取整 | `layout_info.size = (full_width, height).ceil()`，anchor 用取整后的尺寸 | `coverage-20`/`coverage-12` 的 block 高由 14.4 → 15 |
| 5 | 断行的空格归上一行 | 空格是上一行的 trailing whitespace，不会被带到下一行行首 | `linebreak-character` 最大偏差 12.37 px → 0.37 px |
| 6 | letterSpacing 也加在最后一个字符之后 | parley 把它加进每个 cluster 的 advance | `letterspacing-2` 行宽 208 → 210；负值的用例 166 → 165 |

改动落在 `src/text-layout.ts`（布局）、`src/frame-recorder.ts`（新增 `lineHeightScale`，因为 bevy 的
`LineHeight::RelativeToFont(v)` 需要倍率形式才能表达）、`src/gpu-text-3d.ts`（把相对行高一路传到布局）。
同时纠正了 `text-layout.ts` 里一句与实测相反的注释：行盒不是从 block 默认字号解析的，而是从
**行内最大字号**。

## 已知差异（未对齐，也不打算对齐）

- **光栅化器不同。** bevy 用 swash 把字形栅格化进 `FontAtlas`，浏览器路径用 Canvas2D。发布用例集的
  墨量因此相差 1.4%–4.9%，且字号越小差越大：精简掉的 12 px 用例能到 **13.6%**，20 px 只有 1.4%。
  差异像素里 83%–87% 落在 bevy 侧的字形边缘上，不是布局差。
- **block 宽度可能差 1 px。** 两侧的 advance 累加走不同浮点路径，`ceil` 落在边界两侧时会分岔：
  12 px 用例我们报 109、bevy 报 108，而 36 px 用例两边同为 325（说明 bevy 自己也在边界上）。
- **颜色约定不同。** bevy 的 `TextColor(Color::srgb(..))` 是 sRGB-authored；本仓库的图元与文字颜色
  沿用 Godot 的约定**原样线性传递**（见 `src/color-space.ts`）。对照页因此在传给 recorder 之前把
  sRGB 值解码成线性，否则彩色 span 会比 bevy 亮一大截（`spans-mixed` 墨量差 18.9% → 4.9%）。
  **这是用库时要注意的点**：要「sRGB 里看起来像 `#8cd5ff`」的效果，得自己解码成线性值。
- **编码不在对照范围内。** bevy 只有 coverage 一种字形编码。本仓库的 `sdf` / `msdf` / outline
  没有 bevy 对应物，它们的取舍记在 `docs/visual-comparison.md` 与 README 的 Text 节。
