import { expect, test } from "@playwright/test";

test("folder chooser adds a fixed location only once and cancelling file open preserves history", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await page.getByRole("button", { name: "添加固定文件夹", exact: true }).click();
  await expect(page.locator(".home-pinned-row")).toHaveCount(1);
  await page.getByRole("button", { name: "添加固定文件夹", exact: true }).click();
  await expect(page.locator(".home-pinned-row")).toHaveCount(1);
  await page.getByRole("button", { name: "打开文件", exact: true }).click();
  await expect(page.locator(".new-tab-recent-item")).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __readerReopened: string | null }).__readerReopened)).toBeNull();
});

test("this computer browses folders and opens documents with navigation and filtering", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await page.getByRole("button", { name: "此电脑", exact: true }).click();
  await page.locator(".home-drive").first().click();
  await page.locator(".home-directory-entry").filter({ hasText: "Notes" }).click();
  await expect(page.locator(".home-directory-entry")).toHaveCount(3);
  await page.getByRole("textbox", { name: "筛选当前列表" }).fill("review");
  await expect(page.locator(".home-directory-entry")).toHaveCount(1);
  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("button", { name: "上一级" }).click();
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toHaveValue("C:/");
  await page.getByRole("button", { name: "后退", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toHaveValue("C:/Notes");
  await page.getByRole("button", { name: "前进", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toHaveValue("C:/");
  await page.getByRole("button", { name: "后退", exact: true }).click();
  await page.locator(".home-directory-entry").filter({ hasText: "review.md" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __readerReopened: string | null }).__readerReopened)).toBe("C:/Notes/review.md");
});

test("fixed folders survive reload and can be unpinned while visits stay available", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  const address = page.getByRole("textbox", { name: "文件夹路径" });
  await address.fill("C:/Notes");
  await address.press("Enter");
  await page.getByRole("button", { name: "固定此文件夹", exact: true }).click();
  await page.reload();
  await expect(page.locator(".home-pinned-row")).toHaveCount(1);
  await expect(page.locator(".home-folder-section").first().locator(".home-folder-open")).toContainText("Notes");
  await page.getByRole("button", { name: "取消固定 Notes", exact: true }).click();
  await page.reload();
  await expect(page.locator(".home-pinned-row")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "最近常用文件夹", exact: true }).locator(".home-folder-open")).toContainText(["Notes"]);
});

test("invalid paths recover and delayed old results cannot replace the current folder", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  const address = page.getByRole("textbox", { name: "文件夹路径" });
  await address.fill("C:/missing");
  await address.press("Enter");
  await expect(page.getByRole("alert")).toContainText("路径不存在");
  await address.fill("C:/Slow");
  await address.press("Enter");
  await expect(page.getByRole("status")).toContainText("正在读取");
  await address.fill("D:/Work");
  await address.press("Enter");
  await expect(page.locator(".home-directory-entry").first()).toHaveAttribute("title", "D:/Work/nested");
  await page.waitForTimeout(1000);
  await expect(address).toHaveValue("D:/Work");
  await expect(page.locator(".home-directory-entry").first()).toHaveAttribute("title", "D:/Work/nested");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const visitsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("reader.folder-locations.v1")!).visits);
  expect(visitsBefore.map((visit: { path: string }) => visit.path)).toEqual(["D:/Work"]);
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.locator(".home-directory-entry")).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("reader.folder-locations.v1")!).visits)).toEqual(visitsBefore);
});

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
    const recentIcon = (await row.locator(".new-tab-recent-icon img").boundingBox())!;
    expect(recentIcon.width).toBe(32);
    expect(recentIcon.height).toBe(32);
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
  const colors: number[][] = [];
  for (const type of ["pdf", "markdown"]) {
    const sources = await page.locator(`.tab-icon-${type} img`).evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).src));
    expect(sources).toHaveLength(2); // Document tab and recent-file entry.
    expect(sources[0]).toBe(sources[1]);
    const fills = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = image.naturalWidth;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const counts = new Map<string, number>();
      let white = 0;
      let clipped = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (pixels[i + 3] !== 0 && (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2)) clipped++;
          if (pixels[i + 3] !== 255) continue;
          const rgb = Array.from(pixels.slice(i, i + 3));
          if (rgb.every((value) => value === 255)) white++;
          else {
            const key = rgb.join(",");
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
      }
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { white, clipped, color: dominant[0].split(",").map(Number), colored: dominant[1] };
    }, sources[0]);
    // Actual rendered cutouts must be opaque white, including on a dark desktop.
    expect(fills.white).toBeGreaterThan(50);
    expect(fills.colored).toBeGreaterThan(1000);
    expect(fills.clipped).toBe(0);
    expect(fills.color).toEqual(type === "pdf" ? [180, 92, 92] : [92, 131, 180]);
    colors.push(fills.color);
    const tabIcon = (await page.locator(`.tab .tab-icon-${type} img`).boundingBox())!;
    expect(tabIcon.width).toBe(24);
    expect(tabIcon.height).toBe(24);
  }
  const hsl = colors.map((rgb) => {
    const max = Math.max(...rgb) / 255;
    const min = Math.min(...rgb) / 255;
    const lightness = (max + min) / 2;
    return { lightness, saturation: (max - min) / (1 - Math.abs(2 * lightness - 1)) };
  });
  expect(hsl[0].saturation).toBeCloseTo(hsl[1].saturation, 8);
  expect(hsl[0].lightness).toBeCloseTo(hsl[1].lightness, 8);
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
