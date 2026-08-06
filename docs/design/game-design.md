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

So the 7♦ either builds a rank-7 Tower or speeds up a Tower you already have. The choice happens at play time. A Joker is not modal: it has neither rank nor suit, and exactly one action.

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

| Rank | Firing geometry | Pieces hit per shot |
| --- | --- | --- |
| **2** | Adjacent — the eight surrounding squares | 1 |
| **3** | Vertical — along its file | 1 |
| **4** | Cross — horizontal and vertical | 1 |
| **5** | Diagonal — the X | 1 |
| **6** | Star — cross and diagonal together, all eight rays | 1 |
| **7** | Disc — adjacent, widened several squares out | 1 |
| **8** | Star, with longer rays | **3** |
| **9** | Disc, the same shape as rank 7 | **5** |
| **10** | Disc, wider still | **everything it covers** |

**Shape carries the rank's identity through 7. From 8 upward the ladder scales on how many Pieces a shot hits instead.** After adjacent, vertical, cross, diagonal and star, the supply of generic non-chess silhouettes is spent, and the candidates left fight the power curve — a ring that only fires at exact range is *weaker* up close, and "the whole board" is a ceiling with nothing above it. Target count has no such problem, reads at a glance, and answers the Pawn swarm the roster is built around.

Range, damage, fire interval and Tower health are **placeholder balance values** living in `src/data/towerRanks.ts`. The design commits only to power rising with rank. Note that range is not comparable across geometries — it counts squares along the pattern, so a disc of range 3 covers a 7×7 area while a vertical line of range 4 covers 8 squares. Rank 7's shorter range is not a downgrade from rank 5's.

Rank 2 was originally **horizontal** and was changed after measuring it. Pieces travel down a file, so a horizontal line caught each Piece for exactly one move interval — one shot, which a Pawn survived: 1 damage against rank 3's 6. Adjacent keeps a Piece covered for three squares of its approach instead, and gives the lowest rank a coherent identity as a short-range blocker with teeth.

Chess movement, added afterwards, sharpened this rather than changing it: a pawn is now *strictly* confined to its file, so a horizontal Tower would have been worse still.

Shape alone gives no power curve — diagonal is not inherently better than cross — so **range and damage scale with rank** on top of it, and a 5 out-damages a 4 despite a narrower pattern.

Rank 5's geometry stands as identity alone: diagonal is simply the shape left once rank 4 has claimed the cross. Diagonal Towers do have a side effect worth naming — they preserve square colour, since a diagonal Tower on a light square can only ever hit light squares — but nothing in the current design keys off that property; the Knight is damageable on every square, colour included. The property stays true and is available if a future mechanic wants a colour-keyed effect.

**Towers are generic, never chess-themed.** Their geometry comes from card rank, not from chess pieces.

### Face cards, the Ace, and the Jokers

These **act instead of building**, under one governing principle:

> **Suits tune numbers. Face cards change kind.**

♥ ♦ ♠ ♣ already own the whole stat quartet, and a face card can already be played for its suit — at a premium, onto any Tower — so a face card whose rank mode merely bumped a stat would be a fifth suit.

| Card | Action | Needs a Tower? |
| --- | --- | --- |
| **Jack — Shield** | Give a Tower a shield of **10** — flat, additive, absorbed before health, never regenerating | Yes |
| **Queen — Echo** | Build a copy of an existing Tower's **rank** on an empty square | Yes |
| **King — Reinforce** | Raise Core current **and** maximum health by **1** | No |
| **Ace — Expand** | Grow the board by one rank, lengthening the run to the Core | No |
| **Joker — Clear** | Destroy every Piece standing on the board | No |

Each touches a different layer — a Tower's durability, the number of Towers, the Core, the battlefield, the Pieces. None of them duplicates a suit.

**A shield differs from ♥ Repair in kind, not magnitude:** repair is reactive and can be out-paced, a shield is pre-emptive and cannot. Overflow carries into health, so no single hit is wasted and a shield never blocks more than it is worth.

**Echo copies the rank only.** Accumulated ♦ ♠ ♣ supports and any shield do not carry across, or Echo would be the strongest support multiplier in the game rather than a second Tower.

**Reinforce is the only card that touches the Core, and the only Core recovery there is** — nothing else ever adds to it. A leak costs exactly 1 Core health, so a King buys exactly one extra leak. Whether that competes with playing the same King for its suit is a live balance question, not a settled one.

**Clear leaves Towers and pending spawns alone.** Towers are permanent and only ever destroyed by Pieces, and a round still spawning continues rather than ending early. Being suitless, Clear is a Joker's only play — and it is the one card that can always break a grind.

Two hazards arrive with packs, because copies are unlimited by design. Neither is reachable while the Deck is a fixed authored list:

- A **King**-heavy Deck means unbounded Core health.
- An **Ace**-heavy Deck means an arbitrarily long board — a rendering and camera-framing problem as much as a balance one.

Both will want a cap then.

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

**A run opens by opening a pack.** There is no fixed starter Deck — the opening position is whatever the pack deals, and reading it is the first real decision of the run.

### Seeds

A run is identified by a **seed**, making it reproducible and shareable: same seed, same pack contents, same round composition, same opening.

This requires a **seeded PRNG carried in `GameState`**. `Math.random` must never appear in `src/game/` — it breaks determinism and seeds alike.

## Ink and packs

**Ink** is the run currency. It buys **packs**. It is never spent to play a card.

Earned two ways:

- **Round income** — a lump sum when a round completes.
- **Kill rewards** — each destroyed Piece pays out, scaled by type. A Pawn trickles; a Queen pays properly.

Unspent Ink carries between rounds.

**Ink income must be event-driven — round completion and kills — never time-driven.** The gap between rounds is untimed, so any time-based income is unbounded: the player would simply wait. This is structural, not a balance knob.

There are **no real-money purchases**. Ink is earned by playing. This keeps the game a static site with local persistence — no payment processor, no accounts, no backend — and avoids the regulatory exposure of paid randomised packs.

### Pack types

| Pack | Contents |
| --- | --- |
| **Scrap** | 3 random cards — cheapest, for smooth frequent progress |
| **Base** | 10 random cards — the baseline |
| **Court** | 10 cards weighted toward high ranks — expensive |
| **Suited** | 10 cards all of one suit, player's choice — mid to expensive |

**Prices are fixed per pack type. Packs do not escalate in price.** Distinct types at distinct prices give a real decision ("save for a Court, or buy two Base now?") and self-balance, because the player sets their own rate.

**Suited is load-bearing.** It is the only pack that lets a player commit to a *strategy* rather than simply get better numbers.

**Rarity is rank.** Low numbers common, high numbers scarce, face cards and Aces precious. No separate rarity system is needed.

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

- **A Piece can only threaten the Core if chess movement can reach it.** A pawn is confined to its file, so only the Core's own file and the two files diagonally adjacent are dangerous to it specifically. Sliders and the King reach further, because the lateral fallback below sweeps them across the whole rank once they hit the back rank.
- **A round therefore ends when nothing on the board can still act**, not when the board is empty. Waiting for an empty board would hang the round forever.
- **Knights hunt; nothing else does.** A Knight's hops only ever go forward, so at rank 0 all four zig-zag candidates would need to land off the board. Every other type has a designed answer already — Pawns promote, sliders and the King sweep sideways — and a Knight gets one of its own: rather than stranding there, it starts hunting the Core directly, using knight moves guided by a distance field instead of the forward zig-zag. See Promotion and Hunting, both below.

### Pawn

Advances one square down its file. **Captures the Core diagonally forward**, as a pawn takes in chess. A Tower directly ahead blocks it, and it attacks that Tower instead of advancing. A Tower off to the diagonal is ignored while the path ahead is clear — the pawn's job is to advance, not to detour. Reaching rank 0 **promotes** it to a Queen rather than stranding it — see Promotion, below.

### Knight

A zig-zag L-hop: it alternates `(file−1, rank−2)` and `(file+1, rank−2)`, with the starting side set at spawn so Knights weave opposite ways. Its primary hop crosses two ranks; a one-rank fallback candidate lets it still reach rank 0 from rank 1 rather than stranding a hop early. Either way it rarely sits still long enough for a line-shaped Tower to land a repeat shot. Once its forward hops run out, it starts hunting the Core instead of stopping — see Hunting, below.

### Bishop

Slides forward along a diagonal, reflecting off the side edges — which keeps it on its own square colour, as a real bishop does.

### Rook

Slides straight down its file.

### Queen

Slides, alternating the Rook's line and the Bishop's line hop by hop — the only Piece that both advances and changes files under her own steam, which is the "flexible" in her roster entry.

### King

One square straight forward, always. It never slides and never gains a slide bonus of its own — see Auras, under The Chess roster below, for what it grants everyone else instead.

Bishop, Rook, and Queen — the sliders — move **one square per hop**, exactly like the Pawn, **+1 while adjacent to a King**. A slide of N resolves as **N single-square steps along one committed line**: it stops early on a Tower (which it attacks) or the Core (which it leaks into), and if it reaches a board edge mid-slide it stops there too, at the corner, rather than bending onto a new line for the remaining steps.

### Promotion

A Pawn reaching rank 0 becomes a Queen, at full Queen health, instead of stranding. This is chess-exact, and it turns the back-rank pile-up from clutter into a threat: an ignored Pawn eventually becomes the elite Piece on the roster.

### Lateral fallback

When a Piece's forward square is off the board, **sliders and the King sweep sideways along their rank instead**, reflecting off the file edges. Reflection **flips the Piece's `handedness`** rather than retrying the same side — without that flip, a Piece would bounce between two files forever and the round could never end. Flipping makes it traverse the whole rank instead, so it eventually crosses the Core's file and leaks.

**Knights take a different fallback: hunting, not sweeping.** A Knight's hops only ever go forward, so at rank 0 every zig-zag candidate would need to land off the board, and unlike a slider or the King it has no lateral sweep of its own. See Hunting, below, for what it does instead — the reasoning is the same shape (a Piece that would otherwise have nothing left to do needs a designed way to keep threatening), but the mechanism differs because a Knight shuffling sideways one square is not a knight move.

The fallback direction is always carried in `handedness`, never chosen because the Core happens to be on one side — that would be goal-seeking, the same thing forward-bias above already rules out for every Piece type. Hunting is the one deliberate exception to that rule; see Hunting for why it does not reopen the mazing risk the rule exists to close.

### Hunting

Once a Knight runs out of forward hops, it **hunts the Core** using knight moves the rest of the way, rather than stranding on rank 0 forever. This is the one Piece behaviour allowed to aim at the Core directly — a narrow, explicit exception to "never choose direction because the Core lies that way," stated under Movement is chess movement, above.

**The state latches.** `hunting: boolean` on the Piece is set true the moment a Knight either is already hunting or has run out of forward hops, and it never clears. Without the latch the feature does not terminate: a hunting Knight's first hop necessarily goes *backwards* — every knight move off rank 0 does — and landing further up the board it would have a legal forward hop again. An unlatched flag would let it revert to zig-zagging, march back down to rank 0, strand, start hunting backwards again, and repeat forever.

**Direction comes from a knight-distance field.** A breadth-first search over knight moves across the board's squares gives every square its distance to the Core, computed once per board and Core square and memoised (`src/game/knightDistance.ts`). A hunting Knight takes the first knight-move candidate — in a fixed offset order, for determinism — whose distance is exactly one less than its own square's. A BFS field guarantees a `d − 1` neighbour at every square with `d > 0`, so a hunting Knight reaches the Core within its own distance, in hops — at most six on an 8x8 board — and the strict decrease on every hop makes a cycle structurally impossible, not merely absent from testing.

**The field never sees Towers.** It is computed on an empty board, which is what keeps the exception narrow: Tower placement cannot change which square a hunting Knight is aiming for. A Tower on the chosen square is attacked exactly as any other blocked Piece attacks one — the Knight grinds rather than trying a different candidate. The player can wall a hunting Knight; the player still cannot herd one.

See [`docs/superpowers/specs/2026-08-06-hunting-knights-design.md`](../superpowers/specs/2026-08-06-hunting-knights-design.md) for the full reasoning, including the rejected alternatives (promoting stranded Knights, giving them the lateral sweep, and deleting stranded Pieces at round end).

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

### No walls, no mazing

**There are no wall or blocker cards, and the player never reshapes the path.** Pieces move by their own rules toward the Core and cannot be herded.

This is a **coverage** tower defense, not a **maze** one: defense is about which squares you can hit. Do not add path manipulation.

## Open questions

**The only canonical list.** Do not resolve these by guessing, silently pick one, or write code that hardcodes an assumption about them. Ask.

| Question | Notes |
| --- | --- |
| **Which pack opens a run** | A run starts by opening one, but the type is not fixed. Presumably Base. |
| **Run length and loss condition** | How long a run is, what ends it, and whether difficulty scales per round or in stages. |
| **Running out of cards** | Cards are consumed and packs are the only source, so a player can reach zero. Loss, stall, or covered by a guaranteed Ink floor? |
| **Pack weighting and prices** | How rank scarcity translates into pack contents, and what each type costs. |
| **PRNG streams** | One stream (simplest) versus separate named streams for packs/rounds/draws, so seeds survive code changes. |
| **Repair versus the wall** | **Reachable now — ♥ Repair exists.** Towers block and there is no pathfinding, so a repaired Tower a Piece cannot break is a permanent wall, and against a rank-5 Tower's `diagonal` blind spot the Piece cannot even shoot back. What bounds it today is that **cards are consumed and packs do not exist**: ♥ runs out, the Tower falls, and the round resumes. `src/game/roundTermination.test.ts` pins that bound, and the Joker is the escape hatch. **Adding packs removes the bound.** Two later changes made each ♥ worth more against the wall without touching that bound: ♥ now restores to **full** rather than by magnitude, so one card can absorb a whole Tower's worth of grinding; and ♠ raises `maxHealth`, so a ♠-fed Tower gives each subsequent ♥ a higher ceiling to fill. The wall is the same length in cards and longer in seconds. Candidate answers: attacked Towers lose *maximum* health permanently so repair only delays; repair capped per round; or a blocked Piece eventually breaks through regardless. Decide with play experience, not on paper. A third change tightens it in the other direction: a ♥ now reaches only a Tower of its own rank, so fewer of the ♥ in a Deck can sustain any given wall. The bound was already finite; it is now shorter in cards. Nothing here depends on it being loose. |
| **Capping stacked supports** | **Reachable now.** Supports stack additively with no limit, so a Tower fed every ♠ in a Deck grows without bound — and with flat values, *n* supports is exactly *n* × the flat amount, which makes the growth easy to reason about but does not bound it. The rank match narrows how many Cards can reach one Tower, which is a constraint but not a cap. Candidate answers: a hard cap per Tower, diminishing returns per stack, or a cap per round. Deliberately left open by the rank-matching work — do not resolve it by guessing. |
| **Board geometry** | Growable, starting at a literal 8x8 — an Ace adds a rank. Square colour is no longer load-bearing, since the Knight is damageable everywhere, so the checkerboard is preserved for chess-authenticity alone. Whether that argument carries enough weight on its own is undecided. |
| **Multiplayer scope** | Still assumed single-player versus AI, no backend, no netcode. |
