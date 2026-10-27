# Fix PDF outline sidebar layout and placeholder bookmarks

- Status: `done`
- Owner: Codex
- Created: `2026-08-29`
- Last updated: `2026-10-27`
- Base branch: `master`
- Base commit: `1f64cd9`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

Make the PDF outline sidebar display one bookmark per row with visible hierarchy, and omit generated blank-page placeholder bookmarks that do not represent useful document sections.

## Related context

- [`docs/PRODUCT.md`](../../PRODUCT.md)
- [`../../../reader/src/documents/pdf/PdfViewer.tsx`](../../../reader/src/documents/pdf/PdfViewer.tsx)
- [`../../../reader/src/documents/pdf/PdfSidebar.tsx`](../../../reader/src/documents/pdf/PdfSidebar.tsx)
- [`../../../reader/src/styles.css`](../../../reader/src/styles.css)

## Current behavior

- In the supplied screenshot, outline buttons flow horizontally and wrap instead of forming a vertical list.
- The outline container uses the class `pdf-outline`, while the column layout rule targets the nonexistent class `pdf-sidebar-outline`.
- Reproduction sample: `C:\Users\fanq1\Desktop\RadiationMapAnalyser用户手册v1.1(英文).pdf`, SHA-256 `A8E780E70FF05018DE743972EC37FB1D3224F354DDF3C237E5684F2598CC084A`.
- The sample contains 20 pages and 17 native PDF bookmarks. Two top-level bookmarks are titled `空白页面` and target pages 2 and 4, so Reader currently exposes source-document placeholders verbatim.

## Expected behavior

- Each outline entry occupies one full row in document order.
- Child entries remain indented relative to their parent.
- Exact blank-page placeholder titles such as `空白页面` and `Blank Page` are omitted after whitespace/case normalization; unrelated titles remain untouched.
- Clicking every retained outline entry preserves the existing PDF.js destination/link behavior.

## Scope

- PDF outline normalization/flattening.
- PDF outline sidebar layout styles.
- Focused automated tests and user-visible documentation/status updates.

## Out of scope

- Editing the source PDF or its bookmarks.
- Adding collapse/expand controls or redesigning the sidebar.
- Inferring whether arbitrary destination pages are visually blank.

## Constraints and decisions

- Preserve source order and hierarchy depth for retained entries.
- If a filtered placeholder ever has children, retain its children at the placeholder's depth rather than discarding a subtree.
- Filter only exact known placeholder labels after normalization to avoid hiding legitimate section titles that merely contain the words “blank page”.

## Acceptance criteria

- [x] The supplied PDF shows one outline entry per row with indentation for levels 2 and 3.
- [x] The two `空白页面` entries are absent from the supplied PDF's outline.
- [x] Retained entries still navigate to their original destinations.
- [x] Unit tests cover ordering, depth, exact placeholder filtering, normalization, and child preservation.
- [x] Frontend tests and production build pass.
- [x] Required status/product/changelog documentation is current and the Git worktree is clean after commit.

## Progress

- Reproduced the native bookmark structure with `pypdf`.
- Located the CSS selector mismatch and the unfiltered `flattenOutline` path.
- Corrected the outline container selector and extracted a tested pure outline flattener/filter.
- Updated the product contract, changelog, and global status for the user-visible change.
- Launched the committed Tauri development build with the supplied PDF as an application argument.

## Discoveries

- The unwanted `空白页面` entries originate in the PDF's native outline rather than being synthesized by Reader.
- The horizontal wrapping is caused by a class-selector mismatch, not by corrupted outline hierarchy data.

## Verification

- `pypdf` inspection: 20 pages, 17 bookmarks, including `空白页面` on pages 2 and 4.
- `pnpm --dir reader test`: 15 test files and 100 tests passed.
- `pnpm --dir reader build`: passed; only the existing large-chunk warning remains.
- `git diff --check`: passed.
- Rust checks were not rerun because the implementation changes only frontend TypeScript/CSS.

## User acceptance

- 2026-10-27：用户验收通过（目录布局、层级、空白页书签过滤与跳转）。

## Risks and remaining work

- Exact-label filtering intentionally does not try to identify every localized blank-page label.

## Next action

None; task archived.

## Outcome

Implemented, automatically verified, and accepted by the user on 2026-10-27.
