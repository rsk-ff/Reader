import { describe, expect, it, vi } from "vitest";

import {
  dedupePaths,
  formatOpenFailures,
  openDroppedFiles,
  toErrorMessage,
} from "./openDroppedFiles";

describe("dedupePaths", () => {
  it("preserves first-seen order and removes duplicates", () => {
    expect(dedupePaths(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupePaths([])).toEqual([]);
  });
});

describe("toErrorMessage", () => {
  it("reads Error.message", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to name for message-less errors", () => {
    expect(toErrorMessage(new TypeError(""))).toBe("TypeError");
  });

  it("passes strings through", () => {
    expect(toErrorMessage("nope")).toBe("nope");
  });

  it("serializes plain objects", () => {
    expect(toErrorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it("handles null/undefined/primitives", () => {
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
    expect(toErrorMessage(7)).toBe("7");
  });
});

describe("openDroppedFiles", () => {
  it("opens nothing and reports no failures for empty input", async () => {
    const open = vi.fn<(p: string) => Promise<void>>();
    const failures = await openDroppedFiles([], open);
    expect(open).not.toHaveBeenCalled();
    expect(failures).toEqual([]);
  });

  it("opens duplicate paths once in first-seen order", async () => {
    const opened: string[] = [];
    const open = vi.fn(async (path: string) => {
      opened.push(path);
    });
    const failures = await openDroppedFiles(
      ["a", "b", "a", "c", "b"],
      open,
    );
    expect(opened).toEqual(["a", "b", "c"]);
    expect(open).toHaveBeenCalledTimes(3);
    expect(failures).toEqual([]);
  });

  it("records a rejected open without preventing later paths", async () => {
    const opened: string[] = [];
    const open = vi.fn(async (path: string) => {
      opened.push(path);
      if (path === "bad") throw new Error("cannot open bad");
    });
    const failures = await openDroppedFiles(
      ["good1", "bad", "good2"],
      open,
    );
    // All paths attempted in order despite the middle failure.
    expect(opened).toEqual(["good1", "bad", "good2"]);
    expect(failures).toEqual([{ path: "bad", error: "cannot open bad" }]);
  });

  it("collects multiple rejected paths for a single aggregate report", async () => {
    const open = vi.fn(async (path: string) => {
      if (path === "x") throw new Error("missing x");
      if (path === "z") throw { code: "ZERR" }; // non-Error rejection
    });
    const failures = await openDroppedFiles(
      ["x", "y", "z"],
      open,
    );
    expect(failures).toHaveLength(2);
    expect(failures[0]).toEqual({ path: "x", error: "missing x" });
    expect(failures[1]).toEqual({ path: "z", error: '{"code":"ZERR"}' });

    const report = formatOpenFailures(failures);
    expect(report).toContain("Could not open 2 files");
    expect(report).toContain("• x");
    expect(report).toContain("• z");
    // Successful path must remain open (helper attempted all paths).
    expect(open).toHaveBeenCalledWith("y");
  });

  it("formats a single failure with singular wording", () => {
    const report = formatOpenFailures([
      { path: "/tmp/missing.pdf", error: "not found" },
    ]);
    expect(report).toContain("Could not open 1 file");
    expect(report).toContain("/tmp/missing.pdf");
    expect(report).toContain("not found");
  });
});
