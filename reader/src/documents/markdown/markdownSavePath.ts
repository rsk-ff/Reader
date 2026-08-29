/** Keep native save-dialog results inside Reader's supported Markdown types. */
export function ensureMarkdownExtension(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "md" || extension === "markdown") return path;
  return `${path}.md`;
}
