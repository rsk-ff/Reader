import { UiIcon } from "./UiIcon";

interface DocumentActionsProps {
  dirty: boolean;
  saving?: boolean;
  printing?: boolean;
  onPrint: () => void;
  onSave: () => void;
}

/** Both document types use the same position, labels and save state. */
export function DocumentActions({ dirty, saving, printing, onPrint, onSave }: DocumentActionsProps) {
  return (
    <div className="document-actions" role="group" aria-label="文档操作">
      <button type="button" className="document-action" onClick={onPrint}
        onMouseDown={(event) => event.preventDefault()}
        title="打印 (Ctrl+P)" disabled={printing}>
        <UiIcon name="print" /><span>{printing ? "准备中…" : "打印"}</span>
      </button>
      <button type="button" className={"document-action" + (dirty ? " document-action-dirty" : "")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSave} disabled={!dirty || saving} title="保存 (Ctrl+S)">
        <UiIcon name={dirty || saving ? "save" : "check"} />
        <span>{saving ? "保存中…" : dirty ? "保存 ●" : "已保存"}</span>
      </button>
    </div>
  );
}
