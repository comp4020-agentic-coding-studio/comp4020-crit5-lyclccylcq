// Canvas drawing only. Takes a GameState and paints it — no rule logic here,
// so a change of visual style never touches engine.ts.
import {
  LEVEL1_GOAL,
  LEVEL1_GROUND_SEGMENTS,
  LEVEL1_SPIKE_HAZARD,
  LEVEL2_FAKE_DOOR,
  LEVEL2_REAL_DOOR,
  LEVEL2_GROUND_SEGMENTS,
  LEVEL2_HIDDEN_BLOCK,
  LEVEL2_SPIKE_ZONE,
  LEVEL2_COLLAPSE_TILE,
  LEVEL2_STEP_1,
  LEVEL2_STEP_2,
  LEVEL2_STEP_3,
  LEVEL2_CHASM_1,
  LEVEL2_CHASM_2,
  PLATFORM_BREAK_DELAY,
  PLAYER_H,
  PLAYER_W,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  isGone,
  spikesUp,
} from "./engine.ts";
import type { GameState, Rect } from "./engine.ts";

const SKY_TOP = "#bdeaff";
const SKY_BOTTOM = "#e9f9ff";
const GROUND_TOP = "#6fcf6f";
const GROUND_BODY = "#8a5a3c";
const CRACK_TOP = "#b7d98a";
const PLAYER_BODY = "#ff8a3d";
const PLAYER_EYE = "#20303a";
const SPIKE_COLOR = "#e8453c";
const DOOR_FRAME = "#4a3826";
const DOOR_PANEL = "#3fae5a";
const DOOR_KNOB = "#f4e4b8";
const WALL_BLOCKED = "#6b5a4a";
const WALL_PLANK = "#4a3826";

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
  ctx.translate(-camera, 0);

  drawClouds(ctx, camera);
  drawGround(ctx, state);
  drawHiddenBlock(ctx, state);
  drawSpikeHazards(ctx, state);
  drawDoors(ctx, state);
  drawPlayer(ctx, state);

  ctx.restore();

  drawPhaseOverlay(ctx, state.phase);
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
  const { x, y, w, h } = rect;
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
    for (const seg of LEVEL1_GROUND_SEGMENTS) groundSlab(ctx, seg, false);
    return;
  }
  for (const seg of LEVEL2_GROUND_SEGMENTS) groundSlab(ctx, seg, false);
  if (!isGone(state.traps.collapse)) {
    // Always drawn as ordinary ground, armed or not — no crack ever shows
    // before the tile actually gives way, only the abrupt disappearance once
    // it's gone.
    groundSlab(ctx, LEVEL2_COLLAPSE_TILE, false);
  }

  // The staircase: the two lower steps are permanently safe and drawn as
  // plain ground. The top step looks identical until it's been landed on —
  // only then does it switch to a "breaking" look, and only until it's gone.
  groundSlab(ctx, LEVEL2_STEP_1, false);
  groundSlab(ctx, LEVEL2_STEP_2, false);
  if (!isGone(state.traps.platform, PLATFORM_BREAK_DELAY)) {
    groundSlab(ctx, LEVEL2_STEP_3, state.traps.platform.triggered);
  }

  // The chasm platforms: both permanently safe, drawn as a distinct floating
  // slab rather than a ground column.
  floatingPlatform(ctx, LEVEL2_CHASM_1, false);
  floatingPlatform(ctx, LEVEL2_CHASM_2, false);
}

function drawHiddenBlock(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.level !== 2 || !state.traps.hiddenBlock.triggered) return; // invisible until it's been hit
  ctx.fillStyle = "#c98a4b";
  ctx.fillRect(LEVEL2_HIDDEN_BLOCK.x, LEVEL2_HIDDEN_BLOCK.y, LEVEL2_HIDDEN_BLOCK.w, LEVEL2_HIDDEN_BLOCK.h);
  ctx.strokeStyle = "#8a5a2c";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    LEVEL2_HIDDEN_BLOCK.x + 1,
    LEVEL2_HIDDEN_BLOCK.y + 1,
    LEVEL2_HIDDEN_BLOCK.w - 2,
    LEVEL2_HIDDEN_BLOCK.h - 2,
  );
}

function drawSpikeTriangles(ctx: CanvasRenderingContext2D, zone: Rect): void {
  const count = 4;
  const step = zone.w / count;
  ctx.fillStyle = SPIKE_COLOR;
  for (let i = 0; i < count; i++) {
    const baseX = zone.x + i * step;
    ctx.beginPath();
    ctx.moveTo(baseX, zone.y + zone.h);
    ctx.lineTo(baseX + step / 2, zone.y);
    ctx.lineTo(baseX + step, zone.y + zone.h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSpikeHazards(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.level === 1) {
    drawSpikeTriangles(ctx, LEVEL1_SPIKE_HAZARD);
    return;
  }
  if (spikesUp(state.traps.spikes)) drawSpikeTriangles(ctx, LEVEL2_SPIKE_ZONE);
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
  if (state.level === 1) {
    drawDoor(ctx, LEVEL1_GOAL);
    return;
  }
  if (state.traps.fakeDoor.triggered) {
    drawBlockedDoor(ctx, LEVEL2_FAKE_DOOR);
    drawDoor(ctx, LEVEL2_REAL_DOOR);
  } else {
    drawDoor(ctx, LEVEL2_FAKE_DOOR);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { player, phase } = state;
  const squash = phase === "playing" && Math.abs(player.vy) > 200 ? 0.85 : 1;
  const w = PLAYER_W;
  const h = PLAYER_H * squash;
  const x = player.x;
  const y = player.y + (PLAYER_H - h);

  ctx.fillStyle = phase === "dead" ? "#c94b4b" : PLAYER_BODY;
  radiusedRect(ctx, x, y, w, h, 8);
  ctx.fill();

  const eyeOffset = player.facing === 1 ? 6 : -6;
  ctx.fillStyle = PLAYER_EYE;
  ctx.beginPath();
  ctx.arc(x + w / 2 + eyeOffset, y + h * 0.35, 2.6, 0, Math.PI * 2);
  ctx.fill();
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
  } else if (phase === "won") {
    ctx.fillStyle = "rgba(255,210,63,0.18)";
    ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  }
}
