export interface PageInfo {
  pageNumber: number;
  /** unscaled width (scale=1) */
  w1: number;
  /** unscaled height (scale=1) */
  h1: number;
  rotation: number;
}

export type ZoomMode = "fit-width" | "fit-page" | "manual";

export interface OutlineNode {
  title: string;
  bold: boolean;
  italic: boolean;
  color?: Uint8ClampedArray;
  dest: string | unknown[] | null;
  url: string | null;
  unsafeUrl?: string;
  newWindow?: boolean;
  items: OutlineNode[];
}

export interface SearchHit {
  pageNumber: number;
  /** index into the page's text content items array */
  itemIndex: number;
  /** char offset within that item's str */
  offset: number;
  length: number;
}
