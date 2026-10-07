import { useEffect, useRef, useState } from "react";
import type { ZoomMode } from "./types";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import { UiIcon } from "../../components/UiIcon";

interface PdfToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  zoomMode: ZoomMode;
  sidebarMode: "thumbnails" | "outline" | null;
  hasOutline: boolean;
  searchHits: number;
  searchIdx: number;
  searching: boolean;
  annotTool: AnnotationTool;
  dirty: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: (m: "fit-width" | "fit-page") => void;
  onSidebarToggle: (m: "thumbnails" | "outline") => void;
  onSearch: (q: string) => void;
  onSearchNav: (dir: 1 | -1) => void;
  onPrint: () => void;
  onJumpPage: (n: number) => void;
  onAnnotTool: (t: AnnotationTool) => void;
  onSave: () => void;
  onInsertBlankBefore: () => void;
  onInsertBlankAfter: () => void;
  onDeletePage: () => void;
}

export function PdfToolbar(props: PdfToolbarProps) {
  const {
    currentPage,
    totalPages,
    scale,
    zoomMode,
    sidebarMode,
    hasOutline,
    searchHits,
    searchIdx,
    searching,
    onZoomIn,
    onZoomOut,
    onFit,
    onSidebarToggle,
    onSearch,
    onSearchNav,
    onPrint,
    onJumpPage,
    annotTool,
    dirty,
    onAnnotTool,
    onSave,
    onInsertBlankBefore,
    onInsertBlankAfter,
    onDeletePage,
  } = props;

  const [searchInput, setSearchInput] = useState("");
  const pageInputRef = useRef<HTMLInputElement>(null);

  // keep the page field in sync with the current page
  useEffect(() => {
    if (pageInputRef.current && document.activeElement !== pageInputRef.current) {
      pageInputRef.current.value = String(currentPage);
    }
  }, [currentPage]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    onSearch(searchInput);
  }

  function submitPage(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(pageInputRef.current?.value);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) onJumpPage(n);
    else if (pageInputRef.current) pageInputRef.current.value = String(currentPage);
  }

  const pct = Math.round(scale * 100);

  return (
    <div className="pdf-toolbar" role="toolbar" aria-label="PDF tools">
      <div className="pdf-toolbar-row pdf-reading-toolbar">
        <div className="pdf-toolbar-group">
          <ToolbarButton
            active={sidebarMode === "thumbnails"}
            onClick={() => onSidebarToggle("thumbnails")}
            title="Thumbnails"
          >
            <UiIcon name="thumbnails" />
          </ToolbarButton>
          <ToolbarButton
            active={sidebarMode === "outline"}
            onClick={() => onSidebarToggle("outline")}
            title="Outline"
            disabled={!hasOutline}
          >
            <UiIcon name="outline" />
          </ToolbarButton>
        </div>

        <div className="pdf-toolbar-group">
          <form className="pdf-page-form" onSubmit={submitPage}>
            <input
              ref={pageInputRef}
              className="pdf-page-input"
              type="number"
              min={1}
              max={totalPages}
              defaultValue={currentPage}
              aria-label="page"
            />
            <span className="pdf-page-count">/ {totalPages}</span>
          </form>
        </div>

        <div className="pdf-toolbar-group">
          <ToolbarButton onClick={onZoomOut} title="Zoom out">
            <UiIcon name="minus" />
          </ToolbarButton>
          <span className="pdf-zoom-pct" title="zoom level">
            {pct}%
          </span>
          <ToolbarButton onClick={onZoomIn} title="Zoom in">
            <UiIcon name="plus" />
          </ToolbarButton>
          <ToolbarButton
            active={zoomMode === "fit-width"}
            onClick={() => onFit("fit-width")}
            title="Fit width"
          >
            <UiIcon name="fitWidth" />
            <span>适宽</span>
          </ToolbarButton>
          <ToolbarButton
            active={zoomMode === "fit-page"}
            onClick={() => onFit("fit-page")}
            title="Fit page"
          >
            <UiIcon name="fitPage" />
            <span>适页</span>
          </ToolbarButton>
        </div>

        <div className="pdf-toolbar-group pdf-search-group">
          <form className="pdf-search-form" onSubmit={submitSearch}>
            <UiIcon name="search" />
            <input
              className="pdf-search-input"
              type="search"
              placeholder="搜索文档"
              value={searchInput}
              onChange={(event) => {
                const value = event.target.value;
                setSearchInput(value);
                if (!value) onSearch("");
              }}
              aria-label="search"
            />
          </form>
          <span className="pdf-search-count">
            {searching
              ? "…"
              : searchHits > 0
                ? `${searchIdx + 1}/${searchHits}`
                : searchInput
                  ? "0"
                  : ""}
          </span>
          <ToolbarButton onClick={() => onSearchNav(-1)} title="Previous" disabled={searchHits === 0}>
            <UiIcon name="up" />
          </ToolbarButton>
          <ToolbarButton onClick={() => onSearchNav(1)} title="Next" disabled={searchHits === 0}>
            <UiIcon name="down" />
          </ToolbarButton>
        </div>

        <div className="pdf-toolbar-spacer" />
        <div className="pdf-toolbar-group pdf-output-group">
          <ToolbarButton onClick={onPrint} title="Print (Ctrl+P)">
            <UiIcon name="print" /><span>打印</span>
          </ToolbarButton>
          <ToolbarButton onClick={onSave} disabled={!dirty} title="Save (persist annotations)">
            <UiIcon name={dirty ? "save" : "check"} /><span>{dirty ? "保存 ●" : "已保存"}</span>
          </ToolbarButton>
        </div>
      </div>

      <div className="pdf-toolbar-row pdf-markup-toolbar">
        <span className="pdf-toolbar-caption">标注</span>
        <div className="pdf-toolbar-group pdf-annot-group">
          <ToolbarButton
            active={annotTool === "select"}
            onClick={() => onAnnotTool("select")}
            title="Select"
          >
            <UiIcon name="select" />
            <span>选择</span>
          </ToolbarButton>
          <ToolbarButton
            active={annotTool === "highlight"}
            onClick={() => onAnnotTool("highlight")}
            title="Highlight (select text)"
          >
            <UiIcon name="highlight" />
            <span>高亮</span>
          </ToolbarButton>
          <ToolbarButton
            active={annotTool === "underline"}
            onClick={() => onAnnotTool("underline")}
            title="Underline (select text)"
          >
            <UiIcon name="underline" />
            <span>下划线</span>
          </ToolbarButton>
          <ToolbarButton
            active={annotTool === "strikeout"}
            onClick={() => onAnnotTool("strikeout")}
            title="Strikeout (select text)"
          >
            <UiIcon name="strikeout" />
            <span>删除线</span>
          </ToolbarButton>
          <ToolbarButton
            active={annotTool === "note"}
            onClick={() => onAnnotTool("note")}
            title="Note (click to place)"
          >
            <UiIcon name="note" />
            <span>便笺</span>
          </ToolbarButton>
          <ToolbarButton
            active={annotTool === "freetext"}
            onClick={() => onAnnotTool("freetext")}
            title="Free text (click to place)"
          >
            <UiIcon name="text" />
            <span>文本</span>
          </ToolbarButton>
          <ToolbarButton
            active={annotTool === "ink"}
            onClick={() => onAnnotTool("ink")}
            title="Ink (draw)"
          >
            <UiIcon name="pen" />
            <span>画笔</span>
          </ToolbarButton>
        </div>

        <div className="pdf-toolbar-spacer" />
        <div className="pdf-toolbar-group pdf-page-group">
          <ToolbarButton onClick={onInsertBlankBefore} title="Insert blank page before current">
            <UiIcon name="pageBefore" />
            <span>前插空白页</span>
          </ToolbarButton>
          <ToolbarButton onClick={onInsertBlankAfter} title="Insert blank page after current">
            <UiIcon name="pageAfter" />
            <span>后插空白页</span>
          </ToolbarButton>
          <ToolbarButton onClick={onDeletePage} title="Delete current page">
            <UiIcon name="pageDelete" />
            <span>删除当前页</span>
          </ToolbarButton>
        </div>

      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={"pdf-tbtn" + (active ? " pdf-tbtn-active" : "")}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
