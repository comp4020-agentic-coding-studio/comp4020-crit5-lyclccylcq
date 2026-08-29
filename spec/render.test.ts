import { describe, expect, it } from "vitest";
import { render, GROUND_VISUAL_H, WORLD_Y_OFFSET, SPIKE_COLOR } from "../game/render.ts";
import {
  createInitialState,
  LEVEL1_SPIKE_HAZARD,
  LEVEL2_COLLAPSE_TILE,
  LEVEL2_CHASM_2,
  LEVEL2_GROUND_SEGMENTS,
  LEVEL2_PIT,
  LEVEL2_FAKE_DOOR,
  LEVEL2_REAL_DOOR,
  LEVEL2_SPIKE_ZONE,
  GROUND_Y,
  COLLAPSE_DELAY,
  SPIKE_DELAY,
  DOOR_OPEN_DURATION,
  MOVING_PLATFORM_SHIFT_DISTANCE,
  VIEWPORT_HEIGHT,
} from "../game/engine.ts";
import type { GameState, Rect } from "../game/engine.ts";

// A hand-rolled recorder standing in for CanvasRenderingContext2D — no real
// canvas or browser needed. Records only the calls these three assertions
// care about; everything else is a harmless no-op so render() runs to
// completion untouched.
class FakeContext {
  fillRectCalls: { fillStyle: unknown; x: number; y: number; w: number; h: number }[] = [];
  fillTextCalls: { text: string }[] = [];
  arcCalls: { radius: number; x: number; y: number }[] = [];
  fillCalls: { fillStyle: unknown }[] = [];
  fillStyle: unknown = "";
  strokeStyle: unknown = "";
  lineWidth = 1;
  globalAlpha = 1;
  font = "";
  textAlign = "";
  textBaseline = "";

  // A minimal translate/save/restore stack — real enough that recorded
  // fillRect/arc coordinates land in actual screen space, which is what lets
  // the "no more excessive bottom whitespace" tests below assert on where
  // things actually end up drawn, not just their untranslated source rects.
  private offsetStack: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  private offset(): { x: number; y: number } {
    return this.offsetStack[this.offsetStack.length - 1];
  }

  clearRect(): void {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const o = this.offset();
    this.fillRectCalls.push({ fillStyle: this.fillStyle, x: x + o.x, y: y + o.y, w, h });
  }
  fillText(text: string): void {
    this.fillTextCalls.push({ text });
  }
  strokeRect(): void {}
  save(): void {
    this.offsetStack.push({ ...this.offset() });
  }
  restore(): void {
    if (this.offsetStack.length > 1) this.offsetStack.pop();
  }
  translate(dx: number, dy: number): void {
    const o = this.offset();
    o.x += dx;
    o.y += dy;
  }
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arcTo(): void {}
  stroke(): void {}
  fill(): void {
    this.fillCalls.push({ fillStyle: this.fillStyle });
  }
  arc(x: number, y: number, radius: number): void {
    const o = this.offset();
    this.arcCalls.push({ radius, x: x + o.x, y: y + o.y });
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
    // leaving a visible pit-shaped seam against the visually-full-height
    // ground either side. It should match the same capped visual height every
    // other ground slab draws at (see "viewport expands..." below), not its
    // own thin collision rect.
    const draws = collapseTileDraws(renderTo(createInitialState(2)));
    expect(draws.some((call) => call.h === GROUND_VISUAL_H)).toBe(true);
    expect(draws.some((call) => call.h === LEVEL2_COLLAPSE_TILE.h)).toBe(false);
  });
});

describe("viewport expands downward without stretching the ground/foundation blocks", () => {
  // The lower viewport area grew via VIEWPORT_HEIGHT alone (an engine.ts
  // concern, covered in spec/game.test.ts's "enlarged viewport" tests); this
  // is the render-level guarantee that growing it never inflates how tall any
  // ground/foundation slab is actually painted.
  it("never fills a ground slab taller than the capped visual thickness, even though the collision rects are much taller", () => {
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    // Every real Level 2 ground segment has a much taller collision rect than
    // GROUND_VISUAL_H (h:400) — confirms the cap is actually doing something,
    // not just trivially true because the source rects are already short.
    expect(LEVEL2_GROUND_SEGMENTS.every((seg) => seg.h > GROUND_VISUAL_H)).toBe(true);

    const groundBodyDraws = draws.filter((call) =>
      LEVEL2_GROUND_SEGMENTS.some((seg) => call.x === seg.x && call.w === seg.w),
    );
    expect(groundBodyDraws.length).toBeGreaterThan(0);
    for (const call of groundBodyDraws) {
      expect(call.h).toBeLessThanOrEqual(GROUND_VISUAL_H);
    }
  });

  it("keeps the visual ground thickness the same regardless of how tall the viewport is", () => {
    // GROUND_VISUAL_H is a fixed constant, not derived from VIEWPORT_HEIGHT —
    // the two are independent, which is exactly what "expand the canvas
    // below, don't stretch the terrain" requires.
    expect(GROUND_VISUAL_H).toBeLessThan(VIEWPORT_HEIGHT);
    expect(GROUND_VISUAL_H).toBeGreaterThan(0);
    expect(GROUND_VISUAL_H).toBeLessThanOrEqual(200); // stays a modest, "reasonable" slab of dirt
  });

  it("draws no leftover hidden/floating platform above the pit", () => {
    // Nothing should ever paint a rect at the old hidden-block's footprint —
    // this section's only trap is the falling cloud, which is drawn as an arc
    // (see drawPitCloud), never a fillRect. Anything spanning the pit's
    // x-range as a fillRect can only be the full-width sky/overlay
    // background, never a narrow platform sized to just the gap.
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    const overPit = draws.filter(
      (call) => call.x < LEVEL2_PIT.x + LEVEL2_PIT.w && call.x + call.w > LEVEL2_PIT.x,
    );
    for (const call of overPit) {
      expect(call.w, `unexpected narrow draw over the pit: ${JSON.stringify(call)}`).toBeGreaterThanOrEqual(
        LEVEL2_PIT.w * 3,
      );
    }
  });
});

describe("requirement 1: bottom whitespace is reduced without stretching the ground", () => {
  it("extends the foundation all the way down to the bottom of the viewport, for every ground segment", () => {
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    // The capped visual slab draws its body (h:GROUND_VISUAL_H) and a thin
    // top strip (h:10); the new foundation extension is a separate draw
    // starting exactly where the capped body's bottom edge is, in screen
    // space — identify it by that position, not just by an unusual height.
    const expectedExtensionY = GROUND_Y + GROUND_VISUAL_H + WORLD_Y_OFFSET;
    for (const seg of LEVEL2_GROUND_SEGMENTS) {
      const extension = draws.find(
        (call) => call.x === seg.x && call.w === seg.w && call.y === expectedExtensionY,
      );
      expect(extension, `no foundation extension drawn for segment at x=${seg.x}`).toBeTruthy();
      // Reaches exactly the bottom of the fixed-size canvas — no floating gap
      // of sky left underneath, and never drawn past it either.
      expect(extension!.y + extension!.h).toBe(VIEWPORT_HEIGHT);
    }
  });

  it("never changes the ground's collision-relevant top surface position while extending the foundation", () => {
    // The extension only ever adds fill below GROUND_VISUAL_H — the top strip
    // (the actual standable surface) keeps drawing at exactly GROUND_Y, same
    // as before this change.
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    const topSurfaceDraws = draws.filter(
      (call) =>
        call.h === GROUND_VISUAL_H && LEVEL2_GROUND_SEGMENTS.some((seg) => call.x === seg.x && call.w === seg.w),
    );
    expect(topSurfaceDraws.length).toBeGreaterThan(0);
    for (const call of topSurfaceDraws) {
      expect(call.y).toBe(GROUND_Y + WORLD_Y_OFFSET);
    }
  });

  it("actually shifts the ground lower on screen, not just leaving it thinner", () => {
    // Before this fix the ground's screen-space y was simply GROUND_Y; this
    // locks in that the fix is a real vertical shift of the whole scene, not
    // a no-op that happens to satisfy the gap check above by coincidence.
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    const groundBodyDraws = draws.filter(
      (call) =>
        call.h === GROUND_VISUAL_H && LEVEL2_GROUND_SEGMENTS.some((seg) => call.x === seg.x && call.w === seg.w),
    );
    expect(groundBodyDraws.length).toBeGreaterThan(0);
    for (const call of groundBodyDraws) {
      expect(call.y).toBe(GROUND_Y + WORLD_Y_OFFSET);
    }
    expect(WORLD_Y_OFFSET).toBeGreaterThan(0);
  });

  it("shifts the whole scene uniformly, so nothing above the ground gets pushed off the top of the canvas", () => {
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    for (const call of draws) {
      expect(call.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("requirement 2: the red spike hazard is now a fast-rising stone wall", () => {
  it("no longer renders red spikes for level 2, triggered or not", () => {
    const untriggered = renderTo(createInitialState(2));
    expect(untriggered.fillCalls.some((c) => c.fillStyle === SPIKE_COLOR)).toBe(false);

    const triggered: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, spikes: { triggered: true, timer: SPIKE_DELAY } },
    };
    expect(renderTo(triggered).fillCalls.some((c) => c.fillStyle === SPIKE_COLOR)).toBe(false);
  });

  it("no longer renders red spikes for level 1 either — it now uses the same stone wall as level 2", () => {
    const atStart = renderTo(createInitialState(1));
    expect(atStart.fillCalls.some((c) => c.fillStyle === SPIKE_COLOR)).toBe(false);

    const risen: GameState = {
      ...createInitialState(1),
      traps: { ...createInitialState(1).traps, spikes: { triggered: true, timer: SPIKE_DELAY } },
    };
    expect(renderTo(risen).fillCalls.some((c) => c.fillStyle === SPIKE_COLOR)).toBe(false);
  });

  it("renders level 1's hazard as a rising stone wall once its timer has advanced", () => {
    const state: GameState = {
      ...createInitialState(1),
      traps: { ...createInitialState(1).traps, spikes: { triggered: true, timer: SPIKE_DELAY * 0.5 } },
    };
    const draws = renderTo(state).fillRectCalls.filter(
      (c) => c.x === LEVEL1_SPIKE_HAZARD.x && c.w === LEVEL1_SPIKE_HAZARD.w,
    );
    expect(draws.length).toBeGreaterThan(0);
  });

  it("draws nothing for the stone wall while it is untriggered", () => {
    const draws = renderTo(createInitialState(2)).fillRectCalls;
    const wallDraws = draws.filter((c) => c.x === LEVEL2_SPIKE_ZONE.x && c.w === LEVEL2_SPIKE_ZONE.w);
    expect(wallDraws).toEqual([]);
  });

  it("rises quickly from the ground once triggered, growing taller as its timer advances", () => {
    const heightAt = (timer: number) => {
      const state: GameState = {
        ...createInitialState(2),
        traps: { ...createInitialState(2).traps, spikes: { triggered: true, timer } },
      };
      const draws = renderTo(state).fillRectCalls.filter(
        (c) => c.x === LEVEL2_SPIKE_ZONE.x && c.w === LEVEL2_SPIKE_ZONE.w,
      );
      expect(draws.length).toBeGreaterThan(0);
      return Math.max(...draws.map((c) => c.h));
    };

    const early = heightAt(0.01);
    const mid = heightAt(SPIKE_DELAY * 0.3);
    const full = heightAt(SPIKE_DELAY);

    expect(early).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(early);
    expect(full).toBeGreaterThan(mid);
  });
});

describe("requirement 3: the fake door stays visually identical to the real door until contact", () => {
  function doorPattern(ctx: FakeContext, rect: Rect) {
    return {
      frame: ctx.fillRectCalls.find(
        (c) =>
          c.x === rect.x - 3 &&
          c.y === rect.y - 3 + WORLD_Y_OFFSET &&
          c.w === rect.w + 6 &&
          c.h === rect.h + 3,
      ),
      panel: ctx.fillRectCalls.find(
        (c) => c.x === rect.x && c.y === rect.y + WORLD_Y_OFFSET && c.w === rect.w && c.h === rect.h,
      ),
      knob: ctx.arcCalls.find((a) => a.radius === 3 && Math.abs(a.x - (rect.x + rect.w - 8)) < 0.001),
    };
  }

  it("hides the real door entirely at the start of Level 2", () => {
    const real = doorPattern(renderTo(createInitialState(2)), LEVEL2_REAL_DOOR);
    expect(real.frame).toBeFalsy();
    expect(real.panel).toBeFalsy();
    expect(real.knob).toBeFalsy();
  });

  it("draws the untouched fake door with the exact same frame+panel+knob pattern and colours the real door will use once revealed", () => {
    const fake = doorPattern(renderTo(createInitialState(2)), LEVEL2_FAKE_DOOR);

    const revealed: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, fakeDoor: { triggered: true, timer: 0 } },
    };
    const real = doorPattern(renderTo(revealed), LEVEL2_REAL_DOOR);

    expect(fake.frame).toBeTruthy();
    expect(fake.panel).toBeTruthy();
    expect(fake.knob).toBeTruthy();
    expect(real.frame).toBeTruthy();
    expect(real.panel).toBeTruthy();
    expect(real.knob).toBeTruthy();
    expect(fake.frame?.fillStyle).toBe(real.frame?.fillStyle);
    expect(fake.panel?.fillStyle).toBe(real.panel?.fillStyle);
  });

  it("makes the real door appear for the first time once the fake door is triggered", () => {
    const revealed: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, fakeDoor: { triggered: true, timer: 0 } },
    };
    const real = doorPattern(renderTo(revealed), LEVEL2_REAL_DOOR);
    expect(real.frame).toBeTruthy();
    expect(real.panel).toBeTruthy();
    expect(real.knob).toBeTruthy();
  });

  it("no early proximity reveal: the fake door still looks like an ordinary door even with the player standing right beside it", () => {
    const state: GameState = {
      ...createInitialState(2),
      player: { x: LEVEL2_FAKE_DOOR.x - 20, y: LEVEL2_FAKE_DOOR.y, vx: 0, vy: 0, onGround: true, facing: 1 },
    };
    const fake = doorPattern(renderTo(state), LEVEL2_FAKE_DOOR);
    expect(fake.panel).toBeTruthy();
  });

  it("draws the fake door as a blocked wall instead, once it has actually been triggered by contact", () => {
    const untriggered = doorPattern(renderTo(createInitialState(2)), LEVEL2_FAKE_DOOR);
    const state: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, fakeDoor: { triggered: true, timer: 0 } },
    };
    const triggered = doorPattern(renderTo(state), LEVEL2_FAKE_DOOR);
    // Same footprint, but drawBlockedDoor paints it in a different colour —
    // a wall, not a door panel — once it's actually been sprung.
    expect(triggered.panel?.fillStyle).not.toBe(untriggered.panel?.fillStyle);
  });
});

describe("requirement 2: the chasm platform trap only moves once activated", () => {
  it("draws the platform at its normal resting spot before the trap is triggered", () => {
    const draws = renderTo(createInitialState(2)).fillRectCalls.filter(
      (call) => call.w === LEVEL2_CHASM_2.w && call.h === LEVEL2_CHASM_2.h,
    );
    expect(draws.some((call) => call.x === LEVEL2_CHASM_2.x)).toBe(true);
  });

  it("draws the platform visibly displaced right after it's triggered", () => {
    const state: GameState = {
      ...createInitialState(2),
      traps: { ...createInitialState(2).traps, chasmPlatform: { triggered: true, timer: 0 } },
    };
    const draws = renderTo(state).fillRectCalls.filter(
      (call) => call.w === LEVEL2_CHASM_2.w && call.h === LEVEL2_CHASM_2.h,
    );
    expect(draws.some((call) => call.x === LEVEL2_CHASM_2.x + MOVING_PLATFORM_SHIFT_DISTANCE)).toBe(true);
    expect(draws.some((call) => call.x === LEVEL2_CHASM_2.x)).toBe(false);
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

  it("does not draw the normal player once the game is complete", () => {
    const state: GameState = { ...createInitialState(2), phase: "complete", phaseTime: 0 };
    const arcs = renderTo(state).arcCalls;
    expect(arcs.some((a) => a.radius === EYE_RADIUS)).toBe(false);
  });
});

describe("final completion screen", () => {
  it("renders the completion text once the game reaches the complete phase", () => {
    const state: GameState = { ...createInitialState(2), phase: "complete", phaseTime: 0 };
    const texts = renderTo(state).fillTextCalls.map((c) => c.text);
    expect(texts).toContain("You cleared Pip's Detour");
  });

  it("shows no completion text while still playing, dead, or mid door-entry", () => {
    const playing = renderTo(createInitialState(2)).fillTextCalls.map((c) => c.text);
    expect(playing).not.toContain("You cleared Pip's Detour");

    const dead: GameState = { ...createInitialState(2), phase: "dead", phaseTime: 0.1 };
    expect(renderTo(dead).fillTextCalls.map((c) => c.text)).not.toContain("You cleared Pip's Detour");

    const entering: GameState = { ...createInitialState(2), phase: "entering", phaseTime: 0.1 };
    expect(renderTo(entering).fillTextCalls.map((c) => c.text)).not.toContain("You cleared Pip's Detour");
  });
});
