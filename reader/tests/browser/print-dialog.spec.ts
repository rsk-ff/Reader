import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __readerInvocations: Array<{ command: string; args: Record<string, unknown> }>;
    __printClosed?: boolean;
  }
}

async function invocations(page: Page, command: string) {
  return page.evaluate((name) => window.__readerInvocations.filter((call) => call.command === name), command);
}

test("prints the chosen pages several to a sheet with the dialog's settings", async ({ page }) => {
  await page.goto("/tests/browser/print-dialog.html?pdf=text-3.pdf");
  const dialog = page.getByRole("dialog", { name: "打印" });
  await expect(dialog.getByText("第 1 张 / 共 3 张")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /打印机.*HP LaserJet M227/ })).toBeVisible();

  await dialog.getByRole("radio", { name: "自定义" }).click();
  await expect(dialog.locator("#print-range")).toBeFocused();
  await page.keyboard.type("2-3");
  await dialog.getByRole("button", { name: /每张页数/ }).click();
  await page.getByRole("option", { name: "2 页" }).click();
  await dialog.getByRole("button", { name: /颜色/ }).click();
  await page.getByRole("option", { name: "黑白" }).click();
  await dialog.getByLabel("份数").fill("2");
  await expect(dialog.getByText("共 2 张纸")).toBeVisible();
  await expect(dialog.getByText("A4 · 横向")).toBeVisible();

  await dialog.getByRole("button", { name: "打印", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__printClosed)).toBe(true);
  const [submit] = await invocations(page, "print_submit");
  const job = submit.args.job as {
    printer: string;
    settings: { landscape: boolean; color: boolean; copies: number; paperId: number };
    sheets: Array<Array<{ page: number; x: number; width: number }>>;
  };
  expect(job.printer).toBe("HP LaserJet M227");
  expect(job.settings).toMatchObject({ landscape: true, color: false, copies: 2, paperId: 9 });
  expect(job.sheets.map((sheet) => sheet.map((placement) => placement.page))).toEqual([[1, 2]]);
  expect(job.sheets[0][0].x + job.sheets[0][0].width).toBeLessThan(job.sheets[0][1].x);
});

test("rejects a bad page range and Esc closes without printing", async ({ page }) => {
  await page.goto("/tests/browser/print-dialog.html?pdf=text-3.pdf");
  const dialog = page.getByRole("dialog", { name: "打印" });
  await expect(dialog.getByText("第 1 张 / 共 3 张")).toBeVisible();
  await dialog.getByRole("radio", { name: "自定义" }).click();
  await expect(dialog.locator("#print-range")).toBeFocused();
  await page.keyboard.type("9");
  await expect(dialog.getByText("页码超出范围，共 3 页")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "打印", exact: true })).toBeDisabled();

  // Esc first closes an open list, then the dialog.
  await dialog.getByRole("button", { name: /^纸张/ }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__printClosed)).toBe(true);
  expect(await invocations(page, "print_submit")).toHaveLength(0);
});

test("lays Markdown out again when paper, orientation or margins change", async ({ page }) => {
  await page.goto("/tests/browser/print-dialog.html?kind=markdown");
  const dialog = page.getByRole("dialog", { name: "打印" });
  await expect(dialog.getByText("第 1 张 / 共 3 张")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /当前页/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /缩放/ })).toHaveCount(0);

  await dialog.getByRole("button", { name: /页边距/ }).click();
  await page.getByRole("option", { name: "窄" }).click();
  await dialog.getByRole("button", { name: /方向/ }).click();
  await page.getByRole("option", { name: "横向" }).click();
  await expect.poll(async () => (await invocations(page, "print_markdown_pdf")).at(-1)?.args.page)
    .toEqual({ widthMm: 297, heightMm: 210, marginMm: 10 });
});
