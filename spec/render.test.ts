import { describe, expect, it } from "vitest";
import { render } from "../game/render.ts";
import {
  createInitialState,
  LEVEL2_COLLAPSE_TILE,
  LEVEL2_STEP_2,
  COLLAPSE_DELAY,
  DOOR_OPEN_DURATION,
  MOVING_STEP_SHIFT_DISTANCE,
} from "../game/engine.ts";
import type { GameState } from "../game/engine.ts";

// A hand-rolled recorder standing in for CanvasRenderingContext2D — no real
// canvas or browser needed. Records only the calls these three assertions
// care about; everything else is a harmless no-op so render() runs to
// completion untouched.
class FakeContext {
  fillRectCalls: { fillStyle: unknown; x: number; y: number; w: number; h: number }[] = [];
  fillTextCalls: { text: string }[] = [];
  arcCalls: { radius: number }[] = [];
  fillStyle: unknown = "";
  strokeStyle: unknown = "";
  lineWidth = 1;
  globalAlpha = 1;
  font = "";
  textAlign = "";
  textBaseline = "";

  clearRect(): void {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fillRectCalls.push({ fillStyle: this.fillStyle, x, y, w, h });
  }
  fillText(text: string): void {
    this.fillTextCalls.push({ text });
  }
  strokeRect(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arcTo(): void {}
  stroke(): void {}
  fill(): void {}
  arc(_x: number, _y: number, radius: number): void {
    this.arcCalls.push({ radius });
  }
}

function renderTo(state: GameState) {
  const ctx = new FakeContext();
  render(ctx as unknown as CanvasRenderingContext2D, state, 0);
  return ctx;
}

// The exact fillRect calls that draw the collapse tile's body + top strip —
// filtered by its fixed rect footprint, not by trap state.
function collapseTileDraws(ctx: FakeContext) {
  return ctx.fillRectCalls.filter(
    (call) => call.x === LEVEL2_COLLAPSE_TILE.x && call.w === LEVEL2_COLLAPSE_TILE.w,
  );
}

describe("requirement 1: the collapsing tile never telegraphs itself", () => {
  it("draws the collapse tile identically whether armed or not", () => {
    const untriggered = createInitialState(2);
    const armed: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, collapse: { triggered: true, timer: 0 } },
    };

    const drawsA = collapseTileDraws(renderTo(untriggered));
    const drawsB = collapseTileDraws(renderTo(armed));

    expect(drawsA.length).toBeGreaterThan(0);
    expect(drawsA).toEqual(drawsB);
  });

  it("draws nothing at all for the collapse tile once it's actually gone", () => {
    const gone: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, collapse: { triggered: true, timer: COLLAPSE_DELAY } },
    };

    expect(collapseTileDraws(renderTo(gone))).toEqual([]);
  });

  it("draws the collapse tile's body filling the same vertical extent as neighbouring ground, not a shallow strip", () => {
    // Before the fix the body drew at the raw h:20 hazard rect's height,
    // leaving a visible pit-shaped seam against the h:400 ground either side.
    const draws = collapseTileDraws(renderTo(createInitialState(2)));
    expect(draws.some((call) => call.h === 400)).toBe(true);
    expect(draws.some((call) => call.h === LEVEL2_COLLAPSE_TILE.h)).toBe(false);
  });
});

describe("requirement 2: the moving-step trap only moves once activated", () => {
  it("draws the step at its normal resting spot before the trap is triggered", () => {
    const draws = renderTo(createInitialState(2)).fillRectCalls.filter(
      (call) => call.w === LEVEL2_STEP_2.w && call.h === LEVEL2_STEP_2.h,
    );
    expect(draws.some((call) => call.x === LEVEL2_STEP_2.x)).toBe(true);
  });

  it("draws the step visibly displaced right after it's triggered", () => {
    const state: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, movingStep: { triggered: true, timer: 0 } },
    };
    const draws = renderTo(state).fillRectCalls.filter(
      (call) => call.w === LEVEL2_STEP_2.w && call.h === LEVEL2_STEP_2.h,
    );
    expect(draws.some((call) => call.x === LEVEL2_STEP_2.x + MOVING_STEP_SHIFT_DISTANCE)).toBe(true);
    expect(draws.some((call) => call.x === LEVEL2_STEP_2.x)).toBe(false);
  });
});

describe("requirement 5: the level-name banner", () => {
  it("shows exactly the bare level name while a banner is active", () => {
    const level1 = { ...createInitialState(1), banner: { timer: 0 } };
    const level2 = { ...createInitialState(2), banner: { timer: 0 } };

    expect(renderTo(level1).fillTextCalls).toEqual([{ text: "Level 1" }]);
    expect(renderTo(level2).fillTextCalls).toEqual([{ text: "Level 2" }]);
  });

  it("draws no banner text once the banner has cleared", () => {
    const state = { ...createInitialState(1), banner: null };
    expect(renderTo(state).fillTextCalls).toEqual([]);
  });
});

describe("requirements 3 & 4: death and door-entry replace the normal player draw", () => {
  // The normal player draw is the only path that draws the eye (a fixed-radius
  // arc); shatter and entering draw the body only. Its absence during
  // "dead"/"entering" is what proves those paths took over.
  const EYE_RADIUS = 2.6;

  it("draws the normal player (with its eye) while playing", () => {
    const state = createInitialState(1);
    const arcs = renderTo(state).arcCalls;
    expect(arcs.some((a) => a.radius === EYE_RADIUS)).toBe(true);
  });

  it("does not draw the normal player during the death animation", () => {
    const state: GameState = { ...createInitialState(2), phase: "dead", phaseTime: 0.1 };
    const arcs = renderTo(state).arcCalls;
    expect(arcs.some((a) => a.radius === EYE_RADIUS)).toBe(false);
  });

  it("still draws the normal player while the door is only just swinging open", () => {
    // The player must not vanish the instant they touch the door — only once
    // it has visibly opened and they've stepped into it.
    const state: GameState = {
      ...createInitialState(1),
      phase: "entering",
      phaseTime: DOOR_OPEN_DURATION / 2,
    };
    const arcs = renderTo(state).arcCalls;
    expect(arcs.some((a) => a.radius === EYE_RADIUS)).toBe(true);
  });

  it("does not draw the normal player once they've walked into the open door", () => {
    const state: GameState = {
      ...createInitialState(1),
      phase: "entering",
      phaseTime: DOOR_OPEN_DURATION + 0.05,
    };
    const arcs = renderTo(state).arcCalls;
    expect(arcs.some((a) => a.radius === EYE_RADIUS)).toBe(false);
  });
});
