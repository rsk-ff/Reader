import type { Duplex } from "./printApi";
import { PAGES_PER_SHEET, type Orientation, type PagesPerSheet, type ScaleMode } from "./printLayout";

export type MarginPreset = "narrow" | "normal" | "wide";

export const MARGIN_MM: Record<MarginPreset, number> = { narrow: 10, normal: 18, wide: 25 };

/** What the dialog remembers between prints. Page range and copies reset. */
export interface PrintPrefs {
  printer: string | null;
  /** Paper id per printer. */
  paperByPrinter: Record<string, number>;
  /** Driver settings from "打印机属性…", per printer. */
  devmodeByPrinter: Record<string, number[]>;
  orientation: Orientation;
  pagesPerSheet: PagesPerSheet;
  scale: ScaleMode;
  duplex: Duplex;
  color: boolean;
  collate: boolean;
  annotations: boolean;
  margin: MarginPreset;
}

const KEY = "reader.print.v1";

export const DEFAULT_PREFS: PrintPrefs = {
  printer: null,
  paperByPrinter: {},
  devmodeByPrinter: {},
  orientation: "auto",
  pagesPerSheet: 1,
  scale: "fit",
  duplex: "none",
  color: true,
  collate: true,
  annotations: true,
  margin: "normal",
};

function oneOf<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

function record<T>(value: unknown, valid: (entry: unknown) => entry is T): Record<string, T> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => valid(entry))) as Record<string, T>;
}

export function parsePrefs(raw: string | null): PrintPrefs {
  let value: Record<string, unknown> = {};
  try { value = JSON.parse(raw ?? "{}") ?? {}; } catch { /* use defaults */ }
  const base = DEFAULT_PREFS;
  return {
    printer: typeof value.printer === "string" ? value.printer : null,
    paperByPrinter: record(value.paperByPrinter, (entry): entry is number => Number.isInteger(entry)),
    devmodeByPrinter: record(value.devmodeByPrinter, (entry): entry is number[] =>
      Array.isArray(entry) && entry.every((byte) => Number.isInteger(byte) && byte >= 0 && byte < 256)),
    orientation: oneOf(value.orientation, ["auto", "portrait", "landscape"] as const, base.orientation),
    pagesPerSheet: oneOf(value.pagesPerSheet, PAGES_PER_SHEET, base.pagesPerSheet),
    scale: oneOf(value.scale, ["fit", "actual"] as const, base.scale),
    duplex: oneOf(value.duplex, ["none", "long", "short"] as const, base.duplex),
    color: typeof value.color === "boolean" ? value.color : base.color,
    collate: typeof value.collate === "boolean" ? value.collate : base.collate,
    annotations: typeof value.annotations === "boolean" ? value.annotations : base.annotations,
    margin: oneOf(value.margin, ["narrow", "normal", "wide"] as const, base.margin),
  };
}

export function loadPrefs(): PrintPrefs {
  try { return parsePrefs(window.localStorage.getItem(KEY)); } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(prefs: PrintPrefs): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not remembered */ }
}
