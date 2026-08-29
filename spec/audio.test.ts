import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { createMusicController, startAutoplayWithFallback } from "../game/audio.ts";
import { wireMusicControls } from "../game/musicControls.ts";
import { createInitialState, step } from "../game/engine.ts";

// A minimal in-memory Storage, standing in for localStorage the same way the
// FakeContext in spec/render.test.ts stands in for CanvasRenderingContext2D —
// no real browser storage needed.
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

// jsdom's <audio> has real, settable `volume`/`muted` properties but its
// play()/pause() are stubs ("not implemented", no state change, no events) —
// so play()/pause() are mocked here to make them observable, exactly like
// jsdom's own docs recommend for HTMLMediaElement in tests.
function buildAudio(dom: JSDOM): HTMLAudioElement {
  const audio = dom.window.document.createElement("audio");
  audio.play = vi.fn(() => Promise.resolve());
  audio.pause = vi.fn();
  return audio;
}

// Mirrors the real markup in index.html closely enough to exercise the same
// selectors game/musicControls.ts relies on — see spec/levelSelect.test.ts
// for the same approach applied to the level-select control.
function buildMusicControls(dom: JSDOM): HTMLElement {
  const container = dom.window.document.createElement("div");
  container.id = "music-controls";
  container.innerHTML = `
    <button type="button" data-music-toggle aria-pressed="false">Play</button>
    <input type="range" data-music-volume min="0" max="1" step="0.01" value="0.5" />
    <button type="button" data-music-mute aria-pressed="false">Mute</button>
  `;
  dom.window.document.body.appendChild(container);
  return container;
}

function dispatch(dom: JSDOM, el: Element, type: string): void {
  el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
}

describe("background music controls", () => {
  it("exposes a play/pause button, a volume control, and a mute control in the DOM", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = buildMusicControls(dom);

    expect(container.querySelector("[data-music-toggle]")).not.toBeNull();
    expect(container.querySelector("[data-music-volume]")).not.toBeNull();
    expect(container.querySelector("[data-music-mute]")).not.toBeNull();
  });

  it("clicking the play/pause button toggles playback without repeated or unhandled autoplay attempts", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const container = buildMusicControls(dom);
    const controller = createMusicController(audio, fakeStorage());
    wireMusicControls(container, controller);

    const toggle = container.querySelector<HTMLButtonElement>("[data-music-toggle]")!;
    expect(controller.isPlaying()).toBe(false);

    dispatch(dom, toggle, "click"); // first click is the user gesture that starts playback
    expect(controller.isPlaying()).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    dispatch(dom, toggle, "click");
    expect(controller.isPlaying()).toBe(false);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    // Never called automatically — only ever in response to the clicks above.
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("stops reporting itself as playing if the browser rejects playback (e.g. autoplay still blocked)", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    audio.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    const container = buildMusicControls(dom);
    const controller = createMusicController(audio, fakeStorage());
    wireMusicControls(container, controller);

    const toggle = container.querySelector<HTMLButtonElement>("[data-music-toggle]")!;
    dispatch(dom, toggle, "click");
    expect(controller.isPlaying()).toBe(true); // optimistic, until the rejection lands

    await Promise.resolve().then(() => Promise.resolve()); // let the rejection's .catch run

    expect(controller.isPlaying()).toBe(false);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("changing the volume slider updates the audio element's volume immediately", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const container = buildMusicControls(dom);
    const controller = createMusicController(audio, fakeStorage());
    wireMusicControls(container, controller);

    const slider = container.querySelector<HTMLInputElement>("[data-music-volume]")!;
    slider.value = "0.2";
    dispatch(dom, slider, "input");

    expect(audio.volume).toBeCloseTo(0.2);
    expect(controller.getVolume()).toBeCloseTo(0.2);
  });

  it("toggling mute updates the audio element's muted state without losing the current volume", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const container = buildMusicControls(dom);
    const controller = createMusicController(audio, fakeStorage());
    wireMusicControls(container, controller);
    controller.setVolume(0.7);

    const muteButton = container.querySelector<HTMLButtonElement>("[data-music-mute]")!;

    dispatch(dom, muteButton, "click");
    expect(audio.muted).toBe(true);
    expect(controller.getVolume()).toBeCloseTo(0.7); // volume itself is untouched by muting
    expect(muteButton.getAttribute("aria-pressed")).toBe("true");

    dispatch(dom, muteButton, "click");
    expect(audio.muted).toBe(false);
    expect(controller.getVolume()).toBeCloseTo(0.7);
    expect(muteButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("persists volume and mute settings to storage and restores them for a freshly created controller", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const storage = fakeStorage();

    const firstController = createMusicController(buildAudio(dom), storage);
    firstController.setVolume(0.3);
    firstController.toggleMute();

    const secondController = createMusicController(buildAudio(dom), storage);
    expect(secondController.getVolume()).toBeCloseTo(0.3);
    expect(secondController.isMuted()).toBe(true);
  });

  it("falls back to sensible defaults when storage is unavailable, without throwing", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const controller = createMusicController(buildAudio(dom), undefined);

    expect(controller.getVolume()).toBeGreaterThan(0);
    expect(controller.isMuted()).toBe(false);
  });

  it("keeps playing, its volume, and its mute state unaffected by level switches, deaths, and respawns", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const controller = createMusicController(audio, fakeStorage());
    controller.play();
    controller.setVolume(0.42);
    controller.toggleMute();

    // Exercise real engine state transitions — level switches, a death, and
    // an auto-respawn — the same churn main.ts drives the game through. The
    // audio controller has no reference to any of this and must not react.
    let state = createInitialState(1);
    state = createInitialState(2); // switch to level 2
    state = { ...state, phase: "dead", phaseTime: 0 }; // die
    for (let i = 0; i < 60; i++) state = step(state, { left: false, right: false, jumpPressed: false }, 1 / 60);
    state = createInitialState(1); // switch back, restart

    expect(state.level).toBe(1); // sanity: the engine churn above actually ran
    expect(controller.isPlaying()).toBe(true);
    expect(controller.getVolume()).toBeCloseTo(0.42);
    expect(controller.isMuted()).toBe(true);
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it("wiring the controls a second time (as a level switch would, if it mistakenly re-wired them) does not recreate the controller's audio element", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const container = buildMusicControls(dom);
    const controller = createMusicController(audio, fakeStorage());
    wireMusicControls(container, controller);
    wireMusicControls(container, controller); // simulate a redundant re-wire

    expect(controller.audio).toBe(audio); // same element, never swapped out
  });

  it("attempts autoplay immediately on page load, without waiting for a user interaction", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const controller = createMusicController(audio, fakeStorage());

    startAutoplayWithFallback(controller, dom.window as unknown as EventTarget);

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(controller.isPlaying()).toBe(true);
  });

  it("falls back to starting music on the first user interaction if autoplay is blocked, without spamming repeated attempts", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    audio.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    const controller = createMusicController(audio, fakeStorage());

    startAutoplayWithFallback(controller, dom.window as unknown as EventTarget);
    expect(audio.play).toHaveBeenCalledTimes(1); // the one, sole autoplay attempt

    await Promise.resolve().then(() => Promise.resolve()); // let the rejection land
    expect(controller.isPlaying()).toBe(false);

    // Simulate the browser now permitting playback, as it would after a real
    // gesture — the first interaction anywhere on the page retries once.
    audio.play = vi.fn(() => Promise.resolve());
    dispatch(dom, dom.window.document.body, "keydown");

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(controller.isPlaying()).toBe(true);

    // A second interaction must not trigger yet another attempt — the
    // one-shot fallback listener already removed itself after firing once.
    dispatch(dom, dom.window.document.body, "click");
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("does not arm a fallback retry at all once autoplay itself succeeds", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const audio = buildAudio(dom);
    const controller = createMusicController(audio, fakeStorage());

    startAutoplayWithFallback(controller, dom.window as unknown as EventTarget);
    await Promise.resolve().then(() => Promise.resolve());
    expect(controller.isPlaying()).toBe(true);

    dispatch(dom, dom.window.document.body, "click");
    dispatch(dom, dom.window.document.body, "keydown");

    // Autoplay already succeeded, so no interaction should trigger another
    // play() call.
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
