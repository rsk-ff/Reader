import type { OutlineNode } from "./types";

export interface FlattenedOutlineNode {
  node: OutlineNode;
  depth: number;
}

const PLACEHOLDER_TITLES = new Set(["blank page", "空白页面"]);

function normalizedTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function isOutlinePlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(normalizedTitle(title));
}

export function flattenOutline(nodes: OutlineNode[], depth = 0): FlattenedOutlineNode[] {
  const flattened: FlattenedOutlineNode[] = [];

  for (const node of nodes) {
    if (isOutlinePlaceholderTitle(node.title)) {
      flattened.push(...flattenOutline(node.items ?? [], depth));
      continue;
    }

    flattened.push({ node, depth });
    flattened.push(...flattenOutline(node.items ?? [], depth + 1));
  }

  return flattened;
}
