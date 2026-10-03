# Markdown editing stability

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-03`
- Last updated: `2026-10-03`
- Base branch: `master`
- Base commit: `73d1be8`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

解决用户反馈的 Markdown 输入、换行、光标和选中文字不顺手的问题，先修复代码中已定位的编辑器随每次内容更新重建的缺陷。

## Related context

- [产品契约](../../PRODUCT.md#markdown)
- [Markdown 架构](../../ARCHITECTURE.md#markdown-path)
- [开发与验证](../../DEVELOPMENT.md)
- [编辑器容器](../../../reader/src/documents/markdown/MarkdownEditor.tsx)
- [Crepe 包装组件](../../../reader/src/documents/markdown/MilkdownCrepe.tsx)

## Current behavior

- 用户反馈：MD 编辑体验很糟糕，主要是输入、换行、光标或选中文字不顺手。
- 2026-10-03 新反馈：选中内容时页面会偏移、向上跳一下。浏览器功能测试已独立复现第一轮修复版仍有此问题；H1 开头的正文坐标从 211.375px 变成 176.375px，上移 35px。
- 修复前：`MarkdownEditor` 将每次编辑结果写入 `workingText`，再作为 `value` 传入 Crepe 包装组件；后者的创建/销毁 effect 依赖 `[value]`，因此内容变化会销毁整个编辑器和撤销历史。
- 修复前：再次点击已激活的 Rendered 按钮仍增加 `crepeVersion` 并强制重新挂载。
- 初始工作树干净；现有 PDF 目录待验收任务与本任务无关。

## Expected behavior

- 连续输入、换行、选择和格式编辑时保持当前编辑器实例、焦点和选区，保留同次编辑的撤销历史。
- 重复选择当前模式不重置编辑器；从源码返回所见即所得及明确放弃修改时加载最新目标内容。
- 异步初始化及卸载不会让旧实例继续发布修改或影响新实例。

## Scope

Markdown 编辑器生命周期、模式切换保护、选择文字时滚动稳定性、相关回归测试及配套文档。允许添加用于真实 React 组件生命周期测试的开发依赖；不增加生产依赖。

## Out of scope

更换编辑引擎、重新设计工具栏/主题、PDF、安装包发布、跨模式撤销历史迁移。

## Constraints and decisions

- Codex 已定位具体修复点，直接实现；不调用 Pi。
- 保留现有主题、块控件选择和显式保存行为。
- 自动化验证针对组件生命周期；中文输入法和真实桌面交互由用户验收，不自行截图或桌面自动化验收。

## Acceptance criteria

- [x] 编辑结果回传和回调更新不创建第二个编辑器实例。
- [x] 重复点击当前模式不重建；源码切回、放弃修改按需重新加载。
- [x] 初始化期间卸载和 React StrictMode 清理无旧实例回调或重复销毁。
- [x] 真实引擎中，H1–H6 开头和已滚动文档的鼠标选区变化不改变正文坐标与滚动位置。
- [x] 回归测试、前端完整测试、类型检查/生产构建和文档检查通过。
- [ ] 启动可检查开发版，用户验收连续中英文输入、换行、选区及撤销。
- [x] 检查完整 diff；代码、测试和文档纳入同一提交 `fix: stabilize markdown editing and text selection`，提交后核对工作树。

## Progress

- [x] 检查 Git、当前文档及 Markdown 实现，收集用户问题类别。
- [x] 原实现运行前 6 项回归测试全部失败；内容更新实例数 2、连续两次更新实例数 3、重复 Rendered 点击实例数 2，另复现旧回调与重复清理。
- [x] 改为挂载时初始化、最新回调引用、异步生命周期串行化、卸载后禁发事件；重复选择当前模式直接返回。
- [x] 添加开发依赖 jsdom 与 8 项组件回归测试，涵盖源码返回、最新内容保存和放弃修改。
- [x] 自动化验证并启动用户验收版本。
- [x] 复现选区上跳；首标题选择器排除光标/widget 装饰节点，新增浏览器功能回归测试，9 项通过。

## Discoveries

- 修复前的现有测试仅覆盖 Markdown 目录、保存修订等纯逻辑，没有覆盖 React/Crepe 生命周期。
- 应用使用 React StrictMode，初始化/清理需要考虑异步创建与开发模式 effect 重放。
- Crepe 的虚拟光标是插入在文档最前面的装饰元素，选中文字时会移除。原首标题 `:first-child` 样式因此切换，H1 的 35px 顶部间距消失，导致全文上移。使用过滤装饰节点的 `:nth-child(1 of ...)` 后无需禁用浮动工具栏或虚拟光标。

## Verification

- 定向回归测试 — 原实现前 6 项失败；修复后前 6 项通过，随后新增 2 项随完整测试通过。
- `pnpm --dir reader test` — passed；16 个文件、108 项测试通过（含新增 8 项）。Node 发出 localStorage 实验性警告，未影响测试。
- `pnpm --dir reader build` — passed；TypeScript 与 1170 个模块生产构建通过，仅既有大 chunk 警告。
- `pnpm --dir reader test:browser` — passed；9 项真实 Edge 功能测试通过，只模拟文件接口，涵盖六级首标题、滚动位置、普通标题间距、连续输入与撤销/重做。原样式定向 H1 测试失败差值 35px；修复后通过。早期测试 localhost 访问超时，改用独立 IPv4 服务后可复现；中部滚动用例改用确实超出视口的第 26 段。
- 选区修复后完整前端测试和构建已重跑通过；不生成截图、视频或 trace，真实桌面验收仍由用户执行。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — passed；25 份文档、2 项活动任务、7 项归档任务、2 项决策。
- `git diff --check` — passed。
- Tauri 开发构建 — passed；`dev` 编译完成并启动 `reader/src-tauri/target/debug/reader.exe`，进程 ID 30008，原生窗口句柄非零。修复模块 HTTP 200 且含 `lifecycleRef` 与 `initialValueRef`；启动日志未记录前端初始化错误，不代表视觉验收。
- 最终开发版重新启动 — passed；进程 ID 50360，原生窗口句柄非零；CSS 模块 HTTP 200，包含过滤虚拟光标的首标题选择器。日志为 `reader/markdown-selection-dev.log` 与 `reader/markdown-selection-dev-error.log`。早先验收进程已经退出，当前新版已重新启动。
- Rust 与安装包：本轮不修改，除非发现相应问题，否则不重跑。

## User acceptance

waiting。已启动开发版，传入临时文件 `C:\Users\fanq1\AppData\Local\Temp\reader-md-editing-review-20261003.md`。使用临时配置 `C:\Users\fanq1\AppData\Local\Temp\reader-markdown-review-20261003.json`，仅覆盖 identifier 为 `com.earendil.reader.markdown-review`，与已运行的安装版并存。启动日志为 `reader/markdown-editing-dev.log` 和 `reader/markdown-editing-dev-error.log`（不纳入 Git）。

- 连续中英文输入、在段落中间移动光标并回车换行。
- 鼠标选中文字后替换，Ctrl+Z 撤销。
- 在文档顶部和滚动后反复选中文字、取消选区，确认页面不再向上跳。
- 重复点击 Rendered 后继续编辑；Source 修改后返回 Rendered 检查内容。

## Risks and remaining work

- 已定位的生命周期问题不能证明涵盖用户所有编辑体验问题，修复后仍需真实桌面反馈。
- 跨源码/所见即所得切换仍按原设计重建，不承诺跨模式撤销历史。

## Next action

收集用户对已启动最新版的输入、选区跳动和撤销反馈；若通过则更新用户验收、归档任务，否则在本任务继续复现修复。

## Outcome

生命周期与选区跳动修复、自动化验证均完成，最新验收版已启动；提交主题为 `fix: stabilize markdown editing and text selection`。等待用户真实桌面复验，本任务继续本会话，不并入其他独立需求。
