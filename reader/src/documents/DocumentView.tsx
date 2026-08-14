import { Suspense, lazy } from "react";
import { useWorkspace } from "../workspace/store";
import { PlaceholderView } from "../components/PlaceholderView";
import type { WindowTab } from "../workspace/types";

// §2.1: PDF engine loads only when a PDF is actually opened. Markdown-only
// sessions never pull in pdfjs.
const PdfViewer = lazy(() =>
  import("./pdf/PdfViewer").then((m) => ({ default: m.PdfViewer })),
);

/**
 * Routes a tab to the right viewer by document type. The DocumentAdapter seam
 * (§35) lives behind this — the tab system only ever sees a DocumentView.
 */
export function DocumentView({ tab, active }: { tab: WindowTab; active: boolean }) {
  const doc = useWorkspace((s) => s.documentsById[tab.document_id]);
  if (!doc) return <PlaceholderView tab={tab} />;

  switch (doc.doc_type) {
    case "pdf":
      return (
        <Suspense fallback={<div className="pdf-status">loading PDF engine…</div>}>
          <PdfViewer path={doc.path} active={active} />
        </Suspense>
      );
    case "markdown":
    case "unknown":
    default:
      return <PlaceholderView tab={tab} />;
  }
}
