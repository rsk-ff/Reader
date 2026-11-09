import type { DocumentType } from "../workspace/types";

/**
 * In-app file glyph: a plain page outline in the interface's line style with a
 * centred band in the file type's colour, echoing the Windows file icons
 * (plain page, centred tag, same colours) without their ginkgo and letters.
 */
export function DocumentTypeIcon({ type }: { type: DocumentType }) {
  return <span className={`tab-icon tab-icon-${type}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <rect x="4" y="2" width="16" height="20" rx="2" className="file-page" />
      {type !== "unknown" && <rect x="3" y="13" width="18" height="5.5" rx="1.2" className="file-band" stroke="none" />}
    </svg>
  </span>;
}

/** Neutral marker for a tab that is not yet associated with a document. */
export function NewTabIcon() {
  return (
    <span className="tab-icon tab-icon-new" aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <rect
          x="2.25"
          y="2.25"
          width="11.5"
          height="11.5"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
        />
        <path
          d="M8 5.25v5.5M5.25 8h5.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.15"
        />
      </svg>
    </span>
  );
}

export function documentTypeFromFileName(fileName: string): DocumentType {
  const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  return "unknown";
}
