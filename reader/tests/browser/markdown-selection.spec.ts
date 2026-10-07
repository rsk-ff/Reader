import { expect, test } from "@playwright/test";

for (const level of [1, 2, 3, 4, 5, 6]) {
  test(`selecting text does not shift a document starting with H${level}`, async ({ page }) => {
    await page.goto(`/tests/browser/markdown-editor.html?level=${level}`);
    const paragraph = page.locator(".ProseMirror > p").first();
    await paragraph.click();
    await expect(page.locator(".prosemirror-virtual-cursor")).toBeAttached();
    const before = await paragraph.boundingBox();
    expect(before).not.toBeNull();

    const selectionPoints = await paragraph.evaluate((element) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 2);
      range.setEnd(element.firstChild!, 18);
      const rect = range.getBoundingClientRect();
      return { x: rect.x, endX: rect.right, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(selectionPoints.x, selectionPoints.y);
    await page.mouse.down();
    await page.mouse.move(selectionPoints.endX, selectionPoints.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".milkdown-toolbar")).toHaveCount(0);
    const after = await paragraph.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 1);
    expect(await page.locator(".md-content").evaluate((element) => element.scrollTop)).toBe(0);

    // Returning to a caret must not shift the page either.
    await paragraph.click();
    await expect(page.locator(".prosemirror-virtual-cursor")).toBeAttached();
    expect((await paragraph.boundingBox())!.y).toBeCloseTo(before!.y, 1);
  });
}

test("a heading after a paragraph keeps its normal top spacing", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html?intro=1");
  const heading = page.locator(".ProseMirror > h1");
  await expect(heading).toBeVisible();
  const margin = await heading.evaluate((element) => parseFloat(getComputedStyle(element).marginTop));
  expect(margin).toBe(35);
});

test("selecting text midway through a scrolled document keeps the viewport stable", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  const paragraph = page.locator(".ProseMirror > p").nth(25);
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click();
  const before = await paragraph.boundingBox();
  const scrollBefore = await page.locator(".md-content").evaluate((element) => element.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);
  const points = await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 2);
    range.setEnd(element.firstChild!, 18);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, endX: rect.right, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(points.x, points.y);
  await page.mouse.down();
  await page.mouse.move(points.endX, points.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".milkdown-toolbar")).toHaveCount(0);
  expect((await paragraph.boundingBox())!.y).toBeCloseTo(before!.y, 1);
  expect(await page.locator(".md-content").evaluate((element) => element.scrollTop)).toBe(scrollBefore);
});

test("continuous edits preserve the real editor and its undo history", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  const paragraph = page.locator(".ProseMirror > p").first();
  await paragraph.click();
  await page.keyboard.press("End");
  const editor = await page.locator(".ProseMirror").elementHandle();
  const original = await paragraph.textContent();
  await page.keyboard.type(" stable typing", { delay: 25 });
  await expect(paragraph).toHaveText(`${original} stable typing`);
  await expect(page.getByRole("button", { name: "保存 ●", exact: true })).toBeEnabled();
  expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
  await page.keyboard.press("Control+z");
  await expect(paragraph).toHaveText(original!);
  await page.keyboard.press("Control+y");
  await expect(paragraph).toHaveText(`${original} stable typing`);
});
