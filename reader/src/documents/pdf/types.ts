import type { PdfPageTransform } from "./coordinates";

export interface PageInfo {
  pageNumber: number;
  /** unscaled width (scale=1) */
  w1: number;
  /** unscaled height (scale=1) */
  h1: number;
  rotation: number;
  transform: PdfPageTransform;
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
