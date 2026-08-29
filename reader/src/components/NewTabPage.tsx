import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { useWorkspace } from "../workspace/store";
import { DocumentTypeIcon } from "./DocumentTypeIcon";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function NewTabPage() {
  const openDocument = useWorkspace((state) => state.openDocument);
  const createMarkdownDocument = useWorkspace(
    (state) => state.createMarkdownDocument,
  );
  const recentFiles = useWorkspace((state) => state.recentFiles);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = async () => {
    setError(null);
    setPending("open");
    try {
      const selection = await open({
        title: "打开文件",
        multiple: false,
        directory: false,
        filters: [
          { name: "Reader 文件", extensions: ["pdf", "md", "markdown"] },
        ],
      });
      const path = Array.isArray(selection) ? selection[0] : selection;
      if (path) await openDocument(path);
    } catch (cause) {
      setError(`无法打开文件：${errorMessage(cause)}`);
    } finally {
      setPending(null);
    }
  };

  const createMarkdown = async () => {
    setError(null);
    setPending("new-markdown");
    try {
      await createMarkdownDocument();
    } catch (cause) {
      setError(`无法新建 Markdown：${errorMessage(cause)}`);
    } finally {
      setPending(null);
    }
  };

  const reopenRecent = async (path: string) => {
    setError(null);
    setPending(path);
    try {
      await openDocument(path);
    } catch (cause) {
      setError(`无法打开最近文件：${errorMessage(cause)}`);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="new-tab-page">
      <div className="new-tab-content">
        <section className="new-tab-hero" aria-labelledby="new-tab-title">
          <div className="new-tab-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 6v12M6 12h12" />
            </svg>
          </div>
          <div>
            <h2 id="new-tab-title">新标签页</h2>
            <p>打开已有文档，或从一份空白 Markdown 开始。</p>
          </div>
        </section>

        <div className="new-tab-actions" aria-label="文件操作">
          <button
            type="button"
            className="new-tab-action"
            onClick={() => void chooseFile()}
            disabled={pending !== null}
          >
            <span className="new-tab-action-icon new-tab-action-icon-open" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M3.5 7.5h6l1.8 2H20a1 1 0 0 1 .96 1.28l-2.3 7.5a1 1 0 0 1-.96.72H5.2a1 1 0 0 1-.98-.8L2.5 9.7V6a1 1 0 0 1 1-1h5l1.7 2h7.3" />
              </svg>
            </span>
            <span className="new-tab-action-copy">
              <strong>{pending === "open" ? "正在打开…" : "打开文件"}</strong>
              <small>PDF、MD 或 Markdown</small>
            </span>
            <span className="new-tab-action-arrow" aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            className="new-tab-action"
            onClick={() => void createMarkdown()}
            disabled={pending !== null}
          >
            <span className="new-tab-action-icon new-tab-action-icon-markdown" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20zM14 3.8V8h4.2M9 15.5v-4l2 2 2-2v4" />
              </svg>
            </span>
            <span className="new-tab-action-copy">
              <strong>{pending === "new-markdown" ? "正在创建…" : "新建 md"}</strong>
              <small>保存时再选择位置</small>
            </span>
            <span className="new-tab-action-arrow" aria-hidden="true">→</span>
          </button>
        </div>

        {error ? <p className="new-tab-error" role="alert">{error}</p> : null}

        <section className="new-tab-recent" aria-labelledby="recent-files-title">
          <header>
            <h3 id="recent-files-title">最近文件</h3>
            {recentFiles.length > 0 ? <span>{recentFiles.length} 个</span> : null}
          </header>
          {recentFiles.length > 0 ? (
            <div className="new-tab-recent-list">
              {recentFiles.map((file) => (
                <button
                  type="button"
                  className="new-tab-recent-item"
                  key={file.path}
                  title={file.path}
                  onClick={() => void reopenRecent(file.path)}
                  disabled={pending !== null}
                >
                  <span className="new-tab-recent-icon">
                    <DocumentTypeIcon type={file.doc_type} />
                  </span>
                  <span className="new-tab-recent-copy">
                    <strong>{file.file_name}</strong>
                    <small>{file.path}</small>
                  </span>
                  <span className="new-tab-recent-arrow" aria-hidden="true">
                    {pending === file.path ? "…" : "›"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="new-tab-recent-empty">
              <span aria-hidden="true">⌁</span>
              <p>打开过的文件会出现在这里</p>
            </div>
          )}
        </section>

        <p className="new-tab-drop-hint">
          也可以将 <code>PDF</code> 或 <code>Markdown</code> 文件拖到窗口中
        </p>
      </div>
    </main>
  );
}
