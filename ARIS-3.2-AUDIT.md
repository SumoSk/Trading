# ARIS 3.2 — Audit Fix Report

Date: 2026-10-02  
Branch: `aris-3.2-build`  
Backup before audit: `backup/aris-3.2-pre-audit-fix-20261002`

## Scope

This audit reviewed ARIS 3.2 against:
- the permanent design spec,
- the stage-adaptive behavior discussed during design,
- runtime safety,
- signal duplication/re-arm logic,
- training causality,
- explainability and future calibration needs.

No legacy engine file was modified during this audit.

## Critical findings and fixes

### 1. Family re-arm could be bypassed
Finding:
A continuing TREND could issue again after the reference window shifted even though no pullback/reset had occurred.

Fix:
- re-arm state is now tracked per trigger family,
- a family that is disarmed cannot re-enter merely because its reference signature changed,
- each family retains its own last-issued context and reset reason.

Verified:
`CONFIRMING → ENTER → WAIT_REARM` on a continuing trend with no reset.

### 2. Entry Quality rewarded the magnitude of an opposing edge
Finding:
`abs(signedEdge)` gave the same reward to a HIGH trigger whether the adaptive direction edge was +0.60 or -0.60.

Fix:
- Entry Quality now uses direction-aligned stage edge,
- aligned global edge is a smaller secondary factor,
- opposing stage/global evidence creates a penalty.

Verified:
- HIGH trigger + aligned +0.60 example = 66
- HIGH trigger + opposed -0.60 example = 34

### 3. Explicit stale feed could still emit
Finding:
`fresh:false` could still fall back to the last closed bar and eventually ENTER.

Fix:
Explicit stale input is now a hard data block.

Verified:
`fresh:false → BLOCKED_DATA` and no signal is created.

### 4. Stage confidence could exceed 100%
Finding:
The confidence floor was applied after softmax without a second normalization.

Fix:
- softmax,
- floor,
- renormalize.

Verified:
Stage confidence vector sums to 1.000000 in regression cases.

### 5. Market logic was too dependent on closed candles
Finding:
Candle shape and volume context were mostly closed-bar evidence, which could delay a 10-minute Event system.

Fix:
- optional live candle body/range/wick/close-location,
- optional live volume pace,
- live breakout attempt,
- live rejection / follow-through blending.

Safety:
A live breakout attempt does NOT create closed-bar breakout acceptance by itself.

### 6. Fibonacci was missing despite being in the spec
Fix:
A new standalone 3.2 Fibonacci context was written:
- confirmed swing leg only,
- minimum leg length,
- 23.6 / 38.2 / 50 / 61.8 / 78.6,
- 127.2 / 161.8 extensions,
- healthy/deep/over-retraced labels,
- SR/Fib confluence.

Use:
- low importance in normal trend/range,
- meaningful in Pullback and Reversal models.

### 7. Support / Resistance and real room were missing
Fix:
A new zone brain clusters:
- confirmed swing pivots,
- range edges,
- touch count/strength,
- nearest support/resistance,
- room up/down in ATR.

Trend/Breakout/Reversal location logic can now use actual nearby obstacles instead of an abstract fallback alone.

### 8. Trend follow-through did not explicitly measure candle progression and volume
Fix:
Trend now includes:
- Higher High rate,
- Higher Low rate,
- Higher Close rate,
- Lower High/Low/Close mirror rates,
- progression score,
- closed volume participation,
- live volume pace when available,
- live/closed follow-through blend.

This directly represents the design requirement that a healthy trend may continue when successive candles keep advancing with participation.

### 9. All trigger families shared one READY threshold
Finding:
A score of 62 meant the same thing for Range, Breakout, Trend, Reversal, etc., despite different score distributions.

Fix:
Trigger-family-specific WATCH/READY design priors were introduced.

These remain heuristics until replay/calibration.

### 10. Primary trigger could contradict the dominant market event
Finding:
A dominant breakout with weak participation could show an unrelated reversal WATCH as primary.

Fix:
Primary trigger selection now includes stage affinity.
A dominant breakout keeps BREAKOUT_FOLLOW as the main watched event unless a stronger event-specific failure is confirmed.

### 11. Training labels were incomplete
Added post-entry labels:
- MFE / MAE,
- 1m / 2m / 5m adverse reversal,
- signed ATR at 1m / 2m / 5m,
- first flow-flip time,
- structure break after entry,
- stage changes,
- breakout state changes.

### 12. Training path was not persisted
Fix:
Price/state paths are now included in serialized training state so pending and reviewed trajectories can survive save/reload.

### 13. Entry snapshots did not preserve enough causal detail
Added at entry:
- active stage models,
- component contributions and weights,
- trigger-stage model,
- progression metrics,
- live evidence,
- Fibonacci context,
- support/resistance room,
- data-quality/source mode.

### 14. Configuration intent was implicit
Fix:
`ARIS-3.2-CONFIG.md` documents units, scope and origin class for thresholds and profile weights.

Design-prior values remain clearly separated from validated values.

### 15. No permanent regression harness
Fix:
`v32-regression-tests.js` was added.

Current permanent regression suite covers:
- stage recognition for trend/range/breakout/failed-breakout/transition,
- confidence normalization,
- profile weight normalization,
- breakout without participation,
- live breakout attempt without fake acceptance,
- trend-to-range-forming detection,
- direction-aligned Entry Quality,
- family re-arm,
- stale-data hard block,
- training labels/path persistence/component capture.

Latest run:
**13 passed / 0 failed**

## Architecture check against design discussion

### RANGE
Implemented:
- range edge matters more than HTF,
- HTF remains a penalty/context, not universal veto,
- failed escape/rejection/return-inside behavior,
- accepted breakout can invalidate a range-reversion idea.

### BREAKOUT
Implemented:
- displacement is not enough,
- acceptance is separate,
- volume + flow + follow-through matter,
- low participation remains WATCH,
- failed breakout is a separate model.

### TREND
Implemented:
- structure persistence,
- momentum,
- EMA slope,
- candle progression,
- volume,
- flow,
- real room,
- exhaustion penalty rather than extension-only veto.

### TREND → RANGE FORMING
Implemented:
- long-trend memory,
- momentum decay,
- slope flattening,
- progress decay,
- repeated defense/rejection,
- early TRANSITION confidence and `rangeForming`.

### PULLBACK
Implemented:
- structure intact,
- value / EMA,
- Fibonacci,
- base quality,
- reclaim,
- renewed momentum / micro evidence.

### REVERSAL
Implemented:
- protected structure break,
- rejection,
- flow transfer,
- exhaustion,
- SR location,
- Fibonacci,
- HTF context.

## Remaining uncertainty

The implementation is now internally coherent enough to proceed to shadow replay, but the following remain **unvalidated design priors**:
- all stage scoring coefficients,
- all trigger WATCH/READY thresholds,
- ATR tolerances,
- live-vs-closed blending ratios,
- Fibonacci importance,
- SR clustering tolerance,
- re-arm distances and confidence levels.

They must not be described as proven accuracy improvements until replay, out-of-sample and forward-shadow evidence exist.

## Safety state

- Main branch untouched.
- Legacy engine files untouched.
- Pre-3.2 baseline backup exists.
- Pre-audit 3.2 backup exists.
- ARIS 3.2 remains on its isolated build branch.
- ARIS 3.2 is not default and is not wired to production/live execution.
