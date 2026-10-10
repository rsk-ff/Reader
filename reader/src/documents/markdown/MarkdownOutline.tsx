import { useEffect, useRef, useState } from "react";
import type { MarkdownHeading } from "./markdownHeadingModel";
import { UiIcon } from "../../components/UiIcon";
import { SidebarResizer, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from "../../components/SidebarResizer";

interface MarkdownOutlineProps {
  headings: MarkdownHeading[];
  onNavigate: (heading: MarkdownHeading, index: number) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onCollapse: (restoreWidth: number) => void;
}

export function MarkdownOutline({ headings, onNavigate, width, onWidthChange, onCollapse }: MarkdownOutlineProps) {
  const shellRef = useRef<HTMLElement>(null);
  const [maxWidth, setMaxWidth] = useState(SIDEBAR_MAX_WIDTH);
  const actualWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, maxWidth));

  useEffect(() => {
    const workspace = shellRef.current?.parentElement;
    if (!workspace) return;
    const observer = new ResizeObserver(() => {
      // Hidden tabs report zero; keep their preferred width until shown again.
      if (workspace.clientWidth > 0) {
        // Reserve 48px for the rail and 160px for content when space permits.
        setMaxWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, workspace.clientWidth - 208)));
      }
    });
    observer.observe(workspace);
    return () => {
      observer.disconnect();
    };
  }, []);

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
      <SidebarResizer kind="md" label="调整 Markdown 目录宽度" width={actualWidth}
        preferredWidth={width} maxWidth={maxWidth} onWidthChange={onWidthChange} onCollapse={onCollapse} />
    </aside>
  );
}
