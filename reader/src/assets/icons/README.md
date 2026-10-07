# Icon sources

Base SVG artwork comes from [Bootstrap Icons 1.13.1](https://github.com/twbs/icons/tree/v1.13.1/icons), used under the adjacent [MIT license](LICENSE). No icon font or runtime dependency is required.

## Application UI and Windows shell

- `journal-bookmark-fill.svg`, `filetype-pdf.svg`, `filetype-md.svg`: recolored upstream marks for the title bar, tabs and home screen.
- `shell-reader.svg`: local solid book and bookmark drawing, based on the same application symbol, with intentional transparent outer margins.
- `shell-pdf.svg`, `shell-markdown.svg`: local white paper, folded corner and colored format badge; format letter outlines come from the corresponding Bootstrap filetype SVG.

The solid application mark was rejected by the user on 2026-10-07. Three replacement [vector proposals and a size proof](proposals/README.md) are awaiting direction selection; none has replaced the current generator input or installed application yet.

Run `pnpm --dir reader generate:file-icons` from the repository root. The generator reads only the three `shell-*.svg` sources and uses the existing Tauri converter to generate application PNG/ICO/ICNS resources and Windows file association ICOs. Changing the system marks does not alter the compact in-app marks.

The application ICO keeps every generated size and orders its 256px entry first: Tauri's Windows context decoder uses entry zero for the live window. All three ICOs retain 16/24/32/48/64/256px frames. File association ICO filenames remain unchanged.

## Shared document tools

Both rails use `document-tool-icon` SVG masks at 18px inside the same rail buttons. Masks inherit the control color. Always quote the CSS `url("...")`: Vite may inline SVG as a data URL containing single quotes, which make an unquoted CSS URL invalid.

Markdown uses `type`, `type-bold`, `type-italic`, `type-strikethrough`, `code`, `superscript`, `link-45deg`, `blockquote-left`, `list-ul`, `list-ol`, `list-check`, `code-square`, `calculator`, `table`, `image` and `hr`.

PDF uses `cursor`, `highlighter`, `type-underline`, `type-strikethrough`, `sticky`, `type`, `pen`, `file-earmark-plus-before`, `file-earmark-plus-after` and `file-earmark-minus`.

Most toolbar paths are unchanged Bootstrap artwork. Exceptions: `type-strikethrough.svg` is a locally redrawn compact S and horizontal stroke shared by both rails; `file-earmark-plus-before/after.svg` derive from the retained upstream `file-earmark-plus.svg`, placing the plus above/below the page center while retaining the normal folded corner.
