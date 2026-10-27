/** Prevent WebView2 from exposing Chromium's native page context menu. */
export function preventBrowserContextMenu(event: Event): void {
  event.preventDefault();
}

/**
 * The external URL a link should open, read from its raw `href`. Relative
 * hrefs would resolve against the app origin, so only absolute web/mail links
 * and scheme-less `www.` hosts leave the app.
 */
export function externalUrlFromHref(href: string | null): string | null {
  const value = href?.trim() ?? "";
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (/^www\.[^\s/]+\.[^\s]+/i.test(value)) return `https://${value}`;
  return null;
}

/**
 * Keep link clicks from navigating the app webview. Viewers that handle their
 * own links (PDF.js) cancel the event first and are left alone. Links inside
 * an editable document open only with Ctrl/Cmd so plain clicks keep editing.
 */
export function guardLinkNavigation(event: MouseEvent, open: (url: string) => void): void {
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;
  event.preventDefault();
  if (event.type !== "click" || event.button !== 0) return;
  const editable = anchor.closest("[contenteditable='true']") !== null;
  if (editable && !(event.ctrlKey || event.metaKey)) return;
  const url = externalUrlFromHref(anchor.getAttribute("href"));
  if (url) open(url);
}
