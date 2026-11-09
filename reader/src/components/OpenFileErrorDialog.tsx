import { useEffect, useRef } from "react";

export interface OpenFileError {
  path: string;
  name: string;
  /** The file is definitely gone, so offer to forget it. */
  missing: boolean;
  message?: string;
  /** Only recent-list entries can be removed from the list. */
  removable: boolean;
}

/** Modal shown when a file cannot be opened from the new-tab page. */
export function OpenFileErrorDialog({ error, close, remove }: {
  error: OpenFileError;
  close: () => void;
  remove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="open-error-dialog" aria-labelledby="open-error-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <h2 id="open-error-title">{error.missing ? "文件已不存在" : "无法打开文件"}</h2>
    <p>{error.missing
      ? `找不到“${error.name}”，它可能已被移动、重命名或删除。`
      : error.message}</p>
    <p className="open-error-path" title={error.path}>{error.path}</p>
    <div className="open-error-actions">
      {error.removable && <button type="button" onClick={remove}>从列表中移除</button>}
      <button type="button" className="primary" autoFocus onClick={close}>{error.removable ? "取消" : "确定"}</button>
    </div>
  </dialog>;
}
