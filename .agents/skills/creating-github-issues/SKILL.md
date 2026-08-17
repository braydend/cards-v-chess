---
name: creating-github-issues
description: Use when creating GitHub issues for this repo — turning a bug report, a requested feature, or a documentation/question concern into a tagged issue with a detailed body. Use when filing bug tickets or feature tickets, or when asked to write one up. Use when issues are the backlog to be picked up later.
---

# Creating GitHub Issues

## Overview

Issues in this repo are the backlog for later work. A filed issue must be self-contained: investigated before it is written, checked against existing issues, tagged with the right label, and given a detailed body in the required template. If it cannot be picked up later by someone who was not in this conversation, it is not done.

## When to Use

- A bug report becomes a bug ticket.
- A feature request becomes a feature ticket.
- A doc, balance, or question concern becomes a ticket.

Do NOT use for drafting an issue to a local file without filing it, or for a change that is being implemented now rather than backlogged.

## Workflow

1. **Classify** — bug, feature, or other. This picks the template and the label. If unclear, ask.
2. **Investigate first, always.** Read the relevant code and docs before writing a word of the ticket.
   - For a **bug**: find the responsible code. Name it with `file:line` and explain the mechanism — what the code does and why that produces the observed symptom.
   - For a **feature**: check `docs/design/game-design.md` — its open-questions list is the single source of truth. If the doc already resolves the question, do not file; say so and point at the doc. If the feature contradicts a frozen spec in `docs/superpowers/specs/`, say so in the ticket.
   - Use the repo's exact domain vocabulary: rounds (never "waves"), Towers, Pieces, Ink, Deck, Core, hands, packs, Staging rank.
3. **Check for duplicates.** Run `gh issue list --state open` and search titles/bodies. If an open issue already covers it, stop and point at it — do not file. Reference a related closed issue by number.
4. **Fill the required template below.** Its sections, in its order, are the contract.
5. **File it:** `gh issue create --title "..." --body "$BODY" --label <label>` (or `--body-file`). Create, don't just prepare.
6. **Report** the issue URL to the user.

## Labels

Use only labels that already exist in the repo (`gh label list` to confirm):

| Ticket | Label |
| --- | --- |
| Bug | `bug` |
| Feature | `enhancement` |
| Documentation | `documentation` |
| Needs clarification | `question` |
| Easy entry point | add `good first issue` |
| Inviting outside help | add `help wanted` |

## The Required Template

Every ticket body **is** these sections, in this order, with these headings. No extra sections, no merged sections, no invented headings. The one exception is marked optional.

### Bug ticket

```markdown
## Context

What part of the game, which subsystem, who ran into it.

## Problem

Expected vs actual. What the player expected, and what actually happened.

## Repro

Steps to reproduce, concrete enough to follow from a fresh run.

## Cause

The responsible code with `file:line` references and the mechanism. This is the section that earns the ticket a pick-up later.

## Suggested fix

Optional. A sketch of a direction, with `file:line` where it lands.

## Refs

Links to the design doc, dated specs, or related issues by number.
```

### Feature ticket

```markdown
## Context

What part of the game, which subsystem, the gap it fills.

## Motivation

Why it matters and what it unlocks for the player or the design.

## Proposed behavior

What the feature does, precisely enough to implement against.

## Acceptance criteria

The checkable outcomes that make the ticket done.

## Refs

Links to the design doc, dated specs, or related issues by number.
```

## Common Mistakes

- **Inventing sections** — `## Summary`, `## Why`, `## Investigation`, `## Notes`. Use only the template headings. A ticket with extra sections reads as unbacklogged.
- **No `file:line` in Cause** — "the board rendering is wrong somewhere" is not a ticket. The Cause must point at code.
- **Skipping the duplicate check** — the repo has few open issues; check before filing.
- **Label drift** — `documentation` for a feature, `bug` for a balance concern. Use the table.
- **Vocabulary drift** — "waves", "defenders", "currency" instead of rounds, Towers, Ink.
- **Filing against a settled design** — if `game-design.md` or a dated spec already decides it, reference it instead.

## Red Flags

- "I should check the code first" — do it before writing anything, not after.
- "The template doesn't quite fit" — it fits. Use its sections.
- "I'll skip the duplicate check, it's a niche issue" — check anyway.
- "I'll write it in my own structure, the content is what matters" — the structure is what makes it pick-up-able.