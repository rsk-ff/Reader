/**
 * Deterministic, observable OS file-drop opening logic.
 *
 * Extracted from the React hook so it can be unit-tested without a Tauri
 * window or DOM renderer. The hook injects the real `openDocument` and is
 * responsible for surfacing any failures to the user.
 */

export interface OpenFailure {
  path: string;
  error: string;
}

/**
 * Convert an arbitrary rejection value into a stable readable string.
 * Avoids `[object Object]` and preserves useful information.
 */
export function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message || value.name || "Unknown error";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json || String(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/**
 * Remove duplicate paths while preserving first-seen order.
 */
export function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Attempt to open every unique dropped path in first-seen order.
 *
 * Opening is sequential so later paths are attempted even if an earlier path
 * rejects, and tab order matches drop order. Every rejection is captured; none
 * becomes unhandled. Returns the list of failures (empty on full success).
 *
 * @param paths     Raw dropped paths (may contain duplicates).
 * @param openDocument Injected opener; typically the workspace store action.
 * @returns Failures, one per path that rejected, in the order they failed.
 */
export async function openDroppedFiles(
  paths: readonly string[],
  openDocument: (path: string) => Promise<void>,
): Promise<OpenFailure[]> {
  const unique = dedupePaths(paths);
  const failures: OpenFailure[] = [];
  for (const path of unique) {
    try {
      await openDocument(path);
    } catch (reason) {
      failures.push({ path, error: toErrorMessage(reason) });
    }
  }
  return failures;
}

/**
 * Format the aggregate failure report for a single user-facing alert.
 */
export function formatOpenFailures(failures: readonly OpenFailure[]): string {
  const lines = failures.map(
    (f) => `• ${f.path}\n  ${f.error}`,
  );
  return [
    `Could not open ${failures.length} ${failures.length === 1 ? "file" : "files"}:`,
    "",
    lines.join("\n"),
  ].join("\n");
}
