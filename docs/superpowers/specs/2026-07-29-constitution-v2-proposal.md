# Music Nerd Constitution v2 — proposal

**Date:** 2026-07-29
**Status:** Proposal for team review (Pete, Carl, C.Y.) — not scheduled
**Origin:** Carl's observation that his ChatGPT music conversations read like a
friend rather than an encyclopedia, and his shared project instructions.

## The insight worth keeping

Carl's own analysis contains the load-bearing line:

> "None of the personality came from the factual content. The facts (release
> date, previous collaboration, credits) are ordinary research. What made the
> exchange memorable was the *voice*."

That maps directly onto the pipeline we already have. The Curator retrieves
facts from Exa; the Writer renders them. Personality is a Writer-stage
concern. Which means **voice can be turned up without touching hallucination
risk — as long as the claim surface stays fixed.**

The three proposals below follow from separating those two things.

## What v1 already covers

Most of Carl's prompt is already law. This is not a rewrite.

| Carl's directive | Existing rule |
|---|---|
| No hedging, confident criticism | `VOICE GUARD: Never hedge ("likely", "suggests", "perhaps")` |
| Connect artists across scenes | `Every nugget connects two things` |
| Explain why it works | `Story over facts — lead with cause and effect` |
| Personalized observations from taste | `tasteContext` (index.ts:1918), plus the rule forbidding taste-as-status-reminder — stricter and better than Carl's version |

No change proposed to any of these.

## Proposal 1 — Permit opinion (new rule)

**The gap.** Every rule in v1 governs facts: specificity, novelty, sourcing,
connection, brevity. Nothing permits a nugget to say *this is great, and here
is why*. The quality Carl responded to — confident aesthetic judgment — has no
room to exist in our output.

**Why it is free.** An opinion has no claim surface. "That bassline is filthy"
cannot be false the way a release date can. Turning this dial to maximum does
not move the hallucination rate. It is the highest value-per-risk change
available to us.

**The shape that keeps it safe.** An opinion rides on a grounded fact; it never
substitutes for one. Sourced claim first, judgment second.

> BAD (opinion with no fact): "This is the best thing they've ever done."
> GOOD (opinion earning its place on a fact): "They kept the blown-out scratch
> vocal instead of re-recording it — and it's the whole reason the track hits."

**Tier scaling.** Fits the tone ladder we already have: casual gets enthusiasm,
curious gets a considered take, nerd gets the actual hot take.

**Open question for the team:** does an opinion need to be *defensible* from
the retrieved research, or is pure taste allowed? Stricter is safer but blander.

## Proposal 2 — Fix the Curator-failure fallback (do this first)

`generate-nuggets/index.ts:1403`:

```
warningsForWriter: ["Curation unavailable — writer should rely on its own knowledge"]
```

When research fails, the pipeline explicitly instructs ungrounded generation.
This contradicts two existing rules — `If uncertain about a fact, OMIT IT` and
silence-over-noise — and it is the one place where Proposal 1 actively makes
things worse: a confident voice with no sources produces confident invention,
which is harder to catch than bland invention.

The thin-research path at `:2816` already handles this correctly: *"research is
thin. Stick to verifiable basics from the catalog data and the user's own
taste."* The two paths disagree. The fallback should adopt the `:2816`
behaviour.

**This should land before any voice change**, and is worth doing regardless of
whether Proposals 1 and 3 are accepted. It is independent of Carl's input.

## Proposal 3 — Teach the Validator the difference

`CONSTITUTION_SCORING_CRITERIA` scores only fact dimensions: `specificity`,
`connection`, `novelty`, `brevity`, `realSource`, `factClarity`.

If nuggets start carrying opinions, the Validator must recognise a judgment as
a judgment and not attempt to source it. Otherwise the model learns to hedge
its opinions — "arguably one of the best" — which `VOICE GUARD` already bans.
We would get the worst of both: unsourceable claims *and* hedged prose.

Minimum change: the Validator must not penalise an unsourced clause when that
clause is evaluative rather than factual. Whether opinions earn their own score
dimension is a separate question.

## Explicitly not importing

**"Connect artists across scenes and history."** Influence and lineage are
factual claims, not style. v1 *already* requires a connection on every nugget.
Layering "be confident, make strong judgments" on top of an existing
connect-two-things mandate is the recipe for confidently-wrong lineage. This is
the one Carl directive that would measurably raise our hallucination rate.

**Vivid metaphor, with caution.** "Entered through the penthouse" is a good
line that also asserts a career trajectory. Metaphor can smuggle claims. Worth
allowing, worth watching.

**Swearing and adult humour.** These are personal chat-session settings. Our
nuggets are broadcast to every user at a tier. This is a brand decision, not a
quality one, and should be decided deliberately rather than inherited from
someone's ChatGPT config.

## Sequencing

`generate-nuggets/index.ts` carries a deploy guard: v57 (May 9) is the
production cut, and in-progress prompt work ships in a dedicated PR validated
against Pete's 50-example test set. Any change here follows that path.

Suggested order: Proposal 2 alone first (a safety fix, measurable on its own),
then 1 and 3 together, validated against the 50-example set before deploy.
