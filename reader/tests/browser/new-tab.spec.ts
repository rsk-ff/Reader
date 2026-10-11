import { expect, test, type Page } from "@playwright/test";

const visits = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("reader.folder-locations.v1") ?? '{"visits":[]}').visits);
async function goFolder(page: Page, path = "C:/Notes") {
  const address = page.getByRole("textbox", { name: "文件夹路径" });
  await address.fill(path);
  await address.press("Enter");
  await expect(page.locator(".home-directory-entry")).toHaveCount(3);
}
async function blankMenu(page: Page) {
  const body = page.locator(".home-body");
  const rect = (await body.boundingBox())!;
  await body.click({ button: "right", position: { x: rect.width - 4, y: rect.height - 4 } });
  await expect(page.getByRole("menu")).toBeVisible();
}

test("home has one continuous pinned folder list and only recent files in the main area", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await expect(page.locator(".home-pin")).toHaveCount(3);
  await expect(page.locator(".home-folder-links .home-nav-name")).toHaveText(["桌面", "下载", "文档"]);
  await expect(page.locator(".new-tab-hero, .home-command-bar, .home-nav-group, .home-folder-section")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "此电脑", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开文件", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建 Markdown", exact: true })).toHaveCount(0);
  await expect(page.locator(".home-sidebar h2")).toHaveCount(0);
});

test("local drive browsing keeps navigation, filtering and document opening", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await page.locator(".home-drive-links button").first().click();
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

test("folder context menu pins and unpins across reload without creating fake common folders", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await page.locator(".home-drive-links button").first().click();
  await page.locator(".home-directory-entry").filter({ hasText: "Notes" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "固定到侧栏", exact: true }).click();
  await expect(page.locator(".home-folder-links button").filter({ hasText: "Notes" }).locator(".home-pin")).toHaveCount(1);
  await page.reload();
  const pinned = page.locator(".home-folder-links button").filter({ hasText: "Notes" });
  await pinned.click({ button: "right" });
  await page.getByRole("menuitem", { name: "取消固定", exact: true }).click();
  await page.reload();
  await expect(page.locator(".home-folder-links button").filter({ hasText: "Notes" })).toHaveCount(0);
});

test("default folders are pinned and unpinning them persists", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await page.getByRole("button", { name: "桌面", exact: false }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "取消固定", exact: true }).click();
  await page.reload();
  await expect(page.locator(".home-folder-links button").filter({ hasText: "桌面" })).toHaveCount(0);
  await goFolder(page, "C:/Desktop");
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "固定到侧栏", exact: true }).click();
  await expect(page.locator(".home-folder-links button").filter({ hasText: "桌面" }).locator(".home-pin")).toHaveCount(1);
});

test("frequent folders use folder icons and can be pinned without duplicates", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html?frequent=1");
  const work = page.locator(".home-folder-links button").filter({ hasText: "Work" });
  await expect(work.locator(".home-pin")).toHaveCount(0);
  expect(await work.locator(".ui-icon path").getAttribute("d")).toBe(await page.locator(".home-folder-links button").first().locator(".ui-icon path").first().getAttribute("d"));
  await work.click({ button: "right" });
  await page.getByRole("menuitem", { name: "固定到侧栏", exact: true }).click();
  await expect(work).toHaveCount(1);
  await expect(work.locator(".home-pin")).toHaveCount(1);
});

test("blank-space context creates Markdown in the current folder and cancel writes nothing", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await goFolder(page);
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "新建 Markdown", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { __readerCreated: unknown[] }).__readerCreated)).toEqual([]);
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "新建 Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "文件名", exact: true }).fill("draft");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as Window & { __readerReopened: string | null }).__readerReopened)).toBe("C:/Notes/draft.md");
  expect(await page.evaluate(() => (window as Window & { __readerCreated: unknown[] }).__readerCreated)).toEqual([{ directory: "C:/Notes", fileName: "draft.md", path: "C:/Notes/draft.md" }]);
});

test("existing Markdown is protected and the creation dialog can recover", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await goFolder(page);
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "新建 Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "文件名", exact: true }).fill("review.md");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("同名文件已存在");
  expect(await page.evaluate(() => (window as Window & { __readerCreated: unknown[] }).__readerCreated)).toEqual([]);
  await page.getByRole("textbox", { name: "文件名", exact: true }).fill("other.md");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("context menu stays in the viewport and supports keyboard and dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 330, height: 480 });
  await page.goto("/tests/browser/new-tab.html");
  await goFolder(page);
  await blankMenu(page);
  const box = (await page.getByRole("menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(480);
  expect(box.x + box.width).toBeLessThanOrEqual(330);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "固定到侧栏", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".home-body")).toBeFocused();
  const folder = page.locator(".home-directory-entry").first();
  await folder.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("textbox", { name: "文件夹路径" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("invalid paths recover and delayed results do not replace or count the current folder", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  const address = page.getByRole("textbox", { name: "文件夹路径" });
  await address.fill("C:/missing");
  await address.press("Enter");
  await expect(page.getByRole("alert")).toContainText("路径不存在");
  await address.fill("C:/Slow");
  await address.press("Enter");
  await expect(page.getByRole("status")).toContainText("正在读取");
  await goFolder(page, "D:/Work");
  await page.waitForTimeout(1000);
  await expect(address).toHaveValue("D:/Work");
  await expect(page.locator(".home-directory-entry").first()).toHaveAttribute("title", "D:/Work/nested");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await visits(page)).toEqual([]);
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.locator(".home-directory-entry")).toHaveCount(3);
  expect(await visits(page)).toEqual([]);
});

test("only foreground dwell counts, refresh cannot inflate it, and common requires repeated use", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T12:00:00Z") });
  await page.goto("/tests/browser/new-tab.html");
  await goFolder(page);
  await page.clock.fastForward(29_000);
  expect(await visits(page)).toEqual([]);
  await page.evaluate(() => (window as Window & { __readerSetActive: (active: boolean) => void }).__readerSetActive(false));
  await expect(page.locator(".content-area")).toHaveAttribute("aria-hidden", "true");
  await page.clock.fastForward(120_000);
  expect(await visits(page)).toEqual([]);
  await page.evaluate(() => (window as Window & { __readerSetActive: (active: boolean) => void }).__readerSetActive(true));
  await expect(page.locator(".content-area")).toHaveAttribute("aria-hidden", "false");
  await page.clock.fastForward(30_000);
  expect((await visits(page))[0].count).toBe(1);
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.locator(".home-directory-entry")).toHaveCount(3);
  await page.clock.fastForward(30_000);
  expect((await visits(page))[0].count).toBe(1);
  await expect(page.locator(".home-folder-links button").filter({ hasText: "Notes" })).toHaveCount(0);
  for (const count of [2, 3]) {
    await page.getByRole("button", { name: "主页", exact: true }).click();
    await page.clock.fastForward(31 * 60_000);
    await goFolder(page);
    await page.clock.fastForward(30_000);
    expect((await visits(page))[0].count).toBe(count);
  }
  await expect(page.locator(".home-folder-links button").filter({ hasText: "Notes" })).toHaveCount(1);
  await expect(page.locator(".home-folder-links button").filter({ hasText: "Notes" }).locator(".home-pin")).toHaveCount(0);
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
  expect(appSources).toHaveLength(1);

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
  expect(decoded).toEqual(Array(5).fill(true));
  expect((await page.locator(".window-titlebar").boundingBox())!.height).toBe(36);
  expect((await page.locator(".winctl").first().boundingBox())!.width).toBe(46);
});
