// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { markdownImageUrl, rewriteImageSources } from "./markdownImages";

const served = (path: string) => `http://reader-image.localhost/${encodeURIComponent(path)}`;

describe("markdownImageUrl", () => {
  const doc = "C:\\Notes\\week\\plan.md";

  it("resolves relative paths against the document folder", () => {
    expect(markdownImageUrl(doc, "img/a.png")).toBe(served("C:\\Notes\\week\\img\\a.png"));
    expect(markdownImageUrl(doc, "./img/my%20pic.png")).toBe(served("C:\\Notes\\week\\img\\my pic.png"));
    expect(markdownImageUrl(doc, "../assets/b.jpg?x=1")).toBe(served("C:\\Notes\\assets\\b.jpg"));
  });

  it("keeps absolute and file: paths, and posix documents", () => {
    expect(markdownImageUrl(doc, "D:/pics/c.png")).toBe(served("D:/pics/c.png"));
    expect(markdownImageUrl(doc, "file:///D:/pics/c%20d.png")).toBe(served("D:/pics/c d.png"));
    expect(markdownImageUrl("/home/u/n.md", "i.png")).toBe(served("/home/u/i.png"));
  });

  it("passes web, data and blob URLs through and ignores other schemes", () => {
    expect(markdownImageUrl(doc, "https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(markdownImageUrl(doc, "data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
    expect(markdownImageUrl(doc, "mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("rewrites image sources in printed HTML", () => {
    expect(rewriteImageSources('<p><img src="a.png" alt="x"></p>', doc))
      .toBe(`<p><img src="${served("C:\\Notes\\week\\a.png")}" alt="x"></p>`);
  });
});
