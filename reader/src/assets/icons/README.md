# Icon sources

The three SVG files come from [Bootstrap Icons 1.13.1](https://github.com/twbs/icons/tree/v1.13.1/icons), used under the adjacent [MIT license](LICENSE). Only the fill color has been changed.

- `journal-bookmark-fill.svg`: Reader application mark.
- `filetype-pdf.svg`: PDF document mark.
- `filetype-md.svg`: Markdown document mark.

Run `pnpm --dir reader generate:file-icons` from the repository root to generate the application PNG/ICO/ICNS resources and Windows file association ICOs with the existing Tauri icon converter. No icon font or runtime dependency is required.
