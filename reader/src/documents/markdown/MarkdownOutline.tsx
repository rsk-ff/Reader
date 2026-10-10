import { useEffect, useRef, useState } from "react";
import type { MarkdownHeading } from "./markdownHeadingModel";
import { UiIcon } from "../../components/UiIcon";

interface MarkdownOutlineProps {
  headings: MarkdownHeading[];
  onNavigate: (heading: MarkdownHeading, index: number) => void;
  width: number;
  onWidthChange: (width: number) => void;
}

export function MarkdownOutline({ headings, onNavigate, width, onWidthChange }: MarkdownOutlineProps) {
  const shellRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [maxWidth, setMaxWidth] = useState(560);
  const actualWidth = Math.max(120, Math.min(width, maxWidth));
  const stopDragging = () => {
    dragRef.current = null;
    document.body.classList.remove("md-sidebar-resizing");
  };

  useEffect(() => {
    const workspace = shellRef.current?.parentElement;
    if (!workspace) return;
    const observer = new ResizeObserver(() => {
      // Hidden tabs report zero; keep their preferred width until shown again.
      if (workspace.clientWidth > 0) {
        // Reserve 48px for the tool rail and at least 160px for content.
        setMaxWidth(Math.max(120, Math.min(560, workspace.clientWidth - 208)));
      }
    });
    observer.observe(workspace);
    return () => {
      observer.disconnect();
      document.body.classList.remove("md-sidebar-resizing");
    };
  }, []);

  const resize = (nextWidth: number) => onWidthChange(Math.max(120, Math.min(maxWidth, nextWidth)));

  return (
    <aside ref={shellRef} className="md-outline-shell" style={{ width: actualWidth }} aria-label="Markdown outline">
      <div className="md-outline">
        <div className="md-outline-title"><UiIcon name="outline" /><div className="md-outline-label">文档目录</div><span>{headings.length}</span></div>
        {headings.length === 0 ? (
          <div className="md-outline-empty">添加标题后，会在这里显示目录。</div>
        ) : (
          <nav className="md-outline-list">
            {headings.map((heading, index) => (
              <button
                key={`${heading.offset}-${heading.level}`}
                type="button"
                className="md-outline-item"
                style={{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }}
                title={heading.text}
                onClick={() => onNavigate(heading, index)}
              >
                {heading.text}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="md-sidebar-resizer" role="separator" aria-label="调整 Markdown 目录宽度"
        aria-orientation="vertical" aria-valuemin={120} aria-valuemax={maxWidth}
        aria-valuenow={actualWidth} tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0 || dragRef.current) return;
          event.preventDefault();
          event.currentTarget.focus();
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: actualWidth };
          event.currentTarget.setPointerCapture(event.pointerId);
          document.body.classList.add("md-sidebar-resizing");
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId === event.pointerId) resize(drag.startWidth + event.clientX - drag.startX);
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          stopDragging();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          resize(event.key === "Home" ? 120 : event.key === "End" ? maxWidth
            : actualWidth + (event.key === "ArrowRight" ? 16 : -16));
        }} />
    </aside>
  );
}
