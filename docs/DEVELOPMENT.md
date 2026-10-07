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
pnpm --dir reader tauri dev -- -- -- tests/fixtures/text-3.pdf tests/fixtures/gfm.md
```

当前 pnpm 脚本调用会消费一个 `--`；余下两个分别分隔 Tauri CLI/Cargo runner 与 Reader 文件参数，因此这里需要三个。已核对本机 CLI 输出确实收到两个分隔符。直接在 `reader/` 中调用 `node node_modules/@tauri-apps/cli/tauri.js dev -- -- tests/fixtures/text-3.pdf` 则只需两个；本次开发窗口启动已验证这一方式，Cargo 选项不会混入应用参数。

## Automated verification

按风险从局部到完整执行：

```powershell
pnpm --dir reader test
pnpm --dir reader build
cargo test --manifest-path reader/src-tauri/Cargo.toml
cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

只改文档时不重复运行应用测试；需要检查 Markdown 链接、Git diff 和工作树状态。

Markdown 编辑器生命周期回归测试使用开发依赖 `jsdom` 挂载真实 React 组件，并模拟 Crepe 引擎与 Tauri 边界；覆盖实例稳定、模式切换、异步清理、保存及放弃修改。运行 `pnpm --dir reader test src/documents/markdown/MilkdownCrepe.test.tsx` 可单独检查；这不替代真实桌面中文输入法与交互验收。

浏览器功能回归测试运行 `pnpm --dir reader test:browser`，使用开发依赖 `@playwright/test` 和已安装的 Microsoft Edge，无需另行下载浏览器。测试启动独立的 `127.0.0.1:1422` 服务，不生成截图、视频或 trace。入口为 `reader/playwright.config.ts` 和 `reader/tests/browser/`。Vitest 仅发现 `src/**/*.test.{ts,tsx}`，避免混跑 Playwright 用例。此测试仍不替代用户在真实 Reader 中的中文输入法和交互验收。

- Markdown：加载真实 React/Crepe/CSS，仅模拟原生文件接口；以坐标和内容断言验证选区稳定、连续输入及撤销。
- PDF：加载真实 `PdfViewer`、PDF.js、文字层和应用 CSS，仅把原生文件协议映射到 `tests/fixtures/text-3.pdf` 并模拟批注写入；通过真实鼠标拖动检查空白起点、文字内部、反向、跨行、缩放/滚动及文字高亮的选区几何。终点回归检查向下拖过末行、反向拖过首行、右侧空白、拖回文字恢复精确终点、释放后稳定及完整末行批注几何。另检查已有选区经按钮/快捷键/Ctrl＋滚轮/适合模式缩放后的内容、方向和几何，以及搜索高亮重绘和取消选区时的行为。连续滚轮回归在重绘期间立即断言文字内容、选区绘制层与文字范围重叠，并检查跨页文字层；复制回归用独立事件剪贴板触发真实 PDF.js copy 处理器，不读写 Windows 剪贴板。单独运行：`pnpm --dir reader test:browser -- pdf-selection.spec.ts`。模拟批注写入不证明 PDFium 文件写入结果，事件剪贴板测试不替代桌面 Ctrl+C 验收。

文档结构与内部链接检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1
```

## Visual acceptance

视觉与交互必须在真实 Windows 桌面环境中验收；职责、启动方式和反馈记录遵循 [`AGENTS.md`](../AGENTS.md#user-visual-acceptance)，检查项保存在对应活动任务文件中。

## Release build

软件与文件图标的 统一 SVG 源文件在 [`reader/src/assets/icons/`](../reader/src/assets/icons/README.md)，采用 Bootstrap Icons 1.13.1 并保留 MIT 许可。需要修改设计时编辑 SVG 后重新生成：

```powershell
pnpm --dir reader generate:file-icons
```

该命令使用项目已有的 Tauri 图标转换器生成应用 PNG/ICO/ICNS 与两种文件 ICO，不新增依赖；在系统临时目录转换，仅将受管理的资源复制到 `src-tauri/icons`。虽然保留原命令名称，它现在覆盖软件和文件两类图标。

正式更换 PDF/Markdown 文件关联图标时，保持 `file-pdf.ico` 和 `file-markdown.ico` 文件名不变即可；如果使用外部设计工具制作 ICO，则直接替换这两个生成文件，再重新构建安装包。仅替换已安装目录中的 ICO 只能用于本机临时测试，正式交付仍需重新打包并安装，因为安装器会把资源复制到安装目录，Explorer 也可能缓存旧图标。

图标资源变更后重新生成 Windows bundle：

```powershell
pnpm --dir reader tauri build
```

生成全部 Windows bundle：

```powershell
pnpm --dir reader tauri build
```

典型输出：

```text
reader/src-tauri/target/release/bundle/nsis/Reader_<version>_x64-setup.exe
reader/src-tauri/target/release/bundle/msi/Reader_<version>_x64_en-US.msi
```

发布前至少记录：源提交、版本、构建退出码、安装包大小、SHA-256、签名状态，以及安装/升级/卸载是否实际验证。Windows 文件关联图标还应检查生成的 NSIS `installer.nsi` 和 WiX `main.wxs` 是否分别包含图标资源与 `DefaultIcon` 注册表项。证据写入对应发布任务，仍影响当前使用的限制同步到 `docs/STATUS.md`。

核对安装后的可执行文件时，注意 Tauri 会向 MSI 内的二进制写入 `__TAURI_BUNDLE_TYPE_VAR_MSI`，而构建目录的标记可在打包结束后恢复为 `UNK`；这会导致 SHA-256 不同。应检查包内文件或逐字节确认差异仅限包类型标记，不能仅据这两个哈希不同判定安装保留了旧程序。

## Repository layout

```text
Reader/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── scripts/
│   └── check-docs.ps1
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── STATUS.md
│   ├── PI_WORKFLOW.md
│   ├── PI_EXECUTOR_PROTOCOL.md
│   ├── decisions/
│   ├── tasks/
│   └── archive/
└── reader/
    ├── src/                    React/TypeScript frontend
    ├── src-tauri/              Rust/Tauri backend and bundle config
    │   ├── icons/              Application and file association icons
    │   └── windows/            NSIS hooks and WiX fragments
    └── tests/fixtures/         PDF and Markdown test files
```
