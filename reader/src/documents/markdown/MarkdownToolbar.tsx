interface MarkdownToolbarProps {
  mode: "wysiwyg" | "source";
  dirty: boolean;
  saving: boolean;
  onSwitch: (m: "wysiwyg" | "source") => void;
  onSave: () => void;
}

export function MarkdownToolbar({ mode, dirty, saving, onSwitch, onSave }: MarkdownToolbarProps) {
  return (
    <div className="md-toolbar">
      <div className="md-toolbar-group">
        <button
          type="button"
          className={"md-tbtn" + (mode === "wysiwyg" ? " md-tbtn-active" : "")}
          onClick={() => onSwitch("wysiwyg")}
          title="Rendered (Ctrl+/)"
        >
          Rendered
        </button>
        <button
          type="button"
          className={"md-tbtn" + (mode === "source" ? " md-tbtn-active" : "")}
          onClick={() => onSwitch("source")}
          title="Source (Ctrl+/)"
        >
          Source
        </button>
      </div>
      <div className="md-toolbar-spacer" />
      <div className="md-toolbar-group">
        <button
          type="button"
          className="md-tbtn"
          onClick={onSave}
          disabled={!dirty || saving}
          title="Save (Ctrl+S)"
        >
          {saving ? "saving…" : dirty ? "Save ●" : "saved"}
        </button>
      </div>
    </div>
  );
}
