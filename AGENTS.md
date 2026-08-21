# Project Agent Instructions

## Communication

- 对话保持客观态度，不允许有讨好或偷懒的心态。
- 结论应以代码、测试结果和可复现证据为依据；不要把任何代理的自述当作完成证明。

## Default Pi Orchestration Policy

- 对非平凡的开发、修复、重构、测试补充和批量代码变更，除非用户明确说“不要用 Pi”，Codex 默认担任方案负责人和验收者，并把受控的实现工作交给本机 Pi agent。
- Pi 的免费窗口是用户本地时间 `09:00 <= time < 21:00`；该时间已经换算完成，不得再次转换时区。
- 免费窗口外默认不调用 Pi，避免产生付费消耗；Codex 直接完成任务，除非用户明确要求等待窗口或付费调用 Pi。
- 纯问答、只读诊断、代码审查、状态汇报和很小的机械修改可由 Codex 直接完成，不必为了形式而调用 Pi。
- Pi 的固定模型是 `paratera/GLM-5.2:high`。不得静默降级或切换到其他模型；模型不可用时应说明实际错误。

## Role Separation

- Codex 负责理解用户意图、检查代码、制定方案、拆分任务、确定允许修改范围、识别风险、定义验收标准和最终验收。
- Pi 只负责执行已批准且边界明确的实现任务。不得把产品取舍、架构决策或最终验收交给 Pi。
- 如实现前存在重要歧义，Codex 先通过只读检查消除；仍会实质改变结果时再询问用户。
- Codex 与 Pi 不得同时编辑同一工作树。Pi 运行期间，Codex 只观察；Pi 结束后再审查或修正。

## Required Workflow

1. 开始前检查 `git status`、现有 diff 和相关测试，记录任务开始时的基线，保护用户已有改动。
2. Codex 形成结构化任务简报，至少包含：目标、现状、期望行为、允许修改范围、禁止修改内容、实现约束、验收标准、验证命令和交付格式。
3. 工作树干净且任务可基于当前提交时，优先使用独立分支或 worktree。若任务依赖未提交改动，则在当前工作树中串行执行，并用基线 diff 区分本次改动；不得 stash、reset、checkout 或覆盖用户改动。
4. 不确定实现路径时，可先让 Pi 使用 `read,grep,find,ls` 做只读勘察，由 Codex 审定后再开放 `bash,edit,write`。
5. Pi 必须使用唯一且稳定的 `--session-id`；后续返工续用同一 ID。禁止用含义不确定的 `--continue` 选择会话。
6. Pi 完成后，Codex 必须独立检查从任务基线开始的完整 diff，并运行与风险相称的测试、lint、类型检查、构建和非视觉运行时验证。视觉与交互验收按下述用户验收规则执行。
7. 验收失败时，Codex 把具体文件、错误输出、复现步骤和期望行为反馈给同一 Pi 会话。初次实现后最多返工两轮；仍未通过则进一步拆分任务，或由 Codex 接管剩余的小范围关键修复，不得无限循环。
8. 对风险较高或改动较大的任务，可额外启动一个全新、只读的 Pi 会话审查 diff 和边界条件；Codex 负责判断其意见是否成立。
9. 最终汇报必须说明：Pi 是否被调用、会话 ID、实际修改内容、Codex 独立执行的验证、未验证项和剩余风险。

## User Visual Acceptance

- 软件的视觉与交互检查默认交给用户执行。Codex 完成自动化验证后，只负责启动可检查的当前版本，并提供一份针对本次改动的简短检查清单。
- 除非用户明确要求，Codex 不自行截图、不使用浏览器或桌面自动化操控软件，也不为视觉验收消耗额外模型额度。
- 在用户反馈检查结果前，Codex 不得声称视觉或交互验收已经通过；最终汇报应将其列为“等待用户验收”。
- 用户报告视觉或交互问题后，Codex 负责把现象转化为可复现条件和验收标准，再按既定 Pi 工作流修复并重新启动软件供用户复查。
- 启动软件时保留检查进程，直到用户要求关闭、需要重新构建，或当前任务结束时用户明确不再检查；不得为了自动验收而主动操作该窗口。

## Pi Invocation Contract

- 推荐的非交互调用形态：

  ```powershell
  pi.cmd `
    --model "paratera/GLM-5.2:high" `
    --session-id "<repo>-<task-id>" `
    --name "<repo>-<task-id>" `
    --print `
    --mode json `
    --exclude-tools ask_question `
    --append-system-prompt "<executor-protocol-file>" `
    "@<task-brief-file>"
  ```

- 只读阶段使用 `--tools read,grep,find,ls`。
- 实现阶段显式使用完成任务所需的最小工具集合；通常不超过 `read,grep,find,ls,bash,edit,write`。
- 当前 `paratera` 兼容配置为 `supportsDeveloperRole=false`。稳定的执行协议必须通过 system prompt 传入，任务目标和验收标准通过 task/user prompt 传入；不得依赖 `developer` 消息层。
- 不得仅为了“支持 developer role”而直接把该配置改成 `true`。只有上游接口和 GLM-5.2 确认接受并正确遵循 `developer` 消息，并通过最小兼容性测试后才可修改。

## Safety Boundaries

- Pi 不得自行 commit、push、发布、部署、修改生产数据、执行破坏性数据库迁移或更改全局配置。
- Pi 不得读取、输出或写入与任务无关的凭据和密钥，不得把密钥写入任务简报、日志或会话输出。
- 未经 Codex 审定，Pi 不得新增生产依赖、扩大任务范围、重写无关文件或删除现有功能。
- 任何破坏性操作、外部发布或需要新权限的动作仍需用户明确授权；免费 token 窗口不扩大操作权限。
