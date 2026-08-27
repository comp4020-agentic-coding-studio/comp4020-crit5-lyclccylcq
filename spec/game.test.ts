import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Crit 5 — "A game":
// https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// Mechanically checkable lines only. Left to the crit, because only a person
// can judge them: whether the opening screen actually makes the first move
// obvious, and whether a stranger reaches an ending inside five minutes.

const DIST = resolve("dist");

function shippedHtmlFiles(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return shippedHtmlFiles(path);
    return path.endsWith(".html") ? [path] : [];
  });
}

const pages = shippedHtmlFiles().map((path) => ({
  path,
  doc: new JSDOM(readFileSync(path, "utf8")).window.document,
}));

describe("no tutorial anywhere", () => {
  const tutorialWords = /instructions|tutorial|how\s*to\s*play|help/i;

  it("has no on-screen instructions text on any shipped page", () => {
    for (const { path, doc } of pages) {
      expect(doc.body.textContent ?? "", `${path} reads like a how-to`).not.toMatch(
        tutorialWords,
      );
    }
  });

  it("ships no separate instructions/help/tutorial page", () => {
    for (const { path } of pages) {
      expect(path, "a standalone how-to-play page defeats the no-tutorial rule").not.toMatch(
        tutorialWords,
      );
    }
  });
});

describe("play can be lost", () => {
  // CONTRACT: adjust this to whatever your mechanic actually uses once you've
  // picked it. The convention assumed here — a `data-game-state` attribute on
  // <body>, "playing" until an ending is reached — is a placeholder, not a
  // requirement; rename it to match your build and these two tests still do
  // their job of holding you to "a wrong move is possible, and play ends
  // somewhere".
  it("starts in a playing state", () => {
    const home = pages.find(({ path }) => path.endsWith("index.html"));
    expect(home, "no index.html in dist").toBeTruthy();
    expect(home?.doc.body.dataset.gameState).toBe("playing");
  });

  it.todo(
    "a losing move reaches an ended state (won/lost/finished) — write this once the mechanic is built",
  );
});
