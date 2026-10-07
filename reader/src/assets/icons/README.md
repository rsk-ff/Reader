# Icon sources

Toolbar SVG artwork and the file-format letter outlines come from [Bootstrap Icons 1.13.1](https://github.com/twbs/icons/tree/v1.13.1/icons), used under the adjacent [MIT license](LICENSE). The application mark comes from Microsoft Fluent Emoji under [its MIT license](LICENSE-fluent-emoji). No icon font or runtime dependency is required.

## Application UI and Windows shell

- `shell-reader.svg`: Microsoft Fluent Emoji [Open book / Color](https://github.com/microsoft/fluentui-emoji/blob/e8a613a0baedbca8f144fa70950714f2583318a8/assets/Open%20book/Color/open_book_color.svg), retaining all original paths, gradients and filters. The original 32×32 SVG is placed at x=4 on a 40×40 canvas to reduce visual size and center the actual book body. The source file SHA-256 before wrapping was `DDD214B2383BA8206A8519003FBB8B345EB2A1A77AE860E732B11DAA76776582`. The copyright notice and license are retained in LICENSE-fluent-emoji.
- `shell-pdf.svg`, `shell-markdown.svg`: local white paper, folded corner and colored format badge; format letter outlines come from the corresponding Bootstrap filetype SVG.
- `shell-file.svg`: matching neutral paper for unknown file types, used only within the application.

[`brandIcons.ts`](../../components/brandIcons.ts) is the shared application catalogue: title bar, home, document tabs, recent files, frontend drag previews and native preview windows all use these SVG masters. The HTML favicon also uses shell-reader.svg. Deprecated outline marks and rejected proposals were removed; their history remains in Git. Bundle resources include both copyright/license notices as `licenses/fluent-emoji.txt` and `licenses/bootstrap-icons.txt`.

Run `pnpm --dir reader generate:file-icons` from the repository root. The generator reads shell-reader.svg, shell-pdf.svg and shell-markdown.svg and uses the existing Tauri converter to generate application PNG/ICO/ICNS resources and Windows file association ICOs. The UI imports exactly these masters, so future design changes must regenerate native resources too. UI canvases account for the transparent margins without changing the shapes.

The application ICO keeps every generated size and orders its 256px entry first: Tauri's Windows context decoder uses entry zero for the live window. All three ICOs retain 16/24/32/48/64/256px frames. File association ICO filenames remain unchanged.

## Shared document tools

Both rails use `document-tool-icon` SVG masks at 18px inside the same rail buttons. Masks inherit the control color. Always quote the CSS `url("...")`: Vite may inline SVG as a data URL containing single quotes, which make an unquoted CSS URL invalid.

Markdown uses `type`, `type-bold`, `type-italic`, `type-strikethrough`, `code`, `superscript`, `link-45deg`, `blockquote-left`, `list-ul`, `list-ol`, `list-check`, `code-square`, `calculator`, `table`, `image` and `hr`.

PDF uses `cursor`, `highlighter`, `type-underline`, `type-strikethrough`, `sticky`, `type`, `pen`, `file-earmark-plus-before`, `file-earmark-plus-after` and `file-earmark-minus`.

Most toolbar paths are unchanged Bootstrap artwork. Exceptions: `type-strikethrough.svg` is a locally redrawn compact S and horizontal stroke shared by both rails; `file-earmark-plus-before/after.svg` derive from the retained upstream `file-earmark-plus.svg`, placing the plus above/below the page center while retaining the normal folded corner.
