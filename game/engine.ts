// Pure game rules — no DOM, no canvas, so this module is testable on its own.
// Rendering lives in render.ts; input/loop wiring lives in main.ts.

export const GRAVITY = 1800;
export const MOVE_SPEED = 320;
export const JUMP_VELOCITY = -620;
export const MAX_FALL_SPEED = 900;

export const PLAYER_W = 28;
export const PLAYER_H = 32;

export const GROUND_Y = 300;
// Falling this far below the ground line means the player missed every
// platform on the way down — a death, not a landing.
export const DEATH_Y = GROUND_Y + 220;

// Scaled up 4:3 from the original 960x360 — same 8:3 aspect ratio preserved,
// so the view is bigger without stretching anything.
export const VIEWPORT_WIDTH = 1280;
export const VIEWPORT_HEIGHT = 480;

// A collapsing tile gives way this long after the player lands on it — short
// enough that simply sprinting across the trigger and the tile isn't a
// reliable escape (crossing both takes ~0.34s at full move speed).
export const COLLAPSE_DELAY = 0.15;
// Popup spikes rise this long after the player enters their trigger zone.
export const SPIKE_DELAY = 0.45;
// A breakable platform gives way this long after the player lands on it.
export const PLATFORM_BREAK_DELAY = 0.25;
// How long a death holds on the shatter animation before respawning.
export const RESPAWN_DELAY = 0.5;
// How long the "entering the door" animation plays before the level changes.
export const DOOR_ENTER_DELAY = 0.45;
// Of that total, how long the door itself takes to swing open — the player
// only starts moving into the doorway and fading once this has elapsed.
export const DOOR_OPEN_DURATION = 0.18;
// How long the level-name card stays up once a level is first entered.
export const LEVEL_BANNER_DURATION = 1.2;
// How long the second chasm platform stays displaced before gliding back.
export const MOVING_PLATFORM_SHIFT_DELAY = 0.5;
// How far it suddenly moves away — far enough that even a full-speed jump
// launched from the far-right edge of CHASM_1 can't reach it once it has
// moved: that jump instead runs into the far ground's near wall mid-fall and
// drops into the chasm.
export const MOVING_PLATFORM_SHIFT_DISTANCE = 260;
// How long the smooth glide back to its original spot takes.
export const MOVING_PLATFORM_RETURN_DURATION = 0.35;

// The pit blocker: unlike every other Level 2 trap, this one never arms off a
// trigger — it cycles forever from the moment the level starts, so there's no
// approach that avoids it. High, it hangs low enough over the pit to knock a
// full jump short; briefly, it drops flush with the ground to bridge the pit
// instead. Time from HIGH to bridging and back to HIGH:
export const PIT_BLOCKER_DESCEND_TIME = 0.8;
export const PIT_BLOCKER_BRIDGE_HOLD = 0.6;
export const PIT_BLOCKER_ASCEND_TIME = 0.8;
export const PIT_BLOCKER_WAIT_HIGH = 1.8;
export const PIT_BLOCKER_PERIOD =
  PIT_BLOCKER_DESCEND_TIME + PIT_BLOCKER_BRIDGE_HOLD + PIT_BLOCKER_ASCEND_TIME + PIT_BLOCKER_WAIT_HIGH;

export type Phase = "playing" | "dead" | "entering" | "won";
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
  chasmPlatform: TrapRuntime;
  pitBlocker: TrapRuntime;
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
  phaseTime: number;
  banner: { timer: number } | null;
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
  { x: 710, y: GROUND_Y, w: 440, h: 400 }, // gap 1150-1220 is the visible pit, see LEVEL2_PIT
  { x: 1220, y: GROUND_Y, w: 160, h: 400 },
  { x: 1380, y: GROUND_Y, w: 770, h: 400 }, // carries the staircase and the real door
  { x: 2570, y: GROUND_Y, w: 230, h: 400 }, // carries both doors; 2150-2570 is the chasm
];

// A short ascending staircase: each step is a comfortable +40 relative climb,
// blocking its full vertical column like ordinary ground. Every step here is
// permanently safe and stationary — STEP_3 is the deceptive breakable
// platform (see part 4 below), which crumbles but never moves.
export const LEVEL2_STEP_1: Rect = { x: 1680, y: GROUND_Y - 40, w: 90, h: 400 };
export const LEVEL2_STEP_2: Rect = { x: 1770, y: GROUND_Y - 80, w: 130, h: 400 };
export const LEVEL2_STEP_3: Rect = { x: 1900, y: GROUND_Y - 120, w: 70, h: 400 };

// A row of thin floating platforms crossing the chasm at 2150-2570. CHASM_1 is
// permanently safe. CHASM_2 is a one-time deceptive moving platform (see
// LEVEL2_CHASM_2_TRIGGER below) — the fake-door trick forces a backtrack
// across this same chasm, so once it has settled it must stay put for good.
export const LEVEL2_CHASM_1: Rect = { x: 2220, y: GROUND_Y - 30, w: 90, h: 20 };
export const LEVEL2_CHASM_2: Rect = { x: 2400, y: GROUND_Y - 30, w: 90, h: 20 };

// A full vertical column starting exactly at CHASM_1's right edge — the same
// "column" shape as every other Level 2 trigger. Standing on CHASM_1, even at
// its rightmost point, never overlaps it; the player has to actually launch
// off it and cross into the gap to arm the trap, which is what makes this
// "the first genuine attempt to jump toward it". Arming this early (rather
// than only right above CHASM_2) is what leaves enough airtime to bait the
// platform's move and still steer back onto CHASM_1.
export const LEVEL2_CHASM_2_TRIGGER: Rect = {
  x: LEVEL2_CHASM_1.x + LEVEL2_CHASM_1.w,
  y: 0,
  w: LEVEL2_CHASM_2.x + LEVEL2_CHASM_2.w - (LEVEL2_CHASM_1.x + LEVEL2_CHASM_1.w),
  h: GROUND_Y,
};

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

// A ground gap that looks exactly like any other jump — the ground segments
// above simply leave this stretch open. What makes it a trick is what hangs
// above it: see LEVEL2_PIT_BLOCKER below.
export const LEVEL2_PIT: Rect = { x: 1150, y: GROUND_Y, w: 70, h: 400 };

// An ordinary-looking platform hanging above the pit, at a height a full jump
// would clear on an empty stretch of ground — except here it's positioned to
// clip a jump launched from the pit's edge, well before the far side, so the
// jump comes up short over open air. It never looks different depending on
// where it is in its cycle — the same plain platform look throughout, no
// warning colour and no signal of what it's about to do.
export const LEVEL2_PIT_BLOCKER_W = 90;
export const LEVEL2_PIT_BLOCKER_H = 20;
export const LEVEL2_PIT_BLOCKER_X = LEVEL2_PIT.x - 10; // overlaps 10px of solid ground each side, so it bridges with no seam
// Bottom edge sits just 28px above a standing player's head — too tight to
// walk under while jumping, but clear for ordinary standing/walking. Set this
// low (rather than up near a jump's apex) on purpose: a jump launched from
// the pit's edge clips it almost immediately, well before the far side, so
// the leftover hang time after the bonk isn't enough to carry the player
// past the gap — it drops them short, into the pit.
export const LEVEL2_PIT_BLOCKER_HIGH_Y = GROUND_Y - 80;
export const LEVEL2_PIT_BLOCKER_LOW_Y = GROUND_Y; // flush with the ground either side — a true bridge, not a step

export const LEVEL2_SPIKE_TRIGGER: Rect = { x: 1280, y: 0, w: 40, h: GROUND_Y };
export const LEVEL2_SPIKE_ZONE: Rect = { x: 1460, y: GROUND_Y - 18, w: 80, h: 18 };

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

export function createInitialState(level: Level = 1, opts?: { announce?: boolean }): GameState {
  const spawn = level === 1 ? LEVEL1_SPAWN : LEVEL2_SPAWN;
  const announce = opts?.announce ?? true;
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
      chasmPlatform: { triggered: false, timer: 0 },
      pitBlocker: { triggered: false, timer: 0 },
    },
    phaseTime: 0,
    banner: announce ? { timer: 0 } : null,
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

// CHASM_2's current position: ordinary and stationary until its trap has
// fired, then instantly displaced sideways (a sudden move, not an animated
// one — nothing should be visibly "in transit"), then gliding smoothly back
// to its exact original spot once the shift delay elapses, where it settles
// permanently.
export function chasmPlatformRect(trap: TrapRuntime): Rect {
  if (!trap.triggered) return LEVEL2_CHASM_2;
  if (trap.timer < MOVING_PLATFORM_SHIFT_DELAY) {
    return { ...LEVEL2_CHASM_2, x: LEVEL2_CHASM_2.x + MOVING_PLATFORM_SHIFT_DISTANCE };
  }
  const t = Math.min((trap.timer - MOVING_PLATFORM_SHIFT_DELAY) / MOVING_PLATFORM_RETURN_DURATION, 1);
  return { ...LEVEL2_CHASM_2, x: LEVEL2_CHASM_2.x + MOVING_PLATFORM_SHIFT_DISTANCE * (1 - t) };
}

// The pit blocker's current height: unlike chasmPlatformRect, this cycles
// forever on trap.timer — there's no one-time trigger to wait on, so its
// timer starts advancing the moment Level 2 does (see stepLevel2).
export function pitBlockerRect(trap: TrapRuntime): Rect {
  const t = trap.timer % PIT_BLOCKER_PERIOD;
  const holdStart = PIT_BLOCKER_DESCEND_TIME;
  const holdEnd = holdStart + PIT_BLOCKER_BRIDGE_HOLD;
  const ascendEnd = holdEnd + PIT_BLOCKER_ASCEND_TIME;

  let y: number;
  if (t < holdStart) {
    y =
      LEVEL2_PIT_BLOCKER_HIGH_Y +
      (LEVEL2_PIT_BLOCKER_LOW_Y - LEVEL2_PIT_BLOCKER_HIGH_Y) * (t / PIT_BLOCKER_DESCEND_TIME);
  } else if (t < holdEnd) {
    y = LEVEL2_PIT_BLOCKER_LOW_Y;
  } else if (t < ascendEnd) {
    y =
      LEVEL2_PIT_BLOCKER_LOW_Y +
      (LEVEL2_PIT_BLOCKER_HIGH_Y - LEVEL2_PIT_BLOCKER_LOW_Y) * ((t - holdEnd) / PIT_BLOCKER_ASCEND_TIME);
  } else {
    y = LEVEL2_PIT_BLOCKER_HIGH_Y;
  }
  return { x: LEVEL2_PIT_BLOCKER_X, y, w: LEVEL2_PIT_BLOCKER_W, h: LEVEL2_PIT_BLOCKER_H };
}

/** True only during the brief window the pit blocker is flush with the ground, fully bridging the pit. */
export function pitBridged(trap: TrapRuntime): boolean {
  const t = trap.timer % PIT_BLOCKER_PERIOD;
  return t >= PIT_BLOCKER_DESCEND_TIME && t < PIT_BLOCKER_DESCEND_TIME + PIT_BLOCKER_BRIDGE_HOLD;
}

/** Every solid rect the player can stand on or bump into this frame, in Level 2. */
export function solidRects(traps: Traps): Rect[] {
  const rects = [
    ...LEVEL2_GROUND_SEGMENTS,
    LEVEL2_STEP_1,
    LEVEL2_STEP_2,
    LEVEL2_CHASM_1,
    chasmPlatformRect(traps.chasmPlatform),
    pitBlockerRect(traps.pitBlocker),
  ];
  if (!isGone(traps.collapse)) rects.push(LEVEL2_COLLAPSE_TILE, { ...LEVEL2_COLLAPSE_TILE, h: 400 });
  if (!isGone(traps.platform, PLATFORM_BREAK_DELAY)) rects.push(LEVEL2_STEP_3);
  if (traps.hiddenBlock.triggered) rects.push(LEVEL2_HIDDEN_BLOCK);
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
    // Reaching the goal plays a short door-entry animation before the level
    // actually changes — see tickEntering().
    return { ...state, player, phase: "entering", phaseTime: 0 };
  }
  if (player.y > DEATH_Y) {
    return { ...state, player, phase: "dead", phaseTime: 0 };
  }
  if (rectsOverlap(playerRect(player), LEVEL1_SPIKE_HAZARD)) {
    return { ...state, player, phase: "dead", phaseTime: 0 };
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
    chasmPlatform: { ...state.traps.chasmPlatform },
    pitBlocker: { ...state.traps.pitBlocker },
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
  // Leaving CHASM_1 into the gap, not resting on it, is what counts as a
  // genuine attempt to reach the platform beyond — and it only ever fires
  // once.
  if (!traps.chasmPlatform.triggered && rectsOverlap(playerRect(state.player), LEVEL2_CHASM_2_TRIGGER)) {
    traps.chasmPlatform = { triggered: true, timer: 0 };
  }
  if (traps.spikes.triggered) traps.spikes.timer += dt;
  if (traps.collapse.triggered) traps.collapse.timer += dt;
  if (traps.chasmPlatform.triggered) traps.chasmPlatform.timer += dt;
  // Cycles forever from the moment the level starts — no proximity trigger,
  // no arming: there's no approach to this trap that avoids it running.
  traps.pitBlocker = { triggered: true, timer: traps.pitBlocker.timer + dt };

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
    phase = "entering";
  } else if (player.y > DEATH_Y) {
    phase = "dead";
  } else if (spikesUp(traps.spikes) && rectsOverlap(playerRect(player), LEVEL2_SPIKE_ZONE)) {
    phase = "dead";
  } else if (traps.fakeDoor.triggered && rectsOverlap(playerRect(player), LEVEL2_FAKE_DOOR)) {
    // The fake door is never solid — like spikes, it's lethal on contact once armed.
    phase = "dead";
  }

  return { ...state, phase, player, traps, phaseTime: 0 };
}

/**
 * Advance the simulation by one frame. Drives "dead"/"entering" itself so
 * their timing is plain, testable state — a no-op only once "won" is reached.
 */
export function step(state: GameState, input: Input, dt: number): GameState {
  if (state.phase === "dead") return tickDead(state, dt);
  if (state.phase === "entering") return tickEntering(state, dt);
  if (state.phase !== "playing") return state;

  const withBanner = state.banner
    ? {
        ...state,
        banner:
          state.banner.timer + dt >= LEVEL_BANNER_DURATION ? null : { timer: state.banner.timer + dt },
      }
    : state;
  return withBanner.level === 1
    ? stepLevel1(withBanner, input, dt)
    : stepLevel2(withBanner, input, dt);
}

function tickDead(state: GameState, dt: number): GameState {
  const phaseTime = state.phaseTime + dt;
  if (phaseTime >= RESPAWN_DELAY) {
    // Every trap — including the chasm platform — resets with the rest of
    // the level: the moving-platform trick is one-time only per life, not
    // globally, so each new attempt gets its own first genuine try at it.
    return createInitialState(state.level, { announce: false });
  }
  return { ...state, phaseTime };
}

function tickEntering(state: GameState, dt: number): GameState {
  const phaseTime = state.phaseTime + dt;
  if (phaseTime < DOOR_ENTER_DELAY) return { ...state, phaseTime };
  return state.level === 1 ? createInitialState(2) : { ...state, phase: "won", phaseTime: 0 };
}

export function cameraX(playerX: number, width: number): number {
  return clamp(playerX - VIEWPORT_WIDTH / 2 + PLAYER_W / 2, 0, width - VIEWPORT_WIDTH);
}

export { isGone, spikesUp };
