# Repair tab drag interaction across native windows

- Status: `done`
- Owner: Codex
- Created: `2026-08-24`
- Last updated: `2026-08-24`
- Base branch: `master`
- Base commit: `bad256b`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

让标签拖动具有连续、可判断的视觉反馈，并使单标签原生窗口在鼠标释放到另一个 Reader 窗口标签栏时立即合并，不需要额外点击。

## Related context

- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`docs/DEVELOPMENT.md`](../../DEVELOPMENT.md)
- [`reader/src/components/TabStrip.tsx`](../../../reader/src/components/TabStrip.tsx)
- [`reader/src/components/tabPointerDrag.ts`](../../../reader/src/components/tabPointerDrag.ts)
- [`reader/src/components/windowDrag.ts`](../../../reader/src/components/windowDrag.ts)
- [`reader/src/workspace/store.ts`](../../../reader/src/workspace/store.ts)
- [`reader/src-tauri/src/commands.rs`](../../../reader/src-tauri/src/commands.rs)
- [`reader/src-tauri/src/lib.rs`](../../../reader/src-tauri/src/lib.rs)

## Current behavior

- 单标签窗口通过 Tauri 原生 `startDragging()` 移动；前端把该 Promise 完成误当成原生移动循环结束，停靠检测发生过早。把窗口拖到另一个标签栏并释放后不会立即合并，再点击一次被拖标签才合并。
- 多标签窗口中的标签拖动没有跟随鼠标的标签预览；释放到窗口外后新窗口固定出现在 `(120, 120)`，与释放位置无关。
- 拖动经过被原窗口或其他窗口遮挡的 Reader 窗口时，目标窗口不会抬升，用户无法确认或完成停靠。

## Expected behavior

- 单标签窗口拖动在真实鼠标左键释放后完成停靠检测；落在另一 Reader 窗口标签栏时立即合并并关闭空的来源窗口。
- 多标签拖动开始后显示跟随指针的标签预览；未命中停靠目标时，新窗口在释放位置附近生成，标签抓取点保持在鼠标附近。
- 拖动悬停在可见 Reader 窗口的标签页栏时，该窗口临时显示在前面；多标签拖动返回来源标签页栏时也会重新抬升来源。经过内容区不触发上浮，离开、取消或完成拖动后撤销临时置顶。
- 随指针移动的跨窗口标签预览或单标签来源窗口始终位于临时抬升目标之上，不被目标窗口遮挡。
- 同窗口排序、关闭、外部文件拖入和脏 Markdown 跨窗口限制保持现状。

## Scope

- React 标签指针交互和视觉反馈。
- Zustand/Tauri 拖动命令桥接。
- Windows 原生鼠标释放监测、Reader 窗口命中、悬停抬升和拖出窗口定位。
- 相关单元测试、状态文档、架构说明和变更记录。

## Out of scope

- 跨进程或跨应用标签停靠。
- 跨窗口迁移 PDF/Markdown webview 的瞬时滚动、缩放或编辑器 DOM 状态。
- 改变未保存 Markdown 禁止跨窗口移动的产品限制。

## Constraints and decisions

- 不恢复 HTML5 drag-and-drop；Tauri 的 Windows 原生文件拖放仍需保持启用。
- 单标签窗口继续使用原生窗口移动，避免用前端逐帧模拟窗口拖动。
- 悬停抬升只作用于当前 Reader 进程可见窗口的标签页栏；Windows 下按原生 Z 序选择最上层命中项，并且必须在拖动离开、结束或取消时恢复。
- 不新增生产依赖；Windows 左键状态通过最小 User32 FFI 读取，非 Windows 保留现有前端完成路径。

## Acceptance criteria

- [x] 单标签窗口拖到另一 Reader 标签栏并释放后立即合并，无需第二次点击。
- [x] 标签拖动期间有跟随指针的预览；拖出后窗口出现在释放点附近。
- [x] 被遮挡的 Reader 窗口仅在指针进入其标签页栏时上浮；返回来源标签页栏会重新抬升来源，经过内容区不触发，离开或结束后不残留置顶状态。
- [x] 跟随指针的标签预览或单标签来源窗口始终位于临时上浮目标之上。
- [x] 同窗口标签排序、标签关闭、外部文件拖入和脏 Markdown 限制没有回归。
- [x] 前端测试、前端生产构建、Rust 测试、格式检查、Clippy 和文档检查通过。
- [x] 用户在真实 Windows 桌面完成本任务交互验收。
- [x] 文档已更新、提交已创建、工作树干净。

## Progress

- [x] 恢复仓库上下文并确认工作树干净。
- [x] 定位单标签延迟合并和固定窗口位置的代码根因。
- [x] 实现原生左键释放监测和拖动目标窗口临时置顶。
- [x] 实现 webview 内标签预览、跨窗口原生预览和释放点窗口定位。
- [x] 完成自动化回归和文档检查。
- [x] 把目标窗口上浮命中区从整个窗口收窄到标签页栏并完成回归验证。
- [x] 按原生 Z 序选择悬停窗口、允许多标签来源重新上浮，并保持拖动物位于目标之上。
- [x] 用同步 Win32 `SetWindowPos` 替换拖动期间的异步 topmost 状态更新。
- [x] 用户在真实 Windows 桌面完成交互验收，确认没有问题。

## Discoveries

- `TabStrip.tsx` 在单标签 `mousedown` 中执行 `startDragging().then(completeTabDrag)`；该 Promise 不能作为 Windows 真实左键释放信号。
- `commands.rs::detach_tab` 把所有新窗口位置硬编码为 `(120, 120)`。
- `commands.rs::find_dock_target` 只在完成时按全局鼠标位置命中 36 CSS px 标题栏，没有拖动中的窗口抬升逻辑。
- 新实现由后端按 16 ms 周期读取 Windows 左键和全局鼠标位置；临时置顶、拖动预览、取消、超时和完成都归属同一代际化拖动会话，旧线程不能影响新拖动。
- 多标签拖动在来源标题栏内显示 React 预览，离开后显示忽略鼠标事件的短生命周期原生预览；该辅助窗口不进入工作区、会话保存或窗口销毁广播。
- 首轮用户验收确认主要交互基本实现，同时指出整窗悬停抬升范围过大；目标行为调整为只在 36 CSS px 标签页栏内触发。
- 第二轮用户验收复现三个窗口 A/B/C：目标窗口置顶晚于拖动预览或单标签来源，导致目标反向遮住拖动物；多标签来源又被悬停候选硬排除，返回 A 标签页栏时无法重新上浮。
- Windows 悬停检测改为按原生顶层窗口 Z 序筛选命中标签页栏；单标签拖动排除随鼠标移动的来源以命中下方目标，多标签拖动保留来源以支持返回。目标置顶后重新置顶拖动载体，清理与竞态回滚同时撤销来源、目标和载体状态。
- 第三轮用户验收确认拖动载体仍会被新上浮目标遮挡。TAO 的 `set_always_on_top(true)` 只在内部标志从 `false` 变为 `true` 时调用 `SetWindowPos`；原生预览创建时已经是 topmost，因此重复调用不会重排 topmost 层，且 TAO 使用 `SWP_ASYNCWINDOWPOS`，来源与目标的实际执行顺序也不可靠。
- 拖动会话现改为直接同步调用 User32 `SetWindowPos`：目标使用 `HWND_TOPMOST` 后立即对拖动载体再次使用 `HWND_TOPMOST`，撤销时使用 `HWND_NOTOPMOST`；无需新增依赖，并保留代际竞态回滚。
- Clippy 的 `-D warnings` 暴露 `AppWorkspace::restore` 仅用于测试；生产编译增加了窄范围 `dead_code` 许可，测试用途和行为未改变。

## Verification

- `pnpm --dir reader test` — `passed`; 11 files、89 tests。
- `pnpm --dir reader build` — `passed`; TypeScript 与 Vite 生产构建完成，1164 modules transformed。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml` — `passed`; 39 tests。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check` — `passed`。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — `passed`。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — `passed`; 19 Markdown files、0 active tasks、3 archived tasks、2 decision records。
- 用户反馈修订后，定向回归 `hover_raise_does_not_use_the_window_content_area`、完整 36 项 Rust 测试、格式检查、Clippy 和文档检查再次通过；前端未改，沿用本任务上一提交已通过的 89 项测试和生产构建证据。
- 第二轮反馈修订新增原生 Z 序选择、返回来源和拖动载体优先级测试；完整 38 项 Rust 测试、格式检查、Clippy 和文档检查均已通过。
- 第三轮反馈修订新增同步 Win32 topmost 插入策略测试；完整 39 项 Rust 测试及最终检查结果见本节。

## User acceptance

`accepted`（2026-08-24）：用户完成真实 Windows 桌面验收并确认没有问题，包括：

1. 多标签拖动预览、同窗口排序、拖出后释放点定位。
2. 单标签窗口释放到另一标签页栏后立即合并。
3. A/B/C 三窗口标签页栏悬停上浮、返回来源窗口上浮及合并。
4. 跟随标签或单标签来源窗口始终高于临时上浮目标。
5. 内容区不触发上浮，拖动结束后不残留临时置顶。
6. 脏 Markdown 跨窗口限制和外部文件拖入没有回归。

## Risks and remaining work

- 用户已在真实 Windows 桌面通过本任务交互验收。自动化与本次人工验收没有穷举所有第三方 topmost 软件和多显示器缩放组合，属于非阻塞的环境覆盖风险。

## Next action

无。本任务完成；下一个独立需求应新建会话。

## Outcome

已实现可靠释放合并、跨窗口拖动预览、释放点窗口定位、仅由标签页栏触发且遵循原生 Z 序的窗口临时抬升，以及通过同步 Win32 调用保证拖动载体高于目标；用户于 2026-08-24 完成真实桌面验收并确认没有问题。实现提交主题依次为 `fix: repair cross-window tab dragging`、`fix: limit tab drag window raise to titlebar`、`fix: preserve tab drag carrier z order` 和 `fix: enforce native tab drag z order`；归档提交主题为 `docs: archive accepted tab drag task`，哈希以 Git 历史为准。
