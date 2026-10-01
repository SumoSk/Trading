# ARIS 3.2 — Build Status

Updated: 2026-10-02 (Asia/Bangkok)

## Safety / backups

- Frozen baseline branch: `backup/pre-aris-3.2-20261002`
- Baseline main commit: `5439c0838f8b2bdd8f354d85b94938ed0952dde8`
- Working branch: `aris-3.2-build`
- Existing version files remain untouched:
  - `v2.js`
  - `v3.js`
  - `v31.js`
  - `v4.js`

ARIS 3.2 is currently **NOT activated on main and NOT set as default**.

## Completed blocks

### Block 0 — Permanent specification
File: `ARIS-3.2-SPEC.md`  
Commit: `3fda6024e5c40e9e5798eefb930c0e5aba4172f6`

Locked principles:
- standalone rewrite
- stage-adaptive weights
- stage-specific triggers
- Adaptive Brain, not More Armor
- HTF is context/penalty in Range, not universal veto
- no blind probability claims
- causal training data separation

### Block 1 — Feature + Structure + Stage Brain
File: `v32.js`

Initial commit:
`ec3d68a51211b0bf0464589d83797e989e784728`

Refinement commits:
- `246c75c5c65d7589c78f89abf52833d923e31e97` — require genuine base context before calling ordinary trend movement a breakout
- `68402dbf6efe2fe0b07a9c7ac09cba4026d351e5` — strengthen trend-vs-breakout separation and early regime decay
- `a7095afe222fd27f961aa1a9e075ad4492f99ff0` — add 24-bar trend memory and stable breakout reference
- `883c49c219f610e60d0cd0d8caddb0aac007eab9` — strengthen failed-break recapture / prior trend memory
- `c82603f49bad3e4cd124efc785adc2d94993e4ae` — fix prior-trend runtime reference

Current stage families:
- TREND_ADVANCE
- RANGE
- COMPRESSION
- BREAKOUT_ATTEMPT
- BREAKOUT_ACCEPTED
- FAILED_BREAKOUT
- PULLBACK
- EXHAUSTION
- REVERSAL_DEVELOPING
- TRANSITION

Stage output is a confidence vector, not a single forced label.

Synthetic checks after refinement:
- clean trend → TREND_ADVANCE dominant
- rotating range → RANGE dominant
- real range breakout → BREAKOUT_ACCEPTED dominant
- decelerating old trend → TRANSITION becomes dominant instead of being forced into Pullback

### Block 2 — Adaptive Direction Brain
File: `v32-direction.js`  
Commit: `8dd88fa3355e4801452a68e1972b71b52b58fc76`

Each stage owns a different weighting profile.

Examples:
- RANGE emphasizes edge/rejection/failed escape
- TREND emphasizes structure/momentum/follow-through
- BREAKOUT emphasizes acceptance/volume/flow
- FAILED_BREAKOUT emphasizes recapture/rejection/flow shift
- TRANSITION emphasizes trend decay/efficiency loss/defense

The output fields `highEdge`, `lowEdge`, and `signedEdge` are directional evidence scores, **not calibrated win probabilities**.

### Block 3 — Stage-specific Trigger Brain
File: `v32-triggers.js`

Initial commit:
`fc727ad1d8e8322036d5f80192d29e0861d38d75`

Stage-affinity refinement:
`c931d5edf1a09871fa2ed4357cffa2e43371c3c7`

Current trigger families include:
- RANGE_LOWER_REJECTION
- RANGE_UPPER_REJECTION
- BREAKOUT_FOLLOW
- FAILED_BREAKOUT_REVERSAL
- TREND_FOLLOW_THROUGH
- PULLBACK_RECLAIM
- TRANSITION_EDGE_DEFENSE
- TRANSITION_RANGE_FORMING
- REVERSAL_TRANSFER
- COMPRESSION_WATCH

Important:
- Trigger families are now opened by compatible Stage confidence.
- Pullback cannot simply steal entries from Range/Compression.
- Failed breakout is treated as its own event, not merely a weak breakout.
- Breakout without acceptance/volume/flow can remain WATCH_ONLY.

### Block 4 — Entry + Family Re-arm Memory
File: `v32-entry.js`  
Commit: `036a2980b1abd3ec27e3af3c0a6fe0fcaff3e419`

Key change from 3.1:
- no universal one-entry-per-structural-leg rule

Each trigger family owns its re-arm:
- Range / Transition: rotate through middle before same family re-arms
- Trend: pullback/compression/transition or a real micro reset
- Pullback: return to trend advance before next pullback entry
- Breakout: old breakout event must clear
- Failed Breakout: failure event must clear
- Reversal: materially new structure required

Live confirmation:
- 2 ready observations
- >= 250 ms confirmation

Runtime smoke test:
`CONFIRMING → ENTER → WAIT_REARM` passed.

### Block 5 — Training / Review Ledger
File: `v32-training.js`  
Commit: `ecc8ec0105aac3a799304438588abe8e546b72a3`

Training data now separates:
1. decision-time predictors
2. future outcome labels

Aggregates:
- by Stage
- by Trigger
- by Trigger Family
- by Direction
- by Entry Quality
- by Stage Confidence
- fast 0–2 minute reversal
- MFE / MAE when path data is available
- hard-block counts
- decision status counts

Calibration candidates require a minimum sample size and are only suggestions for later replay/out-of-sample review. They are not auto-applied.

Integrated smoke test:
- all 5 JS files parse
- all 5 load together
- Trend synthetic sample created TREND_FOLLOW_THROUGH
- Entry confirmation emitted a T+10 signal
- Training ledger settled the example and aggregated the result

## Current load order for isolated testing

```
v32.js
v32-direction.js
v32-triggers.js
v32-entry.js
v32-training.js
```

## Intentionally NOT done yet

1. 3.2 is not registered in the existing version selector.
2. No existing shared registry or old version file has been changed.
3. 3.2 is not default.
4. No production/live signal path has been switched to 3.2.
5. No claim has been made that 3.2 is more accurate than 3.1.
6. No automatic weight calibration has been enabled.

## Next build block

### Block 6 — Shadow replay / comparison harness

Goals:
- replay 3.1 and 3.2 over identical market windows
- compare signal frequency, not only win rate
- compare time-to-detection of regime changes
- specifically inspect:
  - early Range edge opportunities
  - breakout without participation
  - failed breakout reversals
  - healthy Trend follow-through
  - trend deceleration → range forming
- identify which 3.2 penalties suppress winning vs losing opportunities
- do not switch default until the comparison is reviewed

## Resume instruction

When continuing ARIS 3.2 work:
1. read `ARIS-3.2-SPEC.md`
2. read this file
3. inspect only the ARIS 3.2 files needed for the current block
4. do not modify frozen version files
5. commit each meaningful block separately
