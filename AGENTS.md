# AGENTS.md

用于 `vgpu-render` 项目的协作规则，正文使用简体中文。本文件与 `~/AGENTS.md` 叠加生效；冲突时以本文件为准。

## 技术栈

- **语言：** TypeScript，使用 ESM；源码导入本地模块时保留 `.js` 扩展名。
- **运行时与包管理：** Bun。
- **构建与开发服务器：** Vite。
- **测试：** Vitest，包括纯逻辑测试和真实 GPU 渲染测试。
- **渲染：** WebGPU，通过 `vgpu` 和 WGSL 实现 3D debug-draw/gizmo 层。
- **Gallery UI：** React 19 + Base UI + shadcn（`base-lyra` preset）+ Tailwind v4；主题 token 在 `gallery/index.css`，`components.json` 记录 preset 配置。
- **类型检查：** TypeScript `strict` 模式，启用 `exactOptionalPropertyTypes` 和 `verbatimModuleSyntax`。
- **参考实现：** `godot-debug-draw` 与 `godot-infinite-grid`；参考源码位于 `~/src/` 的对应上游仓库，视觉对比基线记录在 `docs/`。

## 快速上手

### 入口

`src/` 是主引擎，库入口只导出这里的公共 API；`examples/` 是 gallery 示例层；`gallery/` 是浏览器壳层。

```text
src/index.ts                 ← 公共导出（只含引擎，不导出示例）
src/frame-draw-list.ts        ← 帧命令与录制 API
src/debug-draw-3d.ts         ← 高层 DebugDraw3D 生命周期与图层过滤
src/gpu-debug-draw-3d.ts     ← WebGPU 实例化渲染与 WGSL 管线
src/infinite-grid-3d.ts      ← 无限网格渲染
src/vector-math.ts           ← 引擎与示例共用的向量/圆基底工具
src/text-reference.ts        ← dev-only 文本对照页（不导出、不进库构建）

examples/sets.ts             ← 两套页面集合：basic（基础示例）与 vfx（战斗特效）
examples/basic/runtime.ts    ← basic 分发（buildScene：2D → 3D → text）
examples/basic/registry.ts   ← basic 侧栏登记表（只固定页面顺序）
examples/basic/<slug>/scene.ts ← 基础示例单页场景实现
examples/basic/<slug>/meta.ts  ← 基础示例单页元数据
examples/vfx/runtime.ts      ← 战斗特效分发（buildScene：loop time + 参数）
examples/vfx/registry.ts     ← 战斗特效侧栏登记表
examples/vfx/easing.ts       ← 缓动曲线：11 家族 × in/out/inOut（anime.js 定义，linear 无方向）
examples/vfx/params.ts       ← 特效参数解析、clamp 与取色
examples/vfx/matrix.ts      ← 各页共用的 11×3 矩阵布局、标题与曲线图
examples/vfx/action-phase.ts ← 各页共用的「动作窗口」时序（时长 × 占比 → progress/eased/fade）
examples/vfx/unit.ts       ← 各页共用的战斗单位圆盘（`circle_s` + 描边，HSV 派生颜色）
examples/vfx/timeline-tracks.ts ← 单特效页共用的元素曲线时间轴（每元素一行 + 共享播放头 + 秒刻度）
examples/vfx/<slug>/scene.ts ← 战斗特效单页实现（world2d + timeline）
examples/vfx/<slug>/meta.ts  ← 单页元数据（duration、params、view2d）
examples/shared/             ← 共享布局、标签、几何、绘制 helper 与 meta helper

gallery/demo.tsx             ← 浏览器 gallery 入口（React 挂载点）
gallery/demo-engine.ts       ← 命令式 WebGPU 引擎（渲染循环、相机、持久化）
gallery/demo-hooks.ts        ← React 与引擎之间的订阅桥接
gallery/demo-source.ts       ← 代码预览分词（纯逻辑）
gallery/components/          ← Base UI + shadcn 壳层与控件（含 vfx-controls.tsx：时间轴 + 特效参数）
gallery/battle-params.ts     ← 战斗特效参数状态（每特效一份记录，独立于渲染循环）
gallery/demo-config.ts       ← gallery 与截图对比配置
gallery/index.css            ← base-lyra 主题 token
gallery/demo.css             ← 三段式布局、compare 模式、代码高亮
gallery/assets/              ← gallery 专用字体资源
scripts/source-scrub.ts      ← 对外产物（gallery 预览、npm dist）的品牌词清洗规则
```

### 常用命令

```bash
bun run typecheck  # TypeScript 类型检查
bun test           # Vitest 测试
bun run build      # Vite 生产构建（gallery → dist-site/）
bun run build:lib  # 库构建（tsc → dist/，发布到 npm）
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
  ├── src/                         # 主引擎：库源码、渲染器、dev 工具
  ├── examples/                    # 示例层：sets.ts + basic/ + vfx/ + shared/
  ├── gallery/                     # 浏览器 gallery 壳层：React、引擎驱动、样式、资源
  ├── tests/                       # 单元测试、场景测试与真实 GPU 测试
  ├── scripts/                     # 截图捕获、dist 品牌词清洗等开发脚本
  ├── docs/                        # parity 状态与视觉对比说明
  ├── artifacts/                   # 本地生成的对比参考，整体不入库（见 .gitignore）
  ├── index.html                   # Vite gallery 页面入口
  ├── package.json                 # Bun scripts、依赖与 npm 发布配置
  ├── tsconfig.json                # 严格 TypeScript 配置
  ├── tsconfig.build.json          # 库构建配置（tsc → dist/）
  ├── LICENSE                      # MIT
  ├── bun.lock                     # Bun 锁文件
  └── README.md                    # 用法、能力与开发说明
```

## 工作流程

- 动手前先阅读与任务相关的源码、测试和文档；涉及视觉 parity 时先阅读 `docs/visual-comparison.md` 与 `docs/reference-parity.md`。
- 先明确修改的行为和验证方式，再进行小范围编辑。
- 优先沿用现有的 `FrameDrawList -> FrameCommand[] -> GpuDebugDraw3D` 数据流，不要绕过录制层直接在 demo 中构造渲染状态。
- 新增或修改图元参数时，同时检查：录制命令、GPU instance 数据、WGSL shader、场景调用和相关测试是否仍然一致。
- 当前项目是 **partial parity**，不是 Godot 的完整或像素级移植。GPU smoke test 只能证明能够渲染，不能单独证明视觉等价。
- 视觉基线应记录捕获条件，包括分辨率、DPR、浏览器/GPU、相机、投影、时间和参考场景版本。
- 不要为了让截图看起来接近而移动、缩放或变形某一侧的场景；对比应保留真实布局差异。

## 编辑规则

- 修改前先读文件，不凭推测编辑；保持改动集中，不顺手重构无关代码。
- TypeScript 使用现有的严格类型风格；避免 `any`、非必要的类型断言和绕过类型系统的实现。
- 新增公共 API 时补充类型定义、README/API 示例或对应测试；不要只修改 demo 而不更新库层契约。
- 本地模块导入遵循现有 ESM 约定，使用 `.js` 扩展名。
- 依赖方向固定：`src/` 不得导入 `examples/` 或 `gallery/`；`examples/` 只依赖 `src/` 与 `examples/shared/`；`gallery/` 可以依赖两者。引擎需要的向量/几何工具应下沉到 `src/`，不能反过来从示例布局模块借用。
- 新增基础示例页时同时添加 `examples/basic/<slug>/scene.ts` 与 `examples/basic/<slug>/meta.ts`，在 `examples/basic/runtime.ts` 分发、在 `examples/basic/registry.ts` 固定侧栏顺序。页面入口统一为 `draw(drawList: FrameDrawList, context: SceneContext)`，`SceneContext` 固定从 `examples/shared/scene-context.ts` 导入；页面只导出 `draw`（测试直接引用的 `CIRCLE_REFERENCE` / `LINE_REFERENCE` 等除外），不要恢复集中式场景大文件。
- 新增战斗特效页时添加 `examples/vfx/<slug>/scene.ts` 与 `meta.ts`（`family: "2d"`、`duration`、`params`、`view2d` 四项必填），在 `examples/vfx/runtime.ts` 的 `PAGES` 里分发、在 `examples/vfx/registry.ts` 定序。场景入口是 `draw(drawList: FrameDrawList, context: VfxSceneContext)`，`VfxSceneContext` 固定从 `examples/vfx/scene-context.ts` 导入，参数一律从 `context.params` 读；参数范围只写在 `meta.ts` 的 `ParamSpec[]` 里，由 `clampParams` 负责校验。
- 战斗特效页的排版沿用基础示例矩阵页的约定：一列一个参数/家族、一行一个样本/方向，列标题在上、行标签在左，格子内容共享时钟与参数，只有被对比的那一个维度不同。缓动曲线一律写在 `examples/vfx/easing.ts` 里（anime.js 的定义），不要在某页里内联一份。
- 两套页面的边界固定：`examples/basic` 与 `examples/vfx` 互不 import，只共用 `examples/shared/` 与 `examples/sets.ts`；`gallery/demo-engine.ts` 通过 `SceneSet` 注入注册表、dispatcher、存储 key 与参数来源，不得把某一套页面的 id 硬编码回引擎。
- 示例源码预览由 `import.meta.glob` 按页读取 `examples/*/scene.ts`，路径与 Vite 的 `?raw` 清洗规则在 `gallery/demo-hooks.ts`、`vite.config.ts` 中保持一致。
- WGSL 修改必须同步检查对应的 instance attribute、CPU 端 buffer 定义和渲染测试；注意 WebGPU 对布局、顶点数、透明度、深度和坐标空间的要求。
- 渲染逻辑优先使用实例化和现有几何管线；不要在 CPU 上展开本项目明确设计为实例化的点或线图元。
- 注释只解释不明显的渲染算法、坐标变换或兼容性约束；代码注释使用英文，面向人的 Markdown 文档使用简洁中文。
- 不直接编辑 `node_modules/`、`dist/` 或运行时生成的临时目录。
- `artifacts/` 下全是本地诊断产物（截图、逐 glyph 数据、对比页），**整体不纳入版本控制**。按需用 `scripts/capture-*.ts`、`/tmp/vgpu-parity-godot` 与 `tools/bevy-text-reference` 在本地重生成；入库的是复现链路（脚本、夹具 `cases.json`、字体源），不是产物。

## 测试与视觉验证

### 逻辑和类型验证

- `bun run typecheck`：验证 `src/`、`examples/`、`gallery/` 与 `tests/` 的类型契约。
- `bun test`：运行 Vitest 测试，包括 frame draw list、几何生成器、场景参数和 GPU 测试。
- 修改纯函数、几何生成器、场景布局或命令归一化逻辑时，优先补充针对性单测。

### 真实 GPU 验证

GPU 测试需要可用的 WebGPU/图形环境。相关测试会验证线、点、dash、世界空间宽度和三角形填充等行为；环境不可用时应明确报告，不能把未运行当作通过。

视觉截图需要 Vite 服务、可用 GPU 显示服务器和 Chromium。**复用已经在跑的服务，agent 不启不关**：

```bash
# dev server 由用户自己启动（默认 http://localhost:5173），agent 只读
VGPU_URL=http://localhost:5173 bun scripts/capture-vgpu.ts circle line
# 战斗特效页（无 Godot 参考，需关掉对比）
VGPU_URL=http://localhost:5173 VGPU_PAGE=vfx VGPU_COMPARE=0 bun scripts/capture-vgpu.ts slash-arc
```

**严禁 `pkill -f vite`**：它会连带杀掉其它项目（`~/dev/octo-assets`、`~/gamedev/battle` 等）的 dev server。
需要独占端口时起在 5199，并 `kill` 自己记录的 PID，不去动别人的进程。

截图写入 `artifacts/`，该目录整体已被 git 忽略，不会污染工作区状态。Godot 参考截图使用独立的 `/tmp/vgpu-parity-godot` 副本，不要修改 `~/src/` 下的上游仓库。截图对比页默认地址为：

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
- 不把大体积模型、截图缓存或临时调试输出加入源码提交；视觉基线截图不入库，只在本地生成。
- 不宣称当前实现已达到完整 Godot parity；状态以 `docs/reference-parity.md` 为准。

## 以下操作必须先征求用户同意

- 删除、批量重命名或大规模移动文件。
- 引入新的运行时依赖、替换 `vgpu` 或调整包管理方案。
- 大规模修改渲染架构、坐标约定或公共 API。
- 重生成 `artifacts/` 参考产物并据此更新 `docs/` 里的 parity 结论。
- 修改 `package.json` 的依赖、脚本或项目发布配置。
- 提交、推送、发布 npm/Bun 包或修改上游仓库。

## Subagents 协作规则

- `scout` 只做定向只读调研，报告文件路径、行号和不确定项，不修改文件。
- `worker` 适合执行边界明确的检查或文档更新；必须限定文件范围和允许执行的命令。
- `coder` 适合独立实现明确的代码任务；委派时说明文件范围、验收标准以及禁止操作。
- 多个 Agent 不得同时修改同一文件；主 Agent 必须检查差异并运行必要验证。
- 委派不能绕过本文件的用户确认要求，尤其是依赖变更、生成基线、Git 提交、推送和发布。
