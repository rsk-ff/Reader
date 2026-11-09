import { invoke } from "@tauri-apps/api/core";
import type { Placement } from "./printLayout";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export interface PaperInfo {
  id: number;
  name: string;
  /** Portrait size. */
  widthMm: number;
  heightMm: number;
}

export type Duplex = "none" | "long" | "short";

export interface DeviceSettings {
  paperId: number | null;
  landscape: boolean;
  duplex: Duplex;
  color: boolean;
  copies: number;
  collate: boolean;
}

export interface PrinterCapabilities {
  papers: PaperInfo[];
  duplex: boolean;
  color: boolean;
  collate: boolean;
  maxCopies: number;
  defaults: DeviceSettings;
}

export interface PageArea {
  paperWidthMm: number;
  paperHeightMm: number;
  printableLeftMm: number;
  printableTopMm: number;
  printableWidthMm: number;
  printableHeightMm: number;
}

export interface PrintJob {
  snapshot: string;
  printer: string;
  devmode: number[] | null;
  title: string;
  settings: DeviceSettings;
  annotations: boolean;
  sheets: Placement[][];
}

export const listPrinters = () => invoke<PrinterInfo[]>("print_list_printers");

export const printerCapabilities = (printer: string, devmode: number[] | null) =>
  invoke<PrinterCapabilities>("print_printer_capabilities", { printer, devmode });

export const pageArea = (printer: string, devmode: number[] | null, paperId: number | null, landscape: boolean) =>
  invoke<PageArea>("print_page_area", { printer, devmode, paperId, landscape });

export const printerProperties = (printer: string, devmode: number[] | null, settings: DeviceSettings) =>
  invoke<{ devmode: number[]; settings: DeviceSettings } | null>("print_printer_properties", { printer, devmode, settings });

export const snapshotPdf = (path: string) => invoke<string>("print_snapshot_pdf", { path });

export const markdownPdf = (page: { widthMm: number; heightMm: number; marginMm: number }) =>
  invoke<string>("print_markdown_pdf", { page });

export async function readSnapshot(snapshot: string): Promise<Uint8Array> {
  const bytes = await invoke<ArrayBuffer | number[]>("print_read_snapshot", { snapshot });
  return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
}

export const releaseSnapshot = (snapshot: string) =>
  invoke<void>("print_release_snapshot", { snapshot }).catch(() => undefined);

export const submitPrint = (job: PrintJob) => invoke<void>("print_submit", { job });
