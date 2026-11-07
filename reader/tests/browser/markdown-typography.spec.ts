import { expect, test } from "@playwright/test";

// Body text is 16px serif. Monospace (code blocks, source view) draws at
// 0.9x and KaTeX at 1.1x so their x-heights read the same as the body.
test("code, formulas and the source view are sized to the body text", async ({ page }) => {
  await page.goto("/tests/browser/markdown-editor.html?blocks");
  await expect(page.locator(".milkdown-code-block .cm-content").first()).toBeVisible();
  const size = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).fontSize);
  expect(await size(".ProseMirror > p")).toBe("16px");
  expect(await size(".milkdown-code-block .cm-content")).toBe("14.4px");
  await expect(page.locator(".katex").first()).toBeAttached();
  expect(await size(".katex")).toBe("17.6px");
  await page.getByRole("button", { name: "源码视图", exact: true }).click();
  expect(await size(".md-source")).toBe("14.4px");
});
