import { expect, test } from "@playwright/test";

for (const width of [330, 620, 1100]) {
  test(`recent files at ${width}px show compact metadata without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/tests/browser/new-tab.html");
    const row = page.locator(".new-tab-recent-item").first();
    await expect(row).toBeVisible();
    await expect(page.locator(".new-tab-list-heading")).toHaveText("文档打开时间大小");
    await expect(row.locator(".new-tab-recent-time")).toHaveText("10/7 12:35");
    await expect(row.locator(".new-tab-recent-size")).toHaveText("12.1 KB");
    await expect(page.locator(".new-tab-recent-item").last().locator(".new-tab-recent-time")).toHaveText("—");
    await expect(page.locator(".new-tab-recent-item").last().locator(".new-tab-recent-size")).toHaveText("—");
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(49);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const columns = await row.evaluate((element) => Array.from(element.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    for (let index = 1; index < columns.length; index++) expect(columns[index].left).toBeGreaterThan(columns[index - 1].right);
    expect(errors).toEqual([]);
  });
}


test("all recent files beyond eight remain reachable by scrolling", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html?many=1");
  await expect(page.locator(".new-tab-recent-item")).toHaveCount(40);
  const last = page.locator(".new-tab-recent-item").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await last.click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __readerReopened: string | null }).__readerReopened)).toBe("C:/Notes/old-38.pdf");
});

test("title bar, home and file entries decode the shared native SVG masters", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await expect(page.locator(".titlebar-icon img")).toBeVisible();
  const appSources = await page.locator(".titlebar-icon img, .new-tab-hero img").evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).src));
  expect(appSources).toHaveLength(2);
  expect(appSources[0]).toBe(appSources[1]);
  for (const type of ["pdf", "markdown"]) {
    const sources = await page.locator(`.tab-icon-${type} img`).evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).src));
    expect(sources).toHaveLength(2); // Document tab and recent-file entry.
    expect(sources[0]).toBe(sources[1]);
    const fills = await page.evaluate(async (src) => {
      const svg = new DOMParser().parseFromString(await (await fetch(src)).text(), "image/svg+xml");
      return { paper: svg.querySelector("path")?.getAttribute("fill"),
        badge: svg.querySelector("rect")?.getAttribute("fill") };
    }, sources[0]);
    expect(fills.paper).toBe("#fff");
    expect(fills.badge).toBe(type === "pdf" ? "#ad4545" : "#536b89");
  }
  const decoded = await page.locator(".titlebar-icon img, .new-tab-hero img, .tab-icon img")
    .evaluateAll(async (images) => Promise.all(images.map(async (element) => {
      const image = element as HTMLImageElement;
      try { await image.decode(); return image.naturalWidth === 128 && image.naturalHeight === 128; }
      catch { return false; }
    })));
  expect(decoded).toEqual(Array(6).fill(true));
  expect((await page.locator(".window-titlebar").boundingBox())!.height).toBe(36);
  expect((await page.locator(".winctl").first().boundingBox())!.width).toBe(46);
});
