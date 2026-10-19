# 2D 图形与文字的叠放次序（`zIndex`）

## 结论

当前文字恒在**所有** 2D 图元之上，原因不是深度，而是**绘制顺序写死 + 深度完全不参与**。
引入一个整数 `zIndex` 字段让两者进入同一个排序空间即可，**不需要动深度设置、不需要重排实例、
不需要改 WGSL**。

本文档描述**已实现**的行为；验证记录见文末。

## 现状：为什么文字恒在 2D 之上

| 事实 | 位置 |
| --- | --- |
| `draw()` 的批次顺序写死为 triangle → point → line → joint → `d2.draw()` → 所有文字 | `src/gpu-debug-draw-3d.ts:836-856` |
| 2D 的 clip 矩阵第三行为 `0 0 0 0`，即 `z_clip = 0, w = 1`，`z_ndc` 恒为 0 | `src/camera-2d.ts:49-73` |
| 2D 命令本身没有 z：`Vec2` 经 `lift2D` 提升时 z 硬编码为 0 | `src/gpu-debug-draw-2d.ts:175-177` |
| 2D 四个 draw 全部 `depth: { write: false, compare: "less-equal" }` | `src/gpu-debug-draw-2d.ts:261-267` |
| 文字 draw 同样 `write: false` | `src/gpu-text-3d.ts:396` |
| `screen` 文字强制 `FLAG_NO_DEPTH`，顶点阶段把深度钉在 0；`depthTest` 对 `screen` 无效 | `src/gpu-text-3d.ts:462-467` |
| `world-plane` / `world-billboard` 文字有真实深度，但仍在 2D 之后绘制 | `src/gpu-text-3d.ts:264-267` |

深度缓冲从未被 2D 写过（保持 clear 值），文字与 2D 都在 `z_ndc = 0`，`less-equal` 恒通过。
所以遮挡关系 100% 由 draw 顺序决定，而顺序把文字放最后。

## 目标语义

> 显式叠放次序（painter's order），不引入真实深度。

- 字段名 **`zIndex`**，`number`，默认 `0`，必须是整数，范围 `[-8, 8]`；越界抛 `RangeError`。
- 2D 图元与文字**共享同一个 `zIndex` 空间**，因此可以直接比较。
- 段 = 相邻且 `zIndex` 相等的命令组；段按 `zIndex` 升序绘制。
- 3D 图元**不参与**这个序，永远在 2D 与文字之前（它有真实深度，混进 painter's order 会自相矛盾）。

## 段内次序：零回归的关键

同一段内部的绘制次序**完全沿用今天的次序**：

```
shape → point → line → joint        （world2d bucket 先于 screen bucket）
→ 文字                               （按 source 注册顺序）
```

因此默认 `zIndex = 0` 时只有一段，绘制序列与当前实现逐字节一致，现有 20 个 2D 页面
（`examples/2d-*/scene.ts`、`examples/text-*/scene.ts`）像素不变。

要让图形压住文字，给图形更大的 `zIndex`；要文字压住图形，保持默认即可。

## 可行性地基

`tests/z-index.gpu.test.ts` 锁定两条性质，方案只依赖这两条：

**1. 实例 buffer 可以只靠「访问顺序」重排，不需要移动任何实例。**
`instances()` 的 `remove` 是 swap-remove，但 `trim()`（`src/gpu-instancing.ts:76-83`）只从尾部删，
每次删的都是最后一个 slot，不触发搬移。于是 **`ids[n].slot === n` 恒成立**。
把排序后的第 n 条命令 `set` 进 `ids[n]`，实例在 buffer 里就按段连续排列了。

**2. 一个 `draw` 对象可以在一个 pass 里被多次调用，每次带自己的切片。**
per-call `{ instances, firstInstance }` 直接落到原生 `pass.draw(vertexCount, instanceCount,
firstVertex, firstInstance)`（`node_modules/vgpu/dist/draw.js:469`）。
逐实例切片（`[0,1)+[1,2)+…`）也已验证，所以段边界不必与 kind 边界对齐。

`instanceGeometry.publish()` 会用 `contiguousRuns(slotRevision)` 只上传变化的 slot 区间
（`node_modules/vgpu/dist/scene/instance-geometry.js:44-56`），因此「排序稳定」的帧不会退化成
全量上传。

## 绘制接口

每个渲染器暴露「有哪些段」和「画某一段」，由 `GpuDebugDraw3D` 归并：

```ts
// GpuDebugDraw2D
zIndexes(): readonly number[];                        // 两个 bucket 的并集，升序
drawSegment(pass: FramePass, zIndex: number): void;   // 内部仍按 shape→point→line→joint

// GpuText3D
zIndexes(): readonly number[];
drawSegment(pass: FramePass, zIndex: number): void;

// GpuDebugDraw3D.draw()
for (const key of mergedKeys) {
  this.#d2.drawSegment(pass, key);
  for (const renderer of this.#texts.values()) renderer.drawSegment(pass, key);
}
```

归并规则实现为纯函数（便于单测）：按 `zIndex` 升序；同 `zIndex` 时先 2D 段、后文字段；
2D 段内部 `world2d` 先于 `screen`。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/draw-order.ts` | 新增：`SegmentRange`、`sortedByZIndex`、`orderedZIndexes`、`zIndexesOf`、`rangesByZIndex`，2D/文字/3D 共用 |
| `src/frame-draw-list.ts` | `TextOptions.zIndex?`、`TextDefaults.zIndex?`、`TextCommand.zIndex`，`resolveZIndex` 统一校验 |
| `src/frame-draw-list-2d.ts` | `Line2DOptions/Point2DOptions/Shape2DOptions.zIndex?`（`Arrow/Curve/Grid` 继承）、各 `*2DCommand.zIndex`、2D defaults、同一个校验 |
| `src/gpu-debug-draw-2d.ts` | `prepare` 按 `zIndex` 稳定排序后遍历，记录每段每 kind 的 `{ start, count }`；`draw` 改为 `drawSegment`，用 per-call `{ instances, firstInstance }` 切片；新增 `zIndexes()` |
| `src/gpu-text-3d.ts` | `prepare` 记录段边界；`draw` 改为 `drawSegment`；新增 `zIndexes()` |
| `src/gpu-debug-draw-3d.ts` | `#prepareText` 先按 `zIndex` 排序再按 `source` 分组；`draw()` 归并段 |
| `tests/` | `zIndex` 归一化与越界；段归并纯函数；GPU 像素读回（图形盖文字 / 文字盖图形） |
| `examples/` | 新增 `z-index` 页面：4 列 × 2 行的对照表。列 = 四条规则（`z1 > z0` / `z0 > z1` / `z0 = z0` / 三层），行 = 两类对象（图形之间、图形与文字）；前三列固定对象布局只改键 |
| `docs/` | 本文件；`docs/reference-parity.md` 注明这是 vgpu 扩展，不是 Godot/bevy parity 项 |

`INDIRECT_SHADER` / `dispatchIndirect` 对 2D 与文字会退化成 no-op（数量在 CPU 已知），
3D 那条继续使用。清理留作后续独立改动，不和本次混在一起。

## 不变量

- 不引入 `depth.write`，不动 `depth.compare`，不动 `depthBias`。
- 不改 WGSL，不改 instance attribute 布局。
- `LayerMask` 是与 `zIndex` 正交的过滤轴，不合并。
- 文字块的 `zIndex` 是**整块**一个值，块内 glyph 顺序不变。
- 3D 批次位置不变。

## 已知限制

- draw call 数 = Σ(段内 kind 数) + Σ(段内 source 数)。段数 = 用到的不同 `zIndex` 值个数，
  上限 17（`-8..8`）。典型场景 1–3 段。
- 同一 `zIndex` 内不做细粒度排序；要更细的次序就用不同 `zIndex`（那必然是不同段）。
- 同一 `source` 内 `zIndex` 变化会拆成多个文字段；跨 `source` 的段内先后仍按 source 注册顺序。
- 段数随用户输入增长，极端情况下 draw call 会明显变多。若日后要压，可加「相邻同 `zIndex`
  已经合并」之外的段数上限告警。

## 验证记录

已执行：

```bash
bun run typecheck   # 干净
bun test            # 398 pass, 0 fail（含新增 15 个）
bun run build       # 成功
```

新增测试：

- `tests/z-index.gpu.test.ts` —— 地基：per-call 实例切片、按访问顺序重排 buffer。
- `tests/z-index-layering.gpu.test.ts` —— 行为：等高零回归、图形盖文字、文字盖图形、全程
  `-8..8` 两端。
- `tests/draw-order.test.ts` —— 纯逻辑：默认值、整数与范围校验、稳定排序、段区间、键集归并。

现有 `scenes-2d` / `scenes` / `reference-scenes` / 各 `*.gpu.test.ts` 均无回归，因为默认
`zIndex = 0` 时只有一段，段内次序未变。
