# 0003 — 常用文件夹的有效访问与 frecency

- Status: Accepted
- Date: 2026-10-11

## Context

首轮实现将每次目录点击计次，又直接用最近文件数量补齐常用，因此一次逐级查找就把磁盘根和途经的父目录挤入侧栏。用户明确要求“常用”必须代表反复使用，并优先复用成熟做法。

## Decision

参考 [zoxide 官方 Algorithm](https://github.com/ajeetdsouza/zoxide/wiki/Algorithm)（2026-10-11 核查），独立重写其公开算法规则：访问有效时 rank 加 1；按最后有效访问时间乘权重，1 小时内 ×4、1 天内 ×2、1 周内 ×0.5、更早 ×0.25。总 rank 超过 2000 时统一缩至 1800，去掉 rank <1 的条目。仅复用算法思想与参数，不复制上游源码或引入依赖。

Reader 的额外资格规则由本项目决定，不声称来自 zoxide：

- 成功打开/首次保存文件在直接父目录记有效访问；外部启动的文件同样覆盖。更新快照和重复通知不另计。
- 浏览目录需要连续 30 秒处于活动标签、可见且聚焦窗口；快速途经、后台目录、失败请求不计。
- 同目录 30 分钟内的有效事件合并为一次，刷新及同一次导航中的焦点变化不累加。
- 至少 3 次有效访问才展示；排除磁盘/共享根目录及已固定目录；超过 90 天未有效使用的不展示。展示最多 8 项，按 frecency、最近时间、路径排序。
- 默认桌面/下载/文档/用户位置是固定项，可右键取消；默认项隐藏状态、用户固定项与计分单独持久化。
- 沿用 reader.folder-locations.v1 存储键，用 version:2 明确新语义；保留旧固定项，不将旧任意点击计数当有效事件。首次启动仅以原最近文件带时间的真实打开记录初始化，仍执行 30 分钟合并，无时间记录不推测。最近文件 v1 内容不改。

## Consequences

初次使用的常用区域可以为空；不会为了填满侧栏而推荐一次经过的目录。当天重复实用也能形成常用，频率与时间分开，旧高频目录逐渐让位于近期使用。阈值可根据实际验收调整，但应有对应的时间/资格/迁移测试；UI 不展示算法或调参控件。

## Evidence

- 规则和存储迁移见 [`folderLocations.ts`](../../reader/src/workspace/folderLocations.ts)，资格/时间边界/老化/迁移测试见[对应单元测试](../../reader/src/workspace/folderLocations.test.ts)。
- 前台停留与活动标签由 [`NewTabPage.tsx`](../../reader/src/components/NewTabPage.tsx) 管理，模拟时钟验证见 [`new-tab.spec.ts`](../../reader/tests/browser/new-tab.spec.ts)。
- 原生打开/首次保存接入见 [`store.ts`](../../reader/src/workspace/store.ts)，实际验证与验收记录见[已归档任务](../tasks/archive/2026-10-10-local-file-home.md)。
