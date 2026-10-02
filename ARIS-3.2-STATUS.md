# ARIS 3.2 — Current Status

Updated: 2026-10-02 (Asia/Bangkok)

## Identity

User-facing version: **ARIS 3.2**  
Engine id: `ARIS-3.2.0`

Internal revision suffixes are implementation history only. The in-progress engine remains ARIS 3.2.

## Safety / backups

Permanent backups:
- `backup/pre-aris-3.2-20261002` — baseline before ARIS 3.2 development
- `backup/aris-3.2-pre-audit-fix-20261002` — ARIS 3.2 before the detailed audit-fix pass
- `backup/main-before-aris-3.2-visible-20261002` — main immediately before wiring ARIS 3.2 into the visible application

Frozen legacy engine files were not modified by the ARIS 3.2 integration:
- `v2.js`
- `v3.js`
- `v31.js`
- `v4.js`

## Main integration status

ARIS 3.2 is now present on `main` and is **selectable from the version dropdown**.

Visible option:
`ARIS V3.2 · Stage-Adaptive Brain`

The default remains:
`ARIS-3.1.0`

This is intentional. 3.2 is available for testing but has not been promoted to default before replay / validation.

### Runtime load order

```
v32.js
v32-direction.js
v32-triggers.js
v32-entry.js
v32-training.js
v32-adapter.js
```

### Compatibility adapter

`v32-adapter.js` connects the standalone 3.2 decision engine to the existing application shell for:
- live market input
- current UI view models
- T+10 signal history and settlement
- persistence / journal
- training records
- Continuous Direction panel

The adapter does not call ARIS 3.1 decision logic.

For 1-minute primary analysis, ARIS 3.2 may emit T+10 signals.
Other selected chart timeframes use 3.2 as read-only analytical context and do not silently convert the 10-minute Event engine into a different horizon.

## Training integration

`training-engine-core.js` now recognizes `ARIS-3.2.0`.

`training-engine-registry.js` now exposes:
`ARIS 3.2`

The training iframe explicitly loads all standalone 3.2 runtime modules and the compatibility adapter.

Cache revisions were bumped during integration so the Training registry/core does not intentionally reuse the pre-3.2 asset URLs.

## Detailed audit fixes already completed

- explicit stale data hard block
- normalized stage-confidence vector
- per-trigger-family re-arm memory
- direction-aligned Entry Quality
- live candle / live volume evidence
- live breakout attempt without fake closed acceptance
- live failed-break recapture
- standalone Fibonacci context
- standalone support/resistance + real room
- explicit trend High/Low/Close progression
- trend volume participation
- trigger-family-specific WATCH/READY thresholds
- dominant-stage trigger affinity
- expanded causal entry snapshot
- 1m / 2m / 5m post-entry labels
- stage / breakout / structure / flow post-entry labels
- serialized training paths
- threshold meaning/unit/origin registry
- permanent regression suite

## Verification on main

Latest permanent regression run from the actual `main` files:

**13 passed / 0 failed**

Covered:
- TREND stage
- RANGE stage
- BREAKOUT_ACCEPTED
- FAILED_BREAKOUT
- TRANSITION
- profile-weight normalization
- breakout with no participation remains non-ready
- live breakout attempt without fake closed acceptance
- trend deceleration → range forming
- direction-aligned Entry Quality
- family re-arm
- stale-data hard block
- training causality / labels / path persistence

A separate runtime test using the actual `training-engine-core.js` from main with `__TRAINING_VERSION='ARIS-3.2.0'` confirmed:
- `CFG.version === 'ARIS-3.2.0'`
- `V32CompatEngine` loaded
- sequence `confirming → new`
- emitted signal version `ARIS-3.2.0`
- signal type `v32_trend_follow_through`
- serialized state contains `v32Engine`

## Important validation boundary

ARIS 3.2 is now technically wired and internally regression-tested.

It is **not yet proven more accurate than ARIS 3.1**.

The current weights and trigger thresholds remain design-priors until:
1. identical-window shadow replay,
2. stage/trigger-family comparison,
3. out-of-sample verification,
4. forward-shadow observation.

Do not describe HIGH/LOW edge scores as calibrated win probability.

## Next block

### Block 6 — ARIS 3.1 vs ARIS 3.2 Shadow Replay

Compare identical market windows and measure:
- T+10 results
- signal frequency
- time-to-stage detection
- time-to-trigger
- 3.1 suppressed opportunities
- 3.2 extra opportunities
- false break / range-edge / trend-follow / transition behavior
- family-specific score distributions
- which thresholds should actually be calibrated

Do not promote 3.2 to default until this review is completed.
