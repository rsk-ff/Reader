# Markdown 官方主题整合

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-08-29`
- Last updated: `2026-08-30`
- Base branch: `master`
- Base commit: `0f62c3e`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

用户反馈 Markdown 渲染仍然较差，要求参考成熟实现。先完整采用已安装 Milkdown Crepe 的官方主题，减少手写排版规则，再由用户检查实际阅读与编辑体验。

## Related context

- [产品行为](../../PRODUCT.md#markdown)
- [Markdown 架构](../../ARCHITECTURE.md#markdown-path)
- [开发和验证](../../DEVELOPMENT.md)
- [编辑器封装](../../../reader/src/documents/markdown/MilkdownCrepe.tsx)
- [主题适配](../../../reader/src/documents/markdown/milkdownTheme.css)
- [编辑器与保存](../../../reader/src/documents/markdown/MarkdownEditor.tsx)
- [应用样式](../../../reader/src/styles.css)
- [排版检查样本](../../../reader/tests/fixtures/markdown-theme-review.md)
- [Crepe 官方样式文档](https://milkdown.dev/docs/guide/styling)

## Current behavior

- 基线：项目使用 `@milkdown/crepe ^7.22.1`，只导入官方 `common/style.css`，未接入完整主题；编辑器根节点挂有 `markdown-body`，GitHub CSS 与自定义标题、段落、列表、表格、代码块覆盖共同生效。
- 首轮：按 common → Frame → `milkdownTheme.css` 导入，删除 250 行旧覆盖及 `github-markdown-css` 依赖。
- 2026-08-30 用户通过两张截图反馈：标题过大，只需前三档有字号梯度；左侧加号和点阵令人困惑，点阵拖动无效果；代码行号旁展开状态的折叠箭头偏低。
- 当前：前三档标题改为 1.75/1.5/1.25em，H4–H6 为 1em 粗体；关闭 BlockEdit；默认 `Fold line` 展开标记上调 0.2em，收起标记、行号和折叠逻辑不变。改动已热更新到原 Reader 检查窗口。

## Expected behavior

所见即所得区域以 Crepe 官方 Frame 浅色主题为基线。H1/H2/H3 使用 28/24/20px（基准正文 16px），H4–H6 统一正文大小的粗体，保持真实标题层级与目录导航；关闭左侧块插入/拖动控件；修正展开状态的代码折叠箭头下沉。保留本地字体、内容宽度和窗口适配，源码切换、目录、显式保存和未保存状态保持原有行为。

## Scope

- `MilkdownCrepe.tsx`、Markdown 样式、直接相关依赖与锁文件。
- 现有 Markdown 检查样本、任务记录、产品/架构/状态和变更日志。

## Out of scope

- 不更换为 Vditor，不加入第二套 Markdown 渲染引擎。
- 不修改 PDF、窗口管理、文件读写或 Markdown 解析和保存逻辑。
- 不添加新生产依赖，不发布安装包，不自行截图或执行桌面视觉验收。

## Constraints and decisions

- 采用 Crepe 官方 Frame 浅色主题及其 common 样式，不继续套 GitHub 静态 HTML 样式。
- 优先使用 Crepe 官方配置和局部样式；用户反馈授权调整标题字号与折叠标记，不重新引入整套自定义排版。
- 保留现有禁用 AI/TopBar 的配置和显式保存边界，额外禁用 `Crepe.Feature.BlockEdit`，不修补或伪装其拖动交互；该功能同时拥有斜杠菜单，一并关闭，普通 Markdown 输入、文本格式工具和代码折叠保留。
- 2026-08-29 首轮在 Pi 免费窗口外完成；2026-08-30 修订是已定位的小型明确改动，继续由 Codex 直接完成，不调用 Pi。

## Acceptance criteria

- [x] 官方完整主题已接入，GitHub CSS 与内部排版覆盖已移除。
- [x] 原有目录、源码切换、保存逻辑未改动。
- [x] 前端测试、TypeScript/生产构建、文档与 diff 检查通过。
- [x] 可检查版本已启动；本轮改动以 `fix: adopt official Crepe markdown theme` 本地提交交付，最终 Git 状态在交付时检查。
- [ ] 用户确认视觉和交互结果。
- [ ] 本轮标题缩小，H4–H6 同字号且不改变 Markdown 语义。
- [ ] 不再提供左侧块加号与点阵，代码折叠仍可用且展开箭头不再下沉。

## Progress

- [x] 检查 Git、当前实现及候选成熟组件。
- [x] 用户同意先采用 Crepe 官方完整主题。
- [x] 实施并验证。
- [x] 启动应用等待用户反馈。
- [x] 收到 2026-08-30 三项截图反馈并定位上游规则。
- [x] 完成标题、块控件和折叠箭头调整与自动化验证；等待视觉复验。

## Discoveries

- Vditor 可作为后续替换候选；只有官方 Crepe 对照仍不能满足需求时才另行评估，不在本轮并行引入。
- 官方 reset 样式的 H1/H2/H3 为 `2.625em/2.25em/2em`，正文 16px 时是 42/36/32px；H4/H5 也明显大于正文。
- CodeMirror language `6.12.4` 的默认展开标记是 `⌄`、收起标记是 `›`，分别使用 `Fold line`/`Unfold line` 提示；本轮仅修正展开标记的垂直位置，不替换折叠扩展、不叠加第二条 gutter。
- 已安装 Crepe 版本为 `7.22.1`；Frame 主题不导入远程字体，使用本地字体变量即可。
- 保留原有 CodeMirror 浅色配置：Crepe 默认注入 oneDark，现有 `theme: null as never` 让 CodeMirror 使用 basicSetup 浅色高亮，未改变其运行逻辑。
- `tauri dev` 的应用参数需要两个 `--`。首次按原开发文档启动时，样本正常传入，但 Cargo 的 `--color always` 被混入 Reader 参数，产生一次 `open_document('always')` 警告；已根据本地 CLI 帮助修正开发文档，不扩大到应用参数解析修改，也未强制重启已交给用户的窗口。

## Verification

以下前端命令已于 2026-08-30 在本轮修订后重跑；原样式构建检查和首次启动记录仍保留作为首轮证据。

- `pnpm --dir reader test` — passed，15 个文件、100 个测试。
- `pnpm --dir reader build` — passed，TypeScript 与 Vite 生产构建成功，仅保留既有大 chunk 警告。
- 构建产物静态检查 — passed，Markdown CSS 含 Frame 主题、官方列表/表格和本地代码字体，无 `markdown-body`、无远程 CSS 导入。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — passed。
- `git diff --check` — passed；已审查应用改动、依赖锁文件、文档与新增样本。
- 启动检查 — Vite 1420 端口监听，Reader debug 进程 `36168` 有非零窗口句柄；截至启动检查未发现 `milkdown init failed` 或前端运行错误。首次启动的参数警告见 Discoveries。
- Rust、安装包：本轮无对应代码改动，按风险不重复执行完整检查。
- 2026-08-30 复验：15 个测试文件、100 个测试通过；生产构建 1170 个模块，仅保留既有大 chunk 警告。Vite 15:44:06 记录 TSX/CSS 热更新，两个模块 HTTP 200 且包含新配置与样式；原 Reader 进程 `36168` 保持运行，不强制关闭或重开用户文档。

## User acceptance

waiting。已传入临时样本 `C:\Users\fanq1\AppData\Local\Temp\Reader-Markdown-Theme-Review-20260829-231539.md`，可自由修改和保存，不影响仓库样本。

2026-08-30 已收到三项反馈并完成实现；本轮只需复验：

1. 标题是否足够紧凑，前三档有梯度、四至六级同字号；点击左侧目录仍能跳转。
2. 鼠标移到正文左侧不再出现加号和点阵；正文仍能直接编辑。
3. 代码第 1、6 行展开箭头是否与代码行对齐，点击折叠后能再次展开。

前三项尚未获得用户复验确认，不视为视觉或交互通过。

启动日志保存在同一临时目录的 `Reader-Markdown-Theme-20260829-231539.stdout.log` 与 `.stderr.log`。

## Risks and remaining work

- 官方主题的外观和实际编辑交互仍需用户验收。
- 本轮只统一样式，不承诺解决尚未提供样本的 Markdown 语法兼容问题。
- 折叠标记适配限定 CodeMirror 当前默认英文提示 `Fold line`；未来若引入编辑器本地化，需要同时更新这条局部规则。

## Next action

等待用户按三项清单复验当前窗口，继续在本任务内处理反馈或在验收后归档。

## Outcome

首轮提交 `26f36b5` 完成官方主题整合；2026-08-30 修订以 `fix: refine markdown headings and editor controls` 本地提交交付。实现与自动化验证已完成，视觉与交互复验未完成，任务保留 active。
