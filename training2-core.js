(() => {
  'use strict';

  const MINUTE = 60_000;
  const HORIZON_MINUTES = 10;
  const HORIZON_MS = HORIZON_MINUTES * MINUTE;
  const MIN_WARMUP = 60;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const pct = (a, b) => b ? a / b : null;
  const round = (v, d = 3) => Number.isFinite(v) ? Number(v.toFixed(d)) : null;

  function sma(values, period) {
    const out = Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      const v = Number(values[i]) || 0;
      sum += v;
      if (i >= period) sum -= Number(values[i - period]) || 0;
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    const out = Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let current = null;
    for (let i = 0; i < values.length; i++) {
      const v = Number(values[i]);
      if (!Number.isFinite(v)) continue;
      current = current == null ? v : (v * k + current * (1 - k));
      out[i] = current;
    }
    return out;
  }

  function atr(bars, period) {
    const tr = Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (!b) continue;
      if (i === 0) tr[i] = Number(b.high) - Number(b.low);
      else {
        const prevClose = Number(bars[i - 1].close);
        tr[i] = Math.max(
          Number(b.high) - Number(b.low),
          Math.abs(Number(b.high) - prevClose),
          Math.abs(Number(b.low) - prevClose)
        );
      }
    }
    return ema(tr, period);
  }

  function rollingExtrema(bars, period) {
    const highs = Array(bars.length).fill(null);
    const lows = Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      const start = Math.max(0, i - period);
      if (i - start < Math.min(period, 5)) continue;
      let hi = -Infinity, lo = Infinity;
      for (let j = start; j < i; j++) {
        hi = Math.max(hi, Number(bars[j].high));
        lo = Math.min(lo, Number(bars[j].low));
      }
      highs[i] = Number.isFinite(hi) ? hi : null;
      lows[i] = Number.isFinite(lo) ? lo : null;
    }
    return { highs, lows };
  }

  function classifyStage(f) {
    if (!f || !Number.isFinite(f.atr14) || f.atr14 <= 0) return 'WARMUP';

    if (f.shock === 1) return 'SHOCK';
    if (f.breakoutUp === 1 && f.relativeVolume >= 1.1) return 'BREAKOUT_UP';
    if (f.breakoutDown === 1 && f.relativeVolume >= 1.1) return 'BREAKOUT_DOWN';
    if (f.atrCompression != null && f.atrCompression < 0.75) return 'COMPRESSION';

    if (f.trendStrength >= 0.35 && f.emaSlope5 > 0.18) {
      if (f.rangePosition < 0.78 && f.momentum3 > 0) return 'TREND_EARLY_UP';
      return 'TREND_UP';
    }
    if (f.trendStrength >= 0.35 && f.emaSlope5 < -0.18) {
      if (f.rangePosition > 0.22 && f.momentum3 < 0) return 'TREND_EARLY_DOWN';
      return 'TREND_DOWN';
    }

    if (f.trendStrength < 0.18) {
      if (f.relativeVolume >= 1.35) return 'SIDEWAY_HIGH_VOLUME';
      if (f.rangePosition <= 0.18) return 'SIDEWAY_EDGE_LOW';
      if (f.rangePosition >= 0.82) return 'SIDEWAY_EDGE_HIGH';
      return 'SIDEWAY_CHOP';
    }

    return 'TRANSITION';
  }

  function stageGroup(stage) {
    if (/^TREND/.test(stage)) return 'TREND';
    if (/^SIDEWAY/.test(stage)) return 'SIDEWAY';
    if (/^BREAKOUT/.test(stage)) return 'BREAKOUT';
    if (stage === 'COMPRESSION') return 'COMPRESSION';
    if (stage === 'SHOCK') return 'SHOCK';
    return 'TRANSITION';
  }

  function buildFeatureArrays(bars) {
    const closes = bars.map(b => Number(b.close));
    const volumes = bars.map(b => Number(b.volume) || 0);
    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const atr14 = atr(bars, 14);
    const atr50 = atr(bars, 50);
    const vol20 = sma(volumes, 20);
    const ext20 = rollingExtrema(bars, 20);
    return { closes, volumes, ema9, ema21, atr14, atr50, vol20, ext20 };
  }

  function featureAt(bars, arr, i) {
    const b = bars[i], prev = bars[i - 1];
    if (!b || !prev || i < MIN_WARMUP) return null;

    const a14 = Number(arr.atr14[i]);
    const a50 = Number(arr.atr50[i]);
    const e9 = Number(arr.ema9[i]);
    const e21 = Number(arr.ema21[i]);
    const prevHigh = Number(arr.ext20.highs[i]);
    const prevLow = Number(arr.ext20.lows[i]);
    const close = Number(b.close);
    const open = Number(b.open);
    const high = Number(b.high);
    const low = Number(b.low);
    const range = Math.max(1e-12, high - low);
    const contextRange = Math.max(1e-12, prevHigh - prevLow);
    const volBase = Number(arr.vol20[i]);

    if (![a14, a50, e9, e21, prevHigh, prevLow, close, open, high, low].every(Number.isFinite) || a14 <= 0) return null;

    const momentum3 = (close - Number(bars[i - 3].close)) / a14;
    const momentum5 = (close - Number(bars[i - 5].close)) / a14;
    const momentum10 = (close - Number(bars[i - 10].close)) / a14;
    const emaSlope5 = (e9 - Number(arr.ema9[i - 5])) / a14;
    const trendStrength = Math.abs(e9 - e21) / a14;
    const rangePosition = clamp((close - prevLow) / contextRange, 0, 1);
    const relativeVolume = volBase > 0 ? (Number(b.volume) || 0) / volBase : 1;
    const body = Math.abs(close - open);
    const upperWick = Math.max(0, high - Math.max(open, close));
    const lowerWick = Math.max(0, Math.min(open, close) - low);
    const closeLocation = clamp((close - low) / range, 0, 1);
    const atrCompression = a50 > 0 ? a14 / a50 : null;
    const breakoutUp = close > prevHigh ? 1 : 0;
    const breakoutDown = close < prevLow ? 1 : 0;
    const shock = body / a14 >= 1.6 && relativeVolume >= 1.5 ? 1 : 0;
    const acceleration = momentum3 - ((Number(bars[i - 3].close) - Number(bars[i - 6].close)) / a14);

    return {
      close,
      atr14: a14,
      atr50: a50,
      ema9: e9,
      ema21: e21,
      emaDistance: (e9 - e21) / a14,
      emaSlope5,
      trendStrength,
      momentum3,
      momentum5,
      momentum10,
      acceleration,
      relativeVolume,
      rangePosition,
      bodyAtr: body / a14,
      upperWickAtr: upperWick / a14,
      lowerWickAtr: lowerWick / a14,
      closeLocation,
      atrCompression,
      breakoutUp,
      breakoutDown,
      distanceToRangeHighAtr: (prevHigh - close) / a14,
      distanceToRangeLowAtr: (close - prevLow) / a14,
      shock
    };
  }

  function assignChronologicalSplits(samples) {
    const rows = samples.slice().sort((a, b) => a.entryTime - b.entryTime);
    const n = rows.length;
    const b1 = Math.floor(n * 0.60);
    const b2 = Math.floor(n * 0.80);
    const purge = HORIZON_MINUTES;

    rows.forEach((s, idx) => {
      const near1 = Math.abs(idx - b1) < purge;
      const near2 = Math.abs(idx - b2) < purge;
      s.split = near1 || near2 ? 'PURGE' : idx < b1 ? 'TRAIN' : idx < b2 ? 'VALIDATION' : 'HOLDOUT';
      s.splitIndex = idx;
    });
    return rows;
  }

  async function buildSamples(bars, options = {}) {
    const sorted = (bars || []).slice().sort((a, b) => Number(a.time) - Number(b.time));
    const arr = buildFeatureArrays(sorted);
    const out = [];
    const analysisStart = num(options.analysisStart);
    const analysisEnd = num(options.analysisEnd);

    for (let i = MIN_WARMUP; i + HORIZON_MINUTES < sorted.length; i++) {
      const b = sorted[i], settle = sorted[i + HORIZON_MINUTES];
      if (!b || !settle) continue;
      if (analysisStart != null && Number(b.time) < analysisStart) continue;
      if (analysisEnd != null && Number(b.time) > analysisEnd) continue;
      if (Number(settle.time) - Number(b.time) !== HORIZON_MS) continue;

      const features = featureAt(sorted, arr, i);
      if (!features) continue;

      const entryPrice = Number(b.close);
      const settlementPrice = Number(settle.close);
      const delta = settlementPrice - entryPrice;
      const outcome = delta > 0 ? 'HIGH' : delta < 0 ? 'LOW' : 'EQUAL';
      const trajectory = [];
      for (let k = 1; k <= HORIZON_MINUTES; k++) {
        const px = Number(sorted[i + k].close);
        trajectory.push({
          minute: k,
          price: px,
          moveAtr: features.atr14 > 0 ? (px - entryPrice) / features.atr14 : null
        });
      }

      const stage = classifyStage(features);
      out.push({
        id: String(b.time),
        barIndex: i,
        entryTime: Number(b.time),
        settlementTime: Number(settle.time),
        entryPrice,
        settlementPrice,
        outcome,
        delta,
        deltaAtr: features.atr14 > 0 ? delta / features.atr14 : null,
        stage,
        stageGroup: stageGroup(stage),
        features,
        outcomeData: { trajectory }
      });

      if (out.length % 500 === 0) {
        options.onProgress?.({ built: out.length, scanned: i, total: sorted.length });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const samples = assignChronologicalSplits(out);
    options.onProgress?.({ built: samples.length, scanned: sorted.length, total: sorted.length, complete: true });
    return { bars: sorted, samples };
  }

  function stats(rows) {
    const a = (rows || []).filter(Boolean);
    let high = 0, low = 0, equal = 0;
    for (const s of a) {
      if (s.outcome === 'HIGH') high++;
      else if (s.outcome === 'LOW') low++;
      else equal++;
    }
    const decided = high + low;
    const highRate = pct(high, decided);
    const lowRate = pct(low, decided);
    const bestSide = decided ? (high >= low ? 'HIGH' : 'LOW') : null;
    const bestRate = decided ? Math.max(highRate, lowRate) : null;
    return { n: a.length, decided, high, low, equal, highRate, lowRate, bestSide, bestRate };
  }

  function bySplit(rows) {
    const all = stats(rows);
    const train = stats(rows.filter(x => x.split === 'TRAIN'));
    const validation = stats(rows.filter(x => x.split === 'VALIDATION'));
    const holdout = stats(rows.filter(x => x.split === 'HOLDOUT'));
    return { all, train, validation, holdout };
  }

  function playability(rows) {
    const s = bySplit(rows);
    const vr = s.validation.bestRate;
    const hr = s.holdout.bestRate;
    const tr = s.train.bestRate;
    if (![vr, hr].every(Number.isFinite) || s.validation.decided < 10 || s.holdout.decided < 10) {
      return { score: null, label: 'ข้อมูลยังไม่พอ', level: 'insufficient', stats: s };
    }

    const oos = vr * 0.4 + hr * 0.6;
    const directionalEdge = clamp((oos - 0.5) * 500, 0, 100);
    const sampleFactor = clamp(Math.sqrt(Math.min(s.validation.decided, s.holdout.decided) / 60), 0.35, 1);
    const stabilityGap = Math.abs(vr - hr) + (Number.isFinite(tr) ? Math.abs(tr - hr) * 0.35 : 0);
    const stabilityFactor = clamp(1 - stabilityGap * 4, 0.35, 1);
    const score = Math.round(clamp(directionalEdge * sampleFactor * stabilityFactor, 0, 100));
    const level = score >= 70 ? 'good' : score >= 45 ? 'watch' : 'hard';
    const label = level === 'good' ? 'น่าเล่น' : level === 'watch' ? 'เลือกจังหวะ' : 'เดายาก / งด';
    return { score, label, level, stats: s, oosRate: oos, stabilityGap };
  }

  function groupByStage(samples) {
    const map = new Map();
    for (const s of samples || []) {
      if (!map.has(s.stage)) map.set(s.stage, []);
      map.get(s.stage).push(s);
    }
    return [...map.entries()].map(([stage, rows]) => ({
      stage,
      group: stageGroup(stage),
      rows,
      summary: bySplit(rows),
      playability: playability(rows)
    })).sort((a, b) => b.rows.length - a.rows.length);
  }

  const FEATURE_META = Object.freeze([
    ['emaDistance', 'EMA 9-21 / ATR'],
    ['emaSlope5', 'EMA slope 5 / ATR'],
    ['trendStrength', 'Trend strength'],
    ['momentum3', 'Momentum 3'],
    ['momentum5', 'Momentum 5'],
    ['momentum10', 'Momentum 10'],
    ['acceleration', 'Acceleration'],
    ['relativeVolume', 'Relative volume'],
    ['rangePosition', 'Range position'],
    ['bodyAtr', 'Body / ATR'],
    ['upperWickAtr', 'Upper wick / ATR'],
    ['lowerWickAtr', 'Lower wick / ATR'],
    ['closeLocation', 'Close location'],
    ['atrCompression', 'ATR14 / ATR50'],
    ['distanceToRangeHighAtr', 'Distance to range high / ATR'],
    ['distanceToRangeLowAtr', 'Distance to range low / ATR']
  ].map(([key, label]) => ({ key, label }));

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  }

  function featureBins(rows, featureKey, bins = 5) {
    const vals = rows
      .map(s => ({ sample: s, value: num(s.features?.[featureKey]) }))
      .filter(x => x.value != null)
      .sort((a, b) => a.value - b.value);
    if (!vals.length) return [];

    const cuts = [];
    for (let i = 0; i <= bins; i++) cuts.push(quantile(vals.map(x => x.value), i / bins));

    const out = [];
    for (let i = 0; i < bins; i++) {
      const lo = cuts[i], hi = cuts[i + 1];
      const members = vals.filter((x, idx) => {
        if (i === bins - 1) return x.value >= lo && x.value <= hi;
        return x.value >= lo && x.value < hi;
      }).map(x => x.sample);
      out.push({ index: i, lo, hi, rows: members, stats: bySplit(members), playability: playability(members) });
    }
    return out;
  }

  function applyConditions(samples, conditions = []) {
    return (samples || []).filter(s => conditions.every(c => {
      if (!c || c.disabled) return true;
      const field = c.field;
      let value;
      if (field === 'stage') value = s.stage;
      else if (field === 'stageGroup') value = s.stageGroup;
      else value = s.features?.[field];

      if (c.op === '=') return String(value) === String(c.value);
      const n = num(value), t = num(c.value);
      if (n == null || t == null) return false;
      if (c.op === '>') return n > t;
      if (c.op === '>=') return n >= t;
      if (c.op === '<') return n < t;
      if (c.op === '<=') return n <= t;
      return false;
    }));
  }

  function trajectorySummary(rows) {
    const decided = (rows || []).filter(s => Array.isArray(s.outcomeData?.trajectory));
    const out = [];
    for (let minute = 1; minute <= HORIZON_MINUTES; minute++) {
      const vals = decided
        .map(s => num(s.outcomeData.trajectory[minute - 1]?.moveAtr))
        .filter(v => v != null);
      if (!vals.length) {
        out.push({ minute, avgMoveAtr: null, medianMoveAtr: null, positiveRate: null, n: 0 });
        continue;
      }
      const sorted = vals.slice().sort((a, b) => a - b);
      out.push({
        minute,
        avgMoveAtr: vals.reduce((a, b) => a + b, 0) / vals.length,
        medianMoveAtr: quantile(sorted, 0.5),
        positiveRate: vals.filter(v => v > 0).length / vals.length,
        n: vals.length
      });
    }
    return out;
  }

  function auditDataset(samples) {
    const issues = [];
    const rows = samples || [];
    let badHorizon = 0, badFinite = 0;
    for (const s of rows) {
      if (s.settlementTime - s.entryTime !== HORIZON_MS) badHorizon++;
      for (const meta of FEATURE_META) {
        const v = s.features?.[meta.key];
        if (v != null && !Number.isFinite(Number(v))) badFinite++;
      }
    }
    if (badHorizon) issues.push({ code: 'BAD_HORIZON', count: badHorizon, text: 'พบ Sample ที่ไม่ใช่ T+10 นาทีจริง' });
    if (badFinite) issues.push({ code: 'BAD_FEATURE', count: badFinite, text: 'พบ Feature ที่ไม่เป็นตัวเลข' });

    const train = rows.filter(x => x.split === 'TRAIN');
    const val = rows.filter(x => x.split === 'VALIDATION');
    const hold = rows.filter(x => x.split === 'HOLDOUT');
    const maxTrainSettle = Math.max(-Infinity, ...train.map(x => x.settlementTime));
    const minValEntry = Math.min(Infinity, ...val.map(x => x.entryTime));
    const maxValSettle = Math.max(-Infinity, ...val.map(x => x.settlementTime));
    const minHoldEntry = Math.min(Infinity, ...hold.map(x => x.entryTime));
    if (train.length && val.length && maxTrainSettle >= minValEntry) issues.push({ code: 'SPLIT_OVERLAP_1', count: 1, text: 'Train settlement ซ้อนกับ Validation entry' });
    if (val.length && hold.length && maxValSettle >= minHoldEntry) issues.push({ code: 'SPLIT_OVERLAP_2', count: 1, text: 'Validation settlement ซ้อนกับ Holdout entry' });

    return { ok: issues.length === 0, issues, checked: rows.length };
  }

  function rankStages(samples) {
    return groupByStage(samples)
      .filter(x => x.playability.score != null)
      .sort((a, b) => (b.playability.score || 0) - (a.playability.score || 0));
  }

  globalThis.Training2Core = {
    schema: 'aris-training2-core-v1',
    horizonMinutes: HORIZON_MINUTES,
    horizonMs: HORIZON_MS,
    minWarmup: MIN_WARMUP,
    featureMeta: FEATURE_META,
    buildSamples,
    stats,
    bySplit,
    playability,
    groupByStage,
    featureBins,
    applyConditions,
    trajectorySummary,
    auditDataset,
    rankStages,
    stageGroup
  };
})();
