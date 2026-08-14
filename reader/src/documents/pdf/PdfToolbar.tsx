import { useEffect, useRef, useState } from "react";
import type { ZoomMode } from "./types";
import type { AnnotationTool } from "./PdfAnnotationLayer";

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
  onFit: (m: ZoomMode) => void;
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
    <div className="pdf-toolbar">
      <div className="pdf-toolbar-group">
        <ToolbarButton
          active={sidebarMode === "thumbnails"}
          onClick={() => onSidebarToggle("thumbnails")}
          title="Thumbnails"
        >
          thumbs
        </ToolbarButton>
        <ToolbarButton
          active={sidebarMode === "outline"}
          onClick={() => onSidebarToggle("outline")}
          title="Outline"
          disabled={!hasOutline}
        >
          outline
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
          −
        </ToolbarButton>
        <span className="pdf-zoom-pct" title="zoom level">
          {pct}%
        </span>
        <ToolbarButton onClick={onZoomIn} title="Zoom in">
          +
        </ToolbarButton>
        <ToolbarButton
          active={zoomMode === "fit-width"}
          onClick={() => onFit("fit-width")}
          title="Fit width"
        >
          fit W
        </ToolbarButton>
        <ToolbarButton
          active={zoomMode === "fit-page"}
          onClick={() => onFit("fit-page")}
          title="Fit page"
        >
          fit
        </ToolbarButton>
      </div>

      <div className="pdf-toolbar-group pdf-search-group">
        <form className="pdf-search-form" onSubmit={submitSearch}>
          <input
            className="pdf-search-input"
            type="search"
            placeholder="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
          ↑
        </ToolbarButton>
        <ToolbarButton onClick={() => onSearchNav(1)} title="Next" disabled={searchHits === 0}>
          ↓
        </ToolbarButton>
      </div>

      <div className="pdf-toolbar-group pdf-annot-group">
        <ToolbarButton
          active={annotTool === "select"}
          onClick={() => onAnnotTool("select")}
          title="Select"
        >
          ▶
        </ToolbarButton>
        <ToolbarButton
          active={annotTool === "highlight"}
          onClick={() => onAnnotTool("highlight")}
          title="Highlight (select text)"
        >
          HL
        </ToolbarButton>
        <ToolbarButton
          active={annotTool === "underline"}
          onClick={() => onAnnotTool("underline")}
          title="Underline (select text)"
        >
          UL
        </ToolbarButton>
        <ToolbarButton
          active={annotTool === "strikeout"}
          onClick={() => onAnnotTool("strikeout")}
          title="Strikeout (select text)"
        >
          ST
        </ToolbarButton>
        <ToolbarButton
          active={annotTool === "note"}
          onClick={() => onAnnotTool("note")}
          title="Note (click to place)"
        >
          N
        </ToolbarButton>
        <ToolbarButton
          active={annotTool === "freetext"}
          onClick={() => onAnnotTool("freetext")}
          title="Free text (click to place)"
        >
          T
        </ToolbarButton>
        <ToolbarButton
          active={annotTool === "ink"}
          onClick={() => onAnnotTool("ink")}
          title="Ink (draw)"
        >
          ✎
        </ToolbarButton>
      </div>

      <div className="pdf-toolbar-group pdf-page-group">
        <ToolbarButton onClick={onInsertBlankBefore} title="Insert blank page before current">
          + ◀
        </ToolbarButton>
        <ToolbarButton onClick={onInsertBlankAfter} title="Insert blank page after current">
          + ▶
        </ToolbarButton>
        <ToolbarButton onClick={onDeletePage} title="Delete current page">
          ✕ pg
        </ToolbarButton>
      </div>

      <div className="pdf-toolbar-spacer" />

      <div className="pdf-toolbar-group">
        <ToolbarButton onClick={onPrint} title="Print (Ctrl+P)">
          print
        </ToolbarButton>
        <ToolbarButton
          onClick={onSave}
          disabled={!dirty}
          title="Save (persist annotations)"
        >
          {dirty ? "save ●" : "saved"}
        </ToolbarButton>
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
      disabled={disabled}
    >
      {children}
    </button>
  );
}
