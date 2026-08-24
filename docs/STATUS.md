# Current status

- Last updated: 2026-08-24
- Application version: `0.1.0`
- Current application source baseline: `1f5bb93 feat: complete tab docking and markdown outline`

## Active task

- [`tasks/active/2026-08-24-tab-drag-interaction.md`](tasks/active/2026-08-24-tab-drag-interaction.md) — `waiting_user_acceptance`；已修复释放合并、跨窗口跟随预览和释放点定位；窗口抬升限于标签页栏，拖动物保持在目标之上且来源窗口可重新上浮，自动化验证已通过。

## Implemented at the application baseline

- PDF 阅读、搜索、目录、缩略图、打印、批注和页面增删。
- 可填写 PDF 的表单内容只渲染一次，不再出现已复现的文字重影。
- Markdown 所见即所得/源码模式、显式保存、等宽代码字体、列表对齐和左侧目录。
- 标签切换、关闭、排序、拖出窗口、单标签窗口拖动和跨窗口停靠。
- Windows 自定义标题栏、原生窗口按钮和 Snap Layout。
- 文件关联、拖放打开、单实例文件转发和上次会话恢复。

## Recorded automated verification

2026-08-23 在应用代码基线 `1f5bb93` 上记录：

- Frontend tests: `88 passed`。
- Rust tests: `32 passed`。
- TypeScript/frontend production build: passed。
- `cargo fmt --check`: passed。
- `cargo check`: passed。
- Tauri release build: passed。
- NSIS 和 MSI `0.1.0` 安装包已生成并计算 SHA-256。

## Current release artifacts

以下本地文件由应用代码基线 `1f5bb93` 生成，不纳入 Git；应用源码或版本变化后必须重新构建并替换本节证据。

| Format | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| NSIS | `reader/src-tauri/target/release/bundle/nsis/Reader_0.1.0_x64-setup.exe` | 15,895,941 | `5F1C74BA16AABACA97DB049CE4D86E2BEF2F194E74F77E423892559748B5857B` | `NotSigned` |
| MSI | `reader/src-tauri/target/release/bundle/msi/Reader_0.1.0_x64_en-US.msi` | 20,807,680 | `D5C7273EBD93B5C4C87C14BCE58ED19BF7F7312763C12E0232578E48142B323F` | `NotSigned` |

## Waiting for user acceptance

- 标签拖动修复：单标签窗口释放即合并、跨窗口跟随预览、释放点窗口定位、只由标签页栏触发的窗口抬升，以及拖动物与来源窗口的正确 Z 序。
- Markdown 左侧目录、代码字体和列表对齐的最终视觉效果。
- `0.1.0` 安装包的实际安装、升级和卸载流程。

这些项目没有用户验收前，不得标记为完全通过。

## Known limitations

- 只有当前会话中由应用创建且接入自定义覆盖层的批注支持双击删除。
- PDF 修改立即写入文件；关闭文档不能回滚这些写操作。
- 标签跨原生窗口移动不会迁移前端滚动、缩放等瞬时状态；未保存 Markdown 的跨窗口移动被阻止。
- 未保存 Markdown 没有崩溃恢复 sidecar。
- 打印会顺序渲染所有页面，对超大文档尚未优化。
- Milkdown 编辑器虽然延迟加载，仍会产生约 1.5 MB 的压缩 chunk。
- 当前发布目标为 Windows，安装包没有代码签名，可能触发 SmartScreen 提示。
