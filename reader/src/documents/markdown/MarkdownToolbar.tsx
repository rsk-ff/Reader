import { UiIcon } from "../../components/UiIcon";

interface MarkdownToolbarProps {
  mode: "wysiwyg" | "source";
  dirty: boolean;
  saving: boolean;
  onSwitch: (m: "wysiwyg" | "source") => void;
  onSave: () => void;
}

export function MarkdownToolbar({ mode, dirty, saving, onSwitch, onSave }: MarkdownToolbarProps) {
  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown tools">
      <span className="md-document-label">Markdown</span>
      <div className="md-toolbar-group md-mode-switch" role="group" aria-label="Editor mode">
        <button
          type="button"
          className={"md-tbtn" + (mode === "wysiwyg" ? " md-tbtn-active" : "")}
          onClick={() => onSwitch("wysiwyg")}
          title="Rendered (Ctrl+/)"
          aria-pressed={mode === "wysiwyg"}
        >
          <UiIcon name="book" />
          Rendered
        </button>
        <button
          type="button"
          className={"md-tbtn" + (mode === "source" ? " md-tbtn-active" : "")}
          onClick={() => onSwitch("source")}
          title="Source (Ctrl+/)"
          aria-pressed={mode === "source"}
        >
          <UiIcon name="code" />
          Source
        </button>
      </div>
      <div className="md-toolbar-spacer" />
      <div className="md-toolbar-group">
        <button
          type="button"
          className={"md-tbtn md-save" + (dirty ? " md-save-dirty" : "")}
          onClick={onSave}
          disabled={!dirty || saving}
          title="Save (Ctrl+S)"
        >
          <UiIcon name={dirty || saving ? "save" : "check"} />
          {saving ? "saving…" : dirty ? "Save ●" : "saved"}
        </button>
      </div>
    </div>
  );
}
