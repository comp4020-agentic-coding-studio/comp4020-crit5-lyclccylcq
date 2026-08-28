import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  step,
  solidRects,
  DEATH_Y,
  LEVEL1_GOAL,
  LEVEL1_SPIKE_HAZARD,
  LEVEL2_SPAWN,
  LEVEL2_GROUND_SEGMENTS,
  LEVEL2_COLLAPSE_TRIGGER,
  LEVEL2_FAKE_DOOR,
  LEVEL2_FAKE_DOOR_TRIGGER,
  LEVEL2_REAL_DOOR,
  LEVEL2_SPIKE_ZONE,
  LEVEL2_STEP_1,
  LEVEL2_STEP_2,
  LEVEL2_STEP_3,
  LEVEL2_CHASM_1,
  LEVEL2_CHASM_2,
  PLATFORM_BREAK_DELAY,
  SPIKE_DELAY,
  GROUND_Y,
  PLAYER_H,
  PLAYER_W,
} from "../game/engine.ts";
import type { Input } from "../game/engine.ts";

// Crit 5 — "A game":
// https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// Mechanically checkable lines only. Left to the crit, because only a person
// can judge them: whether the opening screen actually makes the first move
// obvious, and whether a stranger reaches an ending inside five minutes.

const DIST = resolve("dist");

function shippedHtmlFiles(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return shippedHtmlFiles(path);
    return path.endsWith(".html") ? [path] : [];
  });
}

const pages = shippedHtmlFiles().map((path) => ({
  path,
  doc: new JSDOM(readFileSync(path, "utf8")).window.document,
}));

describe("no tutorial anywhere", () => {
  const tutorialWords = /instructions|tutorial|how\s*to\s*play|help/i;

  it("has no on-screen instructions text on any shipped page", () => {
    for (const { path, doc } of pages) {
      expect(doc.body.textContent ?? "", `${path} reads like a how-to`).not.toMatch(
        tutorialWords,
      );
    }
  });

  it("ships no separate instructions/help/tutorial page", () => {
    for (const { path } of pages) {
      expect(path, "a standalone how-to-play page defeats the no-tutorial rule").not.toMatch(
        tutorialWords,
      );
    }
  });
});

// These run against game/engine.ts directly — no DOM, no canvas — because
// game rules and rendering are deliberately separate (see main.ts), so a
// rule can be tested without a browser and a visual change never risks it.
const noInput: Input = { left: false, right: false, jumpPressed: false };

describe("play can be lost", () => {
  it("starts in a playing state on level 1", () => {
    const state = createInitialState();
    expect(state.phase).toBe("playing");
    expect(state.level).toBe(1);
  });

  it("ends the round when the level 1 player falls below the death boundary", () => {
    const state = createInitialState(1);
    state.player = { ...state.player, x: 420, y: DEATH_Y + 1, onGround: false };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("dead");
  });

  it("ends the round when the level 1 player touches the visible spike hazard", () => {
    const state = createInitialState(1);
    state.player = {
      ...state.player,
      x: LEVEL1_SPIKE_HAZARD.x + 10,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("dead");
  });

  it("advances to level 2 when the level 1 player reaches the goal", () => {
    const state = createInitialState(1);
    state.player = {
      ...state.player,
      x: LEVEL1_GOAL.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.level).toBe(2);
    expect(next.phase).toBe("playing");
    expect(next.player.x).toBe(LEVEL2_SPAWN.x);
    expect(next.player.y).toBe(LEVEL2_SPAWN.y);
  });

  it("ends the round when the level 2 player falls below the death boundary", () => {
    const state = createInitialState(2);
    state.player = { ...state.player, x: 400, y: DEATH_Y + 1, onGround: false };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("dead");
  });

  it("ends the round when the level 2 player touches a popped-up hazard", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_SPIKE_ZONE.x + 10,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };
    state.traps.spikes = { triggered: true, timer: SPIKE_DELAY };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("dead");
  });

  it("arms the collapsing floor on approach, not only once already standing on it", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_COLLAPSE_TRIGGER.x + 2,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.collapse.triggered).toBe(true);
  });

  it("leaves the fake door untriggered while the player is still short of its trigger zone", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR_TRIGGER.x - 200,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.fakeDoor.triggered).toBe(false);
    expect(next.phase).toBe("playing");
  });

  it("arms the fake-door trick once the player enters its trigger zone", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR_TRIGGER.x + 5,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.fakeDoor.triggered).toBe(true);
  });

  it("blocks the player from passing through the fake door once it has transformed", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR.x - PLAYER_W - 2,
      y: GROUND_Y - PLAYER_H,
      vx: 0,
      onGround: true,
    };
    const input = { left: false, right: true, jumpPressed: false };

    const next = step(state, input, 1 / 60);

    expect(next.player.x + PLAYER_W).toBeLessThanOrEqual(LEVEL2_FAKE_DOOR.x);
    expect(next.phase).toBe("playing");
  });

  it("wins the game when the level 2 player reaches the real door after the fake door has triggered", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    state.player = {
      ...state.player,
      x: LEVEL2_REAL_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("won");
  });

  it("repairs the old leftover terrain into one continuous ground segment, no island or gap", () => {
    // The old layout left a fragment ending at 1900, a 10px island at
    // 1970-1980, and a segment resuming at 2050 — a visible "something used
    // to be here" seam. It must now be one unbroken segment underneath.
    const covering = LEVEL2_GROUND_SEGMENTS.find(
      (seg) => seg.y === GROUND_Y && seg.x <= 1970 && seg.x + seg.w >= 2050,
    );
    expect(covering, "no continuous ground segment spans the old hole/island location").toBeTruthy();
  });

  it("keeps the staircase's safe steps and both chasm platforms always present, regardless of trap state", () => {
    const untouched = solidRects(createInitialState(2).traps);
    const midCollapse = solidRects({
      collapse: { triggered: true, timer: 0 },
      hiddenBlock: { triggered: false, timer: 0 },
      spikes: { triggered: false, timer: 0 },
      fakeDoor: { triggered: true, timer: 0 },
      platform: { triggered: true, timer: 0 },
    });

    for (const rects of [untouched, midCollapse]) {
      expect(rects).toContainEqual(LEVEL2_STEP_1);
      expect(rects).toContainEqual(LEVEL2_STEP_2);
      expect(rects).toContainEqual(LEVEL2_CHASM_1);
      expect(rects).toContainEqual(LEVEL2_CHASM_2);
    }
  });

  it("does not arm the breakable platform just from passing under or beside it", () => {
    const state = createInitialState(2);
    // Jumping up right beside the platform, never resting on top of it.
    state.player = {
      ...state.player,
      x: LEVEL2_STEP_3.x - PLAYER_W - 2,
      y: LEVEL2_STEP_3.y,
      vy: -300,
      onGround: false,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.platform.triggered).toBe(false);
  });

  it("arms the breakable platform once the player actually lands on it", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_STEP_3.x + 10,
      y: LEVEL2_STEP_3.y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.platform.triggered).toBe(true);
  });

  it("removes the broken platform from solid ground only after its break delay elapses", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_STEP_3.x + 10,
      y: LEVEL2_STEP_3.y - PLAYER_H,
      onGround: true,
    };
    state = step(state, noInput, 1 / 60);
    expect(state.traps.platform.triggered).toBe(true);

    // Still within the delay: the platform is armed but not yet gone.
    expect(solidRects(state.traps)).toContainEqual(LEVEL2_STEP_3);

    state.traps.platform.timer = PLATFORM_BREAK_DELAY;
    expect(solidRects(state.traps)).not.toContainEqual(LEVEL2_STEP_3);
  });

  // A full scripted run over just the new content (staircase, chasm,
  // backtrack), starting a bit past the pre-existing collapse tile and spike
  // zone — those hazards already have their own dedicated tests above and
  // aren't part of this rework; isolating this run to the new terrain is what
  // actually proves "every new jump is reachable" against the real engine,
  // without re-litigating unrelated hazard timing.
  it("climbs the staircase, crosses the chasm, triggers the fake door, and wins via the real door on the backtrack", () => {
    const right: Input = { left: false, right: true, jumpPressed: false };
    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const left: Input = { left: true, right: false, jumpPressed: false };
    const leftJump: Input = { left: true, right: false, jumpPressed: true };
    const hover: Input = { left: false, right: false, jumpPressed: false };

    let state = createInitialState(2);
    state.player = { ...state.player, x: 1650, y: GROUND_Y - PLAYER_H, onGround: true };

    const run = (input: Input, frames: number) => {
      for (let i = 0; i < frames && state.phase === "playing"; i++) {
        state = step(state, input, 1 / 60);
      }
    };
    // Jump, drift horizontally for a fixed number of frames, then hover
    // (drop straight down) until landing — since horizontal velocity here is
    // driven directly by held input rather than preserved momentum, this
    // gives frame-exact, deterministic control over where each jump lands.
    const hop = (dir: "right" | "left", driftFrames: number) => {
      run(dir === "right" ? rightJump : leftJump, 1);
      run(dir === "right" ? right : left, driftFrames);
      let i = 0;
      while (state.phase === "playing" && !state.player.onGround && i < 90) {
        state = step(state, hover, 1 / 60);
        i++;
      }
    };

    run(right, 8);
    hop("right", 15); // onto STEP_1
    expect(state.phase).toBe("playing");

    run(right, 15);
    hop("right", 15); // onto STEP_2
    expect(state.phase).toBe("playing");

    run(right, 20);
    hop("right", 12); // onto STEP_3 — the breakable platform, arms on landing
    expect(state.phase).toBe("playing");
    expect(state.traps.platform.triggered).toBe(true);

    run(right, 10);
    run(right, 47); // off the staircase, across the base ground to the chasm edge
    hop("right", 30); // onto CHASM_1
    expect(state.phase).toBe("playing");
    hop("right", 55); // onto CHASM_2
    expect(state.phase).toBe("playing");
    hop("right", 40); // onto the final ground segment
    expect(state.phase).toBe("playing");

    run(right, 100); // on to the fake door — it slams shut
    expect(state.traps.fakeDoor.triggered).toBe(true);
    expect(state.phase).toBe("playing");

    // Backtrack across the same chasm platforms to the real door.
    run(left, 18);
    hop("left", 40); // back onto CHASM_2
    expect(state.phase).toBe("playing");
    run(left, 5);
    hop("left", 44); // back onto CHASM_1
    expect(state.phase).toBe("playing");
    run(left, 5);
    hop("left", 30); // back across the real door

    expect(state.phase).toBe("won");
  });
});
