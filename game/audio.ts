// Page-level background music. Deliberately knows nothing about GameState —
// no level, no phase, no trap — because it must survive every death,
// respawn, and level switch untouched. Create one controller once (in
// main.ts) and reuse it for the life of the page; nothing here ever gets
// recreated when the game itself resets.

const VOLUME_KEY = "pipsdetour:music-volume";
const MUTED_KEY = "pipsdetour:music-muted";
const DEFAULT_VOLUME = 0.5;

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, volume));
}

function readStoredVolume(storage: Storage | undefined): number {
  if (!storage) return DEFAULT_VOLUME;
  try {
    const raw = storage.getItem(VOLUME_KEY);
    return raw === null ? DEFAULT_VOLUME : clampVolume(Number(raw));
  } catch {
    return DEFAULT_VOLUME; // storage can be unavailable (private browsing, disabled cookies)
  }
}

function readStoredMuted(storage: Storage | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStored(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Settings just won't be remembered next visit — music still works now.
  }
}

export interface MusicController {
  readonly audio: HTMLAudioElement;
  /** Returns the underlying play() promise (if the browser gives one) so a
   *  caller — see startAutoplayWithFallback below — can tell whether this
   *  particular attempt was actually accepted or blocked. */
  play(): Promise<void> | undefined;
  pause(): void;
  togglePlay(): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  isPlaying(): boolean;
  isMuted(): boolean;
  getVolume(): number;
  /** Fires after any state change (play/pause, volume, mute) — including an
   *  autoplay rejection landing asynchronously after the fact. Returns an
   *  unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

function resolveDefaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // some environments throw just accessing the global
  }
}

/**
 * Creates the single page-level music controller wrapping one
 * HTMLAudioElement. Call this once at startup and reuse the result —
 * repeated game restarts, deaths, and level switches must never call this
 * again or touch the returned controller.
 */
export function createMusicController(
  audio: HTMLAudioElement,
  storage: Storage | undefined = resolveDefaultStorage(),
): MusicController {
  audio.loop = true;
  audio.volume = readStoredVolume(storage);
  audio.muted = readStoredMuted(storage);

  // Tracked separately from audio.paused: play() is asynchronous (and may
  // reject if the browser is still withholding an autoplay gesture), so the
  // UI needs a value it can read back synchronously right after a click.
  let requestedToPlay = false;
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((listener) => listener());

  function play(): Promise<void> | undefined {
    requestedToPlay = true;
    notify();
    // Called both from a real user gesture (game/musicControls.ts) and as
    // the initial autoplay attempt (startAutoplayWithFallback below) — either
    // way playback can fail (no gesture yet as far as the browser's
    // concerned, decode error), and a rejected promise here must never
    // surface as an unhandled rejection or trigger a retry loop on its own.
    let result: Promise<void> | undefined;
    try {
      result = audio.play();
    } catch {
      requestedToPlay = false;
      notify();
      return undefined;
    }
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        requestedToPlay = false;
        notify();
      });
    }
    return result;
  }

  function pause(): void {
    requestedToPlay = false;
    audio.pause();
    notify();
  }

  function togglePlay(): void {
    if (requestedToPlay) pause();
    else play();
  }

  function setVolume(volume: number): void {
    const clamped = clampVolume(volume);
    audio.volume = clamped;
    writeStored(storage, VOLUME_KEY, String(clamped));
    notify();
  }

  function toggleMute(): void {
    audio.muted = !audio.muted; // volume itself is untouched — muting never loses it
    writeStored(storage, MUTED_KEY, String(audio.muted));
    notify();
  }

  function isPlaying(): boolean {
    return requestedToPlay;
  }

  function isMuted(): boolean {
    return audio.muted;
  }

  function getVolume(): number {
    return audio.volume;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { audio, play, pause, togglePlay, setVolume, toggleMute, isPlaying, isMuted, getVolume, subscribe };
}

const FIRST_INTERACTION_EVENTS = ["click", "keydown", "touchstart"] as const;

/**
 * Attempts to start background music immediately (autoplay on page load). If
 * the browser blocks it — a rejected play() promise, or a browser too old to
 * return one at all while still failing synchronously — arms a one-shot
 * listener for the first user interaction (click, keydown, or touch) and
 * retries exactly once there, then removes itself either way. Never retries
 * beyond that single fallback attempt, so a persistently blocked page never
 * spams repeated play() calls or unhandled rejections.
 */
export function startAutoplayWithFallback(controller: MusicController, target: EventTarget): void {
  function armFallback(): void {
    for (const type of FIRST_INTERACTION_EVENTS) {
      target.addEventListener(type, retryOnFirstInteraction, { once: true });
    }
  }

  function retryOnFirstInteraction(): void {
    for (const type of FIRST_INTERACTION_EVENTS) {
      target.removeEventListener(type, retryOnFirstInteraction);
    }
    if (!controller.isPlaying()) controller.play();
  }

  const result = controller.play();
  if (!result) {
    // No promise came back at all — either a synchronous failure controller
    // .play() already caught (isPlaying() is back to false), or a browser
    // that doesn't return one but still played synchronously (isPlaying()
    // stays true, nothing to fall back to).
    if (!controller.isPlaying()) armFallback();
    return;
  }
  result.catch(() => armFallback());
}
