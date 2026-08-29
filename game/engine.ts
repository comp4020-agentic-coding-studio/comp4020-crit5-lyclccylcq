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

// Width matches the previous enlarged viewport exactly — this pass only
// grows the view downward, giving more visible space below the ground/fall
// line, without stretching or resizing anything horizontally.
export const VIEWPORT_WIDTH = 1280;
export const VIEWPORT_HEIGHT = 720;

// A collapsing tile gives way this long after the player lands on it — short
// enough that simply sprinting across the trigger and the tile isn't a
// reliable escape (crossing both takes ~0.34s at full move speed).
export const COLLAPSE_DELAY = 0.15;
// The stone wall trap reaches full height this long after the player enters
// its trigger zone (see drawStoneWall in render.ts) — but contact is lethal
// from the moment it's triggered, not only once fully risen (see stepLevel2),
// so this only governs how the rise looks, not when it becomes dangerous.
export const SPIKE_DELAY = 0.45;
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

// The pit cloud: an ordinary-looking decorative cloud sitting in the sky
// above the pit, until the player actually attempts the jump over it —
// nothing marks it as anything but scenery before that, and it never blocks
// movement like a platform, before or after. Triggering it sends it falling
// straight down through the jump's path and on past the bottom of the
// screen, rather than settling in the gap it's guarding. It briefly holds
// still after being triggered — imperceptible on its own, but enough that a
// jump launched with reasonable lead (not the last possible instant) is
// already carrying the player clear of its path before it actually starts
// to move — before it actually starts falling.
export const PIT_CLOUD_TELEGRAPH_DELAY = 0.18;
// Time to fall from its sky height down to fully off-screen, once the
// telegraph delay above has elapsed.
export const PIT_CLOUD_FALL_DURATION = 0.5;

export type Phase = "playing" | "dead" | "entering" | "complete";
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
  spikes: TrapRuntime;
  fakeDoor: TrapRuntime;
  // Reused for the Level 2 fence trap (see LEVEL2_FENCE below) — this field
  // used to belong to the breakable staircase platform, which the fence
  // replaced outright, so no new Traps field was needed for it.
  platform: TrapRuntime;
  chasmPlatform: TrapRuntime;
  pitCloud: TrapRuntime;
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
  deaths: number;
}

// --- Level 1: the honest teaching level -------------------------------------
// Every hazard here is visible on sight, with nothing hidden and no surprise
// trigger. The one hazard (LEVEL1_SPIKE_HAZARD below) shares Level 2's
// rising-stone-wall look and its `spikes` TrapRuntime, but isn't
// proximity-triggered the way Level 2's is: it starts already armed the
// instant the level (re)loads (see createInitialState) and finishes rising
// well before the player can possibly walk to it, so it's a real, visible
// rise rather than an ambush. This level exists to teach the normal rules of
// the game — floor is safe, a gap needs a jump, a wall is a wall — entirely
// through fair play, so Level 2 can later break those same rules without ever
// having lied first.

export const LEVEL1_WIDTH = 1400;
export const LEVEL1_SPAWN = { x: 60, y: GROUND_Y - PLAYER_H };

export const LEVEL1_GROUND_SEGMENTS: Rect[] = [
  { x: 0, y: GROUND_Y, w: 400, h: 400 }, // wide, safe starting platform
  { x: 470, y: GROUND_Y, w: 430, h: 400 }, // gap 400-470 (70px)
  { x: 1000, y: GROUND_Y, w: 400, h: 400 }, // gap 900-1000 (100px, the longer jump)
];

// Same footprint and lethal rule as ever — always deadly on overlap,
// unconditional on any trap state — but rendered as the same rising stone
// wall as Level 2's popup trap (see drawStoneWall in render.ts), reusing the
// `spikes` TrapRuntime rather than a separate hazard kind. It auto-arms at
// level start instead of via proximity (see createInitialState), since a
// hidden trigger here would break this level's "nothing hidden, ever" deal.
export const LEVEL1_SPIKE_HAZARD: Rect = { x: 680, y: GROUND_Y - 18, w: 64, h: 18 };

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
  { x: 1380, y: GROUND_Y, w: 770, h: 400 }, // carries the fence and the real door
  { x: 2570, y: GROUND_Y, w: 230, h: 400 }, // carries both doors; 2150-2570 is the chasm
];

// A small fence blocking the ground — the player has to actually jump it,
// same as any ordinary solid obstacle, with nothing hidden about it. Sitting
// on top of the existing ground segment, so unlike the old staircase steps it
// only needs its own visible height, not a column all the way down.
// Placed with real breathing room on both sides: 260px clear of the rising
// stone wall (LEVEL2_SPIKE_ZONE) behind it, so it reads as its own standalone
// obstacle rather than terrain stacked against the wall, and well short of
// the cliff ahead (see LEVEL2_FENCE_CLIFF_X below) so there's genuine room to
// jump it, land, react, and start running before any chase is even armed.
export const LEVEL2_FENCE: Rect = { x: 1800, y: GROUND_Y - 56, w: 34, h: 56 };
// Comfortably faster than the player's own MOVE_SPEED, so once it's chasing,
// standing still or just matching pace is not enough to stay ahead forever.
export const FENCE_CHASE_SPEED = 400;
// The ground segment carrying the fence ends here — the cliff overlooking the
// chasm. The chase runs the fence all the way out to this edge rather than
// stopping short of it; see fenceRect below for what happens once it gets
// there.
const fenceGroundSegment = LEVEL2_GROUND_SEGMENTS.find(
  (seg) => seg.x <= LEVEL2_FENCE.x && seg.x + seg.w >= LEVEL2_FENCE.x + LEVEL2_FENCE.w,
)!;
export const LEVEL2_FENCE_CLIFF_X = fenceGroundSegment.x + fenceGroundSegment.w;
// How far the fence travels before its right edge reaches the cliff edge —
// the full remaining gap, not a short cap well short of it. Paired with
// LEVEL2_FENCE_TRIGGER_MARGIN below: the head start banked before the chase
// even starts still comfortably outlasts the chase itself, since the fence
// only closes on a running player at (FENCE_CHASE_SPEED - MOVE_SPEED) =
// 80px/s for the ~0.8s the chase takes to cover this distance.
export const FENCE_CHASE_DISTANCE = LEVEL2_FENCE_CLIFF_X - (LEVEL2_FENCE.x + LEVEL2_FENCE.w);
// Once the fence reaches the cliff edge, it doesn't stop awkwardly — it keeps
// going, falling down into the chasm over this many seconds, well past the
// bottom of the viewport so it settles somewhere it can never be reached
// again (mirroring PIT_CLOUD_FALL_DURATION's "fall fully below viewport, stay
// gone" shape).
export const FENCE_FALL_DURATION = 0.4;
// A stretch of ground clear of the fence's own footprint — landing here (not
// merely jumping over the fence mid-air) is what arms the chase, so jumping
// onto or over the fence itself never triggers it. Deliberately wider than a
// token gap (see FENCE_CHASE_DISTANCE above): it's what banks the player's
// head start before the chase begins, without which the fence's own speed
// advantage would close the gap almost the instant it starts moving.
const LEVEL2_FENCE_TRIGGER_MARGIN = 100;
export const LEVEL2_FENCE_TRIGGER: Rect = {
  x: LEVEL2_FENCE.x + LEVEL2_FENCE.w + LEVEL2_FENCE_TRIGGER_MARGIN,
  y: 0,
  w: 60,
  h: GROUND_Y,
};

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

// A ground gap that looks exactly like any other jump — the ground segments
// above simply leave this stretch open, and there is nothing hanging above
// it to see except an ordinary decorative cloud. What makes it a trick is
// what that cloud does: see LEVEL2_PIT_CLOUD and LEVEL2_PIT_CLOUD_TRIGGER
// below.
export const LEVEL2_PIT: Rect = { x: 1150, y: GROUND_Y, w: 70, h: 400 };

// The cloud's footprint. Deliberately never appears in solidRects, triggered
// or not — it's a hazard the player can be hit by, never a surface they can
// stand on, and it never sits still in the gap once it has fallen.
export const LEVEL2_PIT_CLOUD_W = 80;
export const LEVEL2_PIT_CLOUD_H = 40;
export const LEVEL2_PIT_CLOUD_X = LEVEL2_PIT.x + LEVEL2_PIT.w / 2 - LEVEL2_PIT_CLOUD_W / 2;
// Where it sits before anything happens — up at the same kind of height as
// the purely decorative background clouds, so it reads as scenery, not a
// trap. Where it ends up once it has fallen: fully below the bottom edge of
// the viewport, so it passes out of the visible screen instead of stopping
// in the gap it was guarding.
export const LEVEL2_PIT_CLOUD_SKY_Y = 90;
export const LEVEL2_PIT_CLOUD_LOW_Y = VIEWPORT_HEIGHT + LEVEL2_PIT_CLOUD_H;

// Tight to the pit's own span, not a long lead-in: a small margin either side
// of the gap so a jump launched right at the near edge, or still airborne
// just past the far edge, both still count — but merely approaching from a
// distance does not. Combined with the vy < 0 (an actual rising jump, not
// walking) gate below, this is "jump input plus position near the pit's
// edge/span", not a broad proximity zone.
const LEVEL2_PIT_CLOUD_TRIGGER_MARGIN = 30;
export const LEVEL2_PIT_CLOUD_TRIGGER: Rect = {
  x: LEVEL2_PIT.x - LEVEL2_PIT_CLOUD_TRIGGER_MARGIN,
  y: 0,
  w: LEVEL2_PIT_CLOUD_TRIGGER_MARGIN * 2 + LEVEL2_PIT.w,
  h: GROUND_Y,
};

export const LEVEL2_SPIKE_ZONE: Rect = { x: 1460, y: GROUND_Y - 18, w: 64, h: 18 };
// Starts right up against the zone itself, contiguous with it — the same
// "immediately before, no early warning" shape as LEVEL2_COLLAPSE_TRIGGER.
// Narrow and late on purpose: by the time SPIKE_DELAY has elapsed, a player
// who was already moving is well into the zone, not still watching the
// spikes rise from a safe distance down the approach.
export const LEVEL2_SPIKE_TRIGGER: Rect = { x: LEVEL2_SPIKE_ZONE.x - 60, y: 0, w: 60, h: GROUND_Y };

// The apparent exit: looks and behaves exactly like Level 1's honest door —
// no early tell at any distance — right up until the player actually reaches
// it, at which point touching it is lethal, the same as a spike.
export const LEVEL2_FAKE_DOOR: Rect = { x: 2680, y: GROUND_Y - DOOR_H, w: DOOR_W, h: DOOR_H };
// Tight to the fake door itself, the same "no early warning" shape as every
// other Level 2 trigger — reaching this close is what baits it into
// revealing its true form (and the real door along with it), well before the
// player actually touches it.
const LEVEL2_FAKE_DOOR_REVEAL_MARGIN = 50;
export const LEVEL2_FAKE_DOOR_REVEAL_TRIGGER: Rect = {
  x: LEVEL2_FAKE_DOOR.x - LEVEL2_FAKE_DOOR_REVEAL_MARGIN,
  y: 0,
  w: LEVEL2_FAKE_DOOR_REVEAL_MARGIN,
  h: GROUND_Y,
};
// Placed well before the fake door, not further back — every earlier Level 2
// trap stays permanently live once triggered, so a full-level backtrack risks
// being unwinnable on the same life. Hidden until the fake door is baited into
// revealing it — see LEVEL2_FAKE_DOOR_REVEAL_TRIGGER and drawDoors in
// render.ts.
export const LEVEL2_REAL_DOOR: Rect = { x: 2100, y: GROUND_Y - DOOR_H, w: DOOR_W, h: DOOR_H };

export function levelWidth(level: Level): number {
  return level === 1 ? LEVEL1_WIDTH : LEVEL2_WIDTH;
}

export function createInitialState(
  level: Level = 1,
  opts?: { announce?: boolean; deaths?: number },
): GameState {
  const spawn = level === 1 ? LEVEL1_SPAWN : LEVEL2_SPAWN;
  const announce = opts?.announce ?? true;
  return {
    phase: "playing",
    level,
    player: { x: spawn.x, y: spawn.y, vx: 0, vy: 0, onGround: false, facing: 1 },
    traps: {
      collapse: { triggered: false, timer: 0 },
      // Level 1 reuses this same field for its wall hazard, auto-armed the
      // instant the level loads — see the comment on LEVEL1_SPIKE_HAZARD.
      // Level 2 still arms it only via LEVEL2_SPIKE_TRIGGER, as before.
      spikes: { triggered: level === 1, timer: 0 },
      fakeDoor: { triggered: false, timer: 0 },
      platform: { triggered: false, timer: 0 },
      chasmPlatform: { triggered: false, timer: 0 },
      pitCloud: { triggered: false, timer: 0 },
    },
    phaseTime: 0,
    banner: announce ? { timer: 0 } : null,
    deaths: opts?.deaths ?? 0,
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

// The pit cloud's current position: sits at its decorative sky height until
// triggered, holds there for PIT_CLOUD_TELEGRAPH_DELAY (a jump with
// reasonable lead is already past by the time it starts moving), then falls
// on past the bottom of the viewport over PIT_CLOUD_FALL_DURATION and stays
// gone — never solid, so nothing else depends on where it ends up.
export function pitCloudRect(trap: TrapRuntime): Rect {
  const fallElapsed = trap.triggered ? Math.max(trap.timer - PIT_CLOUD_TELEGRAPH_DELAY, 0) : 0;
  const t = Math.min(fallElapsed / PIT_CLOUD_FALL_DURATION, 1);
  const y = LEVEL2_PIT_CLOUD_SKY_Y + (LEVEL2_PIT_CLOUD_LOW_Y - LEVEL2_PIT_CLOUD_SKY_Y) * t;
  return { x: LEVEL2_PIT_CLOUD_X, y, w: LEVEL2_PIT_CLOUD_W, h: LEVEL2_PIT_CLOUD_H };
}

// How long the horizontal chase itself takes to cover FENCE_CHASE_DISTANCE —
// once this much of the trap's timer has elapsed, the fence's right edge is
// at the cliff edge and it starts falling instead of sliding further right.
const FENCE_CHASE_DURATION = FENCE_CHASE_DISTANCE / FENCE_CHASE_SPEED;
// Where the fence ends up once it has fully fallen — well past the bottom of
// the viewport, the same "gone for good" target pitCloudRect's fall uses.
const FENCE_FALL_TARGET_Y = VIEWPORT_HEIGHT + LEVEL2_FENCE.h;

// The fence's current position: stationary at its original spot until
// triggered, then sliding right at FENCE_CHASE_SPEED until it reaches the
// cliff edge, then falling straight down into the chasm over
// FENCE_FALL_DURATION and staying gone. Same "compute position from the
// trap's own timer" shape as chasmPlatformRect and pitCloudRect above.
export function fenceRect(trap: TrapRuntime): Rect {
  if (!trap.triggered) return LEVEL2_FENCE;
  const travelled = Math.min(FENCE_CHASE_SPEED * trap.timer, FENCE_CHASE_DISTANCE);
  const x = LEVEL2_FENCE.x + travelled;
  if (trap.timer <= FENCE_CHASE_DURATION) return { ...LEVEL2_FENCE, x };
  const fallElapsed = trap.timer - FENCE_CHASE_DURATION;
  const t = Math.min(fallElapsed / FENCE_FALL_DURATION, 1);
  const y = LEVEL2_FENCE.y + (FENCE_FALL_TARGET_Y - LEVEL2_FENCE.y) * t;
  return { ...LEVEL2_FENCE, x, y };
}

/** Every solid rect the player can stand on or bump into this frame, in Level 2. */
export function solidRects(traps: Traps): Rect[] {
  const rects = [
    ...LEVEL2_GROUND_SEGMENTS,
    LEVEL2_CHASM_1,
    chasmPlatformRect(traps.chasmPlatform),
  ];
  if (!isGone(traps.collapse)) rects.push(LEVEL2_COLLAPSE_TILE, { ...LEVEL2_COLLAPSE_TILE, h: 400 });
  // Solid (blocks movement, forces a jump) until triggered — once the chase
  // starts, it's a hazard to touch rather than a wall to bump into, same as
  // spikes/the fake door/the pit cloud once they're armed (see stepLevel2).
  if (!traps.platform.triggered) rects.push(LEVEL2_FENCE);
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
  // The wall is armed from the moment the level loads (see
  // createInitialState) — this just advances its rise; there's no trigger to
  // check here, unlike Level 2's proximity-armed version of the same trap.
  const traps: Traps = {
    ...state.traps,
    spikes: { ...state.traps.spikes, timer: state.traps.spikes.timer + dt },
  };
  const player = integratePlayer(state.player, input, dt, LEVEL1_GROUND_SEGMENTS, LEVEL1_WIDTH);

  if (player.x + PLAYER_W >= LEVEL1_GOAL.x) {
    // Reaching the goal plays a short door-entry animation before the level
    // actually changes — see tickEntering().
    return { ...state, player, traps, phase: "entering", phaseTime: 0 };
  }
  if (player.y > DEATH_Y) {
    return { ...state, player, traps, phase: "dead", phaseTime: 0, deaths: state.deaths + 1 };
  }
  if (rectsOverlap(playerRect(player), LEVEL1_SPIKE_HAZARD)) {
    return { ...state, player, traps, phase: "dead", phaseTime: 0, deaths: state.deaths + 1 };
  }
  return { ...state, player, traps };
}

function stepLevel2(state: GameState, input: Input, dt: number): GameState {
  const traps: Traps = {
    collapse: { ...state.traps.collapse },
    spikes: { ...state.traps.spikes },
    fakeDoor: { ...state.traps.fakeDoor },
    platform: { ...state.traps.platform },
    chasmPlatform: { ...state.traps.chasmPlatform },
    pitCloud: { ...state.traps.pitCloud },
  };

  // Trigger checks use the position the player entered this frame with, so a
  // trap armed this frame is already in effect for this same frame — a block
  // mid-jump is already solid, a tile just reached is already giving way.
  if (!traps.spikes.triggered && rectsOverlap(playerRect(state.player), LEVEL2_SPIKE_TRIGGER)) {
    traps.spikes = { triggered: true, timer: 0 };
  }
  if (!traps.collapse.triggered && rectsOverlap(playerRect(state.player), LEVEL2_COLLAPSE_TRIGGER)) {
    traps.collapse = { triggered: true, timer: 0 };
  }
  // Leaving CHASM_1 into the gap, not resting on it, is what counts as a
  // genuine attempt to reach the platform beyond — and it only ever fires
  // once.
  if (!traps.chasmPlatform.triggered && rectsOverlap(playerRect(state.player), LEVEL2_CHASM_2_TRIGGER)) {
    traps.chasmPlatform = { triggered: true, timer: 0 };
  }
  // A rising jump while actually near the pit's span sends the cloud falling
  // — a genuine attempt at the jump, not just walking up to it or being
  // nowhere near it yet. The cloud is never solid, so unlike the other
  // triggers here this has no bearing on this same frame's movement — only
  // on the hazard check below, once the player's new position is known.
  if (
    !traps.pitCloud.triggered &&
    state.player.vy < 0 &&
    rectsOverlap(playerRect(state.player), LEVEL2_PIT_CLOUD_TRIGGER)
  ) {
    traps.pitCloud = { triggered: true, timer: 0 };
  }
  // The fake door reveals itself (and the real door behind it) once the
  // player gets close enough to bait it — well before actual contact. Its
  // separate, unchanged contact check below still gates the kill.
  if (
    !traps.fakeDoor.triggered &&
    rectsOverlap(playerRect(state.player), LEVEL2_FAKE_DOOR_REVEAL_TRIGGER)
  ) {
    traps.fakeDoor = { triggered: true, timer: 0 };
  }
  // The fence only arms once the player has actually landed clear on the far
  // side and kept going — reaching this zone requires having jumped the
  // fence first, so merely approaching or jumping directly over it (without
  // continuing past) never triggers the chase.
  if (!traps.platform.triggered && rectsOverlap(playerRect(state.player), LEVEL2_FENCE_TRIGGER)) {
    traps.platform = { triggered: true, timer: 0 };
  }
  if (traps.spikes.triggered) traps.spikes.timer += dt;
  if (traps.collapse.triggered) traps.collapse.timer += dt;
  if (traps.chasmPlatform.triggered) traps.chasmPlatform.timer += dt;
  if (traps.pitCloud.triggered) traps.pitCloud.timer += dt;
  if (traps.platform.triggered) traps.platform.timer += dt;

  const player = integratePlayer(state.player, input, dt, solidRects(traps), LEVEL2_WIDTH);

  // The real door only ever appears once the fake door has been baited into
  // revealing it (see LEVEL2_FAKE_DOOR_REVEAL_TRIGGER above and drawDoors in
  // render.ts), so gating the win on that same flag really just means "the
  // real door has to actually be visible first". Since revealing it is the
  // safe proximity check above rather than the lethal contact check below,
  // this can always be satisfied without dying.
  let phase: Phase = "playing";
  if (traps.fakeDoor.triggered && rectsOverlap(playerRect(player), LEVEL2_REAL_DOOR)) {
    phase = "entering";
  } else if (player.y > DEATH_Y) {
    phase = "dead";
  } else if (traps.spikes.triggered && rectsOverlap(playerRect(player), LEVEL2_SPIKE_ZONE)) {
    // Lethal from the moment the stone wall starts rising, not only once
    // it's fully up — colliding with it mid-rise is just as deadly.
    phase = "dead";
  } else if (traps.fakeDoor.triggered && rectsOverlap(playerRect(player), LEVEL2_FAKE_DOOR)) {
    // The fake door is never solid — like spikes, it's lethal on contact once armed.
    phase = "dead";
  } else if (traps.pitCloud.triggered && rectsOverlap(playerRect(player), pitCloudRect(traps.pitCloud))) {
    // The falling cloud is never solid either — it kills on contact, the
    // same as the fake door and spikes, rather than blocking the jump.
    phase = "dead";
  } else if (traps.platform.triggered && rectsOverlap(playerRect(player), fenceRect(traps.platform))) {
    // Once chasing, the fence is no longer solid — it kills on contact,
    // the same as every other armed hazard here.
    phase = "dead";
  }

  const deaths = phase === "dead" ? state.deaths + 1 : state.deaths;
  return { ...state, phase, player, traps, phaseTime: 0, deaths };
}

/**
 * Advance the simulation by one frame. Drives "dead"/"entering" itself so
 * their timing is plain, testable state — a no-op only once "complete" is
 * reached (there is no Level 3 to advance into, so that phase is terminal
 * until a manual restart/level-select).
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
    return createInitialState(state.level, { announce: false, deaths: state.deaths });
  }
  return { ...state, phaseTime };
}

function tickEntering(state: GameState, dt: number): GameState {
  const phaseTime = state.phaseTime + dt;
  if (phaseTime < DOOR_ENTER_DELAY) return { ...state, phaseTime };
  // Level 1's door leads on to Level 2 — the death count carries over, since
  // it's still the same run. Level 2's door is the last one there is — no
  // Level 3 to load, so this ends the game instead. The death count is left
  // as-is (not reset here) so the completion UI can show the run's final
  // tally; createInitialState's own default (see below) is what zeroes it
  // again, once the player actually starts a new run.
  return state.level === 1
    ? createInitialState(2, { deaths: state.deaths })
    : { ...state, phase: "complete", phaseTime: 0 };
}

export function cameraX(playerX: number, width: number): number {
  return clamp(playerX - VIEWPORT_WIDTH / 2 + PLAYER_W / 2, 0, width - VIEWPORT_WIDTH);
}

export { isGone };
