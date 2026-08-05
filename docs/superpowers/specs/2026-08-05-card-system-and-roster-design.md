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

**Note:** ♥, ♦, and ♠ are as agreed. **♣ = damage is proposed, not confirmed** — it was inferred to complete the set. Confirm before building.

### Rank ladder

Rank sets the Tower's firing geometry and power. Low ranks are cheap and simple; high ranks are stronger and scarcer.

One data point is agreed: **a 2 builds a Tower that fires horizontally only.**

The rest of the ladder is **open**. The principle — simple geometry at the bottom, powerful and more complex toward the top — is agreed; the specific assignments are not. Do not invent them.

Towers are **generic**, not chess-themed. An earlier proposal gave Towers chess-piece firing patterns (rook lines, bishop diagonals, knight jumps); that was **rejected**. The Cards faction has its own identity and does not borrow chess geometry.

### Ace, face cards, and Jokers

Ace, Jack, Queen, King, and the two Jokers perform **specific actions rather than following the rank ladder** — an upgrade or an evolution for a Tower is the direction. Deliberately parked: the specifics are not designed yet.

## Economy: Ink

**Ink** is the resource that gates playing cards. The name is chosen deliberately — cards are printed things, so spending ink to play one is intuitive, and it belongs to the Cards faction rather than being a generic fantasy import.

Ink is earned two ways:

- **Round income** — a lump sum when a round starts. Guarantees a floor, so one bad round is not a death spiral.
- **Kill rewards** — each destroyed Piece pays out, scaled by type. A Pawn trickles; a Queen pays properly.

Unspent Ink **carries over** between rounds, so saving for an expensive play is a real strategy.

### Why Ink must never regenerate over time

The gap between rounds is **untimed**. Any resource that accrues with the passage of time is therefore unbounded — the player simply waits in the gap and accumulates as much as they like.

**Ink income must be event-driven — round start and kills — never time-driven.** This rules out the Clash Royale model of a continuously refilling pool, which would otherwise have suited real-time rounds well. This constraint is structural, not a balance preference.

## Deck, hand, and draw

| Rule | Value |
| --- | --- |
| Deck size | 30 |
| Copies of any one card | Max 2 |
| Opening hand | 5 |
| Draw | 2 at each round start |
| Hand cap | 10 |

Over a roughly 12-round match that is about 29 draws from a 30-card deck, so the player sees nearly all of it. This is deliberate: **draw luck affects ordering, not access.** It preserves real card-game texture — you plan around what you hold — while defusing "I lost to a bad draw", which was the main argument against a draw-based model.

## Collection and packs

The player buys **packs of 10 cards** with **in-game currency earned by playing**. No real money.

That decision matters beyond the economy: no payment processor, no accounts, no backend. The game stays a static site with local persistence. It also avoids the regulatory exposure of paid randomised packs, which are treated as gambling in several jurisdictions.

### Rarity is rank

Rarity needs no separate invented system. **Rank is rarity**: low numbers common, high numbers scarce, face cards and Aces precious. Pulling an Ace needs no explanation.

This also answers what is collectible about a known 52-card deck: a collection is a **multiset**. A player might own four 3s and no Ace, so deckbuilding is shaped by what they actually hold.

Exact pack weighting is open.

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
| **♣ = damage** | Inferred to complete the suit quartet. Unconfirmed. |
| **The rank ladder** | Only "2 fires horizontally" is agreed. Ranks 3–10 undesigned. |
| **Ace / face cards / Jokers** | Direction agreed (upgrade or evolution); specifics parked. |
| **Pack weighting** | How rank scarcity translates into pack contents. |
| **Board geometry** | Still a literal 8x8 placeholder. Square colour is now mechanically load-bearing, which is an argument for keeping a true chessboard. |
| **Multiplayer scope** | Still assumed single-player versus AI. |

## What this changes

Superseded from the foundation spec:

- **Persistence and metagame** is no longer open — packs, a collection, and deckbuilding are **in**.
- **Economy** is no longer open, and the resource now has a name: **Ink**. The foundation spec's instruction not to coin a name is discharged.
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
