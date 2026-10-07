import type { DocumentType } from "../workspace/types";

import { brandIcons } from "./brandIcons";

/** Canonical file glyphs are also used to generate Windows association icons. */
export function DocumentTypeIcon({ type }: { type: DocumentType }) {
  return <span className={`tab-icon tab-icon-${type}`} aria-hidden="true">
    <img src={brandIcons[type]} alt="" draggable={false} />
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
