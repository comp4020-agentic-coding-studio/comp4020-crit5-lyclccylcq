// DOM wiring for the compact level-select control in the nav bar. Kept apart
// from main.ts's canvas/game-loop setup so it's testable on its own — no
// canvas, no animation frame, just plain DOM in and a level out.
import type { Level } from "./engine.ts";

function levelButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("[data-level]"));
}

function parseLevel(button: HTMLButtonElement): Level | null {
  const value = Number(button.dataset.level);
  return value === 1 || value === 2 ? (value as Level) : null;
}

/** Marks the given level's button as current — the control's only visual state. */
export function setActiveLevel(container: HTMLElement, level: Level): void {
  for (const button of levelButtons(container)) {
    button.setAttribute("aria-pressed", String(parseLevel(button) === level));
  }
}

/** Clicking a level's button reports that level, immediately — no confirmation step. */
export function wireLevelSelect(container: HTMLElement, onSelect: (level: Level) => void): void {
  for (const button of levelButtons(container)) {
    button.addEventListener("click", () => {
      const level = parseLevel(button);
      if (level !== null) onSelect(level);
    });
  }
}
