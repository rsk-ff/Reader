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

for (const fromMargin of [false, true]) {
  test(`selects the whole last line when dragging below it from ${fromMargin ? "a margin" : "text"}`, async ({ page }) => {
    const lines = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]')
      .filter({ hasText: /\S.{10}/ });
    await expect(lines).toHaveCount(3);
    const offset = fromMargin ? 0 : 2;
    const start = await linePoints(lines.nth(0), offset);
    const second = await linePoints(lines.nth(1));
    const last = await linePoints(lines.nth(2));
    const texts = await lines.allTextContents();
    await page.mouse.move(fromMargin ? start.left : start.start, start.y);
    await page.mouse.down();
    await page.mouse.move(start.end, start.y, { steps: 8 });
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(start.text);
    await page.mouse.move(second.end, second.y, { steps: 8 });
    expect(await page.evaluate(() => window.getSelection()?.toString()))
      .toBe(`${texts[0].slice(offset)}\n${second.text}`);
    const bottom = (await lines.nth(2).boundingBox())!;
    await page.mouse.move(last.end, bottom.y + bottom.height + 18, { steps: 8 });
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe(`${texts[0].slice(offset)}\n${texts[1]}\n${texts[2]}`);
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString()))
      .toBe(`${texts[0].slice(offset)}\n${texts[1]}\n${texts[2]}`);
  });
}

test("returns to an exact text endpoint after completing a line in whitespace", async ({ page }) => {
  await page.getByRole("searchbox", { name: "search", exact: true }).fill("Page");
  await page.getByRole("searchbox", { name: "search", exact: true }).press("Enter");
  await expect(page.locator('.page[data-page-number="1"] .textLayer .highlight')).toBeAttached();
  await firstLine(page).scrollIntoViewIfNeeded();
  const lines = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]')
    .filter({ hasText: /\S.{10}/ });
  const start = await linePoints(lines.nth(0), 2);
  const last = await linePoints(lines.nth(2));
  const texts = await lines.allTextContents();
  const bottom = (await lines.nth(2).boundingBox())!;
  await page.mouse.move(start.start, start.y);
  await page.mouse.down();
  await page.mouse.move(last.end, last.y, { steps: 12 });
  const partial = `${texts[0].slice(2)}\n${texts[1]}\n${last.text}`;
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(partial);
  // This vertical move need not change the native character caret.
  await page.mouse.move(last.end, bottom.y + bottom.height + 18, { steps: 8 });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(`${texts[0].slice(2)}\n${texts[1]}\n${texts[2]}`);
  await page.mouse.move(last.end, last.y, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(partial);
  // Further pointer motion after release must leave that selection untouched.
  await page.mouse.move(last.end, bottom.y + bottom.height + 18);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(partial);
});

test("completes the first line when selecting backwards above it", async ({ page }) => {
  const lines = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]')
    .filter({ hasText: /\S.{10}/ });
  const first = await linePoints(lines.nth(0));
  const last = await linePoints(lines.nth(2));
  const top = (await lines.nth(0).boundingBox())!;
  const texts = await lines.allTextContents();
  await drag(page, last.end, last.y, first.end, top.y - 18);
  expect(await page.evaluate(() => window.getSelection()?.toString()))
    .toBe(`${texts[0]}\n${texts[1]}\n${last.text}`);
  expect(await page.evaluate(() => window.getSelection()?.focusOffset)).toBe(0);
});

test("completes a line when dragging past its right margin", async ({ page }) => {
  const line = firstLine(page);
  const points = await linePoints(line, 2);
  await drag(page, points.start, points.y, points.right);
  expect(await page.evaluate(() => window.getSelection()?.toString()))
    .toBe((await line.textContent())!.slice(2));
});

test("includes the completed last line in a highlight annotation", async ({ page }) => {
  await page.getByTitle("Highlight (select text)", { exact: true }).click();
  await expect(page.locator('.page[data-page-number="1"] .pdf-annot-text-tool')).toBeAttached();
  const lines = page.locator('.page[data-page-number="1"] .textLayer span[role="presentation"]')
    .filter({ hasText: /\S.{10}/ });
  const first = await linePoints(lines.nth(0), 2);
  const last = await linePoints(lines.nth(2));
  const bottom = (await lines.nth(2).boundingBox())!;
  // Record the actual range geometry before the markup tool consumes it.
  const expectedWidth = await lines.nth(2).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().width;
  });
  await page.mouse.move(first.start, first.y);
  await page.mouse.down();
  await page.mouse.move(last.end, bottom.y + bottom.height + 18, { steps: 12 });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain((await lines.nth(2).textContent())!);
  const geometry = await page.evaluate(() => {
    const range = window.getSelection()!.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    return { firstWidth: rects[0].width, lastWidth: rects.at(-1)!.width };
  });
  expect(geometry.lastWidth).toBeCloseTo(expectedWidth, 0);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).createdAnnotations.length)).toBe(1);
  const quads = await page.evaluate(() => (window as any).createdAnnotations[0].quad_points);
  expect(quads.length).toBeGreaterThanOrEqual(3);
  // DOM ranges can report both an element and its text rectangle for a full
  // intermediate line. Compare the end-line geometry rather than line count.
  const lastQuad = quads.at(-1);
  expect(Math.abs(lastQuad.x2 - lastQuad.x1) / Math.abs(quads[0].x2 - quads[0].x1))
    .toBeCloseTo(geometry.lastWidth / geometry.firstWidth, 2);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
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

test("keeps the painted selection through continuous Ctrl wheel zoom", async ({ page }) => {
  const points = await linePoints(firstLine(page));
  await drag(page, points.left, points.y, points.end);
  const paintedSelection = page.locator('.page[data-page-number="1"] .canvasWrapper .selection');
  await expect(paintedSelection).toBeVisible();
  await page.mouse.move(points.end, points.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
  await expect(firstLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
  await expect(paintedSelection).toBeVisible();
  const geometry = await paintedSelection.evaluate(element => {
    const path = element.querySelector("path")!;
    const box = (path as SVGGraphicsElement).getBBox();
    const selection = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    const page = element.getBoundingClientRect();
    return {
      painted: { x: page.x + box.x * page.width, y: page.y + box.y * page.height,
        width: box.width * page.width, height: box.height * page.height },
      selected: { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
    };
  });
  const overlapWidth = Math.max(0, Math.min(geometry.painted.x + geometry.painted.width,
    geometry.selected.x + geometry.selected.width) - Math.max(geometry.painted.x, geometry.selected.x));
  const overlapHeight = Math.max(0, Math.min(geometry.painted.y + geometry.painted.height,
    geometry.selected.y + geometry.selected.height) - Math.max(geometry.painted.y, geometry.selected.y));
  // PDF.js rounds the page/canvas and text bounds separately. Check that the
  // painted area covers the selection without imposing identical rounding.
  expect(overlapWidth * overlapHeight / (geometry.selected.width * geometry.selected.height)).toBeGreaterThan(0.95);
  await page.keyboard.up("Control");
});

test("keeps a full-line selection through continuous Ctrl wheel zoom out", async ({ page }) => {
  const line = firstLine(page);
  const points = await linePoints(line, 0, (await line.textContent())!.length);
  await drag(page, points.left, points.y, points.end - 1);
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toContain(points.text);
  await page.mouse.move(points.end, points.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 120);
  await expect(firstLine(page)).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selected);
  await expect(page.locator('.page[data-page-number="1"] .canvasWrapper .selection')).toBeVisible();
  await page.keyboard.up("Control");
});

for (const withSearch of [false, true]) {
  test(`keeps selected text and copy available during delayed Ctrl wheel repaint${withSearch ? " with search" : ""}`, async ({ page }) => {
    if (withSearch) {
      await page.getByRole("searchbox", { name: "search", exact: true }).fill("Reader");
      await page.getByRole("searchbox", { name: "search", exact: true }).press("Enter");
      await expect(page.locator('.page[data-page-number="1"] .textLayer .highlight')).toBeAttached();
    }
    const points = await linePoints(firstLine(page));
    await drag(page, points.left, points.y, points.end);
    await page.mouse.move(points.end, points.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -60);
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
      await expect(firstLine(page)).toBeVisible();
      // Exercise PDF.js's copy handler with an isolated event clipboard, leaving
      // the user's Windows clipboard untouched.
      const copied = await firstLine(page).evaluate(element => {
        const clipboardData = new DataTransfer();
        element.dispatchEvent(new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }));
        return clipboardData.getData("text/plain");
      });
      expect(copied).toBe(points.text);
    }
    // The delayed canvas refresh must also leave the selected text available.
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(points.text);
    await page.keyboard.up("Control");
  });
}

test("keeps all selected pages readable during wheel repaint", async ({ page }) => {
  await page.getByTitle("Fit page", { exact: true }).click();
  await page.locator('.page[data-page-number="3"]').scrollIntoViewIfNeeded();
  await expect(firstLine(page, 3)).toBeVisible();
  await firstLine(page).scrollIntoViewIfNeeded();
  const selected = await page.evaluate(() => {
    const line = (number: number) => Array.from(document.querySelectorAll(
      `.page[data-page-number="${number}"] .textLayer span[role="presentation"]`))
      .find(element => /\S.{10}/.test(element.textContent!))!.firstChild!;
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(line(1), 0, line(3), 8);
    return selection.toString();
  });
  expect(selected).toContain("Hello, Reader.");
  const points = await linePoints(firstLine(page));
  await page.mouse.move(points.end, points.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -60);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selected);
    for (let number = 1; number <= 3; number++) await expect(firstLine(page, number)).toBeVisible();
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selected);
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
  const canvas = page.locator('.page[data-page-number="1"] .canvasWrapper canvas');
  const previousWidth = await canvas.evaluate(element => (element as HTMLCanvasElement).width);
  await page.keyboard.press("Control+=");
  const zoomed = await linePoints(firstLine(page), 2, 10);
  await page.mouse.click(zoomed.left, zoomed.y);
  await expect.poll(() => canvas.last().evaluate(element => (element as HTMLCanvasElement).width))
    .not.toBe(previousWidth);
  await expect(canvas).toHaveCount(1);
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
