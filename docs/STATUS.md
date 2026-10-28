# Current status

- Last updated: 2026-10-28
- Application version: `0.1.0`
- Latest user-accepted source baseline: `b2c1553` — Markdown 侧栏调宽与 PDF/Markdown 拖动收起

## Active task

- None.

## Pending user acceptance

- Markdown 保存保真（保留换行符/BOM、检测外部修改、非 UTF-8 中文提示）：分支 `claude/project-thread-xvta0x`，PR #3 合入 `dev`。
- 新标签页本地文件浏览（含 OneDrive/Dropbox 入口、视觉重做）已于 2026-10-27 验收，尚未正式打包安装。

## Recently merged into dev

- 2026-10-27（PR #1）：全仓审查 P0 修复，Markdown 链接与错误提示框修复。
- 2026-10-28（PR #2）：审查 P1/P2 修复（Markdown 读写限制在已打开文档、批注更新单次写入、标签/窗口健壮性）。

## Open follow-ups

- 批注 ID 仍存放在作者字段；pdfium-render 0.9 不公开 `/NM` 写入，需另行处理。

## Implemented

用户可见行为的完整契约见 [`PRODUCT.md`](PRODUCT.md)。以下能力均已实现并经用户验收：

- PDF：阅读、搜索、层级目录（过滤空白页占位书签）、缩略图、打印、批注、页面增删；未嵌入 CJK 字体的 PDF 可正常显示；行侧空白起点选字、末行补全，缩放与连续 Ctrl＋滚轮期间保留选区。
- Markdown：所见即所得/源码模式、显式保存、右侧格式工具栏、目录侧栏（调宽与完全收起）、Crepe 官方 Frame 主题、图片内嵌保存、打印。
- 新标签页：本地磁盘/目录浏览、固定与常用文件夹、最近文件、目录内新建 Markdown、OneDrive/Dropbox 入口、鼠标侧键导航。
- 窗口与标签：切换、关闭、排序、拖出与跨窗口停靠，自定义标题栏与 Snap Layout，文件关联、拖放打开、单实例转发。
- 软件、PDF、Markdown 图标在应用内与 Windows 中统一，安装包为两类文件注册专用 `DefaultIcon`。

## Latest local release artifacts

2026-10-09 从 `b2c1553` 生成，标识 `com.earendil.reader`，本机 MSI 已覆盖安装。包与构建/安装证据保存在 `releases/2026-10-09-0.1.0-b2c1553/`（不纳入 Git，未上传外部平台）。

| Format | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| MSI | `releases/2026-10-09-0.1.0-b2c1553/Reader_0.1.0_x64_en-US.msi` | 20,930,560 | `F2816B7826322C8FBB4B9CCA5A86A55809FA67BC27621073DCA34FF71695244D` | `NotSigned` |
| NSIS | `releases/2026-10-09-0.1.0-b2c1553/Reader_0.1.0_x64-setup.exe` | 16,040,985 | `9A6EA5B12BA4325AA86DBFCA9D35683D6D61451E98FDAAD764A6B7F8FE55EB5D` | `NotSigned` |

## Known limitations

- 只有当前会话中由应用创建且接入自定义覆盖层的批注支持双击删除。
- PDF 修改立即写入文件；关闭文档不能回滚这些写操作。
- 标签跨原生窗口移动不会迁移滚动、缩放等瞬时状态；未保存 Markdown 的跨窗口移动被阻止。
- 未保存 Markdown 没有崩溃恢复。
- 源码/所见即所得切换不保留跨模式撤销历史。
- 打印会顺序渲染所有页面，对超大文档尚未优化。
- Milkdown 编辑器虽然延迟加载，仍产生约 1.5 MB 的压缩 chunk。
- 仅发布 Windows 版，安装包没有代码签名，可能触发 SmartScreen 提示。
