# Reader

Reader 是一个面向 Windows 的轻量 PDF 阅读与批注、Markdown 阅读与编辑桌面应用，基于 Tauri 2、Rust、React 和 TypeScript。

项目当前版本、能力、待验收事项和已知限制以 [`docs/STATUS.md`](docs/STATUS.md) 为准。

## 项目文档

| 入口 | 唯一职责 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 代理职责、固定读取顺序、文档维护和交付规则。 |
| [`docs/STATUS.md`](docs/STATUS.md) | 当前版本、实现与验证基线、待验收项、已知限制和活动任务索引。 |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | 当前产品目标、范围和用户可见行为契约。 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 当前技术结构、模块边界和数据流。 |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 环境、开发、测试、文档检查、启动和发布命令。 |
| [`docs/decisions/`](docs/decisions/) | 长期设计决定、当前状态及其理由。 |
| [`docs/tasks/`](docs/tasks/) | 多回合任务的事实、进度、验证和跨会话交接。 |
| [`docs/PI_WORKFLOW.md`](docs/PI_WORKFLOW.md) | 用户明确要求使用 Pi 时的调用、停止、返工和验收细则；默认由 Codex 实现。 |
| [`CHANGELOG.md`](CHANGELOG.md) | 用户可见功能、修复和正式发布记录。 |

新会话按 [`AGENTS.md`](AGENTS.md) 的固定顺序读取当前状态和匹配的活动任务。历史任务与[最初技术方案](docs/archive/initial-technical-plan.zh-CN.md)不作为默认上下文。用户不需要编辑任何项目文档。

## 代码位置

应用代码位于 [`reader/`](reader/)。开始开发或构建前，请先阅读 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

Windows 安装器扩展位于 [`reader/src-tauri/windows/`](reader/src-tauri/windows/)，软件与文件图标的 SVG 源文件和许可位于 [`reader/src/assets/icons/`](reader/src/assets/icons/README.md)，生成的原生图标位于 [`reader/src-tauri/icons/`](reader/src-tauri/icons/)。

本地发布包与构建/安装证据保存在 `releases/<日期>-<版本>-<源码提交>/`，不纳入 Git；最新包的位置与校验值见 [`docs/STATUS.md`](docs/STATUS.md#latest-local-release-artifacts)。构建缓存可以清理，发布包需先另存，操作边界见开发文档。
