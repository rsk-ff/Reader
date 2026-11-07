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

async function sideButton(page: Page, button: "back" | "forward") {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 300, y: 250,
      button, buttons: button === "back" ? 8 : 16, clickCount: 1 });
    await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 300, y: 250,
      button, buttons: 0, clickCount: 1 });
  } finally { await session.detach(); }
}

test("cloud entries adapt to uninstall, reinstall and path changes without persisting stale roots", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
  await page.goto("/tests/browser/new-tab.html");
  const cloud = page.locator(".home-cloud-links");
  await expect(cloud).toHaveCount(0);
  await page.evaluate(() => {
    (window as Window & { __readerCloud: unknown[] }).__readerCloud = [
      { id: "onedrive:Personal", provider: "onedrive", name: "OneDrive", path: "D:/OneDrive" },
      { id: "dropbox:business", provider: "dropbox", name: "Dropbox（工作）", path: "D:/Team Dropbox" },
    ];
    window.dispatchEvent(new Event("focus"));
  });
  await expect(cloud.locator("button")).toHaveCount(2);
  await expect(cloud.locator(".home-pin")).toHaveCount(0);
  await cloud.getByRole("button", { name: "Dropbox（工作）", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toHaveValue("D:/Team Dropbox");
  await page.evaluate(() => (window as Window & { __readerCloud: unknown[] }).__readerCloud.splice(1));
  await page.clock.fastForward(30_000);
  await expect(cloud.locator("button")).toHaveCount(1);
  await page.evaluate(() => (window as Window & { __readerCloud: unknown[] }).__readerCloud.push(
    { id: "dropbox:business", provider: "dropbox", name: "Dropbox（工作）", path: "C:/New Dropbox" }));
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(cloud.getByRole("button", { name: "Dropbox（工作）", exact: true })).toHaveAttribute("title", "C:/New Dropbox");
  await cloud.getByRole("button", { name: "Dropbox（工作）", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toHaveValue("C:/New Dropbox");
  expect(await page.evaluate(() => localStorage.getItem("reader.folder-locations.v1") ?? "")).not.toContain("C:/New Dropbox");
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "固定到侧栏", exact: true }).click();
  await expect(page.locator(".home-folder-links button[title='C:/New Dropbox']")).toHaveCount(0);
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "取消固定", exact: true }).click();
  await page.evaluate(() => (window as Window & { __readerSetActive: (active: boolean) => void }).__readerSetActive(false));
  await expect(page.locator(".content-area")).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => (window as Window & { __readerCloud: unknown[] }).__readerCloud = []);
  await page.clock.fastForward(60_000);
  await expect(cloud.locator("button")).toHaveCount(2);
  await page.evaluate(() => (window as Window & { __readerSetActive: (active: boolean) => void }).__readerSetActive(true));
  await expect(cloud).toHaveCount(0);
});

test("mouse side buttons navigate folder history once without leaving the application", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html?sentinel=1");
  await page.goto("/tests/browser/new-tab.html");
  const address = page.getByRole("textbox", { name: "文件夹路径" });
  await page.locator(".home-drive-links button").first().click();
  await page.locator(".home-directory-entry").filter({ hasText: "Notes" }).click();
  await sideButton(page, "back");
  await expect(address).toHaveValue("C:/");
  await sideButton(page, "back");
  await expect(address).toHaveValue("主页");
  await sideButton(page, "back");
  await expect(address).toHaveValue("主页");
  expect(page.url()).not.toContain("sentinel");
  await sideButton(page, "forward");
  await expect(address).toHaveValue("C:/");
  await sideButton(page, "forward");
  await expect(address).toHaveValue("C:/Notes");
  await sideButton(page, "forward");
  await expect(address).toHaveValue("C:/Notes");
  await sideButton(page, "back");
  await goFolder(page, "D:/Work");
  await expect(page.getByRole("button", { name: "前进", exact: true })).toBeDisabled();
  await sideButton(page, "forward");
  await expect(address).toHaveValue("D:/Work");
});

test("side buttons respect inactive tabs and the new Markdown dialog", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await goFolder(page);
  const address = page.getByRole("textbox", { name: "文件夹路径", includeHidden: true });
  await page.evaluate(() => (window as Window & { __readerSetActive: (active: boolean) => void }).__readerSetActive(false));
  await expect(page.locator(".content-area")).toHaveAttribute("aria-hidden", "true");
  await page.locator(".home-body").dispatchEvent("mouseup", { button: 3, bubbles: true, cancelable: true });
  await expect(address).toHaveValue("C:/Notes");
  await page.evaluate(() => (window as Window & { __readerSetActive: (active: boolean) => void }).__readerSetActive(true));
  await expect(page.locator(".content-area")).toHaveAttribute("aria-hidden", "false");
  await blankMenu(page);
  await page.getByRole("menuitem", { name: "新建 Markdown", exact: true }).click();
  await sideButton(page, "back");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(address).toHaveValue("C:/Notes");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await sideButton(page, "back");
  await expect(address).toHaveValue("主页");
});

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
  // Empty space in the breadcrumb bar switches it to typing.
  const crumbs = (await page.locator(".home-crumbs").boundingBox())!;
  await page.mouse.click(crumbs.x + crumbs.width - 4, crumbs.y + crumbs.height / 2);
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("address bar shows clickable folder segments like File Explorer", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  await goFolder(page, "C:/Notes");
  const crumbs = page.locator(".home-crumb button");
  await expect(crumbs).toHaveText(["此电脑", "C:", "Notes"]);
  await expect(crumbs.last()).toHaveAttribute("aria-current", "location");
  await crumbs.nth(1).click();
  await expect(page.getByRole("textbox", { name: "文件夹路径" })).toHaveValue("C:/");
  await page.locator(".home-crumb button").first().click();
  await expect(page.locator(".home-drive")).not.toHaveCount(0);
  // A path too long for the bar collapses its leading segments into "…".
  await page.setViewportSize({ width: 520, height: 600 });
  await goFolder(page, "D:/Work");
  const address = page.getByRole("textbox", { name: "文件夹路径" });
  await address.fill("C:/Notes/a very long folder name for the address bar/another long nested folder/deep");
  await address.press("Enter");
  const more = page.getByRole("button", { name: "更多上级文件夹", exact: true });
  await expect(more).toBeVisible();
  const bar = page.locator(".home-crumbs");
  expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(page.locator(".home-crumb button").last()).toHaveText("deep");
  await more.click();
  await expect(page.getByRole("menuitem", { name: "此电脑", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1100, height: 760 });
  await goFolder(page, "C:/Notes");
  await expect(more).toHaveCount(0);
  // The navigation row spans the page above the sidebar, joining the active tab.
  const nav = (await page.locator(".home-navigation").boundingBox())!;
  const sidebar = (await page.locator(".home-sidebar").boundingBox())!;
  expect(nav.x).toBe(sidebar.x);
  expect(sidebar.y).toBeGreaterThanOrEqual(nav.y + nav.height - 1);
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
    await expect(page.locator(".new-tab-list-heading")).toHaveText("名称打开时间类型大小");
    await expect(row.locator(".new-tab-recent-time")).toHaveText(/^\d{4}\/10\/7 12:35$/);
    await expect(row.locator(".new-tab-recent-size")).toHaveText("12.1 KB");
    await expect(page.locator(".new-tab-recent-item").last().locator(".new-tab-recent-time")).toHaveText("—");
    await expect(page.locator(".new-tab-recent-item").last().locator(".new-tab-recent-size")).toHaveText("—");
    expect((await row.boundingBox())!.height).toBe(30);
    // One line per file: icon then name, no secondary line.
    await expect(row.locator(".new-tab-recent-copy small")).toHaveCount(0);
    const recentIcon = (await row.locator(".new-tab-recent-icon svg").boundingBox())!;
    expect(recentIcon.width).toBe(16);
    expect(recentIcon.height).toBe(16);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const columns = await row.evaluate((element) => Array.from(element.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    for (let index = 1; index < columns.length; index++) expect(columns[index].left).toBeGreaterThanOrEqual(columns[index - 1].right - 0.5);
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

test("tabs and file entries draw Lucide file glyphs in the file type colour", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  // The title bar carries no application icon; tabs start at the left edge.
  await expect(page.locator(".titlebar-icon, .new-tab-hero img")).toHaveCount(0);
  const firstTab = (await page.locator(".tab").first().boundingBox())!;
  expect(firstTab.x).toBeLessThanOrEqual(8);
  await expect(page.locator(".tab-icon img")).toHaveCount(0);
  for (const [type, band] of [["pdf", "rgb(196, 71, 60)"], ["markdown", "rgb(85, 85, 79)"]] as const) {
    const glyphs = page.locator(`.tab-icon-${type} svg`);
    expect(await glyphs.count()).toBeGreaterThanOrEqual(2); // Document tab and recent-file entry.
    const style = await glyphs.first().evaluate((svg) => ({
      stroke: svg.getAttribute("stroke-width"),
      band: getComputedStyle(svg.querySelector(".file-band")!).fill,
    }));
    expect(style).toEqual({ stroke: "1.6", band });
    const tabIcon = (await page.locator(`.tab .tab-icon-${type} svg`).boundingBox())!;
    expect(tabIcon.width).toBe(16);
  }
  expect((await page.locator(".window-titlebar").boundingBox())!.height).toBe(38);
  expect((await page.locator(".winctl").first().boundingBox())!.width).toBe(46);
});

test("title bar keeps a full-height drag region and tabs reach the top edge", async ({ page }) => {
  await page.goto("/tests/browser/new-tab.html");
  const bar = (await page.locator(".window-titlebar").boundingBox())!;
  const spacer = (await page.locator(".tabstrip-spacer").boundingBox())!;
  expect(spacer.height).toBe(bar.height);
  expect(spacer.width).toBeGreaterThan(40);

  // The topmost pixel row above a tab or the add button still hits it.
  for (const selector of [".tab", ".tab-add"]) {
    const box = (await page.locator(selector).first().boundingBox())!;
    expect(box.y).toBeGreaterThan(bar.y);
    const hit = await page.evaluate(([x, y, sel]) => {
      const element = document.elementFromPoint(x as number, y as number);
      return element?.closest(sel as string) !== null;
    }, [box.x + box.width / 2, bar.y, selector]);
    expect(hit, selector).toBe(true);
  }
});

test("narrow windows keep the layout, and the sidebar and columns can be dragged wider", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto("/tests/browser/new-tab.html");
  // No icon rail and no wrapped navigation row in a narrow window.
  await expect(page.locator(".home-nav-name").first()).toBeVisible();
  const nav = (await page.locator(".home-navigation").boundingBox())!;
  expect(nav.height).toBeLessThan(60);
  await page.setViewportSize({ width: 1100, height: 760 });

  const sidebar = page.locator(".home-sidebar");
  const before = (await sidebar.boundingBox())!.width;
  const handle = (await page.getByRole("separator", { name: "调整侧栏宽度" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + 100);
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeCloseTo(before + 60, 0);
  // Dragging far left stops at the minimum instead of collapsing.
  await page.getByRole("separator", { name: "调整侧栏宽度" }).focus();
  await page.keyboard.press("Home");
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBe(168);

  const name = page.locator(".new-tab-list-heading > span").nth(1);
  const nameBefore = (await name.boundingBox())!.width;
  const column = (await page.getByRole("separator", { name: "调整“名称”列宽" }).boundingBox())!;
  await page.mouse.move(column.x + column.width / 2, column.y + column.height / 2);
  await page.mouse.down();
  await page.mouse.move(column.x + column.width / 2 + 80, column.y + column.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await name.boundingBox())!.width).toBeCloseTo(nameBefore + 80, 0);
  // Widths are remembered.
  await page.reload();
  await expect.poll(async () => (await page.locator(".new-tab-list-heading > span").nth(1).boundingBox())!.width)
    .toBeCloseTo(nameBefore + 80, 0);
});
