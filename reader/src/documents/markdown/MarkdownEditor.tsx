import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useMarkdownText, useMarkdownSave } from "./useMarkdownText";
import { MilkdownCrepe } from "./MilkdownCrepe";
import { MarkdownToolbar } from "./MarkdownToolbar";

interface MarkdownEditorProps {
  path: string;
  docId: string;
  active: boolean;
}

type Mode = "wysiwyg" | "source";

export function MarkdownEditor({ path, docId, active }: MarkdownEditorProps) {
  const { text, loading, error } = useMarkdownText(path);
  const { save } = useMarkdownSave(path, docId);

  const [mode, setMode] = useState<Mode>("wysiwyg");
  /** Current working text. The single source of truth for both modes. */
  const [workingText, setWorkingText] = useState<string | null>(null);
  /** Bump to force a Crepe re-mount (e.g. after switching back from source). */
  const [crepeVersion, setCrepeVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When the file finishes loading, seed the working text.
  useEffect(() => {
    if (text != null && workingText == null) {
      setWorkingText(text);
    }
  }, [text, workingText]);

  const markDirty = useCallback(
    (next: string) => {
      setWorkingText(next);
      if (!dirty) {
        setDirty(true);
        void invoke("set_dirty", { documentId: docId, dirty: true }).catch(() => {});
      }
    },
    [dirty, docId],
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
  const doSave = useCallback(async () => {
    if (saving || !dirty || workingText == null) return;
    setSaving(true);
    try {
      await save(workingText);
      setDirty(false);
      void invoke("log_frontend", {
        level: "info",
        message: `markdown saved: ${path}`,
      }).catch(() => {});
    } catch (e) {
      void invoke("log_frontend", {
        level: "error",
        message: `markdown save failed: ${e}`,
      }).catch(() => {});
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, workingText, save, path]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void doSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        switchMode(mode === "wysiwyg" ? "source" : "wysiwyg");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, doSave, switchMode, mode]);

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
        onSave={doSave}
      />
      <div className="md-content">
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
    </div>
  );
}
