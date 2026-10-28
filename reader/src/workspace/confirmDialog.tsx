import { useEffect } from "react";
import { create } from "zustand";

/**
 * In-app confirmation, drawn by the webview like the unsaved-changes prompt.
 * Native message boxes hid the pointer over Reader's frameless window, so
 * questions that need a mouse answer use this instead.
 */
interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmState {
  request: ConfirmRequest | null;
  answer: (confirmed: boolean) => void;
}

let nextConfirmId = 0;
const queue: ConfirmRequest[] = [];

const useConfirmPrompt = create<ConfirmState>((set, get) => ({
  request: null,
  answer: (confirmed) => {
    const request = queue.shift();
    if (!request || request.id !== get().request?.id) return;
    request.resolve(confirmed);
    set({ request: queue[0] ?? null });
  },
}));

export function confirmInApp(options: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue.push({ id: ++nextConfirmId, cancelLabel: "取消", ...options, resolve });
    if (queue.length === 1) useConfirmPrompt.setState({ request: queue[0] });
  });
}

export function ConfirmDialog() {
  const request = useConfirmPrompt((state) => state.request);
  const answer = useConfirmPrompt((state) => state.answer);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, answer]);

  if (!request) return null;
  return (
    <div className="unsaved-dialog-backdrop">
      <section
        className="unsaved-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p id="confirm-dialog-description">{request.message}</p>
        <div className="unsaved-dialog-actions">
          {/* Cancel takes focus so Enter keeps the file on disk. */}
          <button type="button" className="secondary" autoFocus onClick={() => answer(false)}>
            {request.cancelLabel}
          </button>
          <button type="button" className="primary" onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
