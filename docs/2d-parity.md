# bevy 2D 对照说明

## 结论

2D 层（`frame.d2` / `GpuDebugDraw2D`）**不是 Godot addon 的移植**：`godot-debug-draw` 没有 2D API。
参照对象是 bevy 的 `2d_gizmos` 与 `2d_shapes` 示例，以及 `Camera2d` 的坐标约定。因此这里没有
"与 Godot 截图逐像素对齐"的目标，对齐的是坐标语义、图元集合与绘制行为。

对照的 bevy 行为取自：

- `Camera2d` → `OrthographicProjection::default_2d()`，`ScalingMode::WindowSize`，
  `viewport_origin` 默认 `(0.5, 0.5)`，`scale` 默认 `1.0`（1 世界单位 = 1 渲染像素）。
- `examples/2d/2d_shapes.rs`：十二个 2D 图元 + `to_ring` 描边行。
- `examples/gizmos/2d_gizmos.rs`：line / ray / grid / linestrip / rect / rounded_rect / circle /
  ellipse / arc / cross / arrow / curve。

## 坐标约定

| `space` | 原点 | +y | 单位 | 受 2D 相机影响 |
| --- | --- | --- | --- | --- |
| `world2d`（默认） | 画布中心 | 向上 | `zoom = 1` 时 1 世界单位 = 1 画布像素 | 是 |
| `screen` | 左上角 | 向下 | 1 画布像素 | 否 |

`world2d` 对应 bevy 的 `Camera2d`，`screen` 对应 bevy 的 UI 空间，也与本项目
`TextSpace "screen"` 一致。bevy 的 `OrthographicProjection::scale` 越大物体越小（除法），
本项目的 `zoom` 越大物体越大（乘法），二者互为倒数：`zoom = 1 / scale`。

`2d_shapes` 里的 `X_EXTENT = 1000` 是 `world2d` 下的像素尺度坐标，不是左上原点坐标；
`2d-shapes` 页沿用这个尺度，由 `view2d` 声明页面范围、引擎据此 fit 出初始 `zoom`。

## 图元对照

| bevy 2D | `frame.d2` | 说明 |
| --- | --- | --- |
| `gizmos.line_2d` / `ray_2d` | `line` / `ray` | 宽度为像素；`widthMode: "world"` 随 zoom 缩放 |
| `linestrip_2d` / `linestrip_gradient_2d` | `lineStrip` / `polyline` | 渐变只支持端点 `color` → `colorEnd` |
| `grid_2d` | `grid` | 无 `outer_edges` 变体 |
| `rect_2d` / `rounded_rect_2d` | `rect` / `roundedRect` | bevy gizmo 默认描边，这里默认填充，`fill: false` 得到描边 |
| `circle_2d` / `ellipse_2d` | `circle` / `ellipse` | |
| `arc_2d` | `arc` + `startAngle` / `sweep` | 未提供 `long/short_arc_2d_between` |
| `cross_2d` | 两条 `line` 组合 | 没有专门的 API |
| `arrow_2d`（含 `with_double_end`、`with_tip_length`） | `line` + `triangle` 组合 | 未提供 builder |
| `curve_gradient_2d` | `lineStrip` + 采样 | 采样在示例场景里完成 |
| `Circle`（`2d_shapes`） | `circle` | 填充或描边 |
| `CircularSector` | `sector` | 从 `+x` 逆时针 |
| `CircularSegment` | `segment` | 弓形，弦与弧之间 |
| `Ellipse` | `ellipse` | SDF 为近似距离 |
| `Annulus` / `Ring` | `annulus` | 填充为环带，描边为两条边界 |
| `Capsule2d` | `capsule` | 直线段沿 y，`length` 为线段长度 |
| `Rhombus` | `rhombus` | 参数为两条完整对角线 |
| `Rectangle` | `rect` | 参数为完整宽高 |
| `RegularPolygon` | `polygon` | 一个顶点在 `+x` |
| `Triangle2d` | `triangle` | 三个绝对顶点，旋转围绕质心 |
| `Segment2d` | `line` | 带厚度的线段 |
| `Polyline2d` | `lineStrip` | |
| `to_ring` / `Ring` | `fill: false` + `strokeWidth` | 任意形状的轮廓 |

## 渲染实现

- 每个 space 一个独立 bucket（`world2d` / `screen`）：一次 draw 只能绑定一个 uniform，而两种空间
  的矩阵不同。两个 bucket 复用同一份线/点/接头 WGSL。
- 线、点、接头**不新增 shader**：`camera-2d.ts` 的矩阵把像素坐标映射到近平面（`z = 0`，
  `w = 1`），现有 shader 本来就在投影之后完成全部屏幕空间几何（像素宽度、dash 相位、接头楔形、
  近平面裁剪）。世界宽度通过 `viewProjection[1][1] * viewportSize.y * 0.5` 自动得到 `width × zoom`。
- 形状：一个 instanced quad + 每实例 SDF 参数，fragment 求有符号距离并用 `fwidth` 做 1 像素
  抗锯齿；描边就是 `abs(d) - strokeWidth / 2`。
- 混绘：2D 在全部 3D 图元之后、text 之前绘制；不写深度并 pin 到近平面，因此是无条件覆盖
  3D 的 overlay。
- 兼容性约束（真实 GPU 测试暴露过）：
  - 设备运行在 WebGPU **compatibility mode**，整型 varying 必须写
    `@interpolate(flat, either)`，默认的 `first` 采样会被拒绝。
  - 顶点属性只有 16 个槽位，因此形状实例把 `rotation + boundingRadius` 合并为 `vec2`，
    `sides` 编码进 `flags` 高 8 位。

## 已验证

| 测试 | 覆盖 |
| --- | --- |
| `tests/camera-2d.test.ts` | 两种空间的矩阵、`world2dToScreen` ↔ `screenToWorld2d` 互逆、零尺寸视口、非法 zoom |
| `tests/frame-recorder-2d.test.ts` | 命令校验与默认值、dash 累计、接头生成、形状参数映射、三角形质心、layer、seal |
| `tests/line2d.gpu.test.ts` | 像素宽度、点定位、zoom、dash、round joint、2D 覆盖 3D |
| `tests/shape2d.gpu.test.ts` | 填充/描边/环/扇区/多边形/三角形/菱形/旋转/椭圆/胶囊/screen 空间/AA |
| `tests/scenes-2d.test.ts` | 两个页面只产生 2D 命令、形状集合覆盖、时间动画、3D 场景不受影响 |
| `tests/scenes.test.ts` | 所有示例（含 2D 页）在真实 GPU 上渲染无错误 |

## 2D 无限网格

2D 网格不是 bevy 的能力，而是同一个 `godot-infinite-grid` addon 的 2D 版本
（`infinite_grid_2d.gdshader` / `infinite_grid_2d.gd`），移植为 `InfiniteGrid2D`。

- 参考用 `ColorRect` + `canvas_item` shader 铺满视口，从 `FRAGCOORD` 反算 `Camera2D` 世界坐标；
  这里同样是 clip-space 全屏 quad，不做任何投影，所以网格永远不会画出边界。
- 与参考一致的部分：`cell_size`、`min_pixels_between_cells`、`line_width_pixels`、
  `lod_finer_levels` / `lod_total_levels`（`min_lod_power = -finer`、`max = min + total - 1`）、
  十进 LOD 三层混合、最细层按 `(1 - fade)` 衰减、粗层覆盖细层的 alpha 去重、
  `debug_lod_colors`、两个 `source_color` 线色（解码到线性空间）。
- 与参考的差异：
  - `world2d` 的 +y 向上，`screen_to_world` 对 y 偏移取反（Godot 2D 是 +y 向下）。
  - 参考的 `camera_rotation` 在本项目固定为 0（2D 相机不带旋转），uniform 仍保留。
  - 颜色与 `cell_size` 等参数与 3D 网格共用侧栏面板：同一个字段对两种网格同时生效。
  - `min_pixels_between_cells` 的库默认沿用参考的 2；gallery 默认 20。2D 页把 bevy 的千像素级
    矩阵压在约 0.7 px/单位下，2 会让最细层每隔 3-7 像素一条线，20 把最细层拉到约 70 像素一格。
- 渲染顺序：网格在 2D 图元之前、3D 图元之后（2D 页没有 3D 内容），不写深度、pin 近平面。
- 验证：`tests/grid2d.gpu.test.ts`（LOD 间距、pan、zoom、opacity、debug 调色板）与
  `tests/grid.test.ts` 的 2D 选项解析测试。

## 已知差异

- `ellipse` 使用 iq 的近似 SDF，长轴端点附近误差在 1 像素以内，不是精确距离场。
- `polygon` 用"最近边中点方向上的边线距离"，顶点外侧会略微内缩（视觉上顶点略钝），与 bevy
  的三角化 mesh 轮廓有亚像素差异。
- `arc` 的 `fill: true` 退化为约 1 像素宽的曲线（弧没有内部）；描边才是它的正常用法。
- `triangle` 的 `rotation` 围绕质心旋转；bevy 的 `Triangle2d` 是绝对顶点，旋转中心由
  `Transform` 决定。
- 没有 bevy 的 `Sprite`、`Mesh2d`、材质、纹理、tilemap、2D 光照等；这一层是 debug 绘制，
  不是完整的 2D 渲染管线。
- bevy 的 `GizmoLineJoint::Round(n)` 分辨率可配置，本项目固定 8（与 3D 参考的
  `round_joint_resolution` 一致）。
- bevy 的虚线有 `Dotted` / `Dashed { gap_scale, line_scale }` 预设和 `animation_offset`；
  这里只有 `dash: [visible, gap, phase]` 三元组。

## 本地验证

```bash
bun test tests/camera-2d.test.ts tests/frame-recorder-2d.test.ts \
  tests/line2d.gpu.test.ts tests/shape2d.gpu.test.ts tests/scenes-2d.test.ts
bun run dev -- --host 127.0.0.1 --port 5174
# gallery: ?scene=2d-gizmos  /  ?scene=2d-shapes
```

2D 页面在 gallery 里是独立的 `2D Graphics` 分组（与 `3D Graphics`、`Text` 并列）。2D 无限网格
是页面固有内容：`2D Graphics` 下的每个页面都会绘制它，不受"显示网格"开关影响（该开关在 2D 页
隐藏），"网格不透明度"仍可把它调弱或调到 0。页面拖拽平移、滚轮缩放；侧栏会隐藏只对 3D 相机
有意义的控件（投影、视角预设、接头），网格面板在 2D 页只显示两种网格共用的字段。
