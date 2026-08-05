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
| **2** | Horizontal — along its board rank |
| **3** | Vertical — along its file |
| **4** | Cross — horizontal and vertical |
| **5** | Diagonal — the X |
| 6–10 | **Open** |
| J, Q, K, A, Jokers | **Open** — these do not follow the ladder |

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

### Targeting is emergent

**No Piece type is a designated Tower-hunter.** One rule covers every Piece:

> A Piece whose move would land it on a Tower's square **attacks that Tower instead of moving**.

**Towers do not block movement.** If they blocked, Towers would *be* walls and mazing would return. Pieces cannot be redirected — the player only chooses whether to place a Tower in harm's way, which makes placement a **risk decision** rather than a pure coverage puzzle.

Every Piece therefore contributes anti-Tower pressure, so repair reliably has a job.

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
| **Stalling on an indestructible Tower** | If a Piece keeps attacking a Tower it cannot destroy and its only path runs through that square, the round never ends. Needs a stopping rule — route around after N attempts, guaranteed Tower death, or attacks displacing the Piece. |
| **Per-piece movement rules** | The roster assigns each Piece a *threat*, but not its exact movement. The Knight's colour-flicker requires that it genuinely alternates square colour each hop. |
| **Board geometry** | Still a literal 8x8. Square colour being load-bearing argues for keeping a true chessboard. |
| **Multiplayer scope** | Still assumed single-player versus AI, no backend, no netcode. |
