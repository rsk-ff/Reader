import { describe, expect, it } from "vitest";

import { flattenOutline, isOutlinePlaceholderTitle } from "./pdfOutline";
import type { OutlineNode } from "./types";

function outlineNode(title: string, items: OutlineNode[] = []): OutlineNode {
  return {
    title,
    bold: false,
    italic: false,
    dest: null,
    url: null,
    items,
  };
}

describe("PDF outline", () => {
  it("flattens entries in document order and preserves hierarchy depth", () => {
    const outline = [
      outlineNode("Parent", [
        outlineNode("Child", [outlineNode("Grandchild")]),
      ]),
      outlineNode("Sibling"),
    ];

    expect(flattenOutline(outline).map(({ node, depth }) => [node.title, depth])).toEqual([
      ["Parent", 0],
      ["Child", 1],
      ["Grandchild", 2],
      ["Sibling", 0],
    ]);
  });

  it("recognizes only normalized blank-page placeholder labels", () => {
    expect(isOutlinePlaceholderTitle("空白页面")).toBe(true);
    expect(isOutlinePlaceholderTitle("　空白页面　")).toBe(true);
    expect(isOutlinePlaceholderTitle("  BLANK\nPAGE  ")).toBe(true);
    expect(isOutlinePlaceholderTitle("Blank Page Notes")).toBe(false);
    expect(isOutlinePlaceholderTitle("空白页面说明")).toBe(false);
  });

  it("omits placeholders without discarding or over-indenting their children", () => {
    const outline = [
      outlineNode("空白页面"),
      outlineNode("Parent", [
        outlineNode("Blank Page", [outlineNode("Retained child")]),
        outlineNode("Regular child"),
      ]),
    ];

    expect(flattenOutline(outline).map(({ node, depth }) => [node.title, depth])).toEqual([
      ["Parent", 0],
      ["Retained child", 1],
      ["Regular child", 1],
    ]);
  });
});
