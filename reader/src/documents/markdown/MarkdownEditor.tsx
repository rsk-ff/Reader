import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as showSaveDialog } from "@tauri-apps/plugin-dialog";

import { isExternalChangeError, useMarkdownText, useMarkdownSave } from "./useMarkdownText";
import { confirmInApp } from "../../workspace/confirmDialog";
import { MilkdownCrepe, type MarkdownCommands } from "./MilkdownCrepe";
import { MarkdownModeSwitch, MarkdownToolbar } from "./MarkdownToolbar";
import { printMarkdown } from "./printMarkdown";
import { MarkdownScrollbar } from "./MarkdownScrollbar";
import { MarkdownOutline } from "./MarkdownOutline";
import { clearPaintedRanges, findMatches, findRanges, paintRanges, wrapIndex, type TextMatch } from "./markdownSearch";
import { extractMarkdownHeadings, type MarkdownHeading } from "./markdownHeadingModel";
import { saveCoversCurrentRevision } from "./saveRevision";
import { ensureMarkdownExtension } from "./markdownSavePath";
import { useWorkspace } from "../../workspace/store";
import { registerDocumentLifecycle } from "../../workspace/documentLifecycle";

interface MarkdownEditorProps {
  path: string;
  fileName: string;
  docId: string;
  untitled: boolean;
  active: boolean;
}

type Mode = "wysiwyg" | "source";

export function MarkdownEditor({
  path,
  fileName,
  docId,
  untitled,
  active,
}: MarkdownEditorProps) {
  const { text, loading, error } = useMarkdownText(untitled ? null : path);
  const { save: saveExisting } = useMarkdownSave(path);
  const setDocumentDirtyLocal = useWorkspace((state) => state.setDocumentDirtyLocal);
  const refreshWorkspace = useWorkspace((state) => state.refresh);

  const [mode, setMode] = useState<Mode>("wysiwyg");
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [outlineWidth, setOutlineWidth] = useState(220);
  /** Current working text. The single source of truth for both modes. */
  const [workingText, setWorkingText] = useState<string | null>(untitled ? "" : null);
  /** Bump to force a Crepe re-mount (e.g. after switching back from source). */
  const [crepeVersion, setCrepeVersion] = useState(0);
  const [dirty, setDirty] = useState(untitled);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [commandsReady, setCommandsReady] = useState(false);
  const commandsRef = useRef<MarkdownCommands | null>(null);
  const printingRef = useRef(false);
  const onCommands = useCallback((commands: MarkdownCommands | null) => {
    commandsRef.current = commands;
    setCommandsReady(commands !== null);
  }, []);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  /** Rendered-view ranges live in a ref; the version re-runs dependent effects. */
  const searchRangesRef = useRef<Range[]>([]);
  /** The query `searchRangesRef` was computed for. */
  const searchRangesQueryRef = useRef("");
  const [searchRangesVersion, setSearchRangesVersion] = useState(0);
  /** Set by explicit navigation so edits never move the viewport. */
  const [searchScroll, setSearchScroll] = useState(0);
  const pendingSearchScrollRef = useRef(false);
  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchIndex(0);
    pendingSearchScrollRef.current = true;
    setSearchScroll((value) => value + 1);
  }, []);
  const navigateSearch = useCallback((step: 1 | -1) => {
    setSearchIndex((index) => index + step);
    pendingSearchScrollRef.current = true;
    setSearchScroll((value) => value + 1);
  }, []);
  const editRevisionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const dirtyRef = useRef(untitled);
  const dirtySyncRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedTextRef = useRef<string | null>(untitled ? "" : null);

  // When the file finishes loading, seed the working text.
  useEffect(() => {
    if (text != null && workingText == null) {
      setWorkingText(text);
      lastSavedTextRef.current = text;
    }
  }, [text, workingText]);

  const syncDirty = useCallback(
    (nextDirty: boolean) => {
      setDocumentDirtyLocal(docId, nextDirty);
      const pending = dirtySyncRef.current
        .catch(() => {})
        .then(() => invoke<void>("set_dirty", { documentId: docId, dirty: nextDirty }));
      dirtySyncRef.current = pending;
      return pending;
    },
    [docId, setDocumentDirtyLocal],
  );

  const markDirty = useCallback(
    (next: string) => {
      editRevisionRef.current += 1;
      setWorkingText(next);
      if (!dirtyRef.current) {
        dirtyRef.current = true;
        setDirty(true);
        void syncDirty(true).catch(() => {});
      }
    },
    [syncDirty],
  );

  // WYSIWYG edit handler.
  const onChange = useCallback(
    (markdown: string) => {
      markDirty(markdown);
    },
    [markDirty],
  );

  // Source mode edit handler.
  const onSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      markDirty(e.target.value);
    },
    [markDirty],
  );

  // Switch modes: source→WYSIWYG must re-mount Crepe with the edited text.
  const switchMode = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      if (mode === "wysiwyg") commandsRef.current?.flush();
      setMode(m);
      if (m === "wysiwyg") {
        setCrepeVersion((v) => v + 1);
      }
    },
    [mode],
  );

  // Ctrl+S save (§7). Only when this tab is active.
  const doSave = useCallback((): Promise<boolean> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    if (workingText == null) return Promise.reject(new Error("Markdown text is still loading."));
    const textToSave = mode === "wysiwyg" && commandsRef.current
      ? commandsRef.current.flush() : workingText;
    if (!dirtyRef.current) return dirtySyncRef.current.then(() => true);
    const savedRevision = editRevisionRef.current;
    setSaving(true);
    const operation = (async () => {
      try {
        let savedPath = path;
        if (untitled) {
          const selectedPath = await showSaveDialog({
            title: "保存 Markdown",
            defaultPath: fileName,
            filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
          });
          if (!selectedPath) return false;
          savedPath = ensureMarkdownExtension(selectedPath);
          await invoke<string>("save_markdown_document_as", {
            documentId: docId,
            path: savedPath,
            content: textToSave,
          });
          await refreshWorkspace();
        } else {
          try {
            await saveExisting(textToSave);
          } catch (error) {
            if (!isExternalChangeError(error)) throw error;
            const overwrite = await confirmInApp({
              title: "文件已被修改",
              message: `“${fileName}”在 Reader 外被修改过。覆盖磁盘上的版本，用 Reader 里的内容替换它吗？`,
              confirmLabel: "覆盖",
            });
            if (!overwrite) return false;
            await saveExisting(textToSave, true);
          }
        }
        lastSavedTextRef.current = textToSave;
        const savedLatest = saveCoversCurrentRevision(savedRevision, editRevisionRef.current);
        dirtyRef.current = !savedLatest;
        setDirty(!savedLatest);
        await syncDirty(!savedLatest);
        void invoke("log_frontend", {
          level: "info",
          message: `markdown saved: ${savedPath}`,
        }).catch(() => {});
        return true;
      } catch (e) {
        void invoke("log_frontend", {
          level: "error",
          message: `markdown save failed: ${e}`,
        }).catch(() => {});
        throw e;
      } finally {
        setSaving(false);
      }
    })();
    saveInFlightRef.current = operation;
    void operation.then(
      () => {
        if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
      },
      () => {
        if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
      },
    );
    return operation;
  }, [
    mode,
    workingText,
    path,
    untitled,
    fileName,
    docId,
    saveExisting,
    refreshWorkspace,
    syncDirty,
  ]);

  const discardChanges = useCallback(async () => {
    await saveInFlightRef.current?.catch(() => {});
    const savedText = lastSavedTextRef.current;
    if (savedText == null) throw new Error("The last saved Markdown text is unavailable.");
    dirtyRef.current = false;
    setDirty(false);
    setWorkingText(savedText);
    setCrepeVersion((version) => version + 1);
    try {
      await syncDirty(false);
    } catch (error) {
      dirtyRef.current = true;
      setDirty(true);
      throw error;
    }
  }, [syncDirty]);

  useEffect(
    () => registerDocumentLifecycle(docId, { save: doSave, discard: discardChanges }),
    [docId, doSave, discardChanges],
  );

  const saveFromEditor = useCallback(() => {
    void doSave().catch((error: unknown) => {
      window.alert(`Markdown save failed: ${String(error)}`);
    });
  }, [doSave]);

  const printFromEditor = useCallback(() => {
    if (workingText == null || printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    const snapshot = mode === "wysiwyg" ? commandsRef.current?.getMarkdown() ?? workingText : workingText;
    void printMarkdown(snapshot, fileName, untitled ? undefined : path).catch((error: unknown) => {
      window.alert(`Markdown 打印失败：${String(error)}`);
    }).finally(() => {
      printingRef.current = false;
      setPrinting(false);
    });
  }, [workingText, fileName, mode]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        printFromEditor();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveFromEditor();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        switchMode(mode === "wysiwyg" ? "source" : "wysiwyg");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "F3") {
        e.preventDefault();
        navigateSearch(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, saveFromEditor, printFromEditor, switchMode, mode, navigateSearch]);

  const headings = useMemo(
    () => extractMarkdownHeadings(workingText ?? ""),
    [workingText],
  );

  // ---- Find in document ----
  const sourceMatches = useMemo<TextMatch[]>(
    () => (mode === "source" ? findMatches(workingText ?? "", searchQuery) : []),
    [mode, workingText, searchQuery],
  );

  useEffect(() => {
    if (mode !== "wysiwyg" || !active || !searchQuery) {
      searchRangesRef.current = [];
      searchRangesQueryRef.current = searchQuery;
      setSearchRangesVersion((version) => version + 1);
      return;
    }
    // Wait one frame so ProseMirror has rendered the latest text.
    const frame = requestAnimationFrame(() => {
      const root = contentRef.current?.querySelector(".ProseMirror");
      searchRangesRef.current = root ? findRanges(root, searchQuery) : [];
      searchRangesQueryRef.current = searchQuery;
      setSearchRangesVersion((version) => version + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, active, searchQuery, workingText, crepeVersion, commandsReady]);

  const matchCount = mode === "source" ? sourceMatches.length : searchRangesRef.current.length;
  const currentMatch = wrapIndex(searchIndex, matchCount);

  useEffect(() => {
    if (mode !== "wysiwyg" || !active) return;
    paintRanges(searchRangesRef.current, currentMatch);
    return clearPaintedRanges;
  }, [mode, active, currentMatch, searchRangesVersion]);

  // Scroll once the current query's matches exist: rendered-view ranges are
  // found a frame after the query changes.
  useEffect(() => {
    if (!pendingSearchScrollRef.current) return;
    if (mode === "wysiwyg") {
      if (searchRangesQueryRef.current !== searchQuery) return;
      const range = searchRangesRef.current[currentMatch];
      const container = contentRef.current;
      if (!range || !container) return;
      pendingSearchScrollRef.current = false;
      const rect = range.getBoundingClientRect();
      const bounds = container.getBoundingClientRect();
      if (rect.top < bounds.top + 48 || rect.bottom > bounds.bottom - 48) {
        container.scrollTop += rect.top - bounds.top - container.clientHeight / 3;
      }
      return;
    }
    const textarea = textareaRef.current;
    const mark = backdropRef.current?.querySelector<HTMLElement>(".md-hit-current");
    if (!textarea || !mark) return;
    pendingSearchScrollRef.current = false;
    const top = mark.offsetTop;
    if (top < textarea.scrollTop + 48 || top > textarea.scrollTop + textarea.clientHeight - 48) {
      textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
      if (backdropRef.current) backdropRef.current.scrollTop = textarea.scrollTop;
    }
  }, [searchScroll, searchRangesVersion, sourceMatches, currentMatch, mode, searchQuery]);


  const navigateToHeading = useCallback(
    (heading: MarkdownHeading, index: number) => {
      if (mode === "wysiwyg") {
        const renderedHeadings = contentRef.current?.querySelectorAll<HTMLElement>(
          ".milkdown-root .ProseMirror h1, .milkdown-root .ProseMirror h2, " +
            ".milkdown-root .ProseMirror h3, .milkdown-root .ProseMirror h4, " +
            ".milkdown-root .ProseMirror h5, .milkdown-root .ProseMirror h6",
        );
        renderedHeadings?.[index]?.scrollIntoView({ block: "start" });
        return;
      }

      const source = textareaRef.current;
      if (!source) return;
      source.focus();
      source.setSelectionRange(heading.offset, heading.offset);
      const lineHeight = Number.parseFloat(window.getComputedStyle(source).lineHeight) || 20.8;
      source.scrollTop = Math.max(0, heading.line * lineHeight - 24);
    },
    [mode],
  );

  if (loading) return <div className="md-status">正在打开…</div>;
  if (error) {
    return (
      <div className="md-status">
        <div className="md-open-error" role="alert">
          <div className="md-open-error-title">无法打开这个文件</div>
          <p className="md-open-error-detail">{error}</p>
        </div>
      </div>
    );
  }
  if (workingText == null) return <div className="md-status">no content</div>;

  return (
    <div className="md-root">
      <MarkdownToolbar
        dirty={dirty}
        saving={saving}
        printing={printing}
        formatEnabled={mode === "wysiwyg" && commandsReady}
        onFormat={(format) => commandsRef.current?.format(format)}
        onSave={saveFromEditor}
        onPrint={printFromEditor}
        outlineVisible={outlineVisible}
        onToggleOutline={() => setOutlineVisible((visible) => !visible)}
        search={{
          query: searchQuery,
          count: matchCount,
          current: currentMatch,
          inputRef: searchInputRef,
          onQuery: updateSearchQuery,
          onNav: navigateSearch,
        }}
      />
      <div className="md-workspace">
        {outlineVisible && <MarkdownOutline headings={headings} onNavigate={navigateToHeading}
          width={outlineWidth} onWidthChange={setOutlineWidth}
          onCollapse={(restoreWidth) => { setOutlineWidth(restoreWidth); setOutlineVisible(false); }} />}
        <div className="md-viewport">
          <div ref={contentRef} className="md-content">
            {mode === "wysiwyg" ? (
              <MilkdownCrepe
                key={crepeVersion}
                value={workingText}
                onChange={onChange}
                onCommands={onCommands}
                documentPath={untitled ? undefined : path}
              />
            ) : (
              <div className="md-source-wrap">
              <SourceGutter text={workingText} textareaRef={textareaRef} gutterRef={gutterRef} />
              {sourceMatches.length > 0 && (
                <div ref={backdropRef} className="md-source-backdrop" aria-hidden="true">
                  {sourceSegments(workingText, sourceMatches, currentMatch)}
                </div>
              )}
              <textarea
                ref={textareaRef}
                onScroll={(event) => {
                  if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop;
                  if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                }}
                className={"md-source" + (sourceMatches.length > 0 ? " md-source-searching" : "")}
                value={workingText}
                onChange={onSourceChange}
                spellCheck={false}
                placeholder="# Markdown source"
              />
              </div>
            )}
          </div>
          <MarkdownScrollbar
            containerRef={contentRef}
            sourceRef={textareaRef}
            mode={mode}
            contentVersion={crepeVersion + workingText.length}
          />
          <MarkdownModeSwitch mode={mode} onSwitch={switchMode} />
        </div>
      </div>
    </div>
  );
}

/** Source text split around matches, painted behind a transparent textarea. */
function sourceSegments(text: string, matches: TextMatch[], current: number) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  matches.forEach((match, index) => {
    if (match.start > at) parts.push(text.slice(at, match.start));
    parts.push(<mark key={index} className={index === current ? "md-hit md-hit-current" : "md-hit"}>
      {text.slice(match.start, match.end)}</mark>);
    at = match.end;
  });
  // A trailing newline still gets a line in a textarea.
  parts.push(text.slice(at) + "\n");
  return parts;
}

/**
 * Line numbers beside the source textarea. Lines wrap, so each number's row
 * takes the height its line wraps to, measured on a hidden copy of the text
 * laid out at the textarea's width.
 */
function SourceGutter({ text, textareaRef, gutterRef }: {
  text: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  gutterRef: RefObject<HTMLDivElement | null>;
}) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const observer = new ResizeObserver(() => setWidth(textarea.clientWidth));
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [textareaRef]);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure || width === 0) return;
    setHeights(Array.from(measure.children, (child) => (child as HTMLElement).getBoundingClientRect().height));
    if (gutterRef.current && textareaRef.current) gutterRef.current.scrollTop = textareaRef.current.scrollTop;
  }, [lines, width, gutterRef, textareaRef]);

  return <>
    <div ref={measureRef} className="md-source-measure" aria-hidden="true" style={{ width }}>
      {lines.map((line, index) => <div key={index}>{line || "\u200b"}</div>)}
    </div>
    <div ref={gutterRef} className="md-source-gutter" aria-hidden="true">
      {lines.map((_, index) => (
        <div key={index} style={heights[index] ? { height: heights[index] } : undefined}>{index + 1}</div>
      ))}
    </div>
  </>;
}
