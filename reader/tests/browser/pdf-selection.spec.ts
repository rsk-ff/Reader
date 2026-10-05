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
  return page.locator(`.page[data-page-number="${pageNumber}"] .textLayer span[role="presentation"]`)
    .filter({ hasText: /\S.{10}/ }).first();
}

async function linePoints(line: Locator, start = 0, end = 8) {
  await expect(line).toBeVisible();
  return line.evaluate((element, offsets) => {
    const boundary = (offset: number) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent!.length;
        if (offset <= length) return { node, offset };
        offset -= length;
      }
      throw new Error("Text offset outside the PDF line");
    };
    const start = boundary(offsets.start);
    const end = boundary(offsets.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
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

for (const zoom of ["button", "keyboard", "wheel", "fit"] as const) {
  test(`keeps an existing selection through ${zoom} zoom`, async ({ page }) => {
    const points = await linePoints(firstLine(page));
    await drag(page, points.left, points.y, points.end);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
    const scaleBefore = await page.locator(".pdf-zoom-pct").textContent();
    if (zoom === "button") {
      await page.getByTitle("Zoom in", { exact: true }).click();
    } else if (zoom === "keyboard") {
      await page.keyboard.press("Control+=");
    } else if (zoom === "wheel") {
      await page.mouse.move(points.end, points.y);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120);
      await page.keyboard.up("Control");
    } else {
      await page.getByTitle("Fit page", { exact: true }).click();
    }
    await expect(page.locator(".pdf-zoom-pct")).not.toHaveText(scaleBefore!);
    await expect(firstLine(page)).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
  });
}

test("keeps a backwards selection through repeated zoom and fit changes", async ({ page }) => {
  const line = firstLine(page);
  const points = await linePoints(line, 4, (await line.textContent())!.length);
  await drag(page, points.right, points.y, points.start);
  const selectedWidth = await page.evaluate(() => window.getSelection()!.getRangeAt(0).getBoundingClientRect().width);
  const lineWidth = (await line.boundingBox())!.width;
  for (const title of ["Zoom in", "Zoom out", "Fit page", "Fit width", "Fit width"]) {
    await page.getByTitle(title, { exact: true }).click();
    await expect(firstLine(page)).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
    const selection = await page.evaluate(() => {
      const value = window.getSelection()!;
      return { width: value.getRangeAt(0).getBoundingClientRect().width,
        anchor: value.anchorOffset, focus: value.focusOffset };
    });
    expect(selection.anchor).toBeGreaterThan(selection.focus);
    expect(selection.width / selectedWidth).toBeCloseTo((await line.boundingBox())!.width / lineWidth, 1);
  }
});

test("zoom does not resurrect a cancelled selection and page navigation still clears it", async ({ page }) => {
  const points = await linePoints(firstLine(page));
  await drag(page, points.left, points.y, points.end);
  await page.mouse.click(points.left, points.y);
  await page.getByTitle("Zoom in", { exact: true }).click();
  await expect(firstLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  const selected = await linePoints(firstLine(page));
  await drag(page, selected.left, selected.y, selected.end);
  await page.getByRole("spinbutton", { name: "page", exact: true }).fill("2");
  await page.getByRole("spinbutton", { name: "page", exact: true }).press("Enter");
  await expect(firstLine(page, 2)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
});

test("keeps a selection overlapping search highlights after zoom", async ({ page }) => {
  await page.getByRole("searchbox", { name: "search", exact: true }).fill("Reader");
  await page.getByRole("searchbox", { name: "search", exact: true }).press("Enter");
  await expect(page.locator('.page[data-page-number="1"] .textLayer .highlight')).toBeAttached();
  const points = await linePoints(firstLine(page), 2, 10);
  await drag(page, points.start, points.y, points.end);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
  await page.getByTitle("Zoom in", { exact: true }).click();
  await expect(firstLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
});

test("keeps a cross-line selection after zooming in and out", async ({ page }) => {
  const lines = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]')
    .filter({ hasText: /\S.{10}/ });
  const start = await linePoints(lines.nth(0));
  const end = await linePoints(lines.nth(1));
  const expected = `${await lines.nth(0).textContent()}\n${end.text}`;
  await drag(page, start.left, start.y, end.end, end.y);
  for (const title of ["Zoom in", "Zoom out"]) {
    await page.getByTitle(title, { exact: true }).click();
    await expect(lines.nth(1)).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(expected);
  }
});

test("cancelling during zoom repaint does not restore the previous search selection", async ({ page }) => {
  await page.getByRole("searchbox", { name: "search", exact: true }).fill("Reader");
  await page.getByRole("searchbox", { name: "search", exact: true }).press("Enter");
  await expect(page.locator('.page[data-page-number="1"] .textLayer .highlight')).toBeAttached();
  const points = await linePoints(firstLine(page), 2, 10);
  await drag(page, points.start, points.y, points.end);
  await page.keyboard.press("Control+=");
  await expect(page.locator('.page[data-page-number="1"] .textLayer')).toBeHidden();
  await page.mouse.click(points.left, points.y);
  await expect(firstLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
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
