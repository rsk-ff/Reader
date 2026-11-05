import { useState, type RefObject } from "react";
import { UiIcon } from "./UiIcon";

/**
 * Pieces both document toolbars share so their two ends look and behave the
 * same: the sidebar toggle with its divider on the left, and the search field
 * before the print/save actions on the right.
 */

export function SidebarToggle({ open, onToggle, openLabel, closeLabel }: {
  open: boolean;
  onToggle: () => void;
  openLabel: string;
  closeLabel: string;
}) {
  const label = open ? closeLabel : openLabel;
  return <>
    <button type="button" className={"tbtn" + (open ? " tbtn-active" : "")} title={label} aria-label={label}
      aria-expanded={open} onClick={onToggle}>
      <UiIcon name="panelLeft" />
    </button>
    <span className="toolbar-separator" aria-hidden="true" />
  </>;
}

/**
 * Search field: typing edits a draft and Enter runs it; Enter again moves to
 * the next match, Shift+Enter to the previous one, Escape clears. The match
 * count sits inside the field so the field never changes width.
 */
export function DocumentSearch({ count, current, busy, onSearch, onNav, inputRef }: {
  count: number;
  /** Zero-based current match, meaningful when `count > 0`. */
  current: number;
  busy?: boolean;
  onSearch: (query: string) => void;
  onNav: (step: 1 | -1) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [draft, setDraft] = useState("");
  const [committed, setCommitted] = useState("");
  const run = (step: 1 | -1) => {
    if (draft !== committed) {
      setCommitted(draft);
      onSearch(draft);
    } else if (draft) onNav(step);
  };
  const clear = () => {
    setDraft("");
    setCommitted("");
    onSearch("");
  };
  return (
    <div className="doc-search" role="search">
      <form className="pdf-search-form" onSubmit={(event) => { event.preventDefault(); run(1); }}>
        <UiIcon name="search" />
        <input
          ref={inputRef}
          className="pdf-search-input"
          type="search"
          placeholder="搜索文档"
          value={draft}
          aria-label="search"
          onChange={(event) => {
            setDraft(event.target.value);
            if (!event.target.value) clear();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.shiftKey) {
              event.preventDefault();
              run(-1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              if (draft || committed) clear();
              else event.currentTarget.blur();
            }
          }}
        />
        <span className="pdf-search-count">
          {busy ? "…" : count > 0 ? `${current + 1}/${count}` : committed ? "0" : ""}
        </span>
      </form>
      <button type="button" className="tbtn" title="上一个 (Shift+回车)" aria-label="上一个匹配"
        disabled={count === 0} onMouseDown={(event) => event.preventDefault()} onClick={() => onNav(-1)}>
        <UiIcon name="chevronUp" />
      </button>
      <button type="button" className="tbtn" title="下一个 (回车)" aria-label="下一个匹配"
        disabled={count === 0} onMouseDown={(event) => event.preventDefault()} onClick={() => onNav(1)}>
        <UiIcon name="chevronDown" />
      </button>
    </div>
  );
}
