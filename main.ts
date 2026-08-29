import {
  createInitialState,
  step,
  cameraX,
  levelWidth,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
} from "./game/engine.ts";
import type { GameState, Input, Level } from "./game/engine.ts";
import { render } from "./game/render.ts";
import { setActiveLevel, wireLevelSelect } from "./game/levelSelect.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing #game canvas");
canvas.width = VIEWPORT_WIDTH;
canvas.height = VIEWPORT_HEIGHT;
const context = canvas.getContext("2d");
if (!context) throw new Error("2d context unavailable");
const ctx: CanvasRenderingContext2D = context;

let state: GameState = createInitialState(1);

const deathCount = document.querySelector<HTMLElement>("#death-count");
function updateDeathCount(): void {
  if (deathCount) deathCount.textContent = `Deaths: ${state.deaths}`;
}
updateDeathCount();

const held = { left: false, right: false };
let jumpQueued = false;

const LEFT_KEYS = new Set(["arrowleft", "a"]);
const RIGHT_KEYS = new Set(["arrowright", "d"]);
const JUMP_KEYS = new Set([" ", "space"]);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (LEFT_KEYS.has(key)) held.left = true;
  else if (RIGHT_KEYS.has(key)) held.right = true;
  else if (JUMP_KEYS.has(key)) {
    if (state.phase === "playing") jumpQueued = true;
    event.preventDefault(); // stop the page from scrolling on spacebar
  }
  if (state.phase === "complete" && (held.left || held.right || JUMP_KEYS.has(key))) {
    restartTo(1); // clearing the game replays it from Level 1
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (LEFT_KEYS.has(key)) held.left = false;
  else if (RIGHT_KEYS.has(key)) held.right = false;
});

function restartTo(level: Level): void {
  state = createInitialState(level);
  document.body.dataset.gameState = state.phase;
  updateDeathCount();
}

document.body.dataset.gameState = state.phase;

const levelSelect = document.querySelector<HTMLElement>("#level-select");
if (levelSelect) {
  setActiveLevel(levelSelect, state.level);
  wireLevelSelect(levelSelect, (level) => {
    restartTo(level);
    setActiveLevel(levelSelect, level);
  });
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  if (state.phase !== "complete") {
    const input: Input = { left: held.left, right: held.right, jumpPressed: jumpQueued };
    jumpQueued = false;
    const previousPhase = state.phase;
    const previousDeaths = state.deaths;
    state = step(state, input, dt);
    if (previousPhase !== state.phase) document.body.dataset.gameState = state.phase;
    if (previousDeaths !== state.deaths) updateDeathCount();
  } else {
    jumpQueued = false;
  }

  render(ctx, state, cameraX(state.player.x, levelWidth(state.level)));
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
