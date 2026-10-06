# MSI 构建与覆盖安装

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-05`
- Last updated: `2026-10-05`
- Base branch: `master`
- Base commit: `7273983`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

按用户要求，以已验收的应用源码构建本地 MSI 安装包并覆盖安装，然后启动安装版 Reader。

## Related context

- [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) — 发布命令、文件关联检查和 MSI 二进制打包标记。
- [`../../STATUS.md`](../../STATUS.md) — 已验收源码和现有本地安装包。
- [`../../../reader/src-tauri/tauri.conf.json`](../../../reader/src-tauri/tauri.conf.json) — 版本、资源与 WiX 配置。
- [`../../../reader/src-tauri/windows/file-association-icons.wxs`](../../../reader/src-tauri/windows/file-association-icons.wxs) — 安装后的文件关联图标。

## Current behavior

- 工作树干净，当前 `master` 为 `7273983`，应用源码基线 `c267f35` 已验收。
- 现有 MSI 来自 2026-08-30，版本 `0.1.0`，不含本次 PDF 文字选择修复。
- 开始时未发现正在运行的 Reader 进程。

## Expected behavior

新 MSI 包含已验收修复，覆盖现有安装并保持文件关联和专用图标；安装后的 Reader 可以启动。

## Scope

本地 MSI 构建、包信息/资源/升级核对、用户授权的覆盖安装、启动、发布与任务文档。

## Out of scope

修改应用行为、NSIS 重建、外部上传发布、卸载测试及目录任务验收。

## Constraints and decisions

- 保持版本 `0.1.0`，沿用现有升级身份；安装前核对同版本升级表和当前安装信息。
- 由 Codex 直接完成，Pi 不调用；不新增依赖或改动生产配置。
- 复用刚通过的 108 项前端、37 项浏览器测试；MSI 构建重新执行 TypeScript/前端与 Rust release 编译，不因纯打包重复测试套件。
- 不强制结束包含未保存编辑的应用；桌面视觉/交互由用户检查。

## Acceptance criteria

- [x] MSI 构建成功，记录源提交、大小、哈希与签名。
- [x] 升级信息及 PDF/Markdown 文件关联资源正确。
- [x] 覆盖安装成功，新产品注册且旧 MSI 注册移除，安装文件与构建匹配。
- [x] 启动安装后的 Reader，交付简短检查清单。
- [x] 文档检查通过、完整 diff 核对、本地提交且工作树干净（提交主题见 Outcome）。

## Progress

- [x] 恢复上下文与确定打包范围。
- [x] 构建与核对。
- [x] 覆盖安装与启动。
- [ ] 用户安装版复验。

## Discoveries

- 用户明确要求“发布一个 msi 安装包，并帮我覆盖安装”，授权本地构建及安装；不包含外部发布。
- 原 MSI 产品为 `{F234FE2F-E737-45B3-8DB4-D7EDEC3B0A62}`；另有历史 NSIS 卸载登记，两者共用用户本地安装目录，本次不额外卸载 NSIS。
- 新 MSI 产品为 `{0BCEC9F0-9CE3-4EF1-8CE3-CBA1F61806AD}`，版本 `0.1.0`、`ALLUSERS=1`，UpgradeCode 保持 `{8C88C1AD-4BA2-5A3C-9E5F-45B76A862470}`；升级表最小版本 `0`、无最大版本、属性 `257`，可替换旧同版本 MSI。

## Verification

- `git diff --exit-code c267f35 HEAD -- reader` — passed；应用代码与已验收版本一致。
- `pnpm --dir reader tauri build --bundles msi` — passed，退出码 `0`；TypeScript/前端 1172 模块、Rust release 编译、WiX candle/light 完成，只有既有大 chunk 提示。构建日志 `reader/msi-build-20261005.log`（忽略的本地文件）。
- MSI：`reader/src-tauri/target/release/bundle/msi/Reader_0.1.0_x64_en-US.msi`，20,983,808 字节，SHA-256 `A7AF5384F30ACFC9884533787AD3DFFE8549C06CD21A4EB300D08DD888C72AE6`，签名状态 `NotSigned`。
- Windows Installer 数据库核对：包内 `reader.exe` 为 17,300,480 字节，含 `pdfium.dll`、两种专用 ICO；Registry 表含五个 PDF/Markdown `DefaultIcon` 项，Upgrade 表保持同版本升级关系。
- `msiexec /i <MSI> /passive /norestart /L*v <log>` — passed，退出码 `0`，日志确认 `Installation completed successfully`。Windows Installer 要求管理员权限时已提示用户处理系统确认，安装随后完成；不修改提升权限策略。日志 `C:\Users\fanq1\AppData\Local\Temp\Reader-MSI-Install-20261005.log`。
- 升级日志识别旧产品 `{F234FE2F-E737-45B3-8DB4-D7EDEC3B0A62}` 并执行 RemoveExistingProducts；注册表核对仅有新 MSI `{0BCEC9F0-9CE3-4EF1-8CE3-CBA1F61806AD}`，旧 MSI 注册已移除。历史 NSIS 登记保持原状，未额外卸载。
- 安装目录 `C:\Users\fanq1\AppData\Local\Reader`；安装后 `reader.exe` 为 17,300,480 字节，SHA-256 `4E74C686FC0637EE4BB0A325A7AE16C2608647170A8C0785423B4443658C45AE`。与当前 release 二进制逐字节比较仅打包标记 `UNK` → `MSI` 的三个字节不同，归一后完全一致；PDFium 与两个 ICO 的 SHA-256 均匹配源资源。五个安装后的 DefaultIcon 指向安装目录中对应 ICO。
- 传入临时三行 PDF 副本 `C:\Users\fanq1\AppData\Local\Temp\Reader-MSI-selection-check-20261005.pdf`。启动请求进程已退出，后续确认持续运行的安装版 PID `82732`，路径为上述安装目录中的 `reader.exe`，窗口句柄 `1509556` 非零；不把启动证据当作视觉验收。
- 文档检查通过：27 个 Markdown、2 项活动任务、9 项归档任务、2 项决策；`git diff --check` 通过，提交范围仅为发布记录、状态及本任务文件。

## User acceptance

waiting：当前安装版中检查 PDF 左侧空白起点、末行下方补全与拖回文字的终点，以及已有选区经 Ctrl＋滚轮后的保留。源码已在前一任务验收，本次安装版尚未独立验收。

## Risks and remaining work

- 构建、覆盖安装及文件核对已完成，安装版视觉/交互仍待用户确认；沿用项目现有未签名安装包方式。
- 本次不测试卸载、不重建 NSIS、不重复前端/浏览器和 Rust 测试套件，不进行外部上传。

## Next action

等待用户复验安装版 PDF 选择及缩放；通过后归档本任务。

## Outcome

已从 `7273983`（应用源码 `c267f35`）构建 `0.1.0` MSI，并成功覆盖安装及启动；发布收尾文档提交主题为 `docs: record MSI build and upgrade installation`，实际哈希以 Git 历史为准。当前保留 active 等待安装版交互复验；Pi 未调用，无会话 ID。
