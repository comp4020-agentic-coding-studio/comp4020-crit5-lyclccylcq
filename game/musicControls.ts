// DOM wiring for the compact background-music controls in the nav bar. Kept
// apart from main.ts, same reasoning as game/levelSelect.ts: testable on its
// own, no canvas, no animation frame — a MusicController in, button/slider
// behaviour out. Knows nothing about GameState, matching game/audio.ts.
import type { MusicController } from "./audio.ts";

/** Wires the play/pause, volume, and mute controls inside `container` to `controller`. */
export function wireMusicControls(container: HTMLElement, controller: MusicController): void {
  const playButton = container.querySelector<HTMLButtonElement>("[data-music-toggle]");
  const muteButton = container.querySelector<HTMLButtonElement>("[data-music-mute]");
  const volumeSlider = container.querySelector<HTMLInputElement>("[data-music-volume]");

  function render(): void {
    if (playButton) {
      const playing = controller.isPlaying();
      playButton.textContent = playing ? "⏸" : "▶";
      playButton.setAttribute("aria-pressed", String(playing));
      const label = playing ? "Pause music" : "Play music";
      playButton.setAttribute("aria-label", label);
      playButton.title = label;
    }
    if (muteButton) {
      const muted = controller.isMuted();
      muteButton.textContent = muted ? "🔇" : "🔊";
      muteButton.setAttribute("aria-pressed", String(muted));
      const label = muted ? "Unmute music" : "Mute music";
      muteButton.setAttribute("aria-label", label);
      muteButton.title = label;
    }
    if (volumeSlider && container.ownerDocument.activeElement !== volumeSlider) {
      volumeSlider.value = String(controller.getVolume());
    }
  }

  playButton?.addEventListener("click", () => controller.togglePlay());
  muteButton?.addEventListener("click", () => controller.toggleMute());
  volumeSlider?.addEventListener("input", () => controller.setVolume(Number(volumeSlider.value)));

  controller.subscribe(render);
  render();
}
