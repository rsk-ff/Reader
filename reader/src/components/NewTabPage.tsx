import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { useWorkspace } from "../workspace/store";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { UiIcon } from "./UiIcon";
import appIcon from "../assets/icons/journal-bookmark-fill.svg";

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
        <aside className="new-tab-start">
          <section className="new-tab-hero" aria-labelledby="new-tab-title">
            <img src={appIcon} alt="" width="28" height="28" />
            <h1 id="new-tab-title">Reader</h1>
          </section>

          <div className="new-tab-actions" aria-label="文件操作">
            <button
              type="button"
              className="new-tab-action new-tab-action-primary"
              onClick={() => void chooseFile()}
              disabled={pending !== null}
            >
              <UiIcon name="folder" />
              <span>{pending === "open" ? "正在打开…" : "打开文件"}</span>
            </button>

            <button
              type="button"
              className="new-tab-action"
              onClick={() => void createMarkdown()}
              disabled={pending !== null}
            >
              <UiIcon name="plus" />
              <span>{pending === "new-markdown" ? "正在创建…" : "新建 Markdown"}</span>
            </button>
          </div>

          {error ? <p className="new-tab-error" role="alert">{error}</p> : null}
        </aside>

        <section className="new-tab-recent" aria-labelledby="recent-files-title">
          <header>
            <h2 id="recent-files-title">最近打开</h2>
          </header>
          <div className="new-tab-list-heading" aria-hidden="true"><span>文档</span><span>格式</span></div>
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
                  <span className="new-tab-recent-type">
                    {pending === file.path ? "打开中…" : file.doc_type === "pdf" ? "PDF" : file.doc_type === "markdown" ? "MD" : "FILE"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="new-tab-recent-empty">
              <UiIcon name="file" />
              <p>暂无最近文件</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
