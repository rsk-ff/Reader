# Pi implementation workflow

本文件保存 Pi 的详细执行协议，避免每个 Codex 会话都在 `AGENTS.md` 中加载全部操作细节。Codex 负责调用和监督，用户不需要运行任何命令。

## When Pi is allowed

默认由 Codex 直接完成实现和验证。只有用户明确要求使用 Pi 时才调用；GLM 活动已结束，不再按时段自动调用，也不指定固定 GLM 模型。

用户明确要求后，可委派以下边界明确的任务：

- 边界明确的多文件实现。
- 批量、重复或机械性重构。
- 按既定接口补充测试。
- 已由 Codex 完成设计、验收标准清楚的中型任务。

以下职责始终由 Codex 负责：

- 产品和架构决策、文档治理、最终验收。
- 最终自动化验证、文档更新、提交和用户验收交付。

## Preconditions

1. 确认用户在当前目标中明确要求调用 Pi，并确定当次认可的模型；Codex 记录当前分支、HEAD、`git status` 和用户已有 diff。
2. Codex 检查或创建活动任务文件，并确定允许修改的文件范围。
3. Pi 与 Codex 串行编辑。Pi 运行时 Codex 只观察，不修改同一工作树。
4. 只有需要隔离、并行或风险较高时才创建 worktree；普通串行任务不为形式创建 worktree。

## Task brief

任务书至少包含：

- 目标和用户可见价值。
- 当前可复现行为与期望行为。
- 相关文件、允许修改范围和禁止事项。
- 已确定的实现约束，不把产品选择留给 Pi。
- 验收标准和准确的验证命令。
- 输出格式：只报告修改文件、关键实现、测试结果、剩余问题；不粘贴完整 diff 或构建日志。

活动任务文件已经包含上述字段时，直接把它作为 Pi 任务书；不要再复制一份会独立过期的任务说明。执行约束使用仓库内的 [`PI_EXECUTOR_PROTOCOL.md`](PI_EXECUTOR_PROTOCOL.md)。

## Invocation

仅在用户明确要求后调用，`$piModel` 必须为当次用户指定或认可的模型。不得根据本地时间自动调用、沿用已结束活动的模型或静默降级。

推荐调用：

```powershell
$piTask = "docs/tasks/active/<task-file>.md"
$piModel = "<user-approved-model>"

pi.cmd `
  --model "$piModel" `
  --session-id "<repo>-<task-id>" `
  --name "<repo>-<task-id>" `
  --print `
  --mode json `
  --exclude-tools ask_question `
  --tools read,grep,find,ls,bash,edit,write `
  --append-system-prompt "docs/PI_EXECUTOR_PROTOCOL.md" `
  "@$piTask"
```

- 会话 ID 必须唯一且稳定；有具体补丁的返工才续用同一 ID。
- 执行协议通过 system prompt，任务通过 user prompt；使用提供方已验证的消息角色配置，不为调用修改全局配置。
- 只向 Pi 开放任务所需的最小工具，通常不超过 `read,grep,find,ls,bash,edit,write`。
- 完整 JSON 输出保存在本地临时日志，不提交仓库；只向 Codex 上下文提取最终摘要、错误和必要证据。

## Stop and retry rules

- Pi 运行约十分钟仍没有产生相关 diff：停止并检查原因。
- 首轮零修改、重复讨论方案或明显偏离：不要在原会话无限追问；缩小任务后新开 Pi 会话，或由 Codex 直接完成。
- 首轮已产生可审查补丁但验收失败：把具体文件、失败命令、错误和期望行为反馈给同一 Pi 会话。
- 默认最多一次实现和一次针对性返工。仍失败时由 Codex重新拆分或接管关键小修。

## Codex acceptance

Pi 的完成声明不是证据。Codex 必须：

1. 检查从基线开始的完整 diff，确认没有越界修改。
2. 运行与风险相称的测试、类型检查、Rust 检查和构建。
3. 更新任务文件、状态、变更日志和必要的决策记录。
4. 视觉任务启动应用交给用户验收。
5. 最终说明 Pi 会话 ID、实际改动、独立验证、未验证项和风险。

## Safety

- Pi 不得 commit、push、发布、部署、修改生产数据、执行破坏性迁移或全局配置修改。
- Pi 不得读取或输出无关凭据。
- 未经 Codex 审定，不得新增生产依赖、删除功能或扩大范围。
