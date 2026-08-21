import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type { DocumentSession } from "./types";

export type CloseDecision = "save" | "discard" | "cancel";

interface DocumentLifecycleHandlers {
  save: () => Promise<void>;
  discard: () => Promise<void>;
}

interface PromptRequest {
  id: number;
  title: string;
  resolve: (decision: CloseDecision) => void;
}

interface PromptState {
  request: PromptRequest | null;
  ask: (title: string) => Promise<CloseDecision>;
  choose: (decision: CloseDecision) => void;
}

let nextPromptId = 0;
const lifecycleHandlers = new Map<string, DocumentLifecycleHandlers>();

const useUnsavedPrompt = create<PromptState>((set, get) => {
  const queue: PromptRequest[] = [];
  const showNext = () => set({ request: queue[0] ?? null });

  return {
    request: null,
    ask: (title) => new Promise<CloseDecision>((resolve) => {
      queue.push({ id: ++nextPromptId, title, resolve });
      if (queue.length === 1) showNext();
    }),
    choose: (decision) => {
      const request = queue.shift();
      if (!request || request.id !== get().request?.id) return;
      request.resolve(decision);
      showNext();
    },
  };
});

export function registerDocumentLifecycle(
  documentId: string,
  handlers: DocumentLifecycleHandlers,
): () => void {
  lifecycleHandlers.set(documentId, handlers);
  return () => {
    if (lifecycleHandlers.get(documentId) === handlers) {
      lifecycleHandlers.delete(documentId);
    }
  };
}

async function runFallback(
  document: DocumentSession,
  decision: Exclude<CloseDecision, "cancel">,
): Promise<void> {
  if (document.doc_type === "pdf") {
    await invoke(decision === "save" ? "save_document" : "discard_pdf_changes", {
      path: document.path,
    });
    return;
  }
  if (decision === "discard") {
    await invoke("set_dirty", { documentId: document.id, dirty: false });
    return;
  }
  throw new Error(`The editor for ${document.file_name} is not ready to save.`);
}

/** Resolve Save / Don't Save / Cancel before a tab or native window closes. */
export async function prepareDocumentForClose(
  document: DocumentSession,
  title = document.file_name,
): Promise<boolean> {
  if (!document.dirty) return true;

  const decision = await useUnsavedPrompt.getState().ask(title);
  if (decision === "cancel") return false;

  try {
    const handlers = lifecycleHandlers.get(document.id);
    if (handlers) await handlers[decision === "save" ? "save" : "discard"]();
    else await runFallback(document, decision);
    return true;
  } catch (error) {
    window.alert(
      `${decision === "save" ? "Save" : "Discard"} failed for ${title}: ${String(error)}`,
    );
    return false;
  }
}

export function UnsavedChangesDialog() {
  const request = useUnsavedPrompt((state) => state.request);
  const choose = useUnsavedPrompt((state) => state.choose);
  if (!request) return null;

  return (
    <div className="unsaved-dialog-backdrop">
      <section
        className="unsaved-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-description"
      >
        <h2 id="unsaved-dialog-title">Save changes?</h2>
        <p id="unsaved-dialog-description">
          <strong>{request.title}</strong> has unsaved changes.
        </p>
        <div className="unsaved-dialog-actions">
          <button type="button" className="secondary" onClick={() => choose("discard")}>
            Don&apos;t Save
          </button>
          <button type="button" className="secondary" onClick={() => choose("cancel")}>
            Cancel
          </button>
          <button type="button" className="primary" autoFocus onClick={() => choose("save")}>
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
