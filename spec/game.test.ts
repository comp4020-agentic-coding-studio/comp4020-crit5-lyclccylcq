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
  LEVEL2_COLLAPSE_TILE,
  LEVEL2_COLLAPSE_TRIGGER,
  LEVEL2_FAKE_DOOR,
  LEVEL2_FAKE_DOOR_TRIGGER,
  LEVEL2_REAL_DOOR,
  LEVEL2_SPIKE_TRIGGER,
  LEVEL2_SPIKE_ZONE,
  LEVEL2_STEP_1,
  LEVEL2_STEP_2,
  LEVEL2_STEP_3,
  LEVEL2_CHASM_1,
  LEVEL2_CHASM_2,
  PLATFORM_BREAK_DELAY,
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
} from "../game/engine.ts";
import type { GameState, Input } from "../game/engine.ts";

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

  it("moves the spike hazard left, leaving clear room to approach the staircase after it", () => {
    // Previously the zone started at x=1560, hard up against STEP_1 at 1680.
    expect(LEVEL2_SPIKE_ZONE.x).toBeLessThan(1560);
    expect(LEVEL2_SPIKE_TRIGGER.x).toBeLessThan(1380);

    const gapToStaircase = LEVEL2_STEP_1.x - (LEVEL2_SPIKE_ZONE.x + LEVEL2_SPIKE_ZONE.w);
    expect(gapToStaircase).toBeGreaterThanOrEqual(100); // enough room to land and line up the climb
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

  it("does not treat an untriggered fake door as any kind of hazard", () => {
    const state = createInitialState(2);
    state.player = {
      ...state.player,
      x: LEVEL2_FAKE_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    const next = step(state, noInput, 1 / 60);

    expect(next.phase).toBe("playing");
  });

  it("no longer blocks the player physically at the fake door once it has transformed", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    expect(solidRects(state.traps)).not.toContainEqual({ ...LEVEL2_FAKE_DOOR, y: 0, h: GROUND_Y });
  });

  it("plays a short door-entry animation before winning at the real door", () => {
    const state = createInitialState(2);
    state.traps.fakeDoor = { triggered: true, timer: 0 };
    state.player = {
      ...state.player,
      x: LEVEL2_REAL_DOOR.x,
      y: GROUND_Y - PLAYER_H,
      onGround: true,
    };

    let next = step(state, noInput, 1 / 60);
    expect(next.phase).toBe("entering"); // not won yet — the entry animation is playing

    const maxFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let frames = 0;
    while (next.phase === "entering" && frames < maxFrames) {
      next = step(next, noInput, 1 / 60);
      frames++;
    }

    expect(next.phase).toBe("won");
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
      chasmPlatform: { triggered: false, timer: 0 },
    });

    for (const rects of [untouched, midCollapse]) {
      expect(rects).toContainEqual(LEVEL2_STEP_1);
      expect(rects).toContainEqual(LEVEL2_STEP_2);
      expect(rects).toContainEqual(LEVEL2_CHASM_1);
      expect(rects).toContainEqual(LEVEL2_CHASM_2);
    }
  });

  it("never moves the left staircase steps, no matter what state the chasm platform trap is in", () => {
    const baseTraps = {
      collapse: { triggered: false, timer: 0 },
      hiddenBlock: { triggered: false, timer: 0 },
      spikes: { triggered: false, timer: 0 },
      fakeDoor: { triggered: false, timer: 0 },
      platform: { triggered: false, timer: 0 },
    };
    const chasmPlatformStates = [
      { triggered: false, timer: 0 }, // before activation
      { triggered: true, timer: 0 }, // just triggered, snapped away
      { triggered: true, timer: MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION / 2 }, // mid-glide
      { triggered: true, timer: MOVING_PLATFORM_SHIFT_DELAY + MOVING_PLATFORM_RETURN_DURATION }, // settled
    ];

    for (const chasmPlatform of chasmPlatformStates) {
      const rects = solidRects({ ...baseTraps, chasmPlatform });
      expect(rects).toContainEqual(LEVEL2_STEP_1);
      expect(rects).toContainEqual(LEVEL2_STEP_2);
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

    const crossStaircaseAndChasm1 = () => {
      run(right, 6);
      hop("right", 10); // onto STEP_1 — permanently static, never moves
      expect(state.phase).toBe("playing");

      run(right, 10);
      hop("right", 10); // onto STEP_2 — also permanently static, a plain landing
      expect(state.phase).toBe("playing");

      run(right, 14);
      hop("right", 8); // onto STEP_3 — the breakable platform, arms on landing
      expect(state.phase).toBe("playing");
      expect(state.traps.platform.triggered).toBe(true);

      run(right, 7);
      run(right, 32); // off the staircase, across the base ground to the chasm edge
      hop("right", 20); // onto CHASM_1 — permanently safe
      expect(state.phase).toBe("playing");
    };

    crossStaircaseAndChasm1();

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
    crossStaircaseAndChasm1();

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

    // Walk toward the fake door — arming it slams it shut — but stop short of
    // actually touching it: it's lethal on contact now, like a spike, not a
    // wall to be stopped by.
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
    expect(state.phase).toBe("entering"); // not won yet — the entry animation is playing

    const maxEnterFrames = Math.ceil(DOOR_ENTER_DELAY / (1 / 60)) + 2;
    let enterFrames = 0;
    while (state.phase === "entering" && enterFrames < maxEnterFrames) {
      state = step(state, left, 1 / 60);
      enterFrames++;
    }

    expect(state.phase).toBe("won");
  });
});
