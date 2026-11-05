/** Plain-text find for Markdown, shared by the rendered and source views. */

export interface TextMatch {
  start: number;
  end: number;
}

/** Case-insensitive, non-overlapping matches of `query` in `text`. */
export function findMatches(text: string, query: string): TextMatch[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  const haystack = text.toLocaleLowerCase();
  const matches: TextMatch[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    matches.push({ start: at, end: at + needle.length });
  }
  return matches;
}

/** Wrap an index into `[0, count)`; 0 when there is nothing to wrap. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * DOM ranges for every match of `query` in the rendered text under `root`.
 * Text nodes are concatenated so a match may cross inline formatting, such
 * as a word that is half bold. Editor widgets are skipped.
 */
export function findRanges(root: Element, query: string): Range[] {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest(".ProseMirror-widget")
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += node.textContent ?? "";
  }
  const locate = (offset: number, preferEnd: boolean) => {
    // Binary search for the node that holds `offset`.
    let low = 0;
    let high = nodes.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] < offset || (!preferEnd && starts[mid] === offset)) low = mid;
      else high = mid - 1;
    }
    return { node: nodes[low], offset: offset - starts[low] };
  };
  return findMatches(text, query).map((match) => {
    const range = document.createRange();
    const start = locate(match.start, false);
    const end = locate(match.end, true);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  });
}

const ALL = "md-search";
const CURRENT = "md-search-current";

/** Paint matches with the CSS Custom Highlight API; no DOM is changed. */
export function paintRanges(ranges: Range[], current: number) {
  const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
  if (!registry || typeof Highlight === "undefined") return;
  if (ranges.length === 0) {
    clearPaintedRanges();
    return;
  }
  registry.set(ALL, new Highlight(...ranges.filter((_, index) => index !== current)));
  const active = ranges[current];
  if (active) registry.set(CURRENT, new Highlight(active));
  else registry.delete(CURRENT);
}

export function clearPaintedRanges() {
  const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
  registry?.delete(ALL);
  registry?.delete(CURRENT);
}
