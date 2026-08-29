import { describe, expect, it } from "vitest";

import { ensureMarkdownExtension } from "./markdownSavePath";

describe("ensureMarkdownExtension", () => {
  it("keeps supported Markdown extensions", () => {
    expect(ensureMarkdownExtension("C:\\notes\\draft.md")).toBe("C:\\notes\\draft.md");
    expect(ensureMarkdownExtension("C:\\notes\\draft.MARKDOWN")).toBe(
      "C:\\notes\\draft.MARKDOWN",
    );
  });

  it("adds .md when the dialog result has no supported extension", () => {
    expect(ensureMarkdownExtension("C:\\notes\\draft")).toBe("C:\\notes\\draft.md");
    expect(ensureMarkdownExtension("C:\\notes\\draft.txt")).toBe(
      "C:\\notes\\draft.txt.md",
    );
  });
});
