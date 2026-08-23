export interface MarkdownHeading {
  level: number;
  text: string;
  line: number;
  offset: number;
}

function plainHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\\([\\`*_[\]{}()#+.!~-])/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

/** Extract CommonMark ATX/setext headings while ignoring fenced code. */
export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.split(/\r\n|\n|\r/);
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length;
    if (markdown.startsWith("\r\n", offset)) offset += 2;
    else if (markdown[offset] === "\r" || markdown[offset] === "\n") offset += 1;
  }

  const headings: MarkdownHeading[] = [];
  let fence: { character: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMarker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMarker) {
      const marker = fenceMarker[1];
      if (!fence) {
        fence = { character: marker[0], length: marker.length };
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const atx = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
    if (atx) {
      const text = plainHeadingText(atx[2].replace(/[ \t]+#+[ \t]*$/, ""));
      if (text) {
        headings.push({
          level: atx[1].length,
          text,
          line: index,
          offset: offsets[index],
        });
      }
      continue;
    }

    const setext = lines[index + 1]?.match(/^\s{0,3}(=+|-+)\s*$/);
    const text = plainHeadingText(line);
    if (setext && text) {
      headings.push({
        level: setext[1][0] === "=" ? 1 : 2,
        text,
        line: index,
        offset: offsets[index],
      });
      index += 1;
    }
  }

  return headings;
}
