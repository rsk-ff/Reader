import { describe, expect, it } from "vitest";

import { lifecycleResultAllowsClose } from "./documentLifecycle";

describe("untitled Markdown close lifecycle", () => {
  it("keeps the tab open when the first-save dialog is cancelled", () => {
    expect(lifecycleResultAllowsClose("save", false)).toBe(false);
  });

  it("allows close after a completed save or discard", () => {
    expect(lifecycleResultAllowsClose("save", true)).toBe(true);
    expect(lifecycleResultAllowsClose("save", undefined)).toBe(true);
    expect(lifecycleResultAllowsClose("discard", undefined)).toBe(true);
  });
});
