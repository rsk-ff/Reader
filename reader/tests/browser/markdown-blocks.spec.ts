import { expect, test } from "@playwright/test";

for (const [name, selector, source] of [
  ["引用块", "blockquote", "> Paragraph"],
  ["无序列表", "ul", "* Paragraph"],
  ["有序列表", "ol", "1. Paragraph"],
  ["任务列表", '.label.unchecked', "[ ] Paragraph"],
  ["代码块", ".milkdown-code-block", "```"],
  ["公式块", ".milkdown-code-block", "$$"],
  ["插入表格", "table", "|"],
  ["插入图片", ".milkdown-image-block", "!["],
  ["分隔线", "hr", "***"],
] as const) {
  test(`${name} is reachable, saves Markdown and can be undone`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/tests/browser/markdown-editor.html");
    await page.locator(".ProseMirror > p").first().click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(`.ProseMirror ${selector}`).first()).toBeAttached();
    await page.getByRole("button", { name: "保存 ●", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__readerInvocations
      .filter((item) => item.command === "save_file_text").at(-1)?.args?.content)).toContain(source);
    await page.keyboard.press("Control+z");
    await expect(page.locator(`.ProseMirror ${selector}`)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("heading selector changes structure without replacing the live editor", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  const paragraph = page.locator(".ProseMirror > p").first();
  await paragraph.click();
  const editor = await page.locator(".ProseMirror").elementHandle();
  await page.getByLabel("正文与标题").selectOption("h3");
  await expect(page.locator(".ProseMirror h3")).toContainText("Paragraph 1");
  await page.getByLabel("正文与标题").selectOption("paragraph");
  await expect(page.locator(".ProseMirror h3")).toHaveCount(0);
  expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.getByLabel("正文与标题")).toBeDisabled();
  await expect(page.getByRole("button", { name: "插入表格", exact: true })).toBeDisabled();
});

test("quote and code/formula bodies have compact balanced insets", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html?blocks=1");
  await expect(page.locator(".milkdown-code-block")).toHaveCount(2);
  await expect(page.locator(".katex-display")).toBeVisible();
  const geometry = await page.evaluate(() => {
    const quote = document.querySelector("blockquote")!;
    const block = document.querySelector(".milkdown-code-block")!;
    const body = block.querySelector(".cm-editor")!;
    const line = body.querySelector(".cm-content")!;
    const bodyRect = body.getBoundingClientRect();
    const contentRect = line.getBoundingClientRect();
    const preview = document.querySelector(".preview-panel")!;
    const previewStyle = getComputedStyle(preview);
    return {
      quoteInset: parseFloat(getComputedStyle(quote).paddingLeft),
      ruleWidth: parseFloat(getComputedStyle(quote, "::before").width),
      top: contentRect.top - bodyRect.top,
      bottom: bodyRect.bottom - contentRect.bottom,
      previewTop: parseFloat(previewStyle.paddingTop),
      previewBottom: parseFloat(previewStyle.paddingBottom),
      mathMargin: getComputedStyle(document.querySelector(".katex-display")!).margin,
      headerHeight: block.querySelector(".tools")!.getBoundingClientRect().height,
      headerVisible: getComputedStyle(block.querySelector(".language-button")!).opacity,
    };
  });
  expect(geometry.quoteInset - geometry.ruleWidth).toBeLessThanOrEqual(12);
  expect(Math.abs(geometry.top - geometry.bottom)).toBeLessThanOrEqual(1);
  expect(geometry.top).toBeGreaterThanOrEqual(10);
  expect(geometry.previewTop).toBe(geometry.previewBottom);
  expect(geometry.mathMargin).toBe("0px");
  expect(geometry.headerHeight).toBeLessThanOrEqual(30);
  expect(geometry.headerVisible).toBe("1");
});

test("inline code supports typing at an empty selection", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await page.locator(".ProseMirror > p").first().click();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "行内代码", exact: true }).click();
  await page.keyboard.insertText("typed_code");
  await expect(page.locator(".ProseMirror > p").first().locator("code")).toHaveText("typed_code");
});

test("uploaded image remains in the saved Markdown after switching modes", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await page.locator(".ProseMirror > p").first().click();
  await page.getByRole("button", { name: "插入图片", exact: true }).click();
  await page.locator('.milkdown-image-block input[type="file"]').setInputFiles({
    name: "pixel.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=", "base64"),
  });
  const image = page.locator('.milkdown-image-block img');
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.getByRole("button", { name: "保存 ●", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__readerInvocations
    .filter((item) => item.command === "save_file_text").at(-1)?.args?.content)).toContain("data:image/png;base64,");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".md-source")).toHaveValue(/data:image\/png;base64,/);
  await page.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(page.locator('.milkdown-image-block img')).toHaveAttribute("src", /^data:image\/png;base64,/);
});

test("immediate save and source switch capture typing before the deferred listener", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await page.locator(".ProseMirror > p").first().click();
  await page.keyboard.insertText("Immediate typed content");
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.evaluate(() => window.__readerInvocations
    .filter((item) => item.command === "save_file_text").at(-1)?.args?.content)).toContain("Immediate typed content");
  await page.keyboard.insertText("Mode typed content");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".md-source")).toHaveValue(/Mode typed content/);
});
