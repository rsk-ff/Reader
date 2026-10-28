import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { addBlockTypeCommand, setBlockTypeCommand, wrapInBlockTypeCommand, selectTextNearPosCommand,
  paragraphSchema, headingSchema, blockquoteSchema, bulletListSchema, orderedListSchema, listItemSchema,
  codeBlockSchema, hrSchema, inlineCodeSchema, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand } from "@milkdown/kit/preset/commonmark";
import { createTable, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import { markdownImageUrl } from "./markdownImages";
import { toggleLinkCommand } from "@milkdown/kit/component/link-tooltip";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./milkdownTheme.css";

export type MarkdownFormat = "bold" | "italic" | "strikeout" | "code" | "link" | "math"
  | "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "quote" | "bullet" | "ordered" | "task" | "codeBlock" | "mathBlock" | "table" | "image" | "divider";
export interface MarkdownCommands {
  format: (format: MarkdownFormat) => void;
  getMarkdown: () => string;
  flush: () => string;
}

const formattingCommands = {
  bold: toggleStrongCommand,
  italic: toggleEmphasisCommand,
  strikeout: toggleStrikethroughCommand,
  code: toggleInlineCodeCommand,
  link: toggleLinkCommand,
  // Crepe's public command registry exposes its inline LaTeX command by name.
  math: "ToggleLatex",
};

interface MilkdownCrepeProps {
  /** Initial markdown for this mount. Use a React key to load another value. */
  value: string;
  /** Fired on every user edit with the new markdown string. */
  onChange: (markdown: string) => void;
  /** Fired once the editor is mounted and ready. */
  onReady?: () => void;
  onCommands?: (commands: MarkdownCommands | null) => void;
  /** Path of the Markdown file, used to resolve relative image paths. */
  documentPath?: string;
}

/**
 * Crepe (Milkdown) WYSIWYG editor wrapper.
 *
 * Lifecycle is managed imperatively: Crepe owns the DOM inside `rootRef`, and
 * we create/destroy it on mount/unmount. Editing echoes updated text through
 * React without replacing the live editor, its selection or undo history.
 * The parent explicitly re-mounts when loading source edits or discarding edits.
 */
export function MilkdownCrepe({ value, onChange, onReady, onCommands, documentPath }: MilkdownCrepeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(value);
  const documentPathRef = useRef(documentPath);
  documentPathRef.current = documentPath;
  const callbacksRef = useRef({ onChange, onReady, onCommands });
  const lifecycleRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    callbacksRef.current = { onChange, onReady, onCommands };
  }, [onChange, onReady, onCommands]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let destroyed = false;
    let hasEditIntent = false;
    let crepe: Crepe | null = null;
    let lastPublished = initialValueRef.current;
    const publish = (markdown: string) => {
      if (destroyed || !hasEditIntent || markdown === lastPublished) return;
      lastPublished = markdown;
      callbacksRef.current.onChange(markdown);
    };

    const reportError = (phase: string, error: unknown) => {
      void invoke("log_frontend", {
        level: "error",
        message: `milkdown ${phase} failed: ${error}`,
      }).catch(() => {});
    };

    const markEditIntent = (event: Event) => {
      if (event.isTrusted) hasEditIntent = true;
    };
    const onEditingKey = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;
      const key = event.key.toLowerCase();
      const plainEditingKey =
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.key.length === 1 ||
          ["Enter", "Backspace", "Delete", "Tab"].includes(event.key));
      const editingShortcut =
        (event.ctrlKey || event.metaKey) &&
        ["z", "y", "b", "i", "u", "k", "enter"].includes(key);
      if (event.isComposing || plainEditingKey || editingShortcut) {
        hasEditIntent = true;
      }
    };
    const onEditingControlPointer = (event: PointerEvent) => {
      if (
        !event.isTrusted ||
        event.button !== 0 ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      if (
        event.target.closest(
          "button, input, select, textarea, [role='button'], .label-wrapper, .uploader, .image-edit .confirm",
        )
      ) {
        hasEditIntent = true;
      }
    };

    root.addEventListener("beforeinput", markEditIntent, true);
    root.addEventListener("change", markEditIntent, true);
    root.addEventListener("compositionstart", markEditIntent, true);
    root.addEventListener("paste", markEditIntent, true);
    root.addEventListener("cut", markEditIntent, true);
    root.addEventListener("drop", markEditIntent, true);
    root.addEventListener("keydown", onEditingKey, true);
    root.addEventListener("pointerdown", onEditingControlPointer, true);

    // StrictMode can replay this effect on the same DOM root. Serialize the
    // previous cleanup before starting again, and skip cancelled setup work.
    const created = lifecycleRef.current
      .then(async () => {
        if (destroyed) return;
        crepe = new Crepe({
          root,
          defaultValue: initialValueRef.current,
          features: {
            // Reader keeps inline editing without Notion-style block handles.
            // Its own toolbar supplies document actions; AI stays disabled.
            [Crepe.Feature.TopBar]: false,
            [Crepe.Feature.Toolbar]: false,
            [Crepe.Feature.AI]: false,
            [Crepe.Feature.BlockEdit]: false,
          },
          featureConfigs: {
            // Crepe defaults to oneDark even when the outer editor is light.
            // Null selects CodeMirror's basic light theme; the public type
            // does not expose "none".
            [Crepe.Feature.CodeMirror]: { theme: null as never },
            [Crepe.Feature.ImageBlock]: {
              // Blob URLs expire with the webview. Embed uploaded images so
              // a saved document can reopen them without a new file protocol.
              onUpload: (file) => new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(reader.error ?? new Error("无法读取图片"));
                reader.onabort = () => reject(new Error("图片读取已取消"));
                reader.readAsDataURL(file);
              }),
              proxyDomURL: (url) => documentPathRef.current ? markdownImageUrl(documentPathRef.current, url) : url,
              blockUploadButton: "选择图片", blockConfirmButton: "确认",
              blockUploadPlaceholderText: "或粘贴图片地址", blockCaptionPlaceholderText: "图片说明",
            },
          },
        });

        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => {
            // Async table/task-list setup can normalize GFM without an edit.
            // Ignore those changes, and ignore events from an obsolete mount.
            if (destroyed || !hasEditIntent) return;
            publish(markdown);
          });
        });

        await crepe.create();
        if (!destroyed) {
          callbacksRef.current.onCommands?.({
            getMarkdown: () => crepe!.getMarkdown(),
            flush: () => {
              // File upload and ordinary typing also pass through Crepe's
              // debounced listener. Capture them before saving or mode changes.
              if (!destroyed && hasEditIntent) publish(crepe!.getMarkdown());
              return lastPublished;
            },
            format: (format) => {
              if (destroyed || !crepe) return;
              hasEditIntent = true;
              const before = crepe.getMarkdown();
              crepe.editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                view.focus();
                const commands = ctx.get(commandsCtx);
                if (format in formattingCommands) {
                  const command = formattingCommands[format as keyof typeof formattingCommands];
                  if (format === "code" && view.state.selection.empty) {
                    const mark = inlineCodeSchema.type(ctx);
                    const marks = view.state.storedMarks ?? view.state.selection.$from.marks();
                    view.dispatch(marks.some((item) => item.type === mark)
                      ? view.state.tr.removeStoredMark(mark) : view.state.tr.addStoredMark(mark.create()));
                  } else {
                    commands.call(typeof command === "string" ? command : command.key);
                  }
                } else if (format === "paragraph" || /^h[1-6]$/.test(format)) {
                  commands.call(setBlockTypeCommand.key, {
                    nodeType: format === "paragraph" ? paragraphSchema.type(ctx) : headingSchema.type(ctx),
                    attrs: format === "paragraph" ? {} : { level: Number(format.slice(1)) },
                  });
                } else if (format === "quote" || format === "bullet" || format === "ordered" || format === "task") {
                  const schema = { quote: blockquoteSchema, bullet: bulletListSchema, ordered: orderedListSchema, task: listItemSchema }[format];
                  commands.call(wrapInBlockTypeCommand.key, { nodeType: schema.type(ctx),
                    ...(format === "task" ? { attrs: { checked: false } } : {}) });
                } else if (format === "codeBlock") {
                  commands.call(setBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx) });
                } else if (format === "mathBlock") {
                  commands.call(addBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx), attrs: { language: "LaTeX" } });
                } else if (format === "table") {
                  const from = view.state.selection.from;
                  commands.call(addBlockTypeCommand.key, { nodeType: createTable(ctx, 3, 3) });
                  commands.call(selectTextNearPosCommand.key, { pos: from });
                } else if (format === "image") {
                  commands.call(addBlockTypeCommand.key, { nodeType: imageBlockSchema.type(ctx) });
                } else if (format === "divider") {
                  commands.call(addBlockTypeCommand.key, { nodeType: hrSchema.type(ctx) });
                }
              });
              const markdown = crepe.getMarkdown();
              if (markdown !== before) publish(markdown);
            },
          });
          callbacksRef.current.onReady?.();
        }
      })
      .catch((error: unknown) => reportError("init", error));

    return () => {
      destroyed = true;
      callbacksRef.current.onCommands?.(null);
      root.removeEventListener("beforeinput", markEditIntent, true);
      root.removeEventListener("change", markEditIntent, true);
      root.removeEventListener("compositionstart", markEditIntent, true);
      root.removeEventListener("paste", markEditIntent, true);
      root.removeEventListener("cut", markEditIntent, true);
      root.removeEventListener("drop", markEditIntent, true);
      root.removeEventListener("keydown", onEditingKey, true);
      root.removeEventListener("pointerdown", onEditingControlPointer, true);
      lifecycleRef.current = created
        .then(async () => { await crepe?.destroy(); })
        .catch((error: unknown) => reportError("destroy", error));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="milkdown-root" />;
}
