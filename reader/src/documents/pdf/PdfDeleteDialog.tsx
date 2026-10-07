import { useEffect, useRef } from "react";

/** Use a real modal without requiring another native dialog capability. */
export function PdfDeleteDialog({ pageNumber, onCancel, onConfirm }: {
  pageNumber: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="pdf-delete-dialog" aria-labelledby="pdf-delete-title"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="pdf-delete-title">删除第 {pageNumber} 页？</h2>
    <p>删除会立即写入文件，无法撤销。</p>
    <div className="pdf-delete-actions">
      <button type="button" autoFocus onClick={onCancel}>取消</button>
      <button type="button" className="pdf-delete-confirm" onClick={onConfirm}>删除</button>
    </div>
  </dialog>;
}
