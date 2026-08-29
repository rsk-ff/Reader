import { Suspense, lazy } from "react";
import { useWorkspace } from "../workspace/store";
import { NewTabPage } from "../components/NewTabPage";
import { PlaceholderView } from "../components/PlaceholderView";
import type { WindowTab } from "../workspace/types";

// §2.1: each engine loads only when its document type is opened.
const PdfViewer = lazy(() =>
  import("./pdf/PdfViewer").then((m) => ({ default: m.PdfViewer })),
);
const MarkdownEditor = lazy(() =>
  import("./markdown/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

/**
 * Routes a tab to the right viewer by document type. The DocumentAdapter seam
 * (§35) lives behind this — the tab system only ever sees a DocumentView.
 */
export function DocumentView({ tab, active }: { tab: WindowTab; active: boolean }) {
  const doc = useWorkspace((s) =>
    tab.document_id ? s.documentsById[tab.document_id] : undefined,
  );
  if (tab.document_id === null) return <NewTabPage />;
  if (!doc) return <PlaceholderView tab={tab} />;

  switch (doc.doc_type) {
    case "pdf":
      return (
        <Suspense fallback={<div className="pdf-status">loading PDF engine…</div>}>
          <PdfViewer path={doc.path} docId={doc.id} active={active} />
        </Suspense>
      );
    case "markdown":
      return (
        <Suspense fallback={<div className="md-status">loading Markdown engine…</div>}>
          <MarkdownEditor
            path={doc.path}
            fileName={doc.file_name}
            docId={doc.id}
            untitled={doc.untitled}
            active={active}
          />
        </Suspense>
      );
    case "unknown":
    default:
      return <PlaceholderView tab={tab} />;
  }
}
