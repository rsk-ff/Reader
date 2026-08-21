import { describe, expect, it } from "vitest";

import { snapPhaseClass, snapPhaseReducer } from "./snapInteraction";

describe("snapPhaseReducer", () => {
  it("enters hover on mouseenter from idle", () => {
    expect(snapPhaseReducer("idle", "mouseenter")).toBe("hover");
  });

  it("enters pressed on mousedown while hovering", () => {
    expect(snapPhaseReducer("hover", "mousedown")).toBe("pressed");
  });

  it("returns to hover on mouseup after pressing", () => {
    expect(snapPhaseReducer("pressed", "mouseup")).toBe("hover");
  });

  it("returns to idle on mouseleave", () => {
    expect(snapPhaseReducer("hover", "mouseleave")).toBe("idle");
    expect(snapPhaseReducer("pressed", "mouseleave")).toBe("idle");
  });

  it("keeps the phase on a click event so toggle handling stays separate", () => {
    expect(snapPhaseReducer("hover", "click")).toBe("hover");
    expect(snapPhaseReducer("pressed", "click")).toBe("pressed");
    expect(snapPhaseReducer("idle", "click")).toBe("idle");
  });

  it("treats mousedown without a prior mouseenter as pressed", () => {
    expect(snapPhaseReducer("idle", "mousedown")).toBe("pressed");
  });
});

describe("snapPhaseClass", () => {
  it("maps hover to the snap hover class", () => {
    expect(snapPhaseClass("hover")).toBe("winctl-snap-hover");
  });

  it("maps pressed to the snap pressed class", () => {
    expect(snapPhaseClass("pressed")).toBe("winctl-snap-pressed");
  });

  it("maps idle to no extra class", () => {
    expect(snapPhaseClass("idle")).toBe("");
  });
});
