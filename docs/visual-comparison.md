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

### 已知差异：线性空间混合 vs sRGB 输出

线条**位置**、LOD 分层与覆盖结构一致，但 vgpu 线像素偏暗（Godot 峰值 67 vs vgpu 55 的同一像素，`max` 130 vs 112）。

- Godot 在**线性工作空间**做 `blend_mix`，输出时编码到 sRGB；`thin_line_color = 0.42 a=0.45` 经线性混合再编码得约 122/255，与实测 121 吻合。
- vgpu 画布是 `bgra8unorm`（未编码写入），混合直接在编码空间发生，精确匹配 Godot 需要 `bgra8unorm-srgb`。
- Chromium 拒绝该格式：`Unsupported canvas context format 'bgra8unorm-srgb'`。因此无法在画布层修正，已记录为已知差异，未用 `ALBEDO` 手写 gamma 绕过（那会改变参考颜色语义）。

这是渲染目标的色彩空间差异，不是 grid 算法差异；不声称像素级等价。

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

| 优先级 | 问题 | 说明 |
| --- | --- | --- |
| P0 | bevel/miter 接头缺失 | shader 的 joint 字段仍未生成接头几何，只有 round 是真实圆盘封口 |
| P0 | 部分 dash 密度仍不同 | vgpu 的 dash 周期与 Godot 屏幕空间 dash shader 不完全一致 |
| P1 | 饱和像素遮罩覆盖少约 10–14% | 仍有线宽、normal、接头与边缘差异，来源尚未逐项隔离 |
| P1 | infinite grid 亮度残差 | 参数、LOD、淡出已移植；剩余差异是画布色彩空间（`bgra8unorm` 无法启用 sRGB 编码），见「第三轮」 |
| P1 | AA 不同 | 未统一 MSAA/边缘模式，粗线有锯齿 |
| P1 | 缺少 3D 列/行标签 | 参考含 Label3D；vgpu 目前仅有 HTML 参数面板 |
| P1 | box/实体列未转发 width/dash/normal | `godot-scenes.ts` 中实体列仍是简化实现 |
| P2 | `demo.gd` 未纳入 | 清单目前 15 个场景，源目录有 `demo.gd` |

源码证据（非截图推断）：实体图元的部分参数列没有传递到 `FrameRecorder`，实体 `segments` 列一律生成 sphere。这些仍是简化实现，不能标记为等价。

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
3. ~~单独对齐 infinite grid shader（颜色、距离层级、淡出）。~~ 已完成，残差仅剩画布色彩空间（`bgra8unorm` 无法启用 sRGB 编码）。
4. 把 box/实体图元的 width/dash/normal 参数真正传递到 `FrameRecorder`。
5. 增加 3D 列/行标签，补齐 `demo.gd`，再扩展到其他场景。
6. 只有对应样例与像素测试验证完，才提高 implementation status。
