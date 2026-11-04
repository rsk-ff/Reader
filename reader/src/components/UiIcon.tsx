import { lucideIcons } from "./lucideIcons";

export type UiIconName = keyof typeof lucideIcons;

/** Lucide line icons share one stroke and never contribute a button name. */
export function UiIcon({ name }: { name: UiIconName }) {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      {lucideIcons[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
