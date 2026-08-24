# Establish repository-owned project documentation

- Status: `done`
- Owner: Codex
- Created: `2026-08-23`
- Base branch: `master`
- Base commit: `1f5bb93`

## Goal

让用户只负责提出需求、验收结果和切换会话。Codex 与执行代理通过仓库内的标准文档组织项目，使任意新会话都能自行恢复必要上下文，不要求用户编写或维护项目文件。

## Current behavior

项目原本只有 `AGENTS.md`、最初技术方案和 `reader/README.md`。当前状态、跨会话任务进度、长期决策和文档维护责任没有独立来源，多个独立开发目标长期堆积在一个聊天中。

## Expected behavior

- 根 README 提供唯一入口。
- 产品、架构、开发方法、当前状态、决策和任务进度各有明确位置。
- `AGENTS.md` 规定用户与代理职责、会话边界和自动维护规则。
- 新会话可通过仓库自动恢复，用户不复制旧聊天或编辑交接文件。

## Scope

- 重整项目 Markdown 文档。
- 保留最初技术方案作为历史资料。
- 不修改应用代码、依赖或构建配置。

## Out of scope

- 不调整 context-mode。
- 不改变 Reader 产品功能。
- 不调用 Pi 实现本次文档治理。

## Constraints and decisions

- 文档数量保持在可以持续维护的最小集合。
- 同一事实只指定一个权威位置。
- 任务文件只用于多回合、Pi、重要设计或等待用户验收的工作。
- 完成的连贯改动默认提交，保持工作树干净。

## Acceptance criteria

- [x] 定义用户、Codex 和 Pi 的职责边界。
- [x] 建立产品、架构、开发、状态、决策和任务文档。
- [x] 建立会话结束、跨会话恢复和任务归档规则。
- [x] 检查内部链接和文档间一致性。
- [x] 检查完整 diff，并提交文档重整。

## Progress

- [x] 盘点现有文档和代码入口。
- [x] 重写 `AGENTS.md`。
- [x] 建立标准文档结构。
- [x] 将最初技术方案移动到历史目录。
- [x] 完成一致性检查并归档本任务。

## Discoveries

- 当前 `reader/README.md` 已包含较准确的实现说明，可以拆分为项目级产品、架构、状态和开发文档。
- 应用代码基线 `1f5bb93` 已完成自动化验证，但最后一批窗口和 Markdown 视觉变化仍等待用户最终验收。

## Verification

- Project Markdown links — passed across 16 managed Markdown files.
- `git diff --check` — passed.
- `git status --short` — reviewed; only this documentation reorganization is present.
- Application tests — not rerun because no source code, dependency or build configuration changed.

## User acceptance

本任务不要求用户编辑文档。用户只需核查最终职责划分是否符合预期。

## Risks and remaining work

- 文档可能随实现演进而过期；`AGENTS.md` 已要求在相关代码任务中同步维护并以代码和测试纠正冲突。

## Next action

无。本任务完成；下一个独立开发需求应新建会话。

## Outcome

建立了仓库级文档入口、产品定义、架构、开发与发布指南、当前状态、Pi 执行协议、长期决策记录和自包含任务生命周期。用户无需维护这些文件；Codex 在今后的开发任务中自动更新。最终提交是包含本归档文件的文档提交。
