export type MarginPreset = "narrow" | "normal" | "wide";

export const MARGIN_MM: Record<MarginPreset, number> = { narrow: 10, normal: 18, wide: 25 };

/**
 * The print window remembers only the printer last printed to; every other
 * option starts from its default each time.
 */
const KEY = "reader.print.printer";

export function loadPrinter(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function savePrinter(printer: string): void {
  try { window.localStorage.setItem(KEY, printer); } catch { /* not remembered */ }
}
