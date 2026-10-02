# ARIS 3.2 — Configuration & Threshold Registry

Status: BUILDING / audit-fixed baseline  
All values remain under **ARIS 3.2**. Internal revision names are implementation history only.

## Origin policy

Every threshold below has an explicit origin class:

- **structural** — a deterministic engineering/data rule, not learned from win/loss history.
- **design-prior** — an initial heuristic chosen to express the intended market behavior. It MUST be replayed and calibrated before any claim of accuracy.
- **validation-bound** — a value that may only be changed after replay / out-of-sample / forward evidence.

No current 3.2 threshold is represented as an empirically calibrated probability.

## Units

- **ATR** — multiple of current 1-minute ATR.
- **ratio** — unitless 0–1 unless stated otherwise.
- **score** — 0–100 internal quality score; not a win probability.
- **ms** — milliseconds.
- **bars** — one-minute closed candles unless the field explicitly says HTF.
- **flow/book** — normalized feed values supplied by the app.

---

## v32.js — Data / Feature / Stage Brain

| Key | Value | Unit | Scope / meaning | Origin |
|---|---:|---|---|---|
| horizonMs | 600000 | ms | Event result horizon = 10 minutes | structural |
| minBars1m | 40 | bars | Minimum usable closed 1m history | structural |
| atrBars | 14 | bars | ATR calculation window | design-prior |
| featureLookback | 80 | bars | Maximum 1m feature history retained in one snapshot | structural |
| pivotLookback | 70 | bars | Pivot search history | design-prior |
| pivotWing | 2 | bars/side | Confirmed pivot needs two candles on both sides | design-prior |
| pivotEqualAtr | 0.03 | ATR | Treat swing highs/lows inside this distance as approximately equal | design-prior |
| structureBreakAtr | 0.08 | ATR | Buffer beyond protected swing before structure break is recognized | design-prior |
| zoneClusterAtr | 0.28 | ATR | Merge nearby pivot/range levels into one SR zone | design-prior |
| zoneNearAtr | 0.30 | ATR | A zone is “near” enough to support location evidence | design-prior |
| fibMinLegAtr | 0.80 | ATR | Minimum confirmed swing length before Fibonacci is considered valid | design-prior |
| fibZoneAtr | 0.16 | ATR | Fib-to-zone confluence tolerance | design-prior |
| rangeLookback | 18 | bars | Reference range construction window | design-prior |
| rangeGuardBars | 6 | bars | Exclude newest bars from reference range so current break does not rewrite its own base | structural/design-prior |
| rangeMinWidthAtr | 1.60 | ATR | Minimum range width eligible for RANGE quality | design-prior |
| rangeMaxWidthAtr | 8.50 | ATR | Maximum range width eligible for RANGE quality | design-prior |
| rangeEdgeBand | 0.24 | ATR | Touch tolerance around range edges | design-prior |
| rangeEfficiencyGood | 0.22 | ratio | Path efficiency considered range-like | design-prior |
| rangeSlopeGood | 0.15 | ATR/bar slope scale | EMA slope considered range-like | design-prior |
| compressionRecentBars | 4 | bars | Recent contraction window | design-prior |
| compressionPriorBars | 6 | bars | Baseline window before recent contraction | design-prior |
| compressionRangeRatio | 0.72 | ratio | Recent range contraction reference | design-prior |
| compressionBodyRatio | 0.72 | ratio | Recent body contraction reference | design-prior |
| breakoutBufferAtr | 0.06 | ATR | Minimum displacement outside reference range to call an attempt | design-prior |
| breakoutAcceptedAtr | 0.04 | ATR | Previous closed-bar displacement used in acceptance continuity | design-prior |
| breakoutRecaptureAtr | 0.03 | ATR | Distance back inside the range for failed-break recapture | design-prior |
| breakoutCloseMin | 0.58 | candle location ratio | Closed candle must finish toward breakout side | design-prior |
| breakoutExpansionRangeAtr | 0.55 | ATR | Range expansion threshold | design-prior |
| breakoutExpansionBodyAtr | 0.30 | ATR | Body expansion threshold | design-prior |
| trendEffMin | 0.30 | ratio | Starting trend-efficiency reference | design-prior |
| trendSlopeMin | 0.16 | ATR/bar | Starting trend-slope reference | design-prior |
| trendSepMin | 0.18 | ATR | EMA separation reference | design-prior |
| exhaustionExtensionAtr | 1.85 | ATR | Extension starts contributing to exhaustion evidence | design-prior |
| exhaustionBodyDecayRatio | 0.72 | ratio | Body contraction consistent with exhaustion | design-prior |
| transitionEffDrop | 0.18 | ratio | Efficiency loss meaningful for transition/range-forming | design-prior |
| transitionSlopeDrop | 0.12 | ATR/bar delta | Slope flattening meaningful for transition | design-prior |
| transitionProgressRatio | 0.62 | ratio | Recent swing progress below this fraction of prior progress adds transition evidence | design-prior |
| softmaxTemperature | 0.19 | ratio | Controls separation of stage confidence vector | design-prior |
| confidenceFloor | 0.01 | ratio | Minimum pre-renormalization stage confidence floor | structural/design-prior |

### Data-integrity rules

These are hard engineering rules, not market filters:

- explicit `fresh:false` → block signal generation.
- explicitly supplied non-finite live price → block.
- badly malformed OHLC sequences above tolerance → block.
- insufficient valid or closed candles → warmup, not an entry.
- Stage confidence is floored and then renormalized so the vector sums to exactly 1.

### Live vs closed evidence

- Closed candles remain the stable evidence source.
- `currentCandle` / `liveCandle` / `current` may contribute live body, wick, close-location and volume pace.
- Live displacement may create **BREAKOUT_ATTEMPT**.
- A live candle alone does **not** fabricate closed-bar **BREAKOUT_ACCEPTED**.

---

## v32-direction.js — Stage-specific weighting

All profile weights are **design-priors** and each profile sums to 1.00.

### RANGE
edge .30 · rejection .22 · failed escape .18 · mean reversion .12 · flow .08 · HTF .05 · old trend .05

### TREND_ADVANCE
structure .22 · momentum .16 · slope .12 · follow-through .12 · progression .12 · volume .10 · flow .08 · room .05 · HTF .03

### COMPRESSION
pressure .20 · flow .20 · volume skew .15 · structure .10 · HTF .10 · incipient break .25

### BREAKOUT_ATTEMPT
break direction .25 · acceptance .20 · volume .20 · flow .20 · follow-through .10 · room .05

### BREAKOUT_ACCEPTED
break direction .25 · acceptance .25 · volume .18 · flow .18 · follow-through .09 · room .05

### FAILED_BREAKOUT
failed direction .28 · recapture .22 · rejection .18 · flow flip .14 · poor progress .10 · structure .08

### PULLBACK
structure .22 · value/EMA .17 · Fibonacci .14 · reclaim .19 · base quality .13 · renewed momentum .09 · micro .06

### EXHAUSTION
old trend .15 · rejection .23 · progress failure .22 · flow shift .15 · structure damage .15 · extension risk .10

### REVERSAL_DEVELOPING
structure break .23 · rejection .17 · flow flip .13 · old trend exhaustion .13 · location .12 · Fibonacci .12 · HTF .10

### TRANSITION
defense .20 · efficiency loss .20 · trend decay .20 · flow change .15 · mixed structure .15 · HTF .10

Important:
- Stage scores and HIGH/LOW edge outputs are not calibrated win probabilities.
- RANGE keeps HTF as low-weight context rather than a universal veto.
- TREND explicitly includes High/Low/Close progression and Volume participation.
- PULLBACK / REVERSAL use Fibonacci only when a confirmed swing leg exists.
- Room uses clustered support/resistance when available instead of a fixed imaginary distance.
- BREAKOUT_ACCEPTED and FAILED_BREAKOUT compete before the adaptive mixer; the weaker mutually exclusive hypothesis is removed and the stage mixture is renormalized.

---

## v32-triggers.js — Trigger activation and quality

### Stage affinity thresholds

| Key | Value | Meaning | Origin |
|---|---:|---|---|
| rangeStageMin | .28 | Preferred RANGE confidence for a normal range trigger | design-prior |
| rangeEdgeEnter | .28 | Position band near edge considered strong | design-prior |
| rangeEdgeWatch | .36 | Wider range-edge watch band | design-prior |
| rangeRejectionMin | .20 | Rejection evidence considered meaningful | design-prior |
| breakoutAttemptStageMin | .18 | Minimum BREAKOUT_ATTEMPT stage confidence to open trigger family | design-prior |
| breakoutAcceptedStageMin | .20 | Minimum BREAKOUT_ACCEPTED stage confidence | design-prior |
| breakoutMinParticipation | .18 | Minimum normalized participation reference | design-prior |
| breakoutMaxChaseAtr | 1.15 ATR | Very late breakout chase warning | design-prior |
| failedBreakStageMin | .12 | Low stage threshold allowed because recapture itself is event evidence | design-prior |
| failedBreakRecaptureMin | .12 | Minimum meaningful recapture strength | design-prior |
| trendStageMin | .25 | TREND confidence needed before trend trigger exists | design-prior |
| trendFollowMin | .38 | Follow-through reference | design-prior |
| trendMaxExhaustion | .58 | High exhaustion warning for trend continuation | design-prior |
| pullbackStageMin | .18 | PULLBACK stage confidence to open pullback trigger | design-prior |
| pullbackValueMaxAtr | 1.10 ATR | Maximum distance from EMA/value for full value-location quality | design-prior |
| transitionStageMin | .25 | Normal transition confidence threshold | design-prior |
| transitionEdgeMax | .30 | Edge band used by early range-forming defense trigger | design-prior |
| reversalStageMin | .12 | REVERSAL stage confidence needed before reversal trigger exists | design-prior |

### Trigger-specific quality thresholds

These are deliberately different because the score distributions are different market games.

| Family | WATCH | READY | Origin |
|---|---:|---:|---|
| RANGE_REVERSION | 40 | 56 | design-prior |
| BREAKOUT | 46 | 64 | design-prior |
| FAILED_BREAKOUT | 44 | 60 | design-prior |
| TREND | 48 | 64 | design-prior |
| PULLBACK | 46 | 62 | design-prior |
| TRANSITION | 44 | 60 | design-prior |
| REVERSAL | 48 | 64 | design-prior |
| COMPRESSION | 40 | 100 | structural intent: WATCH-only |

These are not validation results. Block 6/7 must measure the distribution by family before changing them.

---

## v32-entry.js — Confirmation and family re-arm

| Key | Value | Unit | Meaning | Origin |
|---|---:|---|---|---|
| horizonMs | 600000 | ms | T+10 settlement | structural |
| confirmTicks | 2 | observations | Minimum consecutive trigger-ready observations | design-prior |
| confirmMs | 250 | ms | Minimum live persistence before entry | design-prior |
| candidateGraceMs | 1800 | ms | Brief weakening tolerance for a live candidate | design-prior |
| maxSignals | 2000 | signals | In-memory history bound | structural |
| rangeMidLow | .38 | range position | Beginning of central rotation re-arm area | design-prior |
| rangeMidHigh | .62 | range position | End of central rotation re-arm area | design-prior |
| trendResetEffMax | .52 | ratio | Low-enough short efficiency for micro-reset | design-prior |
| trendResetMoveAtr | .55 | ATR | Minimum movement away before micro-reset can re-arm trend family | design-prior |
| breakoutClearConfidence | .16 | stage confidence | Breakout stage must fade below this to clear old breakout event | design-prior |
| transitionRearmConfidence | .18 | stage confidence | Transition must fade below this for regime-reset re-arm path | design-prior |

Re-arm is stored **per trigger family**. A changing range/reference window cannot by itself bypass a family that is still disarmed.

Entry Quality uses:
- trigger quality,
- the trigger's own stage model aligned to trigger direction,
- stage confidence,
- global blended edge only when aligned,
- explicit penalties and opposition penalties.

It never uses `abs(directionEdge)` as a reward.

---

## v32-training.js — Training ledger

| Key | Value | Unit | Meaning | Origin |
|---|---:|---|---|---|
| maxDecisions | 12000 | decisions | Stored decision audit history | structural |
| maxSignals | 4000 | signals | Stored signal history | structural |
| settlementToleranceMs | 5000 | ms | Tolerance when matching settlement observation | inherited engineering tolerance; review in replay |
| minCalibrationSamples | 20 | settled signals/cell | Minimum sample before a stage+trigger cell is even shown as a calibration candidate | design-prior; NOT enough alone to approve a change |

Post-entry labels:
- MFE / MAE
- 1m / 2m / 5m adverse reversal labels
- 1m / 2m / 5m signed ATR path value
- first flow-flip time
- structure break after entry
- stage changes after entry
- breakout state changes after entry

Paths are persisted on serialization so pending/review trajectories survive reload.

---

## Calibration rule

A value may move from **design-prior** to **validation-bound** only when:

1. identical-window replay exists,
2. results are split by stage and trigger family,
3. signal frequency and suppressed opportunities are measured,
4. out-of-sample data agrees with the direction of the change,
5. forward-shadow evidence does not contradict it.

No automatic weight/threshold rewrite is enabled in ARIS 3.2.
