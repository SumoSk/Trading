# ARIS 3.3 Elliott — first runnable release

User FINAL LOCK (108 requirements) is the target specification. User subsequently requested a usable version first and will perform acceptance testing. **This release is experimental and is not a claim that all 108 requirements or the full Definition of Done passed.**

## Integrity

- Base commit: `22587d0ec29e0d5aa9042429edd4c2af67c41605`.
- `backup-before-change` points to that commit before edits. Locked backup untouched.
- `v2.js`, `v3.js`, `v31.js` unchanged.
- `v33-base.js` is the exact 3.1 execution copy with version/display/export identity substitutions only. Elliott never changes entry gates, thresholds, signals or Execution Fib.
- Default engine remains 3.1; select **ARIS V3.3 · Elliott Wave** in the existing version selector.

## Runnable

- Isolated 3.3 config/engine and historical training loader.
- Separate bounded candle history, closed pivots, provisional endpoints, three degrees using duration/child pivots/magnitude/significance, contained parent/child links.
- Multiple motive/corrective candidates; impulse hard rules; candidate-level diagonal geometry/position; zigzag/flat external rules; contracting triangle requires parent 4/B/X.
- Internal 5/3 subdivision validation and bounded recursion. Unresolved internals remain candidates, never presented as fully validated patterns. Extended-third/truncated-fifth annotations.
- Heuristic score, pruning, preferred/alternate and ambiguity/complex/insufficient states. No percentage/probability label.
- Candidate-anchored Wave Fib; channel/zone/swing/HTF confluence when available; primary/extended target ranges and duration ranges.
- Conditional boxes: trigger, invalidation, hit, expired and extended lifecycle; only unambiguous working counts activate a box.
- Independent Elliott overlay switch, degree selection, wave paths/labels and forming highlight, invalidation line, conditional rectangle and soft path.
- Compact current/next summary, expandable details, Elliott JSON download, signal-time snapshot and separate evaluation output.
- Symbol/timeframe keys, 5s persistence cadence via existing journal, state reconstruction, no in-place rewrite of saved audit records.

## Known limits / acceptance work remains

- Heuristic degree selection and parent links need real-chart validation. Promotion/reclassification is basic; not an exhaustive recursive Elliott grammar.
- Diagonals are explicitly candidates; leading/ending variants are not fully classified. Triangle support is contracting + known position, not every triangle variant.
- Extended subwave handling is bounded and deliberately conservative. Complex/combination corrections can remain unresolved, rather than falsely validating W-X-Y.
- Projection can have only one source when independent confluence is absent (shown in details). Time ranges are experimental, not calibrated.
- Prediction results use observed prices; unobserved intra-bar ordering is not inferred. Evaluation is a bounded dataset summary, not a completed walk-forward research study. Current boxes are emitted for Working degree; degree breakdown is available but other degree prediction cohorts need expansion.
- History is bounded at 2,400 candles, 320 pivots per degree, 300 boxes/context, 1,200 audit records/context. Evicted audit count is disclosed. Export for long-term research; not unlimited archival storage.
- Browser visual/mobile acceptance and live-feed accuracy remain for user testing. Do not describe this as fully acceptance-tested.

## Verification

`node tests/v33-smoke.cjs`

Checks parse, impulse both directions, W2 origin, W4 overlap, diagonal overlap, extension/truncation outline, zigzag/flat, triangle position, box lifecycle, reload audit, observer integration. A deterministic 400-bar stream produced 15 signals: 3.1 and 3.3 matched status/direction/entry price and Execution Fib at every step.

Existing `tests/v2-regression.cjs` has an unrelated legacy version-mapping assertion (`6.5.0` expected but app maps to `6.6.0`). It is not reported as a passing full suite.
