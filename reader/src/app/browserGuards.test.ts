// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  externalUrlFromHref,
  guardLinkNavigation,
  preventBrowserContextMenu,
} from "./browserGuards";

describe("preventBrowserContextMenu", () => {
  it("cancels a browser context-menu event", () => {
    const event = new Event("contextmenu", { cancelable: true });

    preventBrowserContextMenu(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe("externalUrlFromHref", () => {
  it("keeps absolute web and mail links", () => {
    expect(externalUrlFromHref("https://example.com/a")).toBe("https://example.com/a");
    expect(externalUrlFromHref(" mailto:a@b.c ")).toBe("mailto:a@b.c");
  });

  it("adds https to scheme-less www hosts", () => {
    expect(externalUrlFromHref("www.example.com/x")).toBe("https://www.example.com/x");
  });

  it("refuses relative, script and file links", () => {
    for (const href of ["notes.md", "/x", "#top", "javascript:alert(1)", "file:///C:/a", null]) {
      expect(externalUrlFromHref(href)).toBeNull();
    }
  });
});

describe("guardLinkNavigation", () => {
  function clickOn(html: string, init: MouseEventInit = {}, type = "click") {
    document.body.innerHTML = html;
    const anchor = document.querySelector("a")!;
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
    Object.defineProperty(event, "target", { value: anchor });
    const open = vi.fn();
    guardLinkNavigation(event, open);
    return { event, open };
  }

  it("opens a read-only link externally instead of navigating the app", () => {
    const { event, open } = clickOn('<a href="https://example.com">x</a>');
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith("https://example.com");
  });

  it("never navigates to a relative link", () => {
    const { event, open } = clickOn('<a href="www-notes.md">x</a>');
    expect(event.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it("needs Ctrl inside an editable document", () => {
    const html = '<div contenteditable="true"><a href="https://example.com">x</a></div>';
    expect(clickOn(html).open).not.toHaveBeenCalled();
    expect(clickOn(html).event.defaultPrevented).toBe(true);
    expect(clickOn(html, { ctrlKey: true }).open).toHaveBeenCalledWith("https://example.com");
  });

  it("blocks middle-click new windows without opening", () => {
    const { event, open } = clickOn('<a href="https://example.com">x</a>', { button: 1 }, "auxclick");
    expect(event.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});
