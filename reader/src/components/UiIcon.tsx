import { lucideIcons } from "./lucideIcons";

export type UiIconName = keyof typeof lucideIcons;

/** Letter-shaped icons fill the whole 24-unit grid, so next to pictograms they
 * read larger and lighter. They draw smaller with a heavier stroke to match. */
const GLYPHS: ReadonlySet<UiIconName> = new Set(["heading", "bold", "italic", "strikeout", "underline"]);

/** Lucide line icons share one stroke and never contribute a button name. */
export function UiIcon({ name }: { name: UiIconName }) {
  return (
    <svg className={GLYPHS.has(name) ? "ui-icon ui-icon-glyph" : "ui-icon"} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      {lucideIcons[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
