import type { MarkdownHeading } from "./markdownHeadingModel";
import { UiIcon } from "../../components/UiIcon";

interface MarkdownOutlineProps {
  headings: MarkdownHeading[];
  onNavigate: (heading: MarkdownHeading, index: number) => void;
}

export function MarkdownOutline({ headings, onNavigate }: MarkdownOutlineProps) {
  return (
    <aside className="md-outline" aria-label="Markdown outline">
      <div className="md-outline-title"><UiIcon name="outline" />文档目录<span>{headings.length}</span></div>
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
    </aside>
  );
}
