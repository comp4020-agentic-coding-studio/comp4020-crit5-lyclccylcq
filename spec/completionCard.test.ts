import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { updateCompletionCard, wireCompletionCard } from "../game/completionCard.ts";
import { createMusicController } from "../game/audio.ts";
import { createInitialState } from "../game/engine.ts";
import type { GameState } from "../game/engine.ts";

// Mirrors the real markup in index.html closely enough to exercise the same
// selectors game/completionCard.ts relies on — see spec/levelSelect.test.ts
// for the same approach applied to the level-select control.
function buildCompletionCard(dom: JSDOM): HTMLElement {
  const card = dom.window.document.createElement("div");
  card.id = "completion-card";
  card.hidden = true;
  card.innerHTML = `
    <div class="completion-card-inner">
      <h2>You cleared Pip's Detour</h2>
      <p data-completion-deaths></p>
      <div class="completion-actions">
        <a href="./" data-completion-home class="completion-home">Home</a>
        <button type="button" data-completion-play-again>Play Again</button>
      </div>
    </div>
  `;
  dom.window.document.body.appendChild(card);
  return card;
}

function click(dom: JSDOM, el: Element): void {
  el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

describe("completion card", () => {
  it("stays hidden while the game is still in progress, in any non-complete phase", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);

    updateCompletionCard(card, createInitialState(1));
    expect(card.hidden).toBe(true);

    updateCompletionCard(card, { ...createInitialState(2), phase: "dead", phaseTime: 0.1 });
    expect(card.hidden).toBe(true);

    updateCompletionCard(card, { ...createInitialState(2), phase: "entering", phaseTime: 0.1 });
    expect(card.hidden).toBe(true);
  });

  it("renders once the game reaches the complete phase, showing the run's final death count", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);
    const state: GameState = { ...createInitialState(2), phase: "complete", phaseTime: 0, deaths: 5 };

    updateCompletionCard(card, state);

    expect(card.hidden).toBe(false);
    expect(card.querySelector("[data-completion-deaths]")?.textContent).toBe("Deaths: 5");
    expect(card.querySelector("h2")?.textContent).toBe("You cleared Pip's Detour");
  });

  it("hides again once a subsequent update reports a non-complete phase (e.g. after Play Again or level select)", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);
    updateCompletionCard(card, { ...createInitialState(2), phase: "complete", phaseTime: 0 });
    expect(card.hidden).toBe(false);

    updateCompletionCard(card, createInitialState(1));

    expect(card.hidden).toBe(true);
  });

  it("exposes a Home link using the same destination as the page's existing Home nav link", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);

    const home = card.querySelector("[data-completion-home]");
    expect(home).not.toBeNull();
    expect(home?.getAttribute("href")).toBe("./");
  });

  it("clicking Play Again fires the callback exactly once per click", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);
    let calls = 0;
    wireCompletionCard(card, () => {
      calls++;
    });

    const playAgain = card.querySelector<HTMLButtonElement>("[data-completion-play-again]")!;
    click(dom, playAgain);
    expect(calls).toBe(1);

    click(dom, playAgain);
    expect(calls).toBe(2);
  });

  it("Play Again restarts from Level 1 with death count and all level/trap state reset", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);
    // A state as if the run just finished, mid-mess: deaths racked up, traps
    // from Level 2 left triggered, banner already gone.
    let state: GameState = {
      ...createInitialState(2),
      phase: "complete",
      phaseTime: 0,
      deaths: 7,
      traps: {
        collapse: { triggered: true, timer: 0.3 },
        spikes: { triggered: true, timer: 1 },
        fakeDoor: { triggered: true, timer: 0 },
        platform: { triggered: true, timer: 0.1 },
        chasmPlatform: { triggered: true, timer: 0.9 },
        pitCloud: { triggered: true, timer: 0.9 },
      },
      banner: null,
    };

    wireCompletionCard(card, () => {
      state = createInitialState(1);
      updateCompletionCard(card, state);
    });
    click(dom, card.querySelector<HTMLButtonElement>("[data-completion-play-again]")!);

    expect(state.level).toBe(1);
    expect(state.phase).toBe("playing");
    expect(state.deaths).toBe(0);
    for (const [name, trap] of Object.entries(state.traps)) {
      // Level 1's wall-spike hazard is intentionally pre-armed the instant the
      // level loads (see createInitialState) — every other trap starts cold.
      expect(trap.triggered, name).toBe(name === "spikes");
      expect(trap.timer, name).toBe(0);
    }
    expect(card.hidden).toBe(true);
  });

  it("does not stop or recreate the background music when the card is shown, or when Play Again is clicked", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const card = buildCompletionCard(dom);
    const audio = dom.window.document.createElement("audio");
    audio.play = vi.fn(() => Promise.resolve());
    audio.pause = vi.fn();
    // Created once, same as main.ts does — neither updateCompletionCard nor
    // wireCompletionCard take any reference to it, so it should be completely
    // unaffected by either.
    const controller = createMusicController(audio);
    controller.play();

    updateCompletionCard(card, { ...createInitialState(2), phase: "complete", phaseTime: 0 });
    expect(card.hidden).toBe(false);
    expect(controller.isPlaying()).toBe(true);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalledTimes(1); // still just the one call, from controller.play() above

    let state: GameState = createInitialState(2);
    wireCompletionCard(card, () => {
      state = createInitialState(1);
      updateCompletionCard(card, state);
    });
    card.querySelector<HTMLButtonElement>("[data-completion-play-again]")!.click();

    expect(state.level).toBe(1);
    expect(controller.isPlaying()).toBe(true);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
