import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

for (const kind of ["md", "pdf"] as const) {
  test(`${kind}: minimum, 50% collapse boundary, capture cleanup and restored width`, async ({ page }) => {
    if (kind === "pdf") {
      await page.route("http://reader-file.localhost/**", (route) => route.fulfill({
        path: path.resolve("tests/fixtures/text-3.pdf"), contentType: "application/pdf",
        headers: { "Access-Control-Allow-Origin": "*" },
      }));
      await page.goto("/tests/browser/pdf-viewer.html");
      await expect(page.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
      await page.getByRole("button", { name: "Thumbnails", exact: true }).click();
    } else {
      await page.goto("/tests/browser/markdown-editor.html");
      await expect(page.locator(".ProseMirror")).toBeVisible();
      await page.getByRole("button", { name: "Source", exact: true }).click();
      await page.locator(".md-source").fill("# Collapse draft\n\nUnsaved text.");
    }
    const shell = page.locator(kind === "md" ? ".md-outline-shell" : ".pdf-sidebar-shell");
    const separator = page.getByRole("separator", { name: kind === "md" ? "调整 Markdown 目录宽度" : "Resize PDF sidebar" });
    await separator.focus();
    await page.keyboard.press("Home");
    await expect(separator).toHaveAttribute("aria-valuenow", "168");
    await page.keyboard.press("ArrowLeft");
    await expect(separator).toHaveAttribute("aria-valuenow", "168");
    // Use a known pre-drag width, then test both sides of the exact threshold.
    for (let index = 0; index < 8; index++) await page.keyboard.press("ArrowRight");
    await expect(separator).toHaveAttribute("aria-valuenow", "296");
    const bounds = await separator.boundingBox();
    const x = bounds!.x + bounds!.width / 2;
    const y = bounds!.y + 80;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 168 - 296, y);
    await expect(shell).toHaveCSS("width", "168px");
    await page.mouse.move(x + 85 - 296, y);
    await expect(shell).toHaveCSS("width", "168px");
    await expect(page.locator("body")).toHaveClass(new RegExp(`${kind}-sidebar-resizing`));
    await page.mouse.move(x + 84 - 296, y);
    await expect(shell).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveClass(/sidebar-resizing/);
    await page.mouse.move(x + 130, y);
    await page.mouse.up();
    await expect(shell).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
    const viewport = page.locator(kind === "md" ? ".md-viewport" : ".pdf-stage");
    expect((await viewport.boundingBox())!.x).toBe(0);
    await page.getByRole("button", { name: kind === "md" ? "展开目录" : "Thumbnails", exact: true }).click();
    await expect(shell).toHaveCSS("width", "296px");
    if (kind === "md") await expect(page.locator(".md-source")).toHaveValue("# Collapse draft\n\nUnsaved text.");
    else await expect(page.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
  });
}

test("Markdown narrow-window drag collapse preserves the unclamped preferred width", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html");
  await expect(page.locator(".ProseMirror")).toBeVisible();
  const editor = await page.locator(".ProseMirror").elementHandle();
  const separator = page.getByRole("separator", { name: "调整 Markdown 目录宽度" });
  await separator.focus();
  await page.keyboard.press("End");
  await page.setViewportSize({ width: 330, height: 480 });
  await expect(separator).toHaveAttribute("aria-valuenow", "168");
  const bounds = await separator.boundingBox();
  await page.mouse.move(bounds!.x + 3, bounds!.y + 80);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 3 - 84, bounds!.y + 80);
  await page.mouse.up();
  await expect(page.locator(".md-outline-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "展开目录", exact: true }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "168");
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect(separator).toHaveAttribute("aria-valuenow", "560");
  expect(await editor!.evaluate((element) => element === document.querySelector(".ProseMirror"))).toBe(true);
});
