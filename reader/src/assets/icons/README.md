# Icon sources

All SVG files come from [Bootstrap Icons 1.13.1](https://github.com/twbs/icons/tree/v1.13.1/icons), used under the adjacent [MIT license](LICENSE). Only the three document/application marks have modified fill colors; toolbar paths are unchanged.

- `journal-bookmark-fill.svg`: Reader application mark.
- `filetype-pdf.svg`: PDF document mark.
- `filetype-md.svg`: Markdown document mark.

Run `pnpm --dir reader generate:file-icons` from the repository root to generate the application PNG/ICO/ICNS resources and Windows file association ICOs with the existing Tauri icon converter. No icon font or runtime dependency is required.

The Markdown rail uses the same upstream collection: `type`, `type-bold`, `type-italic`, `type-strikethrough`, `code`, `superscript`, `link-45deg`, `blockquote-left`, `list-ul`, `list-ol`, `list-check`, `code-square`, `calculator`, `table`, `image` and `hr`. SVG masks inherit the control color without adding an icon font or dependency.

The application ICO keeps every generated size and orders its 256px entry first: Tauri's Windows context decoder uses entry zero for the live window. The title bar uses the SVG directly for crisp display at different scale factors. File association ICO filenames and their size variants remain unchanged.
