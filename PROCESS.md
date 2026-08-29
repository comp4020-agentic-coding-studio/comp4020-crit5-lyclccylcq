# Process overview

## What I built

Pip's Detour is a tiny browser platformer about distrust. It starts with the
most ordinary platform-game vocabulary I could use: a character, ground, gaps,
walls, doors, and clouds. The game then turns those familiar objects into traps:
ground gives way, a cloud drops, a fence starts chasing, a door lies, and the
actual exit appears only after the player has learned to bait the fake one. My
goal was not to make a large game, but to make a short one that teaches itself
through play and still has enough reversals to stay interesting after the first
ten seconds.

## The moments that mattered

### Starting with the brief as a harness

Before building the final interactions, I translated the Crit 5 requirements
into checks: no tutorial pages, a real game page, losing states, ending states,
and one explicitly tested rule. That made the brief part of the development
environment rather than something I tried to remember at the end. The important
decision here was to let tests describe the assignment contract while the game
was still incomplete, so later changes had to keep satisfying the same basic
shape. Evidence:
[`a81f135`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-lyclccylcq/commit/a81f135).

### Making the first prototype playable, then less predictable

The first working version established the game loop: movement, jumping,
collisions, level transitions, death, and a finish condition. Once that existed,
I shifted the design away from a normal platformer and toward a game where the
player learns by being tricked once, then adapting. I added traps that are
legible only after the player tests them, and paired them with regression tests
for timing, reset behaviour, and whether the level can still be completed.
Evidence:
[`53eb76f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-lyclccylcq/commit/53eb76f).

### Correcting traps from play feedback

Several Level 2 traps only became clear after playing the finished screen, not
just reading the code. The moving platform could trigger from the wrong place,
the pit/cloud trap was either too forgiving or too punishing, hidden platforms
left confusing visual leftovers, and the fake door needed to look exactly like
a real door until the bait worked. I treated those as design bugs rather than
small tuning preferences. The fixes tightened trigger zones, removed leftover
hidden platforms, made the falling cloud escapable by baiting, kept the real
door hidden until the fake door reveals itself, and expanded the viewport
without stretching the ground art. Evidence:
[`a04b765`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-lyclccylcq/commit/a04b765).

### Avoiding a fake Level 3

Once Level 2 could be cleared, the game briefly behaved as if another level
should load. That made the ending feel broken instead of intentional. I changed
the state machine so clearing Level 2 produces a stable complete state, and I
added tests around level selection, completion, and rendering so the game cannot
quietly drift back into trying to advance beyond the levels I actually built.
Evidence:
[`db4cc6d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-lyclccylcq/commit/db4cc6d).

### Turning polish into game rules

The final visible changes were not just decoration. Moving the name into a
compact logo made the game screen feel less like a labelled prototype. Replacing
the left staircase with a fence trap also gave Level 1 the same comic cruelty as
Level 2: the object sits harmlessly until the player has jumped past it, then
chases toward the cliff fast enough to matter. I kept that rule in tests too,
including the start position, chase trigger, speed, cliff fall, and reset after
death. Evidence:
[`5e13c84`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-lyclccylcq/commit/5e13c84).

## Current checks

Before this process write-up, the implementation passed `pnpm check`: typecheck,
production build, and the Vitest suite all completed successfully. The evidence
check was the remaining red gate because this file was still the template and
`reflections/crit-5.md` was missing; this pass replaces those placeholders with
traceable process evidence.
