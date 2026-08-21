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
function ownEvent(button = 0) {
  const target = {};
  return {
    button,
    target,
    currentTarget: target,
    preventDefault: vi.fn(),
  };
}

/** Build a DragPointerEvent that bubbled up from an interactive descendant. */
function descendantEvent(button = 0) {
  return {
    button,
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
  it("starts a window drag on primary mousedown of a blank region", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = ownEvent();
    onMouseDown(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(win.startDragging).toHaveBeenCalledTimes(1);
    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("does not drag on non-primary buttons", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = ownEvent(1); // middle click
    onMouseDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.startDragging).not.toHaveBeenCalled();
  });

  it("does not drag when an interactive descendant received the mousedown", () => {
    const win = fakeWindow();
    const { onMouseDown } = createWindowDragHandlers(win);

    const event = descendantEvent();
    onMouseDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.startDragging).not.toHaveBeenCalled();
  });

  it("toggles maximize on double click of a blank region", () => {
    const win = fakeWindow();
    const { onDoubleClick } = createWindowDragHandlers(win);

    const event = ownEvent();
    onDoubleClick(event);

    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(win.startDragging).not.toHaveBeenCalled();
  });

  it("does not toggle maximize when an interactive descendant was double-clicked", () => {
    const win = fakeWindow();
    const { onDoubleClick } = createWindowDragHandlers(win);

    onDoubleClick(descendantEvent());

    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("swallows a failed drag instead of surfacing a rejection", async () => {
    const win = {
      startDragging: vi.fn().mockRejectedValue(new Error("boom")),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    };
    const { onMouseDown } = createWindowDragHandlers(win);

    // Must not throw synchronously.
    onMouseDown(ownEvent());

    // The rejection must be handled: await the microtask queue and assert no
    // unhandled rejection propagates.
    await Promise.resolve();
    await Promise.resolve();
    expect(win.startDragging).toHaveBeenCalledTimes(1);
  });
});
