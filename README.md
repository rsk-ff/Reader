# Reader

Reader 是一个面向 Windows 的轻量 PDF 阅读与批注、Markdown 阅读与编辑桌面应用，基于 Tauri 2、Rust、React 和 TypeScript。

当前应用版本为 `0.1.0`。项目当前能力、待验收事项和已知限制以 [`docs/STATUS.md`](docs/STATUS.md) 为准。

## 项目文档

- [`docs/PRODUCT.md`](docs/PRODUCT.md)：产品目标、范围和用户可见行为。
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：当前技术结构和数据流。
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)：开发、测试、启动和打包命令。
- [`docs/STATUS.md`](docs/STATUS.md)：当前版本、验证状态、已知限制和活动任务。
- [`docs/decisions/`](docs/decisions/)：需要长期保留理由的设计决定。
- [`docs/tasks/`](docs/tasks/)：多回合开发任务的进度和跨会话交接。
- [`CHANGELOG.md`](CHANGELOG.md)：用户可见变更和发布记录。
- [`docs/archive/initial-technical-plan.zh-CN.md`](docs/archive/initial-technical-plan.zh-CN.md)：最初技术方案，仅供历史追溯。

代理协作、文档维护和会话切换规则见 [`AGENTS.md`](AGENTS.md)。用户不需要编辑这些文件；Codex 在处理开发任务时负责维护。

## 代码位置

应用代码位于 [`reader/`](reader/)。开始开发或构建前，请先阅读 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。
