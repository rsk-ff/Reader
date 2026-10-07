import { useEffect, useRef, useState } from "react";
import type { ZoomMode } from "./types";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import { UiIcon } from "../../components/UiIcon";
import { DocumentActions } from "../../components/DocumentActions";
import { DocumentToolRail, RailButton } from "../../components/DocumentToolRail";

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
  dirty: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: (m: "fit-width" | "fit-page") => void;
  onSidebarToggle: (m: "thumbnails" | "outline") => void;
  onSearch: (q: string) => void;
  onSearchNav: (dir: 1 | -1) => void;
  onPrint: () => void;
  onJumpPage: (n: number) => void;
  onSave: () => void;
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
    dirty,
    onSave,
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

      </div>
      <DocumentActions dirty={dirty} onPrint={onPrint} onSave={onSave} />
    </div>
  );
}

interface PdfToolsProps {
  annotTool: AnnotationTool;
  onAnnotTool: (tool: AnnotationTool) => void;
  onInsertBlankBefore: () => void;
  onInsertBlankAfter: () => void;
  onDeletePage: () => void;
  canDelete: boolean;
}

export function PdfTools(props: PdfToolsProps) {
  const tools = [
    ["select", "select", "Select"],
    ["highlight", "highlight", "Highlight (select text)"],
    ["underline", "underline", "Underline (select text)"],
    ["strikeout", "strikeout", "Strikeout (select text)"],
    ["note", "note", "Note (click to place)"],
    ["freetext", "text", "Free text (click to place)"],
    ["ink", "pen", "Ink (draw)"],
  ] as const;
  return <DocumentToolRail label="PDF 标注与页面操作">
    <div className="rail-group">
      {tools.map(([tool, icon, title]) => <RailButton key={tool} icon={icon} title={title}
        active={props.annotTool === tool} onClick={() => props.onAnnotTool(tool)} />)}
    </div>
    <div className="rail-group">
      <RailButton icon="pageBefore" title="Insert blank page before current" onClick={props.onInsertBlankBefore} />
      <RailButton icon="pageAfter" title="Insert blank page after current" onClick={props.onInsertBlankAfter} />
      <RailButton icon="pageDelete" title="Delete current page" disabled={!props.canDelete} onClick={props.onDeletePage} />
    </div>
  </DocumentToolRail>;
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
