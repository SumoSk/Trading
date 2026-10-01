# ARIS 3.2 — Stage-Adaptive Event Engine

Status: BUILDING  
Version target: `ARIS-3.2.0`  
Branch: `aris-3.2-build`  
Design rule: **Adaptive Brain, not More Armor**

## 1. Non-negotiable rules

1. ARIS 3.2 is a new standalone decision engine. It must not call decision functions from v2.js, v3.js, v31.js, or v4.js.
2. Existing engine files are frozen. ARIS 3.2 may study ideas from them, but all 3.2 market-reading, stage classification, scoring, triggers, memory, and explanations are written new.
3. No hidden fallback to an older engine. If 3.2 has insufficient evidence it must say so explicitly.
4. No new hard gate may be added merely because a loss occurred. A hard block requires a structural/data-invalid reason or evidence from replay/validation.
5. Do not call a model score a calibrated win probability. Until validated, outputs are `stage confidence`, `direction edge score`, and `entry quality`.
6. Entry-time information is predictor data. Anything learned after entry is outcome/label data only.
7. A stage change changes the way evidence is interpreted. The same Trend/Momentum/Volume/Fibonacci weights must not be reused blindly across every market state.
8. Every numeric threshold must have a documented meaning, unit, scope, and origin: heuristic, replay-calibrated, or forward-calibrated.
9. 3.2 must be explainable from raw market inputs → features → stage → adaptive profile → trigger → entry decision.
10. Event settlement remains T+10 minutes initially. Horizon research is separate and must not contaminate the first 3.2 build.

## 2. Main pipeline

```
Market Data
  ↓
Feature Brain
  ↓
Structure Brain
  ↓
Stage Brain
  ↓
Stage Confidence Vector
  ↓
Adaptive Weight Mixer
  ↓
Stage-specific Direction Brain
  ↓
Stage-specific Trigger Brain
  ↓
Entry Quality / Risk Penalties
  ↓
Signal Decision
  ↓
Explanation + Training Snapshot
```

ARIS 3.2 must determine **what game the market is playing before deciding how to score direction**.

## 3. Core market stages

### TREND_ADVANCE
Price is progressing directionally with structural continuity.

Important:
- HH/HL or LH/LL persistence
- directional path efficiency
- EMA separation and slope
- momentum persistence
- follow-through from consecutive candles
- volume/flow participation
- room before an opposing zone

Less important:
- mean-reversion logic
- isolated Fibonacci proximity without a pullback context

Key question:
> Is the trend still efficiently advancing, or has it begun to decay?

### RANGE
Price is rotating between established edges and directional efficiency is low.

Important:
- position inside the range
- repeated defense at an edge
- rejection / failed escape
- return-to-mean behavior
- range durability
- wick behavior
- absence of accepted breakout

HTF handling:
- Higher timeframe trend is context, not the boss.
- A clean lower-edge rejection can produce a HIGH edge even while a larger timeframe points down.
- HTF becomes a strong warning only when price is actually accepting a break through the range edge.

Key question:
> Is the edge holding strongly enough for mean reversion, or is the range breaking?

### COMPRESSION
Price is contracting and storing energy but has not selected a direction.

Important:
- contraction of candle range
- body contraction
- narrow range width
- low directional efficiency
- pressure skew
- volume/flow buildup or imbalance

Rule:
- Merely being near an edge or “looking ready to break” is not enough.
- Compression itself should usually lower entry aggression until displacement appears.

Key question:
> Is energy building, and which side is beginning to gain control?

### BREAKOUT_ATTEMPT
Price has displaced outside a reference range but acceptance is not yet established.

Important:
- displacement beyond range
- close location
- body/range expansion
- volume participation
- short flow
- follow-through
- distance already chased

Key question:
> Is this a real escape or only a probe outside the range?

### BREAKOUT_ACCEPTED
The new price area is being accepted.

Important:
- closes remain outside
- follow-through candles
- volume and flow do not disappear
- retest holds
- no fast recapture into the old range

Key question:
> Is the new area holding well enough to follow?

### FAILED_BREAKOUT
A breakout attempt fails and price is recaptured into the prior range.

Important:
- return inside the range
- rejection wick / failed expansion
- volume fails to produce progress
- flow stalls or flips
- opposite pressure increases

Rule:
- Failed breakout is not “weak breakout”.
- It is its own directional model, usually assigning edge toward the opposite side / range mean.

Key question:
> Has the market rejected the breakout strongly enough to trade the failure?

### PULLBACK
A directional structure remains intact while price retraces toward a base/value area.

Important:
- protected swing remains intact
- retracement depth
- EMA/value location
- Fibonacci only in the context of a confirmed leg
- base formation
- reclaim quality
- follow-through after reclaim

Key question:
> Is this a healthy reset in the existing trend or the beginning of structural failure?

### EXHAUSTION
Price is extended but no longer progresses efficiently.

Important:
- extension from value/base
- body decay
- shrinking new-high/new-low progress
- rising opposing wick
- high volume with poor price progress
- absorption
- momentum deceleration

Rule:
- Exhaustion is not an automatic reversal.
- It primarily reduces continuation edge until a new structure forms.

Key question:
> Is the current directional move running out of effective progress?

### REVERSAL_DEVELOPING
Old structure is breaking and the opposite side is beginning to gain acceptance.

Important:
- protected swing break
- rejection / failed expansion
- opposite-direction displacement
- flow flip
- new-side acceptance
- first higher low / lower high after break when available

Key question:
> Has control actually transferred, or is this only a temporary counter-move?

### TRANSITION
The prior regime is losing its defining characteristics, but the next regime is not yet mature.

Important:
- efficiency collapse
- EMA slope flattening
- momentum decay
- smaller incremental new highs/lows
- repeated defense at the same price
- increasing opposing wick
- mixed swing structure

Special objective:
Detect **trend → range forming** early. Example: price drifts down gradually, each new low gains less distance, repeated defense appears, downside efficiency falls, and sellers no longer produce progress. 3.2 should lower TREND confidence before a textbook sideway box is obvious.

## 4. Stage confidence, not single labels

3.2 must emit a confidence vector, for example:

```
RANGE              0.62
TRANSITION         0.25
TREND_ADVANCE      0.08
COMPRESSION        0.05
```

The system should avoid abrupt binary switching where possible.

### Blending rule

The Direction Brain may blend the top compatible stage profiles:

`final directional evidence = Σ(stage confidence × stage-specific evidence)`

Incompatible hypotheses such as BREAKOUT_ACCEPTED and FAILED_BREAKOUT should compete rather than be averaged blindly.

## 5. Direction models by stage

The numbers below are **design priors only**. They are not final thresholds and must be calibrated later.

### RANGE profile
Primary evidence:
- range edge location: 30
- rejection / failed escape: 22
- return-to-mean pressure: 18
- range durability / repeated defense: 12
- micro flow: 8
- HTF context: 5
- old trend context: 5

Expected behavior:
- Lower edge + valid defense can produce HIGH edge without requiring large timeframe alignment.
- Upper edge + valid defense can produce LOW edge.
- Mid-range entries should receive weak quality even if direction score exists.

### TREND profile
Primary evidence:
- structural persistence: 25
- momentum persistence: 20
- trend / EMA slope: 15
- candle follow-through: 15
- flow participation: 12
- room: 8
- HTF context: 5

Expected behavior:
- Healthy extension is allowed when follow-through remains efficient.
- Extension alone must not kill a good trend.
- Exhaustion evidence should dynamically reduce continuation weight.

### BREAKOUT profile
Primary evidence:
- price acceptance: 25
- volume participation: 20
- flow participation: 20
- follow-through: 15
- base/structure quality: 10
- room / chase quality: 10

Expected behavior:
- A breakout without volume/flow/follow-through should rapidly lose continuation edge.
- Failed acceptance should transfer evidence toward FAILED_BREAKOUT.

### FAILED BREAKOUT profile
Primary evidence:
- recapture into prior range: 28
- rejection / failed expansion: 22
- flow stall/flip: 18
- poor progress despite volume: 12
- distance from range mean: 10
- opposing structure: 10

### PULLBACK profile
Primary evidence:
- original structure intact: 25
- value/Fib/EMA location: 20
- base quality: 18
- reclaim: 20
- renewed follow-through: 10
- micro confirmation: 7

### REVERSAL profile
Primary evidence:
- structure break: 25
- rejection / failed expansion: 20
- opposite flow: 15
- exhaustion of old trend: 15
- location/Fibonacci context: 15
- HTF context: 10

### COMPRESSION profile
Primary evidence:
- contraction quality: 25
- edge pressure imbalance: 20
- flow skew: 20
- volume buildup: 15
- structural bias: 10
- HTF context: 10

Note: Compression should often produce WATCH rather than ENTER.

### TRANSITION profile
Primary evidence:
- trend deceleration: 25
- loss of efficiency: 20
- repeated defense: 20
- wick shift / rejection: 15
- structure deterioration: 10
- flow change: 10

## 6. Stage-specific triggers

### RANGE edge HIGH
Potential trigger ingredients:
- price at lower range edge
- failed break below or clear lower rejection
- price re-enters/holds inside edge
- sellers fail to produce further progress
- no accepted downside breakout

Large timeframe downtrend is a penalty/context variable, not an automatic veto.

### RANGE edge LOW
Mirror of lower-edge logic.

### BREAKOUT follow
Potential trigger ingredients:
- displacement outside range
- accepted close outside
- volume participation
- flow follows
- next candle or live sequence maintains new territory
- chase distance still reasonable

### FAILED BREAKOUT reversal
Potential trigger ingredients:
- price briefly leaves range
- follow-through absent
- volume does not create progress or flow flips
- price is recaptured into range
- rejection confirms failure

### TREND follow-through
Potential trigger ingredients:
- structure intact
- progressive highs/lows continue
- candle closes remain directionally favorable
- momentum does not collapse
- volume/flow participation is adequate
- no clear exhaustion

### TREND → RANGE FORMING
Not an immediate entry by itself. It changes the model:
- reduce trend-follow weights
- raise range/transition weights
- start watching early range edges
- prevent “follow trend because trend used to be strong”

### PULLBACK reclaim
Potential trigger ingredients:
- trend structure intact
- retracement reaches value/Fib/EMA area
- selling/buying counterpressure decays
- base forms
- reclaim appears

### REVERSAL
Potential trigger ingredients:
- protected swing breaks
- old side fails to reclaim
- opposite rejection/displacement appears
- flow supports transfer of control

## 7. Penalties vs hard blocks

Default philosophy:
- Most market evidence changes a score.
- Few things should completely veto entry.

Reasonable hard blocks:
- invalid/stale market data
- no usable price/ATR
- contradictory state caused by missing inputs
- accepted breakout directly against a proposed range-reversion entry
- duplicate signal when the exact trigger event is still active and no re-arm has occurred

Examples that should normally be penalties, not universal hard blocks:
- HTF disagreement
- extension
- one opposing candle
- moderate low volume
- a Fibonacci level
- a single weak flow window

## 8. Memory and re-arm design

3.2 memory is independent.

Store:
- current dominant stage and confidence history
- active reference range
- breakout attempt state
- failed breakout state
- trend leg identity
- pullback/base state
- last trigger fingerprint
- re-arm reason

Do not use “one entry per leg” as a universal rule.
Instead each trigger type owns its re-arm rule.

Examples:
- Range edge re-arms after price rotates sufficiently away and returns.
- Breakout follow re-arms after a new base/retest or a materially new displacement.
- Trend follow may re-arm after a new micro base or pullback, not simply because time passed.

## 9. Explanation contract

Every decision snapshot should be able to explain:

1. What stage(s) are currently likely?
2. Why?
3. Which stage-specific brain is active?
4. What direction has edge and why?
5. Which trigger is being watched?
6. What evidence is missing?
7. What evidence would invalidate the idea?
8. Which factors are only penalties, not blockers?

Example:

```
Stage:
RANGE 72% · TRANSITION 20% · TREND 8%

Bias:
HIGH edge 68/100

Why:
- price at lower 12-bar range edge
- two failed downside pushes
- lower wick defense increasing
- downside efficiency falling
- 5m remains down, but treated as a 6-point penalty because the range edge is still holding

Trigger:
RANGE_LOWER_REJECTION

Need:
- hold back inside range for 2 live confirmations

Invalidation:
- downside breakout accepted with expanding volume + flow
```

## 10. Training data

Record at decision time:
- raw feature snapshot
- stage scores + normalized confidence
- adaptive profile weights actually used
- stage-specific direction contributions
- trigger components
- penalties
- hard blocks
- entry quality
- chosen direction
- reference price
- horizon

Record after entry as labels:
- T+10 result
- MFE / MAE where available
- first 1m / 2m / 5m reversal
- stage changes after entry
- breakout acceptance/failure after entry
- structure break after entry

Never feed post-entry labels back into the original decision snapshot.

## 11. Build blocks

- Block 0 — immutable backup + this specification
- Block 1 — standalone Feature Brain + Structure Brain + Stage Brain
- Block 2 — Adaptive Weight Mixer + stage-specific Direction Brain
- Block 3 — Trigger Brain (Range, Compression, Breakout, Failed Breakout, Trend, Pullback, Transition, Reversal)
- Block 4 — Entry Quality + penalties/hard-block review + trigger re-arm memory
- Block 5 — explanation/data snapshot + training/replay adapter
- Block 6 — shadow comparison against 3.1; no default switch yet
- Block 7 — calibration from replay/forward data
- Block 8 — only after validation: expose 3.2 as selectable/default by explicit decision

## 12. Validation requirements

Before claiming 3.2 is better:
- replay identical historical windows for 3.1 and 3.2
- measure signal frequency, not only win rate
- separate results by stage and trigger family
- count opportunities suppressed by each penalty/block
- check whether a filter removes more winning opportunities than losses
- validate on unseen periods
- forward shadow test live market data

Primary metrics:
- T+10 win rate by trigger family
- signal frequency
- expected payout-adjusted value
- false-negative opportunity rate where measurable
- stage-classification stability
- time from meaningful market change to stage detection

## 13. Current design decisions locked

- Stage must affect both weights and triggers.
- RANGE logic may largely ignore HTF direction when a valid range is intact, but HTF remains a risk penalty.
- Breakout without participation/acceptance should not inherit bullish/bearish certainty merely from displacement.
- Trend follow-through is allowed when structure, progress, and participation stay healthy; extension alone is not a veto.
- Trend deceleration should lower trend confidence early and raise TRANSITION/RANGE_FORMING before a textbook range is obvious.
- No additional armor for its own sake.
