import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotationMode, GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { UiIcon } from "../components/UiIcon";
import { layoutMarkdownPdf, renderMarkdownPrintHtml } from "../documents/markdown/printMarkdown";
import {
  listPrinters, pageArea, printerCapabilities, printerProperties, readSnapshot, releaseSnapshot,
  snapshotPdf, submitPrint,
  type DeviceSettings, type Duplex, type PageArea, type PrinterCapabilities, type PrinterInfo,
} from "./printApi";
import {
  PAGES_PER_SHEET, layoutSheets, paperCount, parsePageRange, resolveLandscape,
  type Orientation, type PageSize, type PagesPerSheet, type Placement, type ScaleMode, type SheetArea,
} from "./printLayout";
import { MARGIN_MM, loadPrefs, savePrefs, type MarginPreset, type PrintPrefs } from "./printPrefs";
import { PrintSelect } from "./PrintSelect";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PrintSource =
  | { kind: "pdf"; path: string; title: string; currentPage: number }
  | { kind: "markdown"; title: string; markdown: string; documentPath?: string };

type RangeMode = "all" | "current" | "custom";

interface Snapshot {
  id: string;
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
  sizes: PageSize[];
}

const MAX_COPIES = 999;

function assetUrl(directory: string): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/${directory}/`, window.location.href).href;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function openSnapshot(id: string): Promise<Snapshot> {
  const data = await readSnapshot(id);
  const task = getDocument({
    data,
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    iccUrl: assetUrl("iccs"),
    standardFontDataUrl: assetUrl("standard_fonts"),
    wasmUrl: assetUrl("wasm"),
  });
  const doc = await task.promise;
  const sizes: PageSize[] = [];
  for (let start = 1; start <= doc.numPages; start += 64) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(64, doc.numPages - start + 1) }, (_, offset) => doc.getPage(start + offset)),
    );
    for (const page of batch) {
      const viewport = page.getViewport({ scale: 1 });
      sizes.push({ width: viewport.width, height: viewport.height });
    }
  }
  return { id, doc, sizes, destroy: () => task.destroy() };
}

function closeSnapshot(snapshot: Snapshot | null) {
  if (!snapshot) return;
  void snapshot.destroy();
  void releaseSnapshot(snapshot.id);
}

/** Draw one page into a canvas region, `rotate` quarter turns clockwise. */
async function drawPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  target: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  rotate: number,
  annotations: boolean,
  tasks: RenderTask[],
) {
  const page = await doc.getPage(pageIndex + 1);
  const rotation = (page.rotate + rotate * 90) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const viewport = page.getViewport({ scale: box.width / Math.max(base.width, 1), rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.width));
  canvas.height = Math.max(1, Math.round(box.height));
  const task = page.render({
    canvas,
    viewport,
    annotationMode: annotations ? AnnotationMode.ENABLE : AnnotationMode.DISABLE,
  });
  tasks.push(task);
  await task.promise;
  target.drawImage(canvas, Math.round(box.x), Math.round(box.y));
}

function SheetPreview({ snapshot, sheet, area, annotations, color }: {
  snapshot: Snapshot;
  sheet: Placement[];
  area: SheetArea;
  annotations: boolean;
  color: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min((stage.width - 48) / area.paperWidth, (stage.height - 40) / area.paperHeight);
  const cssWidth = Math.max(0, Math.floor(area.paperWidth * scale));
  const cssHeight = Math.max(0, Math.floor(area.paperHeight * scale));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth < 8 || cssHeight < 8) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setReady(false);
    const pxPerMm = canvas.width / area.paperWidth;
    const tasks: RenderTask[] = [];
    let cancelled = false;
    void Promise.all(sheet.map((placement) => drawPage(snapshot.doc, placement.page, context, {
      x: placement.x * pxPerMm,
      y: placement.y * pxPerMm,
      width: placement.width * pxPerMm,
      height: placement.height * pxPerMm,
    }, placement.rotate, annotations, tasks))).then(() => {
      if (!cancelled) setReady(true);
    }).catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        console.error("print preview failed", error);
      }
    });
    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [snapshot, sheet, area, annotations, cssWidth, cssHeight]);

  return (
    <div className="print-preview-stage" ref={stageRef}>
      <canvas ref={canvasRef} className={`print-preview-sheet${color ? "" : " mono"}${ready ? " ready" : ""}`}
        style={{ width: cssWidth, height: cssHeight }} aria-label="打印预览" role="img" />
    </div>
  );
}

function StripThumb({ snapshot, page, included, current, onClick }: {
  snapshot: Snapshot;
  page: number;
  included: boolean;
  current: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const size = snapshot.sizes[page];
  const height = 84;
  const width = Math.max(24, Math.round(height * size.width / Math.max(size.height, 1)));

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { root: element.closest(".print-strip"), rootMargin: "0px 400px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    const tasks: RenderTask[] = [];
    void drawPage(snapshot.doc, page, context, { x: 0, y: 0, width: canvas.width, height: canvas.height }, 0, true, tasks)
      .catch(() => undefined);
    return () => tasks.forEach((task) => task.cancel());
  }, [visible, snapshot, page, width]);

  return (
    <button ref={ref} type="button" className={`print-strip-item${included ? "" : " excluded"}${current ? " current" : ""}`}
      onClick={onClick} disabled={!included} aria-label={`第 ${page + 1} 页${included ? "" : "（不打印）"}`}
      aria-current={current || undefined}>
      <canvas ref={canvasRef} style={{ width, height }} />
      <span>{page + 1}</span>
    </button>
  );
}

function Check({ checked, label, disabled, onChange }: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="print-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="print-check-box" aria-hidden="true"><UiIcon name="check" /></span>
      {label}
    </label>
  );
}

export function PrintDialog({ source, onClose }: { source: PrintSource; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isPdf = source.kind === "pdf";
  const [prefs] = useState<PrintPrefs>(loadPrefs);

  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null);
  const [printer, setPrinter] = useState<string | null>(null);
  const [caps, setCaps] = useState<PrinterCapabilities | null>(null);
  const [devmodes, setDevmodes] = useState(prefs.devmodeByPrinter);
  const [paperId, setPaperId] = useState<number | null>(null);
  const [copies, setCopies] = useState(1);
  const [copiesText, setCopiesText] = useState("1");
  const [collate, setCollate] = useState(prefs.collate);
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [rangeText, setRangeText] = useState("");
  const [orientation, setOrientation] = useState<Orientation>(
    !isPdf && prefs.orientation === "auto" ? "portrait" : prefs.orientation);
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(prefs.pagesPerSheet);
  const [scale, setScale] = useState<ScaleMode>(prefs.scale);
  const [margin, setMargin] = useState<MarginPreset>(prefs.margin);
  const [duplex, setDuplex] = useState<Duplex>(prefs.duplex);
  const [color, setColor] = useState(prefs.color);
  const [annotations, setAnnotations] = useState(prefs.annotations);

  const [snapshot, setSnapshotState] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  /** Show a new snapshot and let go of the one it replaces. */
  const showSnapshot = useCallback((next: Snapshot) => {
    if (snapshotRef.current !== next) closeSnapshot(snapshotRef.current);
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);
  useEffect(() => () => {
    closeSnapshot(snapshotRef.current);
    snapshotRef.current = null;
  }, []);
  const [area, setArea] = useState<PageArea | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const markdownHtml = useRef<Promise<string> | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current!;
    // Unmounting removes the dialog before close() could restore focus.
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // Nothing is chosen yet: start on the panel, not on a field.
    dialog.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  // Printers, then the remembered or default one.
  useEffect(() => {
    let cancelled = false;
    listPrinters().then((list) => {
      if (cancelled) return;
      setPrinters(list);
      const remembered = list.find((entry) => entry.name === prefs.printer);
      setPrinter((remembered ?? list.find((entry) => entry.isDefault) ?? list[0])?.name ?? null);
    }).catch((reason: unknown) => {
      if (!cancelled) { setPrinters([]); setError(`找不到打印机：${errorText(reason)}`); }
    });
    return () => { cancelled = true; };
  }, [prefs.printer]);

  const devmode = printer ? devmodes[printer] ?? null : null;

  // The printer's papers and features.
  useEffect(() => {
    if (!printer) return;
    let cancelled = false;
    setCaps(null);
    printerCapabilities(printer, devmodes[printer] ?? null).then((next) => {
      if (cancelled) return;
      setCaps(next);
      const ids = next.papers.map((paper) => paper.id);
      const remembered = prefs.paperByPrinter[printer];
      setPaperId(ids.includes(remembered) ? remembered
        : next.defaults.paperId != null && ids.includes(next.defaults.paperId) ? next.defaults.paperId
          : ids[0] ?? null);
      if (!next.duplex) setDuplex("none");
    }).catch((reason: unknown) => {
      if (!cancelled) setError(`读取打印机失败：${errorText(reason)}`);
    });
    return () => { cancelled = true; };
    // Devmode changes re-read only through printer properties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printer]);

  const paper = caps?.papers.find((entry) => entry.id === paperId) ?? null;
  const totalPages = snapshot?.sizes.length ?? 0;

  const range = useMemo((): { pages: number[] } | { error: string } => {
    if (!snapshot) return { pages: [] };
    if (rangeMode === "all") return { pages: snapshot.sizes.map((_, index) => index) };
    if (rangeMode === "current" && isPdf) return { pages: [Math.min(source.currentPage, totalPages) - 1] };
    return parsePageRange(rangeText, totalPages);
  }, [snapshot, rangeMode, rangeText, isPdf, source, totalPages]);
  const pages = "pages" in range ? range.pages : [];

  // Markdown content orientation is the chosen one; sheets may still turn
  // for several pages per sheet.
  const contentLandscape = !isPdf && orientation === "landscape";
  const landscape = paper
    ? isPdf
      ? resolveLandscape(orientation, pagesPerSheet, snapshot?.sizes[pages[0] ?? 0], { width: paper.widthMm, height: paper.heightMm })
      : pagesPerSheet === 1
        ? contentLandscape
        : resolveLandscape("auto", pagesPerSheet, snapshot?.sizes[0], { width: paper.widthMm, height: paper.heightMm })
    : false;

  // PDF: one snapshot of the current bytes (unsaved annotations included).
  const pdfPath = source.kind === "pdf" ? source.path : null;
  useEffect(() => {
    if (!pdfPath) return;
    let cancelled = false;
    snapshotPdf(pdfPath).then(openSnapshot).then((next) => {
      if (cancelled) closeSnapshot(next);
      else { showSnapshot(next); setPreparing(false); }
    }).catch((reason: unknown) => {
      if (!cancelled) { setPreviewError(`无法准备打印：${errorText(reason)}`); setPreparing(false); }
    });
    return () => { cancelled = true; };
  }, [pdfPath, showSnapshot]);

  // Markdown: paginate on the chosen paper, orientation and margins.
  const markdown = source.kind === "markdown" ? source : null;
  const pageWidth = paper ? (contentLandscape ? paper.heightMm : paper.widthMm) : 0;
  const pageHeight = paper ? (contentLandscape ? paper.widthMm : paper.heightMm) : 0;
  useEffect(() => {
    if (!markdown || !pageWidth || !pageHeight) return;
    let cancelled = false;
    setPreparing(true);
    // The previous layout stays on screen until the new one is ready.
    const timer = window.setTimeout(() => {
      markdownHtml.current ??= renderMarkdownPrintHtml(markdown.markdown, markdown.documentPath);
      markdownHtml.current
        .then((html) => layoutMarkdownPdf(html, { widthMm: pageWidth, heightMm: pageHeight, marginMm: MARGIN_MM[margin] }))
        .then(openSnapshot)
        .then((next) => {
          if (cancelled) { closeSnapshot(next); return; }
          showSnapshot(next);
          setPreviewError(null);
          setPreparing(false);
        })
        .catch((reason: unknown) => {
          if (!cancelled) { setPreviewError(`无法排版：${errorText(reason)}`); setPreparing(false); }
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [markdown, pageWidth, pageHeight, margin, showSnapshot]);

  // Printable area of the chosen paper.
  useEffect(() => {
    if (!printer || paperId == null) return;
    let cancelled = false;
    pageArea(printer, devmode, paperId, landscape).then((next) => {
      if (!cancelled) setArea(next);
    }).catch(() => {
      if (!cancelled && paper) {
        // Unknown hardware margins: assume the whole paper.
        const width = landscape ? paper.heightMm : paper.widthMm;
        const height = landscape ? paper.widthMm : paper.heightMm;
        setArea({ paperWidthMm: width, paperHeightMm: height, printableLeftMm: 0, printableTopMm: 0, printableWidthMm: width, printableHeightMm: height });
      }
    });
    return () => { cancelled = true; };
  }, [printer, devmode, paperId, landscape, paper]);

  const sheetArea = useMemo((): SheetArea | null => area && {
    paperWidth: area.paperWidthMm,
    paperHeight: area.paperHeightMm,
    left: area.printableLeftMm,
    top: area.printableTopMm,
    width: area.printableWidthMm,
    height: area.printableHeightMm,
  }, [area]);

  const sheets = useMemo(() => {
    if (!snapshot || !sheetArea || pages.length === 0) return [];
    // Markdown pages are already the paper's size: one per sheet prints 1:1.
    const mode: ScaleMode = isPdf ? scale : pagesPerSheet === 1 ? "actual" : "fit";
    return layoutSheets(pages, (page) => snapshot.sizes[page], sheetArea, pagesPerSheet, mode);
    // `pages` is derived from `range`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, sheetArea, range, pagesPerSheet, scale, isPdf]);

  useEffect(() => {
    setSheetIndex((index) => Math.max(0, Math.min(index, sheets.length - 1)));
  }, [sheets.length]);

  const sheetOfPage = useMemo(() => {
    const map = new Map<number, number>();
    sheets.forEach((sheet, index) => sheet.forEach((placement) => map.set(placement.page, index)));
    return map;
  }, [sheets]);

  const currentSettings = useCallback((): DeviceSettings => ({
    paperId, landscape, duplex, color: caps?.color === false ? false : color, copies, collate,
  }), [paperId, landscape, duplex, color, caps, copies, collate]);

  const openProperties = async () => {
    if (!printer) return;
    try {
      const result = await printerProperties(printer, devmode, currentSettings());
      if (!result) return;
      setDevmodes((current) => ({ ...current, [printer]: result.devmode }));
      const next = result.settings;
      if (next.paperId != null && caps?.papers.some((entry) => entry.id === next.paperId)) setPaperId(next.paperId);
      if (isPdf || pagesPerSheet === 1) setOrientation(next.landscape ? "landscape" : "portrait");
      if (caps?.duplex) setDuplex(next.duplex);
      if (caps?.color) setColor(next.color);
      setCopies(next.copies);
      setCopiesText(String(next.copies));
      setCollate(next.collate);
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const changeCopies = (value: number) => {
    const next = Math.max(1, Math.min(MAX_COPIES, caps?.maxCopies && caps.maxCopies > 1 ? caps.maxCopies : MAX_COPIES, Math.round(value) || 1));
    setCopies(next);
    setCopiesText(String(next));
  };

  const canPrint = Boolean(printer && caps && snapshot && sheets.length > 0 && !printing && !preparing && "pages" in range);

  const print = async () => {
    if (!canPrint || !printer || !snapshot) return;
    setPrinting(true);
    setError(null);
    try {
      await submitPrint({
        snapshot: snapshot.id,
        printer,
        devmode,
        title: source.title,
        settings: currentSettings(),
        annotations: isPdf ? annotations : true,
        sheets,
      });
      savePrefs({
        printer,
        paperByPrinter: paperId == null ? prefs.paperByPrinter : { ...prefs.paperByPrinter, [printer]: paperId },
        devmodeByPrinter: devmodes,
        orientation: isPdf ? orientation : orientation === "landscape" ? "landscape" : prefs.orientation === "auto" ? "auto" : "portrait",
        pagesPerSheet,
        scale,
        duplex,
        color,
        collate,
        annotations,
        margin,
      });
      onClose();
    } catch (reason) {
      setError(`打印失败：${errorText(reason)}`);
      setPrinting(false);
    }
  };

  const busyText = !printers ? "正在查找打印机…"
    : printers.length === 0 ? null
      : !caps ? "正在读取打印机…"
        : previewError ? null
          : preparing || !snapshot ? (isPdf ? "正在准备预览…" : "正在排版…")
          : null;
  const rangeError = "error" in range && rangeMode === "custom" && rangeText.trim() ? range.error : null;
  const papers = paperCount(sheets.length, copies, duplex !== "none");
  const sheet = sheets[sheetIndex];
  const orientationLabel = landscape ? "横向" : "纵向";
  const disabled = printing;

  return (
    <dialog ref={dialogRef} className="print-dialog" aria-labelledby="print-dialog-title" tabIndex={-1}
      onCancel={(event) => { event.preventDefault(); if (!printing) onClose(); }}>
      <div className="print-preview">
        <div className="print-preview-bar">
          <div className="print-preview-nav">
            <button type="button" className="print-icon-button" aria-label="上一张"
              disabled={sheetIndex <= 0} onClick={() => setSheetIndex((index) => index - 1)}>
              <UiIcon name="prev" />
            </button>
            <span aria-live="polite">{sheets.length ? `第 ${sheetIndex + 1} 张 / 共 ${sheets.length} 张` : "—"}</span>
            <button type="button" className="print-icon-button" aria-label="下一张"
              disabled={sheetIndex >= sheets.length - 1} onClick={() => setSheetIndex((index) => index + 1)}>
              <UiIcon name="next" />
            </button>
          </div>
          <span className="print-preview-paper">{paper ? `${paper.name} · ${orientationLabel}` : ""}</span>
        </div>
        {snapshot && sheet && sheetArea
          ? <SheetPreview snapshot={snapshot} sheet={sheet} area={sheetArea} annotations={!isPdf || annotations}
              color={color && caps?.color !== false} />
          : <div className="print-preview-stage"><span className="print-preview-status">
              {previewError ?? busyText ?? (rangeError ? "没有要打印的页面" : "")}
            </span></div>}
        <div className="print-strip" role="list" aria-label="页面">
          {snapshot && snapshot.sizes.map((_, page) => (
            <StripThumb key={`${snapshot.id}-${page}`} snapshot={snapshot} page={page}
              included={sheetOfPage.has(page)} current={sheetOfPage.get(page) === sheetIndex}
              onClick={() => { const index = sheetOfPage.get(page); if (index != null) setSheetIndex(index); }} />
          ))}
        </div>
      </div>

      <div className="print-options">
        <h2 id="print-dialog-title">打印</h2>
        <div className="print-options-body">
          {printers && printers.length === 0
            ? <p className="print-empty">没有找到打印机。请先在 Windows 设置中添加打印机。</p>
            : <PrintSelect label="打印机" value={printer ?? ""} disabled={disabled || !printers}
                options={(printers ?? []).map((entry) => ({ value: entry.name, label: entry.name, hint: entry.isDefault ? "默认" : undefined }))}
                onChange={(value) => { setPrinter(value); setError(null); }} />}

          <div className="print-row">
            <div className="print-field">
              <label className="print-label" htmlFor="print-copies">份数</label>
              <div className="print-stepper">
                <input id="print-copies" inputMode="numeric" value={copiesText} disabled={disabled}
                  onChange={(event) => {
                    const text = event.target.value.replace(/\D/g, "").slice(0, 3);
                    setCopiesText(text);
                    if (text) setCopies(Math.max(1, Number(text)));
                  }}
                  onBlur={() => changeCopies(copies)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") { event.preventDefault(); changeCopies(copies + 1); }
                    if (event.key === "ArrowDown") { event.preventDefault(); changeCopies(copies - 1); }
                    if (event.key === "Enter") { event.preventDefault(); void print(); }
                  }} />
                <button type="button" aria-label="减少一份" disabled={disabled || copies <= 1} onClick={() => changeCopies(copies - 1)}>
                  <UiIcon name="minus" />
                </button>
                <button type="button" aria-label="增加一份" disabled={disabled || copies >= MAX_COPIES} onClick={() => changeCopies(copies + 1)}>
                  <UiIcon name="plus" />
                </button>
              </div>
            </div>
            <div className="print-field print-field-check">
              <Check label="逐份打印" checked={collate} disabled={disabled || copies <= 1} onChange={setCollate} />
            </div>
          </div>

          <div className="print-field">
            <span className="print-label print-label-row">
              <span id="print-range-label">页面</span>
              {totalPages > 0 && <span className="print-hint">共 {totalPages} 页</span>}
            </span>
            <div className="print-segmented" role="radiogroup" aria-labelledby="print-range-label">
              {(isPdf ? ["all", "current", "custom"] as const : ["all", "custom"] as const).map((mode) => (
                <button key={mode} type="button" role="radio" aria-checked={rangeMode === mode} disabled={disabled}
                  className={rangeMode === mode ? "on" : ""}
                  onClick={() => setRangeMode(mode)}>
                  {{ all: "全部", current: `当前页（${isPdf ? source.currentPage : ""}）`, custom: "自定义" }[mode]}
                </button>
              ))}
            </div>
            {rangeMode === "custom" && (
              <input id="print-range" autoFocus className={`print-input${rangeError ? " invalid" : ""}`} value={rangeText} disabled={disabled}
                placeholder={totalPages ? `例如 1-${Math.min(totalPages, 5)}, ${Math.min(totalPages, 8)}` : "例如 1-5, 8"}
                aria-invalid={Boolean(rangeError)} aria-describedby="print-range-hint"
                onChange={(event) => setRangeText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void print(); } }} />
            )}
            {rangeError && <span id="print-range-hint" className="print-hint error">{rangeError}</span>}
          </div>

          <div className="print-row">
            <PrintSelect label="纸张" value={paperId ?? -1} disabled={disabled || !caps}
              options={(caps?.papers ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
              onChange={setPaperId} />
            <PrintSelect label="方向" value={orientation} disabled={disabled}
              options={isPdf
                ? [{ value: "auto", label: "自动" }, { value: "portrait", label: "纵向" }, { value: "landscape", label: "横向" }] as const
                : [{ value: "portrait", label: "纵向" }, { value: "landscape", label: "横向" }] as const}
              onChange={(value: Orientation) => setOrientation(value)} />
          </div>

          <div className="print-row">
            <PrintSelect label="每张页数" value={pagesPerSheet} disabled={disabled}
              options={PAGES_PER_SHEET.map((count) => ({ value: count, label: count === 1 ? "1 页" : `${count} 页` }))}
              onChange={(value) => setPagesPerSheet(value)} />
            {isPdf
              ? <PrintSelect label="缩放" value={pagesPerSheet === 1 ? scale : "fit"} disabled={disabled || pagesPerSheet !== 1}
                  options={[{ value: "fit", label: "适合纸张" }, { value: "actual", label: "实际大小" }] as const}
                  onChange={(value: ScaleMode) => setScale(value)} />
              : <PrintSelect label="页边距" value={margin} disabled={disabled}
                  options={[{ value: "narrow", label: "窄" }, { value: "normal", label: "正常" }, { value: "wide", label: "宽" }] as const}
                  onChange={(value: MarginPreset) => setMargin(value)} />}
          </div>

          <div className="print-row">
            {caps?.duplex !== false && (
              <PrintSelect label="双面" value={duplex} disabled={disabled || !caps}
                options={[{ value: "none", label: "单面" }, { value: "long", label: "双面，长边翻转" }, { value: "short", label: "双面，短边翻转" }] as const}
                onChange={(value: Duplex) => setDuplex(value)} />
            )}
            {caps?.color !== false && (
              <PrintSelect label="颜色" value={color ? "color" : "mono"} disabled={disabled || !caps}
                options={[{ value: "color", label: "彩色" }, { value: "mono", label: "黑白" }] as const}
                onChange={(value) => setColor(value === "color")} />
            )}
          </div>

          {isPdf && <Check label="打印批注" checked={annotations} disabled={disabled} onChange={setAnnotations} />}

          <button type="button" className="print-link" disabled={disabled || !caps} onClick={() => void openProperties()}>
            打印机属性…
          </button>
        </div>

        <div className="print-footer">
          <span className={`print-summary${error ? " error" : ""}`} role={error ? "alert" : undefined}>
            {error ?? (sheets.length ? `共 ${papers} 张纸` : busyText ?? "")}
          </span>
          <button type="button" onClick={onClose} disabled={printing}>取消</button>
          <button type="button" className="primary" disabled={!canPrint} onClick={() => void print()}>
            {printing ? "正在打印…" : "打印"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
