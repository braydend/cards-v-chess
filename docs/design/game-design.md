# Cards V Chess — Game Design

**Living document.** This is the single source of truth for what the game currently is, and it holds the only canonical list of open questions.

It deliberately does **not** record history. For why a decision was made, and what was considered and rejected, see the dated decision records in [`docs/superpowers/specs/`](../superpowers/specs/) — those are frozen and never updated.

If this document and anything else disagree, this document wins. If it contradicts *itself*, that is a bug — fix it.

## Concept

A web-based 3D tower defense game with trading-card-game mechanics. Two factions, and the name is literal:

- **Cards** — the player. A standard 54-card deck is the arsenal.
- **Chess** — the AI attacker. Chess pieces invade in Rounds, each type mapping a real chess trait onto a tower-defense threat.

It is a **one-sided defense**. The player is always Cards; Chess is always the attacker. There is no mode where the player commands chess pieces.

The player defends the **Core**. A Piece that reaches it causes a **leak** and damages it. When the Core falls, the run ends.

## The board

The board starts **8×8** and **gains a rank every time an Ace is played**, so its size is not fixed for a run and it is no longer a literal chessboard. Only ranks grow, never files.

The Core stays on rank 0 and Pieces enter from whatever the far rank currently is, so growth lengthens the run to the Core and buys Towers more shots. That is the Ace's whole effect.

Growing the board retires the *thematic* claim to a true chessboard, deliberately. Nothing mechanical is lost: **square colour is `(file + rank)` parity**, so the checker pattern survives a rectangular board intact. Nothing keys off colour today — the Knight is damageable on every square — so the pattern is preserved for chess-authenticity alone; see "Board geometry" in the open questions.

## The card system

### Grammar

The deck is a **standard 54-card deck** — ranks 2 through 10, Jack, Queen, King, Ace, and two Jokers. Not bespoke designed cards.

Every card is **modal**. Playing it means choosing one of two uses:

> **Rank builds. Suit supports.**

- Played for its **rank**, a numbered card builds a Tower whose firing geometry and power come from that rank. A face card or an Ace performs its own action instead of building.
- Played for its **suit**, any standard card applies a support action to a Tower already on the board.

So the 5♦ either builds a rank-5 Tower or speeds up a Tower you already have. The choice happens at play time. A Joker is not modal: it has neither rank nor suit, and exactly one action.

**The never-stuck property is no longer complete.** It used to read: because every card can always build, the player can never be stuck holding only support cards with nothing to support. Jack and Queen both need a Tower already standing, so a Deck worn down to only those two with an empty board holds cards that cannot be played.

That is **not a softlock** — rounds still start, standing Towers still fire, and the run continues — but those cards do nothing until a Tower exists. Because copies are unlimited and cards come from random packs, it is reachable rather than theoretical. It is recorded rather than closed: giving Jack and Queen a build fallback would blur "face cards change kind" for a rare case.

Preserve the rest of the property. Ranks 2–10, King, Ace and the Jokers are all playable from an empty board, so a Deck holding any of them is never dead.

### Suit actions

| Suit | Action on a Tower |
| --- | --- |
| ♥ Hearts | **Repair** — restore a Tower to full health |
| ♦ Diamonds | **Speed** — increase fire rate |
| ♠ Spades | **Health** — increase current and maximum health together |
| ♣ Clubs | **Damage** — increase damage |

**A numbered Card supports only a Tower of its own rank.** A 5♥ repairs a rank-5 Tower and nothing else; a 7♥ cannot touch it. This is what makes the ranks in a Deck mean something after build time — without it, rank is inert the moment a Tower exists, and any ♥ sustains any Tower. It is a deckbuilding constraint, not a magnitude one: what a support is worth never depends on which Tower it lands on.

**Face cards are exempt and support any Tower.** A Tower's rank is always 2–10, so strict equality would make J♠, Q♦, K♣ and A♥ unplayable for their suit entirely. The exemption is what keeps a face card worth weighing for its suit as well as for its action, and it gives face suits a job no numbered card has: the support that works anywhere.

**Supports are flat, and nothing scales with rank.** Not the Card's rank, not the Tower's. Every ♠ adds the same health wherever it lands, so a 2♠ on a rank-2 Tower is worth exactly what a 10♠ is on a rank-10 Tower, and a Tower's power grows at a predictable rate however it was built. A face card carries a **flat premium** on top of its reach — the same premium for J, Q, K and A alike, so choosing between them is about which action you would rather give up, never about which is the bigger buff. The numbers live in `src/data/cards.ts`; they are tuning, not design.

**♥ restores to full whatever the rank.** A 2♥ repairs exactly as much as a K♥. This is what keeps ♥ and ♠ distinct now that ♠ heals as well: rank-scaled repair made ♥ strictly worse than a ♠ of the same rank — same healing, and ♠ raised the ceiling on top. A full restore gives each a job the other cannot do. **♥ is the emergency**, the answer to a Tower about to fall, and worth most when the Tower is nearly dead. **♠ is the investment**, worth most on a healthy Tower you intend to keep. Rank no longer trades off against repair value at all: a ♥ reaches exactly one Tower rank, so the question is never how much it heals but whether you hold the rank you need — which is precisely the deckbuilding pressure the rank match exists to create.

**♠ raises current and maximum health together**, as a King does for the Core. It was previously specified as raising the ceiling *only*, which read as a bug in play: the renderer's only signal for damage is `health / maxHealth`, so moving the ceiling alone darkened the Tower exactly as a hit does, and two stacked ♠ could start the critical "about to die" pulse on a Tower that had never been touched. A Tower buffed this way is also no closer to dying than before, so the old signal was not merely ugly but wrong. Changed in response to issue #14.

### Rank ladder

| Rank | Firing geometry | Role | Pieces hit per shot |
| --- | --- | --- | --- |
| **2** | Adjacent — the eight surrounding squares | Point-blank executioner | 1 |
| **3** | Vertical — along its file | Lane sniper | 1 |
| **4** | Cross — horizontal and vertical | Crossroads | 1 |
| **5** | Diagonal — the X | The X, blind spot retained | 1 |
| **6** | Star — cross and diagonal together | 4 and 5 together | 1 |
| **7** | None — it never fires | **Wall** — blocks and soaks | 0 |
| **8** | Ring — a band at distance, hollow at its feet | **Amplifier** | 3 |
| **9** | Adjacent, tight | **Freezer** | 3 |
| **10** | Band — the full width of the board, ±1 rank | **Toll gate** | **everything it covers** |

**Power rises with rank, but every rank trades something — and the trade is narrower than "coverage rises, damage falls."** Across the ranks that actually fire, single-target damage per second never rises as rank increases: a rank 2 out-damages a rank 10 against one Piece by six times, permanently, so a low rank can never become landfill — and a rank 10 wins only when there is a crowd. Coverage is not the mirror image of that trade — it is not monotonic with rank at all. Measured peak coverage on an 8x8 board is 8, 7, 14, 13, 24, 0, 39, 24, 23 for ranks 2 through 10: it falls at 2→3, 4→5, 6→7, 8→9 and 9→10, and rank 10 covers fewer squares than rank 6. What is actually pinned is a **per-height ceiling** instead — no rank may exceed 39 squares of coverage on the starting 8x8 board, or 47 once board growth has removed every geometry's rank-clipping (see the table below) — not a rise from rank to rank. This replaced a ladder that scaled coverage, damage, fire rate and target count all at once, which made a single rank-6 Tower carry auto-rounds for 45+ rounds unattended. See [`2026-08-06-tower-role-rebalance-design.md`](../superpowers/specs/2026-08-06-tower-role-rebalance-design.md).

**Ranks 7, 8 and 9 are utility, not damage.** The Wall has no gun at all; the Amplifier doubles what *other* Towers deal inside its ring and never its own shot; the Freezer slows what it covers — and slows a blocked Piece's *attacks* on the Tower it is grinding, exactly as it slows walking, because a blocked Piece attacks on the same move cadence it would otherwise walk on. The King's move-speed buff and the freeze compose rather than override — 0.7 × 1.5 = 1.05 — so a Piece standing beside a King, while also inside a Freezer's coverage, is barely slowed at all. That protection does not extend to the King itself: a King never buffs itself, so a lone King caught in a Freezer's coverage takes the full 1.5× slow like anything else with no buff to compose against. The King is the Chess faction's answer to the Freezer for what stands beside it, not for itself. Both auras are positional — a Piece is slowed or amplified *while it stands in the coverage*, not for a duration after being hit — so they stack no more than the King's own aura does, and placement is the whole decision.

**Rank 10 is where a horizontal line finally works.** Horizontal was tried at rank 2 and rejected: Pieces travel down a file, so a horizontal line catches each Piece for one move interval and therefore one shot. At rank 10, with unlimited targets, "one toll on every Piece and nothing can go around it" is the identity rather than the flaw. Files never grow — only ranks do — so a band spans the full width for an entire run, while an Ace dilutes its share.

**Board growth is not uniformly dilutive — that was measured, not assumed.** `vertical`, `cross`, `diagonal` and `ring` are all bounded by Chebyshev distance along the board-rank axis as well as the file axis, so on the starting 8×8 board each one is **rank-clipped**: a centrally-placed Tower's reach along the ranks runs into the top or bottom edge before its shape is complete. Growing the board removes that clipping, permanently — each of those four geometries reaches a larger absolute footprint once it has the room, and none of them shrink back. Only the rank 10 band was never clipped, because its reach along the files was already the full board width; every Ace dilutes its *share* of the board, never its absolute footprint.

How fast each geometry finishes growing differs, measured directly rather than assumed (files fixed at 8; only board ranks vary):

| Rank | Geometry | 8 ranks | 9 ranks | 11 ranks | 16 ranks | 24 ranks |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | vertical | 7 | 8 | 10 | 10 | 10 |
| 4 | cross | 14 | 15 | 15 | 15 | 15 |
| 5 | diagonal | 13 | 14 | 14 | 14 | 14 |
| 8 | ring | 39 | 47 | 47 | 47 | 47 |
| 10 | band | 23 | 23 | 23 | 23 | 23 |

`ring`, `cross` and `diagonal` all finish growing at the first Ace (9 board ranks); `vertical`'s range of 5 needs 11 board ranks to fully unclip, so "the first Ace" is not one answer that covers every geometry. The design intent still holds throughout: the worst share the board ever shows is 47 of 71 squares (66.2%) at 9 board ranks — worse than the pre-Ace 8×8's 39 of 63 (61.9%), precisely because the ring only reaches full size once the first Ace removes its clipping — and the share dilutes monotonically past that point, so no Tower ever blankets the board. `src/data/towerRanks.test.ts` pins a per-height ceiling rather than one flat number: 39 squares at board height 8, 47 at height 9 and every height above.

Range, damage, fire interval and Tower health beyond the coverage-versus-damage trade above remain **placeholder balance values** living in `src/data/towerRanks.ts`; the trade is the design, the specific numbers are tuning. Range is still not comparable across geometries — it counts squares along the pattern, so `adjacent` at range 1 is the eight surrounding squares while `vertical` at range 5 reaches the length of a starting file.

Rank 2 was originally **horizontal** and was changed after measuring it. Pieces travel down a file, so a horizontal line caught each Piece for exactly one move interval — one shot, which a Pawn survived: 1 damage against rank 3's 6. Adjacent keeps a Piece covered for three squares of its approach instead, and gives the lowest rank a coherent identity as a short-range blocker with teeth.

Chess movement, added afterwards, sharpened this rather than changing it: a pawn is now *strictly* confined to its file, so a horizontal Tower would have been worse still.

**Ranks 4 and 5 tie on single-target DPS, deliberately.** Shape alone gives no power curve — diagonal is not inherently better than cross — and under the rebalanced ladder neither does damage: the two deal identical damage on identical intervals, so what actually separates them is shape and the diagonal blind spot below, not a damage edge.

Rank 5's geometry stands as identity alone: diagonal is simply the shape left once rank 4 has claimed the cross. Diagonal Towers do have a side effect worth naming — they preserve square colour, since a diagonal Tower on a light square can only ever hit light squares — but nothing in the current design keys off that property; the Knight is damageable on every square, colour included. The property stays true and is available if a future mechanic wants a colour-keyed effect.

**Towers are generic, never chess-themed.** Their geometry comes from card rank, not from chess pieces.

### Face cards, the Ace, and the Jokers

These **act instead of building**, under one governing principle:

> **Suits tune numbers. Face cards change kind.**

♥ ♦ ♠ ♣ already own the whole stat quartet, and a face card can already be played for its suit — at a premium, onto any Tower — so a face card whose rank mode merely bumped a stat would be a fifth suit.

| Card | Action | Needs a Tower? |
| --- | --- | --- |
| **Jack — Shield** | Give a Tower a shield of **10** — flat, additive, absorbed before health, never regenerating | Yes |
| **Queen — Echo** | Build a copy of an existing Tower's **rank** on a square holding neither a Tower nor a Piece | Yes |
| **King — Reinforce** | Raise Core current **and** maximum health by **1** | No |
| **Ace — Expand** | Grow the board by one rank, lengthening the run to the Core | No |
| **Joker — Clear** | Destroy every Piece standing on the board | No |

Each touches a different layer — a Tower's durability, the number of Towers, the Core, the battlefield, the Pieces. None of them duplicates a suit.

**A shield differs from ♥ Repair in kind, not magnitude:** repair is reactive and can be out-paced, a shield is pre-emptive and cannot. Overflow carries into health, so no single hit is wasted and a shield never blocks more than it is worth.

**Echo copies the rank only.** Accumulated ♦ ♠ ♣ supports and any shield do not carry across, or Echo would be the strongest support multiplier in the game rather than a second Tower.

**Reinforce is the only card that touches the Core, and the only Core recovery there is** — nothing else ever adds to it. A leak costs exactly 1 Core health, so a King buys exactly one extra leak. Whether that competes with playing the same King for its suit is a live balance question, not a settled one.

**Clear leaves Towers and pending spawns alone.** Towers are permanent and only ever destroyed by Pieces, and a round still spawning continues rather than ending early. Being suitless, Clear is a Joker's only play — and it is the one card that can always break a grind.

Two hazards arrive with packs, because copies are unlimited by design. **Both are
now reachable** — packs are built and the Deck is no longer a fixed authored
list:

- A **King**-heavy Deck means unbounded Core health.
- An **Ace**-heavy Deck means an arbitrarily long board — a rendering and camera-framing problem as much as a balance one.

**Neither is capped, deliberately.** Scarcity is the whole mitigation: Kings sit
in the scarce tier and Aces alone in the rarest. A cap would set a number with no
play data behind it. The Ace is the more pressing of the two, because its hazard
is technical as well as balance — `src/scene/GameScene.tsx` casts shadows on
three.js's default frustum, already visibly wrong at 8×8 and worse with every
rank added.

### Cards are consumed, and there is no drawing

**Playing a card consumes it.** It has been converted into a Tower, or spent on a support action. There is no discard pile and nothing returns.

**Playing a card costs nothing else.** No mana, no Ink cost. The Deck *is* the resource — the player's total supply of plays for the run, replenished only by packs.

**There is no drawing.** The whole Deck is visible and playable at all times. No shuffling, no draw pile, no per-round draw, no hand limit.

These belong together. Towers are permanent and playing costs nothing, so reusable cards would allow unlimited Towers — consumption is what bounds the board. And once cards are consumed, drawing would only hide information about a supply the player must plan against.

Consequence accepted: without a cost, a high card is strictly better than a low one in both modes. The decision becomes "build a new Tower, fix an existing one, or hold this card?" rather than an efficiency puzzle.

### The Deck

| Rule | Value |
| --- | --- |
| Deck cap | **30 cards** |
| Copies of any one card | **Unlimited** |
| Visibility | Entire Deck always visible and playable |
| On play | Card is consumed |

**The cap is hard, and acquiring cards can force destroying cards.** Buying a 10-card pack while holding 25 means choosing 5 to **cull**. That decision is the point of the cap.

Note the loop this creates: **playing cards frees Deck space.** Culling only bites when the player is sitting on a large unspent Deck, so hoarding has a cost and spending has a reward. Preserve that tension.

**No copy limit** — the cap already bounds total supply, and a bad pull is a cull candidate rather than dead weight. A pile of 5♦s is a legitimate build.

**The Deck is a multiset, not a subset of 54 distinct cards.** Cards are gained from random packs, so holding three identical 5♦ is the normal case rather than an edge case.

**A Card's identity is its own `id`, never its rank and suit.** Playing one of three 5♦ consumes that instance and leaves the other two. Anything that looks a card up, or removes it, by rank and suit is a bug the moment a duplicate exists — which is immediately.

**"Hand" is not a term in this game.** There is no draw pile, so there is only one set of cards: the Deck.

## Runs

The game is **run-based**. A run is a sequence of rounds. The Deck is built up during a run and does not survive it. There is no persistent cross-session collection.

**A run opens by opening a pack.** There is no fixed starter Deck — the opening position is whatever the pack deals, and reading it is the first real decision of the run. The pack is a **Base** — settled when packs were built.

### Seeds

A run is identified by a **seed**, making it reproducible and shareable: same seed, same pack contents, same round composition, same opening.

This requires a **seeded PRNG carried in `GameState`**. `Math.random` must never appear in `src/game/` — it breaks determinism and seeds alike. Streams are **named**: one run seed hashed with a stream name derives an independent generator per purpose, so adding a second random consumer later cannot shift what an existing seed deals to packs. See `src/game/rng.ts`.

## Ink and packs

**Ink** is the run currency. It buys **packs**. It is never spent to play a card.

Earned three ways:

- **Round income** — a lump sum when a round completes, **scaling with the round number**. Rounds grow, so a flat payout would shrink in real terms exactly as the pressure rises. A lost run pays nothing: the Core falling ends the round without completing it.
- **Kill rewards** — each destroyed Piece pays out, scaled by type. A Pawn trickles; a Queen pays properly. **Only a kill pays.** A Piece that leaks was not killed — it already cost Core health — and a Pawn that promotes was not destroyed but transformed, so the Queen it becomes pays when the Queen dies.
- **Clear share** — a Joker's Clear pays a quarter share of the kill rewards for the Pieces it destroys, while the round-completion lump sum stays whole. Keeps the safety valve paying something without ever out-earning shooting the board down.

Unspent Ink carries between rounds.

**Ink income must be event-driven — round completion and kills — never time-driven.** The gap between rounds is untimed, so any time-based income is unbounded: the player would simply wait. This is structural, not a balance knob.

There are **no real-money purchases**. Ink is earned by playing. This keeps the game a static site with local persistence — no payment processor, no accounts, no backend — and avoids the regulatory exposure of paid randomised packs.

### Pack types

| Pack | Contents |
| --- | --- |
| **Scrap** | 3 random cards — cheapest, for smooth frequent progress |
| **Base** | 10 random cards — the baseline |
| **Court** | 10 cards weighted toward the scarce tier — expensive |
| **Suited** | 10 cards all of one suit, player's choice — mid to expensive |

**Prices are fixed per pack type. Packs do not escalate in price.** Distinct types at distinct prices give a real decision ("save for a Court, or buy two Base now?") and self-balance, because the player sets their own rate.

**Suited is load-bearing.** It is the only pack that lets a player commit to a *strategy* rather than simply get better numbers.

**Rarity is rank, in three tiers.** No separate rarity system is needed.

| Tier | Cards |
| --- | --- |
| Common | 2–10, at **equal weight** — a 10 is no scarcer than a 2 |
| Scarce | J, Q, K, Joker |
| Rarest | A, alone |

2–10 are flat because the rank ladder already separates those nine cards by
geometry, range and damage; charging scarcity for them as well would
double-count the same difference. The Ace is alone in the rarest tier because
nothing else restrains board growth — see the King and Ace hazards under "The
card actions". The Joker sits with the face cards rather than below them: it is
the only answer to a repair-versus-the-wall stall, and making the escape hatch
the hardest card to obtain would be a trap.

**Court shifts mass into the scarce tier, and never improves Ace odds** — it is
better odds on face cards, not a way to buy board growth.

## Time model

Bloons-style rounds:

- Rounds are discrete and numbered.
- The gap between rounds is **untimed** — the player plans and builds with no pressure.
- The player starts a round manually, or enables **auto-start** so rounds chain. Auto-start is a setting, not a game mode.
- Once live, combat runs in **real time** and does not wait for the player.
- The player can play cards **during** a round. Building is not confined to the gap.

Chess pieces move in **discrete hops** on a per-piece cadence, not by sliding continuously. The renderer interpolates between squares so motion reads as smooth, while the hop preserves the chess identity and keeps threat ranges legible.

## Movement is chess movement

**Pieces move by real chess rules, not by walking toward the Core.** They have no pathfinding and no goal-seeking: each type moves as its chess counterpart would, and whether that happens to bring it near the Core is a property of the board, not of its intent.

Every Piece is **forward-biased and deterministic**: it travels down-board, rank 7 toward rank 0, as a pure function of its type and its own carried state (`moveCount`, `handedness`) — never a PRNG, and never a line chosen because the Core happens to sit on it.

This has large consequences that are accepted deliberately:

- **Every Piece can threaten the Core.** A pawn is confined to its file, so only the Core's own file and the two files diagonally adjacent are dangerous to it specifically — but a Pawn that reaches the back rank promotes into a Queen, and every other type hunts the Core directly once its forward move runs out; see Hunting, below.
- **A round therefore ends when nothing on the board can still act**, not when the board is empty. Waiting for an empty board would hang the round forever.

### Pawn

Advances one square down its file. **Captures the Core diagonally forward**, as a pawn takes in chess. A Tower directly ahead blocks it, and it attacks that Tower instead of advancing. A Tower off to the diagonal is ignored while the path ahead is clear — the pawn's job is to advance, not to detour. Reaching rank 0 **promotes** it to a Queen rather than stranding it — see Promotion, below.

### Knight

A zig-zag L-hop: it alternates `(file−1, rank−2)` and `(file+1, rank−2)`, with the starting side set at spawn so Knights weave opposite ways. Its primary hop crosses two ranks; a one-rank fallback candidate lets it still reach rank 0 from rank 1 rather than stranding a hop early. Either way it rarely sits still long enough for a line-shaped Tower to land a repeat shot. Once its forward hops run out, it starts hunting the Core instead of stopping — see Hunting, below.

### Bishop

Slides forward along a diagonal, reflecting off the side edges — which keeps it on its own square colour, as a real bishop does. Once forward motion runs out it hunts the Core like every other Piece — unless the Core sits on a colour it can never reach, in which case it hunts the square directly in front of the Core and leaks from there; see Hunting, below.

### Rook

Slides straight down its file.

### Queen

Slides, alternating the Rook's line and the Bishop's line hop by hop — the only Piece that both advances and changes files under her own steam, which is the "flexible" in her roster entry.

### King

One square straight forward, always. It never slides and never gains a slide bonus of its own — see Auras, under The Chess roster below, for what it grants everyone else instead.

Bishop, Rook, and Queen — the sliders — move **one square per hop**, exactly like the Pawn, **+1 while adjacent to a King**. A slide of N resolves as **N single-square steps along one committed line**: it stops early on a Tower (which it attacks) or the Core (which it leaks into), and if it reaches the back rank mid-slide it stops there rather than bending onto a new line for the remaining steps — the hunt begins on the next hop.

### Promotion

A Pawn reaching rank 0 becomes a Queen, at full Queen health, instead of stranding. This is chess-exact, and it turns the back-rank pile-up from clutter into a threat: an ignored Pawn eventually becomes the elite Piece on the roster.

### Hunting

Once a Piece's forward move would leave the board — for every type, that is rank 0 — it **hunts the Core** the rest of the way, moving by its own chess movement. Pawns are the one exception: they promote instead.

**The state latches.** `hunting: boolean` on the Piece is set true the moment hunting starts, and it never clears. Without the latch the feature does not terminate: a same-colour Bishop's first hunting hop goes *away* from rank 0, up to the diagonal intersection that routes it back down to the Core, and at that intersection it has a legal forward diagonal again. An unlatched flag would let it revert to marching, reach rank 0 elsewhere, start hunting again, and oscillate forever. (The Knight's version of the same argument: its first hunting hop goes backwards.) The Queen hunts with full queen movement; her rook/bishop alternation is forward-march behaviour only.

**Direction comes from a per-type distance field.** A breadth-first search over the Piece's own movement gives every square its distance to the target in *moves* — a slide of any length counts as one — computed once per board, seed square, and type, and memoised (`src/game/distanceFields.ts`). A hunting King steps onto the first neighbour, in a fixed order, at distance one less. A hunting slider picks the first direction, in a fixed order, whose line reaches a square one move closer, and slides along it — at most its normal slide distance, King aura included, and **capped at the closer square** so a long slide cannot overshoot its phase target. A BFS field guarantees the closer square exists at every distance `d > 0`, and distance strictly decreases between phases (2→1→0); within a phase every hop advances along a shortest-path line toward that phase's target — arriving on it, exhausting the slide count en route, or grinding the Tower blocking the line. Arrival is bounded and a cycle is impossible by construction; the walk from every square is pinned exhaustively in `movement.test.ts`.

**The fields never see Towers.** They are computed on an empty board, which is what keeps hunting from reopening the mazing risk: Tower placement cannot change which square a hunting Piece is aiming for. A Tower on the chosen line is attacked exactly as any other blocked Piece attacks one — the Piece grinds rather than trying another line. The player can wall a hunting Piece; the player still cannot herd one.

**The colour-locked Bishop.** A Bishop stays on its own colour, so a Core on the other colour is a square it can never stand on. Such a Bishop hunts the square directly in front of the Core instead — always the Bishop's own colour — and **leaks from there**, standard leak damage, counted in the leaks counter: every Piece meets the Core the same way. Issue #13's literal caveat — a standing half-damage forward attack from that square — was set aside for exactly that uniformity, and is worth revisiting if leaks ever deal Piece-specific damage.

See [`docs/superpowers/specs/2026-08-07-hunting-for-all-design.md`](../superpowers/specs/2026-08-07-hunting-for-all-design.md) for the full reasoning, including the rejected alternatives (rank-0 geometry, the standing half-damage attack, and a Bishop-only fix), and [`2026-08-06-hunting-knights-design.md`](../superpowers/specs/2026-08-06-hunting-knights-design.md) for the Knight-specific origin of the mechanism.

## The Chess roster

| Piece | Chess trait | Threat | Forces |
| --- | --- | --- | --- |
| **Pawn** | One step forward, numerous | **Chaff swarm** — weak, slow, many. **Promotes to a Queen on reaching the back rank** | Area damage; single-target Towers drown |
| **Knight** | L-shaped hop — never a straight line or a diagonal | **Erratic hopper** — a zig-zag L, usually two ranks per move (one near the back rank, so it can still reach rank 0), that rarely lands twice under the same line — which vertical, horizontal, and diagonal Tower coverage struggle to track | Coverage wide enough to catch a hopper, not a single line |
| **Bishop** | Diagonals; thematically a cleric | **Healer** — sustains its Round's Pieces until killed. Nothing else | Retargeting; kill it first |
| **Rook** | Straight lines, long | **Armoured tank** — slow, high health | Piercing or sustained damage |
| **Queen** | Everything, long | **Elite** — flexible, rare, dangerous | Burst and focused fire |
| **King** | One square, but *the* target | **Commander** — slow, tough, buffs adjacent Pieces | Priority targeting |

Pawn promotion turns a chaff swarm into a timer: ignore the weak pieces and they become the elite threat.

### Auras

Two Pieces project a passive effect onto others nearby, rather than fighting only for themselves.

**The King** buffs every *other* Piece at Chebyshev distance 1 (the eight surrounding squares) with a shorter move interval, and additionally grants sliders — Bishop, Rook, Queen — **+1 slide**. It never buffs itself, and the buff does not stack: standing beside two Kings is exactly as good as standing beside one.

**The Bishop** heals every *other* Piece within Chebyshev distance 2, on a fixed cadence, capped at each target's own maximum health. It never heals itself — the designed counter is "kill it first", and a self-healing Bishop would blunt that outright. Unlike the King's aura, Bishops **do** stack: two Bishops in range of the same Piece heal it independently, as two separate sources rather than one effect applied twice.

## Towers

**Towers are destructible.** They have health, take damage from Pieces, are repaired with ♥ cards, and can be shielded by a Jack. A shield absorbs before health and never regenerates.

**Towers are permanent once placed** — they are never removed by the player, only destroyed.

### Towers block, and blocked Pieces attack

**No Piece type is a designated Tower-hunter.** One rule covers every Piece:

> A Piece whose next square holds a Tower **does not advance**. It attacks that Tower instead, at **half** its attack damage.

**Towers block movement.** This reverses an earlier decision that they never do. The earlier wording was self-contradictory — it declared Towers non-blocking and then defined them as stopping Pieces in the same breath.

Half damage is what makes the mechanic work: Pieces are poor demolitionists, so a Tower is a real obstacle rather than a speed bump. The multiplier is kept separate from a Piece's base attack damage so that a future Piece *designed* to demolish Towers can attack at full effect.

**There is no pathfinding.** A blocked Piece waits and grinds; it never routes around. This is deliberate — routing around would let the player steer Pieces by placing Towers, which is exactly the mazing the design rejects. The player can *wall*, but cannot *herd*.

Every Piece therefore contributes anti-Tower pressure, so repair reliably has a job.

**A Tower's own geometry decides whether it can defend itself.** A vertical, cross, adjacent, or star Tower covers the square a Piece attacks it from, so it shoots back. A **diagonal** Tower does not — a Piece attacking from directly along its file sits in a blind spot, and rank 5 is the only diagonal on the ladder. That asymmetry is emergent from real geometry, not assigned. Repair has since arrived, which makes it the live case: see "Repair versus the wall" in the open questions.

**A Tower cannot be built on a square a Piece occupies.** Blocking only means something if the two never share a square, and a build is the one route onto the board the movement rule does not already guard. This closes it from the placement side only — a Piece can still spawn onto a square a Tower already occupies, which is the same overlap from the opposite direction and is tracked separately (issue #22, open).

### Reading a Tower's coverage

**Selecting a Tower lights every square it covers.** Click a Tower and its footprint appears on the board in **amber**, alongside the inspect panel. Since defense is coverage, a footprint the player cannot see is a decision they cannot make: placement is a one-off, but living with the placement is the rest of the run, and every later question — which file is uncovered, which Tower is worth a ♠, where the next Tower goes — is a question about footprints.

**Selection is the only trigger. Hovering a Tower deliberately shows nothing.** Coverage is reserved for a Tower the player has actually picked, so the footprint is something asked for rather than something the board throws up whenever the pointer crosses a Tower. This is settled, not pending: a proposal to preview coverage on hover is reopening it.

**Amber is a Tower you own; teal is a Card you have not played.** The build preview that follows the pointer while a rank Card is picked keeps teal, and both are shown at once rather than one hiding the other — comparing a proposed footprint against the coverage already on the board is how a gap gets found.

**For a Tower with an aura, the same footprint is where the aura applies.** An aura reaches every Piece its Tower covers, so the lit squares are exactly the rank-8 Amplifier's amplified zone and the rank-9 Freezer's slowed zone. Those two ranks are utility roles whose value is the area rather than the shot, which makes seeing the area worth more for them than for anything else on the ladder. **The rank-7 Wall lights nothing**, correctly — it covers nothing, and the panel says "Never fires — it blocks and soaks" rather than quoting it a targets figure.

**The highlight is coverage, not targeting.** It shows every square the Tower *can* hit, not the Pieces a shot *will* hit — a shot is capped at the rank's targets per shot and picks the Pieces nearest the Core. The panel carries that figure beside range and damage, which is what stops a wide disc at the top of the ladder from over-promising: it can light dozens of squares and reach only a handful of the Pieces on them. The moment of a shot is already shown separately, as a pulse over the same footprint.

### No walls, no mazing

**There are no wall or blocker cards, and the player never reshapes the path.** Pieces move by their own rules toward the Core and cannot be herded.

This is a **coverage** tower defense, not a **maze** one: defense is about which squares you can hit. Do not add path manipulation.

## Open questions

**The only canonical list.** Do not resolve these by guessing, silently pick one, or write code that hardcodes an assumption about them. Ask.

| Question | Notes |
| --- | --- |
| **Run length and loss condition** | How long a run is, what ends it, and whether difficulty scales per round or in stages. |
| **Running out of cards** | Cards are consumed and packs are the only source, so a player can reach zero. Loss, stall, or covered by a guaranteed Ink floor? |
| **Pack weighting and prices** | How rank scarcity translates into pack contents, and what each type costs. Still open. Placeholder prices and tier weights now exist in `src/data/packs.ts`, labelled as placeholders — they exist because a purchase cannot happen without them, not because they are right. Pack **sizes** are settled and are not part of this question. |
| **Ink income values** | Kill rewards per Piece type, and the round-completion lump sum, are **placeholders**. Ink's worth is set by what it buys, so these cannot be tuned until pack prices exist — resolve the two together. The *shapes* are settled and are not open — see "Ink and packs" above for the current three income paths, and [`2026-08-06-ink-income-design.md`](../superpowers/specs/2026-08-06-ink-income-design.md) for the reasoning behind them. One more thing to weigh whenever this pass happens: `tick.ts` feeds a freshly promoted Queen into the same tick's Tower fire, so a Pawn worth 1 Ink shot on the way in is worth 8 if left to reach the back rank and die as a Queen instead — withholding fire from an approaching Pawn is a legible, currently uncosted 8x income play. Packs now price Ink, so this can finally be resolved — jointly with pack prices, as this row has always said. |
| **Repair versus the wall** | **Reachable now — ♥ Repair exists.** Towers block and there is no pathfinding, so a repaired Tower a Piece cannot break is a permanent wall, and against a rank-5 Tower's `diagonal` blind spot the Piece cannot even shoot back. **Packs have landed, and the bound survives — because packs are bought only in the gap.** The ♥ supply is fixed for a round's whole duration, so a repaired Tower still runs out of repairs, the Tower still falls, and the round still resumes. `src/game/roundTermination.test.ts` pins both halves: a purchase is refused mid-round and accepted in the gap. What would remove the bound is allowing mid-round purchase, so **that** is the change this question now gates. Two later changes made each ♥ worth more against the wall without touching that bound: ♥ now restores to **full** rather than by magnitude, so one card can absorb a whole Tower's worth of grinding; and ♠ raises `maxHealth`, so a ♠-fed Tower gives each subsequent ♥ a higher ceiling to fill. The wall is the same length in cards and longer in seconds. A third change tightens it in the other direction: a ♥ now reaches only a Tower of its own rank, so fewer of the ♥ in a Deck can sustain any given wall. The bound was already finite; it is now shorter in cards. Nothing here depends on it being loose. Candidate answers: attacked Towers lose *maximum* health permanently so repair only delays; repair capped per round; or a blocked Piece eventually breaks through regardless. Decide with play experience, not on paper. **Rank 7 is now a Wall with no gun at all, which is the sharpest version of this case — it can never break its own stall by shooting something, the way every firing rank eventually can.** It does not loosen the bound: the ♥ supply is still fixed mid-round because `buyPack` is refused while a round is live, so a Wall still runs out of repairs and falls. This is no longer just reasoning — `roundTermination.test.ts` measures it directly: a rank-7 Wall fed every ♥ in a 4-card Deck falls at 76,500ms against an unaided 40,500ms, and the test asserts both that every ♥ was consumed and that the Wall outlived its unaided lifetime, so it cannot pass if repair silently did nothing. Two things now lengthen a stall without unbounding it: the Wall's health — 45, above every firing rank (the highest of which, rank 10, holds 38), because soaking attacks is its whole job — but still tuned deliberately modest in absolute terms, only around 1.7× rank 6's 26, because Wall health directly sets the worst-case round length and pushing it higher would manufacture the very stall this question is about; and the rank 9 Freezer, which slows *grinding* as well as walking because a blocked Piece attacks on its move cadence. The question stays open; what changed is that the argument for leaving it open is now backed by a passing test rather than reasoning alone. |
| **♦ Speed and ♣ Damage on a gunless Tower** | **Reachable now — rank 7 is the Wall.** `canSupport` checks only rank match, so a 7♦ or 7♣ is a legal play against a rank-7 Tower, and `applySupport` dutifully raises its `damage` or lowers its `fireIntervalMs`. `fireTowers` in `src/game/tick.ts` skips a gunless Tower before either field is ever read, so the play changes nothing the Tower can act on. Because a numbered Card supports only a Tower of its own rank, a 7♦ or 7♣ has **no other legal suit target in the game** — those two cards are currently dead weight the moment a rank-7 Wall exists. `TowerPanel` compounds it: it prints a damage figure and a fire interval directly under the label "Never fires — it blocks and soaks," stats the Wall can never use. Should `canSupport` (or `applySupport`) refuse ♦ Speed and ♣ Damage against a gunless Tower, or is spending them there an accepted bad play the player is free to make, the same way any card is free to be wasted? Decide deliberately; do not guess. |
| **Capping stacked supports** | **Reachable now.** Supports stack additively with no limit, so a Tower fed every ♠ in a Deck grows without bound — and with flat values, *n* supports is exactly *n* × the flat amount, which makes the growth easy to reason about but does not bound it. The rank match narrows how many Cards can reach one Tower, which is a constraint but not a cap. Candidate answers: a hard cap per Tower, diminishing returns per stack, or a cap per round. Deliberately left open by the rank-matching work — do not resolve it by guessing. |
| **Board geometry** | Growable, starting at a literal 8x8 — an Ace adds a rank. Square colour is no longer load-bearing, since the Knight is damageable everywhere, so the checkerboard is preserved for chess-authenticity alone. Whether that argument carries enough weight on its own is undecided. |
| **Multiplayer scope** | Still assumed single-player versus AI, no backend, no netcode. |
