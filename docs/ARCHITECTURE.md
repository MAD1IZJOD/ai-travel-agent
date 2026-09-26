# Architecture

This document explains how Wayfare's agent works, why it is built this way, and where each responsibility lives. For setup and a feature overview, see the [README](../README.md).

## Design principles

1. **One agent, separated stages.** A single orchestrator (`src/lib/agent/agent.ts`) runs *understand → research → plan → validate/revise → finalize*. Each stage is a plain module with typed inputs and outputs, so it can be tested alone.
2. **Deterministic core, narrow model use.** Numbers (fares, room rates, totals, times) come from a documented model (`pricing.ts`). Language models are only used to *extract* fields from loose phrasing, and their output is validated like user input.
3. **Validation is separate from generation.** The validator never builds anything; it reads a finished plan. The reviser changes plans, never the traveller's requirements, unless the traveller approves.
4. **Honest provenance.** Every fact carries a label (verified / reference / estimated / suggestion). Unknowns are surfaced, never filled with plausible fiction.
5. **Real progress.** The UI only renders stage events the server emits.

## Request lifecycle

```
Browser                          Server
───────                          ──────
POST /api/understand {text}  →   guards (origin, size, type, rate) → zod
                                 parser.extractFields (rules)
                                 [optional] llm.extract → mergeLlmFields (evidence-gated)
                                 parser.finalizeConstraints → {constraints, origins, issues}
                             ←   JSON

POST /api/plan {constraints,  →  guards → zod (incl. snapshot) → normalizeSnapshot
               previous?}        runAgent (45 s deadline), emitting NDJSON:
                             ←     stage understand (running/done)
                             ←     stage research …  (rankDestinations, gatherResearch)
                             ←     stage plan …      (planWithRevisions)
                             ←     stage validate …  (applyResearch, validatePlan)
                             ←     stage finalize …  (diffPlans)
                             ←     result {plan | null, diff, blocked}
```

## Modules

### Understanding — `parser.ts`, `understand.ts`, `llm/`
- `sanitizeUserText` (in `safety.ts`) normalises Unicode, strips hidden characters and instruction-like phrases, and caps length.
- `extractFields` runs independent extractors for places, duration, travellers, budget, interests (with negation), pace (with negation and contradiction detection) and dates.
- `finalizeConstraints` applies defaults, validates ranges and records an **origin** for each field (`stated` / `inferred` / `default`) plus **issues** (`blocking` / `warning` / `info`).
- `understandRequest` calls an optional `LlmAssistant` only when the rules left gaps. `mergeLlmFields` lets rules win, maps generic terrain ("the hills") to interests, and accepts model values only when the text contains evidence for that field.
- Providers: `llm/claude.ts` (Anthropic SDK, structured output via zod) and `llm/ollama.ts` (local model, JSON-schema `format`, `think: false`). `llm/index.ts` selects one from environment variables.

### Research — `selector.ts`, `research.ts`, `tools/`
- `rankDestinations` scores every destination: interest fit (0–3 per interest), **activity depth** (can it fill the trip with in-season, on-topic things?), season, travel burden (overnight journeys discounted) and affordability (from the cheapest workable plan).
- `gatherResearch` fetches the destination article, up to 10 attraction articles and weather in parallel, records every call (ok / failed / skipped / filtered) and rejects articles whose coordinates are far from the place.
- `applyResearch` attaches research to *any* plan version, so revisions and replans reuse it; it removes links to articles that weren't fetched.
- `tools/core.ts`: `fetchJson` (timeout, 256 KB cap, one rate-limit retry honouring `Retry-After`), `createLimiter` (Wikipedia concurrency 3), `TtlCache`, `sanitizeExternalText`.

### Planning — `transport.ts`, `itinerary.ts`, `planner.ts`
- `transportOptions` builds bus / train / flight options door to door (road factor, railhead/airport last mile) from `pricing.ts`; `chooseTransport` picks cheapest or best cost-time balance (value of time per stay tier, pace-weighted, overnight journeys discounted) and explains the choice against each alternative.
- `travelWindows` turns the chosen leg into usable hours per day: overnight arrivals, same-day trips, multi-day journeys, hotel nights, and a feasibility check (≥ 3 hours on the ground).
- `buildItinerary` fills each slot within its window: pace caps per day and per slot, interest weighting with diversity, off-topic activities never outnumbering on-topic ones, seasonal months, travel time from the previous stop, sunrise activities, and full-day excursions. It prices food, activities and local travel per day.
- `buildPlan` assembles transport, stay, itinerary and the budget (with a 7% buffer) into a `TripPlan`.

### Validation and revision — `validator.ts`, `reviser.ts`
- `validatePlan` returns `ConstraintCheck[]` (hard/soft, pass/warn/fail) with human-readable detail.
- `fitToBudget` walks a fixed ladder of cost-cutting steps, recording each saving; `planWithRevisions` falls back to another suitable destination if the traveller left the choice open, and otherwise returns `needs-approval` with `proposeAdjustments` (each priced by re-planning). When travel alone exceeds the trip, it returns a blocked outcome with lengthen/closer options. All loops are bounded: a fixed ladder, one pass over at most 12 destinations, and at most one fallback recursion.

### Replanning — `replan.ts`
- `snapshotOf` / `normalizeSnapshot` (IDs are trusted after validation; display strings are rebuilt server-side).
- `chooseReplanDestination` keeps the previous destination unless you changed it or another scores clearly better.
- Previous activity IDs are passed as `preferredActivityIds`, so unchanged parts of the itinerary stay put.
- `diffPlans` maps each changed area to its most direct cause, lists what was preserved and writes a one-line summary.

### API and server — `app/api/*`, `lib/server/*`
- `http.ts`: same-origin check, JSON content type, streamed 32 KB body cap, client key.
- `rateLimit.ts`: sliding window per client (plan 12/min, understand 30/min).
- `log.ts`: JSON log lines with request IDs; no user text.

### UI — `components/`
- `planner/TripPlanner.tsx` coordinates the flow; `useAgentRun.ts` consumes the NDJSON stream.
- `trip/*` renders the plan. Everything reads the same `TripPlan` type; no business logic lives in components.

## Why not multiple agents or a framework?

The work here is mostly deterministic (costs, times, calendars) with one fuzzy step (reading loose language). A multi-agent setup would add latency, cost and non-determinism without improving the parts that matter most to a traveller: that the plan fits, the numbers add up, and the claims are sourced. A framework would hide exactly the control flow the evaluation suite asserts on.

## Evaluation hooks

- The orchestrator's `emit` stream is the **trajectory** checked by the eval invariants.
- Tools accept an injected `fetch`, so tests simulate outages, malformed data, rate limits and injected content without the network.
- The LLM assistant is an injected dependency, so tests exercise hostile model output deterministically.
