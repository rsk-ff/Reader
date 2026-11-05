import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ZoomMode } from "./types";
import type { AnnotationTool } from "./PdfAnnotationLayer";
import { UiIcon, type UiIconName } from "../../components/UiIcon";
import { DocumentActions } from "../../components/DocumentActions";
import { OverflowToolbar, type ToolbarGroup } from "../../components/OverflowToolbar";

/** Text markup tools share one toolbar button and a style popover. */
export type MarkTool = "highlight" | "underline" | "strikeout";

export const MARK_COLORS = [
  { label: "黄色", fill: "#ffd84d", line: "#d9a400" },
  { label: "绿色", fill: "#8fd99b", line: "#2e9e5b" },
  { label: "粉色", fill: "#f4a3c0", line: "#d6457a" },
  { label: "蓝色", fill: "#9cc8f4", line: "#3d7fd1" },
  { label: "灰色", fill: "#c9c9c4", line: "#55554f" },
] as const;

/** The stored annotation color for a markup tool and palette entry. */
export function markColor(tool: AnnotationTool, index: number): string | undefined {
  const entry = MARK_COLORS[index] ?? MARK_COLORS[0];
  if (tool === "highlight") return entry.fill;
  if (tool === "underline" || tool === "strikeout") return entry.line;
  return undefined;
}

export function isMarkTool(tool: AnnotationTool): tool is MarkTool {
  return tool === "highlight" || tool === "underline" || tool === "strikeout";
}

interface PdfToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  zoomMode: ZoomMode;
  sidebarOpen: boolean;
  searchHits: number;
  searchIdx: number;
  searching: boolean;
  dirty: boolean;
  annotTool: AnnotationTool;
  markTool: MarkTool;
  markColorIndex: number;
  onAnnotTool: (tool: AnnotationTool) => void;
  onMarkColor: (index: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: (m: "fit-width" | "fit-page") => void;
  onSidebarToggle: () => void;
  onSearch: (q: string) => void;
  onSearchNav: (dir: 1 | -1) => void;
  onPrint: () => void;
  onJumpPage: (n: number) => void;
  onSave: () => void;
}

const MARKS: [MarkTool, UiIconName, string][] = [
  ["highlight", "highlight", "高亮"],
  ["underline", "underline", "下划线"],
  ["strikeout", "strikeout", "删除线"],
];

export function PdfToolbar(props: PdfToolbarProps) {
  const {
    currentPage, totalPages, scale, zoomMode, sidebarOpen, searchHits, searchIdx, searching,
    annotTool, markTool, markColorIndex, onAnnotTool, onMarkColor,
    onZoomIn, onZoomOut, onFit, onSidebarToggle, onSearch, onSearchNav, onPrint, onJumpPage, dirty, onSave,
  } = props;

  const [searchInput, setSearchInput] = useState("");
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverAt, setPopoverAt] = useState<{ left: number; top: number } | null>(null);

  // keep the page field in sync with the current page
  useEffect(() => {
    if (pageInputRef.current && document.activeElement !== pageInputRef.current) {
      pageInputRef.current.value = String(currentPage);
    }
  }, [currentPage]);

  // The style popover closes on an outside press or Escape.
  useEffect(() => {
    if (!markMenuOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!toolsRef.current?.contains(target) && !popoverRef.current?.contains(target)) setMarkMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMarkMenuOpen(false); };
    const dismiss = () => setMarkMenuOpen(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [markMenuOpen]);

  // The toolbar row scrolls horizontally, so the popover lives in a portal and
  // is placed under the tool group.
  useLayoutEffect(() => {
    if (!markMenuOpen || !toolsRef.current) { setPopoverAt(null); return; }
    const rect = toolsRef.current.getBoundingClientRect();
    setPopoverAt({ left: Math.max(8, Math.min(rect.left, innerWidth - 176)), top: rect.bottom + 6 });
  }, [markMenuOpen]);

  useEffect(() => { if (!isMarkTool(annotTool)) setMarkMenuOpen(false); }, [annotTool]);

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
  const markActive = isMarkTool(annotTool);
  const markIcon = MARKS.find(([tool]) => tool === markTool)![1];
  const swatch = MARK_COLORS[markColorIndex] ?? MARK_COLORS[0];

  const groups: ToolbarGroup[] = [
    { key: "sidebar", pinned: true, node: <>
        <div className="pdf-toolbar-group">
          <ToolbarButton active={sidebarOpen} onClick={onSidebarToggle}
            title={sidebarOpen ? "收起侧栏" : "展开侧栏"}>
            <UiIcon name="panelLeft" />
          </ToolbarButton>
        </div>
        </> },
    { key: "pages", node: <>
        <div className="pdf-toolbar-group">
          <ToolbarButton onClick={() => onJumpPage(currentPage - 1)} title="上一页" disabled={currentPage <= 1}>
            <UiIcon name="prev" />
          </ToolbarButton>
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
          <ToolbarButton onClick={() => onJumpPage(currentPage + 1)} title="下一页" disabled={currentPage >= totalPages}>
            <UiIcon name="next" />
          </ToolbarButton>
        </div>
        </> },
    { key: "zoom", node: <>
        <div className="pdf-toolbar-group">
          <ToolbarButton onClick={onZoomOut} title="Zoom out">
            <UiIcon name="zoomOut" />
          </ToolbarButton>
          <span className="pdf-zoom-pct" title="zoom level">
            {pct}%
          </span>
          <ToolbarButton onClick={onZoomIn} title="Zoom in">
            <UiIcon name="zoomIn" />
          </ToolbarButton>
          <ToolbarButton active={zoomMode === "fit-width"} onClick={() => onFit("fit-width")} title="Fit width">
            <UiIcon name="fitWidth" />
          </ToolbarButton>
          <ToolbarButton active={zoomMode === "fit-page"} onClick={() => onFit("fit-page")} title="Fit page">
            <UiIcon name="fitPage" />
          </ToolbarButton>
        </div>
        </> },
    { key: "spacer-start", pinned: true, flexible: true, minWidth: 0, node: null },
    { key: "tools", node: <>
        <div className="pdf-tool-group" ref={toolsRef} role="group" aria-label="批注工具">
          <ToolButton active={annotTool === "select"} title="选择" icon="select"
            onClick={() => onAnnotTool("select")} />
          <button
            type="button"
            className={"pdf-tool" + (markActive ? " pdf-tool-active" : "")}
            title="标记文字（选中文字后生效）"
            aria-label="标记文字"
            aria-pressed={markActive}
            aria-haspopup="dialog"
            aria-expanded={markMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (markActive) setMarkMenuOpen((open) => !open);
              else { onAnnotTool(markTool); setMarkMenuOpen(true); }
            }}
          >
            <UiIcon name={markIcon} />
            <span className="pdf-tool-swatch" style={{ background: markTool === "highlight" ? swatch.fill : swatch.line }} />
          </button>
          <ToolButton active={annotTool === "note"} title="注释（点击页面放置）" icon="note"
            onClick={() => onAnnotTool("note")} />
          <ToolButton active={annotTool === "freetext"} title="文本框（点击页面放置）" icon="text"
            onClick={() => onAnnotTool("freetext")} />
          <ToolButton active={annotTool === "ink"} title="画笔" icon="pen"
            onClick={() => onAnnotTool("ink")} />
          {markMenuOpen && popoverAt && createPortal(
            <div className="pdf-mark-popover" role="dialog" aria-label="标记样式" ref={popoverRef}
              style={{ left: popoverAt.left, top: popoverAt.top }}>
              <div className="segmented" role="radiogroup" aria-label="标记方式">
                {MARKS.map(([tool, icon, label]) => (
                  <button key={tool} type="button" role="radio" aria-checked={markTool === tool}
                    aria-label={label} title={label}
                    className={"segmented-item" + (markTool === tool ? " segmented-item-on" : "")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onAnnotTool(tool)}>
                    <UiIcon name={icon} />
                  </button>
                ))}
              </div>
              <div className="pdf-mark-swatches" role="radiogroup" aria-label="颜色">
                {MARK_COLORS.map((color, index) => (
                  <button key={color.label} type="button" role="radio" aria-checked={index === markColorIndex}
                    aria-label={color.label} title={color.label}
                    className={"pdf-mark-swatch" + (index === markColorIndex ? " pdf-mark-swatch-on" : "")}
                    style={{ background: markTool === "highlight" ? color.fill : color.line }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onMarkColor(index)} />
                ))}
              </div>
            </div>, document.body,
          )}
        </div>
        </> },
    { key: "spacer-end", pinned: true, flexible: true, minWidth: 0, node: null },
    { key: "search", minWidth: 220, slotClassName: "pdf-search-slot", node: <>
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
            <span className="pdf-search-count">
              {searching
                ? "…"
                : searchHits > 0
                  ? `${searchIdx + 1}/${searchHits}`
                  : searchInput
                    ? "0"
                    : ""}
            </span>
          </form>
          <ToolbarButton onClick={() => onSearchNav(-1)} title="Previous" disabled={searchHits === 0}>
            <UiIcon name="chevronUp" />
          </ToolbarButton>
          <ToolbarButton onClick={() => onSearchNav(1)} title="Next" disabled={searchHits === 0}>
            <UiIcon name="chevronDown" />
          </ToolbarButton>
        </div>
        </> },
  ];

  return (
    <div className="pdf-toolbar" role="toolbar" aria-label="PDF tools">
      <OverflowToolbar className="pdf-toolbar-row pdf-reading-toolbar" groups={groups}
        hideOrder={["zoom", "search", "pages", "tools"]} />
      <DocumentActions dirty={dirty} onPrint={onPrint} onSave={onSave} />
    </div>
  );
}

function ToolButton({ active, title, icon, onClick }: {
  active: boolean;
  title: string;
  icon: UiIconName;
  onClick: () => void;
}) {
  return (
    <button type="button" className={"pdf-tool" + (active ? " pdf-tool-active" : "")}
      title={title} aria-label={title} aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      <UiIcon name={icon} />
    </button>
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
