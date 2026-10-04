# ARIS Training 2 — T+10 Research Lab

## Purpose

Training 2 is a separate historical research system for the ARIS trading project in `SumoSk/Trading`.

It is not a normal futures position-management simulator. The research question is fixed:

> At T0, using only information available at or before T0, can we predict whether the settlement price exactly 10 minutes later will be above or below the Entry price?

For 1-minute data:

- Entry = close price of bar `i`
- Settlement = close price of bar `i + 10`
- `Settlement > Entry` → HIGH
- `Settlement < Entry` → LOW
- equal price → EQUAL

Bars T+1 through T+10 may be stored for outcome visualization, but must never be used as predictors for the same T0 sample.

## Why Training 2 exists

The existing ARIS engines already contain many hand-designed calculations: trend, EMA, momentum, acceleration, structure, candle behavior, volume, range, breakout/fake breakout, Fibonacci, higher-timeframe context, market stage, and other gates.

Training 2 does not add another live formula. It first asks the historical data:

- Which market states are predictable at T+10?
- Which states remain close to random and should be avoided?
- Which pre-entry features actually change T+10 outcomes?
- Which combinations remain stable on later unseen data?
- When should a future engine say NO TRADE before trying to choose HIGH or LOW?

## Separation from Training 1 and Live

- Training 1 remains unchanged as the existing replay/engine-training workflow.
- Training 2 is a separate page: `training2.html`.
- It reuses the same Historical IndexedDB through `historical-data.js`.
- It does not mutate Live Engine settings.
- It does not automatically rewrite engine weights.
- It does not create orders.
- It does not implement stop loss, take profit, trailing stop, or early exit.

## Main files

- `training2.html` — responsive Training 2 UI.
- `training2-core.js` — T+10 sample builder, feature snapshot, stage grouping, split, playability, filters, outcome analysis, and integrity checks.
- `training2.js` — page state, Historical DB integration, charts, tabs, filtering, candidate saving, and export.
- `historical-data.js` — shared historical data store/downloader from the existing project.
- `training-lab.js` — only modified to expose “เทรน 2” beside “เทรน 1” and provide navigation.

## Training 2 workflow

1. Load or reuse a 1-minute Historical Session.
2. Build one T+10 sample for every eligible T0.
3. Snapshot only pre-entry features.
4. Assign a descriptive Market Stage.
5. Label exact T+10 outcome.
6. Split chronologically into Train / Validation / Holdout with purge gaps around boundaries.
7. Explore Market Map.
8. Explore Playability.
9. Inspect individual features.
10. Test manual feature combinations without editing source code.
11. Compare Train / Validation / Holdout.
12. View real historical samples on the chart and reveal T+10 only after T0 context is shown.
13. Save research Candidates.
14. Export research JSON for later engine design.

## Training 2 V1 features

The initial descriptive feature snapshot includes:

- EMA 9 / EMA 21 distance
- EMA slope
- trend strength
- momentum 3 / 5 / 10
- acceleration
- ATR 14 / ATR 50
- ATR compression
- relative volume
- range position
- candle body / ATR
- upper/lower wick / ATR
- close location
- distance to 20-bar range high/low
- breakout flags
- shock/expansion flag

These features are research inputs, not approved trading rules.

## Market Stage V1

The initial Stage classifier is deliberately descriptive and replaceable. It includes:

- TREND_EARLY_UP / DOWN
- TREND_UP / DOWN
- SIDEWAY_EDGE_LOW / HIGH
- SIDEWAY_HIGH_VOLUME
- SIDEWAY_CHOP
- BREAKOUT_UP / DOWN
- COMPRESSION
- SHOCK
- TRANSITION

Stage definitions may be refined later, but any refinement must remain causal: no future bars may influence T0 classification.

## Playability

Playability is not Direction.

It is a research score that summarizes whether a market state remains directionally predictable on later chronological data.

The score uses Validation and Holdout behavior, sample count, and stability. A high Training result alone cannot make a state “playable”.

The score is intentionally displayed separately from HIGH/LOW.

## Data leakage rules

Never:

- use T+1…T+10 data to calculate a T0 feature;
- calculate pivots/structure using bars that were not confirmable at T0;
- randomize Train/Validation/Holdout by default;
- use Holdout to search for a condition and then claim the same Holdout as independent proof;
- let Training 2 automatically change the Live Engine.

## Integrity checks

Training 2 checks:

- every label is exactly +10 minutes;
- feature values are finite when present;
- chronological split boundaries do not allow settlement windows to overlap the next split;
- purge samples are excluded from Train/Validation/Holdout statistics.

## UI layout

Desktop:

- left: Market Stage list
- center: Historical Sample Viewer + research tabs
- right: Inspector / Playability / HIGH-LOW / split statistics

Mobile:

- sections stack vertically
- chart stays central
- tabs scroll horizontally
- controls remain compact

Research tabs:

- Market Map
- Playability
- Feature Explorer
- Combination Lab
- T+10 Outcome
- Data Split
- Best / Avoid

## Definition of success

Training 2 V1 is successful when the user can take a large historical 1-minute dataset, build exact T+10 samples, inspect which market states and feature ranges are easier or harder to predict, validate those findings chronologically, visually inspect real examples, save candidates, and export the results without changing the Live Engine.

The next project phase should only design a new live prediction engine after Training 2 has produced stable evidence about where the actual T+10 edge exists.


## V2 brief-alignment update — 2026-10-04

Training 2 now matches the original handoff brief more closely:

- Playability is no longer calculated from the raw HIGH/LOW majority of a Stage.
- For each Stage, Training 2 searches candidate feature thresholds on TRAIN only.
- The selected Direction and Conditions are then locked and evaluated unchanged on VALIDATION and HOLDOUT.
- Best Conditions therefore means an automatically discovered Train candidate, not merely the Stage with the highest raw HIGH/LOW imbalance.
- Avoid Zones are Stages where the best Train-discovered candidate still fails to produce stable out-of-sample evidence.
- T0 is the actual close time of the Entry bar, so Entry price and Entry timestamp refer to the same event.
- Timeframes currently supported for exact +10-minute settlement are 1m, 5m and 10m.
- The feature snapshot now includes volume acceleration, range width, candle pressure/sequence, HH-HL / LH-LL structure, support/resistance distance, Fibonacci context and causal 5m/15m context when the selected base timeframe permits it.
- Market Stage now includes trend early/healthy/accelerating/mature/extended, pullback, sideway stable/edge/high-volume/chop, compression, breakout attempt/accepted/failed, exhaustion, reversal developing, shock and transition.
- Historical data can be previewed before Dataset construction.
- Data Quality now exposes missing, duplicate, invalid and extended-data coverage.
- The chart has a Feature Overlay for inspecting the exact T0 snapshot.
- Stability is displayed separately from Win Rate.
- Integrity checks verify exact T+10, T0 feature cutoff, finite feature values and non-overlapping chronological split boundaries.

The Live Engine is still not modified automatically by Training 2.
