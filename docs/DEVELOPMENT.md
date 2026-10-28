# Development and release

## Requirements

- Windows 11 或兼容 Windows 环境。
- Node.js、pnpm 和 Rust toolchain。
- Microsoft WebView2。
- `reader/src-tauri/lib/bin/pdfium.dll`；该运行库已跟踪在仓库中。

以下命令均从仓库根目录 `D:\Projects\Reader` 执行。

## Install and run

```powershell
pnpm --dir reader install
pnpm --dir reader tauri dev
```

开发服务器使用 `http://localhost:1420`。若启动失败，先确认没有旧 Reader、Vite、Cargo 或 Rust 构建进程占用端口或 target 文件锁。

打开测试文件：

```powershell
$pdfFixture = (Resolve-Path reader/tests/fixtures/text-3.pdf).Path
$markdownFixture = (Resolve-Path reader/tests/fixtures/gfm.md).Path
pnpm --dir reader tauri dev -- -- -- $pdfFixture $markdownFixture
```

当前 pnpm 脚本调用会消费一个 `--`；余下两个分别分隔 Tauri CLI/Cargo runner 与 Reader 文件参数，因此这里需要三个。直接在 `reader/` 中调用 `node node_modules/@tauri-apps/cli/tauri.js dev -- -- <PDF绝对路径>` 则只需两个。样本必须先解析为绝对路径：本机开发进程从 `src-tauri` 运行，直接传入 `tests/fixtures/...` 会找不到文件。Markdown 检查使用临时副本，避免保存操作修改 Git 样本。

## Automated verification

按风险从局部到完整执行：

```powershell
pnpm --dir reader test
pnpm --dir reader build
cargo test --manifest-path reader/src-tauri/Cargo.toml
cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

GitHub Actions 的 [`ci.yml`](../.github/workflows/ci.yml) 在 `windows-latest` 上对 `dev`/`master` 的推送和合入它们的 PR 依次执行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm test`、`cargo fmt --check`、上面的 clippy 和 `cargo test`（使用仓库中的 PDFium）。浏览器回归测试和视觉验收不在 CI 中。

只改文档时不重复运行应用测试；需要检查 Markdown 链接、Git diff 和工作树状态。

如果直接 Cargo 构建提示找不到 RC.EXE，先查当前 Windows SDK 的 x64 资源编译器，再仅为当前终端设置 `$env:RC` 为其绝对路径。本机 2026-10-12 验证路径为 `C:/Program Files (x86)/Windows Kits/10/bin/10.0.22621.0/x64/rc.exe`；不修改全局 PATH 或 SDK。Tauri CLI 的开发启动另有工具链环境探测。

浏览器回归测试（`pnpm --dir reader test:browser`）使用开发依赖 `@playwright/test` 和已安装的 Microsoft Edge，启动独立的 `127.0.0.1:1422` 服务，入口为 `reader/playwright.config.ts` 和 `reader/tests/browser/`。单独运行某个文件：`pnpm --dir reader test:browser -- pdf-selection.spec.ts`。Vitest 只发现 `src/**/*.test.{ts,tsx}`。

这些测试模拟 Tauri 原生接口（文件读写、PDFium 写入、目录列表、剪贴板），不替代真实桌面中的中文输入法、PDFium 写盘、系统位置和交互验收。

文档结构与内部链接检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1
```

## Visual acceptance

视觉与交互在真实 Windows 桌面中由用户验收，规则见 [`AGENTS.md`](../AGENTS.md#用户视觉验收)。

## Icons

软件与文件图标的 SVG 母版及许可在 [`reader/src/assets/icons/`](../reader/src/assets/icons/README.md)；应用内 [`brandIcons.ts`](../reader/src/components/brandIcons.ts) 与原生生成器共用这些母版。修改母版后重新生成原生资源，并重新打包安装才能同步到 Windows：

```powershell
pnpm --dir reader generate:file-icons
```

- 该命令生成应用 PNG/ICO/ICNS 与 `file-pdf.ico`、`file-markdown.ico`，只复制受管理资源到 `src-tauri/icons`；应用 ICO 的 256px 帧排在首位。
- 文件图标 UI 母版为 22×22 画布；Windows 生成器裁掉外围留边（viewBox `2 2 18 18`），宽高比不变。
- 只替换已安装目录中的 ICO 仅适用于本机临时测试；Explorer 可能缓存旧图标。
- 图标选型资料见 [`design/icon-options/2026-10-07/`](../design/icon-options/2026-10-07/README.md)。

## Release build

```powershell
pnpm --dir reader tauri build
```

输出：

```text
reader/src-tauri/target/release/bundle/nsis/Reader_<version>_x64-setup.exe
reader/src-tauri/target/release/bundle/msi/Reader_<version>_x64_en-US.msi
```

发布前记录源提交、版本、构建退出码、安装包大小、SHA-256、签名状态，以及安装/升级/卸载是否实际验证；最新包登记到 `docs/STATUS.md`。

发布注意事项：

- 文件关联图标：检查生成的 NSIS `installer.nsi` 与 WiX `main.wxs` 包含图标资源和 `DefaultIcon` 注册表项。
- Tauri 会向 MSI 内的二进制写入 `__TAURI_BUNDLE_TYPE_VAR_MSI` 标记，所以安装后 exe 与构建目录 exe 的 SHA-256 不同；比较时应确认差异仅限该标记。
- 普通终端 `/qn` 覆盖升级可能因旧版卸载需要管理员权限而退出 1603（日志错误 1730）。用 `Start-Process msiexec.exe -Verb RunAs` 发起 UAC 提示由用户允许，不要反复重试或修改权限策略。
- 最近文件保存在 WebView2 localStorage，检查版（独立标识或 localhost）与正式版 `com.earendil.reader` / `http://tauri.localhost` 互相隔离；升级保留验证要比较正式版的 `reader.recent-files.v1`。
- 临时检查版可通过 Tauri `--config <临时 JSON>` 设置独立标识和标题，避免干扰正式安装版的单实例和存储；`$env:CARGO_PROFILE_DEV_DEBUG='0'`、`$env:CARGO_INCREMENTAL='0'` 可减少缓存占用。

## Local publication and cleanup

发布包与构建/安装证据保存在仓库根目录的 `releases/<日期>-<版本>-<源码提交>/`，该目录不纳入 Git，清理 `target` 不会影响它。

清理前先核对发布副本，正常关闭开发版（有未保存编辑时不能强杀），停止 Tauri/Vite 服务。只删除可重新生成的目录：

- `reader/src-tauri/target/`（Rust 编译缓存，可用 `cargo clean`）
- `reader/dist/`
- `reader/test-results/`、`reader/playwright-report/`、`reader/node_modules/.vite/`

保留源码、锁文件、`node_modules`、受跟踪的 PDFium、`releases/` 和用户安装数据；不清理全局 pnpm/Cargo 缓存。

## Repository layout

```text
Reader/
├── AGENTS.md / CLAUDE.md
├── README.md
├── CHANGELOG.md
├── .github/workflows/ci.yml  Windows CI
├── scripts/
│   └── check-docs.ps1
├── releases/                  Ignored local installers and release evidence
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── STATUS.md
│   ├── decisions/
│   └── tasks/
└── reader/
    ├── src/                    React/TypeScript frontend
    │   └── assets/icons/       SVG icon masters and licenses
    ├── src-tauri/              Rust/Tauri backend and bundle config
    │   ├── icons/              Application and file association icons
    │   └── windows/            NSIS hooks and WiX fragments
    └── tests/fixtures/         PDF and Markdown test files
```
