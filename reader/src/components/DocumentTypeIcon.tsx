import type { DocumentType } from "../workspace/types";

/** Compact document type markers used in the title-bar tabs. */
export function DocumentTypeIcon({ type }: { type: DocumentType }) {
  if (type === "pdf") {
    return (
      <span className="tab-icon tab-icon-pdf" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path
            d="M3 1.5h6.1L13 5.4v9.1H3z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.15"
          />
          <path
            d="M9 1.7v3.8h3.7"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.15"
          />
          <text
            x="3.05"
            y="12.35"
            fill="currentColor"
            fontFamily="Arial, sans-serif"
            fontSize="4.15"
            fontWeight="700"
          >
            PDF
          </text>
        </svg>
      </span>
    );
  }

  if (type === "markdown") {
    return (
      <span className="tab-icon tab-icon-markdown" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <rect
            x="1.75"
            y="3"
            width="12.5"
            height="10"
            rx="1.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.15"
          />
          <path
            d="M3.8 10.7V6.4l2.2 2.2 2.2-2.2v4.3M10.8 7v4m0 0 1.6-1.6M10.8 11l-1.6-1.6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.1"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="tab-icon tab-icon-unknown" aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path
          d="M3 1.5h6.1L13 5.4v9.1H3z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.15"
        />
        <path
          d="M9 1.7v3.8h3.7M5.3 8h5.4M5.3 10.5h5.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
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
