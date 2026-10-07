# 全面界面重做

- Status: `done`
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

原界面采用操作卡片和一行文字工具。墨绿/圆角首轮被用户明确否定；随后中性现代桌面方向的整体重做提交为 `f470e84`，108 项前端与 37 项浏览器回归通过，但用户未验收。用户继续提出图标、标签底线、工具位置、输出入口、多余文案、Markdown 浮层与模式取舍八点反馈，上一轮提交为 `bbe5b01`。当前继续处理任务栏图标、近期列表、MD 工具与块间距四点反馈。

## Expected behavior

- 首页只保留软件名称、文件操作、最近文件和必要空状态，宽窗口左右、窄窗口上下排列；最近文件行约 48px，移除格式列，显示打开时间和已知大小，旧未知值用“—”；记录不设数量上限，长列表可滚动。
- 软件、PDF/MD 文件图标采用 Bootstrap Icons 1.13.1，本地保留 MIT 许可，应用内和 Windows 资源使用同一 SVG 源。
- 激活标签无底部强调线；删除 Markdown 和标注的工作区说明标签。
- PDF 顶部为 44px 阅读工具行；标注和页面操作位于右侧 46px 竖栏，短窗口可纵向滚动。
- 两种文档共享右上角打印与保存，位置、图形、文字及状态一致；窄窗口仍可见。
- Markdown 选字不显示格式浮层；右侧用同源 Bootstrap 图标提供六种行内格式、正文/六级标题、引用、三种列表、代码/公式块、表格、图片与分隔线。源码模式禁用渲染格式按钮，短窗口可滚动。
- 引用竖条和文字间隔 12px，代码/公式拥有始终可见的 28px 工具区与均衡的 12px 内容内边距。
- 应用 ICO 256px 首帧供 Tauri 解码，标题栏用 SVG；原有多尺寸和关联文件名保留。
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
- Markdown 保留 Rendered/Source 和官方 Frame 正文/H1–H6 排版基线，按反馈局部调整引用、代码与公式块间距，跨模式撤销仍不保留。点击行显示源码适合写作，但本产品更重视稳定阅读、选字和复制，故本轮保留独立模式。
- 外置命令在编辑器创建后读取 command key，阻止鼠标按下夺走焦点，并即时回传修改；监听器按最后发布文本去重，避免快速格式修改/保存/撤销漏报。
- 打印直接读取实时编辑器文本，避免监听延迟；独立解析器保留 CodeMirror（LaTeX 的实际依赖），静态 HTML 在 iframe 打印后清理并恢复焦点。
- 原生启动日志出现此前的 `dialog.confirm not allowed. Command not found`；改用 HTML dialog 解决同一删页按钮的确认，不扩张系统权限。默认聚焦取消、Esc 可退出。

## Acceptance criteria

- [x] 落实八点反馈中已要求实施的图标、布局与文案修改。
- [x] 外置格式操作保持选区、保存和撤销；打印隔离，既有 PDF 选择/缩放回归通过。
- [x] 最近修订 111 项前端与 14 项针对性浏览器通过；既往 65 项用例记录保留；类型/生产构建验证。
- [x] 图标资源、文档链接和完整 diff 检查；连贯本地提交及干净工作树核对。
- [x] 用户于 2026-10-07 回复“很好。验收，发布，安装，并清理”，确认本轮界面结果；实际纸张打印未单独测试。

## Progress

- [x] 恢复代码/Git/当前文档，保护既有改动。
- [x] 停止 Pi、删除自动调用规则，整体重做后提交 `f470e84`。
- [x] 本轮反馈实现完成，新增相关功能回归，维护文档。
- [x] 编译/运行检查版本，打开临时 PDF 与 Markdown 样本。
- [x] 用户验收通过，补齐结果并归档。

## Discoveries

- Crepe command key 在创建之后才可使用；初始化时读取会得到 undefined，已以真实浏览器捕获并修正。
- Crepe LaTeX 依赖 CodeMirror；禁用后临时解析器无法完成初始化，已保留依赖并用 getHTML 输出静态代码。
- 立即发布外置命令后，快速撤销可能与引擎防抖前的值相同；不能再按监听器 previousMarkdown 判断，须按适配器最后发布文本去重。回归验证保存后立即撤销重新变脏。
- Tauri 注入的 window.confirm 需要额外权限；应用内模态可保留原确认边界。

## Verification

上一轮 `bbe5b01` 的结果：

- `pnpm --dir reader test`：16 文件、108 项通过。
- `pnpm --dir reader test:browser`：48 项通过（PDF 30、Markdown 18），真实 Edge，无截图/视频/trace。新增格式/保存/撤销、公式/链接、两模式打印、清洁状态/焦点、窄窗口和删页确认回归；原文件/写入边界模拟，实际 React/PDF.js/Milkdown 运行。
- `pnpm --dir reader build`：TypeScript 通过、生产构建通过；仅既有大 chunk 警告。
- 首页临时布局脚本 `C:\Users\fanq1\AppData\Local\Temp\reader-home-feedback-check-20261007.cjs`：330/620/1100px 下根页面无横向溢出；长文件/路径、空状态、减少动画及运行错误检查通过。此检查不代表视觉验收。
- `pnpm --dir reader generate:file-icons`：生成全部受管理图标。应用/PDF/MD 三个 ICO 均含 16/24/32/48/64/256px 帧，结构和边界有效。
- 文档和 diff 检查通过；先前中间检查因任务/STATUS 状态尚未同步失败，最终已同步。
- 图标变更触发 Tauri 开发重编译：15.76s 成功，未修改 Rust 源码。临时独立标识 `com.earendil.reader.polish20261007`，当前窗口 `Reader · 界面美化验收`，PID 10044，进程响应正常。前端已热更新，传入临时样本 `Reader-UI-feedback-20261007.pdf` / `.md`，未主动结束用户窗口。
- 原生打印对话框、实际纸张、WebView2 交互及视觉由用户确认；Rust 测试、安装包和 Explorer 安装后的图标缓存未复验。

## User acceptance

首轮被否定后已按中性桌面方向重做；本轮八点反馈中 1–7 已实现，第 8 点给出保留独立模式的建议。用户于 2026-10-07 验收最终源码 de45f91。以下保留当时检查清单，实际纸张打印没有独立测试记录：

1. 任务栏图标在当前屏幕缩放下是否清晰；新标签页近期列表行高、时间与大小是否协调。
2. PDF 右侧标注/页操作、窄窗口的工具可达性，以及已有选字/缩放。
3. MD 新图标与工具分组；正文/标题、引用、列表、代码/公式等操作，保存、撤销与源码切换。
4. MD 引用横向间距、代码与公式块的紧凑工具区/上下留白。
5. 两种文件右上角打印/保存一致；MD 在两种模式打印当前未保存内容。
6. PDF 删页确认可取消（样本副本可测试确认），窗口关闭放最后。

## Risks and remaining work

视觉与界面结果已验收，实际纸张打印未单独测试；文件大小来自最近已知快照，不主动检测外部变化，已打开 MD 保存后的大小需关闭后再打开刷新。本地图片内嵌会增加 Markdown 文件体积；外部图片仍受原有 CSP 限制，未扩张权限。新版本打包/安装结果见发布归档任务。新功能建议为固定常用文件、恢复阅读位置、搜索最近文件，未自动扩大实现范围。

## Next action

无；界面任务已结束，用户追加的发布/安装/清理见 [发布归档任务](2026-10-07-release-install-cleanup.md)，独立需求以后新建会话。

## Outcome

最近文件不限数量与 MD 图标加载修复完成，应用源码 `de45f91` 已由用户验收（2026-10-07）。当前本地提交主题 `fix: retain recent history and render Markdown icons`，哈希以 Git 历史为准。交付前检查文档、完整 diff 与工作树；本轮未调用 Pi。

## Further acceptance feedback (2026-10-07)

任务栏图标模糊；最近文件行太高、格式列无用，需要打开时间和大小；MD 竖栏图标与覆盖不足；引用间距和代码/公式上下留白失衡。本轮范围为图标资源生成、最近文件持久化/UI、Markdown 工具与块间距，保留原有保存、选择、打印和 PDF 行为。验收要求：图标首帧为高分辨率，近期记录兼容旧数据且不虚构元数据，紧凑行无横向溢出，常用 Markdown 结构可操作/保存/撤销，引用和代码/公式间距稳定。验证使用元数据单测、真实浏览器功能/几何回归、类型/构建、图标解析与文档检查；视觉由用户完成。

### Current feedback implementation and verification

- 代码已完成：ICO 首帧排序与矢量标题栏、近期时间/大小与紧凑行、同源 MD 图标与常用结构命令、引用/代码/公式间距。
- 实际 Tauri 2.6.3 图标上下文读取 ICO 第 0 帧；原转换器把 32px 放首位，生成器现在保留全部帧并把 256px 放首位。Windows 原生 WM_GETICON/GetIconInfo 读取运行窗口 small icon 的位图为 `256x256`；Tao 本来只设置 small icon，big 返回空，不代表资源生成失败。未截图或自动视觉验收。
- 新工具使用已有 Milkdown schemas/commands，不增加依赖。空选区代码支持 stored marks。图片上传默认 blob URL 不可持久化，改为 FileReader 内嵌；浏览器回归验证立即保存和切换后图片仍存在。
- 上传图片后快速保存暴露旧的延迟监听问题：图片 DOM 已更新但 working text 尚未更新。命令桥 flush 在保存/源码切换前发布实时内容，保留初始清洁与版本保护。
- `pnpm --dir reader test`：16 文件、110 项通过。
- `pnpm --dir reader test:browser`：65 个用例中 64 通过，新增立即保存用例误按未转义下划线判断合法 Markdown 序列化；改用普通文本输入后 `-- markdown-blocks.spec.ts --grep 'immediate save'` 单项通过。全部 65 个不同用例已通过（PDF 30、MD 32、首页 3）。没有修改实现来迁就断言；无截图、视频、trace。
- 新增覆盖：九种块操作的保存/撤销、标题/正文与源模式禁用、空选区代码输入、图片保存和模式切换、立即保存/模式切换、块间距几何；首页 330/620/1100px 行高 48px、元数据、长路径和无横向溢出。近期单测覆盖旧数据、无效元数据、重新打开保留大小、快照大小刷新不改顺序/时间。
- `pnpm --dir reader build`：TypeScript 通过，1196 个模块，生产构建通过，仅既有大 chunk 警告。
- 图标生成和 ICO 结构验证通过：应用首帧 256px，三套 ICO 均保留 16/24/32/48/64/256px。恢复此次转换器重新排列但语义不变的 ICNS 输出，避免无关二进制 diff。
- Tauri 开发资源重编译 27.31s 成功，检查窗口 `Reader · 界面美化验收`，原生图标核对时 PID 35056，后续运行 PID 32388（不作为长期身份），进程响应正常。未改 Rust 源码，未重复 Rust 测试或安装包发布；现有独立检查窗口运行中。
- 本轮未调用 Pi（新增会话 ID：无）；历史已停止会话记录保留。视觉和实际 DPI 清晰度待用户验收，同一任务继续当前会话。

- 最终文档内部链接与任务状态检查通过（28 文档、3 活动任务）；SVG 资源可解析，完整 diff/空白检查通过。运行检查窗口已传入独立临时排版样本 `C:\Users\fanq1\AppData\Local\Temp\Reader-spacing-252e9a88.md`，未改写用户文件。

## Recent file capacity and icon follow-up

用户要求最近文件不限制条数，并指出 MD 图标全部显示方块。核查 `7106831` 初始功能提交和当前代码：均为 MAX_RECENT_FILES=8，保存/加载都会截断。本轮取消数量截断，保留路径去重、排序和 v1 兼容；加载改用 Map，避免列表增长后反复复制。SVG 在 Vite 开发服务中已内联为含单引号的 data URL，当前 CSS url 未加引号，浏览器丢弃属性；真实 Edge 的 16 个工具遮罩均为 none。范围为近期存储函数与相应文档、两处遮罩引用和回归测试；不修改编辑/PDF 回调、Rust、安装或权限。验收：超过 8 条持久化/重载仍保留，列表可滚动到末项；全部 16 个遮罩有效且图片可解码。运行针对性单测和浏览器回归，再做类型/构建与 diff/文档检查。旧截断记录无法从现有最近列表自动恢复，视觉仍由用户确认。


### Capacity and mask results

- Git 历史定位 `7106831 feat: add new tab file actions` 首次引入 MAX_RECENT_FILES=8；加载和记忆函数都会截断。本轮移除常量/截断，v1 存储键不变，Map 加载保留顺序、去重和重复项元数据补齐。
- 通过 `http://localhost:1420/src/assets/icons/type-bold.svg?import` 可复现 SVG 被内联为含单引号的 data URL。修复前真实 Edge 的 maskImage 为 none；两处 CSS url 加双引号后 16 个遮罩全部有效，资源均成功解码。上一轮功能/几何测试遗漏了这个检查，现已补回归。
- `pnpm --dir reader test src/workspace/recentFiles.test.ts`：7 项通过；101 条存储/重载保留全部历史，重复路径只保留最新位置并补齐元数据。
- `pnpm --dir reader test:browser -- markdown-tools.spec.ts new-tab.spec.ts`：14 项全部通过，含新增 16 遮罩资源加载检查和 40 条列表滚动到末项/点击回归。无截图、视频或 trace。
- `pnpm --dir reader test`：16 文件、111 项通过。
- 生产类型检查发现新单测 Array.at 超出现有目标库；改用已有数组索引，不扩张 tsconfig。最终 `pnpm --dir reader build` 已通过 TypeScript 与生产构建，1196 个模块，仅既有大 chunk 警告。
- 原生检查窗口 PID 32388 `Reader · 界面美化验收` 仍响应正常；前端热更新，未主动关闭或重启用户窗口。本轮未改 Rust/安装包，未重复无关 PDF/Rust 测试；实际图标观感由用户确认。
- Pi 未调用，会话 ID 无。旧限制已截掉的历史不在现有记录中，不能自动恢复；重新打开时正常加入，后续不再按条数删除。

- 最终文档检查通过（28 文档、3 活动任务），完整 diff 与空白检查通过；形成一个连贯的本地修复提交并核对干净工作树。用户只需检查 MD 右侧是否恢复图形、最近列表是否保留并可访问第九条之后的记录。同一目标继续本会话，独立需求新建会话。

## Final acceptance

用户于 2026-10-07 明确回复“很好。验收，发布，安装，并清理，现在项目文件夹超级大”。本目标验收完成并归档；接续发布/安装/清理单独记录，源码基线 de45f91。先前的 waiting 与未安装状态均为当时记录，不代表最终状态。实际纸张打印仍未单独验证。本轮未调用 Pi，会话 ID 无。
