# 全面界面重做

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-07`
- Last updated: `2026-10-07`
- Base branch: `master`
- Base commit: `a768199`
- Implementation: `Codex`
- Pi session ID: `reader-interface-polish-20261007-1100`（用户要求停止，退出码 -1，停止时无代码 diff）

## Goal

重做 Reader 首页、标签栏和 PDF/Markdown 工作区的视觉与操作层次，形成中性灰白、克制配色、紧凑清晰的现代桌面工具。

## Related context

- [产品契约](../../PRODUCT.md)：文档行为与界面方向。
- [开发与验证](../../DEVELOPMENT.md)：测试与开发窗口启动。
- [代理规则](../../../AGENTS.md)：默认由 Codex 实现，不自动调用 Pi。
- [应用样式](../../../reader/src/styles.css)：窗口、首页和工作区。
- [首页](../../../reader/src/components/NewTabPage.tsx)、[图标](../../../reader/src/components/UiIcon.tsx)。
- [PDF 工具栏](../../../reader/src/documents/pdf/PdfToolbar.tsx)、[侧栏](../../../reader/src/documents/pdf/PdfSidebar.tsx)。
- [Markdown 工具栏](../../../reader/src/documents/markdown/MarkdownToolbar.tsx)、[目录](../../../reader/src/documents/markdown/MarkdownOutline.tsx)、[主题](../../../reader/src/documents/markdown/milkdownTheme.css)。

## Current behavior

基线工作树干净。原首页为两张操作卡片和最近文件，PDF 所有工具集中在单行且使用文字缩写。Codex 首轮采用墨绿、圆角卡片、图标底座和阴影，用户明确否定，要求整体重做；首轮未提交，不作为验收结果。

## Expected behavior

- 首页宽窗口左右分区：左侧品牌与文件操作，右侧最近文档列表；窄窗口上下排列。
- 最近文档显示文件类型、名称、位置和格式，长文本截断；空状态清晰。
- PDF 阅读/缩放/搜索/输出与标注/页面操作分成两行，图标配必要文字，两行在窄窗口独立横向滚动。
- PDF 与 Markdown 目录具有清晰标题和数量，Markdown 使用下划线模式标签。
- 工作区与文件行直角，交互控件圆角最多 2px；没有装饰性阴影、彩色图标底座或卡片位移。

## Scope

首页、共享内联 SVG 图标、PDF 工具栏/侧栏、Markdown 工具栏/目录/主题与全局 CSS。允许重组既有 UI 控件与布局。同步维护产品、状态、变更日志和用户明确要求删除的 Pi 自动调用规则。

## Out of scope

Rust、原生窗口控制/标签拖动逻辑、PDF 选择与渲染引擎、编辑器生命周期、文件/批注写入、依赖、暗色模式、打包安装。不并入 PDF 目录或 MSI 独立验收任务。不截图或以桌面自动化执行视觉验收。

## Constraints and decisions

- 用户选择“现代桌面工具：中性灰白、克制配色、紧凑而清晰的操作层次”，指出未经考究的圆角廉价；用对齐、分隔线和文字层次组织界面。
- 用户说明 GLM 活动结束，要求停用 Pi 并删除规则；已停止进程，自动调用/免费时段/固定模型规则从当前项目文档删除。后续默认 Codex 实现，只有用户明确要求才调用 Pi。
- 标题栏 36px、标签 28px/28–220px、窗口按钮 46px 和拖放坐标契约保持。
- PDF 所有回调、禁用条件、搜索/页码行为、页面几何和选区实现保持；原 title/输入 aria-label 保留，图标按钮带名称，模式按钮带 aria-pressed。
- PDF 上行 44px、下行 40px，合计含边界 85px；滚动不改变工具栏高度。
- Markdown 保留 Rendered/Source/Save 名称和行为，H1–H6、正文、列表、表格、代码和首标题稳定规则保持。仅调整编辑控件颜色、边角和浮动表面轮廓，不改文档排版。
- 控件最多 2px 圆角；工作区与文件行直角；120ms 颜色反馈，遵循 reduced motion。
- 所有实现由 Codex 完成，无新增生产依赖、网络字体或调试代码。

## Acceptance criteria

- [x] 完成首页和工具栏结构重做，统一中性界面和清晰的功能层次。
- [x] 自动化确认既有编辑/选字/缩放回归通过，小窗口可访问完整控件。
- [x] 108 项前端测试、37 项真实浏览器回归、TypeScript 与生产构建通过。
- [x] 文档链接与完整 diff 检查；连贯本地提交，提交后核对干净工作树。
- [ ] 用户完成视觉与真实 WebView2 交互验收。

## Progress

- [x] 恢复代码/Git/当前文档，明确目标与范围。
- [x] 按用户要求停止 Pi、删除自动调用规则。
- [x] 首轮被否定后重做结构与视觉；保留用户明确的方向。
- [x] 独立验证最终重做版本，运行版本已热更新。
- [ ] 等待用户视觉与交互反馈，确认后归档。

## Discoveries

- 原生 Snap overlay 固定依赖标题栏和按钮尺寸；仅改变外观。
- 浏览器回归依赖 PDF title 和 Markdown 按钮名称；新增 SVG 不贡献可访问名称。
- 原缩略图 138px 画布加内边距/2px 边界会超过 148px 控件宽度，改为 1px 边界后内容正好适配。

## Verification

以下为整体重做后重新运行的最终结果：

- `pnpm --dir reader test`：16 个文件、108 项通过。
- `pnpm --dir reader test:browser`：37 项通过（PDF 28、Markdown 9），33.2s；真实 Edge，无截图/视频/trace。
- `pnpm --dir reader build`：TypeScript 通过，1173 个模块，生产构建通过，仅既有大 chunk 警告。
- 临时 Edge 布局脚本 `C:\Users\fanq1\AppData\Local\Temp\reader-polish-layout-check-20261007.cjs`：330/620/1100px 下首页、Markdown 工具栏及根页面均不横向溢出；PDF 保留 20 个有名称的按钮，两行可分别滚动访问打印和删除页。长文件名/路径、空状态与 reduced motion 通过，无页面运行错误。此检查不替代视觉验收。
- `./scripts/check-docs.ps1` 与 `git diff --check`：最终检查通过。首轮任务 Related context 使用纯代码文本导致链接检查失败，已改为可解析的相对链接。
- Tauri 开发编译通过，临时配置 `C:\Users\fanq1\AppData\Local\Temp\reader-interface-polish-20261007.tauri.json` 使用独立标识 `com.earendil.reader.polish20261007`。运行窗口标题 `Reader · 界面美化验收`，PID 28904，路径 `reader/src-tauri/target/debug/reader.exe`。最终前端模块/CSS 已热更新，无新增前端初始化错误记录。
- 未修改 Rust 源码，未重复 Rust 测试或生成安装包。

## User acceptance

用户反馈：“重弄，而不是做一些修修补补”“各种毫无考究的圆角显得非常廉价”；随后选择现代中性桌面工具方向。该反馈已用于本次重做。

最终版本 `waiting`。检查：

1. 首页双区布局、最近文档行和窄窗口排列是否满意。
2. PDF 两行工具栏、标注文字、目录/缩略图及窗口缩小时的滚动；选字与缩放是否正常。
3. Markdown 模式标签、保存状态、目录及连续编辑是否正常。
4. 标签切换、最大化/恢复；关闭按钮放最后。

## Risks and remaining work

最终视觉/真实 WebView2 交互待用户验收；已安装版本仍为先前构建。本次没有截图或安装包更新。

## Next action

等待用户检查已运行的整体重做版本；在本任务继续处理反馈，确认验收后补齐结果并归档。

## Outcome

整体重做与自动化验证完成，等待用户验收。本地提交主题 `style: rebuild Reader workspaces and retire automatic Pi routing`，哈希以 Git 历史为准。
