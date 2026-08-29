// DOM wiring for the end-of-game completion card. Kept apart from main.ts,
// same reasoning as game/levelSelect.ts and game/musicControls.ts — testable
// on its own, no canvas, no animation frame: a GameState in, a shown/hidden
// card (and its final death count) out, plus a "play again" callback.
import type { GameState } from "./engine.ts";

/** Shows/hides the card to match the current phase, and — while shown —
 *  fills in the run's final death count. Call this whenever the phase
 *  changes; a no-op the rest of the time. */
export function updateCompletionCard(card: HTMLElement, state: GameState): void {
  const complete = state.phase === "complete";
  card.hidden = !complete;
  if (!complete) return;
  const deaths = card.querySelector("[data-completion-deaths]");
  if (deaths) deaths.textContent = `Deaths: ${state.deaths}`;
}

/**
 * Wires the card's "Play Again" button to `onPlayAgain`. The "Home" link
 * needs no wiring of its own — it's a plain `<a href="./">`, the same
 * destination as the nav's existing Home link, and the browser handles it.
 */
export function wireCompletionCard(card: HTMLElement, onPlayAgain: () => void): void {
  const playAgain = card.querySelector<HTMLButtonElement>("[data-completion-play-again]");
  playAgain?.addEventListener("click", () => onPlayAgain());
}
