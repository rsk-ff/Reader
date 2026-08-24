# 0002: Store project memory in repository documents

- Status: Accepted
- Date: 2026-08-23

## Context

连续在单个会话中处理整个项目导致上下文膨胀。项目状态、用户反馈、关键决定和验证结果散落在聊天记录中，新会话难以可靠恢复，用户也不应承担手工整理代理上下文的工作。

## Decision

- 一个会话对应一个连贯结果，而不是整个项目。
- 稳定规则保存在 `AGENTS.md`；产品、架构、开发方式和当前状态分别存放在专用文档。
- 跨回合任务使用 `docs/tasks/active/` 中的自包含任务文件；完成后移动到 `docs/tasks/archive/`。
- Codex 自动维护文档，用户只提出需求、验收结果和适时开启新会话。
- Git、代码和实际测试始终高于文档自述。

## Consequences

- 新会话可从仓库恢复工作，不需要用户复制旧聊天。
- 每项开发工作增加少量、明确的文档维护责任。
- 为避免文档失真，Codex 必须在同一提交中更新受影响的状态和任务文件。

## Evidence

- 本项目在 2026-08-21 至 2026-08-23 的长会话中连续处理多个独立目标，并经历自动上下文压缩。
- 当前治理规则见 [`AGENTS.md`](../../AGENTS.md) 和 [`docs/tasks/README.md`](../tasks/README.md)。
