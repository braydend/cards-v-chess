# Cards V Chess — Game Design

**Living document.** This is the single source of truth for what the game currently is, and it holds the only canonical list of open questions.

It deliberately does **not** record history. For why a decision was made, and what was considered and rejected, see the dated decision records in [`docs/superpowers/specs/`](../superpowers/specs/) — those are frozen and never updated.

If this document and anything else disagree, this document wins. If it contradicts *itself*, that is a bug — fix it.

## Concept

A web-based 3D tower defense game with trading-card-game mechanics. Two factions, and the name is literal:

- **Cards** — the player. A standard 54-card deck is the arsenal.
- **Chess** — the AI attacker. Waves of chess pieces invade, each type mapping a real chess trait onto a tower-defense threat.

It is a **one-sided defense**. The player is always Cards; Chess is always the attacker. There is no mode where the player commands chess pieces.

The player defends the **Core**. A Piece that reaches it causes a **leak** and damages it. When the Core falls, the run ends.

## The card system

### Grammar

The deck is a **standard 54-card deck** — ranks 2 through 10, Jack, Queen, King, Ace, and two Jokers. Not bespoke designed cards.

Every card is **modal**. Playing it means choosing one of two uses:

> **Rank builds. Suit supports.**

- Played for its **rank**, a card builds a Tower whose firing geometry and power come from that rank.
- Played for its **suit**, it applies a support action to a Tower already on the board.

So the 7♦ either builds a rank-7 Tower or speeds up a Tower you already have. The choice happens at play time.

Because every card can always build, **the player can never be stuck** holding only support cards with nothing to support. Preserve that property.

### Suit actions

| Suit | Action on a Tower |
| --- | --- |
| ♥ Hearts | **Repair** — restore lost health |
| ♦ Diamonds | **Speed** — increase fire rate |
| ♠ Spades | **Health** — increase maximum health |
| ♣ Clubs | **Damage** — increase damage |

Support magnitude scales with rank, as Tower power does: a 9♥ is a large repair, a 2♥ a small one.

### Rank ladder

| Rank | Firing geometry |
| --- | --- |
| **2** | Adjacent — the eight surrounding squares |
| **3** | Vertical — along its file |
| **4** | Cross — horizontal and vertical |
| **5** | Diagonal — the X |
| 6–10 | **Open** |
| J, Q, K, A, Jokers | **Open** — these do not follow the ladder |

Rank 2 was originally **horizontal** and was changed after measuring it. Pieces travel down a file, so a horizontal line caught each Piece for exactly one move interval — one shot, which a Pawn survived: 1 damage against rank 3's 6. Adjacent keeps a Piece covered for three squares of its approach instead, and gives the lowest rank a coherent identity as a short-range blocker with teeth.

Chess movement, added afterwards, sharpened this rather than changing it: a pawn is now *strictly* confined to its file, so a horizontal Tower would have been worse still.

Shape is the rank's *identity*; **range and damage scale with rank**. Shape alone gives no power curve — diagonal is not inherently better than cross — so a 5 out-damages a 4 despite a narrower pattern.

Rank 5 is diagonal for a specific reason: **diagonals preserve square colour.** A diagonal Tower on a light square can only ever hit light squares, which is exactly the Knight's vulnerability window. The counter emerges from real chess geometry rather than being assigned.

**Towers are generic, never chess-themed.** Their geometry comes from card rank, not from chess pieces.

Ace, the face cards, and the Jokers perform **specific actions rather than following the ladder** — a Tower upgrade or evolution is the agreed direction. Specifics undesigned.

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

This has large consequences that are accepted deliberately:

- **A Piece can only threaten the Core if chess movement can reach it.** A pawn is confined to its file, so only the Core's own file and the two files diagonally adjacent are dangerous. Every other pawn marches to the back rank and stops.
- **Pieces strand.** A pawn that reaches the back rank off the Core's file has no legal move for the rest of the run. This is a real chess outcome, not a bug.
- **A round therefore ends when nothing on the board can still act**, not when the board is empty. Waiting for an empty board would hang the round forever.
- **Stranded Pieces are left standing**, not quietly deleted, so the gap stays visible. The designed answer is **Pawn promotion** — in chess a pawn promotes on reaching the far rank, and here the back rank is exactly where they pile up. Not yet implemented.

### Pawn

Advances one square down its file. **Captures the Core diagonally forward**, as a pawn takes in chess. A Tower directly ahead blocks it, and it attacks that Tower instead of advancing. A Tower off to the diagonal is ignored while the path ahead is clear — the pawn's job is to advance, not to detour.

## The Chess roster

| Piece | Chess trait | Threat | Forces |
| --- | --- | --- | --- |
| **Pawn** | One step forward, numerous | **Chaff swarm** — weak, slow, many. **Promotes to a Queen if it survives long enough** | Area damage; single-target Towers drown |
| **Knight** | Changes square colour on every move | **Colour-flicker** — only damageable while on a **light** square | Coverage of the right colour at the right moment |
| **Bishop** | Diagonals; thematically a cleric | **Healer** — sustains the wave until killed. Nothing else | Retargeting; kill it first |
| **Rook** | Straight lines, long | **Armoured tank** — slow, high health | Piercing or sustained damage |
| **Queen** | Everything, long | **Elite** — flexible, rare, dangerous | Burst and focused fire |
| **King** | One square, but *the* target | **Commander** — slow, tough, buffs adjacent Pieces | Priority targeting |

Pawn promotion turns a chaff wave into a timer: ignore the weak pieces and they become the elite threat.

**Square colour is mechanically load-bearing** because of the Knight. It is not decoration.

## Towers

**Towers are destructible.** They have health, take damage from Pieces, and are repaired with ♥ cards.

**Towers are permanent once placed** — they are never removed by the player, only destroyed.

### Towers block, and blocked Pieces attack

**No Piece type is a designated Tower-hunter.** One rule covers every Piece:

> A Piece whose next square holds a Tower **does not advance**. It attacks that Tower instead, at **half** its attack damage.

**Towers block movement.** This reverses an earlier decision that they never do. The earlier wording was self-contradictory — it declared Towers non-blocking and then defined them as stopping Pieces in the same breath.

Half damage is what makes the mechanic work: Pieces are poor demolitionists, so a Tower is a real obstacle rather than a speed bump. The multiplier is kept separate from a Piece's base attack damage so that a future Piece *designed* to demolish Towers can attack at full effect.

**There is no pathfinding.** A blocked Piece waits and grinds; it never routes around. This is deliberate — routing around would let the player steer Pieces by placing Towers, which is exactly the mazing the design rejects. The player can *wall*, but cannot *herd*.

Every Piece therefore contributes anti-Tower pressure, so repair will reliably have a job.

**A Tower's own geometry decides whether it can defend itself.** A vertical, cross, or adjacent Tower covers the square a Piece attacks it from, so it shoots back. A **diagonal** Tower does not — a Piece attacking from directly along its file sits in a blind spot. That asymmetry is emergent from real geometry, not assigned, and it is the case to watch when repair arrives.

### No walls, no mazing

**There are no wall or blocker cards, and the player never reshapes the path.** Pieces move by their own rules toward the Core and cannot be herded.

This is a **coverage** tower defense, not a **maze** one: defense is about which squares you can hit. Do not add path manipulation.

## Open questions

**The only canonical list.** Do not resolve these by guessing, silently pick one, or write code that hardcodes an assumption about them. Ask.

| Question | Notes |
| --- | --- |
| **Ranks 6–10** | Ranks 2–5 are set; the rest of the geometry ladder is undesigned. |
| **Ace, face cards, Jokers** | Direction agreed (Tower upgrade or evolution); specifics parked. |
| **Which pack opens a run** | A run starts by opening one, but the type is not fixed. Presumably Base. |
| **Run length and loss condition** | How long a run is, what ends it, and whether difficulty scales per round or in stages. |
| **Running out of cards** | Cards are consumed and packs are the only source, so a player can reach zero. Loss, stall, or covered by a guaranteed Ink floor? |
| **Pack weighting and prices** | How rank scarcity translates into pack contents, and what each type costs. |
| **PRNG streams** | One stream (simplest) versus separate named streams for packs/rounds/draws, so seeds survive code changes. |
| **Repair versus the wall** | **Not yet reachable, but will be the moment ♥ repair lands.** Towers block and there is no pathfinding, so a repaired Tower a Piece cannot break is a permanent wall — and against a diagonal Tower's blind spot the Piece cannot even be shot, so the round never ends. Candidate answers: attacked Towers lose *maximum* health permanently so repair only delays; repair capped per round; or a blocked Piece eventually breaks through regardless. Decide with play experience, not on paper. |
| **How far do sliding Pieces move?** | **Blocks Bishop, Rook, and Queen.** In chess these slide any distance along a line, which here would carry them most of the way to the Core in a single move. Chess-exact is probably unplayable; a capped slide is not really chess. Needs deciding before those types can be added. Pawn, Knight (L-hop), and King (one square) are unambiguous and need no decision. |
| **Stranded Pieces** | Pawns off the Core's file reach the back rank and can never move again. They currently remain on the board and accumulate across rounds. Pawn promotion is the designed answer; until then this is visible clutter. |
| **The Core is hard to reach** | With chess pawn movement, only three of eight files threaten the Core at all. Whether that is acceptable difficulty, or wants a wider Core, a different board, or piece types that can traverse files, is undecided. |
| **Board geometry** | Still a literal 8x8. Square colour being load-bearing argues for keeping a true chessboard. |
| **Multiplayer scope** | Still assumed single-player versus AI, no backend, no netcode. |
