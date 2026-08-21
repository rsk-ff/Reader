import { describe, expect, it, vi } from "vitest";

import { createWindowDragHandlers, isInteractiveTarget } from "./windowDrag";

/** Minimal fake window recording the calls made to it. */
function fakeWindow() {
  return {
    startDragging: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
  };
}

/** Build a DragPointerEvent that looks like it hit the drag region itself. */
function ownEvent(button = 0, detail = 1) {
  const target = {};
  return {
    button,
    detail,
    target,
    currentTarget: target,
    preventDefault: vi.fn(),
  };
}

/** Build a DragPointerEvent that bubbled up from an interactive descendant. */
function descendantEvent(button = 0, detail = 1) {
  return {
    button,
    detail,
    target: {},
    currentTarget: {},
    preventDefault: vi.fn(),
  };
}

describe("isInteractiveTarget", () => {
  it("flags pointer events that bubbled from a descendant", () => {
    expect(isInteractiveTarget({ target: {}, currentTarget: {} })).toBe(true);
  });

  it("passes events that hit the drag region itself", () => {
    const el = {};
    expect(isInteractiveTarget({ target: el, currentTarget: el })).toBe(false);
  });
});

describe("createWindowDragHandlers", () => {
  it("starts a window drag on a single primary mousedown of a blank region", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = ownEvent(0, 1);
    onMouseDown(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(win.startDragging).toHaveBeenCalledTimes(1);
    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("toggles maximize on the second (double-click-count) mousedown without starting a drag", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = ownEvent(0, 2);
    onMouseDown(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(win.startDragging).not.toHaveBeenCalled();
  });

  it("does not drag on non-primary buttons", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = ownEvent(1, 1); // middle click
    onMouseDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.startDragging).not.toHaveBeenCalled();
    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("does not act when an interactive descendant received the mousedown", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = descendantEvent(0, 1);
    onMouseDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.startDragging).not.toHaveBeenCalled();
    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("ignores descendant input even on a double-click-count mousedown", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = descendantEvent(0, 2);
    onMouseDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.toggleMaximize).not.toHaveBeenCalled();
    expect(win.startDragging).not.toHaveBeenCalled();
  });

  it("swallows a failed drag instead of surfacing a rejection", async () => {
    const win = {
      startDragging: vi.fn().mockRejectedValue(new Error("boom")),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    };
    const { onMouseDown } = createWindowDragHandlers(win);

    // Must not throw synchronously.
    onMouseDown(ownEvent(0, 1));

    // The rejection must be handled: await the microtask queue and assert no
    // unhandled rejection propagates.
    await Promise.resolve();
    await Promise.resolve();
    expect(win.startDragging).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed maximize toggle instead of surfacing a rejection", async () => {
    const win = {
      startDragging: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const { onMouseDown } = createWindowDragHandlers(win);

    // Must not throw synchronously.
    onMouseDown(ownEvent(0, 2));

    await Promise.resolve();
    await Promise.resolve();
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
  });
});
