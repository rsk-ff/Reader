/**
 * Map an image `src` from a Markdown document to a URL the webview can load.
 *
 * Local paths (relative to the document, absolute, or `file:` URLs) go
 * through the Rust `reader-image` protocol, which serves only images inside
 * the folder of an open Markdown document. `data:`/`blob:` URLs pass through.
 */
export function markdownImageUrl(documentPath: string, src: string): string {
  const trimmed = src.trim();
  if (trimmed === "" || /^(data|blob):/i.test(trimmed)) return trimmed;
  if (/^https?:/i.test(trimmed)) return trimmed;
  const local = localImagePath(documentPath, trimmed);
  return local == null ? trimmed : `http://reader-image.localhost/${encodeURIComponent(local)}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function localImagePath(documentPath: string, src: string): string | null {
  if (/^file:/i.test(src)) {
    let path = safeDecode(src.replace(/^file:\/*/i, "").replace(/[?#].*$/, ""));
    // file:///C:/x → C:/x ; file:///home/x → /home/x
    if (!/^[A-Za-z]:/.test(path)) path = `/${path}`;
    return path;
  }
  // Other URL schemes (mailto:, ftp:, …) are not images Reader can serve.
  if (/^[A-Za-z][A-Za-z0-9+.-]+:/.test(src) && !/^[A-Za-z]:[\\/]/.test(src)) return null;
  const path = safeDecode(src.replace(/[?#].*$/, ""));
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\")) return path;
  return joinRelative(documentPath, path);
}

function joinRelative(documentPath: string, relative: string): string {
  const separator = documentPath.includes("\\") ? "\\" : "/";
  const folder = documentPath.slice(0, Math.max(documentPath.lastIndexOf("\\"), documentPath.lastIndexOf("/")));
  const parts = folder.split(/[\\/]/);
  for (const segment of relative.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join(separator);
}

/** Rewrite `<img src>` in rendered HTML (used for printing). */
export function rewriteImageSources(html: string, documentPath: string): string {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const image of parsed.querySelectorAll("img[src]")) {
    image.setAttribute("src", markdownImageUrl(documentPath, image.getAttribute("src") ?? ""));
  }
  return parsed.body.innerHTML;
}
