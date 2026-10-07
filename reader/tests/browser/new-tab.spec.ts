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
