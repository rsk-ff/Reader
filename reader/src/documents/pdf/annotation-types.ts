// Mirrors src-tauri/src/pdf/annotation.rs.

export type AnnotationType =
  | "highlight"
  | "underline"
  | "strikeout"
  | "note"
  | "freetext"
  | "ink";

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
}

export interface Rect {
  bottom: number;
  left: number;
  top: number;
  right: number;
}

export interface PdfAnnotation {
  id: string;
  page_index: number;
  annotation_type: AnnotationType;
  rect: Rect;
  quad_points: Quad[];
  ink_paths: Point[][];
  color: string;
  opacity: number;
  text: string | null;
  created_at: string | null;
  modified_at: string | null;
}
