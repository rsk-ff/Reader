import { useState, type RefObject } from "react";
import { UiIcon, type UiIconName } from "../../components/UiIcon";
import { DocumentActions } from "../../components/DocumentActions";
import { OverflowToolbar, type ToolbarGroup } from "../../components/OverflowToolbar";
import type { MarkdownFormat } from "./MilkdownCrepe";

interface MarkdownToolbarProps {
  dirty: boolean;
  saving: boolean;
  printing: boolean;
  /** Formatting commands are available (rendered mode with a ready editor). */
  formatEnabled: boolean;
  onFormat: (format: MarkdownFormat) => void;
  onSave: () => void;
  onPrint: () => void;
  outlineVisible: boolean;
  onToggleOutline: () => void;
  search: {
    query: string;
    count: number;
    /** Index of the current match, meaningful when `count > 0`. */
    current: number;
    inputRef: RefObject<HTMLInputElement | null>;
    onQuery: (query: string) => void;
    onNav: (step: 1 | -1) => void;
  };
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

export function MarkdownToolbar({ dirty, saving, printing, formatEnabled, onFormat, onSave, onPrint, outlineVisible, onToggleOutline, search }: MarkdownToolbarProps) {
  // Typing edits a draft; Enter runs it, as in the PDF search field.
  const [draft, setDraft] = useState(search.query);
  const run = (step: 1 | -1) => {
    if (draft !== search.query) search.onQuery(draft);
    else search.onNav(step);
  };
  const formatButtons = (tools: [MarkdownFormat, UiIconName, string][]) => tools.map(([format, icon, title]) => (
    <button key={format} type="button" className="md-tbtn" title={title} aria-label={title}
      disabled={!formatEnabled} onMouseDown={(event) => event.preventDefault()}
      onClick={() => onFormat(format)}>
      <UiIcon name={icon} />
    </button>
  ));
  const groups: ToolbarGroup[] = [
    {
      key: "outline",
      pinned: true,
      node: <>
        <button type="button" className={"md-tbtn md-outline-toggle" + (outlineVisible ? " md-tbtn-active" : "")}
          title={outlineVisible ? "收起目录" : "展开目录"}
          aria-label={outlineVisible ? "收起目录" : "展开目录"}
          aria-expanded={outlineVisible} onClick={onToggleOutline}>
          <UiIcon name="panelLeft" />
        </button>
        <span className="toolbar-separator" aria-hidden="true" />
      </>,
    },
    {
      key: "inline",
      node: <div className="md-format-group" role="group" aria-label="文字格式">
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
        {formatButtons(GROUPS[0])}
      </div>,
    },
    {
      key: "blocks",
      node: <div className="md-format-group" role="group" aria-label="段落格式">
        <span className="toolbar-separator" aria-hidden="true" />
        {formatButtons(GROUPS[1])}
      </div>,
    },
    {
      key: "inserts",
      node: <div className="md-format-group" role="group" aria-label="插入">
        <span className="toolbar-separator" aria-hidden="true" />
        {formatButtons(GROUPS[2])}
      </div>,
    },
    { key: "spacer", pinned: true, flexible: true, minWidth: 0, node: null },
    {
      key: "search",
      minWidth: 190,
      slotClassName: "md-search-slot",
      node: <div className="md-search-group" role="search">
        <form className="pdf-search-form" onSubmit={(event) => { event.preventDefault(); run(1); }}>
          <UiIcon name="search" />
          <input
            ref={search.inputRef}
            className="pdf-search-input md-search-input"
            type="search"
            placeholder="搜索文档"
            value={draft}
            aria-label="search"
            onChange={(event) => {
              setDraft(event.target.value);
              if (!event.target.value) search.onQuery("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                run(-1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                if (draft || search.query) { setDraft(""); search.onQuery(""); }
                else event.currentTarget.blur();
              }
            }}
          />
          <span className="pdf-search-count">
            {search.count > 0 ? `${search.current + 1}/${search.count}` : search.query ? "0" : ""}
          </span>
        </form>
        <button type="button" className="md-tbtn" title="上一个 (Shift+F3)" aria-label="上一个匹配"
          disabled={search.count === 0} onMouseDown={(event) => event.preventDefault()}
          onClick={() => search.onNav(-1)}>
          <UiIcon name="chevronUp" />
        </button>
        <button type="button" className="md-tbtn" title="下一个 (F3)" aria-label="下一个匹配"
          disabled={search.count === 0} onMouseDown={(event) => event.preventDefault()}
          onClick={() => search.onNav(1)}>
          <UiIcon name="chevronDown" />
        </button>
      </div>,
    },
  ];
  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown tools">
      <OverflowToolbar className="md-toolbar-row" groups={groups}
        hideOrder={["inserts", "blocks", "search", "inline"]} />
      <DocumentActions dirty={dirty} saving={saving} printing={printing} onPrint={onPrint} onSave={onSave} />
    </div>
  );
}

/** Rendered/source switch floating over the bottom-right of the document. */
export function MarkdownModeSwitch({ mode, onSwitch }: {
  mode: "wysiwyg" | "source";
  onSwitch: (m: "wysiwyg" | "source") => void;
}) {
  return (
    <div className="segmented md-mode-switch md-mode-float" role="group" aria-label="Editor mode">
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
  );
}
