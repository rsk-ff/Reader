# Markdown 调宽与 PDF/Markdown 侧栏拖动收起

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-09`
- Last updated: `2026-10-09`
- Base branch: `master`
- Base commit: `b087c09`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

Markdown 左侧目录支持拖动宽度和完全收起，给正文腾出空间。根据用户续接反馈，两种文档统一最小宽度，并支持继续向左拖动到阈值后收起。

## Related context

- [PRODUCT](../../PRODUCT.md) — Markdown 行为。
- [DEVELOPMENT](../../DEVELOPMENT.md) — 测试和独立验收窗口启动。
- [MarkdownEditor](../../../reader/src/documents/markdown/MarkdownEditor.tsx)、[MarkdownOutline](../../../reader/src/documents/markdown/MarkdownOutline.tsx)、[MarkdownToolbar](../../../reader/src/documents/markdown/MarkdownToolbar.tsx)。
- [styles.css](../../../reader/src/styles.css)、[浏览器入口](../../../reader/tests/browser/markdown-editor.jsx)。
- [ARCHITECTURE](../../ARCHITECTURE.md)、[PdfSidebar](../../../reader/src/documents/pdf/PdfSidebar.tsx)、[PdfViewer](../../../reader/src/documents/pdf/PdfViewer.tsx)。

## Current behavior

目录固定为 220px，窄窗口为 168px，没有调宽或收起入口。Git 工作树干净；两个既有活动任务与当前目标独立。

首轮实现提交 dc5c84e 已支持 Markdown 120px 最小宽度和按钮收起。用户续接要求统一 PDF 最小宽度，并使两种页面继续左拖后收起；此轮基线 dc5c84e，工作树干净。

## Expected behavior

拖动目录右边缘调宽；顶部目录开关完全隐藏/展开侧栏，正文使用释放的全部空间。展开恢复本标签页宽度，源码/渲染切换不重置宽度和收起状态。

PDF 目录/缩略图与 Markdown 目录最小宽度 168px；到最小后继续左拖其 70%（117.6px），未截断目标宽度达到 50.4px 时完全收起，重新展开恢复本次拖动前的宽度。

## Scope

Markdown 侧栏布局、顶部开关，PDF 目录/缩略图拖动收起，共用分隔条，相关浏览器回归和产品/架构/状态/变更文档。

## Out of scope

PDF 目录数据/页面内容、编辑/保存实现、跨启动布局持久化、图标任务、正式安装发布；既有 PDF 目录布局任务保持独立。

## Constraints and decisions

- 两种侧栏展开宽度在 168–560px 内；Markdown 窄窗口限制上限但保持 168px 最小宽度。
- 按拖动起点累计位移计算未截断目标宽度；用户要求比 50% 更晚收起，因此采用从最小宽度继续左拖 70% 的规则（目标 50.4px）。50.4–168px 缓冲区保持 168px。键盘调宽只限幅，不触发收起。
- 拖动收起后恢复本次拖动开始前的偏好宽度；指针释放后不会自动展开，也不会继续选中正文。
- 调宽不重建编辑器，不写入文档；开关和分隔条支持键盘。
- Codex 直接实现；不调用 Pi，不截图或使用桌面自动化做视觉验收。

## Acceptance criteria

- [x] 拖动目录右边缘可左右调宽，边界限制有效（浏览器功能验证）。
- [x] 侧栏完全收起，正文扩展；重新展开恢复宽度（浏览器功能验证）。
- [x] 两种模式可使用，修改内容和编辑器实例不因布局操作丢失（浏览器功能验证）。
- [x] 窄窗口不横向溢出，顶部开关/保存/打印可见（330px 浏览器验证）。
- [x] 浏览器功能、前端测试、生产构建、文档检查通过；连贯提交与干净工作树（提交主题见 Outcome）。
- [ ] 用户在 Reader 中验收视觉与交互。
- [x] 两种页面 168px 最小宽度，84px/51px 目标仍展开、50px 目标收起，拖动结束无残留，按钮恢复拖动前宽度（真实浏览器验证，含 PDF 真实目录）。

## Progress

- [x] 70% 延后触发修订、带目录样本、浏览器回归、完整测试/构建及提交。
- [x] 续接反馈：统一最小宽度和两种页面拖动收起，补回归并更新验收版。
- [x] 检查 Git、当前文档与相关实现，明确范围。
- [x] 实现与自动验证。
- [x] 启动独立验收窗口并提交。

## Discoveries

- PDF 已有拖动侧栏实现，但 Markdown 使用独立固定宽度样式。
- 调宽和收起使用独立布局状态，不变更 Crepe key。窗口缩窄只限制实际显示宽度，放宽恢复原偏好；跨启动不持久化。
- 指针捕获结束、取消或丢失时清除拖动状态与正文禁止选择样式；分隔条支持方向键、Home/End。

## Verification

最新 70% 延后触发修订：

- `pnpm --dir reader test:browser -- sidebar-collapse.spec.ts markdown-sidebar.spec.ts` — 8 passed，分别覆盖 Markdown、PDF 缩略图、PDF 真目录；84px/51px 未收起、50px 收起，展开恢复及窄窗偏好通过。
- 目录测试实际加载仓库 `ani1320588.pdf`，由 PDF.js 读取原生书签，断言 Outline 可用、目录项可见、收起/恢复后再次点击目录项，无截图或桌面自动化。
- 检查窗口补开 `C:\Users\fanq1\AppData\Local\Temp\reader-markdown-sidebar-20261009\sidebar-outline-review.pdf`，源为 `ani1320588.pdf` 的副本；前一份 `sidebar-review.pdf` 不带书签，仅可检查缩略图。
- 前端 16 文件、111 项通过；TypeScript/Vite 1207 模块构建通过（既有大 chunk 提示）；文档检查 31 Markdown/3 活动任务与 diff 检查通过。Vite 共享模块确认包含 `168 * (1 - 0.7)` 的当前规则，检查 PID 58744、窗口句柄 2559122、响应正常；没有截图或桌面自动化验收。Pi 未调用，Rust 测试和安装包未重跑。

此前 50% 规则验证（f07bb68，已被本次阈值替代）：

- `pnpm --dir reader test:browser -- sidebar-collapse.spec.ts markdown-sidebar.spec.ts markdown-tools.spec.ts markdown-selection.spec.ts pdf-selection.spec.ts` — 57 passed；新增 3 项，精确阈值、键盘限幅、捕获结束、展开恢复、PDF 正文与 Markdown 未保存内容保留；无截图/视频/trace。
- `pnpm --dir reader test` — 16 文件、111 项通过。
- `pnpm --dir reader build` — TypeScript 与 Vite 1207 模块通过，既有大 chunk 提示。
- 开发窗口继续沿用独立标识与 PID 58744，前端热更新；通过独立程序单实例转发补开同临时目录 `sidebar-review.pdf` 副本。未强制重载/重启窗口，避免丢失用户未保存内容。
- Vite 共用分隔条及两个侧栏模块返回当前实现；检查进程窗口非零句柄、响应正常。文档检查（31 Markdown、3 活动任务）与 diff 检查通过，全部变更已审阅；Pi 未调用，Rust 测试与安装包未重跑。

首轮验证（dc5c84e）：

- `pnpm --dir reader test:browser -- markdown-sidebar.spec.ts markdown-tools.spec.ts markdown-selection.spec.ts` — 24 passed（新增侧栏 4 项），真实 React/Crepe/CSS；仅原生文件接口模拟，无截图/视频/trace。
- `pnpm --dir reader test` — 16 文件、111 项通过。
- `pnpm --dir reader build` — TypeScript 与 Vite 1206 模块通过，既有大 chunk 提示。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — 31 Markdown、3 活动任务、12 归档任务、2 决策记录通过。首轮发现 Related context 缺少链接，已修正并复验通过。
- `git diff --check` — passed；完整 diff 已审阅。
- Tauri 开发编译 — 1m37s 成功；独立标识 `com.earendil.reader.sidebar20261009`，窗口 `Reader · Markdown 侧栏验收` PID 58744、非零句柄 2559122、响应正常。Vite 当前侧栏模块包含拖动及窗口宽度上限实现；未做桌面视觉验收。
- 启动参数为 `C:\Users\fanq1\AppData\Local\Temp\reader-markdown-sidebar-20261009\sidebar-review.md`（样本副本）。临时配置同目录 `tauri-check.json`，dev 会话 7038，开发服务 `http://localhost:1420`；正式安装版保留。

## User acceptance

waiting。

用户反馈：最小宽度与 PDF 一致，PDF/Markdown 都可继续向左拖到一定程度后收起。已采用 50% 最小宽度阈值并通过自动验证，实际桌面体验待用户复验。

后续反馈：50% 不够，希望 70%，明确指更晚收起；先前提供的 PDF 不带目录，无法验收 PDF 目录栏。已按从最小宽度继续左拖 70% 实现，并补开带书签的新样本。

1. 拖动目录右边缘，确认变宽/变窄及标题截断。
2. 点击顶部目录开关，确认完全收起、正文扩展；再展开确认宽度恢复。
3. 切换源码/渲染，缩窄窗口，确认开关和保存/打印可用，未保存内容保留。
4. 在 Markdown 和 PDF 侧栏拖到最小宽度后继续左拖约 118px（70%），确认比原先更晚收起；松开鼠标后保持收起，顶部按钮展开恢复拖动前宽度。
5. 切换到 `sidebar-outline-review.pdf`，点击顶部 Outline 打开真实目录，分别检查目录栏和 Thumbnails 缩略图栏的拖动收起/展开。

## Risks and remaining work

实际 WebView2 交互待用户验收；本轮不修改 Rust 或生成安装包。

## Next action

等待用户用 `sidebar-outline-review.pdf` 的 Outline 与 Thumbnails，以及 Markdown 目录验收 70% 延后收起；同一目标在本会话继续，认可后归档。

## Outcome

实现、自动验证与可检查版本已交付；本地提交主题 `feat: make Markdown outline resizable and collapsible`，哈希以 Git 历史为准。实际视觉/交互尚待用户，保持活动任务；独立需求在本目标结束后新建会话。

续接修订提交主题 `feat: unify sidebar minimum width and drag-to-collapse`，哈希以 Git 历史为准；本目标仍待用户最终验收。

最新修订提交主题 `fix: delay sidebar collapse and cover PDF outline`，修正 70% 方向并提供可验收的目录样本，哈希以 Git 历史为准；实际桌面验收仍待用户。
