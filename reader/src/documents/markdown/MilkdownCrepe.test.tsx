// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { MilkdownCrepe } from "./MilkdownCrepe";
import { MarkdownEditor } from "./MarkdownEditor";
import { prepareDocumentForClose, UnsavedChangesDialog } from "../../workspace/documentLifecycle";

type MarkdownListener = (ctx: unknown, markdown: string, previous: string) => void;

const engine = vi.hoisted(() => ({
  instances: [] as Array<{
    root: HTMLElement;
    defaultValue: string;
    element: HTMLElement;
    publish: MarkdownListener;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  create: vi.fn<() => Promise<void>>(),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: engine.invoke }));
vi.mock("./MarkdownScrollbar", () => ({ MarkdownScrollbar: () => null }));
vi.mock("@milkdown/crepe", () => ({
  Crepe: class {
    static Feature = { TopBar: "top", Toolbar: "toolbar", AI: "ai", BlockEdit: "block", CodeMirror: "code" };
    root: HTMLElement;
    defaultValue: string;
    element = document.createElement("div");
    publish: MarkdownListener = () => {};

    constructor({ root, defaultValue }: { root: HTMLElement; defaultValue: string }) {
      this.root = root;
      this.defaultValue = defaultValue;
      this.element.tabIndex = 0;
      this.element.textContent = defaultValue;
      engine.instances.push(this);
    }

    on(register: (listener: { markdownUpdated: (fn: MarkdownListener) => void }) => void) {
      register({ markdownUpdated: (fn) => {
        this.publish = (ctx, markdown, previous) => { this.element.textContent = markdown; fn(ctx, markdown, previous); };
      } });
    }

    getMarkdown() { return this.element.textContent ?? this.defaultValue; }

    async create() {
      await engine.create();
      this.root.append(this.element);
    }

    destroy = vi.fn(async () => { this.element.remove(); });
  },
}));

let host: HTMLDivElement;
let root: Root;
let mounted: boolean;
let registrations: MockInstance<EventTarget["addEventListener"]>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  engine.instances.length = 0;
  engine.create.mockReset().mockResolvedValue();
  engine.invoke.mockReset().mockResolvedValue("initial text");
  registrations = vi.spyOn(EventTarget.prototype, "addEventListener");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(element: ReactNode) {
  await act(async () => root.render(element));
}

async function unmount() {
  await act(async () => root.unmount());
  mounted = false;
}

// jsdom cannot originate trusted keyboard events. Invoke the wrapper's actual
// DOM listener at that boundary, then deliver the engine's serialized edit.
function markEditIntent(instance: (typeof engine.instances)[number]) {
  const index = registrations.mock.calls.findIndex(
    (args, i) => args[0] === "beforeinput" && registrations.mock.contexts[i] === instance.root,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const listener = registrations.mock.calls[index][1] as EventListener;
  listener({ isTrusted: true } as Event);
}

async function clickMode(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe("Milkdown editor lifecycle", () => {
  it("keeps the instance, focus and selection when an edit is echoed back as value", async () => {
    const onChange = vi.fn();
    await render(<MilkdownCrepe value="initial text" onChange={onChange} />);
    const instance = engine.instances[0];
    instance.element.focus();
    const range = document.createRange();
    range.setStart(instance.element.firstChild!, 2);
    range.setEnd(instance.element.firstChild!, 6);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);

    await render(<MilkdownCrepe value="edited text\n\n第二段" onChange={onChange} />);

    expect(engine.instances).toHaveLength(1);
    expect(instance.destroy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(instance.element);
    expect(document.getSelection()!.toString()).toBe("itia");
  });

  it("uses the latest callback, ignores bootstrap changes and stops publishing after unmount", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    await render(<MilkdownCrepe value="initial text" onChange={first} />);
    const instance = engine.instances[0];
    instance.publish(null, "normalized", "initial text");
    expect(first).not.toHaveBeenCalled();
    await render(<MilkdownCrepe value="initial text" onChange={latest} />);
    markEditIntent(instance);
    instance.publish(null, "edited", "initial text");
    expect(latest).toHaveBeenCalledExactlyOnceWith("edited");
    expect(first).not.toHaveBeenCalled();

    await unmount();
    instance.publish(null, "late event", "edited");
    expect(latest).toHaveBeenCalledTimes(1);
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("waits for pending creation before destroying once, without announcing readiness", async () => {
    let finish!: () => void;
    engine.create.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onReady = vi.fn();
    await render(<MilkdownCrepe value="initial text" onChange={vi.fn()} onReady={onReady} />);
    const instance = engine.instances[0];
    await unmount();
    expect(instance.destroy).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(instance.root.childElementCount).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("leaves only one live instance through StrictMode effect replay", async () => {
    const onReady = vi.fn();
    await render(
      <StrictMode><MilkdownCrepe value="initial text" onChange={vi.fn()} onReady={onReady} /></StrictMode>,
    );
    expect(engine.instances.filter((instance) => instance.element.isConnected)).toHaveLength(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    await unmount();
    for (const instance of engine.instances) expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("notifies the latest ready callback after delayed creation", async () => {
    let finish!: () => void;
    engine.create.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = vi.fn();
    const latest = vi.fn();
    const onChange = vi.fn();
    await render(<MilkdownCrepe value="initial text" onChange={onChange} onReady={first} />);
    await render(<MilkdownCrepe value="initial text" onChange={onChange} onReady={latest} />);
    await act(async () => finish());
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(engine.instances).toHaveLength(1);
  });

  it("preserves the live editor on repeated Rendered clicks and loads source edits on return", async () => {
    await render(<MarkdownEditor path="test.md" fileName="test.md" docId="test" untitled={false} active />);
    expect(engine.instances).toHaveLength(1);
    await clickMode("Rendered");
    expect(engine.instances).toHaveLength(1);

    await clickMode("Source");
    expect(engine.instances[0].destroy).toHaveBeenCalledTimes(1);
    const source = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "# Source edit\n\n中文");
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickMode("Rendered");
    expect(engine.instances).toHaveLength(2);
    expect(engine.instances[1].defaultValue).toBe("# Source edit\n\n中文");
  });

  it("keeps one instance through consecutive edits and saves the latest text", async () => {
    await render(<MarkdownEditor path="test.md" fileName="test.md" docId="test" untitled={false} active />);
    const instance = engine.instances[0];
    markEditIntent(instance);
    await act(async () => instance.publish(null, "first edit", "initial text"));
    await act(async () => instance.publish(null, "first edit\n\n第二段", "first edit"));
    expect(engine.instances).toHaveLength(1);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true })));
    expect(engine.invoke).toHaveBeenCalledWith("save_file_text", { path: "test.md", content: "first edit\n\n第二段" });
    expect(host.textContent).toContain("已保存");
  });

  it("reloads the last saved text when changes are explicitly discarded", async () => {
    await render(<>
      <MarkdownEditor path="test.md" fileName="test.md" docId="test" untitled={false} active />
      <UnsavedChangesDialog />
    </>);
    const instance = engine.instances[0];
    markEditIntent(instance);
    await act(async () => instance.publish(null, "unsaved edit", "initial text"));
    let closed!: Promise<boolean>;
    await act(async () => {
      closed = prepareDocumentForClose({
        id: "test", path: "test.md", file_name: "test.md", doc_type: "markdown",
        dirty: true, untitled: false, revision: 0, last_saved_revision: 0, file_size: null,
      });
    });
    await clickMode("Don't Save");
    expect(await closed).toBe(true);
    expect(engine.instances).toHaveLength(2);
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(engine.instances[1].defaultValue).toBe("initial text");
    expect(engine.invoke).not.toHaveBeenCalledWith("save_file_text", expect.anything());
  });
});
