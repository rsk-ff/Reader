import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.route("http://reader-file.localhost/**", (route) => route.fulfill({
    path: path.resolve("tests/fixtures/text-3.pdf"),
    contentType: "application/pdf",
    headers: { "Access-Control-Allow-Origin": "*" },
  }));
  await page.goto("/tests/browser/pdf-viewer.html");
  await expect(page.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
});

function firstLine(page: Page, pageNumber = 1) {
  return page.locator(`.page[data-page-number="${pageNumber}"] .textLayer span`)
    .filter({ hasText: /\S.{10}/ }).first();
}

async function linePoints(line: Locator, start = 0, end = 8) {
  await expect(line).toBeVisible();
  return line.evaluate((element, offsets) => {
    const text = element.firstChild!;
    const range = document.createRange();
    range.setStart(text, offsets.start);
    range.setEnd(text, offsets.end);
    const rect = range.getBoundingClientRect();
    const lineRect = element.getBoundingClientRect();
    return {
      left: lineRect.left - 24,
      right: lineRect.right + 24,
      start: rect.left,
      end: rect.right,
      y: rect.top + rect.height / 2,
      text: element.textContent!.slice(offsets.start, offsets.end),
    };
  }, { start, end });
}

async function drag(page: Page, startX: number, startY: number, endX: number, endY = startY) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

test("selects from the left margin into text", async ({ page }) => {
  const points = await linePoints(firstLine(page));
  // The press must hit the blank text-layer surface, not a text span.
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("textLayer"),
    { x: points.left, y: points.y })).toBe(true);
  await drag(page, points.left, points.y, points.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
});

test("still selects from inside text", async ({ page }) => {
  const points = await linePoints(firstLine(page), 2, 10);
  await drag(page, points.start, points.y, points.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
});

test("selects backwards from the right margin", async ({ page }) => {
  const line = firstLine(page);
  const text = await line.textContent();
  const points = await linePoints(line, 4, text!.length);
  await drag(page, points.right, points.y, points.start);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
});

test("starts a fresh margin selection after an existing selection", async ({ page }) => {
  const points = await linePoints(firstLine(page));
  await drag(page, points.start, points.y, points.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
  await drag(page, points.left, points.y, points.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
});

test("a blank margin click clears selection without selecting the page", async ({ page }) => {
  const points = await linePoints(firstLine(page));
  await drag(page, points.start, points.y, points.end);
  await page.mouse.click(points.left, points.y);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  // A following native text gesture must use its own anchor.
  const inside = await linePoints(firstLine(page), 3, 9);
  await drag(page, inside.start, inside.y, inside.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(inside.text);
});

test("selects across lines from the left margin", async ({ page }) => {
  const lines = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]')
    .filter({ hasText: /\S.{10}/ });
  const start = await linePoints(lines.nth(0));
  const end = await linePoints(lines.nth(1));
  const firstText = await lines.nth(0).textContent();
  await drag(page, start.left, start.y, end.end, end.y);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(`${firstText}\n${end.text}`);
});

test("selects from the margin after zooming and scrolling to another page", async ({ page }) => {
  await page.getByTitle("Fit page", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "page", exact: true }).fill("2");
  await page.getByRole("spinbutton", { name: "page", exact: true }).press("Enter");
  const points = await linePoints(firstLine(page, 2));
  await drag(page, points.left, points.y, points.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
});

test("margin selection supplies text quads to the highlight tool", async ({ page }) => {
  await page.getByTitle("Highlight (select text)", { exact: true }).click();
  await expect(page.locator('.page[data-page-number="1"] .pdf-annot-text-tool')).toBeAttached();
  const points = await linePoints(firstLine(page));
  await drag(page, points.left, points.y, points.end);
  const annotations = await page.evaluate(() => (window as any).createdAnnotations);
  expect(annotations).toHaveLength(1);
  expect(annotations[0].annotation_type).toBe("highlight");
  expect(annotations[0].page_index).toBe(0);
  expect(annotations[0].quad_points.length).toBeGreaterThan(0);
  expect(annotations[0].rect.right).toBeGreaterThan(annotations[0].rect.left);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
});
