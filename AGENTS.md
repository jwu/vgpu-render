# AGENTS.md

用于 `vgpu-render` 项目的协作规则，正文使用简体中文。本文件与 `~/AGENTS.md` 叠加生效；冲突时以本文件为准。

## 技术栈

- **语言：** TypeScript，使用 ESM；源码导入本地模块时保留 `.js` 扩展名。
- **运行时与包管理：** Bun。
- **构建与开发服务器：** Vite。
- **测试：** Vitest，包括纯逻辑测试和真实 GPU 渲染测试。
- **渲染：** WebGPU，通过 `vgpu` 和 WGSL 实现 3D debug-draw/gizmo 层。
- **Gallery UI：** React 19 + Base UI + shadcn（`base-lyra` preset）+ Tailwind v4；主题 token 在 `src/index.css`，`components.json` 记录 preset 配置。
- **类型检查：** TypeScript `strict` 模式，启用 `exactOptionalPropertyTypes` 和 `verbatimModuleSyntax`。
- **参考实现：** `godot-debug-draw` 与 `godot-infinite-grid`；参考源码位于 `~/src/` 的对应上游仓库，视觉对比基线记录在 `docs/`。

## 快速上手

### 入口

```text
src/index.ts                 ← 公共导出
src/frame-recorder.ts        ← 帧命令与录制 API
src/debug-draw-3d.ts         ← 高层 DebugDraw3D 生命周期与图层过滤
src/gpu-debug-draw-3d.ts     ← WebGPU 实例化渲染与 WGSL 管线
src/godot-scenes.ts          ← Godot 示例场景的 TypeScript 移植
src/demo.tsx                ← 浏览器 gallery 入口（React 挂载点）
src/demo-engine.ts           ← 命令式 WebGPU 引擎（渲染循环、相机、持久化）
src/demo-hooks.ts            ← React 与引擎之间的订阅桥接
src/demo-source.ts           ← 代码预览取函数与高亮分词（纯逻辑）
src/components/              ← Base UI + shadcn 壳层与控件
src/demo-config.ts           ← gallery 与截图对比配置
src/index.css                ← base-lyra 主题 token
src/demo.css                 ← 三段式布局、compare 模式、代码高亮
src/infinite-grid-3d.ts      ← 无限网格渲染
```

### 常用命令

```bash
bun run typecheck  # TypeScript 类型检查
bun test           # Vitest 测试
bun run build      # Vite 生产构建
bun run dev        # 启动 Vite 开发服务器
```

最小验证通常按以下顺序执行：

```bash
bun run typecheck
bun test
bun run build
```

## 目录结构

```text
vgpu-render/
  ├── src/                         # 库源码、渲染器、demo 与场景移植
  ├── tests/                       # 单元测试、场景测试与真实 GPU 测试
  ├── scripts/                     # 截图捕获等开发脚本
  ├── docs/                        # parity 状态与视觉对比说明
  ├── artifacts/visual-baseline/  # Godot/vgpu 截图及浏览器对比页
  ├── index.html                   # Vite gallery 页面入口
  ├── package.json                 # Bun scripts 与依赖
  ├── tsconfig.json                # 严格 TypeScript 配置
  ├── bun.lock                     # Bun 锁文件
  └── README.md                    # 用法、能力与开发说明
```

## 工作流程

- 动手前先阅读与任务相关的源码、测试和文档；涉及视觉 parity 时先阅读 `docs/visual-comparison.md` 与 `docs/godot-debug-draw-parity.md`。
- 先明确修改的行为和验证方式，再进行小范围编辑。
- 优先沿用现有的 `FrameRecorder -> FrameCommand[] -> GpuDebugDraw3D` 数据流，不要绕过录制层直接在 demo 中构造渲染状态。
- 新增或修改图元参数时，同时检查：录制命令、GPU instance 数据、WGSL shader、场景调用和相关测试是否仍然一致。
- 当前项目是 **partial parity**，不是 Godot 的完整或像素级移植。GPU smoke test 只能证明能够渲染，不能单独证明视觉等价。
- 视觉基线应记录捕获条件，包括分辨率、DPR、浏览器/GPU、相机、投影、时间和参考场景版本。
- 不要为了让截图看起来接近而移动、缩放或变形某一侧的场景；对比应保留真实布局差异。

## 编辑规则

- 修改前先读文件，不凭推测编辑；保持改动集中，不顺手重构无关代码。
- TypeScript 使用现有的严格类型风格；避免 `any`、非必要的类型断言和绕过类型系统的实现。
- 新增公共 API 时补充类型定义、README/API 示例或对应测试；不要只修改 demo 而不更新库层契约。
- 本地模块导入遵循现有 ESM 约定，使用 `.js` 扩展名。
- WGSL 修改必须同步检查对应的 instance attribute、CPU 端 buffer 定义和渲染测试；注意 WebGPU 对布局、顶点数、透明度、深度和坐标空间的要求。
- 渲染逻辑优先使用实例化和现有几何管线；不要在 CPU 上展开本项目明确设计为实例化的点或线图元。
- 注释只解释不明显的渲染算法、坐标变换或兼容性约束；代码注释使用英文，面向人的 Markdown 文档使用简洁中文。
- 不直接编辑 `node_modules/`、`dist/` 或运行时生成的临时目录。
- `artifacts/visual-baseline/` 中的截图是诊断产物。只有在确实重生成或更新视觉基线时才改动，并在文档中说明捕获条件和差异。

## 测试与视觉验证

### 逻辑和类型验证

- `bun run typecheck`：验证 `src/` 与 `tests/` 的类型契约。
- `bun test`：运行 Vitest 测试，包括 frame recorder、几何生成器、场景参数和 GPU 测试。
- 修改纯函数、几何生成器、场景布局或命令归一化逻辑时，优先补充针对性单测。

### 真实 GPU 验证

GPU 测试需要可用的 WebGPU/图形环境。相关测试会验证线、点、dash、世界空间宽度和三角形填充等行为；环境不可用时应明确报告，不能把未运行当作通过。

视觉截图需要 Vite 服务、可用 GPU 显示服务器和 Chromium：

```bash
bun run dev -- --host 127.0.0.1 --port 5174
bun scripts/capture-vgpu.ts circle line
```

Godot 参考截图使用独立的 `/tmp/vgpu-parity-godot` 副本，不要修改 `~/src/` 下的上游仓库。截图对比页默认地址为：

```text
http://127.0.0.1:5174/artifacts/visual-baseline/index.html
```

对比模式使用确定性参数，例如：

```text
http://127.0.0.1:5174/?compare=1&scene=circle
http://127.0.0.1:5174/?compare=1&scene=line
```

任何声称 parity 改善的改动都应同时说明：通过了哪些测试、是否更新截图、仍有哪些已知差异。不要把单纯的 GPU smoke test 描述为视觉等价。

## 搜索与外部资料

- 优先使用 `rg`、`fd` 或本项目工具读取相关文件，避免无目标地扫描整个仓库。
- 互联网资料优先使用 `webfetch`；Godot 行为优先查阅官方文档，涉及引擎内部行为时再查看 `~/src/godot@godotengine/`。
- 涉及 `vgpu` API 时先查看当前依赖的类型定义和仓库现有用法，不凭记忆假设 API。
- 不确定的 WebGPU/WGSL 行为应通过最小复现或针对性测试确认。

## Git 与提交

- 提交信息使用 Conventional Commits 格式，例如：`fix(renderer): 修正屏幕空间线宽`。
- 描述部分使用中文；按逻辑分批提交，避免混入无关格式化或生成产物。
- 不要默认提交、推送或发布；只有用户明确要求时才执行 `git commit`、`git push` 或包发布操作。
- 不要修改上游仓库的 remote、历史或工作树。

## 严禁

- 不删除、移动或重命名用户已有文件，除非用户明确要求。
- 不修改 `node_modules/`、`dist/` 和 `~/src/` 上游源码来绕过问题。
- 不把大体积模型、截图缓存或临时调试输出加入源码提交；生成的视觉基线只能按任务需要更新。
- 不宣称当前实现已达到完整 Godot parity；状态以 `docs/godot-debug-draw-parity.md` 为准。

## 以下操作必须先征求用户同意

- 删除、批量重命名或大规模移动文件。
- 引入新的运行时依赖、替换 `vgpu` 或调整包管理方案。
- 大规模修改渲染架构、坐标约定或公共 API。
- 更新或批量重生成 `artifacts/visual-baseline/`。
- 修改 `package.json` 的依赖、脚本或项目发布配置。
- 提交、推送、发布 npm/Bun 包或修改上游仓库。

## Subagents 协作规则

- `scout` 只做定向只读调研，报告文件路径、行号和不确定项，不修改文件。
- `worker` 适合执行边界明确的检查或文档更新；必须限定文件范围和允许执行的命令。
- `coder` 适合独立实现明确的代码任务；委派时说明文件范围、验收标准以及禁止操作。
- 多个 Agent 不得同时修改同一文件；主 Agent 必须检查差异并运行必要验证。
- 委派不能绕过本文件的用户确认要求，尤其是依赖变更、生成基线、Git 提交、推送和发布。
