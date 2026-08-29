# 新标签页

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-08-29`
- Last updated: `2026-08-29`
- Base branch: `master`
- Base commit: `418ff58`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

为 Reader 增加真实的“新标签页”状态，使无文件启动、关闭主窗口中的最后一个标签以及点击标签栏右侧新增的加号按钮时，窗口始终有一个可见且可操作的新标签页。

## Related context

- [产品行为](../../PRODUCT.md)
- [工作区、标签与窗口结构](../../ARCHITECTURE.md#workspace-tabs-and-windows)
- [开发与验证命令](../../DEVELOPMENT.md)
- [Rust 工作区模型](../../../reader/src-tauri/src/workspace.rs)
- [Tauri 标签命令](../../../reader/src-tauri/src/commands.rs)
- [前端工作区 store](../../../reader/src/workspace/store.ts)
- [标签栏组件](../../../reader/src/components/TabStrip.tsx)
- [应用内容路由](../../../reader/src/app/App.tsx)

## Current behavior

- 无文件参数启动时主窗口没有标签，内容区显示独立空状态。
- 主窗口最后一个标签关闭后标签栏为空，内容区显示独立空状态。
- 标签栏没有新增标签按钮，用户只能通过系统文件打开或拖放创建文件标签。
- 每个 `WindowTab` 都必须引用一个 `DocumentSession`，无法表达不绑定文件的新标签页。

## Expected behavior

- 无文件参数启动 Reader 时，主窗口直接显示标题为“新标签页”的活动标签及其页面。
- 关闭主窗口最后一个标签后，自动创建并显示一个新的“新标签页”。
- 标签栏所有现有标签的右侧增加固定加号按钮；点击后追加并聚焦“新标签页”。
- 从新标签页打开文件时复用当前新标签槽位，不留下无意义的空白标签。
- 带文件参数启动仍直接显示目标文件，不额外创建新标签页。
- 已有文件标签的切换、关闭、排序、拖出和跨窗口停靠行为保持不变；非主窗口最后一个标签关闭后仍按现有契约关闭该原生窗口。

## Scope

- Rust 工作区中的无文档标签表达、创建命令、启动与关闭兜底、序列化兼容及单元测试。
- TypeScript 镜像类型、工作区 action、标签栏加号与新标签图标、内容路由和新标签页视觉状态。
- 对应产品、架构、状态、变更日志和任务文档。

## Out of scope

- 不新增主页、文件夹浏览器、最近文件管理页、快捷键或偏好设置。
- 不改变非主窗口关闭最后一个标签时关闭窗口的既有行为。
- 不重新设计整个标题栏或文件标签样式。

## Constraints and decisions

- 新标签页由 Rust 全局工作区持有，参与标签排序、聚焦、拖动和会话序列化；不能只在前端伪造。
- `WindowTab.document_id` 改为可空；`null` 明确表示新标签页，已有持久化 JSON 中的字符串文档 ID 保持可反序列化。
- 主窗口在显式关闭最后一个标签后自动补一个新标签；非主窗口维持关闭窗口逻辑。
- 文件选择和 Markdown 保存位置使用 Tauri 官方原生 dialog plugin，只授予 `open`/`save` 最小能力；文件读写仍由既有 Rust 命令边界执行。
- Codex 已定位到具体跨层修改点，本任务直接实现，不调用 Pi。

2026-08-29 用户验收反馈扩充当前目标：

- 新标签页上方提供“打开文件”和“新建 md”两个主要操作按钮。
- 页面下方列出最近打开的文件，并保持清晰、美观的层级和交互状态。
- “新建 md”不预先选择位置；它立即进入未命名编辑状态，首次保存时再显示原生保存对话框。

## Acceptance criteria

- [ ] 无文件启动时出现一个活动的“新标签页”，内容区显示对应页面。
- [ ] 关闭主窗口最后一个文件标签或新标签后，仍显示一个新的“新标签页”。
- [ ] 点击标签右侧加号会新增并聚焦“新标签页”，连续点击可创建多个。
- [ ] 在活动新标签页上打开文件时，该槽位转换为文件标签；带文件参数启动不出现多余新标签。
- [ ] “打开文件”显示原生文件选择器，只允许选择 Reader 支持的 PDF/Markdown 文件，并在当前窗口打开。
- [ ] “新建 md”立即在当前新标签槽位进入未命名 Markdown 编辑器，不预先询问路径，也不提前写入磁盘。
- [ ] 未命名 Markdown 首次保存时显示原生保存对话框；取消保存时保留未命名标签和编辑内容，若保存由关闭流程触发则同时取消关闭。
- [ ] 最近文件跨普通启动保留，按最近使用排序；点击可重新打开，空列表有明确但克制的提示。
- [ ] 新标签页的按钮、最近文件和空状态在常用窗口宽度下层级清晰、间距一致，没有溢出或错位。
- [ ] 文件标签现有关闭保护、排序和跨窗口拖动不回归；非主窗口最后标签关闭仍关闭窗口。
- [ ] 前端测试/构建、Rust 测试/格式/Clippy 与文档检查通过。
- [ ] 用户完成本次视觉和交互检查后，任务文档归档且工作树形成一个连贯本地提交并保持干净。

## Progress

- [x] 恢复 Git、项目状态、产品契约和标签实现上下文。
- [x] 确定可空文档引用的新标签数据模型与三条触发路径。
- [x] 实现前后端行为和自动化测试。
- [x] 更新产品与状态文档，完成自动化验证。
- [x] 启动可检查版本并等待用户视觉验收。
- [x] 记录用户对操作入口、最近文件和视觉层级的验收反馈。
- [x] 实现文件对话框、未命名 Markdown 首次保存和最近文件模型。
- [x] 重新完成自动化验证。
- [x] 启动修订版并等待用户完成视觉与交互复验。

## Discoveries

- 当前 Rust `WindowTab.document_id` 为必填字符串，前端所有标签内容均通过该字段查找文档；新增真实新标签需要同步修改 Rust/TypeScript 边界。
- `open_initial_files` 在无参数时直接返回，`close_tab` 只让主窗口留空；这两处分别对应启动与关闭最后标签的现状。
- 现有产品明确不提供主页或文件选择器，本任务仅新增标签页状态和拖放/系统打开提示。
- 代码明确禁用了普通启动时的会话自动恢复，而旧 `PRODUCT`、`ARCHITECTURE` 和 `STATUS` 仍写为自动恢复；本任务按实际代码同步修正文档。
- 原项目未安装文件对话框能力；本轮已接入 Tauri 官方 dialog plugin、前端包和最小 `open`/`save` capability。
- 未命名 Markdown 使用空路径和稳定文档 ID 的 Rust `DocumentSession`；首次保存成功后原位绑定规范化路径，不重建标签或编辑器身份。
- 最近文件保存在 webview 本地存储，最多 8 项；只记录成功打开或首次保存后的 PDF/Markdown，未命名文档不会进入列表。

## Verification

- `pnpm --dir reader test` — `passed`：11 个测试文件、89 个测试通过。
- `pnpm --dir reader build` — `passed`：TypeScript 与 Vite 生产构建通过，1165 个模块完成转换。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml` — `passed`：41 个测试通过；普通 PowerShell 首次因 `RC.EXE` 不在 `PATH` 而未进入编译，随后在仓库主机的 Visual Studio Build Tools 环境中通过。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check` — `passed`。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — `passed`：Visual Studio Build Tools 环境，零警告。
- `pnpm --dir reader tauri dev` — `running`：调试版 `reader.exe` 已启动，Vite 本地入口返回 HTTP 200，等待用户复验。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — `passed`：22 个 Markdown 文件、1 个活动任务、5 个归档任务和 2 个决策记录通过检查。

2026-08-29 用户反馈修订：

- `pnpm --dir reader test` — `passed`：14 个测试文件、96 个测试通过；覆盖最近文件、Markdown 保存扩展名和首次保存取消关闭。
- `pnpm --dir reader build` — `passed`：TypeScript 与 Vite 生产构建通过，1168 个模块完成转换；仅有既有大 chunk 警告。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml` — `passed`：44 个测试通过；覆盖未命名 Markdown 创建、首次保存身份保持与保存目标约束。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check` — `passed`。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — `passed`：Visual Studio Build Tools 环境，零警告。

## User acceptance

首轮 `feedback_received`：用户要求新标签页增加“打开文件”“新建 md”按钮，并在下方美观地列出最近文件。随后明确“新建 md”不得预先选择位置，而应在首次保存时选择。首轮检查清单由本轮修订后的新清单替代。

上一版已通过 `pnpm --dir reader tauri dev` 启动；修订版完成后重新启动并提供检查清单。

1. 新标签页上方的“打开文件”“新建 md”两个操作卡片层级清晰，下方最近文件与空状态间距、对齐和悬停状态自然；窄窗口下两个操作改为纵向排列且无溢出。
2. 点击“打开文件”出现原生选择器，只显示 PDF/Markdown；选中文件后当前新标签原位变为文件标签，该文件出现在最近文件首位。
3. 点击“新建 md”后不出现路径选择器，当前新标签立即变为“未命名.md”编辑器；输入内容后按 `Ctrl+S` 才出现原生保存对话框。
4. 在首次保存对话框中取消：未命名标签、内容和未保存状态均保留；再次保存并选择位置后，标签改为真实文件名，最近文件同步出现该文件。
5. 新增一个未命名 Markdown 并尝试关闭，选择“Save”后再取消原生保存对话框；该标签不能被关闭，内容仍保留。
6. 关闭并重新启动 Reader，最近文件仍存在且点击可重新打开。
7. 最后逐个关闭主窗口中的全部标签；关闭最后一个后窗口不空白，而是立即补回新的“新标签页”。

## Risks and remaining work

- 最近文件将保存在 webview 本地存储中；卸载、清除应用数据或手动清理存储会重置列表。
- 视觉与交互在用户复验前不能视为通过。

## Next action

启动修订版供用户按上述清单完成视觉与交互复验；收到反馈后归档任务。

## Outcome

尚未完成。
