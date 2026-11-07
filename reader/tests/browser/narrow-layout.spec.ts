import { expect, test } from "@playwright/test";
import path from "node:path";

// Narrow windows never reflow documents: toolbars stay one 44px row (extra
// tools go to the more menu), sidebars keep their minimum width beside the
// page, and nothing scrolls the window sideways.
for (const width of [330, 480, 700]) {
  for (const kind of ["pdf", "markdown"] as const) {
    test(`${kind} keeps its layout at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 600 });
      await page.route("http://reader-file.localhost/**", (route) => route.fulfill({
        path: path.resolve("tests/fixtures/text-3.pdf"), contentType: "application/pdf",
        headers: { "Access-Control-Allow-Origin": "*" },
      }));
      await page.goto(kind === "pdf" ? "/tests/browser/pdf-viewer.html" : "/tests/browser/markdown-editor.html");
      if (kind === "pdf") {
        await expect(page.locator('.page[data-page-number="1"] .textLayer')).toBeVisible();
        await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
      } else {
        await expect(page.locator(".ProseMirror")).toBeVisible();
      }
      const toolbar = (await page.locator(kind === "pdf" ? ".pdf-toolbar" : ".md-toolbar").boundingBox())!;
      expect(toolbar.height).toBe(44);
      const sidebar = (await page.locator(kind === "pdf" ? ".pdf-sidebar-shell" : ".md-outline-shell").boundingBox())!;
      expect(sidebar.width).toBeGreaterThanOrEqual(168);
      const stage = (await page.locator(kind === "pdf" ? ".pdf-stage" : ".md-viewport").boundingBox())!;
      expect(stage.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}
