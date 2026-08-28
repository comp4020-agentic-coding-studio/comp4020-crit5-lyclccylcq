// Pure game rules — no DOM, no canvas, so this module is testable on its own.
// Rendering lives in render.ts; input/loop wiring lives in main.ts.

export const GRAVITY = 1800;
export const MOVE_SPEED = 220;
export const JUMP_VELOCITY = -620;
export const MAX_FALL_SPEED = 900;

export const PLAYER_W = 28;
export const PLAYER_H = 32;

export const GROUND_Y = 300;
// Falling this far below the ground line means the player missed every
// platform on the way down — a death, not a landing.
export const DEATH_Y = GROUND_Y + 220;

export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 360;

// A collapsing tile gives way this long after the player lands on it.
export const COLLAPSE_DELAY = 0.35;
// Popup spikes rise this long after the player enters their trigger zone.
export const SPIKE_DELAY = 0.45;
// A breakable platform gives way this long after the player lands on it.
export const PLATFORM_BREAK_DELAY = 0.25;

export type Phase = "playing" | "dead" | "won";
export type Level = 1 | 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Input {
  left: boolean;
  right: boolean;
  /** Edge-triggered: true only on the frame the jump key went down. */
  jumpPressed: boolean;
}

export interface TrapRuntime {
  triggered: boolean;
  timer: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
}

export interface Traps {
  collapse: TrapRuntime;
  hiddenBlock: TrapRuntime;
  spikes: TrapRuntime;
  fakeDoor: TrapRuntime;
  platform: TrapRuntime;
}

// Shared footprint for every door in the game — Level 1's honest exit, and
// both the bait and the real exit in Level 2 — so all three read as the same
// kind of object before anything has happened.
const DOOR_W = 36;
const DOOR_H = 72;

export interface GameState {
  phase: Phase;
  level: Level;
  player: Player;
  traps: Traps;
}

// --- Level 1: the honest teaching level -------------------------------------
// Every hazard here is visible on sight, with no trigger and no timer. This
// level exists to teach the normal rules of the game — floor is safe, a gap
// needs a jump, a spike is a spike — entirely through fair play, so Level 2
// can later break those same rules without ever having lied first.

export const LEVEL1_WIDTH = 1400;
export const LEVEL1_SPAWN = { x: 60, y: GROUND_Y - PLAYER_H };

export const LEVEL1_GROUND_SEGMENTS: Rect[] = [
  { x: 0, y: GROUND_Y, w: 400, h: 400 }, // wide, safe starting platform
  { x: 470, y: GROUND_Y, w: 430, h: 400 }, // gap 400-470 (70px)
  { x: 1000, y: GROUND_Y, w: 400, h: 400 }, // gap 900-1000 (100px, the longer jump)
];

// A plain, always-lethal hazard: no TrapRuntime, no arming, no delay. That
// structural difference is what makes this a genuinely different hazard kind
// from Level 2's popup spikes, not just a different name for the same thing.
export const LEVEL1_SPIKE_HAZARD: Rect = { x: 680, y: GROUND_Y - 18, w: 80, h: 18 };

export const LEVEL1_GOAL: Rect = { x: 1260, y: GROUND_Y - DOOR_H, w: DOOR_W, h: DOOR_H };

// --- Level 2: the trick level ------------------------------------------------
// Same visual language as Level 1, but from here the game is allowed to
// betray what Level 1 just taught. Ground is a row of segments at GROUND_Y.
// One gap is an ordinary jump, unrelated to the traps below. The collapsing
// tile and the fake-goal tile fill the remaining two gaps in the row and
// vanish once triggered, which dumps the player straight into a fall — the
// generic "off the bottom" death rule handles that without any trap-specific
// death logic.

export const LEVEL2_WIDTH = 2800;
export const LEVEL2_SPAWN = { x: 60, y: GROUND_Y - PLAYER_H };

export const LEVEL2_GROUND_SEGMENTS: Rect[] = [
  { x: 0, y: GROUND_Y, w: 380, h: 400 },
  { x: 450, y: GROUND_Y, w: 190, h: 400 },
  { x: 710, y: GROUND_Y, w: 670, h: 400 },
  { x: 1380, y: GROUND_Y, w: 770, h: 400 }, // carries the staircase and the real door
  { x: 2570, y: GROUND_Y, w: 230, h: 400 }, // carries both doors; 2150-2570 is the chasm
];

// A short ascending staircase: each step is a comfortable +40 relative climb,
// blocking its full vertical column like ordinary ground. The top step
// (LEVEL2_STEP_3) is the one deceptive breakable platform — see part 4 below.
export const LEVEL2_STEP_1: Rect = { x: 1680, y: GROUND_Y - 40, w: 90, h: 400 };
export const LEVEL2_STEP_2: Rect = { x: 1770, y: GROUND_Y - 80, w: 130, h: 400 };
export const LEVEL2_STEP_3: Rect = { x: 1900, y: GROUND_Y - 120, w: 70, h: 400 };

// A row of thin floating platforms crossing the chasm at 2150-2570. Both stay
// permanently safe: the fake-door trick forces a backtrack across this same
// chasm, so nothing here can be allowed to ever break.
export const LEVEL2_CHASM_1: Rect = { x: 2220, y: GROUND_Y - 30, w: 90, h: 20 };
export const LEVEL2_CHASM_2: Rect = { x: 2400, y: GROUND_Y - 30, w: 90, h: 20 };

export const LEVEL2_COLLAPSE_TILE: Rect = { x: 640, y: GROUND_Y, w: 70, h: 20 };
// A narrow zone on the safe ground just before the tile: reaching it arms the
// collapse, so the floor is already giving way as the player steps onto it —
// not only after they've already crossed it. Still fixed and deterministic,
// just earlier than the tile itself.
export const LEVEL2_COLLAPSE_TRIGGER: Rect = {
  x: LEVEL2_COLLAPSE_TILE.x - 40,
  y: 0,
  w: 40,
  h: GROUND_Y,
};

export const LEVEL2_HIDDEN_BLOCK_TRIGGER: Rect = { x: 1010, y: 0, w: 60, h: GROUND_Y };
export const LEVEL2_HIDDEN_BLOCK: Rect = { x: 1010, y: GROUND_Y - 110, w: 60, h: 20 };

export const LEVEL2_SPIKE_TRIGGER: Rect = { x: 1380, y: 0, w: 40, h: GROUND_Y };
export const LEVEL2_SPIKE_ZONE: Rect = { x: 1560, y: GROUND_Y - 18, w: 80, h: 18 };

// The apparent exit: looks and behaves exactly like Level 1's honest door
// until the player gets close, at which point it slams shut and becomes a
// solid wall — the real exit appears elsewhere at that same moment.
export const LEVEL2_FAKE_DOOR: Rect = { x: 2680, y: GROUND_Y - DOOR_H, w: DOOR_W, h: DOOR_H };
export const LEVEL2_FAKE_DOOR_TRIGGER: Rect = {
  x: LEVEL2_FAKE_DOOR.x - 110,
  y: 0,
  w: 110,
  h: GROUND_Y,
};
// Placed at the opposite end of this final stretch of ground, not further
// back — every earlier Level 2 trap stays permanently live once triggered,
// so a full-level backtrack risks being unwinnable on the same life.
export const LEVEL2_REAL_DOOR: Rect = { x: 2100, y: GROUND_Y - DOOR_H, w: DOOR_W, h: DOOR_H };

export function levelWidth(level: Level): number {
  return level === 1 ? LEVEL1_WIDTH : LEVEL2_WIDTH;
}

export function createInitialState(level: Level = 1): GameState {
  const spawn = level === 1 ? LEVEL1_SPAWN : LEVEL2_SPAWN;
  return {
    phase: "playing",
    level,
    player: { x: spawn.x, y: spawn.y, vx: 0, vy: 0, onGround: false, facing: 1 },
    traps: {
      collapse: { triggered: false, timer: 0 },
      hiddenBlock: { triggered: false, timer: 0 },
      spikes: { triggered: false, timer: 0 },
      fakeDoor: { triggered: false, timer: 0 },
      platform: { triggered: false, timer: 0 },
    },
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function playerRect(p: Player): Rect {
  return { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
}

function isGone(trap: TrapRuntime, delay: number = COLLAPSE_DELAY): boolean {
  return trap.triggered && trap.timer >= delay;
}

function spikesUp(trap: TrapRuntime): boolean {
  return trap.triggered && trap.timer >= SPIKE_DELAY;
}

// A landing check, not an overlap check: resolveMovement snaps a resting
// player's feet exactly onto the rect's top edge, so plain rectsOverlap (which
// needs vertical penetration) never sees steady contact. This only reads true
// while the player is actually resting on this specific rect — never while
// mid-air passing over or under it.
function standingOn(player: Player, rect: Rect): boolean {
  return (
    player.onGround &&
    Math.abs(player.y + PLAYER_H - rect.y) < 0.5 &&
    player.x + PLAYER_W > rect.x &&
    player.x < rect.x + rect.w
  );
}

/** Every solid rect the player can stand on or bump into this frame, in Level 2. */
export function solidRects(traps: Traps): Rect[] {
  const rects = [
    ...LEVEL2_GROUND_SEGMENTS,
    LEVEL2_STEP_1,
    LEVEL2_STEP_2,
    LEVEL2_CHASM_1,
    LEVEL2_CHASM_2,
  ];
  if (!isGone(traps.collapse)) rects.push(LEVEL2_COLLAPSE_TILE, { ...LEVEL2_COLLAPSE_TILE, h: 400 });
  if (!isGone(traps.platform, PLATFORM_BREAK_DELAY)) rects.push(LEVEL2_STEP_3);
  if (traps.hiddenBlock.triggered) rects.push(LEVEL2_HIDDEN_BLOCK);
  // Once triggered, the fake door isn't a door anymore — it's a wall.
  if (traps.fakeDoor.triggered) rects.push({ ...LEVEL2_FAKE_DOOR, y: 0, h: GROUND_Y });
  return rects;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveMovement(target: Player, prevX: number, prevY: number, solids: Rect[]): Player {
  const player = { ...target, onGround: false };

  for (const solid of solids) {
    if (!rectsOverlap(playerRect(player), solid)) continue;

    const prevBottom = prevY + PLAYER_H;
    const prevTop = prevY;
    const prevRight = prevX + PLAYER_W;
    const prevLeft = prevX;

    if (prevBottom <= solid.y && player.vy >= 0) {
      player.y = solid.y - PLAYER_H;
      player.vy = 0;
      player.onGround = true;
    } else if (prevTop >= solid.y + solid.h && player.vy < 0) {
      player.y = solid.y + solid.h;
      player.vy = 0;
    } else if (prevRight <= solid.x) {
      player.x = solid.x - PLAYER_W;
      player.vx = 0;
    } else if (prevLeft >= solid.x + solid.w) {
      player.x = solid.x + solid.w;
      player.vx = 0;
    }
  }

  return player;
}

/** Shared physics step: input + gravity + collision. Same rules, either level. */
function integratePlayer(
  player: Player,
  input: Input,
  dt: number,
  solids: Rect[],
  width: number,
): Player {
  const next: Player = { ...player };
  if (input.left && !input.right) {
    next.vx = -MOVE_SPEED;
    next.facing = -1;
  } else if (input.right && !input.left) {
    next.vx = MOVE_SPEED;
    next.facing = 1;
  } else {
    next.vx = 0;
  }
  if (input.jumpPressed && next.onGround) next.vy = JUMP_VELOCITY;
  next.vy = Math.min(next.vy + GRAVITY * dt, MAX_FALL_SPEED);

  const prevX = next.x;
  const prevY = next.y;
  const target: Player = {
    ...next,
    x: clamp(next.x + next.vx * dt, 0, width - PLAYER_W),
    y: next.y + next.vy * dt,
  };
  return resolveMovement(target, prevX, prevY, solids);
}

function stepLevel1(state: GameState, input: Input, dt: number): GameState {
  const player = integratePlayer(state.player, input, dt, LEVEL1_GROUND_SEGMENTS, LEVEL1_WIDTH);

  if (player.x + PLAYER_W >= LEVEL1_GOAL.x) {
    // Reaching Level 1's goal advances straight into Level 2 — same call that
    // builds a fresh game handles phase, spawn position, and untriggered
    // traps all at once, so the transition can't accidentally forget one.
    return createInitialState(2);
  }
  if (player.y > DEATH_Y) {
    return { ...state, player, phase: "dead" };
  }
  if (rectsOverlap(playerRect(player), LEVEL1_SPIKE_HAZARD)) {
    return { ...state, player, phase: "dead" };
  }
  return { ...state, player };
}

function stepLevel2(state: GameState, input: Input, dt: number): GameState {
  const traps: Traps = {
    collapse: { ...state.traps.collapse },
    hiddenBlock: { ...state.traps.hiddenBlock },
    spikes: { ...state.traps.spikes },
    fakeDoor: { ...state.traps.fakeDoor },
    platform: { ...state.traps.platform },
  };

  // Trigger checks use the position the player entered this frame with, so a
  // trap armed this frame is already in effect for this same frame — a block
  // mid-jump is already solid, a tile just reached is already giving way.
  if (
    !traps.hiddenBlock.triggered &&
    state.player.vy < 0 &&
    rectsOverlap(playerRect(state.player), LEVEL2_HIDDEN_BLOCK_TRIGGER)
  ) {
    traps.hiddenBlock = { triggered: true, timer: 0 };
  }
  if (!traps.spikes.triggered && rectsOverlap(playerRect(state.player), LEVEL2_SPIKE_TRIGGER)) {
    traps.spikes = { triggered: true, timer: 0 };
  }
  if (!traps.collapse.triggered && rectsOverlap(playerRect(state.player), LEVEL2_COLLAPSE_TRIGGER)) {
    traps.collapse = { triggered: true, timer: 0 };
  }
  if (!traps.fakeDoor.triggered && rectsOverlap(playerRect(state.player), LEVEL2_FAKE_DOOR_TRIGGER)) {
    traps.fakeDoor = { triggered: true, timer: 0 };
  }
  if (traps.spikes.triggered) traps.spikes.timer += dt;
  if (traps.collapse.triggered) traps.collapse.timer += dt;

  const player = integratePlayer(state.player, input, dt, solidRects(traps), LEVEL2_WIDTH);

  // Unlike the proximity traps above, the breakable platform only arms once
  // the player has actually landed on it this frame — never on approach, and
  // never just from passing underneath or beside it.
  if (!traps.platform.triggered && standingOn(player, LEVEL2_STEP_3)) {
    traps.platform = { triggered: true, timer: 0 };
  }
  if (traps.platform.triggered) traps.platform.timer += dt;

  let phase: Phase = "playing";
  // The real door only exists as a win condition once the fake one has
  // sprung — otherwise the player would win by accident walking past it on
  // the way to the fake door in the first place.
  if (traps.fakeDoor.triggered && rectsOverlap(playerRect(player), LEVEL2_REAL_DOOR)) {
    phase = "won";
  } else if (player.y > DEATH_Y) {
    phase = "dead";
  } else if (spikesUp(traps.spikes) && rectsOverlap(playerRect(player), LEVEL2_SPIKE_ZONE)) {
    phase = "dead";
  }

  return { phase, level: 2, player, traps };
}

/** Advance the simulation by one frame. A no-op once the round has ended. */
export function step(state: GameState, input: Input, dt: number): GameState {
  if (state.phase !== "playing") return state;
  return state.level === 1 ? stepLevel1(state, input, dt) : stepLevel2(state, input, dt);
}

export function cameraX(playerX: number, width: number): number {
  return clamp(playerX - VIEWPORT_WIDTH / 2 + PLAYER_W / 2, 0, width - VIEWPORT_WIDTH);
}

export { isGone, spikesUp };
