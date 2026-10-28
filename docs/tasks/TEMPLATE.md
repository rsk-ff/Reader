# <Task title>

<!--
任务文件用于多回合任务和跨会话交接，由代理创建和维护，用户不需要编辑。
放在 docs/tasks/active/YYYY-MM-DD-short-name.md，并在 docs/STATUS.md 的 Active task 中索引。
状态：in_progress（可继续）、waiting_user_acceptance（等用户验收）、blocked（写明解除条件）。
完成或取消后，把结果写入 STATUS.md / CHANGELOG.md，再删除本文件。
文件必须自包含：新会话只读本文件、Related context 和代码就能继续。
-->

- Status: `in_progress`
- Created: `<YYYY-MM-DD>`
- Base: `<branch>@<commit>`

## Goal

完成后用户可以做什么，为什么需要。

## Related context

- 继续本任务必须读的文档和代码入口（至少一个链接）。

## Scope and acceptance

- 现状 → 期望行为。
- 允许修改的范围；明确不处理的相邻问题。
- [ ] 用户可见的验收标准。
- [ ] 自动化验证命令。

## Progress and verification

- 已完成的步骤、关键发现和决定，以及实际运行的验证及结果。

## User acceptance

需要用户检查的项目和反馈；未反馈时写 `waiting`。

## Next action

新会话应执行的第一个具体动作。
