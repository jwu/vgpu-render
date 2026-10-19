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
每个 `2d-<shape>` 页沿用这个尺度，由 `view2d` 声明页面范围、引擎据此 fit 出初始 `zoom`。

## 图元对照

所有形状都提供三变体：`<shape>`（描边）、`<shape>_s`（填充）、`<shape>_d`（虚线描边）；
`arc` 没有内部，所以只有 `arc` / `arc_d`。方法名决定填充还是描边，`Shape2DOptions` 不再有 `fill`。
线条同样按方法名区分虚实：`line` / `line_d`、`ray` / `ray_d`、`lineStrip` / `lineStrip_d`、
`polyline` / `polyline_d`、`lineLoop` / `lineLoop_d`、`grid` / `grid_d`；`Line2DOptions` 不再有 `dash`。

| bevy 2D | `frame.d2` | 说明 |
| --- | --- | --- |
| `gizmos.line_2d` / `ray_2d` | `line` / `line_d`、`ray` / `ray_d` | 宽度为像素；`widthMode: "world"` 随 zoom 缩放；`_d` 接收 `[visible, gap, phase]` |
| `linestrip_2d` / `linestrip_gradient_2d` | `lineStrip` / `lineStrip_d` / `polyline`、闭合路径用 `lineLoop` / `lineLoop_d` | 渐变只支持端点 `color` → `colorEnd` |
| `grid_2d` | `grid` / `grid_d` | 扩展了 3D grid 的 `rotation` / `skew` / `outer`（x/y 边界），参数与 3D 对齐 |
| `rect_2d` / `rounded_rect_2d` | `rect` / `rect_r` | bevy gizmo 与这里都默认描边；`_s` 得到填充，`_d` 得到虚线 |
| `circle_2d` / `ellipse_2d` | `circle` / `ellipse` | |
| `arc_2d` | `arc` + `startAngle` / `sweep` | 未提供 `long/short_arc_2d_between` |
| `cross_2d` | 两条 `line` 组合 | 没有专门的 API |
| `arrow_2d`（含 `with_double_end`、`with_tip_length`） | `arrow` / `arrow_s` / `arrow_d` / `arrow_s_d` | 默认 line 头，`_s` 填充三角头，`_d` 虚线；未提供 double-end / builder |
| `curve_gradient_2d` | `lineStrip` + 采样 | 采样在示例场景里完成 |
| —（3D `draw_curve` 的 2D 对应） | `curve` / `curve_d` | `Curve2D` cubic 控制点采样，参数集（width / shape / transform / tolerance / closed）与 3D curve 页对齐 |
| `Circle`（`2d_shapes`） | `circle` / `circle_s` / `circle_d` | 描边 / 填充 / 虚线 |
| `CircularSector` | `sector` / `sector_s` / `sector_d` | 从 `+x` 逆时针 |
| `CircularSegment` | `segment` / `segment_s` / `segment_d` | 弓形，弦与弧之间 |
| `Ellipse` | `ellipse` / `ellipse_s` / `ellipse_d` | SDF 与虚线弧长均为数值近似 |
| `Annulus` / `Ring` | `annulus` / `annulus_s` / `annulus_d` | 填充为环带，描边为两条边界 |
| `Capsule2d` | `capsule` / `capsule_s` / `capsule_d` | 直线段沿 y，`length` 为线段长度 |
| `Rhombus` | `rhombus` / `rhombus_s` / `rhombus_d` | 参数为两条完整对角线 |
| `Rectangle` | `rect` / `rect_s` / `rect_d` | 描边 / 填充 / 虚线描边，参数为完整宽高 |
| `RegularPolygon` | `polygon` / `polygon_s` / `polygon_d` | 一个顶点在 `+x` |
| `Triangle2d` | `triangle` / `triangle_s` / `triangle_d` | 三个绝对顶点，旋转围绕质心 |
| `Segment2d` | `line` | 带厚度的线段 |
| `Polyline2d` | `lineStrip` | |
| `to_ring` / `Ring` | `<shape>` + `strokeWidth` | 任意形状的轮廓 |

## 虚线描边（`<shape>_d`）

每个形状的虚线都沿**周长做弧长参数化**：fragment 先取像素到最近轮廓点的周长位置
（从 `+x` 或矩形右上角起逆时针累计），再按 `[visible, gap, phase]` 三元组切段。
因此角上的虚线跨边连续，与 3D `draw_rect_d` 的线段累计距离一致。

- 闭式解：rect、rounded-rect、circle、arc、annulus、capsule、polygon、triangle、rhombus、
  sector、segment 都有解析周长参数。
- 数值解：ellipse 的弧长是第二类椭圆积分，没有初等公式，shader 用 12 点 Simpson 积分近似，
  所以它的虚线间距是近似值而不是精确弧长。
- 端点：`arc` 的周长只在扇形内有效，端点外那半个线宽（描边的外溢）按**较近的端点**取相位，
  而不是一律取末端。否则起点外的残段会沿用末端的 dash 状态，看着像末尾多出一小截。
- `annulus` 描的是两条同心圆，各自按自身周长吸附周期、各自在 `+x` 接缝处闭合（外环逆时针、
  内环顺时针）。两条环不能共用一个周长参数：内环在接缝处会差出非整数个周期，留下孤立小截。

段长单位是 `world2d` 单位，随 zoom 等比缩放；边界用一个画布像素的宽度做软化，
虚线边缘与形状自身的边一样有抗锯齿。`arc` 没有内部，因此不存在 `arc_s`。

每个 shape 页都按 3D 页的列序组织：先用 **normal** 列展示这个图元能做的参数变化
（含 `color` 与 `alpha`），然后是同一轮廓的 `_d` 形态，最后是一列 `_s` 综合样例 ——
每行同时改变尺寸、旋转、颜色和透明度，用来展示填充形态能组合出什么。normal 能做的
变化对 `_d` 与 `_s` 同样成立，所以变体列不重复参数矩阵。

## 页面分类

`2D Graphics` 分组下有十九页，结构对齐 3D 场景：一页索引（`2d-index`），十八页参数矩阵。

| 页面 | 形态 | 内容 |
| --- | --- | --- |
| `2d-index` | 索引网格 | 每个 2D API 一个格子（line / line_d / ray / lineStrip / lineLoop / grid / point / arrow / arrow_s / curve / 12 种 shape 与 `_d` / `_s` 变体），对齐 3D `index` 页 |
| `2d-rect` | 矩阵 | `rect(width)` / `rect(size)` / `rect(rotation)` / `rect(color)` / `rect(alpha)`，然后 `rect_d(dash)` 与综合的 `rect_s(solid)` |
| `2d-rounded-rect` | 矩阵 | `rect_r(radius)` / `(size)` / `(rotation)` / `(color)` / `(alpha)`，然后 `rect_r_d(dash)` 与综合的 `rect_r_s(solid)` |
| `2d-circle` | 矩阵 | `circle(radius)` / `(stroke)` / `(color)` / `(alpha)`，然后 `circle_d(dash)` 与综合的 `circle_s(solid)` |
| `2d-ellipse` | 矩阵 | `ellipse(radii)` / `(rotation)` / `(stroke)` / `(color)` / `(alpha)`，然后 `ellipse_d(dash)` 与综合的 `ellipse_s(solid)` |
| `2d-arc` | 矩阵 | `arc(sweep)` / `(startAngle)` / `(radius)` / `(stroke)` / `(color)` / `(alpha)`，然后 `arc_d(dash)` |
| `2d-annulus` | 矩阵 | `annulus(inner)` / `(outer)` / `(stroke)` / `(color)` / `(alpha)`，然后 `annulus_d(dash)` 与综合的 `annulus_s(solid)` |
| `2d-capsule` | 矩阵 | `capsule(length)` / `(radius)` / `(rotation)` / `(color)` / `(alpha)`，然后 `capsule_d(dash)` 与综合的 `capsule_s(solid)` |
| `2d-polygon` | 矩阵 | `polygon(sides)` / `(circumradius)` / `(rotation)` / `(color)` / `(alpha)`，然后 `polygon_d(dash)` 与综合的 `polygon_s(solid)` |
| `2d-triangle` | 矩阵 | `triangle(vertices)` / `(rotation)` / `(stroke)` / `(color)` / `(alpha)`，然后 `triangle_d(dash)` 与综合的 `triangle_s(solid)` |
| `2d-rhombus` | 矩阵 | `rhombus(diagonals)` / `(rotation)` / `(stroke)` / `(color)` / `(alpha)`，然后 `rhombus_d(dash)` 与综合的 `rhombus_s(solid)` |
| `2d-sector` | 矩阵 | `sector(sweep)` / `(startAngle)` / `(radius)` / `(color)` / `(alpha)`，然后 `sector_d(dash)` 与综合的 `sector_s(solid)` |
| `2d-segment` | 矩阵 | `segment(sweep)` / `(startAngle)` / `(radius)` / `(color)` / `(alpha)`，然后 `segment_d(dash)` 与综合的 `segment_s(solid)` |
| `2d-lines` | 矩阵 | `line(width)`/`(alpha)`/`(grad)`、`line_d(dash)`、`strip`/`strip_d`、`loop`/`loop_d` 的接头与虚线 |
| `2d-curves` | 矩阵 | construction 带（7 种构造 + 控制点：直、平滑、平手柄、断裂、单侧、y 曲线、闭合）与 `curve(width)` / `(shape)` / `(transform)` / `(tolerance)` / `(closed)` / `curve_d(dash)` 列，布局与 3D curve 页对齐 |
| `2d-markers` | 矩阵 | cross、方点 / 圆点、axes 长度 |
| `2d-arrows` | 矩阵 | `arrow` / `arrow_s` / `arrow_d` / `arrow_s_d`：width、head length、head angle、direction、joint 与 dash |
| `2d-spaces` | 矩阵 | `world2d` / `screen` 对照，以及 `widthMode` / `sizeMode` |
| `2d-grid` | 矩阵 | width、cells、spacing、skew、outer、rotation、color 各一列，参数表与 3D grid 对齐 |

矩阵页的列标题与行标签由 `examples/shared/2d-labels.ts` 的 `LABELS_2D` 提供，`examples/registry.ts` 直接读同一张表生成
侧栏列，所以页面和侧栏不会出现对方没有的列。列标题以 API 为主、单行显示 `rect(width)` / `rect_d(dash)` / `rect_s(solid)`，与 3D 页一致。
为了容纳 `polygon(circumradius)` 这类长标题，shape 页的列距取
`250`、列标题字号取 `20`（`LABELS_2D` 的 `spacing` / `titleFont`），字号 22 的默认值留给
其它矩阵页。
行标签与 3D 页面一致：右对齐放在形状**左侧**（`anchor: "center-right"`），形状位于列的右半部，
形状中心固定在行中心。`table2D` 因此暴露 `shapeX(column)` 给场景（形状中心）和内部标签条
（每列左半部），列标题仍居中在形状上方。样本长度单位内的标签文本用 `×` / `/` 压缩，以适配
左侧标签条的宽度。标签是 `world-plane` 文本、`pixelSize: 1`，即一个字体
像素等于一个 `world2d` 单位；`demo-engine.ts` 在 2D 页把传给文本渲染器的 `viewProjection` 换成
`world2dProjection`，标签因此与图元同处一套坐标，随拖拽和缩放一起移动（3D 页仍用 3D 相机投影）。
每一页的 `view2d` 也由同一张表推出，新增列或行不会把内容挤到 fit 范围外。

## 渲染实现

- 每个 space 一个独立 bucket（`world2d` / `screen`）：一次 draw 只能绑定一个 uniform，而两种空间
  的矩阵不同。两个 bucket 复用同一份线/点/接头 WGSL。
- 线、点、接头**不新增 shader**：`camera-2d.ts` 的矩阵把像素坐标映射到近平面（`z = 0`，
  `w = 1`），现有 shader 本来就在投影之后完成全部屏幕空间几何（像素宽度、dash 相位、接头楔形、
  近平面裁剪）。世界宽度通过 `viewProjection[1][1] * viewportSize.y * 0.5` 自动得到 `width × zoom`。
- 形状：一个 instanced quad + 每实例 SDF 参数，fragment 求有符号距离并用 `fwidth` 做 1 像素
  抗锯齿；描边就是 `abs(d) - strokeWidth / 2`。`arc` 的距离是环带与 `startAngle`/`sweep` 扇形
  求 `max`，所以描边只覆盖扫过的弧段，不再整圆。
- 虚线不新增管线：同一份 SDF fragment 多读一个 `dash` 实例属性，按 `perimeter_length()`
  返回的弧长参数 `fract` 切段；`perimeter_length()` 对每种形状各写一条周长参数化函数。
- 混绘：2D 在全部 3D 图元之后、text 之前绘制；不写深度并 pin 到近平面，因此是无条件覆盖
  3D 的 overlay。2D 页的 `world-plane` 标签也走 2D 相机矩阵（`demo-engine.ts`），与图元同一套
  坐标；`screen` 标题仍是固定像素，不受 pan / zoom 影响。
- 兼容性约束（真实 GPU 测试暴露过）：
  - 设备运行在 WebGPU **compatibility mode**，整型 varying 必须写
    `@interpolate(flat, either)`，默认的 `first` 采样会被拒绝。
  - 顶点属性只有 16 个槽位，因此形状实例把 `rotation + boundingRadius` 合并为 `vec2`，
    `sides` 编码进 `flags` 高 8 位；`dash` 占第 15 个槽位（`@location(14)`）。

## 已验证

| 测试 | 覆盖 |
| --- | --- |
| `tests/camera-2d.test.ts` | 两种空间的矩阵、`world2dToScreen` ↔ `screenToWorld2d` 互逆、零尺寸视口、非法 zoom |
| `tests/frame-draw-list-2d.test.ts` | 命令校验与默认值、dash 累计、接头生成、形状参数映射、三角形质心、layer、seal |
| `tests/line2d.gpu.test.ts` | 像素宽度、点定位、zoom、dash、round joint、2D 覆盖 3D |
| `tests/shape2d.gpu.test.ts` | 填充/描边/环/扇区/多边形/三角形/菱形/旋转/椭圆/胶囊/弧裁剪/screen 空间/AA |
| `tests/scenes-2d.test.ts` | 十个页面只产生 2D 命令与标签、矩阵页列/行标签与侧栏一致、标签落在 fit 范围内、`2d-spaces` 两个空间都出现、形状集合覆盖、时间动画、3D 场景不受影响 |
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
  - `displayMode` 与 `dot*`（点阵）是本项目 gallery 扩展，参考 addon 的 2D shader 没有点阵。
    它与 3D `InfiniteGrid3D` 共用同一套选项、默认值与算法（屏幕固定半径、4 倍间距梯子、
    屏幕间距淡入），接入方式见 README 的 *Dot lattice*；因此不计入 2D parity。
  - 颜色与 `cell_size` 等参数与 3D 网格共用侧栏面板：同一个字段对两种网格同时生效。
  - `min_pixels_between_cells` 的库默认沿用参考的 2；gallery 默认 20。2D 页把 bevy 的千像素级
    矩阵压在约 0.7 px/单位下，2 会让最细层每隔 3-7 像素一条线，20 把最细层拉到约 70 像素一格。
- 渲染顺序：网格在 2D 图元之前、3D 图元之后（2D 页没有 3D 内容），不写深度、pin 近平面。
- 验证：`tests/grid2d.gpu.test.ts`（LOD 间距、pan、zoom、opacity、debug 调色板）、
  `tests/grid.test.ts` 的 2D 选项解析测试，以及 `tests/frame-draw-list-2d.test.ts` 的
  `grid` 命令测试（outer 边界、rotation、skew、参数校验）。

## 已知差异

- `ellipse` 使用 iq 的近似 SDF，长轴端点附近误差在 1 像素以内，不是精确距离场。
- `polygon` 用"最近边中点方向上的边线距离"，顶点外侧会略微内缩（视觉上顶点略钝），与 bevy
  的三角化 mesh 轮廓有亚像素差异。
- `arc` 的描边按 `startAngle` / `sweep` 裁剪；它没有内部，所以只有 `arc` / `arc_d`，没有 `arc_s`。
- `ellipse` 的虚线用 Simpson 积分近似弧长，虚线间距与真实弧长有约 1% 的偏差。
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
bun test tests/camera-2d.test.ts tests/frame-draw-list-2d.test.ts \
  tests/line2d.gpu.test.ts tests/shape2d.gpu.test.ts tests/scenes-2d.test.ts
bun run dev -- --host 127.0.0.1 --port 5174
# gallery: ?scene=2d-index / ?scene=2d-rect / ?scene=2d-rounded-rect / ?scene=2d-circle
#          ?scene=2d-ellipse / ?scene=2d-arc / ?scene=2d-annulus / ?scene=2d-capsule / ?scene=2d-polygon
#          ?scene=2d-triangle / ?scene=2d-rhombus / ?scene=2d-sector / ?scene=2d-segment
#          ?scene=2d-lines / ?scene=2d-curves / ?scene=2d-markers / ?scene=2d-arrows / ?scene=2d-spaces / ?scene=2d-grid
```

2D 页面在 gallery 里是独立的 `2D Graphics` 分组（与 `3D Graphics`、`Text` 并列）。2D 无限网格
是页面固有内容：`2D Graphics` 下的每个页面都会绘制它，不受"显示网格"开关影响（该开关在 2D 页
隐藏），"网格不透明度"仍可把它调弱或调到 0。页面拖拽或按住 WASD 平移、滚轮缩放；侧栏会隐藏只对 3D 相机
有意义的控件（投影、视角预设、接头），网格面板在 2D 页只显示两种网格共用的字段。