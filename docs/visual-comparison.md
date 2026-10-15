# Godot / vgpu 实时截图对比

## 结论

当前实现是 **partial parity**，不是完整 Godot 移植。真实 GPU 烟雾测试通过只能证明能够渲染，不能证明图元、参数矩阵、布局或像素一致。

## 产物

- [Circle 全图](../artifacts/visual-baseline/compare-circle-full.png)
- [Circle 局部放大](../artifacts/visual-baseline/compare-circle-detail.png)
- [Line 全图](../artifacts/visual-baseline/compare-line-full.png)
- [Line 局部放大](../artifacts/visual-baseline/compare-line-detail.png)
- 原图：`artifacts/visual-baseline/{godot,vgpu}-{circle,line}.png`
- 浏览器对比页：`http://127.0.0.1:5174/artifacts/visual-baseline/index.html`

局部放大使用两边相同的像素裁剪区域 `(650,400)-(1350,680)`，然后统一放大；没有独立移动、缩放或变形来隐藏布局差异。

## 捕获条件

| 项目 | 条件 |
| --- | --- |
| Godot 来源 | `godot-debug-draw@hardpixel`，revision `bc51ddddcdc519164f8261fe2926fda8b3f0c39b` |
| 执行位置 | `/tmp/vgpu-parity-godot`，独立副本；未修改上游仓库 |
| Godot renderer | Godot 4.7.2 / Forward+ / Vulkan / NVIDIA RTX 4070 SUPER |
| 浏览器 | `/usr/bin/chromium`，X11/Vulkan flags，CDP 截图；本轮未记录具体 WebGPU adapter，不宣称与 Godot 是同一 adapter |
| 视口 | 1920×1080，浏览器 DPR=1 |
| 投影 | perspective，vertical FOV=75°，near=0.05，far=100 |
| 相机 | eye=(8,16,21.5)，target=(0,0,0)，up=(0,1,0) |
| 场景 | Godot 根节点平移 (-10,0,1.5)，不缩放任何图元；vgpu 在 Circle/Line 中烘焙同一偏移 |
| 时间 | Godot 每次 `_process(0)`，第 10 帧捕获；vgpu `animate=false`，`time=0` |
| 网格 | 两边保留各自实现，以观察 grid 差异 |
| UI | vgpu 隐藏侧栏/详情；Godot 保留场景原有 Label3D |
| 抗锯齿 | Godot 沿用原项目 MSAA；vgpu 沿用当前管线。尚未统一 |

两边相机/投影/分辨率相同，但场景数据、网格和 AA 不完全一致。因此本轮仍是**结构与视觉诊断**，不报告严格像素误差分数。

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
| P0 | bevel/miter 接头缺失 | 只有 round 是真实圆盘封口，bevel/miter 仍是普通线段 |
| P0 | world-space 线宽侧向近似 | 参考用 3D 视角侧向 `cross(view_b - view_a, -view_position)`；vgpu 用屏幕空间近似，导致 `world_space_width` 饱和像素偏多（172%） |
| P1 | `curve` 采样与 tolerance | 参考用 `tessellate_even_length`，vgpu 用固定 `ceil(0.5/tol)` 细分，顶点数不同（形状一致），饱和像素少 14% |
| P1 | `sphere(y axis)` / `sphere(z axis)` 列 | 参考分别控制纬线环与经线大圆；vgpu 只有 `segments`/`rings` 两个参数，映射为近似 |
| P1 | `cone`/`cylinder` 的 base/side 分段 | 参考是两个独立参数，vgpu 只有一个 `segments` |
| P1 | `_n` 列法向 | 参考用逐顶点 surface normal，vgpu 传单一代表法向 |
| P1 | 缺少 3D 列/行标签 | 参考含 Label3D，vgpu 只有 HTML 参数面板 |
| P1 | AA 不同 | 未统一 MSAA/边缘模式 |
| P2 | `demo.gd` 未纳入 | 清单 15 个场景，源目录有 16 个（含 `demo.gd`） |
| P2 | grid 渲染语义 | 布局（列 x / 行 z）已精确；但线段走库 `recorder.grid`，与参考 `_emit_grid_lines` 的 skew/outer 在几何上已对齐，rotation 的 basis 组合方式仍为欧拉角近似 |

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
| P1 | 缺少 3D 列/行标签 | Godot 样例含 Label3D；vgpu 只有 HTML 参数文本 |

## vgpu 对比模式

```text
http://127.0.0.1:5174/?compare=1&scene=circle
http://127.0.0.1:5174/?compare=1&scene=line
```

截图前等待 `document.documentElement.dataset.renderReady === "true"`，设置 1920×1080/DPR=1。截图预设来自 `src/demo-config.ts`，不读取本地持久配置；对比模式禁用鼠标修改相机。正交仅作为显式 `&projection=orthographic` 诊断选项，不是默认 Godot 基线。

## 后续修复次序

1. 实现 round/bevel/miter 的真实接头几何，统一 alpha 叠加与 AA 条件。
2. 统一 dash 周期与屏幕空间 dash shader，消除剩余 11% 覆盖差。
3. ~~单独对齐 infinite grid shader（颜色、距离层级、淡出）。~~ 已完成，含色彩空间（线性 target + sRGB present）。
4. 把 box/实体图元的 width/dash/normal 参数真正传递到 `FrameRecorder`。
5. 增加 3D 列/行标签，补齐 `demo.gd`，再扩展到其他场景。
6. 只有对应样例与像素测试验证完，才提高 implementation status。
