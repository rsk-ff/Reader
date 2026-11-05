import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".ProseMirror")).toBeVisible();
});

test("rendered view highlights every match and moves through them", async ({ page }) => {
  await page.keyboard.press("Control+f");
  const input = page.getByRole("searchbox", { name: "search", exact: true });
  await expect(input).toBeFocused();
  await input.fill("中文内容");
  await expect(page.locator(".md-search-group .pdf-search-count")).toHaveText("1/40");
  const sizes = () => page.evaluate(() => [CSS.highlights.get("md-search")?.size, CSS.highlights.get("md-search-current")?.size]);
  await expect.poll(sizes).toEqual([39, 1]);
  await input.press("Enter");
  await expect(page.locator(".md-search-group .pdf-search-count")).toHaveText("2/40");
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(page.locator(".md-search-group .pdf-search-count")).toHaveText("40/40");

  await input.fill("paragraph 40:");
  await expect(page.locator(".md-search-group .pdf-search-count")).toHaveText("1/1");
  await expect.poll(() => page.locator(".md-content").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await expect.poll(sizes).toEqual([undefined, undefined]);
});

test("source view paints matches behind the textarea", async ({ page }) => {
  await page.getByRole("button", { name: "源码视图", exact: true }).click();
  const input = page.getByRole("searchbox", { name: "search", exact: true });
  await input.fill("select these");
  await expect(page.locator(".md-source-backdrop .md-hit")).toHaveCount(40);
  await expect(page.locator(".md-source-backdrop .md-hit-current")).toHaveCount(1);
  await page.keyboard.press("F3");
  await expect(page.locator(".md-search-group .pdf-search-count")).toHaveText("2/40");
  // The backdrop mirrors the textarea's text exactly, so marks line up.
  const same = await page.evaluate(() => {
    const backdrop = document.querySelector(".md-source-backdrop")!;
    const source = document.querySelector<HTMLTextAreaElement>(".md-source")!;
    return backdrop.textContent === `${source.value}\n`;
  });
  expect(same).toBe(true);
});

test("toolbar never scrolls: tools that do not fit move into the more menu", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const row = page.locator(".md-toolbar-row");
  const fits = () => row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  const more = page.getByRole("button", { name: "更多工具", exact: true });
  expect(await fits()).toBe(true);
  await expect(more).toHaveCount(0);
  await expect(page.locator(".md-format-group button")).toHaveCount(15);

  await page.setViewportSize({ width: 700, height: 760 });
  await expect(more).toBeVisible();
  expect(await fits()).toBe(true);
  expect(await row.evaluate((element) => getComputedStyle(element).overflowX)).toBe("hidden");
  await more.click();
  const panel = page.getByRole("group", { name: "更多工具", exact: true });
  await expect(panel.getByRole("button", { name: "插入表格", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await page.setViewportSize({ width: 1100, height: 760 });
  await expect(more).toHaveCount(0);
});
