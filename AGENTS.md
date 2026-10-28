# Project Agent Instructions

本文件适用于所有在本仓库工作的编码代理。

## 职责

- 用户只负责提出需求或反馈、验收视觉与交互结果；不负责维护文档、写任务书、运行命令或整理跨会话上下文。
- 代理负责把需求转化为方案、实现、验证和文档更新，并对最终交付负责。
- 结论以代码、Git 状态、测试结果和可复现证据为依据；文档写“已完成”不能替代检查。

## 事实来源

按优先级：

1. 当前代码、Git 历史和实际测试结果。
2. `docs/tasks/active/` 中与当前目标匹配的任务文件，以及 `docs/STATUS.md`。
3. `docs/decisions/` 中已接受的决策。
4. `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md`。

文档与代码冲突时以代码为准，并在本次任务中修正文档。

## 开始任务

1. 检查 `git status`、当前分支和最近提交，保护已有改动。
2. 读 `docs/STATUS.md`；若 `docs/tasks/active/` 有与当前目标匹配的任务，读该文件。不要并入无关任务。
3. 按需读主题文档：产品行为读 PRODUCT，模块与数据流读 ARCHITECTURE，命令、测试和发布读 DEVELOPMENT，长期理由读 decisions。

跨多个回合、等待用户验收或可能换会话继续的任务，按 [`docs/tasks/TEMPLATE.md`](docs/tasks/TEMPLATE.md) 建任务文件；单回合小修和只读诊断不建。

## 实现与验证

- 实现前明确目标、范围、验收标准和验证命令。
- 不得 stash、reset、checkout 或覆盖用户改动。
- 先跑与改动相关的快速测试；完整测试、类型检查、Rust 检查和构建按风险在交付前执行。命令见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。
- 交付前检查完整 diff、更新受影响的文档并提交连贯的 commit。
- 汇报实际修改、验证结果、未验证项和剩余风险。

## 文档维护

每个事实只写在一处：

- 当前状态、待验收项、已知限制、最新安装包 → `docs/STATUS.md`
- 用户可见行为 → `docs/PRODUCT.md`
- 模块边界与数据流 → `docs/ARCHITECTURE.md`
- 环境、命令、测试、发布 → `docs/DEVELOPMENT.md`
- 不应反复推翻的长期决定 → `docs/decisions/`
- 用户可见的功能、修复和发布 → `CHANGELOG.md`
- 多回合任务的临时进度 → `docs/tasks/active/`；完成后把结果写入 STATUS/CHANGELOG 并删除任务文件，历史由 Git 保留。

不在文档里堆积测试流水、进程号或日志文件清单；这些属于提交信息或本地发布目录。

## 用户视觉验收

- 视觉与交互由用户在真实 Windows 桌面中验收。代理完成自动化验证后启动可检查版本，并给出只针对本次改动的简短检查清单；关闭类操作放在清单末尾。
- 除非用户要求，不自行截图或用桌面自动化做视觉验收。
- 用户反馈前不得声称视觉或交互已通过。

## 安全边界

- 未经用户同意，不新增生产依赖、扩大范围、重写无关文件或删除功能。
- 不读取、输出或写入与任务无关的凭据。
- 破坏性操作、外部发布、合并到 `master` 和权限扩张需要用户明确授权。
