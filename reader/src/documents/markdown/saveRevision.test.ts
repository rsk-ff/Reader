import { describe, expect, it } from "vitest";

import { saveCoversCurrentRevision } from "./saveRevision";

describe("Markdown save revision", () => {
  it("keeps the document dirty when the user edits during a save", () => {
    const revisionWhenSaveStarted = 4;
    const revisionAfterAnotherEdit = 5;
    expect(saveCoversCurrentRevision(revisionWhenSaveStarted, revisionAfterAnotherEdit)).toBe(false);
  });

  it("clears dirty state when the saved revision is still current", () => {
    expect(saveCoversCurrentRevision(4, 4)).toBe(true);
  });
});
