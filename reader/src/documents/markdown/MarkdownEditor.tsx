import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as showSaveDialog } from "@tauri-apps/plugin-dialog";

import { isExternalChangeError, useMarkdownText, useMarkdownSave } from "./useMarkdownText";
import { confirmInApp } from "../../workspace/confirmDialog";
import { MilkdownCrepe, type MarkdownCommands } from "./MilkdownCrepe";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownTools } from "./MarkdownTools";
import { printMarkdown } from "./printMarkdown";
import { MarkdownScrollbar } from "./MarkdownScrollbar";
import { MarkdownOutline } from "./MarkdownOutline";
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
    void printMarkdown(snapshot, fileName).catch((error: unknown) => {
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, saveFromEditor, printFromEditor, switchMode, mode]);

  const headings = useMemo(
    () => extractMarkdownHeadings(workingText ?? ""),
    [workingText],
  );

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
        mode={mode}
        dirty={dirty}
        saving={saving}
        printing={printing}
        onSwitch={switchMode}
        onSave={saveFromEditor}
        onPrint={printFromEditor}
        outlineVisible={outlineVisible}
        onToggleOutline={() => setOutlineVisible((visible) => !visible)}
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
              />
            ) : (
              <textarea
                ref={textareaRef}
                className="md-source"
                value={workingText}
                onChange={onSourceChange}
                spellCheck={false}
                placeholder="# Markdown source"
              />
            )}
          </div>
          <MarkdownScrollbar
            containerRef={contentRef}
            sourceRef={textareaRef}
            mode={mode}
            contentVersion={crepeVersion + workingText.length}
          />
        </div>
        <MarkdownTools enabled={mode === "wysiwyg" && commandsReady}
          onFormat={(format) => commandsRef.current?.format(format)} />
      </div>
    </div>
  );
}
