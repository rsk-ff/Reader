import { describe, expect, it } from "vitest";

import { preventBrowserContextMenu } from "./browserGuards";

describe("preventBrowserContextMenu", () => {
  it("cancels a browser context-menu event", () => {
    const event = new Event("contextmenu", { cancelable: true });

    preventBrowserContextMenu(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
