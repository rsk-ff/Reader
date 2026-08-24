# Decision records

本目录记录会长期影响实现、以后可能被重新质疑的决定及其理由。代码细节和临时任务进度不写成决策记录。

状态：

- `Accepted`：当前有效。
- `Superseded`：已被后续记录替代，保留历史。
- `Proposed`：尚未最终采用。

索引：

- [`0001-document-engine-split.md`](0001-document-engine-split.md) — PDF.js 负责读取，PDFium 负责修改。
- [`0002-repository-owned-project-memory.md`](0002-repository-owned-project-memory.md) — 项目与任务上下文由仓库文档承载。

新决定使用四位编号，并至少包含 Context、Decision、Consequences 和 Evidence。

- Evidence 应链接当前代码、测试或相关项目文档，不能只引用聊天记录。
- 已接受决定发生实质变化时新增记录，并在新旧记录中标明 `Supersedes` / `Superseded by`；不要静默重写历史理由。
- 本索引必须列出所有 `Accepted`、`Proposed` 和 `Superseded` 记录。
