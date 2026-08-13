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

The Core stays on rank 0 and Pieces enter from the **Staging rank** — one rank past the far rank, off the board — stepping onto the board on their own move interval: every type but a Knight lands on the far rank, while a Knight's L crosses two ranks and so enters one rank deeper. Growth lengthens the run to the Core and buys Towers more shots. That is the Ace's whole effect. An Ace played while Pieces are still waiting on the Staging rank admits them: the rank they occupy becomes the new far rank, which is new space no Tower can have been built on.

**The Staging rank is not a board square.** No Tower can stand there, because placement refuses anything off the board — and that is precisely what stops a Piece appearing on top of a Tower. Entry to the board is an ordinary hop, so a Tower on the entry square blocks it and the Piece grinds from the Staging rank exactly as it would anywhere else. **Damage cannot reach the Staging rank, and it is one-way.** A Piece assembling there is not yet invading: no Tower can shoot it, however far its coverage reaches. The single exception is a **Joker's Clear**, which is not damage but a board wipe — and it must reach the Staging rank, because it is the safety valve for a walled far rank: Pieces queued behind a Tower they cannot shoot are exactly the standoff it exists to break. Auras are not damage either, so they still reach: a King's buff speeds a Piece's entry, and a Bishop's heal is a harmless no-op on a Piece nothing can hurt. Once a Piece steps onto the board it can never return — every movement rule either advances it, holds its rank, or, for a hunting Knight's occasional rank-increasing hop, bounds-checks the candidate before ever committing to it, so the Staging rank empties in one direction only. The wait is the point — it is a beat of warning about what is coming and on which file.

Growing the board retires the *thematic* claim to a true chessboard, deliberately. Nothing mechanical is lost: **square colour is `(file + rank)` parity**, so the checker pattern survives a rectangular board intact. Nothing keys off colour today — the Knight is damageable on every square — so the pattern is preserved for chess-authenticity alone; see "Board geometry" in the open questions.

## The card system

### Grammar

The deck is a **standard 54-card deck** — ranks 2 through 10, Jack, Queen, King, Ace, and two Jokers. Not bespoke designed cards.

Every card is committed to exactly one thing when played:

> **A hand builds. A face card acts. A Joker clears.**

- Numbered cards (2–10) are **hand material only** — the only way to play one is to commit it to a hand, and hands purchase Towers. A numbered card has no solo build and no other play.
- Face cards (J, Q, K, A) have exactly two lives: play their **action** at any time, or be **committed to a hand** (gap only). They keep no suit-support play.
- A Joker is not modal: it has neither rank nor suit, and exactly one action — Clear.

So the 5♦ is committed to a hand that buys a Tower — alone it is a high card and builds a vertical Tower; with a second 5 it forms a pair and builds a Wall. Which hand a card is committed to is the play-time decision.

**The never-stuck property survives, in a new shape.** Because a single numbered card is always a playable high-card hand, a Deck holding any of 2–10 is never dead. Jack and Queen both need a Tower already standing, so a Deck worn down to only those two with an empty board holds cards that cannot be played.

That is **not a softlock** — rounds still start, standing Towers still fire, and the run continues — but those cards do nothing until a Tower exists. Because copies are unlimited and cards come from random packs, it is reachable rather than theoretical. It is recorded rather than closed: giving Jack and Queen a build fallback would blur "face cards change kind" for a rare case.

Preserve the rest of the property. King, Ace and the Jokers are all playable from an empty board, so a Deck holding any of them is never dead.

### The hand ladder

| Hand | Cards | Tower | Shape |
| --- | --- | --- | --- |
| High card | 1 | **Vertical** | A single file |
| Pair | 2 | **Wall** | No gun — blocks and soaks |
| Two pair | 4 | **Sniper** | Long range, single target, high damage |
| Three of a kind | 3 | **Diagonal** | Four diagonals |
| Straight | 5 | **Cross** | Four cardinal lines |
| Flush | 5 | **Star** | Eight rays, shorter reach |
| Full house | 5 | **Splash** | Small area burst |
| Four of a kind | 4 | **Ring** | Hits everything its ring covers |
| Straight flush | 5 | **Toll gate** | Full-board-width band, unlimited targets |
| Royal flush | 5 | **Choice** | Builds any of the nine Tower types |

**Strict poker rarity orders the ladder: a rarer hand always builds a stronger Tower.** Hand type alone determines the Tower — the ranks of the cards inside the hand never modulate it, so the result is identical for any cards forming the same hand type. Two pair (4 cards) sits above three of a kind (3 cards) because poker rarity says so: the ladder is ordered by rarity, not card count. Range, damage, fire interval and Tower health are **placeholder balance values** living in `src/data/towerTypes.ts`; the shapes and the rarity order are the design, the specific numbers are tuning. Range is still not comparable across geometries — it counts squares along the pattern, so `vertical` at range 5 reaches the length of a starting file while `splash`'s `adjacent` at range 1 is the eight surrounding squares.

**The tower roster is the hand ladder.** Towers are keyed by tower type, not by a Card's rank — the old rank-keyed table (2–10) is retired, and a Tower's `type` is its whole identity. The shapes carry over from the rank ladder where they existed — vertical, diagonal, cross and star are the old 3, 5, 4 and 6 — and the roster fills out the rarity span with new identities:

- The **Wall** has no gun at all — it blocks and soaks, and never shoots. The pair is cheap, and a Wall is the game's bluntest commitment: it buys seconds and nothing else.
- The **Sniper** is a long single file with high single-target damage and no splash — the rare-hand answer to one strong Piece.
- The **Splash** bursts over the squares around it, the answer to a Pawn swarm.
- The **Ring** hits *everything* its ring covers each shot. It replaces the Amplifier, now dealing damage directly — the amplify aura is gone.
- The **Toll gate** fires a full-board-width band with unlimited targets: one toll on every Piece, and nothing can go around it. Files never grow — only ranks do — so a band spans the full width for an entire run, while an Ace dilutes its share.

**Cross replaced the Freezer.** The straight-flush Tower is the cross shape; the Freezer does not exist any more.

**Towers are generic, never chess-themed.** Their geometry comes from the hand ladder, not from chess pieces.

### Playing a hand

- **When.** The gap between rounds only — committing a hand is the build phase. Face-card actions and a Joker's Clear remain playable mid-round.
- **How.** The player selects Cards from the Deck. The game shows the strongest hand the selection forms (five same-suit cards show *flush*; a five-card selection with no five-card pattern is refused). A committed set must be **exactly one valid hand of its size** — no kickers, no downgrades. Exact sizes: high card 1, pair 2, three of a kind 3, two pair 4, four of a kind 4, straight 5, flush 5, full house 5, straight flush 5, royal flush 5.
- **Placement.** Two-step: the player first commits the hand — the Cards are consumed and a Tower of the hand's type appears, awaiting placement — then clicks a square to place it, checked by the existing legal-square rules. Clicking an illegal square does not place (and does not refund the Cards); the pending Tower stays until a legal square is chosen or the play is cancelled. A royal flush's *Choice* is the one hand where the Tower itself is chosen at commit time.
- **Cost.** The hand itself — the committed Cards are consumed and no Ink is spent. Playing a hand is never legal mid-round.

### Face cards, the Ace, and the Jokers

These **act instead of building**, under one governing principle:

> **Face cards change kind.**

A face card's action has to be distinct in kind, not a stat bump — it competes with committing the same card to a hand, so its action must be worth giving that up for. Suit support is gone, and a suit's only job now is forming flushes, straight flushes, and royal flushes.

| Card | Action | Needs a Tower? |
| --- | --- | --- |
| **Jack — Shield** | Give a Tower a shield of **10** — flat, additive, absorbed before health, never regenerating | Yes |
| **Queen — Range** | Add **+1** to any Tower's **range**. Stackable, any Tower, no rank restriction. **Replaces Echo** | Yes |
| **King — Reinforce** | Raise Core current **and** maximum health by **1** | No |
| **Ace — Expand** | Grow the board by one rank, lengthening the run to the Core | No |
| **Joker — Clear** | Destroy every Piece standing on the board | No |

Each touches a different layer — a Tower's durability, a Tower's coverage, the Core, the battlefield, the Pieces. None of them duplicates a suit.

**A shield differs from repair in kind, not magnitude:** repair (now retired) was reactive and could be out-paced; a shield is pre-emptive and cannot. Overflow carries into health, so no single hit is wasted and a shield never blocks more than it is worth.

**A Queen buys coverage, not a second Tower.** Range is stackable and uncapped for now — a Tower's range grows from its instance field, so every Queen stacks onto whatever the type seeded and earlier Queens already added. Whether the stack needs a cap is an open question; it mirrors the other uncapped stacks.

**Reinforce is the only card that touches the Core, and the only Core recovery there is** — nothing else ever adds to it. A leak costs exactly 1 Core health, so a King buys exactly one extra leak.

**Clear leaves Towers and pending spawns alone.** Towers are permanent and only ever destroyed by Pieces, and a round still spawning continues rather than ending early. Being suitless, Clear is a Joker's only play — and it is the one card that can always break a grind, **including a grind on the far rank by Pieces still standing on the Staging rank**. That reach is a designed exception, not an incidental one: damage cannot reach the Staging rank at all, but Clear is not damage, and sparing those Pieces would disarm the safety valve exactly when it is needed most.

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

**Playing a card consumes it.** It has been committed to a hand and converted into a Tower, or spent on an action. There is no discard pile and nothing returns.

**Playing a card costs nothing else.** No mana, no Ink cost. The Deck *is* the resource — the player's total supply of plays for the run, replenished only by packs.

**There is no drawing.** The whole Deck is visible and playable at all times. No shuffling, no draw pile, no per-round draw, no hand limit.

These belong together. Towers are permanent and playing costs nothing, so reusable cards would allow unlimited Towers — consumption is what bounds the board. And once cards are consumed, drawing would only hide information about a supply the player must plan against.

Consequence accepted: a card's value is its **hand potential**, not its individual rank. Committing cards to a hand removes them from future hands, so every play is a decision between building now and holding the cards for a stronger hand — or, for a face card, keeping its action in reserve. There is no efficiency puzzle between "build" and "fix" any more, because nothing fixes a Tower.

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

**"Hand" means a committed poker hand, never a drawn hand.** There is still no draw pile — a Hand is a set of Cards the player selects from the Deck and commits to purchase a Tower, and committing consumes them. The Deck remains the whole supply, always visible.

## Runs

The game is **run-based**. A run is a sequence of rounds. The Deck is built up during a run and does not survive it. There is no persistent cross-session collection.

**A run opens by opening a pack.** There is no fixed starter Deck — the opening position is whatever the pack deals, and reading it is the first real decision of the run. The pack is a **Base** — ten cards, enough to form real hands immediately. It is free, and it never counts as a purchase toward that type's escalation.

### Seeds

A run is identified by a **seed**, making it reproducible and shareable: same seed, same pack contents, same round composition, same opening.

This requires a **seeded PRNG carried in `GameState`**. `Math.random` must never appear in `src/game/` — it breaks determinism and seeds alike. Streams are **named**: one run seed hashed with a stream name derives an independent generator per purpose, so adding a second random consumer later cannot shift what an existing seed deals to packs. See `src/game/rng.ts`.

### The goal: beat round 100, then free play

**A run's goal is to beat round 100.** Completing round 100 — the round
completes, nothing on the board can still act — records the win and shows a
victory screen. From there the player may continue into **free play**: the same
game, difficulty still ramping — spawn density tightens (`spawnGapMs`), round composition broadens, but piece health is flat — no further goal, until the Core falls. Free play changes nothing
mechanical — cards, packs, Ink, and the roster behave identically. The victory
interstitial is a `'victory'` phase: `tick` freezes and every command is refused
except `continueToFreePlay`, which moves into the round-101 gap. A phase rather
than a gap, because auto-start fires from the gap and would chain round 101
under the victory screen. `VICTORY_ROUND` lives in `src/data/rounds.ts`. See
[`docs/superpowers/specs/2026-08-12-round-100-victory-design.md`](../superpowers/specs/2026-08-12-round-100-victory-design.md).

### Round composition

> **King's Guard rounds.** Every 8th round starting at round 15 (15, 23, 31, …) replaces the normal composition with one or more **squads**: a King flanked by sliders (Bishop, Rook, Queen only) on adjacent files, spawning together so the King's aura fires as the squad enters. Both the squad count and each squad's size grow with the round number. The King and its sliders all draw tiers from the normal tier pool, so a late Guard round's King can be yellow, red, or black. Composition lives in `src/data/guardRounds.ts`; the squad and size formulas are placeholder tuning. See [`docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md`](../superpowers/specs/2026-08-08-kings-guard-rounds-design.md) for the full reasoning.

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

**Prices escalate per pack type.** Each type has a **base** price — Scrap 50, Base 100, Suited 200, Court 400 — and every purchase of a type raises *that* type's price by 10%, compounding and rounding up, for the rest of the run: Scrap goes 50 → 55 → 61 → 68 → …. The escalation is exact integer arithmetic (`next = ceil(price × 11 / 10)`), never a floating-point ceil. Distinct types at distinct bases still give a real decision ("save for a Court, or buy two Base now?"), and the escalation keeps a pack meaningful as income grows — early packs are cheap, later ones are a decision. The count lives on `GameState.packPurchases` and is reset with the run.

**Suited is load-bearing.** It is the only pack that lets a player commit to a *strategy* rather than simply get better numbers.

**Rarity is rank, in three tiers.** No separate rarity system is needed.

| Tier | Cards |
| --- | --- |
| Common | 2–10, at **equal weight** — a 10 is no scarcer than a 2 |
| Scarce | J, Q, K, Joker |
| Rarest | A, alone |

2–10 are flat because a numbered card's value comes from the hands it can form,
not from its individual rank — the hand ladder already does the separating, and
charging scarcity for the numbers as well would double-count the same
difference. The Ace is alone in the rarest tier because
nothing else restrains board growth — see the King and Ace hazards under "Face
cards, the Ace, and the Jokers". The Joker sits with the face cards rather than below them: its
Clear is the one card that can always break a grind, and making the escape hatch
the hardest card to obtain would be a trap.

**Court shifts mass into the scarce tier, and never improves Ace odds** — it is
better odds on face cards, not a way to buy board growth.

## Time model

Bloons-style rounds:

- Rounds are discrete and numbered.
- The gap between rounds is **untimed** — the player plans and builds with no pressure.
- The player starts a round manually, or enables **auto-start** so rounds chain. Auto-start is a setting, not a game mode.
- Once live, combat runs in **real time** and does not wait for the player.
- **Face-card actions and a Joker's Clear can be played during a round.** Committing a hand is a build-phase action and happens only in the gap — see "Playing a hand". Building is confined to the gap.

Chess pieces move in **discrete hops** on a per-piece cadence, not by sliding continuously. The renderer interpolates between squares so motion reads as smooth, while the hop preserves the chess identity and keeps threat ranges legible.

## Movement is chess movement

**Pieces move by real chess rules, not by walking toward the Core.** They have no pathfinding and no goal-seeking: each type moves as its chess counterpart would, and whether that happens to bring it near the Core is a property of the board, not of its intent.

Every Piece is **forward-biased and deterministic**: it travels down-board, from the Staging rank toward rank 0, as a pure function of its type and its own carried state (`moveCount`, `handedness`) — never a PRNG, and never a line chosen because the Core happens to sit on it.

This has large consequences that are accepted deliberately:

- **Every Piece can threaten the Core.** A pawn is confined to its file, so only the Core's own file and the two files diagonally adjacent are dangerous to it specifically — but a Pawn that reaches the back rank promotes into a Queen, and every other type hunts the Core directly once its forward move runs out; see Hunting, below.
- **A round therefore ends when nothing on the board can still act**, not when the board is empty. Waiting for an empty board would hang the round forever.

### Pawn

Advances one square down its file. **Captures the Core diagonally forward**, as a pawn takes in chess. A Tower directly ahead blocks it, and it attacks that Tower instead of advancing (at half damage — a Pawn's forward square is not one of its attack tiles). A Tower off to the diagonal is ignored while the path ahead is clear — the pawn's job is to advance, not to detour. Reaching rank 0 **promotes** it to a Queen rather than stranding it — see Promotion, below.

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

**Yellow** Pieces are born hunting — a yellow Queen, Knight, or slider seeks the Core from its first hop on the board, marching only the entry hop off the Staging rank, which no field covers.

**The state latches.** `hunting: boolean` on the Piece is set true the moment hunting starts, and it never clears. Without the latch the feature does not terminate: a same-colour Bishop's first hunting hop goes *away* from rank 0, up to the diagonal intersection that routes it back down to the Core, and at that intersection it has a legal forward diagonal again. An unlatched flag would let it revert to marching, reach rank 0 elsewhere, start hunting again, and oscillate forever. (The Knight's version of the same argument: its first hunting hop goes backwards.) The Queen hunts with full queen movement; her rook/bishop alternation is forward-march behaviour only.

**Direction comes from a per-type distance field.** A breadth-first search over the Piece's own movement gives every square its distance to the target in *moves* — a slide of any length counts as one — computed once per board, seed square, and type, and memoised (`src/game/distanceFields.ts`). A hunting King steps onto the first neighbour, in a fixed order, at distance one less. A hunting slider picks the first direction, in a fixed order, whose line reaches a square one move closer, and slides along it — at most its normal slide distance, King aura included, and **capped at the closer square** so a long slide cannot overshoot its phase target. A BFS field guarantees the closer square exists at every distance `d > 0`, and distance strictly decreases between phases (2→1→0); within a phase every hop advances along a shortest-path line toward that phase's target — arriving on it, exhausting the slide count en route, or grinding the Tower blocking the line. Arrival is bounded and a cycle is impossible by construction; the walk from every square is pinned exhaustively in `movement.test.ts`.

**The fields never see Towers.** They are computed on an empty board, which is what keeps hunting from reopening the mazing risk: Tower placement cannot change which square a hunting Piece is aiming for. A Tower on the chosen line is attacked exactly as any other blocked Piece attacks one — the Piece grinds rather than trying another line. The player can wall a hunting Piece; the player still cannot herd one.

**The red carve-out.** A red Piece's field is still Tower-blind as *geometry* — Towers are never obstacles in it — but red fields are *seeded* at Towers, which is what lets Tower placement attract a red Piece. That is a deliberate inversion of the no-mazing invariant: placing a decoy Tower spends a card and draws aggression toward it.

**The yellow carve-out.** Yellow is steered the opposite way — placement *repels* it. While hunting, a yellow Piece prefers the first candidate, in its fixed scan order, whose *landing square* no Tower can hit; the avoid set is the union of every Tower's `reachableSquares` (`hittableSquares` in `src/game/coverage.ts`), exactly the footprint a shot would actually land on. It is a **soft preference**, never a wall: direction still comes from the Tower-blind field, every hop still lands on a `d−1` candidate (or today's first landing), and a Piece with every candidate covered falls back to today's first-candidate behaviour — so avoidance never strands a Piece and round termination is untouched. It avoids *fire*, never *obstacles*: a Tower-blocked candidate is still ground, never routed around, and the anti-mazing invariant holds for blockers. Like red, this is a deliberate inversion of the no-mazing invariant that costs the player a Card — placement attracts red and repels yellow. See [`2026-08-08-yellow-coverage-avoidance-design.md`](../superpowers/specs/2026-08-08-yellow-coverage-avoidance-design.md).

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

### Tiers

Every spawn is assigned a tier — **green**, **yellow**, **red**, or **black** — a per-Piece set of behaviour flags, never stats or Ink. Any type can be any tier. Green is the baseline; the mix shifts toward the higher tiers as rounds progress (tier unlock rounds and mix weights are placeholder tuning in `src/data/rounds.ts`).

- **Green — dumb.** Exactly the baseline behaviour.
- **Yellow — smart.** Hunts the Core from its first on-board hop (Pawns still promote; the Queen they become inherits yellow).
- **Red — aggressive.** Detours toward the nearest Tower reachable by its own movement (a distance field over its own move set, seeded at each Tower, capped by a placeholder reach radius in `src/data/tiers.ts`), grinds a Tower blocking its line rather than routing around it, and resumes marching once its target falls.
- **Black — sneaky.** Each Tower shot at it rolls the seeded `rng.combat` stream: a 50% chance the Tower fails to detect it (placeholder), and the shot never fires. A Joker's Clear is a board wipe, not damage, so it always destroys a Black Piece.

## Towers

**Towers are destructible.** They have health, take damage from Pieces, and can be shielded by a Jack. A shield absorbs before health and never regenerates. Nothing repairs a Tower except a **health upgrade** the player spends from a Tower's experience upgrades (see below) — and even that heal is a finite, kill-gated, player-controlled act, so a hand-built Tower's health otherwise only ever goes down, which is what makes every grind a countdown.

**Towers are permanent once placed** — they are never removed by the player, only destroyed.

### Towers block, and blocked Pieces attack

**The universal combat rule.** Any Piece deals **full** damage to a Tower that stands on one of its **attack tiles** — a square the Piece could capture onto by its chess movement (a Pawn's forward diagonals, a Knight's L-squares, a slider's lines, a King's neighbouring squares). The one carve-out is **a Pawn blocked straight ahead**: its forward square is not an attack tile, so that attack stays at half (`BLOCKED_ATTACK_MULTIPLIER`). This is a deliberate buff to every Piece's Tower-killing power.

**Towers block movement.** This reverses an earlier decision that they never do. The earlier wording was self-contradictory — it declared Towers non-blocking and then defined them as stopping Pieces in the same breath.

Half damage for the straight-ahead Pawn is what keeps the mechanic working for it: a Pawn's forward square is genuinely stuck territory — neither a capture nor an attack — so it is the one Piece that demolishes poorly, and its attack stays at `BLOCKED_ATTACK_MULTIPLIER` rather than the full rate every other Piece pays.

**There is no pathfinding.** A blocked Piece waits and grinds; it never routes around. This is deliberate — routing around would let the player steer Pieces by placing Towers, which is exactly the mazing the design rejects. The player can *wall*, but cannot *herd*. Red is the only tier that *deliberately seeks* attack positions; the other tiers only ever attack a Tower that happens to block them. The combat rule itself is universal; the seeking is red's alone.

Every Piece therefore contributes anti-Tower pressure, which is what makes a Tower's health the currency of every grind.

**A Tower's own geometry decides whether it can defend itself.** A vertical, cross, adjacent, or star Tower covers the square a Piece attacks it from, so it shoots back. A **diagonal** Tower does not — a Piece attacking from directly along its file sits in a blind spot. That asymmetry is emergent from real geometry, not assigned: a Piece that reaches a diagonal Tower's square grinds it in its blind spot, unanswered.

**A Piece grinding a Tower from the Staging rank is never the exception to that asymmetry — it is the general case.** Damage cannot reach the Staging rank at all, regardless of a Tower's geometry, so a Tower whose coverage would otherwise reach back into the Staging rank still cannot kill the Piece grinding it from there. Three things end that standoff: the Tower falling — a Tower's health decreases except when the player spends a health upgrade, and that banked heal is finite and kill-gated, so the grind is still a countdown — a **Joker's Clear**, which reaches the Staging rank because it is a board wipe rather than damage (see above), and an **Ace**, which admits the waiting Piece to the board and so ends its immunity outright.

**A Tower and a Piece never share a square, and both routes onto that state are closed.** A Tower cannot be built on a square a Piece occupies: blocking only means something if the two never overlap, and a build is one route the movement rule does not already guard. The other route was spawning, and it is closed differently — Pieces spawn onto the **Staging rank**, off the board, where no Tower can stand, and enter by moving. Neither route needs a special case at the point of collision, because after both fixes there is no collision to arbitrate.

**Towers occlude each other's fire.** A shot whose line to its target passes through another Tower on a compass ray is blocked — the Tower behind cannot hit what the Tower in front hides, so `selectTargets` retargets to the next-nearest reachable Piece or holds fire. The coverage overlay follows the same reading — a Tower draws `reachableSquares` (a square the Tower can see but cannot hit is not lit). The toll gate is the one exception to the compass-ray reading: it fires a horizontal beam along every covered rank, so a Piece on any band rank is hidden by a Tower on that same rank standing between the gate and it — wall the gate's full height and nothing behind it is shot.

### Reading a Tower's coverage

**Selecting a Tower lights every square it covers.** Click a Tower and its footprint appears on the board in **amber**, alongside the inspect panel. Since defense is coverage, a footprint the player cannot see is a decision they cannot make: placement is a one-off, but living with the placement is the rest of the run, and every later question — which file is uncovered, which Tower is worth a Queen's range, where the next Tower goes — is a question about footprints.

**Selection is the only trigger. Hovering a Tower deliberately shows nothing.** Coverage is reserved for a Tower the player has actually picked, so the footprint is something asked for rather than something the board throws up whenever the pointer crosses a Tower. This is settled, not pending: a proposal to preview coverage on hover is reopening it.

**Amber is a Tower you own; teal is a hand you have not placed.** The build preview that follows the pointer while a hand's Tower is awaiting placement keeps teal, and both are shown at once rather than one hiding the other — comparing a proposed footprint against the coverage already on the board is how a gap gets found.

**The Wall lights nothing**, correctly — it covers nothing, and the panel says "Never fires — it blocks and soaks" rather than quoting it a targets figure.

**The highlight is coverage, not targeting.** It shows every square the Tower *can* hit, not the Pieces a shot *will* hit — a shot is capped at the type's targets per shot and picks the Pieces nearest the Core. The panel carries that figure beside range and damage, which is what stops a wide disc at the top of the ladder from over-promising: it can light dozens of squares and reach only a handful of the Pieces on them. The moment of a shot is already shown separately, as a pulse over the same footprint.

### Experience upgrades

**Towers earn upgrades from kills.** A Tower's lifetime kills are its experience:
the first upgrade banks at `UPGRADE_FIRST_THRESHOLD` kills (10), the second at
`UPGRADE_SECOND_THRESHOLD` (22), and each further threshold after that is the
previous one escalated by 20% (ceiled — 10, 22, 27, 33, 40, ...). Each crossed
threshold banks one **pending upgrade**. Pending is derived from kills, never
stored; the only bookkeeping is how many have been spent.

**The player spends pending upgrades any time** — mid-round and in the gap alike,
because kills happen mid-round and the heal must be spendable when it matters.
Three choices, each a deliberate axis: **+1 damage**, **−10% fire interval off the
type's base** (additive, so every pick is a true 10% of the original interval),
and **+10% max health**, which raises the ceiling and heals by exactly the
increase — never to full, never more than the ceiling rises. Upgrades stack
uncapped for now.

**A ready Tower glows.** A soft golden halo hugs any Tower with a
banked, unspent upgrade — the only in-scene signal; the choice itself lives in
the Tower's inspect panel.

**The Wall is excluded by construction.** It never fires, so it never kills, so
it can never earn an upgrade. The mechanic does not apply to it.

### No walls, no mazing

**The player never reshapes the path.** There are no blocker cards and no herding — a Tower, even the Wall, blocks but cannot steer. Pieces move by their own rules toward the Core and cannot be herded.

This is a **coverage** tower defense, not a **maze** one: defense is about which squares you can hit. Do not add path manipulation.

## Open questions

**The only canonical list.** Do not resolve these by guessing, silently pick one, or write code that hardcodes an assumption about them. Ask.

| Question | Notes |
| --- | --- |
| **Running out of cards** | Cards are consumed and packs are the only source, so a player can reach zero. Loss, stall, or covered by a guaranteed Ink floor? |
| **Pack weighting and prices** | **Prices are settled** — base prices and per-type escalation are in `src/data/packs.ts` and `src/game/packs.ts`, and the mechanics are recorded in `2026-08-07-scale-pack-prices-design.md`. The **weights** are still open; they are placeholders in `src/data/packs.ts` because a deal cannot happen without them. Pack **sizes** are settled and are not part of this question. |
| **Ink income values** | Kill rewards per Piece type, and the round-completion lump sum, are **placeholders**. Ink's worth is set by what it buys, and **pack prices now exist — see "Pack weighting and prices" above — so these can be resolved against them**. The *shapes* are settled and are not open — see "Ink and packs" above for the current three income paths, and [`2026-08-06-ink-income-design.md`](../superpowers/specs/2026-08-06-ink-income-design.md) for the reasoning behind them. One more thing to weigh whenever this pass happens: `tick.ts` feeds a freshly promoted Queen into the same tick's Tower fire, so a Pawn worth 1 Ink shot on the way in is worth 8 if left to reach the back rank and die as a Queen instead — withholding fire from an approaching Pawn is a legible, currently uncosted 8x income play. This can finally be resolved — jointly with pack prices, as this row has always said. |
| **Capping Queen range stacks** | **Reachable now.** A Queen's +1 range stacks additively with no limit, so a Tower fed every Queen in a Deck grows without bound. Candidate answers: a hard cap per Tower, diminishing returns per stack, or a cap per round. Deliberately left open by the Queen range work — do not resolve it by guessing. Mirrors the other uncapped stacks (see the poker-hands spec's open follow-ups). |
| **Board geometry** | Growable, starting at a literal 8x8 — an Ace adds a rank. Square colour is no longer load-bearing, since the Knight is damageable everywhere, so the checkerboard is preserved for chess-authenticity alone. Whether that argument carries enough weight on its own is undecided. |
| **Tier tuning numbers** | The tier unlock rounds, mix weights, red reach radius, and black miss chance are all placeholders in `src/data/rounds.ts` and `src/data/tiers.ts`. The shapes are settled; the numbers await play experience. |
| **Multiplayer scope** | Still assumed single-player versus AI, no backend, no netcode. |
