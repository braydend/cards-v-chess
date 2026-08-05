# Cards V Chess — Card System and Chess Roster

**Date:** 2026-08-05
**Status:** Card grammar and chess roster agreed. Rank ladder and several details still open — see "Open questions", and do not resolve them by guessing.

Supersedes parts of [2026-08-05-cards-v-chess-design.md](2026-08-05-cards-v-chess-design.md); see "What this changes" at the end.

## The card grammar

The Cards faction uses a **standard 54-card deck** — ranks 2 through 10, Jack, Queen, King, Ace, plus two Jokers. Not bespoke designed cards. The vocabulary is one every player already knows, which is the point.

Every card is **modal**: playing it means choosing one of two uses.

> **Rank builds. Suit supports.**

- Played for its **rank**, a card builds a Tower whose geometry and power come from that rank.
- Played for its **suit**, it applies a support action to a Tower already on the board.

So the 7♦ either builds a rank-7 Tower, or speeds up a Tower you already have. The choice is made at play time, not at deckbuild time.

This has a useful property worth preserving: because every card can always build, **the player can never be stuck** holding only support cards with nothing to support.

### Suit actions

| Suit | Action on a Tower |
| --- | --- |
| ♥ Hearts | **Repair** — restore lost health |
| ♦ Diamonds | **Speed** — increase fire rate |
| ♠ Spades | **Health** — increase maximum health |
| ♣ Clubs | **Damage** — increase damage |

Damage / rate / max-health / heal is the classic tower-upgrade quartet, and it maps onto the four suits with nothing left over.

Support magnitude scales with rank, as Tower power does: a 9♥ is a large repair, a 2♥ a small one.

### Rank ladder

Rank sets the Tower's firing geometry and its power.

| Rank | Firing geometry |
| --- | --- |
| **2** | Horizontal — along its board rank |
| **3** | Vertical — along its file |
| **4** | Cross — horizontal and vertical |
| **5** | Diagonal — the X |
| 6–10 | **Open** |

Shape is the rank's *identity*; **range and damage scale with rank**. Shape alone gives no power curve — diagonal is not inherently better than cross — so a 5 out-damages a 4 despite a narrower pattern.

The 2/3/4 progression teaches itself, since 4 is visibly 2 and 3 combined.

**Why 5 is specifically diagonal:** diagonals preserve square colour. A diagonal-firing Tower on a light square can only ever hit light squares — and the Knight is only damageable on light squares. So the Knight counter emerges from real chess geometry rather than being assigned. This recovers the best property of the rejected chess-firing-pattern idea without making Towers chess-themed.

Ranks 6 through 10 are **open**. The principle — simple at the bottom, more powerful toward the top — is agreed; the assignments are not. Do not invent them.

Towers are **generic**, not chess-themed. An earlier proposal gave Towers chess-piece firing patterns (rook lines, bishop diagonals, knight jumps); that was **rejected**. The Cards faction has its own identity and does not borrow chess geometry.

### Ace, face cards, and Jokers

Ace, Jack, Queen, King, and the two Jokers perform **specific actions rather than following the rank ladder** — an upgrade or an evolution for a Tower is the direction. Deliberately parked: the specifics are not designed yet.

## There is no in-match resource

**Playing a card costs nothing.** Cards are gated by hand size and draw rate, not by spending.

The reasoning: a card game with a hand limit already has a resource — the cards themselves. Adding a mana-style pool on top is a second constraint that usually just slows play down, and Balatro demonstrates the model works without one. It also keeps rank purely a *power* curve rather than a cost curve, which is simpler to teach.

Consequence to accept: without a cost, a high card is strictly better than a low one in **both** modes. The decision in hand becomes "build a new Tower, or fix an existing one?" rather than an efficiency puzzle. That is still a real choice, just a different one.

An earlier proposal made the number on the card its Ink cost in both modes, creating a tension where low cards are efficient support and high cards efficient Towers. **Rejected** — Ink is not an in-match resource.

## Ink is the run currency

**Ink** buys **packs**. It is earned by playing and spent between rounds, Balatro-style. It is not spent on playing cards.

Earned two ways:

- **Round income** — a lump sum when a round completes.
- **Kill rewards** — each destroyed Piece pays out, scaled by type. A Pawn trickles; a Queen pays properly.

Unspent Ink carries between rounds, so saving for an expensive pack is a real strategy.

### Why Ink must never accrue over time

The gap between rounds is **untimed**. Any income that accrues with the passage of time is therefore unbounded — the player simply waits in the gap and accumulates as much as they like.

**Ink income must be event-driven — round completion and kills — never time-driven.** This constraint is structural, not a balance preference.

### No real money

Ink is earned by playing. There are no real-money purchases, which means no payment processor, no accounts, and no backend — the game stays a static site with local persistence. It also avoids the regulatory exposure of paid randomised packs, which are treated as gambling in several jurisdictions.

## Runs

The game is **run-based**, not a persistent collection. A run is a sequence of rounds; the deck is built up *during* the run and does not survive it.

### Runs are seeded

A run is identified by a **seed**, so it is reproducible and shareable — same seed, same pack contents, same round composition, same draw order.

This requires a **seeded PRNG carried in `GameState`**. The engine currently contains no randomness at all, so nothing has to be undone to add it. `Math.random` must never appear in `src/game/`: it would break both determinism and seeds.

**Caveat:** with a single PRNG stream, any change to the *order* of random calls invalidates existing seeds. Acceptable during development. If seeds should survive updates, use separate named streams — packs, rounds, draws — so adding a call in one does not shift the others.

### Run deck

| Rule | Value |
| --- | --- |
| Run deck cap | **30 cards** |
| Copies of any one card | **Unlimited** |
| Opening hand | 5 |
| Draw | 2 at each round start |
| In-match hand cap | 10 |

**The 30-cap is a hard limit, and acquiring cards forces destroying cards.** Buying a 10-card pack while holding 25 means choosing 5 cards to destroy in order to fit. Every pack is therefore a "what do I cut?" decision, which is the point.

**No copy limit.** An earlier draft capped copies at 2, to stop random packs producing permanently dead duplicates. The 30-cap makes that unnecessary: a bad pull is a cut candidate, not dead weight, and the cap already limits total power. Eight copies of the 5♦ is a legitimate consistency build. A copy limit would fight the culling mechanic rather than support it.

**Terminology:** the cap is on the **deck**, not the hand. *Hand* means the cards held to play during a round (5 opening, drawing 2, capped at 10). Both caps exist and do different jobs; do not let "hand" mean both.

## Packs

Packs are bought with Ink between rounds.

| Pack | Contents |
| --- | --- |
| **Scrap** | 3 random cards — cheapest, for smooth frequent progress |
| **Base** | 10 random cards — the baseline |
| **Court** | 10 cards weighted toward high ranks — expensive |
| **Suited** | 10 cards all of one suit, player's choice — mid to expensive |

**Prices are fixed per pack type. Packs do not escalate in price.** Escalating cost punishes success and is opaque — the player feels a brake without understanding it. Distinct types at distinct prices give a real decision instead ("save for a Court, or buy two Base now?"), and it self-balances because the player sets their own rate.

**Suited is the load-bearing one.** It is the only pack that lets a player *commit to a strategy* rather than simply get better numbers — buying all ♥ to build a repair-heavy defense is a plan. Weighted packs make you stronger; targeted packs make you specific, which is more interesting.

### Rarity is rank

Rarity needs no separate invented system. **Rank is rarity**: low numbers common, high numbers scarce, face cards and Aces precious. Pulling an Ace needs no explanation, and an earlier proposal for invented Common/Rare/Legendary tiers was scaffolding for what the idiom already provides.

Exact pack weighting and prices are open.

## The Chess roster

Six piece types, each mapping a real chess trait onto a tower-defense threat.

| Piece | Chess trait | Threat | Forces |
| --- | --- | --- | --- |
| **Pawn** | One step forward, numerous | **Chaff swarm** — weak, slow, many. **Promotes to a Queen if it survives long enough.** | Area damage; single-target towers drown |
| **Knight** | Changes square colour on every move | **Colour-flicker** — only damageable while on a **light** square | Coverage of the right colour at the right moment |
| **Bishop** | Diagonals; thematically a cleric | **Healer** — sustains the wave until killed | Retargeting; kill it first |
| **Rook** | Straight lines, long | **Armoured tank** — slow, high health | Piercing or sustained damage |
| **Queen** | Everything, long | **Elite** — flexible, rare, dangerous | Burst and focused fire |
| **King** | One square, but *the* target | **Commander** — slow, tough, buffs adjacent Pieces | Priority targeting |

Pawn promotion turns a chaff wave into a timer: ignore the weak pieces and they become the elite threat. It is thematically exact — in chess the pawn promotes on reaching the far rank — and cheap to implement, since the engine already tracks per-piece position.

The Knight's colour vulnerability makes an existing visual property of the board mechanically load-bearing. The board already knows its own square colours and the renderer already draws them.

## Towers are destructible

Towers have **health**, can be damaged by Pieces, and are repaired with ♥ cards. Repair is meaningless otherwise.

This reverses a decision made while designing the roster — permanent Towers were agreed in discussion, though never written into a spec. The consequence is real: placements become losable investments, and the economy is now partly about maintenance rather than only expansion.

### Targeting: emergent from placement

**No Piece type is a designated Tower-hunter.** Instead, one rule applies to every Piece:

> A Piece whose move would land it on a Tower's square **attacks that Tower instead of moving**.

Targeting therefore falls out of board geometry and the player's own placement decisions, not from per-type flags.

**Towers do not block movement.** This matters: if Towers blocked, Towers would *be* walls, and mazing would return through the back door after being deliberately removed. Pieces still path toward the Core by their own rules, so the player cannot redirect them — they only choose whether to put a Tower in harm's way.

Why this over assigning hunters per piece type:

- It turns Tower placement into a genuine **risk decision** rather than a pure coverage puzzle. A Tower in the traffic lane covers more ground and gets chewed up; one off to the side is safe but does less. No per-type assignment creates that tension.
- Every Piece contributes anti-Tower pressure, so **repair reliably has a job** — more reliably than a single designated hunter would provide.
- It adds nothing to Pieces that already carry strong gimmicks. The Knight (colour-flicker), Bishop (healer), and King (commander) stay unmuddied.

**This resolves the Bishop's double role: it is a pure healer and nothing else.**

An earlier sketch — Pawns bypass Towers while Knights and Bishops hunt them — was considered and rejected. It loaded the anti-Tower job onto the two pieces with the strongest existing gimmicks, which read as confused.

**Parked, not rejected:** giving the Rook a dedicated siege behaviour, actively seeking Towers rather than the Core. Thematically apt (a rook is a castle; siege engines attack fortifications) and the Rook's "armoured tank" threat is otherwise plain enough to carry it. Revisit if play shows the emergent rule alone leaves repair underused.

## Design decisions and rationale

### No walls, no mazing

**There are no wall or blocker cards, and the player never reshapes the path.** Pieces move by their own rules toward the Core and cannot be herded.

The reasoning is worth keeping, because the decision looks arbitrary without it. An earlier Knight design had it jump over walls, specifically so that "build a maze" would not become the universal answer. When the Knight became a colour-flicker, that check disappeared — so rather than reintroduce a wall-breaker, the premise went instead.

The result is a **coverage** tower defense, not a **maze** tower defense: defense is about which squares you can hit. That fits chess, where you do not corral a knight, and it makes position and square colour the whole tactical dimension — which is exactly where the Knight and Bishop designs bite.

### Why rank-as-rarity rather than tiers

An earlier proposal used invented Common / Rare / Legendary tiers. Playing cards already encode scarcity through rank, so the tiers were scaffolding for something the idiom provides for free.

## Open questions

Do not resolve these by guessing.

| Question | Status |
| --- | --- |
| **Ranks 6–10** | Ranks 2–5 are set. The rest of the geometry ladder is undesigned. |
| **Ace / face cards / Jokers** | Direction agreed (upgrade or evolution); specifics parked. |
| **Starting run deck** | What a run begins with. It must be **at or under the 30-cap**, so a full 54-card deck is not an option. A small starter (roughly 12–16 cards) growing toward 30 is the obvious shape, but the size and composition are undecided. |
| **Run length and loss** | How many rounds a run is, what ends it, and whether difficulty scales per round or in stages. |
| **Deck reshuffling** | Whether the deck reshuffles each round (Balatro-style) or is drawn down across the whole run, and what happens when it is exhausted. |
| **Pack weighting and prices** | How rank scarcity translates into pack contents, and what each pack type costs. |
| **PRNG streams** | Single stream (simplest) versus separate named streams for packs/rounds/draws (seeds survive code changes). |
| **Board geometry** | Still a literal 8x8 placeholder. Square colour is now mechanically load-bearing, which is an argument for keeping a true chessboard. |
| **Multiplayer scope** | Still assumed single-player versus AI. |

## What this changes

Superseded from the foundation spec:

- **Persistence and metagame** is no longer open — the game is **run-based and seeded**, with packs bought during a run. There is no persistent cross-session collection.
- **Economy** is no longer open, and the resource now has a name: **Ink**. The foundation spec's instruction not to coin a name is discharged. Note Ink buys **packs**, and playing a card costs nothing.
- **The card pool** is no longer wholly open; the grammar is fixed even though the ladder is not.
- **Per-piece characteristics** are largely resolved — all six threats are assigned.
- **Towers permanent** is reversed: Towers are destructible.

Rejected along the way, recorded so they are not revisited by accident:

- Towers with chess-piece firing patterns.
- Bespoke named cards (Archer Post, Cathedral, and similar) instead of playing-card ranks.
- Separate Tower / Tactic / Upgrade card categories — replaced by per-card modality.
- Invented rarity tiers — replaced by rank.
- Knight as a wall-jumper; Bishop as a sniper.
- Wall and blocker cards.

## Next step

Build a **thin vertical slice**, not the whole pool:

1. Tower health and repair.
2. Piece targeting behaviour — bypass versus hunt.
3. The modal card system: hand, Ink cost, and playing a card for rank or for suit.
4. **Only ranks 2 to 5.**

Five interacting mechanics — modal cards, destructible Towers, split targeting, suit upgrades, colour vulnerability — have all been designed and none played. The rank ladder is the cheapest part to change and the most expensive to guess wrong at scale, so a five-rank slice will teach more than fifty designed cards.

Then: the rest of the ladder, Ace/face/Jokers, and the pack and collection layer.
