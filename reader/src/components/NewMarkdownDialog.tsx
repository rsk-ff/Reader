import { useLayoutEffect, useRef, useState } from "react";

export function NewMarkdownDialog({ directory, create, cancel }: {
  directory: string;
  create: (name: string) => Promise<void>;
  cancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("新建文档.md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current!.focus();
    input.current!.setSelectionRange(0, "新建文档".length);
    return () => element.close();
  }, []);

  return <dialog className="new-markdown-dialog" ref={dialog} aria-labelledby="new-markdown-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) cancel(); }}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      void create(name).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      }).finally(() => setBusy(false));
    }}>
      <h2 id="new-markdown-title">新建 Markdown</h2>
      <p className="new-markdown-location" title={directory}>{directory}</p>
      <label>文件名<input ref={input} value={name} disabled={busy} onChange={(event) => {
        setName(event.target.value);
        setError(null);
      }} /></label>
      {error && <p className="new-tab-error" role="alert">{error}</p>}
      <div className="new-markdown-dialog-actions">
        <button type="button" disabled={busy} onClick={cancel}>取消</button>
        <button type="submit" disabled={busy || !name.trim()}>{busy ? "正在创建…" : "创建"}</button>
      </div>
    </form>
  </dialog>;
}
