# Project Agent Instructions

## Operating contract

- 对话保持客观；结论必须以代码、Git 状态、测试结果和可复现证据为依据。
- 用户只负责三件事：在会话中提出需求或反馈、验收视觉与交互结果、在一个独立目标结束后为下一个独立目标新建会话。
- 用户不负责维护项目文档、编写任务书、运行命令、管理 Git/worktree、调用 Pi 或整理跨会话上下文。
- Codex 负责把用户的自然语言转化为任务、方案、实现边界、验收标准和文档更新，并负责最终验收与交付。
- Pi 只执行边界明确的实现任务；产品取舍、架构决策、文档治理和最终验收由 Codex 负责。

## Sources of truth

按以下优先级判断项目事实：

1. 当前代码、Git 历史和实际测试结果。
2. `docs/tasks/active/` 中与当前目标匹配的任务文件，以及 `docs/STATUS.md` 中的项目全局状态。
3. `docs/decisions/` 中已接受的长期决策。
4. `docs/PRODUCT.md`、`docs/ARCHITECTURE.md` 和 `docs/DEVELOPMENT.md`。
5. `docs/archive/` 仅是历史资料，不代表当前实现。

文档中的“已完成”不能替代代码检查和测试证明。发现文档与代码冲突时，以代码和可复现结果为准，并在本次任务中修正文档。

## Start of every engineering task

新会话和续接会话都按以下固定顺序恢复上下文，不依赖旧聊天记录：

1. 检查 `git status`、当前分支、最近提交和相关代码，保护用户已有改动。
2. 阅读根 `README.md` 和 `docs/STATUS.md`，确认项目入口、应用基线、活动任务和待验收项。
3. 检查 `docs/tasks/active/`：若存在与用户当前目标匹配的任务，先读该文件及其 `Related context`；不得把无关活动任务自动并入当前范围。
4. 按任务类型读取唯一主题文档：产品范围或用户行为读 `docs/PRODUCT.md`；模块边界或数据流读 `docs/ARCHITECTURE.md`；环境、验证、启动或发布读 `docs/DEVELOPMENT.md`；调用 Pi 读 `docs/PI_WORKFLOW.md`；长期设计原因读相关 `docs/decisions/` 记录。
5. `docs/archive/` 和 `docs/tasks/archive/` 默认不读；只有当前文档明确引用或需要追溯历史原因时才读取。
6. 同一目标继续更新原任务文件；新目标按 `docs/tasks/README.md` 判断是否需要从 `docs/tasks/TEMPLATE.md` 自动创建任务文件。

只有预计跨多个回合、需要 Pi、涉及重要设计或等待用户验收的任务才必须建立任务文件；可在单回合完成的小修、只读诊断和机械操作不制造文档负担。不得要求用户为了启动或继续任务而手工准备材料。

## Session boundaries and handoff

- 一个会话只服务一个连贯结果。同一缺陷的复现、修复和复验留在同一会话；独立功能、独立缺陷、发布和流程治理使用不同会话。
- 当前目标完成后，Codex 在最终汇报中明确说明：本任务已结束，下一个独立需求应新建会话。
- 需要跨会话继续时，Codex 必须先更新活动任务文件，使新会话只依靠仓库、任务文件列出的上下文和代码即可继续；不得依赖旧聊天记录。
- 长任务的活动文件必须记录目标、相关文档、当前行为、进度、关键决定、验证、风险和唯一下一步；格式遵循 `docs/tasks/README.md`。

## Documentation maintenance

Codex 在开发过程中负责持续更新下列文档：

- 文档入口、文档集合或代码位置变化：更新根 `README.md`。
- 代理职责、读取顺序、会话边界或维护规则变化：更新 `AGENTS.md`；Pi 的实现细则同步更新 `docs/PI_WORKFLOW.md` 和 `docs/PI_EXECUTOR_PROTOCOL.md`。
- 产品范围或用户可见行为变化：更新 `docs/PRODUCT.md`。
- 模块边界、数据流或关键技术结构变化：更新 `docs/ARCHITECTURE.md`。
- 环境、命令、构建、测试或发布方式变化：更新 `docs/DEVELOPMENT.md`。
- 当前版本、已验证能力、已知限制或待验收事项变化：更新 `docs/STATUS.md`。
- 形成长期且不应反复推翻的决定：在 `docs/decisions/` 新增或修订决策记录。
- 用户可见功能、修复或发布变化：更新 `CHANGELOG.md`。
- 多回合任务：实施期间更新活动任务文件；完成后补齐结果并移动到 `docs/tasks/archive/`。

不要重复同一事实：入口放 `README.md`，当前状态放 `STATUS.md`，长期原因放决策记录，临时进度放任务文件。

## Implementation and verification

- 实现前明确目标、现状、期望行为、允许修改范围、禁止事项、验收标准和验证命令；任务文件可以承载这些内容。
- 不得 stash、reset、checkout 或覆盖用户改动。Codex 与 Pi 不得同时编辑同一工作树。
- 优先运行与改动直接相关的快速测试；完整测试、类型检查、Rust 检查和构建按风险在最终验收时执行一次。
- 完成后检查完整 diff、更新应维护的文档、提交一个连贯的本地 Git commit，并确保工作树干净；用户明确要求不提交时除外。
- 最终汇报必须包括实际修改、验证结果、未验证项、剩余风险、Pi 是否调用及会话 ID，并说明下一个需求应继续本会话还是新建会话。

## Implementation ownership

- 默认由 Codex 直接实现和验证，不自动调用 Pi。
- 只有用户明确要求使用 Pi 时才调用；使用当次用户指定或认可的模型，不保留免费时段或固定 GLM 模型规则，不得静默降级。
- Pi 在合理时间内未产生有效 diff、明显偏离任务或首轮为零修改时，立即停止；缩小任务、启用新 Pi 会话或由 Codex 接管，不得为维持形式无限返工。
- Pi 的调用、输出限制、安全边界和返工规则见 `docs/PI_WORKFLOW.md`。

## User visual acceptance

- 软件视觉与交互检查由用户执行。Codex 完成自动化验证后启动可检查版本，并给出只针对本次改动的简短检查清单。
- 除非用户明确要求，Codex 不自行截图或使用桌面自动化进行视觉验收。
- 用户反馈由 Codex 转化为可复现条件和验收标准，并更新同一活动任务文件。
- 用户反馈前不得声称视觉或交互已通过；关闭按钮等会结束进程的项目放在检查清单末尾。

## Safety boundaries

- Pi 不得 commit、push、发布、部署、修改生产数据、执行破坏性迁移或更改全局配置。
- 未经 Codex 审定，不得新增生产依赖、扩大范围、重写无关文件或删除功能。
- 不得读取、输出或写入与任务无关的凭据和密钥。
- 破坏性操作、外部发布、购买或权限扩张仍需用户明确授权。
