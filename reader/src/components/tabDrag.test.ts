import { describe, expect, it, vi } from "vitest";

import { allowMoveDrop, startMoveDrag } from "./tabDrag";

/** Minimal fake DataTransfer recording the values assigned to it. */
function fakeDataTransfer() {
  return {
    effectAllowed: "uninitialized",
    dropEffect: "none",
    setData: vi.fn(),
  };
}

describe("startMoveDrag", () => {
  it("advertises an allowed move operation on drag start", () => {
    const dt = fakeDataTransfer();
    startMoveDrag(dt, "tab-1");

    expect(dt.effectAllowed).toBe("move");
    // dropEffect must be pinned to "move" from the first frame so WebView2
    // does not briefly render the prohibited-drop cursor.
    expect(dt.dropEffect).toBe("move");
  });

  it("stashes the source tab id as plain text", () => {
    const dt = fakeDataTransfer();
    startMoveDrag(dt, "tab-42");

    expect(dt.setData).toHaveBeenCalledWith("text/plain", "tab-42");
  });
});

describe("allowMoveDrop", () => {
  it("sets dropEffect to move so the drag-over advertises an allowed drop", () => {
    const dt = fakeDataTransfer();
    dt.dropEffect = "none";

    allowMoveDrop(dt);

    expect(dt.dropEffect).toBe("move");
  });

  it("does not change effectAllowed", () => {
    const dt = fakeDataTransfer();
    dt.effectAllowed = "move";

    allowMoveDrop(dt);

    expect(dt.effectAllowed).toBe("move");
  });
});
