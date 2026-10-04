(() => {
  'use strict';

  const MINUTE = 60_000;
  const HORIZON_MS = 10 * MINUTE;
  const MIN_WARMUP = 80;
  const SUPPORTED_INTERVAL_MS = Object.freeze({
    '1m': MINUTE,
    '5m': 5 * MINUTE,
    '10m': 10 * MINUTE
  });

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const pct = (a, b) => b ? a / b : null;
  const mean = arr => {
    const a = (arr || []).map(num).filter(v => v != null);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const median = arr => {
    const a = (arr || []).map(num).filter(v => v != null).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  function intervalMs(interval = '1m') {
    return SUPPORTED_INTERVAL_MS[interval] || null;
  }

  function barCloseTime(bar, barMs) {
    const t = num(bar?.closeTime);
    return t != null ? t : Number(bar?.time) + barMs - 1;
  }

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
      current = current == null ? v : v * k + current * (1 - k);
      out[i] = current;
    }
    return out;
  }

  function atr(bars, period) {
    const tr = Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (!b) continue;
      if (!i) tr[i] = Number(b.high) - Number(b.low);
      else {
        const pc = Number(bars[i - 1].close);
        tr[i] = Math.max(
          Number(b.high) - Number(b.low),
          Math.abs(Number(b.high) - pc),
          Math.abs(Number(b.low) - pc)
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

  function rollingMean(values, period) {
    return sma(values.map(v => Number(v) || 0), period);
  }

  function aggregateBars(bars, bucketMs, baseMs) {
    const out = [];
    let cur = null;
    const emit = () => {
      if (!cur) return;
      const expected = Math.max(1, Math.round(bucketMs / baseMs));
      if (cur.count === expected) {
        out.push({
          time: cur.time,
          closeTime: cur.time + bucketMs - 1,
          open: cur.open,
          high: cur.high,
          low: cur.low,
          close: cur.close,
          volume: cur.volume
        });
      }
      cur = null;
    };
    for (const b of bars) {
      const t = Number(b.time);
      const bucket = Math.floor(t / bucketMs) * bucketMs;
      if (!cur || cur.time !== bucket) {
        emit();
        cur = {
          time: bucket, count: 0, open: Number(b.open), high: Number(b.high),
          low: Number(b.low), close: Number(b.close), volume: 0
        };
      }
      cur.count++;
      cur.high = Math.max(cur.high, Number(b.high));
      cur.low = Math.min(cur.low, Number(b.low));
      cur.close = Number(b.close);
      cur.volume += Number(b.volume) || 0;
    }
    emit();
    return out;
  }

  function prepareHtf(series, bucketMs) {
    const closes = series.map(x => Number(x.close));
    const e5 = ema(closes, 5);
    const e12 = ema(closes, 12);
    return { series, e5, e12, bucketMs };
  }

  function latestClosedHtf(ctx, cutoffTime) {
    if (!ctx?.series?.length) return null;
    let lo = 0, hi = ctx.series.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Number(ctx.series[mid].closeTime) <= cutoffTime) {
        found = mid; lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 4) return null;
    const close = Number(ctx.series[found].close);
    const prev = Number(ctx.series[found - 3].close);
    const e5 = Number(ctx.e5[found]), e12 = Number(ctx.e12[found]);
    if (![close, prev, e5, e12].every(Number.isFinite)) return null;
    const span = Math.max(1e-12, Math.abs(close - prev));
    const dir = e5 > e12 ? 1 : e5 < e12 ? -1 : 0;
    return {
      direction: dir,
      momentum: (close - prev) / span,
      emaGapPct: close ? (e5 - e12) / close : 0,
      close,
      closeTime: Number(ctx.series[found].closeTime)
    };
  }

  function recentStructure(bars, i) {
    if (i < 24) return { state: 'UNKNOWN', up: 0, down: 0, higherHigh: 0, higherLow: 0, lowerHigh: 0, lowerLow: 0 };
    const extrema = (a, b) => {
      let hi = -Infinity, lo = Infinity;
      for (let j = a; j <= b; j++) {
        hi = Math.max(hi, Number(bars[j].high));
        lo = Math.min(lo, Number(bars[j].low));
      }
      return { hi, lo };
    };
    const old = extrema(i - 20, i - 11);
    const recent = extrema(i - 10, i);
    const hh = recent.hi > old.hi ? 1 : 0;
    const hl = recent.lo > old.lo ? 1 : 0;
    const lh = recent.hi < old.hi ? 1 : 0;
    const ll = recent.lo < old.lo ? 1 : 0;
    const up = hh && hl ? 1 : 0;
    const down = lh && ll ? 1 : 0;
    return {
      state: up ? 'HH_HL' : down ? 'LH_LL' : hh && ll ? 'EXPANDING' : 'MIXED',
      up, down, higherHigh: hh, higherLow: hl, lowerHigh: lh, lowerLow: ll
    };
  }

  function candleSequence(bars, i) {
    let bull = 0, bear = 0, bullRun = 0, bearRun = 0;
    for (let j = Math.max(0, i - 4); j <= i; j++) {
      const d = Number(bars[j].close) - Number(bars[j].open);
      if (d > 0) bull++;
      if (d < 0) bear++;
    }
    for (let j = i; j >= Math.max(0, i - 6); j--) {
      const d = Number(bars[j].close) - Number(bars[j].open);
      if (d > 0 && bearRun === 0) bullRun++; else if (d < 0 && bullRun === 0) bearRun++; else break;
    }
    return { bull5: bull, bear5: bear, bullRun, bearRun, pressure5: (bull - bear) / 5 };
  }

  function fibContext(bars, i, atrValue) {
    const start = Math.max(0, i - 60);
    let hi = -Infinity, lo = Infinity, hiIdx = -1, loIdx = -1;
    for (let j = start; j <= i; j++) {
      const h = Number(bars[j].high), l = Number(bars[j].low);
      if (h >= hi) { hi = h; hiIdx = j; }
      if (l <= lo) { lo = l; loIdx = j; }
    }
    const range = hi - lo;
    if (!(range > 0) || !(atrValue > 0)) return { position: null, nearest: null, distanceAtr: null, swingDirection: 0 };
    const close = Number(bars[i].close);
    const upSwing = loIdx < hiIdx;
    const position = clamp((close - lo) / range, 0, 1);
    const ratios = [0.236,0.382,0.5,0.618,0.786];
    let nearest = ratios[0], dist = Infinity;
    for (const r of ratios) {
      const level = upSwing ? hi - range * r : lo + range * r;
      const d = Math.abs(close - level);
      if (d < dist) { dist = d; nearest = r; }
    }
    return { position, nearest, distanceAtr: dist / atrValue, swingDirection: upSwing ? 1 : -1 };
  }

  function buildFeatureArrays(bars, baseMs) {
    const closes = bars.map(b => Number(b.close));
    const volumes = bars.map(b => Number(b.volume) || 0);
    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const atr14 = atr(bars, 14);
    const atr50 = atr(bars, 50);
    const vol5 = rollingMean(volumes, 5);
    const vol20 = rollingMean(volumes, 20);
    const ext20 = rollingExtrema(bars, 20);
    const ext50 = rollingExtrema(bars, 50);
    const htf5 = baseMs <= 5 * MINUTE && (5 * MINUTE) % baseMs === 0
      ? prepareHtf(aggregateBars(bars, 5 * MINUTE, baseMs), 5 * MINUTE) : null;
    const htf15 = baseMs <= 15 * MINUTE && (15 * MINUTE) % baseMs === 0
      ? prepareHtf(aggregateBars(bars, 15 * MINUTE, baseMs), 15 * MINUTE) : null;
    return { closes, volumes, ema9, ema21, atr14, atr50, vol5, vol20, ext20, ext50, htf5, htf15 };
  }

  function featureAt(bars, arr, i, baseMs) {
    const b = bars[i];
    if (!b || i < MIN_WARMUP) return null;

    const a14 = Number(arr.atr14[i]), a50 = Number(arr.atr50[i]);
    const e9 = Number(arr.ema9[i]), e21 = Number(arr.ema21[i]);
    const high20 = Number(arr.ext20.highs[i]), low20 = Number(arr.ext20.lows[i]);
    const high50 = Number(arr.ext50.highs[i]), low50 = Number(arr.ext50.lows[i]);
    const close = Number(b.close), open = Number(b.open), high = Number(b.high), low = Number(b.low);
    if (![a14,a50,e9,e21,high20,low20,high50,low50,close,open,high,low].every(Number.isFinite) || a14 <= 0) return null;

    const range = Math.max(1e-12, high - low);
    const range20 = Math.max(1e-12, high20 - low20);
    const v5 = Number(arr.vol5[i]), v20 = Number(arr.vol20[i]);
    const momentum3 = (close - Number(bars[i - 3].close)) / a14;
    const momentum5 = (close - Number(bars[i - 5].close)) / a14;
    const momentum10 = (close - Number(bars[i - 10].close)) / a14;
    const prevMomentum3 = (Number(bars[i - 3].close) - Number(bars[i - 6].close)) / a14;
    const emaSlope5 = (e9 - Number(arr.ema9[i - 5])) / a14;
    const relativeVolume = v20 > 0 ? (Number(b.volume) || 0) / v20 : 1;
    const volumeAcceleration = v20 > 0 && v5 > 0 ? v5 / v20 : 1;
    const body = Math.abs(close - open);
    const upperWick = Math.max(0, high - Math.max(open, close));
    const lowerWick = Math.max(0, Math.min(open, close) - low);
    const rangePosition = clamp((close - low20) / range20, 0, 1);
    const closeLocation = clamp((close - low) / range, 0, 1);
    const structure = recentStructure(bars, i);
    const sequence = candleSequence(bars, i);
    const fib = fibContext(bars, i, a14);
    const entryTime = barCloseTime(b, baseMs);
    const htf5 = latestClosedHtf(arr.htf5, entryTime);
    const htf15 = latestClosedHtf(arr.htf15, entryTime);

    const breakoutCloseUp = close > high20 ? 1 : 0;
    const breakoutCloseDown = close < low20 ? 1 : 0;
    const breakoutWickUp = high > high20 && close <= high20 ? 1 : 0;
    const breakoutWickDown = low < low20 && close >= low20 ? 1 : 0;
    const shock = body / a14 >= 1.6 && relativeVolume >= 1.45 ? 1 : 0;

    return {
      close,
      atr14: a14,
      atr50: a50,
      volatilityRatio: a50 > 0 ? a14 / a50 : null,
      ema9: e9,
      ema21: e21,
      emaDistance: (e9 - e21) / a14,
      emaSlope5,
      trendStrength: Math.abs(e9 - e21) / a14,
      momentum3,
      momentum5,
      momentum10,
      acceleration: momentum3 - prevMomentum3,
      relativeVolume,
      volumeAcceleration,
      rangePosition,
      rangeWidthAtr: range20 / a14,
      extensionAtr: Math.abs(close - e21) / a14,
      expansionAtr: range / a14,
      bodyAtr: body / a14,
      upperWickAtr: upperWick / a14,
      lowerWickAtr: lowerWick / a14,
      closeLocation,
      pressure5: sequence.pressure5,
      bullRun: sequence.bullRun,
      bearRun: sequence.bearRun,
      structureUp: structure.up,
      structureDown: structure.down,
      structureState: structure.state,
      distanceToSupportAtr: (close - low50) / a14,
      distanceToResistanceAtr: (high50 - close) / a14,
      fibPosition: fib.position,
      fibNearest: fib.nearest,
      fibDistanceAtr: fib.distanceAtr,
      fibSwingDirection: fib.swingDirection,
      htf5Direction: htf5?.direction ?? null,
      htf5EmaGapPct: htf5?.emaGapPct ?? null,
      htf15Direction: htf15?.direction ?? null,
      htf15EmaGapPct: htf15?.emaGapPct ?? null,
      breakoutCloseUp,
      breakoutCloseDown,
      breakoutWickUp,
      breakoutWickDown,
      shock
    };
  }

  function classifyStage(f) {
    if (!f || !Number.isFinite(f.atr14) || f.atr14 <= 0) return 'WARMUP';

    const dir = f.emaDistance > 0 ? 1 : f.emaDistance < 0 ? -1 : 0;
    const alignedMom = dir * f.momentum3;
    const extended = Math.abs(f.emaDistance) >= 1.25 || Math.abs(f.momentum5) >= 1.8;
    const exhausting = extended && ((dir > 0 && f.upperWickAtr > 0.55) || (dir < 0 && f.lowerWickAtr > 0.55));
    const reversal = (f.structureUp && f.emaDistance < 0 && f.momentum3 > 0.25) ||
      (f.structureDown && f.emaDistance > 0 && f.momentum3 < -0.25);
    const pullback = Math.abs(f.emaDistance) >= 0.3 && alignedMom < 0 && Math.abs(f.momentum3) < 0.9;
    const accelerating = alignedMom > 0.75 && f.acceleration * dir > 0.18 && f.relativeVolume >= 1.05;
    const compression = f.volatilityRatio != null && f.volatilityRatio < 0.76 && f.rangeWidthAtr < 5.5;

    if (f.shock === 1) return 'SHOCK_UNRESOLVED';
    if ((f.breakoutWickUp && f.closeLocation < 0.45) || (f.breakoutWickDown && f.closeLocation > 0.55)) return 'FAILED_BREAKOUT';
    if ((f.breakoutCloseUp || f.breakoutCloseDown) && f.relativeVolume >= 1.15 && Math.abs(f.momentum3) >= 0.35) return 'BREAKOUT_ACCEPTED';
    if (f.breakoutCloseUp || f.breakoutCloseDown || f.breakoutWickUp || f.breakoutWickDown) return 'BREAKOUT_ATTEMPT';
    if (reversal) return 'REVERSAL_DEVELOPING';
    if (exhausting) return 'EXHAUSTION';
    if (compression) return 'COMPRESSION';
    if (pullback) return 'PULLBACK';

    if (f.trendStrength >= 0.35 && dir !== 0) {
      if (accelerating) return 'TREND_ACCELERATING';
      if (extended) return 'TREND_EXTENDED';
      if (f.trendStrength >= 0.75 && Math.abs(f.emaSlope5) >= 0.22) return 'TREND_HEALTHY';
      if (Math.abs(f.emaSlope5) >= 0.12 && alignedMom > 0) return 'TREND_EARLY';
      return 'TREND_MATURE';
    }

    if (f.trendStrength < 0.2) {
      if (f.relativeVolume >= 1.35 || f.volumeAcceleration >= 1.25) return 'SIDEWAY_HIGH_VOLUME';
      if (f.rangePosition <= 0.16 || f.rangePosition >= 0.84) return 'SIDEWAY_EDGE';
      if (f.volatilityRatio < 0.9) return 'SIDEWAY_STABLE';
      return 'SIDEWAY_CHOP';
    }

    return 'TRANSITION';
  }

  function stageGroup(stage) {
    if (/^TREND/.test(stage)) return 'TREND';
    if (/^SIDEWAY/.test(stage)) return 'SIDEWAY';
    if (/BREAKOUT/.test(stage)) return 'BREAKOUT';
    if (stage === 'PULLBACK') return 'PULLBACK';
    if (stage === 'COMPRESSION') return 'COMPRESSION';
    if (stage === 'EXHAUSTION') return 'EXHAUSTION';
    if (stage === 'REVERSAL_DEVELOPING') return 'REVERSAL';
    if (stage === 'SHOCK_UNRESOLVED') return 'SHOCK';
    return 'TRANSITION';
  }

  function assignChronologicalSplits(samples) {
    const rows = samples.slice().sort((a, b) => a.entryTime - b.entryTime);
    const n = rows.length;
    const b1 = Math.floor(n * 0.60);
    const b2 = Math.floor(n * 0.80);

    rows.forEach((s, idx) => {
      const crosses1 = idx < b1 && s.settlementTime >= (rows[b1]?.entryTime ?? Infinity);
      const crosses2 = idx < b2 && s.settlementTime >= (rows[b2]?.entryTime ?? Infinity);
      const nextSide1 = idx >= b1 && idx < b1 + s.horizonSteps;
      const nextSide2 = idx >= b2 && idx < b2 + s.horizonSteps;
      s.split = crosses1 || crosses2 || nextSide1 || nextSide2
        ? 'PURGE'
        : idx < b1 ? 'TRAIN' : idx < b2 ? 'VALIDATION' : 'HOLDOUT';
      s.splitIndex = idx;
    });
    return rows;
  }

  async function buildSamples(bars, options = {}) {
    const interval = options.interval || '1m';
    const baseMs = intervalMs(interval);
    if (!baseMs) throw new Error('Training 2 รองรับ 1m / 5m / 10m');
    if (HORIZON_MS % baseMs !== 0) throw new Error('ไทม์เฟรมนี้ไม่สามารถ Settlement ตรง T+10 นาทีได้');
    const horizonSteps = HORIZON_MS / baseMs;

    const sorted = (bars || []).slice().sort((a, b) => Number(a.time) - Number(b.time));
    const arr = buildFeatureArrays(sorted, baseMs);
    const out = [];
    const analysisStart = num(options.analysisStart);
    const analysisEnd = num(options.analysisEnd);

    for (let i = MIN_WARMUP; i + horizonSteps < sorted.length; i++) {
      const b = sorted[i], settle = sorted[i + horizonSteps];
      if (!b || !settle) continue;
      const entryTime = barCloseTime(b, baseMs);
      const settlementTime = barCloseTime(settle, baseMs);
      if (analysisStart != null && Number(b.time) < analysisStart) continue;
      if (analysisEnd != null && Number(b.time) > analysisEnd) continue;
      if (settlementTime - entryTime !== HORIZON_MS) continue;

      const features = featureAt(sorted, arr, i, baseMs);
      if (!features) continue;

      const entryPrice = Number(b.close);
      const settlementPrice = Number(settle.close);
      const delta = settlementPrice - entryPrice;
      const outcome = delta > 0 ? 'HIGH' : delta < 0 ? 'LOW' : 'EQUAL';
      const trajectory = [];
      for (let k = 1; k <= horizonSteps; k++) {
        const px = Number(sorted[i + k].close);
        trajectory.push({
          step: k,
          minute: k * baseMs / MINUTE,
          price: px,
          moveAtr: features.atr14 > 0 ? (px - entryPrice) / features.atr14 : null
        });
      }

      const stage = classifyStage(features);
      out.push({
        id: String(entryTime),
        barIndex: i,
        entryBarOpenTime: Number(b.time),
        entryTime,
        featureCutoffTime: entryTime,
        settlementTime,
        horizonMs: HORIZON_MS,
        horizonSteps,
        interval,
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
    return { bars: sorted, samples, interval, horizonSteps };
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
    return {
      all: stats(rows),
      train: stats(rows.filter(x => x.split === 'TRAIN')),
      validation: stats(rows.filter(x => x.split === 'VALIDATION')),
      holdout: stats(rows.filter(x => x.split === 'HOLDOUT'))
    };
  }

  function directionalStats(rows, direction) {
    const a = (rows || []).filter(x => x.outcome === 'HIGH' || x.outcome === 'LOW');
    const wins = a.filter(x => x.outcome === direction).length;
    return { n: a.length, wins, losses: a.length - wins, direction, winRate: pct(wins, a.length) };
  }

  function wilsonLower(wins, n, z = 1.645) {
    if (!n) return 0;
    const p = wins / n, z2 = z * z, den = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return (center - margin) / den;
  }

  const FEATURE_META = Object.freeze([
    ['emaDistance','EMA 9-21 / ATR'],
    ['emaSlope5','EMA slope 5 / ATR'],
    ['trendStrength','Trend strength'],
    ['momentum3','Momentum 3'],
    ['momentum5','Momentum 5'],
    ['momentum10','Momentum 10'],
    ['acceleration','Acceleration'],
    ['relativeVolume','Relative volume'],
    ['volumeAcceleration','Volume acceleration'],
    ['rangePosition','Range position'],
    ['rangeWidthAtr','Range width / ATR'],
    ['extensionAtr','Extension from EMA21 / ATR'],
    ['expansionAtr','Candle expansion / ATR'],
    ['bodyAtr','Body / ATR'],
    ['upperWickAtr','Upper wick / ATR'],
    ['lowerWickAtr','Lower wick / ATR'],
    ['closeLocation','Close location'],
    ['volatilityRatio','ATR14 / ATR50'],
    ['pressure5','Candle pressure 5'],
    ['bullRun','Bull candle run'],
    ['bearRun','Bear candle run'],
    ['structureUp','HH + HL structure'],
    ['structureDown','LH + LL structure'],
    ['distanceToSupportAtr','Distance to support / ATR'],
    ['distanceToResistanceAtr','Distance to resistance / ATR'],
    ['fibPosition','Fibonacci swing position'],
    ['fibDistanceAtr','Distance to nearest Fib / ATR'],
    ['fibSwingDirection','Fib swing direction'],
    ['htf5Direction','5m direction'],
    ['htf15Direction','15m direction'],
    ['htf5EmaGapPct','5m EMA gap %'],
    ['htf15EmaGapPct','15m EMA gap %']
  ].map(([key,label]) => ({ key, label })));

  const SEARCH_FEATURE_KEYS = Object.freeze([
    'emaDistance','emaSlope5','trendStrength','momentum3','momentum5','acceleration',
    'relativeVolume','volumeAcceleration','rangePosition','rangeWidthAtr','extensionAtr','expansionAtr','bodyAtr',
    'upperWickAtr','lowerWickAtr','closeLocation','volatilityRatio','pressure5',
    'distanceToSupportAtr','distanceToResistanceAtr','fibPosition','fibDistanceAtr',
    'htf5Direction','htf15Direction'
  ]);

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos), rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  }

  function featureBins(rows, featureKey, bins = 5) {
    const vals = rows
      .map(s => ({ sample: s, value: num(s.features?.[featureKey]) }))
      .filter(x => x.value != null)
      .sort((a, b) => a.value - b.value);
    if (!vals.length) return [];
    const values = vals.map(x => x.value);
    const cuts = [];
    for (let i = 0; i <= bins; i++) cuts.push(quantile(values, i / bins));
    const out = [];
    for (let i = 0; i < bins; i++) {
      const lo = cuts[i], hi = cuts[i + 1];
      const members = vals.filter(x => i === bins - 1
        ? x.value >= lo && x.value <= hi
        : x.value >= lo && x.value < hi).map(x => x.sample);
      out.push({ index: i, lo, hi, rows: members, stats: bySplit(members) });
    }
    return out;
  }

  function applyConditions(samples, conditions = []) {
    return (samples || []).filter(s => conditions.every(c => {
      if (!c || c.disabled) return true;
      let value;
      if (c.field === 'stage') value = s.stage;
      else if (c.field === 'stageGroup') value = s.stageGroup;
      else value = s.features?.[c.field];
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

  function developmentEvaluation(rows, direction) {
    const train = directionalStats(rows.filter(x => x.split === 'TRAIN'), direction);
    const validation = directionalStats(rows.filter(x => x.split === 'VALIDATION'), direction);
    return { train, validation };
  }

  function finalHoldoutVerdict(validation, holdout) {
    if (!holdout || holdout.n < 20 || !Number.isFinite(holdout.winRate)) {
      return { status:'INSUFFICIENT', label:'ข้อมูล Holdout ยังไม่พอ', pass:false, minRequired:null };
    }
    const validationRate = Number.isFinite(validation?.winRate) ? validation.winRate : 0.55;
    const minRequired = Math.max(0.55, validationRate - 0.05);
    const pass = holdout.winRate >= minRequired;
    return {
      status: pass ? 'PASS' : 'FAIL',
      label: pass ? 'FINAL PASS' : 'FINAL FAIL',
      pass,
      minRequired
    };
  }

  function runFinalHoldout(samples, conditions = [], direction, validation = null) {
    if (!direction) return { holdout:null, verdict:{status:'INSUFFICIENT',label:'ไม่มี Direction ที่ล็อกจาก Train',pass:false,minRequired:null} };
    const rows = applyConditions(samples, conditions);
    const holdout = directionalStats(rows.filter(x => x.split === 'HOLDOUT'), direction);
    return { holdout, verdict:finalHoldoutVerdict(validation, holdout) };
  }

  function evaluateConditionSet(samples, conditions = []) {
    const rows = applyConditions(samples, conditions);
    const trainRows = rows.filter(x => x.split === 'TRAIN');
    const trainDesc = stats(trainRows);
    const direction = trainDesc.bestSide;
    if (!direction) return { conditions, rows, direction:null, evaluation:null, playability:null };
    const evaluation = developmentEvaluation(rows, direction);
    const playabilityResult = playabilityFromEvaluation(evaluation, conditions.length);
    return { conditions, rows, direction, evaluation, playability:playabilityResult };
  }

  function candidateScore(rows, direction, complexity, baseTrainN) {
    const ds = directionalStats(rows, direction);
    if (ds.n < 18) return -Infinity;
    const coverage = baseTrainN ? ds.n / baseTrainN : 0;
    if (coverage < 0.08) return -Infinity;
    const wlb = wilsonLower(ds.wins, ds.n);
    return wlb + Math.min(coverage, .8) * .02 - complexity * .007;
  }

  function makeThresholdRules(trainRows, featureKey) {
    const vals = trainRows.map(s => num(s.features?.[featureKey])).filter(v => v != null).sort((a,b)=>a-b);
    if (vals.length < 30) return [];
    const qs = [0.2,0.35,0.5,0.65,0.8];
    const seen = new Set(), rules = [];
    for (const q of qs) {
      const t = quantile(vals, q);
      if (!Number.isFinite(t)) continue;
      for (const op of ['>=','<=']) {
        const key = op + ':' + t.toFixed(6);
        if (seen.has(key)) continue;
        seen.add(key);
        rules.push({ field: featureKey, op, value: t });
      }
    }
    return rules;
  }

  function discoverBestCondition(rows, options = {}) {
    const stageRows = (rows || []).filter(x => x.split !== 'PURGE');
    const train = stageRows.filter(x => x.split === 'TRAIN');
    if (train.length < 45) {
      return { status:'INSUFFICIENT', direction:null, conditions:[], trainN:train.length, ranked:[], evaluation:null };
    }

    const base = stats(train);
    const baselineDirection = base.bestSide;
    let candidates = [];
    if (baselineDirection) {
      const evalBase = developmentEvaluation(stageRows, baselineDirection);
      candidates.push({
        conditions:[], direction:baselineDirection, complexity:0, trainRows:train,
        score:candidateScore(train, baselineDirection, 0, train.length), evaluation:evalBase
      });
    }

    const singles = [];
    for (const featureKey of SEARCH_FEATURE_KEYS) {
      for (const rule of makeThresholdRules(train, featureKey)) {
        const kept = applyConditions(train, [rule]);
        const desc = stats(kept);
        if (!desc.bestSide) continue;
        const score = candidateScore(kept, desc.bestSide, 1, train.length);
        if (!Number.isFinite(score)) continue;
        singles.push({ rule, keptN:kept.length, direction:desc.bestSide, score });
      }
    }
    singles.sort((a,b)=>b.score-a.score);
    for (const s of singles.slice(0,30)) {
      const keptAll = applyConditions(stageRows,[s.rule]);
      candidates.push({
        conditions:[s.rule], direction:s.direction, complexity:1,
        score:s.score, trainRows:applyConditions(train,[s.rule]),
        evaluation:developmentEvaluation(keptAll,s.direction)
      });
    }

    const topSingles = singles.slice(0,12);
    for (let a = 0; a < topSingles.length; a++) {
      for (let b = a + 1; b < topSingles.length; b++) {
        const ra = topSingles[a].rule, rb = topSingles[b].rule;
        if (ra.field === rb.field) continue;
        const cond = [ra,rb];
        const kept = applyConditions(train,cond);
        const desc = stats(kept);
        if (!desc.bestSide) continue;
        const score = candidateScore(kept,desc.bestSide,2,train.length);
        if (!Number.isFinite(score)) continue;
        const keptAll = applyConditions(stageRows,cond);
        candidates.push({
          conditions:cond,direction:desc.bestSide,complexity:2,score,
          trainRows:kept,evaluation:developmentEvaluation(keptAll,desc.bestSide)
        });
      }
    }

    candidates = candidates
      .filter(c => Number.isFinite(c.score))
      .sort((a,b)=>b.score-a.score);

    const best = candidates[0] || null;
    if (!best) return { status:'INSUFFICIENT',direction:null,conditions:[],trainN:train.length,ranked:[],evaluation:null };

    const ranked = candidates.slice(0,12).map(c => ({
      conditions:c.conditions,
      direction:c.direction,
      complexity:c.complexity,
      score:c.score,
      train:c.evaluation.train,
      validation:c.evaluation.validation,
      playability:playabilityFromEvaluation(c.evaluation,c.complexity)
    }));

    return {
      status:'OK',
      direction:best.direction,
      conditions:best.conditions,
      complexity:best.complexity,
      score:best.score,
      trainN:train.length,
      evaluation:best.evaluation,
      playability:playabilityFromEvaluation(best.evaluation,best.complexity),
      ranked
    };
  }

  function playabilityFromEvaluation(evaluation, complexity = 0) {
    if (!evaluation) return { score:null,label:'ข้อมูลยังไม่พอ',level:'insufficient',stability:null };
    const tr = evaluation.train, va = evaluation.validation;
    if (va.n < 12 || !Number.isFinite(va.winRate)) {
      return { score:null,label:'ข้อมูล Validation ยังไม่พอ',level:'insufficient',stability:null,evaluation };
    }
    const edge = clamp((va.winRate - 0.5) * 500,0,100);
    const sampleFactor = clamp(Math.sqrt(va.n / 60),0.35,1);
    const gap = Number.isFinite(tr?.winRate) ? Math.abs(tr.winRate - va.winRate) : 0;
    const stability = clamp(1-gap*4,0,1);
    const complexityPenalty = complexity * 2;
    const score = Math.round(clamp(edge*sampleFactor*(0.45+0.55*stability)-complexityPenalty,0,100));
    const level = score >= 70 ? 'good' : score >= 45 ? 'watch' : 'hard';
    const label = level === 'good' ? 'น่าเล่น' : level === 'watch' ? 'เลือกจังหวะ' : 'เดายาก / งด';
    return { score,label,level,stability,validationRate:va.winRate,evaluation };
  }

  function researchDecision(playability) {
    const p = playability || {};
    if (p.score == null || p.level === 'insufficient') {
      return { status:'INSUFFICIENT', label:'ข้อมูลยังไม่พอ', canTrade:false, showDirection:false };
    }
    if (p.level === 'good') {
      return { status:'PLAYABLE', label:'น่าเล่น', canTrade:true, showDirection:true };
    }
    if (p.level === 'watch') {
      return { status:'SELECTIVE', label:'เลือกจังหวะ', canTrade:false, showDirection:true };
    }
    return { status:'AVOID', label:'เดายาก / งด', canTrade:false, showDirection:false };
  }

  function discoverFeatureUsefulness(rows) {
    const source = (rows || []).filter(x => x.split === 'TRAIN' || x.split === 'VALIDATION');
    const train = source.filter(x => x.split === 'TRAIN');
    if (train.length < 45) return [];

    const out = [];
    for (const featureKey of SEARCH_FEATURE_KEYS) {
      let best = null;
      for (const rule of makeThresholdRules(train, featureKey)) {
        const keptTrain = applyConditions(train, [rule]);
        const desc = stats(keptTrain);
        if (!desc.bestSide) continue;
        const score = candidateScore(keptTrain, desc.bestSide, 1, train.length);
        if (!Number.isFinite(score)) continue;
        if (!best || score > best.trainSelectionScore) {
          const keptAll = applyConditions(source, [rule]);
          const evaluation = developmentEvaluation(keptAll, desc.bestSide);
          best = {
            featureKey,
            rule,
            direction: desc.bestSide,
            trainSelectionScore: score,
            evaluation,
            matching: keptAll.length,
            playability: playabilityFromEvaluation(evaluation, 1)
          };
        }
      }
      if (best) {
        best.decision = researchDecision(best.playability);
        out.push(best);
      }
    }
    return out.sort((a,b) => {
      const pa = a.playability?.score ?? -1, pb = b.playability?.score ?? -1;
      if (pb !== pa) return pb - pa;
      return (b.evaluation?.validation?.n || 0) - (a.evaluation?.validation?.n || 0);
    });
  }

  function researchStage(rows) {
    const candidate = discoverBestCondition(rows);
    const playability = candidate.playability || {score:null,label:'ข้อมูลยังไม่พอ',level:'insufficient',stability:null};
    return { candidate, playability, decision:researchDecision(playability) };
  }

  function groupByStage(samples) {
    const map = new Map();
    for (const s of samples || []) {
      if (!map.has(s.stage)) map.set(s.stage,[]);
      map.get(s.stage).push(s);
    }
    return [...map.entries()].map(([stage,rows]) => {
      const research = researchStage(rows);
      return {
        stage,group:stageGroup(stage),rows,summary:bySplit(rows),
        research,playability:research.playability,decision:research.decision
      };
    }).sort((a,b)=>b.rows.length-a.rows.length);
  }

  function discoverBestConditions(samples) {
    return groupByStage(samples)
      .filter(x => x.research?.candidate?.status === 'OK')
      .sort((a,b)=>(b.playability.score ?? -1)-(a.playability.score ?? -1));
  }

  function trajectorySummary(rows) {
    const decided = (rows || []).filter(s => Array.isArray(s.outcomeData?.trajectory));
    const minuteSet = [...new Set(decided.flatMap(s => s.outcomeData.trajectory.map(x => x.minute)))].sort((a,b)=>a-b);
    return minuteSet.map(minute => {
      const vals = decided.map(s => {
        const hit = s.outcomeData.trajectory.find(x => x.minute === minute);
        return num(hit?.moveAtr);
      }).filter(v => v != null);
      return {
        minute,
        avgMoveAtr: mean(vals),
        medianMoveAtr: median(vals),
        positiveRate: vals.length ? vals.filter(v => v > 0).length / vals.length : null,
        n: vals.length
      };
    });
  }

  function auditDataset(samples) {
    const issues = [];
    const rows = samples || [];
    let badHorizon = 0, badFinite = 0, badCutoff = 0;
    for (const s of rows) {
      if (s.settlementTime - s.entryTime !== HORIZON_MS) badHorizon++;
      if (s.featureCutoffTime !== s.entryTime) badCutoff++;
      for (const meta of FEATURE_META) {
        const v = s.features?.[meta.key];
        if (v != null && !Number.isFinite(Number(v))) badFinite++;
      }
    }
    if (badHorizon) issues.push({code:'BAD_HORIZON',count:badHorizon,text:'พบ Sample ที่ไม่ใช่ T+10 นาทีจริง'});
    if (badFinite) issues.push({code:'BAD_FEATURE',count:badFinite,text:'พบ Feature ที่ไม่เป็นตัวเลข'});
    if (badCutoff) issues.push({code:'BAD_CUTOFF',count:badCutoff,text:'Feature cutoff ไม่ตรงกับ T0'});

    const train = rows.filter(x=>x.split==='TRAIN');
    const val = rows.filter(x=>x.split==='VALIDATION');
    const hold = rows.filter(x=>x.split==='HOLDOUT');
    const maxTrainSettle = Math.max(-Infinity,...train.map(x=>x.settlementTime));
    const minValEntry = Math.min(Infinity,...val.map(x=>x.entryTime));
    const maxValSettle = Math.max(-Infinity,...val.map(x=>x.settlementTime));
    const minHoldEntry = Math.min(Infinity,...hold.map(x=>x.entryTime));
    if (train.length && val.length && maxTrainSettle >= minValEntry) issues.push({code:'SPLIT_OVERLAP_1',count:1,text:'Train settlement ซ้อนกับ Validation entry'});
    if (val.length && hold.length && maxValSettle >= minHoldEntry) issues.push({code:'SPLIT_OVERLAP_2',count:1,text:'Validation settlement ซ้อนกับ Holdout entry'});
    return {ok:issues.length===0,issues,checked:rows.length};
  }

  globalThis.Training2Core = {
    schema:'aris-training2-core-v3',
    horizonMinutes:10,
    horizonMs:HORIZON_MS,
    minWarmup:MIN_WARMUP,
    supportedIntervals:Object.keys(SUPPORTED_INTERVAL_MS),
    intervalMs,
    featureMeta:FEATURE_META,
    searchFeatureKeys:SEARCH_FEATURE_KEYS,
    buildSamples,
    stats,
    bySplit,
    directionalStats,
    playabilityFromEvaluation,
    finalHoldoutVerdict,
    runFinalHoldout,
    researchStage,
    groupByStage,
    discoverBestCondition,
    discoverBestConditions,
    discoverFeatureUsefulness,
    researchDecision,
    evaluateConditionSet,
    featureBins,
    applyConditions,
    trajectorySummary,
    auditDataset,
    stageGroup
  };
})();
