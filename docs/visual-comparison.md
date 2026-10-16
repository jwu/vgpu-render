# Godot / vgpu 实时截图对比

## 结论

当前实现是 **partial parity**，不是完整 Godot 移植。真实 GPU 烟雾测试通过只能证明能够渲染，
不能证明图元、参数矩阵、布局或像素一致。已经做忠实移植并逐像素验收的部分：Circle/Line、
全场景布局、infinite grid、色彩空间、round/bevel/miter 接头、曲线控制点标记、
sphere/capsule/cone/cylinder 线框拓扑，normal-aware 线与接头的逐顶点法向（第九轮），以及
平面图元的逐顶点法向与 `index`/`world_space_width` 的列基向量（第十轮）。
仍然不对齐：AA（Godot MSAA vs 无 AA）、world-space 宽度的 3D 侧向、`demo.gd`。
参考样例的列/行标签是场景自带的 `Label3D`，不是 addon 输出；vgpu 另行实现了文字渲染
（见 README 的 Text 节）并新增 `text-compare`（对照矩阵）与六个屏幕空间文字页
（`text-encodings` / `text-scale` / `text-world-zoom` / `text-layout` / `text-anchor` / `text-cjk`），
但未逐列对齐参考标签。
文字的**布局语义**另有以 bevy 为参照的逐 glyph 验收，方法与结论见 `docs/text-reference.md`。

## 产物

截图**不入版本控制**：整个 `artifacts/` 目录都在 `.gitignore` 里，截图、逐 glyph 数据与
对比页都按需生成：

```bash
bun run dev -- --host 127.0.0.1 --port 5174
bun scripts/capture-vgpu.ts circle line
```

- `compare-{circle,line}-{full,detail}.png`：人工裁剪的并排图。
- 形状场景原图：`artifacts/visual-baseline/{godot,vgpu}-{sphere,capsule,cone,cylinder,index,world_space_width}.png`
- 其余场景原图：`artifacts/visual-baseline/{godot,vgpu}-{circle,line}.png` 与 `vgpu-*.png`
- 文本场景没有 Godot 参考（addon 无文本 API）：`artifacts/visual-baseline/vgpu-text-hud.png`
  是**拆分前**的一页（1920×1080 / DPR 1，非 compare 模式，`?scene=text-hud`），用于对比 vgpu
  自身在字形编码、超采样与描边上的变化，不参与和 Godot 的像素比较。该页现已拆成六个
  屏幕空间场景（见 README 的 Text 节），这份基线保留为历史产物。
- 浏览器对比页：`http://127.0.0.1:5174/artifacts/visual-baseline/index.html`
  （含六个形状场景的并排对比）；页面引用的 PNG 需先本地生成，未生成时显示缺图。
- `before-circle-line/`：第一轮的旧截图，仅作“修复前”的历史证据（同样不入库，本地未必有）。

局部放大使用两边相同的像素裁剪区域 `(650,400)-(1350,680)`，然后统一放大；没有独立移动、缩放或变形来隐藏布局差异。

Godot 参考图是**机器特定**的，见下节「捕获条件」：当前记录的参考环境是 RTX 4070 SUPER，而首轮
vgpu 侧未记录 adapter，且该机器已不可复现。换机器重跑得到的**不是同一份参照**，重捕获前先核对捕获条件。

## 复现前提

仓库只保存复现链路（`scripts/`、`tools/bevy-text-reference/`、夹具 `cases.json` 与字体源），参考截图本身不入库。要在本地重建对比，需要下面三项外部依赖：

| 参照 | 需要什么 | 仓库能确定到哪一步 |
| --- | --- | --- |
| vgpu 侧 | Bun + Vite + 支持 WebGPU 的 Chromium + 可用 GPU 显示服务器 | 完全自足，见 `scripts/capture-vgpu.ts` |
| Godot 侧 | Godot 4.7.2，以及 `/tmp/vgpu-parity-godot` 独立副本（内含 `godot-debug-draw@hardpixel`，revision `bc51ddddcdc519164f8261fe2926fda8b3f0c39b`） | addon revision 已记录；`/tmp` 副本需自行创建（重启即丢），引擎二进制需自备 |
| bevy 侧（仅文字） | `~/src/bevy@bevyengine` 的 0.20.0-dev 检出，以及其中 `assets/fonts/FiraMono-Medium.ttf` | **只能确定到 `0.20.0-dev`**：`tools/bevy-text-reference/Cargo.toml` 用的是 path 依赖，`Cargo.lock` 不含来源 commit，而原检出已不在——因此再次生成的是「同版本」而非「同一份」参照 |

`tools/bevy-text-reference/Cargo.toml` 里的 bevy 路径是绝对路径，换机器跑之前需要按实际检出
位置修改。用 debug profile 可复用该检出 `target/` 里已编译的产物（`--release` 会从零重编整套 bevy）。仓库内的 `src/assets/fonts/fira-mono-medium-subset.ttf` 是从上面那个字体裁出的 subset。

## 捕获条件

| 项目 | 条件 |
| --- | --- |
| Godot 来源 | `godot-debug-draw@hardpixel`，revision `bc51ddddcdc519164f8261fe2926fda8b3f0c39b` |
| 执行位置 | `/tmp/vgpu-parity-godot`，独立副本；未修改上游仓库 |
| Godot renderer | Godot 4.7.2 / Forward+ / Vulkan / NVIDIA RTX 4070 SUPER |
| 浏览器 | 首轮：`/usr/bin/chromium`，X11/Vulkan flags，CDP 截图（未记录 WebGPU adapter，也未记录 GPU）。重捕获：`google-chrome-stable` 154 + Intel Iris Plus Graphics 650 / Gen9 硬件 adapter；两种条件都不宣称与 Godot 是同一 adapter（见下节） |
| 视口 | 1920×1080，浏览器 DPR=1 |
| 投影 | perspective，vertical FOV=75°，near=0.05，far=100 |
| 相机 | eye=(8,16,21.5)，target=(0,0,0)，up=(0,1,0) |
| 场景 | Godot 根节点平移 (-10,0,1.5)，不缩放任何图元；vgpu 在 Circle/Line 中烘焙同一偏移 |
| 时间 | Godot 每次 `_process(0)`，第 10 帧捕获；vgpu `animate=false`，`time=0` |
| 网格 | 两边保留各自实现，以观察 grid 差异 |
| UI | vgpu 隐藏侧栏/详情；Godot 保留场景原有 Label3D |
| 抗锯齿 | Godot 沿用原项目 MSAA；vgpu 沿用当前管线。尚未统一 |

两边相机/投影/分辨率相同，但场景数据、网格和 AA 不完全一致。因此本轮仍是**结构与视觉诊断**，不报告严格像素误差分数。

### 重捕获记录（capture 脚本可移植性修复后）

修复 `scripts/capture-vgpu.ts` 的浏览器解析后，`vgpu-circle.png` 与 `vgpu-line.png` 在本机
（Intel Iris Plus Graphics 650 / Gen9，`google-chrome-stable` 154）重捕获了一次。与首轮基线的差异
只集中在图元边缘，没有整体平移、缩放或变形：

| 场景 | 不同像素 | 通道差 1-2 | 通道差 >9 | 涉及行数 |
| --- | --- | --- | --- | --- |
| Circle | 19597 / 2073600（0.945%） | 19544 | 47 | 865 |
| Line | 19204 / 2073600（0.926%） | 19155 | 48 | 865 |

已确认的归因：`VGPU_OZONE_PLATFORM=x11` 与 Wayland 两次捕获的输出**逐字节相同**，所以差异与显示
服务器无关。首轮条件只记录了浏览器与 X11 flags，没有记录 GPU、浏览器版本和 WebGPU adapter，本轮
为 Intel Gen9 + Chrome 154；光栅化舍入与抗锯齿实现不同是最可能的原因，但原机器不可复现，因此这
一点**未做严格归因**。本轮不改变任何 parity 结论，只是把新基线绑定到上面记录的环境。

## 文本渲染的外部参照（Godot + msdfgen）

文本子系统没有 Godot 参考场景（addon 无文本 API），但**渲染机制**可以对照：Godot 4.7 内置 msdfgen
（`thirdparty/msdfgen`），它的 MSDF 采样本身就是 msdfgen 的官方做法。据此搭了一个最小参照项目，
用同一个字体（`~/src/bevy@bevyengine/assets/fonts/FiraMono-Medium.ttf`，本仓库的 subset 就是从它裁的）
画同一个字符串，一行灰度栅格化、一行 MSDF。

| 项 | 值 |
| --- | --- |
| 引擎 | Godot 4.7.2.stable，Vulkan / Forward+ / RTX 4070 SUPER |
| 捕获脚本 | `scripts/capture-godot-text.gd`（离屏 SubViewport，1920×1080，不受窗口尺寸影响） |
| 字体 / 字号 | FiraMono-Medium.ttf / 20 px |
| MSDF 参数 | `msdf_pixel_range = 8`、`msdf_size = 48`（Godot 默认），即 range/size = 1/6 |
| 栅格化开关 | `hinting = NONE`、`subpixel_positioning = DISABLED`、灰度抗锯齿 |
| 背景 | `#1e1e1e`，与 gallery 画布一致 |

```bash
godot --path /tmp/vgpu-text-parity --display-driver x11 --audio-driver Dummy \
  --script "$PWD/scripts/capture-godot-text.gd" -- \
  ~/src/bevy@bevyengine/assets/fonts/FiraMono-Medium.ttf /tmp/godot-text.png 20
```

（`--script` 取绝对路径：`--path` 指向的是另一个项目，`res://` 解析不到本仓库的 `scripts/`。）

### 指标（同一条扫描线，取 15 行平均）

`mid` = 半覆盖像素，`full` = 全亮像素，`ink` = 等效全覆盖像素数，均为每行的平均值，列窗口相同：

| 渲染 | mid | full | ink |
| --- | --- | --- | --- |
| Godot grayscale raster | 10.1 | 11.5 | 4.18 |
| Godot MSDF size=48 | 12.7 | 13.0 | **4.70** |
| vgpu bitmap 1x | 11.1 | 14.1 | 5.10 |
| vgpu sdf 4x | 15.6 | 11.6 | 5.15 |
| vgpu msdf baked 24px | 7.4 | 11.5 | **3.97** |
| vgpu msdf 2x（40px 光栅） | 7.0 | 11.7 | 4.01 |

### 结论

- **同一引擎内自比才有效**：Godot 的 MSDF 比它自己的栅格化更实（4.70 vs 4.18，+12.4%），而 vgpu 的
  MSDF 比 vgpu 的栅格化更虚（3.97 vs 5.10，−22.1%）。vgpu 的 `sdf` 路径趋势与 Godot 一致，所以差距
  落在 MSDF 这条线。
- 差距**不是**光栅尺寸（2 倍光栅只补回 6%），也**不是**编码器的距离偏差（对解析正方形逐 texel 校验，
  边缘 0..1 texel 区域偏差 −0.014 texel）。仍未定位的候选：曲线折线化（`CURVE_STEPS = 8`）的弦误差、
  自研误差修正的形式、atlas 的 uv 用小数 `inkWidth` 而纹素块用 rounding。
- 参照公式同时修掉了一个真实缺陷：Godot 用 `0.5 * dot(px_range / msdf_size, dest_size)`，vgpu 原来
  是纯 `dot`，过渡带因此窄一半（`mid` 从 2 提到 5；后来按上表口径复测为 7.4）。

### 产物（裁剪并排图）

两侧**不是同一场景**（Godot 那两行是为参照写的 `.gd`，vgpu 侧是拆分前 gallery 的 `text-hud` 页），所以这两张图
**不是像素对齐**的并排，只作观感参照：每行都对齐到该行第一个墨点所在的列，同样倍率最近邻放大。

- `artifacts/visual-baseline/compare-text-full.png`（整段 `Handgloves 0123`，4×）
- `artifacts/visual-baseline/compare-text-detail.png`（前几个字形，8×，看边缘过渡）

复现：

```bash
# Godot 侧
godot --path /tmp/vgpu-text-parity --display-driver x11 --audio-driver Dummy \
  --script "$PWD/scripts/capture-godot-text.gd" -- \
  ~/src/bevy@bevyengine/assets/fonts/FiraMono-Medium.ttf /tmp/godot-text.png 20
# vgpu 侧：关掉无限网格，否则它的亮线压在文字上
# text-hud 已拆成六个页面；重跑需改用 text-encodings 并相应调整裁剪行数
VGPU_COMPARE=0 VGPU_QUERY=grid=0 bun scripts/capture-vgpu.ts text-encodings
# 然后逐行裁剪（每行高 26 px、宽 182 px）、同倍率放大、左侧标注来源
```

图上能直接看出的（与上表的数字一致）：Godot 的 MSDF 笔画比 vgpu 的粗，vgpu 的 `bitmap` 笔画最粗最实、
`sdf 4x` 边缘最软、`msdf` 两行最接近几何真值。

## 字形准确度的口径闭环（几何真值）

「我们的渲染比真值多/少多少墨」这个问题在这个仓库里被答错过三次，全部出在**测量口径**上：

- **在 gallery 截图里量墨**：infinite grid 的亮线压在文字上；而且不同捕获之间的页面布局会随
  浏览器的字体加载变化（实测整体偏移 24–29 px），固定坐标会采到行间。
- **用来比较的基线图是带网格的**（`VGPU_COMPARE=0` 抓的），与纯字形的几何真值不可比。
- **采样窗口比字形盒还窄**（±8 行 vs 20 px 字高），会切掉上下边缘。

正确口径是 `scripts/measure-glyph-accuracy.ts`：在离屏 GPU target 上渲染（无场景），几何真值由
opentype 轮廓 16×16/像素超采样得到；「覆盖率 ↔ 8bit 通道值」的映射用已知 alpha 的实心矩形标定
（实测线性，误差 ≤ 0.5/255，不假设）。墨量是平移不变量，所以不需要对齐布局。

`"Handgloves 0123"` @20px，几何真值 809.0 px：

| 源 | 光栅 | mip chain | 关 mip |
| --- | --- | --- | --- |
| msdf 1x | 20px | −3.2% | −3.2% |
| msdf 2x | 40px | −2.6% | −1.5% |
| msdf 4x | 80px | −0.1% | −1.1% |
| msdf baked | 24px | −3.3% | −3.5% |

这一口径直接找出两个真缺陷（以下都是修复前的读数）：

- **mip chain 用距离域平均**：`msdf 2x` 一度是 **−10.1%**。改成覆盖率域下采样
  （`downsampleDistancePage`）+ shader 按级缩放解码范围后为 **−2.6%**。两者必须配对：单独用
  任一个都更差（工作 A 当时就是因为只换一个、又用了错口径而回滚）。
- **烘焙切片宽度用 `round` 而 atlas UV 用精确 `inkWidth`**：`msdf baked` 一度是 **−8.7%**，
  UV 会读到切片没写的列，把字形边缘向内拉。改成 `ceil` 后为 **−3.3%**，与同光栅的运行时编码
  （24px → −3.4%）一致。

光栅尺寸本身也有持续但很小的收益（80px 光栅可到 −0.1%），代价是 atlas 面积的四倍，属于取舍而非缺陷。

## 第十轮：平面图元的逐顶点法向 + index/world_space_width 的列基向量

第九轮收尾时判断“平面图元的 `_n` 列淡出恒为 1.0、不影响像素”是**错的**：参考的
`draw_circle_n` / `draw_arc_n` / `draw_rect_n` / `draw_box_n` 传的是逐顶点（或逐边）法向，
圆环背面的径向法向与视线夹角可达 180°，淡出确实生效。本轮补齐，并顺带查出一个真正的几何 bug。

改动：

- `geometry-generators.ts` 新增三个参考法向 helper：`arcNormals`（每段中点径向）、`rectNormals`
  （按 `_get_rect_points` 顺序的四个角法向 `-basis.y / basis.x / basis.y / -basis.x`）、
  `boxEdgeNormals`（从边本身推导：一条边沿一个基轴，其法向是另外两个面法向之和，与参考的
  `_get_box_line_normals` 列表等价，但不依赖 `_get_box_line_points` 的顶点顺序）。
- `circle` / `arc` / `rect` / `box` 四个场景的 `*_n` 列改用逐顶点法向；`sphere`/`cone`/
  `cylinder`/`capsule` 与 index 矩阵的同名列一并覆盖。
- **`index` / `world_space_width` 的 rect/circle/arc 列基向量修正**：`index.gd` 这三列传的是
  `Quaternion.IDENTITY`，即圆/弧/矩形在 **XY 平面**（竖直）；vgpu 一直用平放的 XZ 基（那是
  `circle.gd`/`arc.gd`/`rect.gd` 自己的 `_get_flat_rotation`）。实测证据：同一列青色圆的
  饱和 bbox，Godot 98×112（近正圆）vs 旧 vgpu 88×57（压扁），弧 97×141 vs 82×90。
  现在按参考改用 `IDENTITY_BASIS`（实心扇面也随之转到该平面），bbox 与 Godot 一致。

### 验收（与 Godot 逐像素，MAE / ≤3 像素 / 饱和像素比）

| 场景 | MAE（第九轮 → 本轮） | ≤3 像素 | 饱和像素 / Godot |
| --- | --- | --- | --- |
| index | 0.23 → **0.05** | 99.9% | 111.1% → **103.0%** |
| rect | 0.08 → **0.03** | 100.0% | 102.6% → **99.9%** |
| circle | 0.08 → **0.03** | 99.9% | 102.5% → **99.7%** |
| arc | 0.08 → **0.03** | 100.0% | 104.0% → **99.4%** |
| box | 0.08 → **0.06** | 99.9% | 102.4% → **100.1%** |
| world_space_width | 0.21 → **0.16** | 99.6% | 105.6% → 86.4%（见下） |
| arrow | 0.13 → **0.07** | 99.9% | 100.6% → **98.8%** |

箭头头部也一并修了与参考的差异（同一轮）：

- 参考 `_emit_arrow_with_normal` 只用调用者传的 `normal` 选**切平面**
  （`_get_projected_perpendicular_unit`），头部每条线段的法向来自
  `_get_arrow_surface_normal(direction, ±radial, head_length, head_radius)`；vgpu 之前把调用者的
  法向直接当线段法向，于是 `arrow_n` / `arrow_n(joint)` 的淡出方向与参考不同。
- `draw_arrow_line` / `draw_arrow_line_n` 的箭杆都是 `_emit_line`（**不带法向**、不参与淡出），
  vgpu 之前把调用者法向一并传给了箭杆。
- 现在 arrow 场景 96 条头部线段各自带锥面法向、筒杆无法向（`tests/reference-scenes.test.ts`
  锁定这个形状），MAE 0.13 → **0.07**。

其余场景不变（line 0.02、axes 0.02、grid 0.03、curve 0.04、arrow 0.13、sphere 0.07、
cone 0.04、cylinder 0.05、capsule 0.02）。`index` 的 >40 差异像素从 3351 降到 **655**，
主要残差此后是 AA 与 3D 标签。`world_space_width` 仍是 world 宽度细线场景，饱和比对覆盖/AA
敏感，不宜按该比值下结论。

### 基线

本轮渲染变化的场景共 **10** 个，已连同对应 Godot 参考图一起重拍：`line`、`arrow`、`axes`、
`rect`、`box`、`circle`、`arc`、`curve`、`index`、`world_space_width`（前七个是第九轮
normal-aware 淡出后就已过期、当时只回写了六个场景，本轮一并补上）。`grid`/`sphere`/`cone`/
`cylinder`/`capsule` 与提交基线逐像素一致，未动。全部 15 张基线已校对与当前渲染完全一致。

## 第九轮：normal-aware 线与接头的逐顶点法向

`*_n` 族不是「同一条线换个参数」：参考的 `debug_normal_line_3d.gdshader` 与
`debug_normal_line_joint_3d_common.gdshaderinc` 用**逐顶点 surface normal** 做背面淡出。
`normal_fade` 在法向偏离视线超过 `back_fade_start = 100°` 后把颜色乘子从 1.0 降到 0.2
（过渡 `back_fade_transition = 20°`）；线与接头都不改几何，只乘 `line_color.rgb`。

此前 vgpu 的 `LineCommand.normal` 虽然在 instance 里占了一个属性，但 WGSL 从未读取它；
`JointCommand` 根本没有法向。所以第八轮之后六个形状/矩阵场景的残差几乎全部落在
`sphere_n`、`sphere_n(joint)`、`sphere_n_d`、`sphere_n_d(joint)` 与 index/world_space_width
的同名列上。

本轮改动：

- `FrameRecorder`：`LineOptions.normals`（逐顶点法向；`lineStrip` 按**段起点**法向发射，与
  `_emit_normal_line_strip` / `_emit_normal_line_loop` 一致，闭合环要每顶点一个、开放 strip
  每段一个）；`JointCommand.previousNormal` / `nextNormal`（对应
  `_emit_normal_joint(previous, center, next, previous_normal, next_normal, ...)`）。
- `GpuDebugDraw3D.prepare()` 新增 `view`（world→view 矩阵）。线与接头管线在顶点阶段按
  `normal_fade` 乘算颜色；接头按 `round_normal_t` / `bevel_normal_t` / `miter_normal_t` 在
  楔形内插值两个法向（`normalize(mix(previous, next, t))`），与参考逐行对齐。
- 四个形状场景的 `*_n` 四列改用参考法向 helper：`sphereRingNormals`（球心到段中点）、
  `capsuleOutlineNormals`（段中点在胶囊轴上的投影）、`circleNormals`（环基向量的半段中点）、
  `coneSideLineNormals` / `cylinderSideLineNormals`。
- 零法向按 Godot 的 `_resolve_normal` 回退到 `+Z`，`safe_normalize3` 在法向为零时返回零向量
  而不是 NaN（Godot `Vector3.normalized()` 同语义），避免镜头位于几何原点时出现 NaN 颜色。

### 验收（同样的 1920×1080 截图流程，Godot 参考重新生成、vgpu 用全新 Vite 实例）

| 场景 | MAE（第八轮 → 本轮） | ≤3 像素 | 饱和像素 / Godot |
| --- | --- | --- | --- |
| capsule | 0.03 → **0.02** | 100.0% | 100.6% → **100.0%** |
| sphere | 0.10 → **0.07** | 99.8% | 101.1% → **99.9%** |
| cone | 0.04 → 0.04 | 99.9% | 100.1% → **99.9%** |
| cylinder | 0.10 → **0.05** | 99.9% | 101.0% → **99.9%** |
| index | 0.27 → **0.23** | 99.8% | 111.1% → **102.5%** |
| world_space_width | 0.23 → **0.21** | 99.6% | 105.6% → 87.9%（见下） |

未受影响的场景本轮一并重测，确认无回归：line 0.02、axes 0.02、grid 0.03、curve 0.04、
rect 0.08、box 0.08、circle 0.08、arc 0.08、arrow 0.13（≤3 像素均 ≥99.8%）。

`world_space_width` 的饱和像素比不能按第八轮的口径直接比较：该场景全部是 world 宽度下的
**细线**，是否达到「饱和」阈值取决于单像素覆盖与 AA（Godot MSAA vs vgpu 无 AA），
线条覆盖变化时该比值会灵敏地越过阈值。本轮 MAE 与 ≤3 像素都优于第八轮，仍不声称饱和
像素等价。

### 仍未对齐

- 平面图元（`line`/`ray`/`arrow`/`axes`/`curve`/`grid`）的 `_n` 列仍传单一法向。这些列的
  参考调用本身只传一个法向（`draw_line_n` / `NORMAL_VALUES[row]` 等），所以已经一致；
  `circle`/`arc`/`rect`/`box` 的逐顶点法向已在第十轮补齐。
- world-space 宽度的侧向近似（第五轮 P0）与 AA、3D 标签仍与之前记录相同。

## 第八轮：sphere / capsule / cone / cylinder 线框拓扑移植

上一轮遗留的 `sphere(y axis)` / `sphere(z axis)`、`cone`/`cylinder` 的 base/side 分段不是
「近似」而是**错误**：参考的 `draw_sphere` 根本不由球面网格生成线框，而是
`_emit_sphere_axis_rings` 发射的 `y_axis_segment_count` 条纬线环（`radius * (-1 + 2i/n)`、
环半径 `sqrt(r^2 - offset^2)`）加 `z_axis_segment_count` 条经线大圆（半径恒为 `radius`、
绕轴步长 `PI/z`、按 ring key 去重）；`draw_capsule` 由 `_emit_capsule` 发射上下两个圆环
加 `side_segment_count` 条侧面闭合轮廓；`cone`/`cylinder` 由 base 圆环加 `side_segment_count`
条侧线（`draw_line_list`）。此前 vgpu 把 `y`/`z` 硬套成 UV 球的 `rings`/`segments`，
capsule 直接拼 `cylinder + 2 个完整球`，会画出参考里不存在的大量球面纬线。

本轮改动：

- `src/geometry-generators.ts` 新增 `sphereWire`、`capsuleWire`、`coneWire`、`cylinderWire`、
  `circlePoints`、`coneBaseBasis`。返回 `ShapeWire`（`loops` = 参考的 `draw_line_loop`，
  `lines` = 参考的 `draw_line_list`），并逐行移植 ring key 去重、`_get_cone_base_rotation`、
  `_get_capsule_side_outline_points`（`arc = ceil(segments / 2)`）、segment/axis 下限与
  `radius <= 0` / `height <= 0` / `half_height <= 0` 的早退规则。
- 场景层改为 `recorder.lineStrip(loop, options, true)` + `recorder.line(a, b, options)`，
  所以每个环是真正的闭合路径：接头（joint）与跨环累计的 dash 相位与参考一致，不再逐边重启 dash。
- `side_segment_count` 真正独立：`cone(side segments)` / `cylinder(side segments)` 保持 base 分段
  16 并只变化侧线数量；`capsule(side segments)` 只变化轮廓数量。
- `*_s` 实心列改用参考的网格分辨率（`SphereMesh` 64×32、`CylinderMesh` 64 radial segments），
  此前是 32×2 的退化球。

### 验收（1920×1080、`SCREENSHOT_DEMO_CONFIG` 相机、与 Godot 截图逐像素比对）

```bash
# Godot 参考（独立副本，未修改上游）
godot --path /tmp/vgpu-parity-godot --display-driver x11 --audio-driver Dummy \
  --resolution 1920x1080 --script capture.gd -- sphere /tmp/vgpu-shape-ref/godot-sphere.png
# vgpu（全新 Vite 实例 + CDP 截图，输出到 /tmp，不覆盖 artifacts 基线）
VGPU_URL=http://127.0.0.1:5177 bun /tmp/capture-vgpu-shapes.ts sphere capsule cone cylinder index world_space_width
```

| 场景 | 全图 MAE（第五轮 → 本轮） | ≤3 像素（第五轮 → 本轮） | 饱和像素 / Godot（第五轮 → 本轮） |
| --- | --- | --- | --- |
| capsule | 0.26 → **0.03** | 99.7% → **99.9%** | 103.0% → **100.6%** |
| cone | 0.10 → **0.04** | 99.8% → **99.9%** | 101.2% → **100.1%** |
| cylinder | 0.19 → **0.10** | 99.7% → **99.8%** | 103.3% → **101.0%** |
| sphere | 0.49 → **0.10** | 99.4% → **99.8%** | 96.8% → **101.1%** |
| index | 0.65 → **0.27** | 99.5% → **99.7%** | 124.4% → **111.1%** |
| world_space_width | 0.48 → **0.23** | 99.4% → **99.6%** | 172.2% → **105.6%** |

六个场景的饱和像素 bbox 与参考逐列吻合（`x` 起止完全一致），人工并排比对（Godot 上 / vgpu 下）
确认 `sphere(y axis)`、`sphere(z axis)`、`capsule(side segments)`、`cone(side segments)`、
`cylinder(side segments)` 与 `*_s` 列的形状逐列对应。

### 单测

- `tests/geometry-generators.test.ts`：环/侧线数量、半径与高度公式、ring key 去重、
  `segments < 3` / `y < 2` / `z < 1` / `radius <= 0` / `height <= 0` / `half_height <= 0` 的早退。
- `tests/reference-scenes.test.ts`：按参考参数表锁定 `sphere` / `capsule` / `cone` / `cylinder`
  场景逐列的命令条数（例如 `sphere(y axis)` = 672 + 旋转首行 144 = 816 条，
  `capsule(side segments)` = 766 条，`capsule` 场景三角形 0 条）。

### 仍未对齐

- `*_n` / `*_n(joint)` / `*_n_d` / `*_n_d(joint)` 列仍是单一代表法向（见上表 P1）。
  逐顶点法向需要 `LineCommand` / `JointCommand` 携带法向，并且 normal-aware 接头
  （`debug_normal_line_joint_*`）尚未移植，本轮未改动该契约。
- AA（Godot MSAA vs 无 AA）、3D 标签、world-space 侧向近似仍与第五轮记录相同。

## 第三轮：infinite grid 忠实移植（已完成）

`InfiniteGrid3D` 已按 `~/src/godot-infinite-grid@hardpixel/addons/infinite_grid/`
重写（`Godot InfiniteGrid3D` 与 `godot-debug-draw` 的 `EndlessGrid3D` 是同一份代码）。
移植内容包括：十进制 LOD 三层叠加与去重 alpha、`lod_finer_levels` / `lod_total_levels`
范围、屏幕空间线宽、edge / grazing / far-clip / per-LOD center 四类淡出、低 alpha stipple
discard、thin/thick 颜色与 debug LOD 配色，以及 `_update_camera_lod_distance()` 的相机
LOD 距离规则（透视用视地面距离并向相机高度混合，正交用 `size`，焦点取射线与地面交点）。

### 验证

| 项 | 结果 |
| --- | --- |
| Godot 参考截图 | `/tmp/godot-grid-ref.png`，独立副本 `/tmp/vgpu-grid-parity`，引用 `~/src` 的 addon，未修改上游仓库 |
| 相机/投影/分辨率 | eye=(8,16,21.5) look_at 原点，vertical FOV=75°，near=0.05，far=100，1920×1080，DPR=1 |
| 清屏色 | Godot `default_clear_color` 与 vgpu 背景都取参考项目的 `0.11764706` |
| 线条位置 | 同一扫描线上 **26 条峰值线一一对应**；vgpu 线条遮罩是 Godot 的**严格子集**（`onlyVgpu = 0`），无额外或错位线条 |
| LOD 结构 | 两边首个亮像素行 218 / 231，远景 LOD 截止一致 |
| 单测 | `tests/grid.test.ts` 锁定参考参数默认值、clamp、LOD 范围、相机距离公式与正交分支 |
| GPU 测试 | `tests/grid.gpu.test.ts` 验证中性灰、debug 三层分色、线性宽覆盖、center fade 覆盖、edge fade 半径 |

### 色彩空间：已修复（第四轮）

原先记录为「无法修正」的色彩空间差异**已解决**，且原判断有两处错误：

1. 不是只能在画布层修正。Chromium 拒绝的是 **canvas swapchain** 的 `-srgb` 格式；离屏 `target` 不受限制。
2. 不只是 grid 受影响。所有图元的颜色都偏，只是因为之前没有可对照的期望值而未被发现。

现在的管线与 Godot 的 `blend_mix` + sRGB 输出、以及 bevy 的 `Rgba16Float` 中间目标 + `add_srgb_suffix` 一致：

```
图元颜色按作者值直通  ->  rgba16float 线性 target（线性混合）  ->  present pass 编码 sRGB  ->  canvas
```

关键点是**哪些颜色需要 sRGB 解码**，两者语义不同：

| 颜色来源 | 参考声明 | 是否解码 | 理由 |
| --- | --- | --- | --- |
| 图元颜色（line/circle/rect/solid） | Godot `COLOR`，**无** `source_color` | 否 | `ALBEDO = COLOR.rgb` 数值直通，作者值就是线性值 |
| grid 颜色 | `uniform vec4 thin_line_color : source_color` | 是 | `source_color` 让 Godot 先做 sRGB→linear |
| 清屏色 | `default_clear_color` 项目设置 | 是 | 引擎在 clear 前转换 |

早期实现曾把图元颜色也解码，导致 solid 圆盘偏暗（`(48,117,180)` vs Godot `(97,149,180)`）；去掉后精确命中。另外 grid 的参考场景 `.tscn` 会覆盖两个颜色（`thin=(0.33847,0.50196)`、`thick=(0.46035,0.70196)`），与 addon 默认值不同，对比预设已改用场景覆盖值。

**验收**（`artifacts/visual-baseline/`，与 Godot 截图逐像素比对）：

| 场景 | 全图 MAE | 近像素级(≤3) | 显著差异(>40) |
| --- | --- | --- | --- |
| circle | 1.52 → **0.10** | 82.4% → **99.9%** | 0.64% → **0.09%** |
| line | 1.41 → **0.04** | 82.6% → **100.0%** | 0.49% → **0.03%** |

grid 峰值亮度 143 → **100**，与 Godot 的 100 一致；不透明图元颜色（LIME/VIOLET/PINK/GOLD 等）从「命中 0 像素」变为与 Godot 命中数相当。

回归测试：`tests/color-space.gpu.test.ts` 锁定 line alpha 列四个 alpha 的实测像素与 solid 半透明颜色，容差 ±2。


## 第二轮：忠实移植 Circle / Line 后

已按原始源码还原 Circle/Line 坐标、颜色、宽度、旋转 tunnel 与样例顺序。以下使用 `max(R,G,B)-min(R,G,B)>50` 且 `max(R,G,B)>100` 的遮罩；它排除多数灰色网格，也排除白线和低饱和区域，不是完整 primitive 覆盖测试。

| 场景 | Godot 遮罩像素 / bbox | vgpu 遮罩像素 / bbox |
| --- | --- | --- |
| Circle | 6767 / (714,445)-(1248,620) | 5853 / (716,445)-(1248,620) |
| Line | 4245 / (714,493)-(1043,570) | 3786 / (716,494)-(1043,569) |

遮罩包围盒接近，结合坐标单测证明布局跨度显著改善；不证明内部几何、线宽或像素等价。遮罩像素数仍少约 13.5%/10.8%，具体来源尚未隔离，不能全部归因于 AA。修复前图保存在 `artifacts/visual-baseline/before-circle-line/`。

此外修复 round 封口实际上为方形和忽略 dash 相位的问题：圆形 fragment 剔除角落，gap 内顶点不再生成封口。仍是圆盘补丁，不是 Godot 完整 joint/normal 接头实现。新增 GPU 测试逐像素验证虚线细分后覆盖不变、gap 内无封口、圆点角落无覆盖。

重生成截图：

```bash
# Godot 参考（独立副本，真实 Vulkan）
godot --path /tmp/vgpu-parity-godot --display-driver x11 --audio-driver Dummy \
  --resolution 1920x1080 --script /tmp/vgpu-parity-godot/capture.gd -- \
  circle "$PWD/artifacts/visual-baseline/godot-circle.png"

# vgpu（需要 GPU 显示服务器 + Vite dev server）
bun scripts/capture-vgpu.ts circle line
```

## 已修复（相对第一轮）

| 项 | 修正 |
| --- | --- |
| 布局跨度/行序 | 忠实用 `column*2.0(+0.5)` 与负 Z 行距，不再压缩 |
| Circle dash 空档 | `lineStrip` 现在跨段累计弧长，闭合圆出现真实间断 |
| Circle 旋转列 | 真实移植 `_get_rotation_tunnel_rotation` / `_get_circle_rotation` 的 basis，圆会倾斜并竖起 |
| normal 样例含义 | Circle 的 `_n` 列改为 `base/alpha/color/wide` 的颜色/宽度变化，法向固定为 UP |
| solid 颜色 | solid 圆改为参考的蓝色半透明 `(0.25,0.65,1,0.45)` |
| 原点坐标轴 | circle/line 的轴跟随参考根节点平移，位置与 Godot 一致 |
| 回归测试 | 新增 `tests/reference-scenes.test.ts` 锁定坐标、dash 累计、法向与 solid 颜色 |

## 仍未达到 parity

### 已修复（第五轮：全场景布局对齐）

全部 15 个场景已从压缩的 `slot()` 布局**重写回参考布局**：

- 列距 `2.0`（`axes` 为 `2.2`）、列偏移 `+0.5`、行起点 `-0.45`、行方向 `sampleStartZ - row * spacing`（**-Z**），与参考逐场景的 `SAMPLE_SPACING`（及 radius/size/angle/height 列的覆盖值）一致。
- 列结构逐项对齐参考的 `_get_column_count`。修正的清单：`box` 6→**7** 列（补 `box_n_d(dash)`）、`arrow` 7→**17** 列（补齐 `arrow_line_*` 系列）、`sphere` 7→**14** 列、`capsule` 7→**9** 列（**移除参考中不存在的 `capsule_s`**）。
- `draw_axes` 语义修正为参考的**三条无箭头轴线**（红/绿/蓝纯色），此前被错误实现为带箭头 `arrow`。
- solid 列颜色由固定色改为参考的 `Color.from_hsv(hue, 0.7, 1.0, alpha)` 按行渐变。
- `gridLines` 的 `outer` 与 `skew` 语义修正为与 `_emit_grid_lines` 一致：`outer` 表示**保留**哪些边界线（`none` = 仅内部线，`xz` = 含全部边界），`skew` 使线本身倾斜而不只是偏移。此前两处都是反的。

### 验收（15 个场景，与 Godot 截图逐像素比对）

参考截图由 `capture-godot.gd` 在独立副本中生成（`/tmp/vgpu-parity-godot`，未修改上游），vgpu 侧由 `scripts/capture-vgpu.ts` 生成。

| 场景 | 全图 MAE | ≤3 像素占比 | 饱和像素比 |
| --- | --- | --- | --- |
| line | 0.03 | 100.0% | 97.2% |
| axes | 0.02 | 100.0% | 99.5% |
| grid | 0.03 | 100.0% | 99.5% |
| rect | 0.09 | 99.9% | 100.9% |
| curve | 0.08 | 99.9% | 86.1% |
| circle | 0.10 | 99.9% | 100.9% |
| box | 0.08 | 99.9% | 102.4% |
| arc | 0.11 | 99.9% | 105.8% |
| arrow | 0.14 | 99.8% | 98.9% |
| cone | 0.10 | 99.8% | 101.2% |
| cylinder | 0.19 | 99.7% | 103.3% |
| capsule | 0.26 | 99.7% | 103.0% |
| sphere | 0.49 | 99.4% | 96.8% |
| index | 0.65 | 99.5% | 124.4% |
| world_space_width | 0.48 | 99.4% | 172.2% |
| **平均** | **0.19** | **99.8%** | 106.1% |

所有场景的饱和像素 bbox 与参考在 x 轴上逐列吻合（15 个列簇位置全部一致）。

### 已知残差（未解决，不声称等价）

| 优先级 | 问题 | 说明 |
| --- | --- | --- |
| P0 | world-space 线宽侧向近似 | 参考用 3D 视角侧向 `cross(view_b - view_a, -view_position)`；vgpu 用屏幕空间近似，导致 `world_space_width` 饱和像素偏多（172%）。接头宽度的数值换算已与参考一致，侧向方向仍是同一近似 |
| P1 | `curve` 采样与 tolerance | 参考用 `tessellate_even_length`，vgpu 用固定 `ceil(0.5/tol)` 细分，顶点数不同（形状一致），饱和像素少 14% |
| ~~P1~~ | ~~`sphere(y axis)` / `sphere(z axis)` 列~~ | **已修复（第八轮）**：改为参考的纬线环 + 经线大圆拓扑 |
| ~~P1~~ | ~~`cone`/`cylinder` 的 base/side 分段~~ | **已修复（第八轮）**：两个参数已独立，side 线数量由 `side_segment_count` 控制 |
| ~~P1~~ | ~~`_n` 列法向~~ | **已修复（第九、十轮）**：逐顶点法向 + 接头法向插值；平面图元的逐顶点法向与 `index`/`world_space_width` 的取景基向量均在第十轮补齐 |
| P1 | 3D 列/行标签未对齐 | 参考的标签是示例场景自带的 `Label3D` 节点，不是 addon 能力；vgpu 已实现文字渲染（README 的 Text 节）与 `text-compare` 及六个屏幕空间文字页，但没有逐列对齐参考标签的字号/像素尺寸/朝向 |
| P1 | AA 不同 | 未统一 MSAA/边缘模式 |
| P2 | `demo.gd` 未纳入 | 清单 15 个场景，源目录有 16 个（含 `demo.gd`） |
| P2 | grid 渲染语义 | 布局（列 x / 行 z）已精确；但线段走库 `recorder.grid`，与参考 `_emit_grid_lines` 的 skew/outer 在几何上已对齐，rotation 的 basis 组合方式仍为欧拉角近似 |

## 第六轮：round/bevel/miter 接头忠实移植

原先的接头是「线段 + 顶点圆盘」补丁：`round` 在每个路径顶点补一个屏幕空间圆盘，`bevel`/`miter`
完全没有几何，角落只会留下缺角。移植后与参考的 `debug_joint_renderer_3d.gd` +
`debug_line_joint_{round,bevel,miter}_3d.gdshader` 对齐：

- 每个被连接的路径顶点生成一条 joint 命令（`previous`/`center`/`next` + 颜色/宽度/宽度模式/dash/图层）。
  strip 只连接内部顶点，loop 额外连接两个环接顶点（含接缝），与 `_emit_line_strip` /
  `_emit_line_loop` 一致；`previous == center` 或 `center == next` 的退化顶点跳过。
- GPU 侧用一个 24 顶点的共享扇网格配合 `@builtin(vertex_index)` 重建楔形：`round_offset`、
  `bevel_offset`、`miter_offset` 逐行移植，包含 `sigma` 镜像、`limit_vector` 的 `miter_limit`、
  `round_resolution = 8`、近平面裁剪与 `depth_bias`。越界顶点停在远平面外，因此一套管线即可画出
  三种接头。渲染顺序为线段（优先级 0）之后、实体之前（优先级 1）。
- dash 相位与线段共用同一累计弧长：`joint.dash[2] = dash 偏移 + 顶点累计弧长`，片元按相位丢弃，
  空档内的接头不再残留孤立圆点。
- 线宽倍率（gallery 面板的 `lineWidthScale`）现在同时作用于线段与接头。此前只缩放 `line` 命令，
  缩小时接头保持原尺寸，拐角因此出现比线宽大得多的圆形凸点。

### 验证

| 项 | 结果 |
| --- | --- |
| 命令规则单测 | `tests/line-joint.test.ts`：strip/loop 的连接顶点集合、退化顶点跳过、dash 相位、样式继承与图层过滤 |
| GPU 形状测试 | `tests/line-joint.gpu.test.ts`：90° 外角上 round 独有的弧内点、bevel 独有区域、miter 独有尖点区域，以及 dash 空档内顶点区域的零覆盖 |
| 基线截图对比 | 1920×1080、`SCREENSHOT_DEMO_CONFIG` 相机，对比 `artifacts/visual-baseline/godot-line.png`：MAE 0.03 → **0.026**，≤3 像素 99.97%，>40 像素 0.016%，饱和掩码 bbox 逐像素一致 |
| 饱和像素覆盖 | Line 场景饱和像素 **3786 → 4251**，为 Godot 的 **100.1%**（第五轮为 89.2%）；此前缺失的覆盖主要来自 bevel/miter 没有几何 |
| 原版实机视角对比 | `eye=(3,3,3)`、FOV 75°、两边同一 `scene.position = (-10, 0, 1.5)` 平移（Godot 侧用 `/tmp/vgpu-parity-godot/capture-near.gd`，不改上游）：图元内部像素（两侧都饱和、距边缘 ≥ 2px，6479 px）**MAE 0.04、>40 的像素 0**；橙色 `loop(joint)` 与紫色 `strip_d(joint)` 的饱和 bbox 完全重叠。剩余差异全在边缘 AA（Godot MSAA vs vgpu 无 AA）、grid 与 3D 标签 |
| 回归 | `bun run typecheck`、`bun run build`、`bun test`（16 个文件、111 个测试）全部通过 |

以上截图都输出到 `/tmp/vgpu-joint-check` 与 `/tmp/vgpu-near`，未修改 `artifacts/visual-baseline/`。

仍未对齐：normal-aware 接头（`debug_normal_line_joint_*` 需要逐顶点法向，`_n(joint)` 列仍走普通接头）、
`round_joint_resolution` / `miter_limit` 的可配置性（目前固定为参考默认值），以及 world-space 宽度的
侧向近似。

## 第七轮：曲线控制点标记

参考 `curve.gd` 的 construction 区（`straight` / `smooth` / `flat handles` / `broken` /
`one-sided` / `y curve` / `closed`）在每条曲线旁还会画出 Bezier 控制点标记，此前 vgpu 完全省略：

- `_draw_curve_control_points`：每个锚点一个品红圈（半径 0.045、宽 2、16 段、ROUND）。
- `_draw_curve_control_handle`：每个非零 `in`/`out` 手柄一条黄色线（宽 1、alpha 0.85）加上手柄尖端的
  黄色圈（半径 0.032、宽 2、16 段）；`is_zero_approx` 的手柄跳过。
- 标记朝向来自 `_get_curve_marker_rotation`：它交换 basis 的 Y/Z 两列，把圆的局部 XY 平面转到世界
  XZ 平面，所以标记是水平环，而不是立在曲线自身平面里。

7 条 construction 曲线合计 21 个锚点、24 个非零手柄。

### 验证

| 项 | 结果 |
| --- | --- |
| 单测 | `tests/reference-scenes.test.ts`：锚点圈 21×16 段、手柄圈 24×16 段、手柄线 24 条、环的水平朝向与手柄长度 |
| 截图对比 | 用 `capture.gd` 的同一相机对比 `curve` 场景：MAE 0.043，≤3 像素 99.94%，>40 像素 0.032% |
| 饱和像素覆盖 | `curve` 饱和像素达到 Godot 的 **98.8%**（第五轮记录为 86.1%），饱和 bbox 完全一致 |

截图输出到 `/tmp/vgpu-curve-check`，未修改 `artifacts/visual-baseline/`。

## 第一轮：初始观察（使用压缩布局，部分已修复）

| 优先级 | 问题 | 证据 / 原因 |
| --- | --- | --- |
| P0 | Circle / Line 布局跨度缩小、行顺序不一致 | Godot 使用列距 2.0、负 Z 行排列；vgpu `slot()` 将横向跨度压到 10、行距压到 0.62，并反向排列 |
| P0 | Circle dash 空档丢失 | Godot 橙色列有明确间断；vgpu 黄色 dash 列近似连续。`lineStrip` 每段重新开始 dash 距离，未累计弧长 |
| P0 | Circle 旋转列没有真实倾斜 | Godot 金色列使用旋转法向量与 tunnel depth/scale；vgpu 橙色列只绕 Y 旋转平面圆，几何不变 |
| P0 | normal 参数样例含义不一致 | Godot Circle 的 normal 行是 base/alpha/color/wide；vgpu 使用同色/同宽而变化 normal |
| P1 | solid Circle 颜色与透明度错误 | Godot 蓝色半透明 (0.25,0.65,1,0.45)；vgpu 金色不透明 |
| P1 | infinite grid 差异显著 | 已修复：见「第三轮：infinite grid 忠实移植」 |
| P1 | AA 与粗线边缘不同 | vgpu 粗线出现明显锯齿；Godot MSAA 与参考 line/joint shader 尚未对齐 |
| P1 | 3D 列/行标签未对齐 | Godot 样例的标签是场景自带的 `Label3D`；vgpu 现已有自己的文字渲染（README 的 Text 节）与 `text-compare` 及六个屏幕空间文字页，但未逐列对齐参考标签 |

## vgpu 对比模式

```text
http://127.0.0.1:5174/?compare=1&scene=circle
http://127.0.0.1:5174/?compare=1&scene=line
```

非对比模式可以用 `?camera=reference` 把 gallery 切到参考场景自己的 `FreeCamera` 姿态
（`examples/line.tscn`：位置 `(3,3,3)`、`initial_distance = 5.196`、FOV 75°、看向原点），方便直接和
Godot 实机画面逐项比对。这个姿态只走 URL：面板的「视角预设 · camera」放的是三项——`默认 gallery`、
`斜 45°`（+X/+Z 对角上方）与 `正 45°`（+Z 轴上，俯角同为 45°），三者共用 gallery 的距离/FOV/裁剪面，
只改角度。对比模式固定在截图预设，URL 不会覆盖它的相机。

截图前等待 `document.documentElement.dataset.renderReady === "true"`，设置 1920×1080/DPR=1。截图预设来自 `src/demo-config.ts`，不读取本地持久配置；对比模式禁用鼠标修改相机。正交仅作为显式 `&projection=orthographic` 诊断选项，不是默认 Godot 基线。

## 后续修复次序

1. ~~实现 round/bevel/miter 的真实接头几何~~ 已完成（第六轮）；~~sphere/capsule/cone/cylinder 线框拓扑~~ 已完成（第八轮）；~~normal-aware 线与接头的逐顶点法向~~ 已完成（第九轮）；~~平面图元逐顶点法向与 index/wsw 列基向量~~ 已完成（第十轮）。下一步是 AA 与 3D 标签，以及 world-space 宽度的 3D 侧向。
2. 统一 dash 周期与屏幕空间 dash shader，消除剩余覆盖差。
3. ~~单独对齐 infinite grid shader（颜色、距离层级、淡出）。~~ 已完成，含色彩空间（线性 target + sRGB present）。
4. 把 box/实体图元的 width/dash/normal 参数真正传递到 `FrameRecorder`。
5. 增加 3D 列/行标签，补齐 `demo.gd`，再扩展到其他场景。
6. 只有对应样例与像素测试验证完，才提高 implementation status。
