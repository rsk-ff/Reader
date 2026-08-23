import { describe, expect, it } from "vitest";

import { extractMarkdownHeadings } from "./markdownHeadingModel";

describe("extractMarkdownHeadings", () => {
  it("extracts ATX and setext headings in document order", () => {
    const headings = extractMarkdownHeadings(
      "# Title\n\n## [Linked](https://example.com) *section* ##\n\nSetext\n------",
    );

    expect(headings.map(({ level, text, line }) => ({ level, text, line }))).toEqual([
      { level: 1, text: "Title", line: 0 },
      { level: 2, text: "Linked section", line: 2 },
      { level: 2, text: "Setext", line: 4 },
    ]);
  });

  it("ignores heading-looking text inside fenced code", () => {
    expect(
      extractMarkdownHeadings("# Visible\n```md\n## Hidden\n```\n### Also visible").map(
        (heading) => heading.text,
      ),
    ).toEqual(["Visible", "Also visible"]);
  });

  it("records the source offset for navigation", () => {
    const markdown = "intro\r\n\r\n## Target\r\ntext";
    expect(extractMarkdownHeadings(markdown)[0].offset).toBe(markdown.indexOf("## Target"));
  });
});
