import { UiIcon } from "./UiIcon";

interface DocumentActionsProps {
  dirty: boolean;
  saving?: boolean;
  printing?: boolean;
  onPrint: () => void;
  onSave: () => void;
}

/** Both document types use the same position, labels and save state. The save
 * icon carries a dot while there are unsaved changes; the label stays in the
 * accessible name and tooltip. */
export function DocumentActions({ dirty, saving, printing, onPrint, onSave }: DocumentActionsProps) {
  const saveLabel = saving ? "保存中" : dirty ? "保存" : "已保存";
  return (
    <div className="document-actions" role="group" aria-label="文档操作">
      <button type="button" className="document-action" onClick={onPrint}
        onMouseDown={(event) => event.preventDefault()}
        title={printing ? "准备打印…" : "打印 (Ctrl+P)"} aria-label="打印" disabled={printing}>
        <UiIcon name="print" />
      </button>
      <span className="toolbar-separator" aria-hidden="true" />
      <button type="button" className={"document-action document-save" + (dirty ? " document-action-dirty" : "")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSave} disabled={!dirty || saving}
        title={dirty ? "保存 (Ctrl+S)，有未保存的更改" : saving ? "保存中…" : "已保存"} aria-label={saveLabel}>
        <UiIcon name="save" />
        {(dirty || saving) && <span className="document-dirty-dot" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Turn vertical wheel movement over an overflowing toolbar row into
 * horizontal scrolling, since the row has no visible scrollbar. */
export function scrollRowWithWheel(event: React.WheelEvent<HTMLElement>) {
  const row = event.currentTarget;
  if (row.scrollWidth <= row.clientWidth || event.deltaX !== 0) return;
  row.scrollLeft += event.deltaY;
}
