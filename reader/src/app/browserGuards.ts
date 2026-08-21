/** Prevent WebView2 from exposing Chromium's native page context menu. */
export function preventBrowserContextMenu(event: Event): void {
  event.preventDefault();
}
