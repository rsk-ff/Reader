import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

declare global {
  interface Window {
    __readerInvocations: Array<{ command: string; args?: { content?: string; index?: number } }>;
    __readerPrints: Array<{ text: string; html: string; title: string }>;
  }
}

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => expect(pageErrors.get(page)).toEqual([]));

async function selectText(page: Page) {
  const paragraph = page.locator(".ProseMirror > p").first();
  await paragraph.click();
  const points = await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 13);
    range.setEnd(element.firstChild!, 19);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, right: rect.right, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(points.x, points.y);
  await page.mouse.down();
  await page.mouse.move(points.right, points.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Select");
  return paragraph;
}

for (const [title, selector, source] of [
  ["加粗 (Ctrl+B)", "strong", "**Select**"],
  ["斜体 (Ctrl+I)", "em", "*Select*"],
  ["删除线", "del", "~~Select~~"],
  ["行内代码", "code", "`Select`"],
] as const) {
  test(`toolbar ${title} keeps selection, updates saving and supports undo`, async ({ page }) => {
    await page.goto("/tests/browser/markdown-editor.html");
    const paragraph = await selectText(page);
    const editor = await page.locator(".ProseMirror").elementHandle();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(paragraph.locator(selector)).toHaveText("Select");
    await expect(page.locator(".milkdown-toolbar")).toHaveCount(0);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__readerInvocations
      .filter((item) => item.command === "save_file_text").at(-1)?.args?.content)).toContain(source);
    expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
    await page.keyboard.press("Control+z");
    await expect(paragraph.locator(selector)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  });
}

test("toolbar keeps inline math and link editing available without a selection toolbar", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await selectText(page);
  await page.getByRole("button", { name: "行内公式", exact: true }).click();
  await expect(page.locator('.ProseMirror [data-type="math_inline"]')).toBeAttached();
  await page.goto("/tests/browser/markdown-editor.html");
  await selectText(page);
  await page.getByRole("button", { name: "链接 (Ctrl+K)", exact: true }).click();
  await expect(page.getByPlaceholder("Paste link...")).toBeVisible();
  await expect(page.locator(".milkdown-toolbar")).toHaveCount(0);
});

async function capturePrinting(page: Page) {
  await page.addInitScript(() => {
    window.__readerPrints = [];
    window.print = () => {};
    // Record each print copy as it is added to the page.
    new MutationObserver((records) => {
      for (const record of records) for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement) || node.id !== "reader-print-root") continue;
        const copy = node.cloneNode(true) as HTMLElement;
        copy.querySelector("style")?.remove();
        window.__readerPrints.push({ text: copy.textContent!, html: copy.innerHTML, title: node.dataset.title! });
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

test("printing a clean document leaves it clean and restores editor focus", async ({ page }) => {
  await capturePrinting(page);
  await page.goto("/tests/browser/markdown-editor.html");
  await page.locator(".ProseMirror > p").first().click();
  await page.getByRole("button", { name: "打印", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__readerPrints.length)).toBe(1);
  await expect(page.getByRole("button", { name: "已保存", exact: true })).toBeDisabled();
  await expect(page.locator(".ProseMirror")).toBeFocused();
  expect(await page.evaluate(() => window.__readerInvocations.some((item) => item.command === "set_dirty"))).toBe(false);
});

test("printing rendered edits uses a snapshot and keeps the live editor and unsaved state", async ({ page }) => {
  await capturePrinting(page);
  await page.goto("/tests/browser/markdown-editor.html");
  const paragraph = page.locator(".ProseMirror > p").first();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" unsaved print text");
  const editor = await page.locator(".ProseMirror").elementHandle();
  await page.getByRole("button", { name: "打印", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__readerPrints.length)).toBe(1);
  const snapshot = await page.evaluate(() => window.__readerPrints[0]);
  expect(snapshot.text).toContain("unsaved print text");
  expect(snapshot.text).toContain("Paragraph 40");
  expect(snapshot.title).toBe("fixture.md");
  expect(snapshot.html).not.toContain("contenteditable");
  expect(snapshot.html).not.toContain("button");
  expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await expect(page.locator(".markdown-print-source, .markdown-print-frame")).toHaveCount(0);
  await expect(page.locator("#reader-print-root")).toBeHidden();
  expect(await page.evaluate(() => window.__readerInvocations.some((item) => item.command === "save_file_text"))).toBe(false);
});

test("Ctrl+P in source mode prints rendered Markdown, code, table and math without switching modes", async ({ page }) => {
  await capturePrinting(page);
  await page.goto("/tests/browser/markdown-editor.html");
  await page.getByRole("button", { name: "源码视图", exact: true }).click();
  const markdown = "# Unsaved heading\n\n**printed bold**\n\n```js\nconst n = 2;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x^2$\n";
  await page.locator(".md-source").fill(markdown);
  await expect(page.getByRole("button", { name: "加粗 (Ctrl+B)", exact: true })).toBeDisabled();
  await page.keyboard.press("Control+p");
  await expect.poll(() => page.evaluate(() => window.__readerPrints.length)).toBe(1);
  const snapshot = await page.evaluate(() => window.__readerPrints[0]);
  expect(snapshot.html).toContain('>Unsaved heading</h1>');
  expect(snapshot.html).toContain("<strong>printed bold</strong>");
  expect(snapshot.html).toContain("const n = 2;");
  expect(snapshot.html).toContain("<table>");
  expect(snapshot.html).toContain("katex");
  expect(snapshot.html).not.toContain("cm-editor");
  await expect(page.locator(".md-source")).toHaveValue(markdown);
  await expect(page.getByRole("button", { name: "源码视图", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".markdown-print-source, .markdown-print-frame")).toHaveCount(0);
  await expect(page.locator("#reader-print-root")).toBeHidden();
});

test("compact Markdown layout keeps output actions and the mode switch within the window", async ({ page }) => {
  await page.setViewportSize({ width: 330, height: 480 });
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await expect(page.locator(".document-tool-rail")).toHaveCount(0);
  for (const name of ["打印", "已保存", "源码视图", "排版视图"]) {
    const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(330);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(330);
});

test("PDF and Markdown toolbars draw the same Lucide icon size and stroke", async ({ page, context }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".md-format-group button")).toHaveCount(15);
  const pdf = await context.newPage();
  await pdf.route("http://reader-file.localhost/**", (route) => route.fulfill({
    path: path.resolve("tests/fixtures/text-3.pdf"), contentType: "application/pdf",
    headers: { "Access-Control-Allow-Origin": "*" },
  }));
  await pdf.goto("/tests/browser/pdf-viewer.html");
  await expect(pdf.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
  const metrics = (element: Element) => {
    const icon = element.querySelector("svg.ui-icon")!;
    const style = getComputedStyle(icon);
    return { width: style.width, height: style.height, stroke: icon.getAttribute("stroke-width"),
      paths: icon.querySelectorAll("path").length > 0 };
  };
  const mdQuote = await page.getByRole("button", { name: "引用块", exact: true }).evaluate(metrics);
  const pdfMark = await pdf.getByRole("button", { name: "标记文字", exact: true }).evaluate(metrics);
  expect(pdfMark).toEqual(mdQuote);
  expect(mdQuote).toEqual({ width: "18px", height: "18px", stroke: "1.6", paths: true });
  // Letter icons draw at the optical size of the pictograms.
  const mdBold = await page.getByRole("button", { name: "加粗 (Ctrl+B)", exact: true }).evaluate(metrics);
  expect(mdBold).toEqual({ width: "15px", height: "15px", stroke: "1.6", paths: true });
  const empty = await pdf.locator(".pdf-toolbar svg.ui-icon").evaluateAll((icons) =>
    icons.filter((icon) => icon.querySelectorAll("path").length === 0).length);
  expect(empty).toBe(0);
  await pdf.close();
});

test("PDF and Markdown toolbars share identical ends", async ({ page, context }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".ProseMirror")).toBeVisible();
  const pdf = await context.newPage();
  await pdf.setViewportSize({ width: 1100, height: 760 });
  await pdf.route("http://reader-file.localhost/**", (route) => route.fulfill({
    path: path.resolve("tests/fixtures/text-3.pdf"), contentType: "application/pdf",
    headers: { "Access-Control-Allow-Origin": "*" },
  }));
  await pdf.goto("/tests/browser/pdf-viewer.html");
  await expect(pdf.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
  const ends = (target: Page, toolbar: string) => target.locator(toolbar).evaluate((bar) => {
    const right = bar.getBoundingClientRect().right;
    const box = (selector: string) => {
      const rect = bar.querySelector(selector)!.getBoundingClientRect();
      return { x: Math.round(rect.x), w: Math.round(rect.width), fromRight: Math.round(right - rect.right) };
    };
    return {
      toggle: box(".tbtn"),
      separator: box(".toolbar-separator"),
      search: box(".doc-search"),
      print: box('[aria-label="打印"]'),
      save: box(".document-save"),
    };
  });
  const md = await ends(page, ".md-toolbar");
  const pdfEnds = await ends(pdf, ".pdf-toolbar");
  expect(pdfEnds.toggle).toEqual(md.toggle);
  expect(pdfEnds.separator).toEqual(md.separator);
  expect(pdfEnds.search.w).toBe(md.search.w);
  expect(pdfEnds.search.fromRight).toBe(md.search.fromRight);
  expect(pdfEnds.print).toEqual(md.print);
  expect(pdfEnds.save).toEqual(md.save);
  await pdf.close();
});
