// Canvas drawing only. Takes a GameState and paints it — no rule logic here,
// so a change of visual style never touches engine.ts.
import {
  LEVEL1_GOAL,
  LEVEL1_GROUND_SEGMENTS,
  LEVEL1_SPIKE_HAZARD,
  LEVEL2_FAKE_DOOR,
  LEVEL2_REAL_DOOR,
  LEVEL2_GROUND_SEGMENTS,
  LEVEL2_SPIKE_ZONE,
  LEVEL2_COLLAPSE_TILE,
  LEVEL2_FENCE,
  LEVEL2_CHASM_1,
  LEVEL2_CHASM_2,
  PLAYER_H,
  PLAYER_W,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  RESPAWN_DELAY,
  DOOR_ENTER_DELAY,
  DOOR_OPEN_DURATION,
  LEVEL_BANNER_DURATION,
  SPIKE_DELAY,
  isGone,
  chasmPlatformRect,
  fenceRect,
  pitCloudRect,
  LEVEL2_PIT_CLOUD_W,
  LEVEL2_PIT_CLOUD_H,
} from "./engine.ts";
import type { GameState, Rect, TrapRuntime } from "./engine.ts";

const SKY_TOP = "#bdeaff";
const SKY_BOTTOM = "#e9f9ff";
const GROUND_TOP = "#6fcf6f";
const GROUND_BODY = "#8a5a3c";
const CRACK_TOP = "#b7d98a";
const PLAYER_BODY = "#ff8a3d";
const PLAYER_EYE = "#20303a";
export const SPIKE_COLOR = "#e8453c";
const STONE_WALL_COLOR = "#8d8d8d";
const STONE_WALL_LINE = "#5a5a5a";
const DOOR_FRAME = "#4a3826";
const DOOR_PANEL = "#3fae5a";
const DOOR_KNOB = "#f4e4b8";
const WALL_BLOCKED = "#6b5a4a";
const WALL_PLANK = "#4a3826";
const FENCE_WOOD = "#7a5230";
const FENCE_RAIL = "#a9743f";

// Visual-only rise height — taller than the trap's actual (much shorter)
// collision zone, same as every ground slab already being drawn taller than
// its own thin hitbox. Purely cosmetic: the trap's lethal footprint in
// engine.ts never changes.
const STONE_WALL_HEIGHT = 90;

// Ground/step rects are collision columns, not visual ones — they're this
// tall so nothing can ever tunnel through the bottom of the viewport, no
// matter how the viewport height changes. Capping the actual fill at this
// height keeps the visible slab of dirt the same modest thickness it always
// was; drawing the full collision height instead would make every ground
// block look like it grew taller every time the viewport did.
export const GROUND_VISUAL_H = 180;

// The world (ground, doors, hazards, player — everything drawn under the
// camera transform below) is shifted down by this many pixels within the
// same fixed VIEWPORT_HEIGHT canvas. GROUND_Y and every collision rect in
// engine.ts stay exactly where they are; this only moves where that geometry
// paints on screen, so the ground sits closer to the bottom of the frame
// instead of floating in the upper half of the taller viewport, without
// stretching any terrain block to get there.
export const WORLD_Y_OFFSET = 150;

const clouds = [
  { x: 120, y: 60, r: 22 },
  { x: 520, y: 40, r: 28 },
  { x: 980, y: 80, r: 20 },
  { x: 1450, y: 50, r: 26 },
  { x: 1900, y: 70, r: 20 },
  { x: 2350, y: 45, r: 30 },
];

export function render(ctx: CanvasRenderingContext2D, state: GameState, camera: number): void {
  ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  const sky = ctx.createLinearGradient(0, 0, 0, VIEWPORT_HEIGHT);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  ctx.save();
  ctx.translate(-camera, WORLD_Y_OFFSET);

  drawClouds(ctx, camera);
  drawGround(ctx, state);
  if (state.level === 2) drawPitCloud(ctx, state);
  drawSpikeHazards(ctx, state);
  drawDoors(ctx, state);
  if (state.phase === "dead") drawShatter(ctx, state);
  else if (state.phase === "entering") drawEntering(ctx, state);
  else if (state.phase !== "complete") drawPlayer(ctx, state);

  ctx.restore();

  drawPhaseOverlay(ctx, state.phase);
  drawBanner(ctx, state);
  drawCompleteScreen(ctx, state);
}

function drawClouds(ctx: CanvasRenderingContext2D, camera: number): void {
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (const cloud of clouds) {
    // Parallax: clouds drift slower than the camera, giving a sense of depth.
    const x = cloud.x + camera * 0.3;
    ctx.beginPath();
    ctx.arc(x, cloud.y, cloud.r, 0, Math.PI * 2);
    ctx.arc(x + cloud.r * 0.8, cloud.y + 6, cloud.r * 0.7, 0, Math.PI * 2);
    ctx.arc(x - cloud.r * 0.8, cloud.y + 8, cloud.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function groundSlab(ctx: CanvasRenderingContext2D, rect: Rect, cracked: boolean): void {
  const { x, y, w } = rect;
  const h = Math.min(rect.h, GROUND_VISUAL_H);
  ctx.fillStyle = GROUND_BODY;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = cracked ? CRACK_TOP : GROUND_TOP;
  ctx.fillRect(x, y, w, 10);
  if (cracked) {
    ctx.strokeStyle = "#5f8a4a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.4, y + 9);
    ctx.moveTo(x + w * 0.7, y);
    ctx.lineTo(x + w * 0.55, y + 9);
    ctx.stroke();
  }
}

// Fills the same terrain column on down to the bottom of the viewport, purely
// additive underneath groundSlab's capped visual thickness — closes the
// stretch of empty sky that otherwise shows below every ground block, without
// touching the capped slab draw itself or any collision geometry. A no-op
// once the capped slab already reaches (or passes) the viewport's bottom.
function groundFoundation(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const top = rect.y + GROUND_VISUAL_H;
  const bottom = VIEWPORT_HEIGHT - WORLD_Y_OFFSET;
  if (bottom <= top) return;
  ctx.fillStyle = GROUND_BODY;
  ctx.fillRect(rect.x, top, rect.w, bottom - top);
}

// A thin slab that visibly floats over open air, rather than sitting on a
// ground column — used for the chasm platforms.
function floatingPlatform(ctx: CanvasRenderingContext2D, rect: Rect, cracked: boolean): void {
  const { x, y, w, h } = rect;
  ctx.fillStyle = GROUND_BODY;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = cracked ? CRACK_TOP : GROUND_TOP;
  ctx.fillRect(x, y, w, Math.min(6, h));
  if (cracked) {
    ctx.strokeStyle = "#5f8a4a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.4, y + h);
    ctx.moveTo(x + w * 0.7, y);
    ctx.lineTo(x + w * 0.55, y + h);
    ctx.stroke();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.level === 1) {
    for (const seg of LEVEL1_GROUND_SEGMENTS) {
      groundSlab(ctx, seg, false);
      groundFoundation(ctx, seg);
    }
    return;
  }
  for (const seg of LEVEL2_GROUND_SEGMENTS) {
    groundSlab(ctx, seg, false);
    groundFoundation(ctx, seg);
  }
  if (!isGone(state.traps.collapse)) {
    // Always drawn as ordinary ground, armed or not — no crack ever shows
    // before the tile actually gives way, only the abrupt disappearance once
    // it's gone. Drawn at the neighbouring segments' full height (not the
    // tile's own thin collision-rect height), so no sliver of sky ever shows
    // beneath it before it collapses.
    groundSlab(ctx, { ...LEVEL2_COLLAPSE_TILE, h: 400 }, false);
    groundFoundation(ctx, LEVEL2_COLLAPSE_TILE);
  }

  drawFence(ctx, state.traps.platform);

  // The chasm platforms: distinct floating slabs rather than ground columns.
  // CHASM_1 is permanently safe. CHASM_2 is drawn wherever its trap currently
  // puts it — ordinary and stationary either way, until it's ever moved.
  floatingPlatform(ctx, LEVEL2_CHASM_1, false);
  floatingPlatform(ctx, chasmPlatformRect(state.traps.chasmPlatform), false);

}

// A small wooden fence: two posts and two rails, deliberately reading as a
// barrier to hop rather than a stair or platform to stand on. Drawn wherever
// fenceRect currently puts it — stationary until triggered, then sliding
// right as it chases.
function drawFence(ctx: CanvasRenderingContext2D, trap: TrapRuntime): void {
  const rect = fenceRect(trap);
  const postW = 6;
  ctx.fillStyle = FENCE_WOOD;
  ctx.fillRect(rect.x, rect.y, postW, rect.h);
  ctx.fillRect(rect.x + rect.w - postW, rect.y, postW, rect.h);
  ctx.fillStyle = FENCE_RAIL;
  ctx.fillRect(rect.x, rect.y + rect.h * 0.15, rect.w, rect.h * 0.16);
  ctx.fillRect(rect.x, rect.y + rect.h * 0.6, rect.w, rect.h * 0.16);
}

// Same puffy, layered-arc look as the purely decorative background clouds —
// nothing marks this one as different until it starts falling.
function drawPitCloud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const rect = pitCloudRect(state.traps.pitCloud);
  const cx = rect.x + LEVEL2_PIT_CLOUD_W / 2;
  const cy = rect.y + LEVEL2_PIT_CLOUD_H / 2;
  const r = LEVEL2_PIT_CLOUD_H / 2;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.9, cy + r * 0.15, r * 0.75, 0, Math.PI * 2);
  ctx.arc(cx - r * 0.9, cy + r * 0.2, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
}

// A stone wall trap: rises quickly from the ground once triggered, taller
// than its own (much shorter) hitbox for a suitably sudden, trap-like look —
// purely cosmetic, the lethal footprint stays exactly LEVEL2_SPIKE_ZONE.
function drawStoneWall(ctx: CanvasRenderingContext2D, zone: Rect, trap: TrapRuntime): void {
  const h = STONE_WALL_HEIGHT * Math.min(trap.timer / SPIKE_DELAY, 1);
  if (h <= 0) return;
  const bottom = zone.y + zone.h;
  const y = bottom - h;
  ctx.fillStyle = STONE_WALL_COLOR;
  ctx.fillRect(zone.x, y, zone.w, h);
  ctx.strokeStyle = STONE_WALL_LINE;
  ctx.lineWidth = 1.5;
  const rows = 3;
  for (let i = 1; i < rows; i++) {
    const ly = y + (h * i) / rows;
    ctx.beginPath();
    ctx.moveTo(zone.x, ly);
    ctx.lineTo(zone.x + zone.w, ly);
    ctx.stroke();
  }
}

// Both levels' wall traps share the same TrapRuntime field and the same
// rising-stone-wall visual (see LEVEL1_SPIKE_HAZARD's comment in engine.ts) —
// only the zone geometry differs.
function drawSpikeHazards(ctx: CanvasRenderingContext2D, state: GameState): void {
  const zone = state.level === 1 ? LEVEL1_SPIKE_HAZARD : LEVEL2_SPIKE_ZONE;
  if (state.traps.spikes.triggered) drawStoneWall(ctx, zone, state.traps.spikes);
}

// A plain, recognisable open door — used for every honest exit, and for the
// Level 2 bait right up until it slams shut.
function drawDoor(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = DOOR_FRAME;
  ctx.fillRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 3);
  ctx.fillStyle = DOOR_PANEL;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = DOOR_KNOB;
  ctx.beginPath();
  ctx.arc(rect.x + rect.w - 8, rect.y + rect.h * 0.55, 3, 0, Math.PI * 2);
  ctx.fill();
}

// The real door mid-transition: the panel swings open (shrinking from its
// hinge, revealing a dark doorway behind it) before the player ever moves —
// so the door is visibly open before anything happens to the player.
function drawDoorOpening(ctx: CanvasRenderingContext2D, rect: Rect, phaseTime: number): void {
  const t = Math.min(phaseTime / DOOR_OPEN_DURATION, 1);
  ctx.fillStyle = DOOR_FRAME;
  ctx.fillRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 3);
  ctx.fillStyle = "#241c14";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const panelW = rect.w * (1 - t);
  ctx.fillStyle = DOOR_PANEL;
  ctx.fillRect(rect.x, rect.y, panelW, rect.h);
  if (panelW > 6) {
    ctx.fillStyle = DOOR_KNOB;
    ctx.beginPath();
    ctx.arc(rect.x + panelW - 8, rect.y + rect.h * 0.55, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The same footprint, but no longer a door — a flat boarded wall block, once
// the fake door has been walked up to and has transformed.
function drawBlockedDoor(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = WALL_BLOCKED;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = WALL_PLANK;
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const y = rect.y + (rect.h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
  }
}

function drawDoors(ctx: CanvasRenderingContext2D, state: GameState): void {
  const entering = state.phase === "entering";
  if (state.level === 1) {
    if (entering) drawDoorOpening(ctx, LEVEL1_GOAL, state.phaseTime);
    else drawDoor(ctx, LEVEL1_GOAL);
    return;
  }
  // The real door stays hidden until the fake door has been baited into
  // revealing it (see LEVEL2_FAKE_DOOR_REVEAL_TRIGGER in engine.ts) — only
  // then does it appear at all, honest exit from that point on.
  if (state.traps.fakeDoor.triggered) {
    if (entering) drawDoorOpening(ctx, LEVEL2_REAL_DOOR, state.phaseTime);
    else drawDoor(ctx, LEVEL2_REAL_DOOR);
    drawBlockedDoor(ctx, LEVEL2_FAKE_DOOR);
  } else {
    drawDoor(ctx, LEVEL2_FAKE_DOOR);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { player } = state;
  const squash = Math.abs(player.vy) > 200 ? 0.85 : 1;
  const w = PLAYER_W;
  const h = PLAYER_H * squash;
  const x = player.x;
  const y = player.y + (PLAYER_H - h);

  ctx.fillStyle = PLAYER_BODY;
  radiusedRect(ctx, x, y, w, h, 8);
  ctx.fill();

  const eyeOffset = player.facing === 1 ? 6 : -6;
  ctx.fillStyle = PLAYER_EYE;
  ctx.beginPath();
  ctx.arc(x + w / 2 + eyeOffset, y + h * 0.35, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

// Fixed, deterministic fragment directions — no Math.random, so the shatter
// is reproducible frame-for-frame in tests and in play alike.
const SHATTER_OFFSETS = [
  { dx: -1, dy: -0.6 },
  { dx: 1, dy: -0.8 },
  { dx: -0.8, dy: 0.4 },
  { dx: 0.9, dy: 0.5 },
  { dx: -0.3, dy: -1 },
  { dx: 0.4, dy: 1 },
];

// Death: the player breaks into a few pieces that fly apart and fade, rather
// than simply vanishing — a short, bounded animation since it's driven by the
// same phaseTime the engine uses to time the respawn itself.
function drawShatter(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { player, phaseTime } = state;
  const t = Math.min(phaseTime / RESPAWN_DELAY, 1);
  const cx = player.x + PLAYER_W / 2;
  const cy = player.y + PLAYER_H / 2;
  const pieceSize = 9;
  const travel = 26 * t;

  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = PLAYER_BODY;
  for (const { dx, dy } of SHATTER_OFFSETS) {
    const x = cx + dx * travel - pieceSize / 2;
    const y = cy + dy * travel - pieceSize / 2;
    ctx.fillRect(x, y, pieceSize, pieceSize);
  }
  ctx.restore();
}

// How far the player visibly steps into the doorway before disappearing.
const DOOR_WALK_DISTANCE = 16;

// Reaching the real door: first the door swings open with the player still
// fully present (see drawDoorOpening, called from drawDoors before this),
// then — only once it's open — the player steps a little further into the
// doorway while shrinking and fading, rather than vanishing on contact.
function drawEntering(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phaseTime < DOOR_OPEN_DURATION) {
    drawPlayer(ctx, state);
    return;
  }

  const { player, phaseTime, level } = state;
  const doorRect = level === 1 ? LEVEL1_GOAL : LEVEL2_REAL_DOOR;
  const walkSpan = DOOR_ENTER_DELAY - DOOR_OPEN_DURATION;
  const t = walkSpan > 0 ? Math.min((phaseTime - DOOR_OPEN_DURATION) / walkSpan, 1) : 1;
  const dir = doorRect.x + doorRect.w / 2 >= player.x + PLAYER_W / 2 ? 1 : -1;
  const scale = 1 - t;
  const w = PLAYER_W * scale;
  const h = PLAYER_H * scale;
  const centerX = player.x + PLAYER_W / 2 + dir * DOOR_WALK_DISTANCE * t;
  const x = centerX - w / 2;
  const y = player.y + (PLAYER_H - h);

  ctx.save();
  ctx.globalAlpha = scale;
  ctx.fillStyle = PLAYER_BODY;
  radiusedRect(ctx, x, y, w, h, Math.min(8, w / 2, h / 2));
  ctx.fill();
  ctx.restore();
}

// A brief, text-only "Level N" card — identifies the level, nothing more, and
// disappears on its own; no gameplay hints ever ride along with it.
function drawBanner(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.banner) return;
  const fadeStart = LEVEL_BANNER_DURATION - 0.3;
  const alpha = state.banner.timer > fadeStart ? Math.max(0, 1 - (state.banner.timer - fadeStart) / 0.3) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(20,30,40,0.55)";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Level ${state.level}`, VIEWPORT_WIDTH / 2, 40);
  ctx.restore();
}

// The final "you're done" screen: there is no Level 3, so this is where the
// game actually ends, once the Level 2 door-entry animation finishes. Text
// only, no gameplay hints — the player's own restart (any key) or the
// level-select control (still usable from here) are what bring the game back.
function drawCompleteScreen(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== "complete") return;
  ctx.save();
  ctx.fillStyle = "rgba(20,30,40,0.85)";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("You cleared Pip's Detour", VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2 - 18);
  ctx.font = "16px sans-serif";
  ctx.fillText(
    "Press any key, or pick a level above, to play again",
    VIEWPORT_WIDTH / 2,
    VIEWPORT_HEIGHT / 2 + 20,
  );
  ctx.restore();
}

function radiusedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPhaseOverlay(ctx: CanvasRenderingContext2D, phase: GameState["phase"]): void {
  if (phase === "dead") {
    ctx.fillStyle = "rgba(200,30,30,0.18)";
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  } else if (phase === "complete") {
    ctx.fillStyle = "rgba(255,210,63,0.18)";
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  }
}
