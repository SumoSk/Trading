# ARIS 3.3 Elliott — r8 pre-entry timing and fixed T+10

Release: `ARIS-3.3.0` / `elliott-entry-v33-r8-t10`.
Live and Training asset revision: `20261007-r8-t10`.

## Execution

- ARIS 3.1 remains the default. `v31.js` and `v2.js` are unchanged.
- In 3.3, Elliott is evaluated before candidate confirmation and signal creation. There is no post-issuance rollback.
- BOOST and CAUTION now change actual entry quality. The balanced experimental policy uses a quality threshold of 70 when Elliott changes eligibility.
- Confirmed Wave 3/5/C resumption can supply a continuation thesis when the ordinary reader is observing a pullback/transition/trend advance. It still requires structure/location gates, micro coverage, aligned evidence, fresh confirmation, episode/leg deduplication and the dual-HTF guard.
- `WAVE_EARLY` can use confirmed wave support before both soft gates have fully passed; it cannot override a hard or soft BLOCK.
- Invalid, forming or unresolved counts are neutral. They cannot veto an otherwise-valid base entry simply because an unconfirmed count breaks.
- Close confirmed counts with a unanimous next direction may provide bounded support. The count label stays Unknown; the system does not claim a unique confirmed count.
- A wave outside the ten-minute horizon or without a held trigger cannot boost/block entry. Live trigger confirmation resets after reclaim or a continuity gap.
- Disabling Elliott entry influence preserves the 3.1 baseline decisions, reasons and execution Fib in the deterministic regression.

## Counts and prediction geometry

- Previous counts are invalidated against their original pivots, never against unrelated latest swings.
- Wave-4 triggers depart from the completed Wave-3 endpoint, before the target and the Wave-1 overlap boundary. Both bullish and bearish cases are tested.
- Primary targets require independent zone/swing/channel/HTF confluence in addition to Wave Fib. Fib-only levels remain provisional.
- Each count/state has one immutable prediction clock. HIT/EXPIRED/INVALIDATED predictions do not restart on every recalculation.
- Live entry and Working-degree UI use the frozen prediction window when available.
- Existing impulse, diagonal candidate, Zigzag, Flat, parent-position Triangle, subdivision, extension and truncation checks remain in place. Complex corrections may stay unresolved.

## Fixed ten-minute evaluation

- Wave projections, issued entries and qualified blocked shadow opportunities freeze entry price, direction and expiry at creation.
- T+10 labels continue after recount or prediction-box invalidation. Target hits and box lifecycle metrics are separate from T+10 direction results.
- The first observed price at/after expiry is accepted only within 3 seconds. Later observations produce `missing`, excluded from the scored denominator.
- Report schema `elliott-evaluation-2` includes counts, pending/equal/missing outcomes and breakdowns by kind, score, regime, symbol and timeframe.
- Persisted forecast labels are merged without downgrading settled labels to pending. Entry settings and disabled influence survive journal fallback/reload.
- Storage is bounded; eviction counts are disclosed. Reports describe retained observations, not an unlimited lifetime ledger.

## Training

- Live and Training use the same 3.3 revision and assets.
- Replay carries symbol/timeframe identity and clears Elliott evaluation at the warmup/test boundary while retaining causal structural history.
- Compact records retain pre-outcome entry quality, Elliott context, revision, episode, entry mode and expiry.
- Outcomes use the actual T+10 candle timestamp. A missing expiry candle cannot shift the outcome to ten later available bars.
- Checkpoints from an older 3.3 revision require a fresh replay; old and new engine decisions cannot be silently mixed.
- Chronological 60/20/20 splits and expanding walk-forward folds purge earlier labels not yet known when the next slice starts, plus episodes shared with later slices. Purged samples are reported and never returned through the fallback split.
- Validation uses captured 3.3 entry quality; it does not treat ARIS 2.0 Audit as the 3.3 predictor. Missing scores remain missing, not zero.
- Replay is a one-minute candle-close adapter, not a reconstruction of live tick timing or order-book history.

## Verification

- `node tests/v33-smoke.cjs`: existing Elliott rules, persistence, entry veto and strict 3.1 equivalence with influence disabled (400 synthetic bars / 1,080 observations / 15 matching entries).
- `node tests/v33-timing.cjs`: wave-4 geometry, anchored invalidation, consensus, real quality eligibility, held trigger, immutable T+10, journal merge, purged validation, active stream and real Training-engine replay.
- `node tests/v2-regression.cjs`: 41 checks protecting older engines; retired-version assertions now match the existing version migration.
- `.github/workflows/aris-v33-regression.yml` runs all three suites.
- Backup-before-change was advanced to `47b77a40bb62bcac82a8334d9e4057ceed4130ca` before editing. The locked backup branch is untouched.

## Remaining research limits

Wave Score and entry quality are experimental heuristic scores, not calibrated win probabilities. The synthetic tests prove engineering behavior, not improved market accuracy or profitability. Real market replay, purged holdout, forward/shadow results and sufficient samples per bucket are still needed. Degree classification, complex/diagonal grammar and duration forecasts remain conservative and incomplete; this release does not claim exhaustive Elliott coverage.
