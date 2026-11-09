# Icon sources

Interface icons come from [Lucide](https://lucide.dev) under the adjacent [ISC license](LICENSE-lucide); see Interface icons below. The application logo and the Windows file icons are original Reader artwork. No icon font or runtime dependency is required.

## Application logo and Windows file icons

- `shell-reader.svg`: the Reader logo, a Fluent-style ginkgo leaf (two gold gradient halves, a soft highlight, vein lines and a drop shadow) on a transparent 64×64 canvas. It is option 01 of the "Logo Fluent 质感" design board, chosen during the 2026-11 light-theme redesign. It drives the window/taskbar icon, the installer and the HTML favicon.
- `shell-pdf.svg`, `shell-markdown.svg`: Explorer icons for associated files. A plain white page (no folded corner) carries a centred ginkgo mark and a centred coloured tag, slightly wider than the page, with the type written as stroked letters (`PDF`, `MD`). Tag colours stay on the accepted file-type palette: PDF red `#cf6e6e`→`#a84c4c`, Markdown blue `#6f97c9`→`#4a70a3`. Letters are paths, not text, so rendering does not depend on installed fonts.
- `small/file-{pdf,markdown}-{16,20,24}.png`: hand-placed pixel art for the 16/20/24px ICO frames (Explorer small icons and details view at 100%/125%/150% scaling): 1px page outline without folded corner, faint text lines and a coloured tag with 3×5 pixel letters `PDF` / `MD`; no ginkgo (it cannot fit legibly). Page and tag keep the full master's proportions so the tag sits in the same place at every size. Drawn by `scripts/draw-small-file-icons.py` (needs Pillow; rerun only when changing them), committed so builds need no Python.
- `shell-file.svg`: neutral paper for unknown file types (not used for native icons).

In the interface, tabs and file lists draw document types with `DocumentTypeIcon` (Lucide page outline plus a colour band), not with these masters.

Run `pnpm --dir reader generate:file-icons` from the repository root after changing any master. The generator feeds the three SVGs to the Tauri icon converter and writes the application PNG/ICO/ICNS set plus `file-pdf.ico` and `file-markdown.ico` into `reader/src-tauri/icons/`. Each file ICO takes its 16/20/24px frames from the pixel PNGs and the larger frames from the full master. The application ICO keeps every generated size and orders its 256px entry first, because Tauri's Windows decoder uses entry zero for the live window. All ICOs carry 16/24/32/48/64/256px frames; file association ICO filenames are unchanged.

The Fluent Emoji, Material Icon Theme and Pictogrammers license texts in this folder belong to earlier icon masters (see Git history) and are still bundled under `licenses/`.

## Interface icons

[`UiIcon`](../../components/UiIcon.tsx) draws every toolbar, sidebar and file-browser icon from
[`lucideIcons.ts`](../../components/lucideIcons.ts): Lucide path data on a 24×24 grid with a 1.6px
round stroke in `currentColor`. The data was exported as SVG from the Lucide set hosted by Streamline
and converted once; there is no icon font or runtime dependency. To add an icon, append its Lucide
path data under a new `UiIconName` key.

The title bar shows no application icon; the window and taskbar icon use `shell-reader.svg`.
