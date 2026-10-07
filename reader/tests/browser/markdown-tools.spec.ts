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
  test(`right rail ${title} keeps selection, updates saving and supports undo`, async ({ page }) => {
    await page.goto("/tests/browser/markdown-editor.html");
    const paragraph = await selectText(page);
    const editor = await page.locator(".ProseMirror").elementHandle();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(paragraph.locator(selector)).toHaveText("Select");
    await expect(page.locator(".milkdown-toolbar")).toHaveCount(0);
    await page.getByRole("button", { name: "保存 ●", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__readerInvocations
      .filter((item) => item.command === "save_file_text").at(-1)?.args?.content)).toContain(source);
    expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
    await page.keyboard.press("Control+z");
    await expect(paragraph.locator(selector)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存 ●", exact: true })).toBeEnabled();
  });
}

test("right rail keeps inline math and link editing available without a selection toolbar", async ({ page }) => {
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
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(node: T): T {
      const added = append.call(this, node) as T;
      if (node instanceof HTMLIFrameElement) {
        const frame = node;
        frame.contentWindow!.print = () => {
          window.__readerPrints.push({
            text: frame.contentDocument!.body.textContent!,
            html: frame.contentDocument!.body.innerHTML,
            title: frame.contentDocument!.title,
          });
          frame.contentWindow!.dispatchEvent(new Event("afterprint"));
        };
      }
      return added;
    };
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
  await expect(page.getByRole("button", { name: "保存 ●", exact: true })).toBeEnabled();
  await expect(page.locator(".markdown-print-source, .markdown-print-frame")).toHaveCount(0);
  expect(await page.evaluate(() => window.__readerInvocations.some((item) => item.command === "save_file_text"))).toBe(false);
});

test("Ctrl+P in source mode prints rendered Markdown, code, table and math without switching modes", async ({ page }) => {
  await capturePrinting(page);
  await page.goto("/tests/browser/markdown-editor.html");
  await page.getByRole("button", { name: "Source", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Source", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".markdown-print-source, .markdown-print-frame")).toHaveCount(0);
});

test("compact Markdown layout keeps output actions and the right rail within the window", async ({ page }) => {
  await page.setViewportSize({ width: 330, height: 480 });
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".ProseMirror")).toBeVisible();
  const rail = await page.locator(".document-tool-rail").boundingBox();
  expect(rail!.x + rail!.width).toBe(330);
  for (const name of ["打印", "已保存", "Source", "Rendered"]) {
    const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(330);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(330);
});


test("all Markdown toolbar SVG masks parse and their image resources decode", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".document-tool-icon")).toHaveCount(16);
  const resources = await page.locator(".document-tool-icon").evaluateAll(async (elements) => {
    return Promise.all(elements.map(async (element) => {
      const mask = getComputedStyle(element).maskImage;
      if (!mask.startsWith('url("') || !mask.endsWith('")')) return { mask, loaded: false };
      const image = new Image();
      image.src = mask.slice(5, -2);
      try {
        await image.decode();
        return { mask, loaded: image.naturalWidth === 16 && image.naturalHeight === 16 };
      } catch { return { mask, loaded: false }; }
    }));
  });
  for (const resource of resources) {
    expect(resource.mask).not.toBe("none");
    expect(resource.loaded).toBe(true);
  }
});

test("PDF and Markdown rails share icon geometry and the strikeout image; every PDF icon decodes", async ({ page, context }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".document-tool-icon")).toHaveCount(16);
  const pdf = await context.newPage();
  await pdf.route("http://reader-file.localhost/**", (route) => route.fulfill({
    path: path.resolve("tests/fixtures/text-3.pdf"), contentType: "application/pdf",
    headers: { "Access-Control-Allow-Origin": "*" },
  }));
  await pdf.goto("/tests/browser/pdf-viewer.html");
  await expect(pdf.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
  await expect(pdf.locator(".document-tool-icon")).toHaveCount(10);
  const mdStrike = page.getByRole("button", { name: "删除线", exact: true });
  const pdfStrike = pdf.getByRole("button", { name: "Strikeout (select text)", exact: true });
  const metrics = (element: Element) => {
    const button = getComputedStyle(element);
    const icon = getComputedStyle(element.querySelector(".document-tool-icon")!);
    return { width: button.width, height: button.height, color: icon.color,
      iconWidth: icon.width, iconHeight: icon.height, mask: icon.maskImage };
  };
  expect(await pdfStrike.evaluate(metrics)).toEqual(await mdStrike.evaluate(metrics));
  const loaded = await pdf.locator(".document-tool-icon").evaluateAll(async (elements) =>
    Promise.all(elements.map(async (element) => {
      const mask = getComputedStyle(element).maskImage;
      if (!mask.startsWith('url("') || !mask.endsWith('")')) return false;
      const image = new Image();
      image.src = mask.slice(5, -2);
      try { await image.decode(); return image.naturalWidth === 16 && image.naturalHeight === 16; }
      catch { return false; }
    })));
  expect(loaded).toEqual(Array(10).fill(true));
  await pdfStrike.click();
  await expect(pdfStrike).toHaveAttribute("aria-pressed", "true");
  await pdf.close();
});
