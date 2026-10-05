# ARIS 3.3 Elliott — r2 final-lock hardening

Target specification: **ARIS 3.3 Elliott Wave FINAL MASTER SPECIFICATION / FINAL LOCK**.

This revision keeps ARIS 3.1 as the trading engine and runs Elliott as an independent observer/predictor. Wave Score remains experimental and is never presented as a calibrated probability.

## Integrity

- ARIS 3.1 remains the default engine.
- `v31.js` is unchanged.
- `v33-base.js` preserves 3.1 execution behaviour and human execution reasons; only 3.3 version/storage identity is separate.
- Elliott does not alter entry gates, thresholds, signals or Execution Fib.
- Deterministic 400-bar / 1,080-evaluation regression produced 15 signals in both 3.1 and 3.3 with matching status, reason, event, signal core, V3 story and Execution Fib.
- Backup before this hardening pass: `backup-before-v33-final-fixes-20261006`.

## Elliott engine

- Separate bounded candle/pivot history.
- Confirmed pivots plus live/provisional endpoints.
- Micro / Working / Structural degrees.
- Degree timing distributions are stored separately; Micro/Structural no longer reuse Working duration history.
- Stable Candidate IDs and Wave IDs by degree.
- Parent/child links with explicit promotion/reclassification audit events.
- Multiple motive/corrective candidates, pruning, Preferred/Alternate and ambiguity/Unknown states.
- Impulse hard rules.
- Diagonal candidate handling with overlap exception/geometry.
- Zigzag 5-3-5 internal validation.
- Flat 3-3-5 internal validation and regular/expanded/running external classification.
- Contracting Triangle candidate requires valid parent position.
- Extension and truncated-fifth annotations.
- Complex/combination structures can remain unresolved instead of being forced into a false count.
- Recursive subwave validation is bounded for performance.

## Projection

- Candidate-anchored Wave Fib is separate from 3.1 Execution Fib.
- Elliott Channel, structural swing, zone and HTF references can contribute to target confluence.
- A Fib-only level is shown only as an unconfirmed provisional reference.
- **Primary Target / Prediction Box requires at least one independent confluence source in addition to Wave Fib.**
- Price target and time target are ranges.
- Trigger and structural invalidation are attached to each active prediction.
- Box lifecycle: ACTIVE / HIT / EXPIRED / INVALIDATED / EXTENDED.
- Count disappearance/replacement invalidates the corresponding active box.
- Wave-state reprojection closes the old box before creating the new one, preventing duplicate active boxes.

## No-repaint / persistence

- Count snapshots are append-only.
- Hard-rule failures create explicit `COUNT_INVALIDATED` records.
- Recounts retain the previous count and reason code.
- Degree promotion/reclassification is audited.
- Count stability in bars is recorded.
- `v33Memory` is restored across reloads.
- Journal/local fallback memories are merged without rewriting existing audit records.
- Symbol and timeframe state are isolated.
- Closed candle history is treated as immutable inside Elliott audit state.
- History/audit/box storage remains bounded and discloses evictions.

## Evaluation / training

Evaluation output includes:

- Direction accuracy
- Target hit rate
- Time hit rate
- Invalidation rate
- Recount rate
- Count stability (average/median bars)
- Coverage
- Unknown rate
- Score buckets
- Wave breakdown
- Pattern breakdown
- Degree breakdown
- Regime breakdown
- Timeframe breakdown
- Symbol breakdown

3.3 signal-time Elliott snapshots remain separate from the original trading outcome labels. Elliott still has no influence on entry decisions.

## Tests

`tests/v33-smoke.cjs` now covers:

- bullish/bearish impulse
- Wave 2 origin invalidation
- Wave 4 overlap
- diagonal overlap/position handling
- Wave 3 extension
- truncated Wave 5
- Zigzag 5-3-5
- Flat 3-3-5
- Triangle parent position
- insufficient/complex/ambiguous states
- stable Count/Wave IDs
- Fib-only target rejection
- real target confluence
- prediction hit/expiry/invalidation
- evaluation metrics
- missing volume / flat / shock / duplicate pivots
- symbol/timeframe isolation
- stale/reconnect input
- reload audit preservation
- responsive integration guards
- Training-engine integration
- strict 3.1 vs 3.3 execution regression
- recount / invalidation / degree-reclassification lifecycle events

GitHub Actions workflow: `.github/workflows/aris-v33-regression.yml`.

## Responsive UI

- Working degree remains the default user-facing layer.
- Micro and Structural can be selected without changing the engine.
- Mobile/iPad-safe width/overflow rules are isolated in `v33.css`.
- Desktop can expose more detail without a different Elliott engine.
- Current/Next copy uses human-readable “Wave …” wording.
- When target confluence is insufficient, the UI says the target is not confirmed and does not draw a Prediction Box.

## Deliberate experimental limits

These are research limits, not hidden implementation claims:

- Degree classification is heuristic and must be calibrated on real market data.
- Diagonal and complex-correction grammar is intentionally conservative rather than exhaustive.
- Wave Score is **not** a win probability until real score-bucket calibration exists.
- Time projection is experimental until sufficient forward samples exist.
- Browser/device visual acceptance still requires live viewing on the target iPhone/iPad/desktop; static responsive guards are in place, but no code review can replace that final visual acceptance.
- Real walk-forward/forward performance must be collected before Elliott is ever allowed to influence entries.

## Current release identity

- Engine: `ARIS-3.3.0`
- Revision: `elliott-observer-v33-r2-final-lock`
- Live/Training cache revision: `20261006-r2`
- Trading influence: **OFF**
