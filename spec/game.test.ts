import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  step,
  solidRects,
  cameraX,
  levelWidth,
  DEATH_Y,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  LEVEL1_WIDTH,
  LEVEL2_WIDTH,
  LEVEL1_GOAL,
  LEVEL1_SPIKE_HAZARD,
  LEVEL2_SPAWN,
  LEVEL2_GROUND_SEGMENTS,
  LEVEL2_COLLAPSE_TILE,
  LEVEL2_COLLAPSE_TRIGGER,
  LEVEL2_FAKE_DOOR,
  LEVEL2_FAKE_DOOR_REVEAL_TRIGGER,
  LEVEL2_REAL_DOOR,
  LEVEL2_SPIKE_TRIGGER,
  LEVEL2_SPIKE_ZONE,
  LEVEL2_FENCE,
  LEVEL2_FENCE_TRIGGER,
  FENCE_CHASE_SPEED,
  FENCE_CHASE_DISTANCE,
  fenceRect,
  LEVEL2_CHASM_1,
  LEVEL2_CHASM_2,
  SPIKE_DELAY,
  RESPAWN_DELAY,
  DOOR_ENTER_DELAY,
  LEVEL2_CHASM_2_TRIGGER,
  MOVING_PLATFORM_SHIFT_DELAY,
  MOVING_PLATFORM_SHIFT_DISTANCE,
  MOVING_PLATFORM_RETURN_DURATION,
  chasmPlatformRect,
  GROUND_Y,
  PLAYER_H,
  PLAYER_W,
  MOVE_SPEED,
  COLLAPSE_DELAY,
  LEVEL2_PIT,
  LEVEL2_PIT_CLOUD_W,
  LEVEL2_PIT_CLOUD_H,
  LEVEL2_PIT_CLOUD_X,
  LEVEL2_PIT_CLOUD_SKY_Y,
  LEVEL2_PIT_CLOUD_LOW_Y,
  LEVEL2_PIT_CLOUD_TRIGGER,
  rectsOverlap,
  pitCloudRect,
  PIT_CLOUD_TELEGRAPH_DELAY,
  PIT_CLOUD_FALL_DURATION,
} from "../game/engine.ts";
import * as engine from "../game/engine.ts";
import type { GameState, Input, Rect } from "../game/engine.ts";

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

describe("level selector in the nav bar", () => {
  const home = pages.find(({ path }) => path.endsWith("index.html"));

  it("keeps the existing Home link", () => {
    const link = home?.doc.querySelector('nav a[href="./"]');
    expect(link?.textContent?.trim()).toBe("Home");
  });

  it("offers a compact control to choose Level 1 or Level 2", () => {
    const control = home?.doc.querySelector("#level-select");
    expect(control).toBeTruthy();
    const buttons = Array.from(control?.querySelectorAll("[data-level]") ?? []);
    expect(buttons.map((b) => b.getAttribute("data-level")).sort()).toEqual(["1", "2"]);
  });

  it("marks Level 1 as the current selection on first load", () => {
    const control = home?.doc.querySelector("#level-select");
    const level1 = control?.querySelector('[data-level="1"]');
    const level2 = control?.querySelector('[data-level="2"]');
    expect(level1?.getAttribute("aria-pressed")).toBe("true");
    expect(level2?.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("game logo in the header", () => {
  const home = pages.find(({ path }) => path.endsWith("index.html"));

  it("shows the game's name as a compact logo inside the header/nav area, not a separate centered title", () => {
    const heading = home?.doc.querySelector("h1");
    expect(heading, "the page's one h1 is the logo").toBeTruthy();
    expect(heading?.textContent?.trim()).toBe("Pip's Detour");
    expect(heading?.closest("nav"), "the logo lives in the nav/header, not floating above the canvas").toBeTruthy();
  });

  it("has exactly one heading with the game's name — no duplicate title left over main/canvas", () => {
    const headings = Array.from(home?.doc.querySelectorAll("h1, h2") ?? []).filter(
      (el) => el.textContent?.trim() === "Pip's Detour",
    );
    expect(headings.length).toBe(1);
    expect(home?.doc.querySelector("main")?.textContent?.trim()).toBe("");
  });

  it("still keeps the Home link, level selector, and death counter alongside the logo", () => {
    expect(home?.doc.querySelector('nav a[href="./"]')?.textContent?.trim()).toBe("Home");
    expect(home?.doc.querySelector("#level-select")).toBeTruthy();
    expect(home?.doc.querySelector("#death-count")).toBeTruthy();
  });
});

describe("enlarged viewport", () => {
  it("is bigger than the original 960x360", () => {
    expect(VIEWPORT_WIDTH).toBeGreaterThan(960);
    expect(VIEWPORT_HEIGHT).toBeGreaterThan(360);
  });

  it("grows the view downward only — width stays essentially unchanged while height increases", () => {
    // This pass only expands the vertical viewport; the width from the
    // earlier enlargement pass (1280) is preserved almost exactly.
    expect(VIEWPORT_WIDTH).toBe(1280);
    expect(VIEWPORT_HEIGHT).toBeGreaterThan(480);
  });

  it("still lets the camera reach both ends of each level, and no further", () => {
    expect(cameraX(0, levelWidth(1))).toBe(0);
    expect(cameraX(LEVEL1_WIDTH, levelWidth(1))).toBe(LEVEL1_WIDTH - VIEWPORT_WIDTH);
    expect(cameraX(0, levelWidth(2))).toBe(0);
    expect(cameraX(LEVEL2_WIDTH, levelWidth(2))).toBe(LEVEL2_WIDTH - VIEWPORT_WIDTH);
  });
});

// These run against game/engine.ts directly — no DOM, no canvas — because
// game rules and rendering are deliberately separate (see main.ts), so a
// rule can be tested without a browser and a visual change never risks it.
const noInput: Input = { left: false, right: false, jumpPressed: false };

describe("player movement speed", () => {
  it("moved noticeably slower before this tuning pass — a moderate bump, not a rewrite", () => {
    // Locks the "moderate increase" requirement to a concrete range: fast
    // enough to feel different, not so fast that jump arcs above become
    // unreliable guesswork.
    expect(MOVE_SPEED).toBeGreaterThan(220);
    expect(MOVE_SPEED).toBeLessThanOrEqual(400);
  });

  it("sets horizontal velocity to exactly MOVE_SPEED in the held direction, each frame", () => {
    const state = createInitialState(1);
    const dt = 1 / 60;

    const right = step(state, { left: false, right: true, jumpPressed: false }, dt);
    expect(right.player.vx).toBe(MOVE_SPEED);
    expect(right.player.x).toBeCloseTo(state.player.x + MOVE_SPEED * dt, 5);

    const left = step(state, { left: true, right: false, jumpPressed: false }, dt);
    expect(left.player.vx).toBe(-MOVE_SPEED);
    expect(left.player.x).toBeCloseTo(state.player.x - MOVE_SPEED * dt, 5);
  });

  it("still clears both level 1 gaps and the spike at the current speed — jumps stay reliable", () => {
    const right: Input = { left: false, right: true, jumpPressed: false };
    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const hover: Input = { left: false, right: false, jumpPressed: false };

    let state = createInitialState(1);

    const run = (input: Input, frames: number) => {
      for (let i = 0; i < frames && state.phase === "playing"; i++) {
        state = step(state, input, 1 / 60);
      }
    };
    const hop = (driftFrames: number) => {
      run(rightJump, 1);
      run(right, driftFrames);
      let i = 0;
      while (state.phase === "playing" && !state.player.onGround && i < 90) {
        state = step(state, hover, 1 / 60);
        i++;
      }
    };

    run(right, 62);
    hop(30); // clears the 70px gap at 400-470
    expect(state.phase).toBe("playing");

    run(right, 15);
    hop(30); // clears the spike hazard at 680-760
    expect(state.phase).toBe("playing");

    run(right, 15);
    hop(35); // clears the 100px gap at 900-1000
    expect(state.phase).toBe("playing");

    run(right, 300);
    expect(state.phase).toBe("entering"); // reached the goal, not "dead" in a gap or on the spike
  });
});

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

  it("ends the round when the level 1 player touches the stone wall hazard", () => {
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

  it("level 1's stone wall hazard auto-arms the instant the level loads, using the same trap field as level 2's wall", () => {
    const state = createInitialState(1);
    expect(state.traps.spikes.triggered).toBe(true);
    expect(state.traps.spikes.timer).toBe(0);
  });

  it("level 1's stone wall finishes rising well before the fastest possible approach reaches it, so it's never an ambush", () => {
    const state = createInitialState(1);
    // Best case for an ambush: a straight, ungapped, full-speed sprint — the
    // real approach is slower still, since it also has to clear two gaps.
    const fastestTimeToReach = (LEVEL1_SPIKE_HAZARD.x - state.player.x) / MOVE_SPEED;
    expect(SPIKE_DELAY).toBeLessThan(fastestTimeToReach);
  });

  it("plays a short door-entry animation before advancing to level 2", () => {
    const state = createInitialState(1);
    state.player = {
      ...state.player,
      x: LEVEL1_GOAL.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    let next = step(state, noInput, 1 / 60);
    expect(next.level).toBe(1); // not switched yet — the entry animation is playing
    expect(next.phase).toBe("entering");

    const maxFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (next.phase === "entering" && frames < maxFrames) {
      next = step(next, noInput, 1 / 60);
      frames++;
    }

    expect(next.level).toBe(2);
    expect(next.phase).toBe("playing");
    expect(next.player.x).toBe(LEVEL2_SPAWN.x);
    expect(next.player.y).toBe(LEVEL2_SPAWN.y);
    expect(next.banner).toEqual({ timer: 0 }); // Level 2's first arrival announces itself
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

  it("moves the spike hazard left, leaving clear room to approach the fence after it", () => {
    // Previously the zone started at x=1560, hard up against the obstacle at 1680.
    expect(LEVEL2_SPIKE_ZONE.x).toBeLessThan(1560);

    const gapToFence = LEVEL2_FENCE.x - (LEVEL2_SPIKE_ZONE.x + LEVEL2_SPIKE_ZONE.w);
    expect(gapToFence).toBeGreaterThanOrEqual(100); // enough room to land and line up the jump
  });

  it("keeps the spike trigger tight against the zone, not far back down the approach", () => {
    // Retuned to be late: the trigger starts right up against the zone
    // itself, so there's no long stretch of approach where the trap is
    // already armed but nothing has happened yet.
    expect(LEVEL2_SPIKE_TRIGGER.x + LEVEL2_SPIKE_TRIGGER.w).toBe(LEVEL2_SPIKE_ZONE.x);
    expect(LEVEL2_SPIKE_ZONE.x - LEVEL2_SPIKE_TRIGGER.x).toBeLessThanOrEqual(60);
  });

  it("does not activate the spike trigger while the player is still far away", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_SPIKE_TRIGGER.x - 200,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.spikes.triggered).toBe(false);
  });

  it("activates the spike trigger only once the player is close enough", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_SPIKE_TRIGGER.x - PLAYER_W + 5, // just barely overlapping the trigger's left edge
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.spikes.triggered).toBe(true);
  });

  it("still gives the wall time to rise before the player has crossed the whole zone", () => {
    // The retuned trigger is close to the zone, but death is lethal from the
    // moment the stone wall starts rising (not only once fully up), so a
    // full-speed player running clean through still shouldn't escape it.
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_SPIKE_TRIGGER.x - PLAYER_W,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };
    const right: Input = { left: false, right: true, jumpPressed: false };

    let frames = 0;
    const maxFrames = 60;
    while (
      state.phase === "playing" &&
      state.player.x < LEVEL2_SPIKE_ZONE.x + LEVEL2_SPIKE_ZONE.w &&
      frames < maxFrames
    ) {
      state = step(state, right, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("dead");
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

  it("collapses faster than a full-speed sprint could clear the trigger and the tile", () => {
    // The whole point of the fast delay: by the time it gives way, a player
    // sprinting from the moment they armed it hasn't covered the tile yet.
    const distanceToClear = LEVEL2_COLLAPSE_TILE.x + LEVEL2_COLLAPSE_TILE.w - LEVEL2_COLLAPSE_TRIGGER.x;
    const distanceCoveredBeforeCollapse = MOVE_SPEED * COLLAPSE_DELAY;
    expect(distanceCoveredBeforeCollapse).toBeLessThan(distanceToClear);
  });

  it("drops a player sprinting flat-out through the hidden pit — sprinting isn't a reliable escape", () => {
    let state = createInitialState(2);
    state.player = { ...state.player, x: 560, y: GROUND_Y - PLAYER_H, onGround: true };
    const right: Input = { left: false, right: true, jumpPressed: false };

    let frames = 0;
    const maxFrames = 90; // 1.5s — generous even for a dead run plus falling to the death line
    while (state.phase === "playing" && frames < maxFrames) {
      state = step(state, right, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("dead");
  });

  it("places a visible pit between the collapsing-floor trap and the spike hazard", () => {
    expect(LEVEL2_PIT.x).toBeGreaterThan(LEVEL2_COLLAPSE_TILE.x + LEVEL2_COLLAPSE_TILE.w);
    expect(LEVEL2_PIT.x + LEVEL2_PIT.w).toBeLessThan(LEVEL2_SPIKE_TRIGGER.x);

    // It's a real gap in the ground, not a decoration: no ground segment
    // covers this stretch.
    const covering = LEVEL2_GROUND_SEGMENTS.find(
      (seg) => seg.y === GROUND_Y && seg.x <= LEVEL2_PIT.x && seg.x + seg.w >= LEVEL2_PIT.x + LEVEL2_PIT.w,
    );
    expect(covering, "the pit should be an actual gap, not covered by any ground segment").toBeUndefined();
  });

  it("kills the player who falls into the pit, same as any other fall", () => {
    let state = createInitialState(2);
    state.player = { ...state.player, x: LEVEL2_PIT.x + 20, y: GROUND_Y - PLAYER_H, vy: 0, onGround: false };
    // Trap left in its default hidden state — nothing has ever been there to
    // catch this fall.

    let frames = 0;
    const maxFrames = 90;
    while (state.phase === "playing" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("dead");
  });

  it("no longer has any hidden overhead platform trap above the pit", () => {
    // The pit-blocker mechanic (hidden platform that blocks the jump, then
    // falls in to become a permanent bridge) is gone entirely — no trap
    // field, no exported geometry or helpers for it.
    const state = createInitialState(2);
    expect(state.traps).not.toHaveProperty("pitBlocker");

    expect(engine).not.toHaveProperty("pitBlockerRect");
    expect(engine).not.toHaveProperty("pitBridged");
    expect(engine).not.toHaveProperty("PIT_BLOCKER_FALL_DURATION");
    expect(engine).not.toHaveProperty("LEVEL2_PIT_BLOCKER_HIGH_Y");
    expect(engine).not.toHaveProperty("LEVEL2_PIT_BLOCKER_LOW_Y");
    expect(engine).not.toHaveProperty("LEVEL2_PIT_BLOCKER_X");
    expect(engine).not.toHaveProperty("LEVEL2_PIT_BLOCKER_W");
    expect(engine).not.toHaveProperty("LEVEL2_PIT_BLOCKER_H");
    expect(engine).not.toHaveProperty("LEVEL2_PIT_BLOCK_TRIGGER");
  });

  it("no longer has the later hidden/floating staircase platform above the pit either — the cloud is the only trap here", () => {
    // A second, separate mechanic (added after the pit-blocker above was
    // already removed) briefly reintroduced a hidden platform over this same
    // pit. It must also be gone entirely: no trap field, no exported
    // geometry, never rendered, never collidable.
    const state = createInitialState(2);
    expect(state.traps).not.toHaveProperty("hiddenBlock");

    expect(engine).not.toHaveProperty("LEVEL2_HIDDEN_BLOCK");
    expect(engine).not.toHaveProperty("LEVEL2_HIDDEN_BLOCK_TRIGGER");

    // With the platform gone, the only trap this pit can arm at all is the
    // cloud — every other trap stays untouched by anything that happens here.
    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const right: Input = { left: false, right: true, jumpPressed: false };
    let jumped = state;
    jumped.player = {
      ...jumped.player,
      x: LEVEL2_PIT.x - PLAYER_W,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };
    jumped = step(jumped, rightJump, 1 / 60);
    for (let i = 0; i < 30 && jumped.phase === "playing"; i++) {
      jumped = step(jumped, right, 1 / 60);
    }
    expect(jumped.traps.pitCloud.triggered).toBe(true);
    for (const [name, trap] of Object.entries(jumped.traps)) {
      if (name === "pitCloud") continue;
      expect(trap.triggered, `${name} should not be armed by the pit jump`).toBe(false);
    }
  });

  it("places an ordinary-looking decorative cloud in the sky above the visible pit", () => {
    const state = createInitialState(2);
    expect(state.traps.pitCloud.triggered).toBe(false);

    const cloud = pitCloudRect(state.traps.pitCloud);

    // Sits over the pit horizontally...
    expect(cloud.x).toBeLessThan(LEVEL2_PIT.x + LEVEL2_PIT.w);
    expect(cloud.x + cloud.w).toBeGreaterThan(LEVEL2_PIT.x);
    // ...and, before anything has happened, up at ordinary background-cloud
    // height — well clear of the height a jump over the pit would occupy —
    // so it reads as scenery, not a trap.
    expect(LEVEL2_PIT_CLOUD_SKY_Y).toBeLessThan(GROUND_Y - PLAYER_H - 40);
    expect(cloud.y).toBe(LEVEL2_PIT_CLOUD_SKY_Y);
    expect(cloud.w).toBe(LEVEL2_PIT_CLOUD_W);
    expect(cloud.h).toBe(LEVEL2_PIT_CLOUD_H);

    // Walking underneath (not jumping) never arms it either — only a rising
    // jump through the trigger column does.
    let walked = state;
    walked.player = { ...walked.player, x: LEVEL2_PIT_CLOUD_TRIGGER.x - 10, y: GROUND_Y - PLAYER_H, onGround: true };
    const right: Input = { left: false, right: true, jumpPressed: false };
    for (let i = 0; i < 30; i++) walked = step(walked, right, 1 / 60);
    expect(walked.traps.pitCloud.triggered).toBe(false);
    expect(pitCloudRect(walked.traps.pitCloud).y).toBe(LEVEL2_PIT_CLOUD_SKY_Y);
  });

  it("never lets the cloud behave as a solid platform, before or during or after its fall", () => {
    const states = [
      { triggered: false, timer: 0 },
      { triggered: true, timer: 0 },
      { triggered: true, timer: PIT_CLOUD_FALL_DURATION / 2 },
      { triggered: true, timer: PIT_CLOUD_FALL_DURATION },
      { triggered: true, timer: PIT_CLOUD_FALL_DURATION * 10 },
    ];
    const baseline = solidRects(createInitialState(2).traps);
    for (const pitCloud of states) {
      const traps = { ...createInitialState(2).traps, pitCloud };
      const cloud = pitCloudRect(pitCloud);
      const rects = solidRects(traps);

      // The cloud's own footprint is never one of the solid rects, at any
      // point in its fall...
      expect(rects).not.toContainEqual(cloud);
      // ...and the cloud's state has no bearing on solidRects at all — the
      // set of things a player can stand on or bump into is exactly the same
      // whether the cloud is still in the sky, mid-fall, or long settled.
      expect(rects).toEqual(baseline);
    }
  });

  it("jumping over the visible pit triggers the falling cloud", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_PIT.x - PLAYER_W, // right edge exactly at the pit — the obvious place to jump from
      y: GROUND_Y - PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
    };

    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const right: Input = { left: false, right: true, jumpPressed: false };

    state = step(state, rightJump, 1 / 60);
    let frames = 1;
    while (!state.traps.pitCloud.triggered && frames < 30) {
      state = step(state, right, 1 / 60);
      frames++;
    }

    expect(state.traps.pitCloud.triggered).toBe(true);
  });

  it("falls fast once triggered, and the fall kills a player attempting the natural jump over the pit", () => {
    const sky = pitCloudRect({ triggered: true, timer: 0 });
    const midFall = pitCloudRect({
      triggered: true,
      timer: PIT_CLOUD_TELEGRAPH_DELAY + PIT_CLOUD_FALL_DURATION / 2,
    });
    const settled = pitCloudRect({
      triggered: true,
      timer: PIT_CLOUD_TELEGRAPH_DELAY + PIT_CLOUD_FALL_DURATION,
    });

    expect(sky.y).toBe(LEVEL2_PIT_CLOUD_SKY_Y);
    expect(midFall.y).toBeGreaterThan(sky.y);
    expect(midFall.y).toBeLessThan(settled.y);
    expect(settled.y).toBeCloseTo(LEVEL2_PIT_CLOUD_LOW_Y, 5);

    // Fast enough to punish the obvious jump attempt: a full-speed jump
    // launched right at the pit's edge dies to the falling cloud, rather
    // than clearing the gap.
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_PIT.x - PLAYER_W,
      y: GROUND_Y - PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
    };
    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const right: Input = { left: false, right: true, jumpPressed: false };

    state = step(state, rightJump, 1 / 60);
    let frames = 1;
    const maxFrames = 30;
    while (state.phase === "playing" && frames < maxFrames) {
      state = step(state, right, 1 / 60);
      frames++;
    }

    expect(state.traps.pitCloud.triggered).toBe(true);
    expect(state.phase).toBe("dead");
  });

  it("keeps falling all the way past the bottom of the viewport instead of settling inside the pit", () => {
    // The old failure mode: the cloud stopped at GROUND_Y and sat lodged in
    // the narrow pit/gap, permanently blocking it. It must now fall clean
    // through and out of the visible screen area.
    const longSettled = pitCloudRect({
      triggered: true,
      timer: PIT_CLOUD_TELEGRAPH_DELAY + PIT_CLOUD_FALL_DURATION,
    });
    expect(longSettled.y).toBeGreaterThanOrEqual(VIEWPORT_HEIGHT); // top edge is at/below the viewport's bottom
    expect(longSettled.y).not.toBe(GROUND_Y); // not lodged at ground level, inside the pit

    // Holds there — it doesn't bounce back up or wrap once fully fallen.
    const wayLater = pitCloudRect({
      triggered: true,
      timer: PIT_CLOUD_TELEGRAPH_DELAY + PIT_CLOUD_FALL_DURATION * 5,
    });
    expect(wayLater.y).toBeCloseTo(longSettled.y, 5);
  });

  it("does not trigger the falling cloud while the player is nowhere near the pit, even when jumping repeatedly", () => {
    // Retuned to a tight margin around the pit's own span — jumping far back
    // down the level, well outside that zone, must never arm it.
    const jump: Input = { left: false, right: false, jumpPressed: true };
    const hover: Input = { left: false, right: false, jumpPressed: false };

    let state = createInitialState(2);
    state.player = { ...state.player, x: 200, y: GROUND_Y - PLAYER_H, onGround: true };

    for (let hop = 0; hop < 3; hop++) {
      state = step(state, jump, 1 / 60);
      let frames = 1;
      while (!state.player.onGround && frames < 90) {
        state = step(state, hover, 1 / 60);
        frames++;
      }
    }

    expect(state.traps.pitCloud.triggered).toBe(false);
  });

  it("does not trigger the falling cloud from a jump made just outside the trigger zone's edge", () => {
    const jump: Input = { left: false, right: false, jumpPressed: true };
    const hover: Input = { left: false, right: false, jumpPressed: false };

    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_PIT_CLOUD_TRIGGER.x - PLAYER_W - 10,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    state = step(state, jump, 1 / 60);
    let frames = 1;
    while (!state.player.onGround && frames < 90) {
      state = step(state, hover, 1 / 60);
      frames++;
    }

    expect(state.traps.pitCloud.triggered).toBe(false);
  });

  it("triggers the falling cloud once a rising jump is actually made near the pit's own span, not merely approaching it", () => {
    const jump: Input = { left: false, right: false, jumpPressed: true };

    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_PIT_CLOUD_TRIGGER.x + 5,
      y: GROUND_Y - PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
    };

    state = step(state, jump, 1 / 60);
    let frames = 1;
    while (!state.traps.pitCloud.triggered && frames < 10) {
      state = step(state, jump, 1 / 60);
      frames++;
    }

    expect(state.traps.pitCloud.triggered).toBe(true);
  });

  it("stays avoidable with reasonable timing: baiting it early then retreating out of its fall path, waiting, and crossing later survives", () => {
    // The tightened trigger zone still leaves a legitimate way to "spend" the
    // trap safely — the earlier bait-hop-then-walk-up approach no longer
    // works (the zone is too tight to leave any lead), but retreating out
    // from under the cloud's own footprint after baiting it, and waiting for
    // it to fall fully clear, does.
    const jump: Input = { left: false, right: false, jumpPressed: true };
    const left: Input = { left: true, right: false, jumpPressed: false };
    const hover: Input = { left: false, right: false, jumpPressed: false };
    const right: Input = { left: false, right: true, jumpPressed: false };
    const rightJump: Input = { left: false, right: true, jumpPressed: true };

    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_PIT_CLOUD_TRIGGER.x + 2,
      y: GROUND_Y - PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
    };

    // Bait it, then retreat left — out from under the cloud's horizontal
    // footprint — instead of hovering in place beneath it.
    state = step(state, jump, 1 / 60);
    let frames = 1;
    while (!state.player.onGround && frames < 90) {
      state = step(state, left, 1 / 60);
      frames++;
    }
    expect(state.traps.pitCloud.triggered).toBe(true);
    expect(state.phase).toBe("playing");

    // Wait clear of the telegraph delay plus the full fall duration.
    for (let i = 0; i < 60 && state.phase === "playing"; i++) {
      state = step(state, hover, 1 / 60);
    }
    expect(state.phase).toBe("playing");

    // Walk back up to the pit's edge, then make the real jump.
    let approachFrames = 0;
    while (state.player.x < LEVEL2_PIT.x - PLAYER_W && state.phase === "playing" && approachFrames < 400) {
      state = step(state, right, 1 / 60);
      approachFrames++;
    }
    expect(state.phase).toBe("playing");

    state = step(state, rightJump, 1 / 60);
    let crossFrames = 1;
    while (state.phase === "playing" && state.player.x < LEVEL2_PIT.x + LEVEL2_PIT.w && crossFrames < 90) {
      state = step(state, right, 1 / 60);
      crossFrames++;
    }

    expect(state.phase).toBe("playing"); // cleared the pit safely
  });

  it("resets the pit cloud trap to its untriggered, sky-high state on death and respawn", () => {
    let state = createInitialState(2);
    state.traps.pitCloud = { triggered: true, timer: 1.7 };
    state.player = { ...state.player, x: 400, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");

    const maxFrames = Math.ceil(RESPAWN_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (state.phase === "dead" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("playing");
    expect(state.traps.pitCloud).toEqual({ triggered: false, timer: 0 });
    expect(pitCloudRect(state.traps.pitCloud).y).toBe(LEVEL2_PIT_CLOUD_SKY_Y);
  });

  it("resets the pit cloud trap when Level 2 is recreated outright", () => {
    const state = createInitialState(2);
    expect(state.traps.pitCloud).toEqual({ triggered: false, timer: 0 });
  });

  it("leaves the fake door untriggered while the player is still nowhere near it", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR.x - 200,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.fakeDoor.triggered).toBe(false);
    expect(next.phase).toBe("playing");
  });

  it("does not reveal the fake door while the player is still well outside the close-range trigger", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR_REVEAL_TRIGGER.x - PLAYER_W - 1,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.fakeDoor.triggered).toBe(false);
    expect(next.phase).toBe("playing");
  });

  it("baiting the fake door by getting close reveals it (and the real door) safely, without killing the player", () => {
    // Getting close enough to bait the reveal is not the same as touching the
    // door itself — this is what lets the player intentionally approach the
    // fake door without dying, unlike the lethal contact check below.
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR_REVEAL_TRIGGER.x + 5,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.fakeDoor.triggered).toBe(true);
    expect(next.phase).toBe("playing");
  });

  it("kills the player on contact with the fake door once it has transformed, same as a spike", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("dead");
  });

  it("walking the whole way in: reveals the fake door on approach, then kills the player once they actually walk into it", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR_REVEAL_TRIGGER.x - PLAYER_W - 20,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };
    const right: Input = { left: false, right: true, jumpPressed: false };

    let frames = 0;
    const maxFrames = 120;
    while (state.phase === "playing" && !state.traps.fakeDoor.triggered && frames < maxFrames) {
      state = step(state, right, 1 / 60);
      frames++;
    }
    expect(state.traps.fakeDoor.triggered).toBe(true);
    expect(state.phase).toBe("playing"); // revealed by proximity, not killed yet

    while (state.phase === "playing" && frames < maxFrames) {
      state = step(state, right, 1 / 60);
      frames++;
    }
    expect(state.phase).toBe("dead");
  });

  it("no longer blocks the player physically at the fake door once it has transformed", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    expect(solidRects(state.traps)).not.toContainEqual({ ...LEVEL2_FAKE_DOOR, y: 0, h: GROUND_Y });
  });

  it("plays a short door-entry animation before winning at the real door, once the fake door has been revealed", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    state.player = {
      ...state.player,
      x: LEVEL2_REAL_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    let next = step(state, noInput, 1 / 60);
    expect(next.phase).toBe("entering"); // not complete yet — the entry animation is playing

    const maxFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (next.phase === "entering" && frames < maxFrames) {
      next = step(next, noInput, 1 / 60);
      frames++;
    }

    expect(next.phase).toBe("complete");
  });

  it("stays on level 2 and never attempts to load a level 3 once the game is complete", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    state.player = {
      ...state.player,
      x: LEVEL2_REAL_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    let next = step(state, noInput, 1 / 60);
    const maxFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (next.phase === "entering" && frames < maxFrames) {
      next = step(next, noInput, 1 / 60);
      frames++;
    }
    expect(next.phase).toBe("complete");
    // Level is a 1 | 2 union — there is no level 3 value this could ever hold,
    // and the "complete" phase is exactly what stands in for one.
    expect(next.level).toBe(2);

    // Further frames — even with movement/jump input held — must not advance
    // gameplay any further: no level change, no phase change, no physics.
    const held: Input = { left: true, right: false, jumpPressed: true };
    for (let i = 0; i < 120; i++) {
      next = step(next, held, 1 / 60);
    }
    expect(next.phase).toBe("complete");
    expect(next.level).toBe(2);
    expect(next.player.x).toBe(LEVEL2_REAL_DOOR.x);
  });

  it("does not open the real door for a player who has never baited the fake door into revealing it", () => {
    // The real door sits on the same continuous ground segment as spawn, so
    // without this gate a player could walk straight to it and win while
    // skipping the fake-door section (and everything behind it) entirely.
    // It also stays visually hidden until revealed — see spec/render.test.ts.
    const state = createInitialState(2);
    expect(state.traps.fakeDoor.triggered).toBe(false);
    state.player = {
      ...state.player,
      x: LEVEL2_REAL_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("playing");
  });

  it("auto-respawns to playing after the death animation, without re-announcing the level", () => {
    let state = createInitialState(2);
    state.player = { ...state.player, x: 400, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");

    const maxFrames = Math.ceil(RESPAWN_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (state.phase === "dead" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("playing");
    expect(state.level).toBe(2);
    expect(state.player.x).toBe(LEVEL2_SPAWN.x);
    expect(state.banner).toBeNull();
  });

  it("resets every one-life trap after death and respawn, not just whichever one killed the player", () => {
    let state = createInitialState(2);
    state.traps = {
      collapse: { triggered: true, timer: 0.3 },
      spikes: { triggered: true, timer: 1 },
      fakeDoor: { triggered: true, timer: 0 },
      platform: { triggered: true, timer: 0.1 },
      chasmPlatform: { triggered: true, timer: 0.9 },
      pitCloud: { triggered: true, timer: 0.9 },
    };
    state.player = { ...state.player, x: 400, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");

    const maxFrames = Math.ceil(RESPAWN_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (state.phase === "dead" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("playing");
    for (const trap of Object.values(state.traps)) {
      expect(trap.triggered).toBe(false);
      expect(trap.timer).toBe(0);
    }
  });
});

describe("death count tracking", () => {
  function respawn(state: GameState): GameState {
    const maxFrames = Math.ceil(RESPAWN_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (state.phase === "dead" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }
    return state;
  }

  it("starts a fresh run at zero deaths", () => {
    expect(createInitialState(1).deaths).toBe(0);
    expect(createInitialState(2).deaths).toBe(0);
  });

  it("increments by exactly one on a level 1 death, not once per frame while dead", () => {
    let state = createInitialState(1);
    state.player = { ...state.player, x: 420, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");
    expect(state.deaths).toBe(1);

    // Keep stepping through the rest of the death animation — the count must
    // not creep up again before the respawn actually happens.
    for (let i = 0; i < 5 && state.phase === "dead"; i++) {
      state = step(state, noInput, 1 / 60);
      expect(state.deaths).toBe(1);
    }
  });

  it("increments by exactly one on a level 2 death, not once per frame while dead", () => {
    let state = createInitialState(2);
    state.player = { ...state.player, x: 400, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");
    expect(state.deaths).toBe(1);

    for (let i = 0; i < 5 && state.phase === "dead"; i++) {
      state = step(state, noInput, 1 / 60);
      expect(state.deaths).toBe(1);
    }
  });

  it("persists the death count across a respawn", () => {
    let state = createInitialState(1);
    state.player = { ...state.player, x: 420, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.deaths).toBe(1);

    state = respawn(state);

    expect(state.phase).toBe("playing");
    expect(state.deaths).toBe(1);
  });

  it("persists the death count from level 1 into level 2", () => {
    let state = createInitialState(1);
    // Die once on level 1, respawn, then reach the goal.
    state.player = { ...state.player, x: 420, y: DEATH_Y + 1, onGround: false };
    state = step(state, noInput, 1 / 60);
    state = respawn(state);
    expect(state.deaths).toBe(1);

    state.player = { ...state.player, x: LEVEL1_GOAL.x, y: GROUND_Y - PLAYER_H, onGround: true };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("entering");

    const maxFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (state.phase === "entering" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }

    expect(state.level).toBe(2);
    expect(state.phase).toBe("playing");
    expect(state.deaths).toBe(1);
  });

  it("resets the death count to zero once the game is fully cleared", () => {
    let state = createInitialState(2);
    state.deaths = 3;
    state.player = {
      ...state.player,
      x: LEVEL2_REAL_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };
    state.traps.fakeDoor = { triggered: true, timer: 0 };

    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("entering");

    const maxFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (state.phase === "entering" && frames < maxFrames) {
      state = step(state, noInput, 1 / 60);
      frames++;
    }

    expect(state.phase).toBe("complete");
    expect(state.deaths).toBe(0);
  });

  it("resets to zero on a fresh createInitialState call, covering restart and level-select", () => {
    // main.ts's restartTo() and the level-select flow both call
    // createInitialState(level) with no opts — the default deaths:0 covers
    // both "restart from level 1" and "manually pick a level" resets.
    expect(createInitialState(1).deaths).toBe(0);
    expect(createInitialState(2).deaths).toBe(0);
  });
});

describe("play can be lost", () => {
  it("repairs the old leftover terrain into one continuous ground segment, no island or gap", () => {
    // The old layout left a fragment ending at 1900, a 10px island at
    // 1970-1980, and a segment resuming at 2050 — a visible "something used
    // to be here" seam. It must now be one unbroken segment underneath.
    const covering = LEVEL2_GROUND_SEGMENTS.find(
      (seg) => seg.y === GROUND_Y && seg.x <= 1970 && seg.x + seg.w >= 2050,
    );
    expect(covering, "no continuous ground segment spans the old hole/island location").toBeTruthy();
  });

  it("keeps the fence and both chasm platforms present while untriggered, regardless of other trap state", () => {
    const untouched = solidRects(createInitialState(2).traps);
    const midCollapse = solidRects({
      collapse: { triggered: true, timer: 0 },
      spikes: { triggered: false, timer: 0 },
      fakeDoor: { triggered: true, timer: 0 },
      platform: { triggered: false, timer: 0 },
      chasmPlatform: { triggered: false, timer: 0 },
      pitCloud: { triggered: false, timer: 0 },
    });

    for (const rects of [untouched, midCollapse]) {
      expect(rects).toContainEqual(LEVEL2_FENCE);
      expect(rects).toContainEqual(LEVEL2_CHASM_1);
      expect(rects).toContainEqual(LEVEL2_CHASM_2);
    }
  });

  it("never moves the fence's resting position, no matter what state the chasm platform trap is in", () => {
    const baseTraps = {
      collapse: { triggered: false, timer: 0 },
      spikes: { triggered: false, timer: 0 },
      fakeDoor: { triggered: false, timer: 0 },
      platform: { triggered: false, timer: 0 },
      pitCloud: { triggered: false, timer: 0 },
    };
    const chasmPlatformStates = [
      { triggered: false, timer: 0 }, // before activation
      { triggered: true, timer: 0 }, // just triggered, snapped away
      { triggered: true, timer: MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION / 2 }, // mid-glide
      { triggered: true, timer: MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION }, // settled
    ];

    for (const chasmPlatform of chasmPlatformStates) {
      const rects = solidRects({ ...baseTraps, chasmPlatform });
      expect(rects).toContainEqual(LEVEL2_FENCE);
    }
  });

  it("places the fence on the map from the start, stationary, and solid like an ordinary obstacle", () => {
    const state = createInitialState(2);
    expect(state.traps.platform).toEqual({ triggered: false, timer: 0 });
    expect(fenceRect(state.traps.platform)).toEqual(LEVEL2_FENCE);
    expect(solidRects(state.traps)).toContainEqual(LEVEL2_FENCE);
  });

  it("does not arm the fence chase just from approaching it", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FENCE.x - 200,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.platform.triggered).toBe(false);
  });

  it("does not arm the fence chase from clearing it but landing short of the trigger zone", () => {
    const state = createInitialState(2);
    // Just past the fence's own footprint, but not yet into
    // LEVEL2_FENCE_TRIGGER — a jump that clears the fence without going a
    // further short distance past it.
    state.player = {
      ...state.player,
      x: LEVEL2_FENCE_TRIGGER.x - PLAYER_W - 1,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.platform.triggered).toBe(false);
  });

  it("arms the fence chase once the player has jumped over it and passed a short distance beyond", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FENCE_TRIGGER.x + 10,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.platform.triggered).toBe(true);
  });

  it("removes the fence from solid ground once its chase is triggered", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FENCE_TRIGGER.x + 10,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };
    state = step(state, noInput, 1 / 60);
    expect(state.traps.platform.triggered).toBe(true);
    expect(solidRects(state.traps)).not.toContainEqual(LEVEL2_FENCE);
  });

  it("moves the triggered fence to the right faster than the player's own move speed, capped at a chase distance", () => {
    expect(FENCE_CHASE_SPEED).toBeGreaterThan(MOVE_SPEED);

    const midChase = fenceRect({ triggered: true, timer: 0.2 });
    expect(midChase.x).toBe(LEVEL2_FENCE.x + FENCE_CHASE_SPEED * 0.2);

    const longAfter = fenceRect({ triggered: true, timer: 999 });
    expect(longAfter.x).toBe(LEVEL2_FENCE.x + FENCE_CHASE_DISTANCE);
  });

  it("does not hurt the player while untriggered, even standing right beside it", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FENCE.x - PLAYER_W,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("playing");
  });

  it("kills the player on contact with the moving fence once triggered", () => {
    const state = createInitialState(2);
    state.traps.platform = { triggered: true, timer: 0.1 };
    const chasing = fenceRect(state.traps.platform);
    state.player = {
      ...state.player,
      x: chasing.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("dead");
  });

  it("resets the fence to its original position and inactive state on death/respawn", () => {
    let state = createInitialState(2);
    state.traps.platform = { triggered: true, timer: 0.2 };
    state.player = { ...state.player, y: DEATH_Y + 1, onGround: false };

    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");

    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 1; i++) {
      state = step(state, noInput, 1 / 60);
    }

    expect(state.phase).toBe("playing");
    expect(state.traps.platform).toEqual({ triggered: false, timer: 0 });
    expect(fenceRect(state.traps.platform)).toEqual(LEVEL2_FENCE);
  });

  it("does not arm the chasm platform merely from resting at CHASM_1's far edge", () => {
    const state = createInitialState(2);
    // Resting right at CHASM_1's rightmost point — this is what "before
    // activation, the platform looks exactly normal" has to hold against,
    // since it's the natural spot to stand and size up the jump.
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_1.x + LEVEL2_CHASM_1.w - PLAYER_W,
      y: LEVEL2_CHASM_1.y - PLAYER_H,
      vy: 0,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.chasmPlatform.triggered).toBe(false);
    expect(chasmPlatformRect(next.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);
  });

  it("arms the chasm platform on a genuine attempt to cross into the gap beyond CHASM_1, and it looks untouched right up until then", () => {
    const state = createInitialState(2);
    expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);

    // Just past CHASM_1's right edge, airborne over the gap — a genuine
    // attempt to reach the platform beyond, not merely standing on CHASM_1.
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_2_TRIGGER.x + 5,
      y: LEVEL2_CHASM_1.y - 60,
      vy: -200,
      onGround: false,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.traps.chasmPlatform.triggered).toBe(true);
  });

  it("suddenly displaces the platform once triggered, then glides it back, then leaves it permanently in place", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_2_TRIGGER.x + 5,
      y: LEVEL2_CHASM_1.y - 60,
      vy: -200,
      onGround: false,
    };
    state = step(state, noInput, 1 / 60);
    expect(state.traps.chasmPlatform.triggered).toBe(true);

    // Immediately after triggering, it has snapped away — far enough that the
    // jump that expected to land on it now lands on nothing.
    expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual({
      ...LEVEL2_CHASM_2,
      x: LEVEL2_CHASM_2.x + MOVING_PLATFORM_SHIFT_DISTANCE,
    });

    // Mid-way through its glide back it's somewhere in between.
    state.traps.chasmPlatform.timer = MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION / 2;
    const mid = chasmPlatformRect(state.traps.chasmPlatform);
    expect(mid.x).toBeGreaterThan(LEVEL2_CHASM_2.x);
    expect(mid.x).toBeLessThan(LEVEL2_CHASM_2.x + MOVING_PLATFORM_SHIFT_DISTANCE);

    // Once the return has fully elapsed, it's back exactly where it started —
    // permanently, since triggered only ever flips on once.
    state.traps.chasmPlatform.timer = MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION;
    expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);

    const next = step(state, noInput, 1 / 60);
    expect(next.traps.chasmPlatform.triggered).toBe(true); // never re-arms
  });

  it("does not move again if a fresh attempt re-overlaps the trigger zone in the same life", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_2_TRIGGER.x + 5,
      y: LEVEL2_CHASM_1.y - 60,
      vy: -200,
      onGround: false,
    };
    state = step(state, noInput, 1 / 60);
    expect(state.traps.chasmPlatform.triggered).toBe(true);

    // Let it fully glide back and settle.
    state.traps.chasmPlatform.timer = MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION;
    expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);

    // A second genuine attempt through the exact same trigger zone, still
    // within the same life, must not displace it again.
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_2_TRIGGER.x + 5,
      y: LEVEL2_CHASM_1.y - 60,
      vy: -200,
      onGround: false,
    };
    const next = step(state, noInput, 1 / 60);
    expect(chasmPlatformRect(next.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);
  });

  it("resets the chasm platform trap, and its position, after death and respawn — then arms fresh on the next approach", () => {
    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_2_TRIGGER.x + 5,
      y: LEVEL2_CHASM_1.y - 60,
      vy: -200,
      onGround: false,
    };
    state = step(state, noInput, 1 / 60);
    expect(state.traps.chasmPlatform.triggered).toBe(true);

    // Fall to death (the chasm has nothing underneath) and let the death
    // animation finish so the level auto-respawns.
    state.player = { ...state.player, y: DEATH_Y + 1, vy: 300, onGround: false };
    state = step(state, noInput, 1 / 60);
    expect(state.phase).toBe("dead");

    const maxRespawnFrames = Math.ceil(RESPAWN_DELAY / (1 / 60)) + 2;
    let respawnFrames = 0;
    while (state.phase === "dead" && respawnFrames < maxRespawnFrames) {
      state = step(state, noInput, 1 / 60);
      respawnFrames++;
    }

    expect(state.phase).toBe("playing");
    // Reset like every other trap — not carried over from the life that died.
    expect(state.traps.chasmPlatform).toEqual({ triggered: false, timer: 0 });
    expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);

    // The next genuine attempt triggers it again, exactly like a brand new
    // life's first attempt.
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_2_TRIGGER.x + 5,
      y: LEVEL2_CHASM_1.y - 60,
      vy: -200,
      onGround: false,
    };
    const next = step(state, noInput, 1 / 60);
    expect(next.traps.chasmPlatform.triggered).toBe(true);
  });

  it("cannot be landed on via a full-speed jump held all the way across, once it has moved", () => {
    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const right: Input = { left: false, right: true, jumpPressed: false };

    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_1.x + LEVEL2_CHASM_1.w - PLAYER_W, // far right edge of CHASM_1
      y: LEVEL2_CHASM_1.y - PLAYER_H,
      onGround: true,
    };

    state = step(state, rightJump, 1 / 60);
    let frames = 1;
    const maxFrames = 120;
    while (state.phase === "playing" && frames < maxFrames) {
      state = step(state, right, 1 / 60);
      frames++;
    }

    expect(state.traps.chasmPlatform.triggered).toBe(true);
    expect(state.phase).toBe("dead"); // the platform moved away before this jump could land
  });

  it("baits the trap: releasing right the instant it fires drops the player safely back onto CHASM_1", () => {
    const rightJump: Input = { left: false, right: true, jumpPressed: true };
    const right: Input = { left: false, right: true, jumpPressed: false };
    const hover: Input = { left: false, right: false, jumpPressed: false };

    let state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_CHASM_1.x + LEVEL2_CHASM_1.w - PLAYER_W, // far right edge of CHASM_1
      y: LEVEL2_CHASM_1.y - PLAYER_H,
      onGround: true,
    };

    // Jump right; the trigger fires almost immediately, while still hanging
    // over CHASM_1's own footprint.
    state = step(state, rightJump, 1 / 60);
    let armFrames = 0;
    while (state.phase === "playing" && !state.traps.chasmPlatform.triggered && armFrames < 30) {
      state = step(state, right, 1 / 60);
      armFrames++;
    }
    expect(state.traps.chasmPlatform.triggered).toBe(true);

    // Release right the moment it fires — no steering needed, just letting
    // go — and gravity carries the player straight back down onto CHASM_1.
    let fallFrames = 0;
    while (state.phase === "playing" && !state.player.onGround && fallFrames < 90) {
      state = step(state, hover, 1 / 60);
      fallFrames++;
    }

    expect(state.phase).toBe("playing");
    expect(state.player.onGround).toBe(true);
    // Landed back on CHASM_1 specifically (the only solid ground anywhere
    // near this drop), not fallen into the gap.
    expect(state.player.x).toBeLessThan(LEVEL2_CHASM_1.x + LEVEL2_CHASM_1.w);
    expect(state.player.x + PLAYER_W).toBeGreaterThan(LEVEL2_CHASM_1.x);
  });

  it("also resets the chasm platform trap when the level is recreated outright", () => {
    const state: GameState = {
      ...createInitialState(2),
      traps: {
        ...createInitialState(2).traps,
        chasmPlatform: { triggered: true, timer: MOVING_PLATFORM_SHIFT_DELAY },
      },
    };
    expect(state.traps.chasmPlatform.triggered).toBe(true);

    const recreated = createInitialState(2);
    expect(recreated.traps.chasmPlatform).toEqual({ triggered: false, timer: 0 });
    expect(chasmPlatformRect(recreated.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);
  });

  // A full scripted run over just the new content (fence, chasm, backtrack),
  // starting a bit past the pre-existing collapse tile and spike zone — those
  // hazards already have their own dedicated tests above and aren't part of
  // this rework; isolating this run to the new terrain is what actually
  // proves "every new jump is reachable" against the real engine, without
  // re-litigating unrelated hazard timing.
  it("jumps the fence, crosses the chasm, triggers the fake door, and wins via the real door on the backtrack", () => {
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

    const crossFenceAndChasm1 = () => {
      run(right, 6);
      hop("right", 18); // over the fence, landing clear on the far side — short of the trigger zone, so the chase isn't armed yet
      expect(state.phase).toBe("playing");
      expect(state.traps.platform.triggered).toBe(false);

      run(right, 75); // into the trigger zone and on toward the chasm edge — arms the chase partway through, but the head start plus the chase's own distance cap keep it from ever closing the gap
      expect(state.phase).toBe("playing");
      expect(state.traps.platform.triggered).toBe(true);

      hop("right", 20); // onto CHASM_1 — permanently safe
      expect(state.phase).toBe("playing");
    };

    crossFenceAndChasm1();

    // First genuine attempt to land on CHASM_2: the trap fires, the platform
    // snaps away mid-air, and — unlike the staircase — there's nothing but
    // open chasm underneath, so this first attempt is an unavoidable death.
    hop("right", 38);
    expect(state.traps.chasmPlatform.triggered).toBe(true);
    expect(state.phase).toBe("dead");

    // Let the death animation finish and the level auto-respawn. Every trap —
    // including the chasm platform — resets with the rest of the level: the
    // moving-platform trick is one-time only per life, not globally, so this
    // new life gets its own first genuine try at it.
    const maxRespawnFrames = Math.ceil(RESPAWN_DELAY / (1 / 60)) + 5;
    let respawnFrames = 0;
    while (state.phase === "dead" && respawnFrames < maxRespawnFrames) {
      state = step(state, hover, 1 / 60);
      respawnFrames++;
    }
    expect(state.phase).toBe("playing");
    expect(state.traps.chasmPlatform).toEqual({ triggered: false, timer: 0 });
    expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);

    // Re-cross the earlier hazards exactly as the first time.
    state.player = { ...state.player, x: 1650, y: GROUND_Y - PLAYER_H, onGround: true, vx: 0, vy: 0 };
    crossFenceAndChasm1();

    // The trap is fresh again this life. A full-speed jump held all the way
    // across no longer survives — the platform now moves far enough away
    // that this just runs into the far ground's near wall mid-fall and drops
    // into the chasm. The intended route baits the trigger first: jump
    // right, and it fires almost immediately, while still hanging over
    // CHASM_1's own footprint — releasing "right" the instant it fires drops
    // the player straight back down onto CHASM_1, safely, with the platform
    // now away and gliding back.
    run(rightJump, 1);
    {
      let i = 0;
      while (state.phase === "playing" && !state.traps.chasmPlatform.triggered && i < 30) {
        state = step(state, right, 1 / 60);
        i++;
      }
    }
    expect(state.traps.chasmPlatform.triggered).toBe(true); // triggered fresh, this life
    {
      let i = 0;
      while (state.phase === "playing" && !state.player.onGround && i < 90) {
        state = step(state, hover, 1 / 60);
        i++;
      }
    }
    expect(state.phase).toBe("playing"); // baited it, then fell straight back onto CHASM_1

    // Wait for the platform to finish its glide back and settle before
    // crossing for real.
    {
      const maxSettleFrames =
        Math.ceil((MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION) / (1 / 60)) + 5;
      let i = 0;
      while (
        state.phase === "playing" &&
        chasmPlatformRect(state.traps.chasmPlatform).x !== LEVEL2_CHASM_2.x &&
        i < maxSettleFrames
      ) {
        state = step(state, hover, 1 / 60);
        i++;
      }
      expect(chasmPlatformRect(state.traps.chasmPlatform)).toEqual(LEVEL2_CHASM_2);
    }

    hop("right", 20); // now cross for real, onto the settled platform
    expect(state.phase).toBe("playing");

    hop("right", 12); // off CHASM_2 onto the final ground segment
    expect(state.phase).toBe("playing");

    // Walk toward the fake door but stop short of actually touching it: close
    // range bait-reveals it (and the real door behind it) safely, well before
    // contact would actually be lethal.
    let approachFrames = 0;
    while (
      state.phase === "playing" &&
      state.player.x + PLAYER_W < LEVEL2_FAKE_DOOR.x - 4 &&
      approachFrames < 300
    ) {
      state = step(state, right, 1 / 60);
      approachFrames++;
    }
    expect(state.traps.fakeDoor.triggered).toBe(true);
    expect(state.phase).toBe("playing");

    // Backtrack across the same chasm platforms to the real door.
    run(left, 12);
    hop("left", 28); // back onto CHASM_2
    expect(state.phase).toBe("playing");
    run(left, 4);
    hop("left", 30); // back onto CHASM_1
    expect(state.phase).toBe("playing");
    run(left, 4);
    hop("left", 21); // back across the real door
    expect(state.phase).toBe("entering"); // not complete yet — the entry animation is playing

    const maxEnterFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let enterFrames = 0;
    while (state.phase === "entering" && enterFrames < maxEnterFrames) {
      state = step(state, left, 1 / 60);
      enterFrames++;
    }

    expect(state.phase).toBe("complete");
  });
});
