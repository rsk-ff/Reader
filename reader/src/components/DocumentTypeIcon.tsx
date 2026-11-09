import { UiIcon, type UiIconName } from "./UiIcon";
import type { DocumentType } from "../workspace/types";

/**
 * In-app file glyph: Lucide's page outline, the same line icon as the rest of
 * the interface, with a band in the file type's colour. Windows association
 * icons keep their own masters in brandIcons.
 */
export function DocumentTypeIcon({ type }: { type: DocumentType }) {
  return <span className={`tab-icon tab-icon-${type}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" className="file-page" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" className="file-page" />
      {type !== "unknown" && <rect x="7" y="13" width="10" height="5" rx="1" className="file-band" stroke="none" />}
    </svg>
  </span>;
}

/** Neutral marker for a tab that is not yet associated with a document. */
/** What a new tab's page shows; its tab icon follows it. */
export type NewTabPlaceKind = "home" | "computer" | "folder";
const PLACE_ICONS: Record<NewTabPlaceKind, UiIconName> = { home: "clock", computer: "computer", folder: "folder" };

export function NewTabIcon({ place = "home" }: { place?: NewTabPlaceKind }) {
  return (
    <span className="tab-icon tab-icon-new" aria-hidden="true">
      <UiIcon name={PLACE_ICONS[place]} />
    </span>
  );
}

export function documentTypeFromFileName(fileName: string): DocumentType {
  const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  return "unknown";
}
