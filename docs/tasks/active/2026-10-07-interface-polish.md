# 全面界面重做

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-07`
- Last updated: `2026-10-07`
- Base branch: `master`
- Base commit: `a768199`
- Implementation: `Codex`
- Pi session ID: `reader-interface-polish-20261007-1100`（先前被用户要求停止，退出码 -1，停止时无代码 diff；本轮未调用）

## Goal

重做 Reader 首页、标签栏和 PDF/Markdown 工作区的视觉与操作层次，形成中性灰白、克制配色、紧凑清晰的现代桌面工具，并落实本任务的用户验收反馈。

## Related context

- [产品契约](../../PRODUCT.md)：文档行为与界面方向。
- [模块结构](../../ARCHITECTURE.md)：编辑器命令桥、打印快照与输出控件。
- [开发与验证](../../DEVELOPMENT.md)：测试、图标生成与窗口启动。
- [代理规则](../../../AGENTS.md)：默认 Codex，不自动调用 Pi。
- [应用样式](../../../reader/src/styles.css)、[首页](../../../reader/src/components/NewTabPage.tsx)。
- [图标源及许可](../../../reader/src/assets/icons/README.md)、[生成器](../../../scripts/generate-file-association-icons.mjs)。
- [共享输出控件](../../../reader/src/components/DocumentActions.tsx)、[竖栏](../../../reader/src/components/DocumentToolRail.tsx)。
- [PDF 工具](../../../reader/src/documents/pdf/PdfToolbar.tsx)、[查看器](../../../reader/src/documents/pdf/PdfViewer.tsx)、[删页确认](../../../reader/src/documents/pdf/PdfDeleteDialog.tsx)。
- [Markdown 编辑器](../../../reader/src/documents/markdown/MarkdownEditor.tsx)、[引擎适配](../../../reader/src/documents/markdown/MilkdownCrepe.tsx)、[打印](../../../reader/src/documents/markdown/printMarkdown.ts)。

## Current behavior

原界面采用操作卡片和一行文字工具。墨绿/圆角首轮被用户明确否定；随后中性现代桌面方向的整体重做提交为 `f470e84`，108 项前端与 37 项浏览器回归通过，但用户未验收。用户继续提出图标、标签底线、工具位置、输出入口、多余文案、Markdown 浮层与模式取舍八点反馈，本轮是同一目标的修订。

## Expected behavior

- 首页只保留软件名称、文件操作、最近文件和必要空状态，宽窗口左右、窄窗口上下排列。
- 软件、PDF/MD 文件图标采用 Bootstrap Icons 1.13.1，本地保留 MIT 许可，应用内和 Windows 资源使用同一 SVG 源。
- 激活标签无底部强调线；删除 Markdown 和标注的工作区说明标签。
- PDF 顶部为 44px 阅读工具行；标注和页面操作位于右侧 46px 竖栏，短窗口可纵向滚动。
- 两种文档共享右上角打印与保存，位置、图形、文字及状态一致；窄窗口仍可见。
- Markdown 选字不显示格式浮层；右侧提供加粗、斜体、删除线、行内代码、公式和链接。源码模式禁用渲染格式按钮。
- Markdown 打印当前完整内容，包括未保存编辑；源码模式也输出排版后的正文，不更改模式、文件或编辑器。
- 删页通过应用内模态确认，取消不变更文件，确认使用原有页码和 PDFium 路径，最后一页不能删除。

## Scope

首页、图标与生成资源、共享输出/竖栏、PDF 工具和删页确认 UI、Markdown 工具/命令桥/打印、全局样式及相关文档与回归。不增加生产依赖。

## Out of scope

Rust 源码、窗口控制和标签拖动、PDF 选择/渲染引擎、文件/批注写入、暗色模式、安装包。保持编辑器挂载与保存版本保护；不改为点击行露出语法的混合引擎。新标签页新功能仅给建议。不并入 PDF 目录或 MSI 独立验收任务；不截图或桌面自动化视觉验收。

## Constraints and decisions

- 用户选择现代中性桌面方向；用对齐、分隔和文字层次组织界面，工作区/文件行直角，控件最多 2px 圆角，无装饰性阴影。
- 用户说明 GLM 活动结束并要求删除 Pi 规则；先前已停止进程，项目默认 Codex，只有明确请求才调用 Pi。
- 标题栏 36px、标签 28px/28–220px、窗口按钮 46px 的原生几何契约不变。
- PDF 既有业务回调、搜索、页码和选择行为保持；输出共用中文名称，竖栏按钮保留原工具 title。
- Markdown 保留 Rendered/Source 和官方 Frame 正文/H1–H6 排版，跨模式撤销仍不保留。点击行显示源码适合写作，但本产品更重视稳定阅读、选字和复制，故本轮保留独立模式。
- 外置命令在编辑器创建后读取 command key，阻止鼠标按下夺走焦点，并即时回传修改；监听器按最后发布文本去重，避免快速格式修改/保存/撤销漏报。
- 打印直接读取实时编辑器文本，避免监听延迟；独立解析器保留 CodeMirror（LaTeX 的实际依赖），静态 HTML 在 iframe 打印后清理并恢复焦点。
- 原生启动日志出现此前的 `dialog.confirm not allowed. Command not found`；改用 HTML dialog 解决同一删页按钮的确认，不扩张系统权限。默认聚焦取消、Esc 可退出。

## Acceptance criteria

- [x] 落实八点反馈中已要求实施的图标、布局与文案修改。
- [x] 外置格式操作保持选区、保存和撤销；打印隔离，既有 PDF 选择/缩放回归通过。
- [x] 108 项前端、48 项真实浏览器、TypeScript 与生产构建通过。
- [x] 图标资源、文档链接和完整 diff 检查；连贯本地提交及干净工作树核对。
- [ ] 用户完成视觉与真实 WebView2 交互/打印验收。

## Progress

- [x] 恢复代码/Git/当前文档，保护既有改动。
- [x] 停止 Pi、删除自动调用规则，整体重做后提交 `f470e84`。
- [x] 本轮反馈实现完成，新增相关功能回归，维护文档。
- [x] 编译/运行检查版本，打开临时 PDF 与 Markdown 样本。
- [ ] 用户验收通过后补齐结果并归档。

## Discoveries

- Crepe command key 在创建之后才可使用；初始化时读取会得到 undefined，已以真实浏览器捕获并修正。
- Crepe LaTeX 依赖 CodeMirror；禁用后临时解析器无法完成初始化，已保留依赖并用 getHTML 输出静态代码。
- 立即发布外置命令后，快速撤销可能与引擎防抖前的值相同；不能再按监听器 previousMarkdown 判断，须按适配器最后发布文本去重。回归验证保存后立即撤销重新变脏。
- Tauri 注入的 window.confirm 需要额外权限；应用内模态可保留原确认边界。

## Verification

最终反馈修订后的结果：

- `pnpm --dir reader test`：16 文件、108 项通过。
- `pnpm --dir reader test:browser`：48 项通过（PDF 30、Markdown 18），真实 Edge，无截图/视频/trace。新增格式/保存/撤销、公式/链接、两模式打印、清洁状态/焦点、窄窗口和删页确认回归；原文件/写入边界模拟，实际 React/PDF.js/Milkdown 运行。
- `pnpm --dir reader build`：TypeScript 通过、生产构建通过；仅既有大 chunk 警告。
- 首页临时布局脚本 `C:\Users\fanq1\AppData\Local\Temp\reader-home-feedback-check-20261007.cjs`：330/620/1100px 下根页面无横向溢出；长文件/路径、空状态、减少动画及运行错误检查通过。此检查不代表视觉验收。
- `pnpm --dir reader generate:file-icons`：生成全部受管理图标。应用/PDF/MD 三个 ICO 均含 16/24/32/48/64/256px 帧，结构和边界有效。
- 文档和 diff 检查通过；先前中间检查因任务/STATUS 状态尚未同步失败，最终已同步。
- 图标变更触发 Tauri 开发重编译：15.76s 成功，未修改 Rust 源码。临时独立标识 `com.earendil.reader.polish20261007`，当前窗口 `Reader · 界面美化验收`，PID 10044，进程响应正常。前端已热更新，传入临时样本 `Reader-UI-feedback-20261007.pdf` / `.md`，未主动结束用户窗口。
- 原生打印对话框、实际纸张、WebView2 交互及视觉由用户确认；Rust 测试、安装包和 Explorer 安装后的图标缓存未复验。

## User acceptance

首轮被否定后已按中性桌面方向重做；本轮八点反馈中 1–7 已实现，第 8 点给出保留独立模式的建议。最终版本 `waiting`，只需检查：

1. 新标签页文案与软件/文件图标、激活标签无底线是否满意。
2. PDF 右侧标注/页操作、窄窗口的工具可达性，以及已有选字/缩放。
3. MD 选字无浮层；右侧格式、保存、撤销与源码切换。
4. 两种文件右上角打印/保存一致；MD 在两种模式打印当前未保存内容。
5. PDF 删页确认可取消（样本副本可测试确认），窗口关闭放最后。

## Risks and remaining work

视觉与真实 WebView2/打印待验收；已安装版本仍是此前 MSI，资源管理器图标须新安装包才能更新。新功能建议为固定常用文件、恢复阅读位置、搜索最近文件，未自动扩大实现范围。

## Next action

等待用户检查已运行版本；同一反馈继续本会话，验收通过后归档。下一个独立需求新建会话。

## Outcome

本轮实现与自动化验证完成，等待用户验收。本地提交主题 `style: refine document rails, actions and Reader icons`，哈希以 Git 历史为准。本轮未调用 Pi。
