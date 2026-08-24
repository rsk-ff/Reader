# Audit and refine the project documentation system

- Status: `done`
- Owner: Codex
- Created: `2026-08-23`
- Last updated: `2026-08-24`
- Base branch: `master`
- Base commit: `f9351e2`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

核查并打磨仓库文档体系，使文档职责清楚、没有不必要重复，交叉引用可验证，并让不了解旧会话的新 Codex 会话能够确定地找到完成当前目标所需的全部资料。

## Related context

- [`../../../AGENTS.md`](../../../AGENTS.md)
- [`../../../README.md`](../../../README.md)
- [`../../STATUS.md`](../../STATUS.md)
- [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md)
- [`../../PI_WORKFLOW.md`](../../PI_WORKFLOW.md)
- [`../../PI_EXECUTOR_PROTOCOL.md`](../../PI_EXECUTOR_PROTOCOL.md)
- [`../../decisions/0002-repository-owned-project-memory.md`](../../decisions/0002-repository-owned-project-memory.md)
- [`../README.md`](../README.md)
- [`../../../scripts/check-docs.ps1`](../../../scripts/check-docs.ps1)

## Current behavior

- 已有产品、架构、开发、状态、决策、任务和 Pi 工作流文档，基本职责已经分开。
- 新会话读取规则分散在 `AGENTS.md` 的多个章节中，没有按任务类型给出确定路由。
- `docs/DEVELOPMENT.md` 要求检查 Markdown 链接，但仓库没有可重复执行的检查命令。
- `docs/STATUS.md` 混合了实现状态、验证基线和近期 Git 提交摘要，部分信息可能与 Git 或 `CHANGELOG.md` 重复。

## Expected behavior

- 文档入口、权威边界、读取顺序和更新责任均能在唯一位置确定。
- 活动任务明确列出继续工作所需的相关文档，新会话不依赖旧聊天猜测上下文。
- 仓库提供一个确定的文档检查命令，验证内部链接和活动任务索引。
- 当前状态只记录当前事实和证据，不复制 Git 历史或产品定义。

## Scope

- 审计和修改仓库治理文档、项目文档及其交叉引用。
- 增加最小的文档验证脚本和 Pi 执行协议文件。
- 不修改 Reader 应用代码、依赖或构建配置。

## Out of scope

- 不调整 context-mode。
- 不修改 Reader 产品功能或重新验收应用视觉效果。
- 不调用 Pi；文档治理和最终验收由 Codex 负责。

## Constraints and decisions

- 不新增内容重复的“总说明”文档。
- 根 `README.md` 只做项目入口；`AGENTS.md` 保存代理操作规则；各主题文档只维护自身事实。
- 历史方案和归档任务不作为新会话的默认必读材料。
- 自动检查只验证仓库可以确定的结构事实，不把自然语言正确性伪装成机器验证。

## Acceptance criteria

- [x] 文档职责和读取路由没有冲突、空白或不必要重复。
- [x] 活动任务模板要求列出相关上下文，并定义明确状态。
- [x] 所有受管 Markdown 内部链接和标题锚点通过自动检查。
- [x] 活动任务文件与 `docs/STATUS.md` 索引一致。
- [x] 完整 diff 无空白错误，只含本次文档体系改动。
- [x] 改动提交后工作树干净。

## Progress

- [x] 盘点受管文档、Git 基线和当前代码路径。
- [x] 逐份读取当前核心文档。
- [x] 修正文档结构、引用和缺失的操作材料。
- [x] 运行验证、复核完整 diff 并归档。

## Discoveries

- 当前核心文档分类和数量合理；根 `README.md` 已能承担唯一入口，不需要新增路线图、贡献指南或第二份总览。
- 新会话原先缺少按任务类型确定读取资料的路由，活动任务模板也没有 `Related context`，存在依赖旧聊天补背景的风险。
- Pi 调用示例引用了不存在的 `<executor-protocol-file>`；本次补充了仓库内真实协议，并确认本机 Pi `0.84.2` 支持从文件读取追加 system prompt。
- `STATUS.md` 的近期提交列表与 Git 历史、`CHANGELOG.md` 职责重复，产品文档和开发文档也有少量流程规则重复。
- 发布指南要求记录安装包证据，但原 `STATUS.md` 没有保存当前产物路径、大小、哈希和签名状态；这些事实只能从旧会话或本地文件重新提取。

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — passed：18 份受管 Markdown、0 个活动任务、2 个归档任务、2 个决策记录；内部文件链接、标题锚点、入口索引、任务结构/状态和决策索引均通过。
- `git diff --check` 与 `git diff --cached --check` — passed。
- 核心文档间 28 字符以上完全重复正文扫描 — 无重复行。
- 当前 NSIS/MSI 的文件大小、SHA-256 和 `NotSigned` 状态 — 从本地产物重新计算并与 `docs/STATUS.md` 一致。
- Application tests — 未运行；本任务没有修改应用源码、依赖或构建配置。

## User acceptance

本任务没有应用视觉或交互变化，不需要用户运行命令或检查软件窗口。用户只需阅读最终审计结论；文档维护仍由 Codex 负责。

## Risks and remaining work

- 自动检查能防止路径、索引、状态和章节结构漂移，不能判断自然语言事实是否与代码完全一致；每个实现任务仍需由 Codex 对照代码和测试更新文档。
- `STATUS.md` 中的安装包是本地、未跟踪产物；应用源码或版本变化后必须重新构建并替换相应证据。

## Next action

无。本任务完成；下一个独立开发需求应新建会话并按 `AGENTS.md` 的固定读取顺序开始。

## Outcome

保留现有产品、架构、开发、状态、决策和任务六类核心结构；明确根入口与确定的会话读取路由；让活动任务显式携带相关上下文；去除状态、产品、开发和变更日志中的重复职责；补充可直接注入 Pi 的执行协议；增加能在 Windows PowerShell 下执行的文档链接与结构检查。最终提交主题：`docs: harden project documentation handoff`；哈希以 Git 历史为准。
