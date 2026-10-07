import { DocumentToolRail, RailButton } from "../../components/DocumentToolRail";
import type { MarkdownFormat } from "./MilkdownCrepe";

export function MarkdownTools({ enabled, onFormat }: {
  enabled: boolean;
  onFormat: (format: MarkdownFormat) => void;
}) {
  const tools = [
    ["bold", "加粗 (Ctrl+B)"], ["italic", "斜体 (Ctrl+I)"],
    ["strikeout", "删除线"], ["code", "行内代码"],
    ["math", "行内公式"], ["link", "链接 (Ctrl+K)"],
  ] as const;
  return <DocumentToolRail label="Markdown 格式操作">
    <div className="rail-group">
      {tools.map(([format, title]) => <RailButton key={format} icon={format} title={title}
        disabled={!enabled} onClick={() => onFormat(format)} />)}
    </div>
  </DocumentToolRail>;
}
