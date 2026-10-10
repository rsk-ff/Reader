import { UiIcon } from "../../components/UiIcon";
import { DocumentActions } from "../../components/DocumentActions";

interface MarkdownToolbarProps {
  mode: "wysiwyg" | "source";
  dirty: boolean;
  saving: boolean;
  printing: boolean;
  onSwitch: (m: "wysiwyg" | "source") => void;
  onSave: () => void;
  onPrint: () => void;
  outlineVisible: boolean;
  onToggleOutline: () => void;
}

export function MarkdownToolbar({ mode, dirty, saving, printing, onSwitch, onSave, onPrint, outlineVisible, onToggleOutline }: MarkdownToolbarProps) {
  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown tools">
      <button type="button" className={"md-tbtn md-outline-toggle" + (outlineVisible ? " md-tbtn-active" : "")}
        title={outlineVisible ? "收起目录" : "展开目录"}
        aria-label={outlineVisible ? "收起目录" : "展开目录"}
        aria-expanded={outlineVisible} onClick={onToggleOutline}>
        <UiIcon name="outline" />
      </button>
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
      <DocumentActions dirty={dirty} saving={saving} printing={printing} onPrint={onPrint} onSave={onSave} />
    </div>
  );
}
