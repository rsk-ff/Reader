import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useMarkdownText, useMarkdownSave } from "./useMarkdownText";
import { MilkdownCrepe } from "./MilkdownCrepe";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MarkdownScrollbar } from "./MarkdownScrollbar";
import { MarkdownOutline } from "./MarkdownOutline";
import { extractMarkdownHeadings, type MarkdownHeading } from "./markdownHeadingModel";
import { saveCoversCurrentRevision } from "./saveRevision";
import { useWorkspace } from "../../workspace/store";
import { registerDocumentLifecycle } from "../../workspace/documentLifecycle";

interface MarkdownEditorProps {
  path: string;
  docId: string;
  active: boolean;
}

type Mode = "wysiwyg" | "source";

export function MarkdownEditor({ path, docId, active }: MarkdownEditorProps) {
  const { text, loading, error } = useMarkdownText(path);
  const { save } = useMarkdownSave(path);
  const setDocumentDirtyLocal = useWorkspace((state) => state.setDocumentDirtyLocal);

  const [mode, setMode] = useState<Mode>("wysiwyg");
  /** Current working text. The single source of truth for both modes. */
  const [workingText, setWorkingText] = useState<string | null>(null);
  /** Bump to force a Crepe re-mount (e.g. after switching back from source). */
  const [crepeVersion, setCrepeVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRevisionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const dirtyRef = useRef(false);
  const dirtySyncRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedTextRef = useRef<string | null>(null);

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
      setMode(m);
      if (m === "wysiwyg") {
        setCrepeVersion((v) => v + 1);
      }
    },
    [],
  );

  // Ctrl+S save (§7). Only when this tab is active.
  const doSave = useCallback((): Promise<void> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    if (workingText == null) return Promise.reject(new Error("Markdown text is still loading."));
    if (!dirtyRef.current) return dirtySyncRef.current;
    const savedRevision = editRevisionRef.current;
    const textToSave = workingText;
    setSaving(true);
    const operation = (async () => {
      try {
        await save(textToSave);
        lastSavedTextRef.current = textToSave;
        const savedLatest = saveCoversCurrentRevision(savedRevision, editRevisionRef.current);
        dirtyRef.current = !savedLatest;
        setDirty(!savedLatest);
        await syncDirty(!savedLatest);
        void invoke("log_frontend", {
          level: "info",
          message: `markdown saved: ${path}`,
        }).catch(() => {});
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
  }, [workingText, save, path, syncDirty]);

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

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
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
  }, [active, saveFromEditor, switchMode, mode]);

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

  if (loading) return <div className="md-status">opening markdown…</div>;
  if (error) return <div className="md-status md-status-error">failed to open: {error}</div>;
  if (workingText == null) return <div className="md-status">no content</div>;

  return (
    <div className="md-root">
      <MarkdownToolbar
        mode={mode}
        dirty={dirty}
        saving={saving}
        onSwitch={switchMode}
        onSave={saveFromEditor}
      />
      <div className="md-workspace">
        <MarkdownOutline headings={headings} onNavigate={navigateToHeading} />
        <div className="md-viewport">
          <div ref={contentRef} className="md-content">
            {mode === "wysiwyg" ? (
              <MilkdownCrepe
                key={crepeVersion}
                value={workingText}
                onChange={onChange}
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
      </div>
    </div>
  );
}
