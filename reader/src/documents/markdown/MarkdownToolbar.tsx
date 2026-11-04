import { UiIcon, type UiIconName } from "../../components/UiIcon";
import { DocumentActions } from "../../components/DocumentActions";
import type { MarkdownFormat } from "./MilkdownCrepe";

interface MarkdownToolbarProps {
  mode: "wysiwyg" | "source";
  dirty: boolean;
  saving: boolean;
  printing: boolean;
  /** Formatting commands are available (rendered mode with a ready editor). */
  formatEnabled: boolean;
  onFormat: (format: MarkdownFormat) => void;
  onSwitch: (m: "wysiwyg" | "source") => void;
  onSave: () => void;
  onPrint: () => void;
  outlineVisible: boolean;
  onToggleOutline: () => void;
}

const GROUPS: [MarkdownFormat, UiIconName, string][][] = [
  [["bold", "bold", "加粗 (Ctrl+B)"], ["italic", "italic", "斜体 (Ctrl+I)"],
   ["strikeout", "strikeout", "删除线"], ["code", "code", "行内代码"],
   ["math", "math", "行内公式"], ["link", "link", "链接 (Ctrl+K)"]],
  [["quote", "quote", "引用块"], ["bullet", "bullet", "无序列表"],
   ["ordered", "ordered", "有序列表"], ["task", "task", "任务列表"]],
  [["codeBlock", "codeBlock", "代码块"], ["mathBlock", "mathBlock", "公式块"],
   ["table", "table", "插入表格"], ["image", "image", "插入图片"], ["divider", "divider", "分隔线"]],
];

export function MarkdownToolbar({ mode, dirty, saving, printing, formatEnabled, onFormat, onSwitch, onSave, onPrint, outlineVisible, onToggleOutline }: MarkdownToolbarProps) {
  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown tools">
      <div className="md-toolbar-row">
        <button type="button" className={"md-tbtn md-outline-toggle" + (outlineVisible ? " md-tbtn-active" : "")}
          title={outlineVisible ? "收起目录" : "展开目录"}
          aria-label={outlineVisible ? "收起目录" : "展开目录"}
          aria-expanded={outlineVisible} onClick={onToggleOutline}>
          <UiIcon name="panelLeft" />
        </button>
        <span className="toolbar-separator" aria-hidden="true" />
        <div className="md-format-tools" role="group" aria-label="Markdown 格式操作">
          <label className="md-heading-select" title="正文与标题">
            <UiIcon name="heading" />
            <select aria-label="正文与标题" value="" disabled={!formatEnabled} onChange={(event) => {
              onFormat(event.target.value as MarkdownFormat);
            }}>
              <option value="" disabled>正文与标题</option>
              <option value="paragraph">正文</option>
              {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`h${level}`}>标题 {level}</option>)}
            </select>
            <UiIcon name="chevronDown" />
          </label>
          {GROUPS.map((tools, index) => (
            <div className="md-format-group" key={index}>
              {index > 0 && <span className="toolbar-separator" aria-hidden="true" />}
              {tools.map(([format, icon, title]) => (
                <button key={format} type="button" className="md-tbtn" title={title} aria-label={title}
                  disabled={!formatEnabled} onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFormat(format)}>
                  <UiIcon name={icon} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="segmented md-mode-switch" role="group" aria-label="Editor mode">
        <button
          type="button"
          className={"segmented-item" + (mode === "wysiwyg" ? " segmented-item-on" : "")}
          onClick={() => onSwitch("wysiwyg")}
          title="排版视图 (Ctrl+/)"
          aria-label="排版视图"
          aria-pressed={mode === "wysiwyg"}
        >
          <UiIcon name="eye" />
        </button>
        <button
          type="button"
          className={"segmented-item" + (mode === "source" ? " segmented-item-on" : "")}
          onClick={() => onSwitch("source")}
          title="源码视图 (Ctrl+/)"
          aria-label="源码视图"
          aria-pressed={mode === "source"}
        >
          <UiIcon name="code" />
        </button>
      </div>
      <span className="toolbar-separator" aria-hidden="true" />
      <DocumentActions dirty={dirty} saving={saving} printing={printing} onPrint={onPrint} onSave={onSave} />
    </div>
  );
}
