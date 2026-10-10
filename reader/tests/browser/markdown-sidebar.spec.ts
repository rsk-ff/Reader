import { expect, test, type Page } from "@playwright/test";

async function dragSidebar(page: Page, delta: number) {
  const handle = await page.getByRole("separator", { name: "调整 Markdown 目录宽度" }).boundingBox();
  const x = handle!.x + handle!.width / 2;
  const y = handle!.y + 80;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta, y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("body")).not.toHaveClass(/md-sidebar-resizing/);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".ProseMirror")).toBeVisible();
});

test("drag changes width without rebuilding or losing edits; collapse releases all space and restores width", async ({ page }) => {
  const editor = await page.locator(".ProseMirror").elementHandle();
  await page.locator(".ProseMirror > p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("sidebar draft ");
  const draft = await page.locator(".ProseMirror").textContent();
  await dragSidebar(page, 100);
  await expect(page.locator(".md-outline-shell")).toHaveCSS("width", "320px");
  const viewportBefore = await page.locator(".md-viewport").boundingBox();
  await page.getByRole("button", { name: "收起目录", exact: true }).click();
  await expect(page.locator(".md-outline-shell")).toHaveCount(0);
  const viewportAfter = await page.locator(".md-viewport").boundingBox();
  expect(viewportAfter!.x).toBe(0);
  expect(viewportAfter!.width - viewportBefore!.width).toBe(320);
  await expect(page.getByRole("button", { name: "展开目录", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "展开目录", exact: true }).click();
  await expect(page.locator(".md-outline-shell")).toHaveCSS("width", "320px");
  expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
  expect(await page.locator(".ProseMirror").textContent()).toBe(draft);
  await page.getByRole("button", { name: "保存 ●", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__readerInvocations
    .filter((item) => item.command === "save_file_text").at(-1)?.args?.content)).toContain("sidebar draft");
});

test("drag bounds and keyboard separator work in both modes, including collapse across mode changes", async ({ page }) => {
  const separator = page.getByRole("separator", { name: "调整 Markdown 目录宽度" });
  await dragSidebar(page, 750);
  await expect(separator).toHaveAttribute("aria-valuenow", "560");
  await dragSidebar(page, -750);
  await expect(separator).toHaveAttribute("aria-valuenow", "120");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "136");
  await page.keyboard.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "560");
  await page.keyboard.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "120");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await dragSidebar(page, 120);
  await expect(separator).toHaveAttribute("aria-valuenow", "240");
  await page.locator(".md-source").fill("# Sidebar draft\n\nUnsaved content.");
  await page.getByRole("button", { name: "收起目录", exact: true }).click();
  await page.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(page.locator(".ProseMirror")).toContainText("Unsaved content.");
  await expect(page.locator(".md-outline-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "展开目录", exact: true }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "240");
  await page.locator(".md-outline-item").click();
  await expect(page.locator(".ProseMirror > h1")).toBeInViewport();
});

test("window shrink caps sidebar, keeps controls reachable and restores preferred width on expansion", async ({ page }) => {
  await dragSidebar(page, 180);
  await expect(page.locator(".md-outline-shell")).toHaveCSS("width", "400px");
  await page.setViewportSize({ width: 330, height: 480 });
  await expect(page.locator(".md-outline-shell")).toHaveCSS("width", "122px");
  expect((await page.locator(".md-viewport").boundingBox())!.width).toBeGreaterThanOrEqual(160);
  for (const name of ["收起目录", "打印", "已保存", "Source", "Rendered"]) {
    const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(330);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(330);
  await page.getByRole("button", { name: "收起目录", exact: true }).click();
  await page.getByRole("button", { name: "展开目录", exact: true }).click();
  await expect(page.locator(".md-outline-shell")).toHaveCSS("width", "122px");
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect(page.locator(".md-outline-shell")).toHaveCSS("width", "400px");
});

test("lost pointer capture ends resizing and permits a subsequent drag", async ({ page }) => {
  const separator = page.getByRole("separator", { name: "调整 Markdown 目录宽度" });
  const bounds = await separator.boundingBox();
  await page.mouse.move(bounds!.x + 3, bounds!.y + 80);
  await page.mouse.down();
  await expect(page.locator("body")).toHaveClass(/md-sidebar-resizing/);
  await separator.evaluate((element) => (element as HTMLElement).releasePointerCapture(1));
  await page.mouse.move(bounds!.x + 50, bounds!.y + 80);
  await page.mouse.up();
  await expect(page.locator("body")).not.toHaveClass(/md-sidebar-resizing/);
  await dragSidebar(page, 40);
  await expect(separator).toHaveAttribute("aria-valuenow", "260");
});
