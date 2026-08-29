# Crit 5 reflection

The breakthrough was realising that a tiny game does not need more mechanics to
feel complete; it needs a clear conversation with the player's expectations. I
started with familiar platformer objects, then made them behave in slightly
untrustworthy ways: a door can be fake, a cloud can fall, and a fence can wait
until it is safely behind the player before chasing. That made the game teach
itself without visible instructions. The strongest improvement came from
playtesting the finished-looking version and treating discomfort as evidence.
When traps triggered too early, became impossible to dodge, or left confusing
visual leftovers, I turned those observations into specific rules and tests.

This changed what I want to be as a software developer by making me care more
about the felt result, not only whether the code technically works. A passing
collision system is not enough if the player cannot read why they died or if the
ending feels stuck. I want to keep using tools and tests as a way to protect
design judgement: notice the experience that is wrong, name it precisely, and
then make the code and the harness hold that decision in place.
