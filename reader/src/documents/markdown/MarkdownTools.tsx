import { DocumentToolRail, RailButton } from "../../components/DocumentToolRail";
import type { MarkdownFormat } from "./MilkdownCrepe";
import boldIcon from "../../assets/icons/type-bold.svg";
import italicIcon from "../../assets/icons/type-italic.svg";
import strikeoutIcon from "../../assets/icons/type-strikethrough.svg";
import codeIcon from "../../assets/icons/code.svg";
import mathIcon from "../../assets/icons/superscript.svg";
import linkIcon from "../../assets/icons/link-45deg.svg";
import headingIcon from "../../assets/icons/type.svg";
import quoteIcon from "../../assets/icons/blockquote-left.svg";
import bulletIcon from "../../assets/icons/list-ul.svg";
import orderedIcon from "../../assets/icons/list-ol.svg";
import taskIcon from "../../assets/icons/list-check.svg";
import codeBlockIcon from "../../assets/icons/code-square.svg";
import mathBlockIcon from "../../assets/icons/calculator.svg";
import tableIcon from "../../assets/icons/table.svg";
import imageIcon from "../../assets/icons/image.svg";
import dividerIcon from "../../assets/icons/hr.svg";

const groups = [
  [["bold", boldIcon, "加粗 (Ctrl+B)"], ["italic", italicIcon, "斜体 (Ctrl+I)"],
   ["strikeout", strikeoutIcon, "删除线"], ["code", codeIcon, "行内代码"],
   ["math", mathIcon, "行内公式"], ["link", linkIcon, "链接 (Ctrl+K)"]],
  [["quote", quoteIcon, "引用块"], ["bullet", bulletIcon, "无序列表"],
   ["ordered", orderedIcon, "有序列表"], ["task", taskIcon, "任务列表"]],
  [["codeBlock", codeBlockIcon, "代码块"], ["mathBlock", mathBlockIcon, "公式块"],
   ["table", tableIcon, "插入表格"], ["image", imageIcon, "插入图片"], ["divider", dividerIcon, "分隔线"]],
] as const;

export function MarkdownTools({ enabled, onFormat }: {
  enabled: boolean;
  onFormat: (format: MarkdownFormat) => void;
}) {
  return <DocumentToolRail label="Markdown 格式操作">
    <label className="rail-heading" title="正文与标题">
      <span className="markdown-tool-icon" style={{ maskImage: `url("${headingIcon}")` }} aria-hidden="true" />
      <select aria-label="正文与标题" value="" disabled={!enabled} onChange={(event) => {
        onFormat(event.target.value as MarkdownFormat);
      }}>
        <option value="" disabled>正文与标题</option>
        <option value="paragraph">正文</option>
        {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`h${level}`}>标题 {level}</option>)}
      </select>
    </label>
    {groups.map((tools, index) => <div className="rail-group" key={index}>
      {tools.map(([format, iconUrl, title]) => <RailButton key={format} iconUrl={iconUrl} title={title}
        disabled={!enabled} onClick={() => onFormat(format)} />)}
    </div>)}
  </DocumentToolRail>;
}
