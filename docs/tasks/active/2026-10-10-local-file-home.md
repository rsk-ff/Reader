# 新标签页本地文件浏览

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-10`
- Last updated: `2026-10-11`
- Base branch: `master`
- Base commit: `38b016d`; feedback revision base: `7a170d5`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

将新标签页改为本地文件入口；按用户标注简化导航，固定/常用文件夹连续排列，保留最近文件，右键固定和在目录中新建 Markdown。

## Related context

- [产品](../../PRODUCT.md)、[架构](../../ARCHITECTURE.md)、[开发与检查版启动](../../DEVELOPMENT.md)。
- [常用目录决策 0003](../../decisions/0003-frequent-folders.md)。
- `reader/src/components/NewTabPage.tsx`、`FolderContextMenu.tsx`、`NewMarkdownDialog.tsx`、`reader/src/styles.css`。
- `reader/src/workspace/folderLocations.ts` 及测试、`recentFiles.ts`、`store.ts`。
- `reader/src-tauri/src/local_files.rs`、`lib.rs`、`reader/tests/browser/new-tab.spec.ts`。

## Current behavior

首轮 7a170d5 已实现本地浏览，但用户 2026-10-11 否定其重复布局和任意点击形成常用的规则。本轮已经按反馈实现并通过自动化验证，检查窗口已更新；实际视觉/交互仍待用户，不代表正式安装版已更新。

## Expected behavior

删除 Reader 侧栏标识、此电脑入口、全部侧栏分组标题、主页固定/常用文件夹区域及打开/新建按钮。主页仅最近文件；左侧主页之后连续显示固定位置（默认桌面/下载/文档/用户目录，文件夹图标＋右侧灰钉）和常用位置（文件夹图标，无钉），下方保留磁盘且不设标题。右键文件夹固定/取消固定，目录空白右键新建 MD。保留导航、路径输入和当前筛选。

## Scope

新标签页及活动状态、Rust 目录/位置与独占 MD 创建接口、前端文件夹历史/固定状态、对应测试和产品/架构/开发/状态/变更/决策文档。

## Out of scope

网盘、推荐、Windows 全局历史导入、除明确新建 MD 以外的文件管理写操作、全盘索引、新阅读格式、正式安装或发布、其他活动任务。

## Constraints and decisions

- 无新增生产依赖；磁盘列表不展示网络映射盘，不递归扫描。
- 目录列文件夹及 PDF/MD/Markdown，只读元数据；文件打开复用现有文档接口。
- 常用规则见决策 0003：参考 zoxide 的频率/最近访问权重与老化；成功打开/首次保存或活动前台浏览连续 30 秒为有效事件，同目录 30 分钟合并，至少 3 次才展示；排除根与固定项，90 天未用隐藏，最多 8 项。
- 沿用独立文件夹键，version:2 保留旧固定项但不信任旧点击计数；仅带时间的成功最近文件保守初始化；原最近文件 v1 不改变。
- 右键新建使用打开对话框时的目录快照、用户确认的单个文件名与 create_new；拒绝路径穿越/无效保留名称/已有文件，成功后复用打开与保存协议。
- 用户负责桌面视觉；不截图或使用桌面自动化。独立标识启动检查版，正式进程及数据保持。

## Acceptance criteria

- [x] 标注区域与按钮移除，固定和常用连续排列且只有固定项带灰钉；自动化结构/布局检查通过。
- [x] 文件夹右键固定/取消、默认项取消、重载保留、合格常用项固定不重复，菜单键盘/边界检查通过。
- [x] 常用资格/计分/去重/老化/迁移及后台停留不计、刷新不计、三次有效访问检查通过。
- [x] 目录空白右键新建到当前目录并打开；取消无写入、重名不覆盖、错误可改名恢复；真实 Rust 文件测试通过。
- [x] 磁盘浏览/导航/路径/筛选/旧响应/错误恢复与最近文件兼容、元数据和长列表回归通过。
- [x] 前端/Rust/浏览器、类型/构建/静态与文档/diff 检查通过，独立检查窗口已更新。
- [ ] 实际 WebView2 布局/右键/新建及本机目录权限经用户验收。

## Progress

- [x] 恢复当前 Git/文档/任务与代码，限定反馈范围。
- [x] 查 zoxide 官方算法，记录参考与项目额外资格决定。
- [x] 实现精简布局、右键操作、有效访问计分和存储迁移。
- [x] 完成相关与最终验证，更新文档，独立检查版重新编译启动。
- [ ] 用户视觉与交互验收。

## Discoveries

旧实现每次逐级导航都计数，磁盘和途经目录轻易入常用；旧计数不能用于新资格。成功文件历史每个文件仅保留最后一次，所以保守初始化可能为空，不推测重复访问。新建文件与原有编辑保存分开，独占创建避免覆盖竞态；创建成功但打开失败时报告真实路径并刷新列表。

## Verification

2026-10-11 最终结果（首轮验证不替代本轮）：

- `pnpm --dir reader test` — 17 文件、120 项通过；此前相关目录/最近文件局部 16 项通过。
- `pnpm --dir reader test:browser -- new-tab.spec.ts` — 样式清理后最终 15 项通过（16.2s），覆盖上方标准、330/620/1100px 无溢出和 40 条近期列表可达；不生成截图。
- `pnpm --dir reader build` — TypeScript/Vite 1211 模块通过（16.90s），仅既有大 chunk 提示；单独 tsc 亦通过。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml` — 全部 48 项通过，包括 4 项真实本地目录/创建测试。
- `cargo fmt ... -- --check`、`cargo clippy ... --all-targets --all-features -- -D warnings` — 通过。最终仅修订模块注释，其后 Tauri dev 重编译成功。
- 文档结构/内部链接与 `git diff --check` — 收尾核对通过。
- 独立 Tauri dev 最后编译成功（17.11s）；标识 `com.earendil.reader.localhome20261010`，窗口“Reader · 本地文件新标签页验收”，PID 45620、窗口句柄 9374318、响应正常。开发模块 HTTP 200，含菜单/前台停留实现，无旧品牌块。
- 配置/启动器/日志在 `%TEMP%/Reader-local-home-20261010/`；正式安装版 PID 68904 保持运行。无安装包或发布、未读写正式历史，Pi 未调用，无 session ID。

## User acceptance

2026-10-11 用户反馈：删除截图划掉的导航/分组和主区域，默认位置就是固定项；固定与常用连续显示，只有固定带灰钉，常用使用文件夹图标；改右键固定，移除打开按钮，新建 MD 可迁至目录空白右键。要求常用参考成熟项目。属于同一目标，本轮已响应，等待新的检查反馈。

在“Reader · 本地文件新标签页验收”检查：

1. 主页是否只留最近文件，侧栏默认文件夹有灰钉、无分组标题；缩窄窗口检查显示。
2. 点击磁盘进入目录；右键子文件夹固定，检查侧栏入口，再右键取消；默认项也可取消。
3. 目录空白右键新建 Markdown，输入名称创建并编辑；试取消和已有名称保护，确认创建在当前目录。

常用不会因快速浏览出现，可随真实重复打开或前台停留形成；检查版历史独立，不自动显示正式历史。筛选仅当前列表，不递归搜索。

## Risks and remaining work

实际 WebView2 菜单焦点/视觉、本机权限拒绝、可移动磁盘移除待用户；原生创建已验证真实临时目录与同名保护，受限目录写入错误未用桌面实测。正式打包安装未做，现有大 chunk 提示仍在。

## Next action

等待用户检查精简侧栏、右键固定与目录新建的反馈；同一目标继续本会话。

## Outcome

反馈修订实现与自动化验证交付完成，本地提交主题 `feat: simplify new-tab navigation and add folder context actions`，哈希见 Git；保留任务等待用户验收，未声称整体完成或正式发布。独立需求另开会话。
