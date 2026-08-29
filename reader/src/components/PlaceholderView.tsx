import { useWorkspace } from "../workspace/store";
import type { WindowTab } from "../workspace/types";

/** Phase 1 placeholder. PDF/MD engines land in Phase 2/3. */
export function PlaceholderView({ tab }: { tab: WindowTab }) {
  const doc = useWorkspace((s) =>
    tab.document_id ? s.documentsById[tab.document_id] : undefined,
  );

  if (!doc) {
    return <div className="placeholder">No document session.</div>;
  }

  const typeLabel =
    doc.doc_type === "pdf"
      ? "PDF"
      : doc.doc_type === "markdown"
        ? "Markdown"
        : "Unknown";

  return (
    <div className="placeholder">
      <div className="ph-card">
        <div className="ph-kind">{typeLabel}</div>
        <h1 className="ph-title">{doc.file_name}</h1>
        <dl className="ph-meta">
          <dt>path</dt>
          <dd className="mono">{doc.path}</dd>
          <dt>size</dt>
          <dd>{doc.file_size != null ? formatBytes(doc.file_size) : "—"}</dd>
          <dt>revision</dt>
          <dd>{doc.revision}</dd>
        </dl>
        <p className="ph-note">
          Reading engine loads in Phase 2 (PDF) / Phase 3 (Markdown).
          This view only verifies the desktop shell, tab system and file router.
        </p>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}
