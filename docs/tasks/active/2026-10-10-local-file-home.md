# 新标签页本地文件浏览

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-10`
- Last updated: `2026-10-10`
- Base branch: `master`
- Base commit: `38b016d`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

将新标签页改为类似 Windows 资源管理器的本地文件入口，直接从此电脑查找文档，并保留固定文件夹、最近常打开的文件夹及最近打开文件。

## Related context

- [产品](../../PRODUCT.md)、[架构](../../ARCHITECTURE.md)、[开发与检查版启动](../../DEVELOPMENT.md)。
- `reader/src/components/NewTabPage.tsx`、`reader/src/styles.css`。
- `reader/src/workspace/recentFiles.ts`、`reader/src/workspace/store.ts`。
- `reader/src-tauri/src/lib.rs`、`reader/tests/browser/new-tab.spec.ts`。
- `reader/src-tauri/src/local_files.rs`、`reader/src/workspace/folderLocations.ts` 及对应测试。

## Current behavior

干净 master 38b016d；新标签页只有软件名称、原生打开/新建 Markdown 与最近文件，不能直接列出磁盘或浏览文件夹。已有最近文件 v1 数据必须保留。

## Expected behavior

左侧提供主页、此电脑、系统常用位置、用户固定位置与最近常用文件夹。主页显示固定/常用文件夹与最近打开。此电脑列出本地磁盘，进入后列出文件夹和可阅读文档，支持前进/后退、上一级、路径输入、当前目录筛选与刷新；点击文档沿用活动新标签复用逻辑。

## Scope

新标签页、只读 Rust 目录/本地位置接口、前端文件夹历史与固定状态、相关测试和产品/架构/状态/变更文档。

## Out of scope

网盘、推荐、Windows 全局历史导入、文件管理写操作、系统全盘索引、新阅读格式、正式安装或发布、其他活动任务。

## Constraints and decisions

- 无新增生产依赖；磁盘列表不展示网络映射盘，不递归扫描。
- 列出文件夹以及 PDF/MD/Markdown，文件读取复用原文档接口；目录接口只读取元数据。
- 固定/目录访问记录使用独立存储键，不迁移或覆盖原有最近文件 v1。
- 桌面视觉由用户验收；自动化不生成截图或做桌面操作。
- 独立标识启动检查版，正式版本数据和进程保持。

## Acceptance criteria

- [x] 此电脑逐级浏览/文档打开接口已实现，浏览器导航/打开回归通过；实际桌面仍待用户。
- [x] 固定/取消固定重载后保留，常用文件夹由成功访问与最近文档位置产生。
- [x] 最近文件保持原数据兼容、元数据与不限条数。
- [x] 路径不可用时有可恢复错误；快速切换目录不会显示过期结果；实际受限目录待用户。
- [x] 相关前端/Rust/浏览器检查、类型/构建、文档及 diff 检查通过；本地提交随本轮交付完成。
- [ ] 独立检查版启动；用户视觉与交互验收。

## Progress

- [x] 检查 Git、文档、活动任务与当前代码，确定范围。
- [x] 实现与自动化验证。
- [x] 启动独立检查版。
- [ ] 等待用户视觉与交互反馈。

## Discoveries

- 最近文件存储隔离由应用标识和 origin 决定；检查版不自动显示正式版历史。
- 目录失败及旧的慢请求均不计入常用，刷新不增加次数；原生选择同一固定位置两次保持固定，取消选文件保留历史。跨窗口选择后的固定检查读取最新 store 状态。
- Rust 目录接口使用文件系统元数据跟随链接，不递归；读取失败计数提示，文件夹优先、名称排序。未新增依赖或改动文件阅读/写入引擎。

## Verification

- `pnpm --dir reader test` — 17 文件、115 项通过（新增 4 项文件夹状态测试）；相关最近文件/目录状态局部测试 11 项通过。
- `pnpm --dir reader test:browser -- new-tab.spec.ts` — 最终 9 项通过，覆盖磁盘/目录/导航/筛选/打开、固定重载/取消/选择器幂等/取消打开、失效路径/慢请求/刷新访问次数、330/620/1100px 无水平溢出、40 条历史滚动及共用图标。
- `pnpm --dir reader build` — TypeScript/Vite 1209 模块通过，仅既有大 chunk 提示；最终选择器状态修订另经 TypeScript 和浏览器验证，收尾重建通过。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml` — 全部 46 项通过；静态检查要求简化等价布尔表达式后，`cargo test ... local_files` 2 项再验通过。
- `cargo fmt ... -- --check`、`cargo clippy ... --all-targets --all-features -- -D warnings` — 最终通过。
- 文档结构/内部链接与 `git diff --check` — 通过。
- 独立 Tauri dev 编译通过（最后 16.39s）；检查标识 `com.earendil.reader.localhome20261010`，窗口“Reader · 本地文件新标签页验收”，PID 77336、非零窗口句柄 2361652、响应正常。开发模块 HTTP 200，包含当前目录/固定实现。日志和临时配置在 `%TEMP%/Reader-local-home-20261010/`。
- 正式安装版 PID 68904 保持运行，未安装、发布、读取/覆盖正式历史；未截图或使用桌面自动化。Pi 未调用，无 session ID。

## User acceptance

waiting：在检查窗口执行以下项目；反馈继续本会话。

1. 检查主页侧栏、固定/常用文件夹、最近文件的布局，缩窄窗口查看导航与列表。
2. 从“此电脑”进入本地磁盘和多级目录，打开一份 PDF/Markdown；检查返回/上一级和路径输入。
3. 新标签中固定/取消固定文件夹，检查主页及侧栏入口；打开自己的几份文件，确认最近记录和常用目录更新。

检查版有独立历史，正式版旧历史不会自动出现；当前目录筛选不递归搜索。

## Risks and remaining work

原生目录权限、可移动磁盘移除与实际 WebView2 交互需要本机用户验收。目录筛选仅当前目录，不做全盘搜索。

## Next action

等待用户对“Reader · 本地文件新标签页验收”的上述检查反馈；将问题转为复现条件，在此任务中修订与复验。

## Outcome

实现与自动化交付完成，保留活动文件等待视觉/交互验收；本地提交主题 `feat: add local file browser to new tabs`，哈希以 Git 历史为准。没有正式安装包；验收前不归档或声明整体完成。独立需求另开会话。
