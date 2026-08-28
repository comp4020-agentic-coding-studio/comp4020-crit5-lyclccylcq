import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { setActiveLevel, wireLevelSelect } from "../game/levelSelect.ts";
import { createInitialState, LEVEL1_SPAWN, LEVEL2_SPAWN } from "../game/engine.ts";
import type { GameState, Level } from "../game/engine.ts";

// Mirrors the real markup in index.html closely enough to exercise the same
// selectors the wiring functions rely on, without needing a canvas or a
// running game loop — see game/levelSelect.ts.
function buildLevelSelect(dom: JSDOM): HTMLElement {
  const container = dom.window.document.createElement("div");
  container.id = "level-select";
  container.innerHTML = `
    <button type="button" data-level="1" aria-pressed="true">Level 1</button>
    <button type="button" data-level="2" aria-pressed="false">Level 2</button>
  `;
  dom.window.document.body.appendChild(container);
  return container;
}

function click(dom: JSDOM, button: Element): void {
  button.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

function buttonFor(container: HTMLElement, level: Level): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-level="${level}"]`);
  if (!button) throw new Error(`no button for level ${level}`);
  return button;
}

describe("level select control", () => {
  it("marks only the current level's button as pressed", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = buildLevelSelect(dom);

    setActiveLevel(container, 2);

    expect(buttonFor(container, 1).getAttribute("aria-pressed")).toBe("false");
    expect(buttonFor(container, 2).getAttribute("aria-pressed")).toBe("true");
  });

  it("selecting Level 1 restarts the game at Level 1", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = buildLevelSelect(dom);
    let state: GameState = createInitialState(2);

    wireLevelSelect(container, (level) => {
      state = createInitialState(level);
      setActiveLevel(container, level);
    });
    click(dom, buttonFor(container, 1));

    expect(state.level).toBe(1);
    expect(state.phase).toBe("playing");
    expect(state.player.x).toBe(LEVEL1_SPAWN.x);
    expect(buttonFor(container, 1).getAttribute("aria-pressed")).toBe("true");
    expect(buttonFor(container, 2).getAttribute("aria-pressed")).toBe("false");
  });

  it("selecting Level 2 restarts the game at Level 2", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = buildLevelSelect(dom);
    let state: GameState = createInitialState(1);

    wireLevelSelect(container, (level) => {
      state = createInitialState(level);
      setActiveLevel(container, level);
    });
    click(dom, buttonFor(container, 2));

    expect(state.level).toBe(2);
    expect(state.phase).toBe("playing");
    expect(state.player.x).toBe(LEVEL2_SPAWN.x);
    expect(buttonFor(container, 2).getAttribute("aria-pressed")).toBe("true");
    expect(buttonFor(container, 1).getAttribute("aria-pressed")).toBe("false");
  });

  it("switching levels resets every trap and the player, not just the level number", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = buildLevelSelect(dom);
    // A state as if mid-playthrough: several Level 2 traps already sprung,
    // the player off in the middle of the level, banner already gone.
    let state: GameState = {
      ...createInitialState(2),
      player: { x: 2210, y: 40, vx: -320, vy: 150, onGround: false, facing: -1 },
      traps: {
        collapse: { triggered: true, timer: 0.3 },
        hiddenBlock: { triggered: true, timer: 0 },
        spikes: { triggered: true, timer: 1 },
        fakeDoor: { triggered: true, timer: 0 },
        platform: { triggered: true, timer: 0.1 },
        chasmPlatform: { triggered: true, timer: 0.9 },
        pitBlocker: { triggered: true, timer: 0.9 },
      },
      banner: null,
    };

    wireLevelSelect(container, (level) => {
      state = createInitialState(level);
    });
    click(dom, buttonFor(container, 2));

    expect(state.level).toBe(2);
    expect(state.player).toEqual({
      x: LEVEL2_SPAWN.x,
      y: LEVEL2_SPAWN.y,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
    });
    for (const trap of Object.values(state.traps)) {
      expect(trap.triggered).toBe(false);
      expect(trap.timer).toBe(0);
    }
    expect(state.phase).toBe("playing");
    expect(state.phaseTime).toBe(0);
    expect(state.banner).toEqual({ timer: 0 });
  });
});
