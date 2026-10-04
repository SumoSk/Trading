(() => {
  'use strict';

  const CORE = () => globalThis.Training2Core;
  const HD = () => globalThis.HistoricalDataV1;
  const MINUTE = 60_000;
  const MARKETS = [
    ['BTCUSDT','BTC'],['XAUUSDT','XAU'],['SKHYUSDT','SKHY'],['AMDUSDT','AMD'],
    ['INTCUSDT','INTEL'],['NVDAUSDT','NVDA'],['OPENAIUSDT','OPENAI']
  ];

  const state = {
    session:null,
    bars:[],
    samples:[],
    stage:null,
    sampleRows:[],
    sampleCursor:0,
    reveal:false,
    chart:null,
    series:null,
    priceLine:null,
    controller:null,
    compareA:null,
    candidates:loadCandidates()
  };

  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const p1 = v => Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '—';
  const n2 = v => Number.isFinite(v) ? Number(v).toFixed(2) : '—';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dtLocal = ms => {
    const d = new Date(ms);
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const parseLocal = v => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };
  const marketLabel = symbol => MARKETS.find(x => x[0] === symbol)?.[1] || String(symbol || '').replace(/USDT$/,'');
  const stageLabel = stage => ({
    TREND_EARLY_UP:'Trend Early ↑',
    TREND_EARLY_DOWN:'Trend Early ↓',
    TREND_UP:'Trend ↑',
    TREND_DOWN:'Trend ↓',
    SIDEWAY_EDGE_LOW:'Sideway · ขอบล่าง',
    SIDEWAY_EDGE_HIGH:'Sideway · ขอบบน',
    SIDEWAY_HIGH_VOLUME:'Sideway · Volume สูง',
    SIDEWAY_CHOP:'Sideway · Chop',
    BREAKOUT_UP:'Breakout ↑',
    BREAKOUT_DOWN:'Breakout ↓',
    COMPRESSION:'Compression',
    SHOCK:'Shock / Expansion',
    TRANSITION:'Transition',
    WARMUP:'Warm-up'
  })[stage] || stage || 'ALL MARKET';

  function setBadge(el, text, type='') {
    if (!el) return;
    el.textContent = text;
    el.className = 'badge' + (type ? ' ' + type : '');
  }

  function loadCandidates() {
    try {
      const raw = JSON.parse(localStorage.getItem('aris-training2-candidates-v1') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }

  function saveCandidates() {
    try { localStorage.setItem('aris-training2-candidates-v1', JSON.stringify(state.candidates.slice(0,30))); } catch {}
  }

  function initTimeRange() {
    const end = HD()?.lastClosedOpenTime?.('1m') ?? (Date.now() - MINUTE);
    const bars = Number($('bar-count')?.value || 10000);
    const start = end - Math.max(1, bars - 1) * MINUTE;
    $('end-time').value = dtLocal(end);
    $('start-time').value = dtLocal(start);
  }

  function syncStartFromBarCount() {
    const end = parseLocal($('end-time').value) ?? (Date.now() - MINUTE);
    const bars = Number($('bar-count').value || 10000);
    $('start-time').value = dtLocal(end - Math.max(1, bars - 1) * MINUTE);
  }

  async function refreshSessions() {
    const select = $('session-select');
    if (!select || !HD()) return;
    const rows = await HD().listSessions(50);
    const eligible = rows.filter(x => x.interval === '1m' && x.datasetId && Number(x.loadedBars || 0) > 0);
    select.innerHTML = eligible.length
      ? eligible.map(s => `<option value="${esc(s.id)}">${esc(marketLabel(s.symbol))} · 1m · ${fmt(s.requestedAnalysisBars || s.loadedBars)} bars · ${esc(s.status || '')}</option>`).join('')
      : '<option value="">ยังไม่มี Historical Session 1m</option>';
  }

  async function downloadData() {
    if (!HD()) return alert('HistoricalDataV1 ยังไม่พร้อมค่ะ');
    const symbol = $('market').value;
    const startTime = parseLocal($('start-time').value);
    const endTime = parseLocal($('end-time').value);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      alert('ช่วงเวลาไม่ถูกต้องค่ะ');
      return;
    }

    state.controller?.abort?.();
    state.controller = new AbortController();
    $('download-data').disabled = true;
    $('build-dataset').disabled = true;
    $('cancel-download').hidden = false;
    $('progress').classList.add('show');
    setBadge($('data-status'),'กำลังโหลด','warn');

    try {
      const session = await HD().downloadDataset({
        symbol,
        interval:'1m',
        startTime,
        endTime,
        warmupBars:120,
        signal:state.controller.signal,
        engineMeta:{engineVersion:'TRAINING-2-RESEARCH',engineBlobSha:'training2-core-v1',auditSchema:null},
        onProgress:p=>{
          const pct = Math.max(0, Math.min(100, Number(p.progress || 0) * 100));
          $('progress-bar').style.width = pct.toFixed(1) + '%';
          $('progress-left').textContent = fmt(p.loadedBars) + ' / ' + fmt(p.expectedBars) + ' bars';
          $('progress-right').textContent = pct.toFixed(1) + '%';
        }
      });
      await loadSession(session.id);
      setBadge($('data-status'),'ข้อมูลพร้อม','good');
      await refreshSessions();
    } catch (err) {
      if (err?.name === 'AbortError') setBadge($('data-status'),'ยกเลิกแล้ว','warn');
      else {
        console.error(err);
        setBadge($('data-status'),'โหลดไม่สำเร็จ','bad');
        alert('โหลดข้อมูลไม่สำเร็จ: ' + String(err?.message || err));
      }
    } finally {
      $('download-data').disabled = false;
      $('cancel-download').hidden = true;
      state.controller = null;
    }
  }

  async function loadSession(id) {
    if (!id || !HD()) return;
    const session = await HD().getSession(id);
    if (!session) throw new Error('ไม่พบ Session');
    const bars = await HD().getDatasetBars(session.datasetId);
    state.session = session;
    state.bars = bars;
    state.samples = [];
    state.stage = null;
    state.sampleRows = [];
    state.sampleCursor = 0;
    state.reveal = false;

    $('market').value = session.symbol || 'BTCUSDT';
    $('start-time').value = dtLocal(session.analysisStart);
    $('end-time').value = dtLocal(session.analysisEnd);
    $('mini-market').textContent = marketLabel(session.symbol);
    $('mini-bars').textContent = fmt(bars.length);
    $('mini-samples').textContent = '—';
    $('mini-integrity').textContent = '—';
    $('build-dataset').disabled = bars.length < 80;
    $('export-research').disabled = true;
    setBadge($('data-status'), session.quality?.grade ? 'Data ' + session.quality.grade : 'ข้อมูลพร้อม', session.quality?.grade === 'C' ? 'bad' : 'good');
    $('chart-empty').textContent = 'ข้อมูลพร้อม · กด “สร้าง Training Dataset”';
    $('chart-empty').style.display = 'grid';
    resetPanels();
  }

  async function useSelectedSession() {
    const id = $('session-select').value;
    if (!id) return;
    try { await loadSession(id); }
    catch (err) { alert(String(err?.message || err)); }
  }

  async function buildDataset() {
    if (!state.bars.length || !CORE()) return;
    $('build-dataset').disabled = true;
    $('progress').classList.add('show');
    setBadge($('data-status'),'กำลังสร้าง Samples','warn');
    $('progress-bar').style.width = '0%';

    try {
      const result = await CORE().buildSamples(state.bars,{
        analysisStart:state.session?.analysisStart,
        analysisEnd:state.session?.analysisEnd,
        onProgress:p=>{
          const max = Math.max(1, p.total || state.bars.length);
          const pct = Math.max(0,Math.min(100,(p.scanned || 0)/max*100));
          $('progress-bar').style.width = pct.toFixed(1)+'%';
          $('progress-left').textContent = 'Samples ' + fmt(p.built || 0);
          $('progress-right').textContent = pct.toFixed(1)+'%';
        }
      });
      state.bars = result.bars;
      state.samples = result.samples;
      state.stage = null;
      const audit = CORE().auditDataset(state.samples);
      $('mini-samples').textContent = fmt(state.samples.length);
      $('mini-integrity').textContent = audit.ok ? 'PASS' : 'FAIL';
      $('mini-integrity').style.color = audit.ok ? 'var(--green)' : 'var(--red)';
      $('export-research').disabled = false;
      setBadge($('data-status'),'Dataset พร้อม','good');
      renderAll();
      chooseSampleRows(state.samples);
      renderSample();
    } catch (err) {
      console.error(err);
      setBadge($('data-status'),'สร้างไม่สำเร็จ','bad');
      alert('สร้าง Training Dataset ไม่สำเร็จ: '+String(err?.message || err));
    } finally {
      $('build-dataset').disabled = false;
    }
  }

  function resetPanels() {
    $('stage-list').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('panel-market').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('panel-playability').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('feature-results').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('panel-outcome').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('panel-split').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('panel-best').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    updateInspector([]);
  }

  function activeRows() {
    return state.stage ? state.samples.filter(x => x.stage === state.stage) : state.samples;
  }

  function setStage(stage) {
    state.stage = stage || null;
    document.querySelectorAll('.stage-item').forEach(el=>el.classList.toggle('active', (el.dataset.stage || '') === (state.stage || '')));
    $('inspector-stage').textContent = stageLabel(state.stage);
    renderMarketPanels();
    renderPlayability();
    renderFeatureExplorer();
    renderOutcome();
    renderBest();
    updateInspector(activeRows());
    chooseSampleRows(activeRows());
    renderSample();
    syncStageSelects();
  }

  function renderAll() {
    renderStageList();
    renderMarketPanels();
    renderPlayability();
    populateFeatureControls();
    syncStageSelects();
    renderFeatureExplorer();
    renderComboFilters();
    renderComboResults([]);
    renderOutcome();
    renderSplit();
    renderBest();
    updateInspector(activeRows());
  }

  function renderStageList() {
    if (!state.samples.length) return;
    const groups = CORE().groupByStage(state.samples);
    const total = state.samples.length;
    $('stage-list').innerHTML = groups.map(g=>{
      const p = g.playability;
      const score = p.score == null ? '—' : String(p.score);
      return `<div class="stage-item" data-stage="${esc(g.stage)}">
        <div><strong>${esc(stageLabel(g.stage))}</strong><small>${fmt(g.rows.length)} samples · ${(g.rows.length/total*100).toFixed(1)}%</small></div>
        <div class="stage-score ${esc(p.level || '')}">${score}</div>
      </div>`;
    }).join('');
    $('stage-list').querySelectorAll('.stage-item').forEach(el=>el.addEventListener('click',()=>setStage(el.dataset.stage)));
  }

  function summaryTable(rows) {
    const s = CORE().bySplit(rows);
    const line = (name,x)=>`<tr><td>${name}</td><td class="num">${fmt(x.decided)}</td><td class="num">${p1(x.highRate)}</td><td class="num">${p1(x.lowRate)}</td><td>${x.bestSide || '—'}</td><td class="num">${p1(x.bestRate)}</td></tr>`;
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>ชุดข้อมูล</th><th class="num">n</th><th class="num">HIGH</th><th class="num">LOW</th><th>Best side</th><th class="num">Best rate</th></tr></thead><tbody>
      ${line('ทั้งหมด',s.all)}${line('Train',s.train)}${line('Validation',s.validation)}${line('Holdout',s.holdout)}
    </tbody></table></div>`;
  }

  function renderMarketPanels() {
    const rows = activeRows();
    const groups = CORE().groupByStage(rows);
    $('panel-market').innerHTML = `
      <div class="card-head"><div><h3>${state.stage ? stageLabel(state.stage) : 'Market Map'}</h3><small>สัดส่วน Stage และผล T+10 ที่เกิดขึ้นจริง</small></div><span class="badge">${fmt(rows.length)} samples</span></div>
      ${state.stage ? summaryTable(rows) : `<div class="table-wrap"><table class="tbl"><thead><tr><th>Stage</th><th class="num">Samples</th><th class="num">%</th><th class="num">HIGH</th><th class="num">LOW</th></tr></thead><tbody>${groups.map(g=>`<tr class="clickable" data-stage-row="${esc(g.stage)}"><td>${esc(stageLabel(g.stage))}</td><td class="num">${fmt(g.rows.length)}</td><td class="num">${(g.rows.length/rows.length*100).toFixed(1)}%</td><td class="num">${p1(g.summary.all.highRate)}</td><td class="num">${p1(g.summary.all.lowRate)}</td></tr>`).join('')}</tbody></table></div>`}
    `;
    $('panel-market').querySelectorAll('[data-stage-row]').forEach(el=>el.addEventListener('click',()=>setStage(el.dataset.stageRow)));
  }

  function renderPlayability() {
    if (!state.samples.length) return;
    const groups = CORE().groupByStage(state.samples);
    $('panel-playability').innerHTML = `
      <div class="card-head"><div><h3>Playability Map</h3><small>คะแนนนี้ใช้ Validation/Holdout เป็นหลัก เพื่อบอกว่าช่วงใด “เดาง่าย/ยาก”</small></div><span class="badge purple">ไม่ใช่ Direction</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Stage</th><th class="num">Score</th><th>สถานะ</th><th class="num">n</th><th class="num">Validation</th><th class="num">Holdout</th></tr></thead><tbody>
      ${groups.map(g=>{
        const p=g.playability,s=p.stats;
        const cls=p.level==='good'?'play-good':p.level==='watch'?'play-watch':'play-hard';
        return `<tr class="clickable" data-play-stage="${esc(g.stage)}"><td>${esc(stageLabel(g.stage))}</td><td class="num ${cls}">${p.score==null?'—':p.score}</td><td class="${cls}">${esc(p.label)}</td><td class="num">${fmt(g.rows.length)}</td><td class="num">${p1(s.validation.bestRate)}</td><td class="num">${p1(s.holdout.bestRate)}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      <div class="method-note">ถ้า Stage ใดตัวเลข Train สวย แต่ Validation/Holdout ไม่ตาม คะแนนจะถูกลดลงเอง และถ้าจำนวนตัวอย่างน้อยจะยังไม่ถูกยกให้เป็นช่วงน่าเล่นค่ะ</div>
    `;
    $('panel-playability').querySelectorAll('[data-play-stage]').forEach(el=>el.addEventListener('click',()=>setStage(el.dataset.playStage)));
  }

  function populateFeatureControls() {
    const stageOptions = ['<option value="">ALL MARKET</option>'].concat(CORE().groupByStage(state.samples).map(g=>`<option value="${esc(g.stage)}">${esc(stageLabel(g.stage))}</option>`));
    $('feature-stage').innerHTML = stageOptions.join('');
    $('combo-stage').innerHTML = stageOptions.join('');
    $('feature-key').innerHTML = CORE().featureMeta.map(f=>`<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('');
  }

  function syncStageSelects() {
    if ($('feature-stage')) $('feature-stage').value = state.stage || '';
    if ($('combo-stage')) $('combo-stage').value = state.stage || '';
  }

  function renderFeatureExplorer() {
    if (!state.samples.length) return;
    const stage = $('feature-stage')?.value || state.stage || '';
    const key = $('feature-key')?.value || CORE().featureMeta[0].key;
    const rows = stage ? state.samples.filter(x=>x.stage===stage) : state.samples;
    const bins = CORE().featureBins(rows,key,5);
    const meta = CORE().featureMeta.find(x=>x.key===key);
    $('feature-results').innerHTML = `
      <div class="card-head"><div><h3>${esc(meta?.label || key)}</h3><small>${stage ? stageLabel(stage) : 'ALL MARKET'} · แบ่งช่วงค่าตามข้อมูลจริง 5 กลุ่ม</small></div><span class="badge">${fmt(rows.length)} samples</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>ช่วงค่า</th><th class="num">n</th><th class="num">HIGH</th><th class="num">LOW</th><th class="num">Validation best</th><th class="num">Holdout best</th><th class="num">Playability</th></tr></thead><tbody>
      ${bins.map(b=>`<tr><td>${n2(b.lo)} → ${n2(b.hi)}</td><td class="num">${fmt(b.rows.length)}</td><td class="num">${p1(b.stats.all.highRate)}</td><td class="num">${p1(b.stats.all.lowRate)}</td><td class="num">${p1(b.stats.validation.bestRate)}</td><td class="num">${p1(b.stats.holdout.bestRate)}</td><td class="num">${b.playability.score==null?'—':b.playability.score}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="method-note">หน้านี้ไม่ได้บอกว่าสูตรไหนต้องใช้ แต่ช่วยดูว่าเมื่อ Feature เปลี่ยน พฤติกรรม T+10 เปลี่ยนตามหรือไม่ และต้องดู Validation/Holdout ควบคู่กันค่ะ</div>
    `;
  }

  function renderComboFilters() {
    if (!state.samples.length) return;
    if ($('combo-filters').children.length) return;
    addComboFilter();
  }

  function addComboFilter(prefill={}) {
    const wrap = document.createElement('div');
    wrap.className='filter-row';
    const opts = CORE().featureMeta.map(f=>`<option value="${esc(f.key)}" ${prefill.field===f.key?'selected':''}>${esc(f.label)}</option>`).join('');
    wrap.innerHTML = `<select class="combo-field">${opts}</select><select class="combo-op"><option>&gt;</option><option>&gt;=</option><option>&lt;</option><option>&lt;=</option></select><input class="combo-value" inputmode="decimal" placeholder="ค่า" value="${esc(prefill.value ?? '')}"><button type="button">×</button>`;
    if (prefill.op) wrap.querySelector('.combo-op').value=prefill.op;
    wrap.querySelector('button').addEventListener('click',()=>wrap.remove());
    $('combo-filters').append(wrap);
  }

  function currentConditions() {
    const conditions = [];
    const stage = $('combo-stage').value;
    if (stage) conditions.push({field:'stage',op:'=',value:stage});
    $('combo-filters').querySelectorAll('.filter-row').forEach(row=>{
      const field=row.querySelector('.combo-field').value;
      const op=row.querySelector('.combo-op').value;
      const value=row.querySelector('.combo-value').value.trim();
      if (value !== '') conditions.push({field,op,value:Number(value)});
    });
    return conditions;
  }

  function renderComboResults(rows, conditions=currentConditions()) {
    if (!state.samples.length) return;
    const s=CORE().bySplit(rows);
    const play=CORE().playability(rows);
    const condText = conditions.length ? conditions.map(c=>c.field==='stage' ? 'Stage = '+stageLabel(c.value) : `${c.field} ${c.op} ${c.value}`).join(' · ') : 'ไม่มีเงื่อนไข';
    $('combo-results').innerHTML = `
      <div class="method-note">${esc(condText)}</div>
      <div class="combo-result">
        <div class="kpi"><span>MATCHING</span><b>${fmt(rows.length)}</b><em>samples</em></div>
        <div class="kpi"><span>HIGH</span><b>${p1(s.all.highRate)}</b><em>${fmt(s.all.high)}</em></div>
        <div class="kpi"><span>LOW</span><b>${p1(s.all.lowRate)}</b><em>${fmt(s.all.low)}</em></div>
        <div class="kpi"><span>PLAYABILITY</span><b>${play.score==null?'—':play.score}</b><em>${esc(play.label)}</em></div>
      </div>
      ${summaryTable(rows)}
    `;
    if (state.compareA) {
      const a=state.compareA.summary,b=CORE().bySplit(rows);
      $('combo-compare').innerHTML = `<div class="card-head" style="margin-top:10px"><div><h3>Compare A vs B</h3><small>A = เงื่อนไขที่บันทึกไว้ · B = เงื่อนไขปัจจุบัน</small></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>ชุด</th><th class="num">n</th><th>Best side</th><th class="num">Train</th><th class="num">Validation</th><th class="num">Holdout</th></tr></thead><tbody>
      <tr><td>A</td><td class="num">${fmt(a.all.decided)}</td><td>${a.all.bestSide||'—'}</td><td class="num">${p1(a.train.bestRate)}</td><td class="num">${p1(a.validation.bestRate)}</td><td class="num">${p1(a.holdout.bestRate)}</td></tr>
      <tr><td>B</td><td class="num">${fmt(b.all.decided)}</td><td>${b.all.bestSide||'—'}</td><td class="num">${p1(b.train.bestRate)}</td><td class="num">${p1(b.validation.bestRate)}</td><td class="num">${p1(b.holdout.bestRate)}</td></tr>
      </tbody></table></div>`;
    } else $('combo-compare').innerHTML='';
  }

  function runCombo() {
    const conditions=currentConditions();
    const rows=CORE().applyConditions(state.samples,conditions);
    renderComboResults(rows,conditions);
    chooseSampleRows(rows);
    renderSample();
    updateInspector(rows);
  }

  function saveCompareA() {
    if (!state.samples.length) return;
    const conditions=currentConditions();
    const rows=CORE().applyConditions(state.samples,conditions);
    state.compareA={conditions,summary:CORE().bySplit(rows)};
    renderComboResults(rows,conditions);
  }

  function saveCandidate() {
    if (!state.samples.length) return;
    const conditions=currentConditions();
    const rows=CORE().applyConditions(state.samples,conditions);
    const summary=CORE().bySplit(rows);
    const play=CORE().playability(rows);
    const c={
      id:'CAND-'+Date.now(),
      createdAt:Date.now(),
      symbol:state.session?.symbol,
      conditions,
      n:rows.length,
      bestSide:summary.all.bestSide,
      train:summary.train.bestRate,
      validation:summary.validation.bestRate,
      holdout:summary.holdout.bestRate,
      playability:play.score
    };
    state.candidates.unshift(c);
    saveCandidates();
    renderBest();
  }

  function renderOutcome() {
    if (!state.samples.length) return;
    const rows=activeRows();
    const traj=CORE().trajectorySummary(rows);
    $('panel-outcome').innerHTML = `
      <div class="card-head"><div><h3>T+10 Outcome Explorer</h3><small>${state.stage?stageLabel(state.stage):'ALL MARKET'} · ข้อมูล T+1…T+10 ใช้เพื่อดู Outcome เท่านั้น ไม่ย้อนกลับเป็น Predictor ของ T0</small></div><span class="badge">${fmt(rows.length)} samples</span></div>
      ${summaryTable(rows)}
      <div class="table-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>เวลา</th><th class="num">Avg move / ATR</th><th class="num">Median / ATR</th><th class="num">อยู่เหนือ Entry</th><th class="num">n</th></tr></thead><tbody>
      ${traj.map(x=>`<tr><td>T+${x.minute}</td><td class="num">${n2(x.avgMoveAtr)}</td><td class="num">${n2(x.medianMoveAtr)}</td><td class="num">${p1(x.positiveRate)}</td><td class="num">${fmt(x.n)}</td></tr>`).join('')}
      </tbody></table></div>
    `;
  }

  function renderSplit() {
    if (!state.samples.length) return;
    const s=CORE().bySplit(state.samples);
    const purge=state.samples.filter(x=>x.split==='PURGE').length;
    const audit=CORE().auditDataset(state.samples);
    $('panel-split').innerHTML = `
      <div class="card-head"><div><h3>Chronological Split</h3><small>เรียงตามเวลา 60 / 20 / 20 และเว้น Purge รอบรอยต่อเพื่อไม่ให้ T+10 ซ้อนกันข้ามชุด</small></div><span class="badge ${audit.ok?'good':'bad'}">${audit.ok?'Integrity PASS':'Integrity FAIL'}</span></div>
      <div class="timeline"><div class="train">TRAIN</div><div class="purge"></div><div class="val">VALIDATION</div><div class="purge"></div><div class="hold">HOLDOUT</div></div>
      <div class="split-grid">
        <div class="split-box"><span>TRAIN</span><b>${fmt(s.train.n)}</b><small>60% ต้นข้อมูล</small></div>
        <div class="split-box"><span>VALIDATION</span><b>${fmt(s.validation.n)}</b><small>ช่วงถัดมา</small></div>
        <div class="split-box"><span>HOLDOUT</span><b>${fmt(s.holdout.n)}</b><small>ช่วงท้ายสุด</small></div>
      </div>
      <div class="method-note">Purge: ${fmt(purge)} samples · Holdout ไม่ถูกใช้สร้างเงื่อนไขในหน้าจอนี้โดยอัตโนมัติ ผู้ใช้เห็นผลเพื่อประเมิน Candidate เท่านั้นค่ะ</div>
      <div class="integrity">${audit.issues.length?audit.issues.map(x=>`<div class="integrity-row"><span>${esc(x.text)}</span><b class="fail">${fmt(x.count)}</b></div>`).join(''):'<div class="integrity-row"><span>T+10 exact / Feature finite / Split overlap</span><b class="ok">PASS</b></div>'}</div>
    `;
  }

  function renderBest() {
    if (!state.samples.length) return;
    const ranked=CORE().rankStages(state.samples);
    const best=ranked.slice(0,5),avoid=ranked.slice().reverse().slice(0,5);
    const cand = state.candidates.filter(c=>!state.session?.symbol || c.symbol===state.session.symbol).slice(0,8);
    $('panel-best').innerHTML = `
      <div class="card-head"><div><h3>Best / Avoid</h3><small>จัดอันดับ Stage จากข้อมูล OOS; Candidate ที่ผู้ใช้เก็บจะแสดงด้านล่าง</small></div><span class="badge purple">Research only</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>น่าเล่น</th><th class="num">Playability</th><th class="num">Validation</th><th class="num">Holdout</th><th class="num">n</th></tr></thead><tbody>
      ${best.map(x=>`<tr class="clickable" data-best-stage="${esc(x.stage)}"><td>${esc(stageLabel(x.stage))}</td><td class="num play-good">${x.playability.score}</td><td class="num">${p1(x.playability.stats.validation.bestRate)}</td><td class="num">${p1(x.playability.stats.holdout.bestRate)}</td><td class="num">${fmt(x.rows.length)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="table-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>ควรระวัง / หลีกเลี่ยง</th><th class="num">Playability</th><th class="num">Validation</th><th class="num">Holdout</th><th class="num">n</th></tr></thead><tbody>
      ${avoid.map(x=>`<tr class="clickable" data-best-stage="${esc(x.stage)}"><td>${esc(stageLabel(x.stage))}</td><td class="num play-hard">${x.playability.score}</td><td class="num">${p1(x.playability.stats.validation.bestRate)}</td><td class="num">${p1(x.playability.stats.holdout.bestRate)}</td><td class="num">${fmt(x.rows.length)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="candidate-list">${cand.length?cand.map(c=>`<div class="candidate"><b>${esc(c.bestSide||'—')} · Holdout ${p1(c.holdout)} · Playability ${c.playability??'—'}</b><span>${fmt(c.n)} samples · ${esc(c.conditions.map(x=>x.field==='stage'?'Stage='+stageLabel(x.value):x.field+x.op+x.value).join(' · '))}</span></div>`).join(''):'<div class="empty">ยังไม่มี Candidate ที่บันทึกไว้</div>'}</div>
    `;
    $('panel-best').querySelectorAll('[data-best-stage]').forEach(el=>el.addEventListener('click',()=>setStage(el.dataset.bestStage)));
  }

  function updateInspector(rows) {
    const s=CORE()?.bySplit?.(rows || []);
    const play=CORE()?.playability?.(rows || []);
    $('sample-count-badge').textContent=fmt(rows?.length || 0)+' samples';
    if (!s || !play || !rows?.length) {
      $('play-hero').className='play-hero';
      $('play-hero').innerHTML='<small>PLAYABILITY</small><strong>—</strong><span>รอ Dataset</span>';
      for (const id of ['kpi-high','kpi-low','kpi-side','kpi-hold','split-train','split-val','split-hold']) $(id).textContent='—';
      $('integrity-box').innerHTML='';
      return;
    }
    $('play-hero').className='play-hero '+(play.level||'');
    $('play-hero').innerHTML=`<small>PLAYABILITY</small><strong>${play.score==null?'—':play.score+'/100'}</strong><span>${esc(play.label)}</span>`;
    $('kpi-high').textContent=p1(s.all.highRate);$('kpi-high-n').textContent=fmt(s.all.high)+' wins';
    $('kpi-low').textContent=p1(s.all.lowRate);$('kpi-low-n').textContent=fmt(s.all.low)+' wins';
    $('kpi-side').textContent=s.all.bestSide||'—';
    $('kpi-hold').textContent=p1(s.holdout.bestRate);$('kpi-hold-n').textContent=fmt(s.holdout.decided)+' decided';
    $('split-train').textContent=p1(s.train.bestRate);$('split-train-n').textContent=fmt(s.train.decided)+' samples';
    $('split-val').textContent=p1(s.validation.bestRate);$('split-val-n').textContent=fmt(s.validation.decided)+' samples';
    $('split-hold').textContent=p1(s.holdout.bestRate);$('split-hold-n').textContent=fmt(s.holdout.decided)+' samples';

    const audit=CORE().auditDataset(state.samples);
    $('integrity-box').innerHTML = audit.issues.length
      ? audit.issues.map(x=>`<div class="integrity-row"><span>${esc(x.text)}</span><b class="fail">${fmt(x.count)}</b></div>`).join('')
      : '<div class="integrity-row"><span>Dataset integrity</span><b class="ok">PASS</b></div>';
  }

  function chooseSampleRows(rows) {
    state.sampleRows = (rows || []).slice();
    state.sampleCursor = 0;
    state.reveal = false;
  }

  function ensureChart() {
    if (state.chart || !globalThis.LightweightCharts) return;
    const host=$('chart');
    state.chart=LightweightCharts.createChart(host,{
      width:host.clientWidth,height:host.clientHeight,
      layout:{background:{type:'solid',color:'#071018'},textColor:'#7890a8',fontSize:10},
      grid:{vertLines:{color:'#112333'},horzLines:{color:'#112333'}},
      rightPriceScale:{borderColor:'#20374d'},timeScale:{borderColor:'#20374d',timeVisible:true,secondsVisible:false},
      crosshair:{mode:0}
    });
    if (state.chart.addSeries && LightweightCharts.CandlestickSeries) {
      state.series=state.chart.addSeries(LightweightCharts.CandlestickSeries,{
        upColor:'#4bc99b',downColor:'#d86f88',borderUpColor:'#4bc99b',borderDownColor:'#d86f88',wickUpColor:'#4bc99b',wickDownColor:'#d86f88'
      });
    } else {
      state.series=state.chart.addCandlestickSeries({
        upColor:'#4bc99b',downColor:'#d86f88',borderUpColor:'#4bc99b',borderDownColor:'#d86f88',wickUpColor:'#4bc99b',wickDownColor:'#d86f88'
      });
    }
    new ResizeObserver(()=>state.chart?.applyOptions({width:host.clientWidth,height:host.clientHeight})).observe(host);
  }

  function renderSample() {
    ensureChart();
    const rows=state.sampleRows;
    if (!rows.length || !state.series) {
      $('chart-empty').style.display='grid';
      $('sample-title').textContent='ยังไม่มี Sample';
      $('sample-detail').textContent='เลือก Stage หรือ Combination ที่มีข้อมูล';
      return;
    }
    $('chart-empty').style.display='none';
    state.sampleCursor=Math.max(0,Math.min(rows.length-1,state.sampleCursor));
    const s=rows[state.sampleCursor];
    const i=s.barIndex;
    const from=Math.max(0,i-55);
    const to=Math.min(state.bars.length-1,i+(state.reveal?10:0));
    const data=state.bars.slice(from,to+1).map(b=>({
      time:Math.floor(Number(b.time)/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)
    }));
    state.series.setData(data);
    if (state.priceLine) {
      try { state.series.removePriceLine(state.priceLine); } catch {}
    }
    state.priceLine=state.series.createPriceLine({price:s.entryPrice,color:'#9a82ff',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'T0'});
    state.chart.timeScale().fitContent();

    $('chart-title').textContent=stageLabel(s.stage)+' · '+(state.sampleCursor+1)+' / '+rows.length;
    $('chart-meta').textContent=new Date(s.entryTime).toLocaleString('th-TH')+' · Entry '+n2(s.entryPrice);
    $('sample-title').textContent='T0 · '+stageLabel(s.stage)+' · '+s.split;
    $('sample-detail').textContent=state.reveal
      ? `T+10 = ${s.outcome} · Settlement ${n2(s.settlementPrice)} · Δ ${n2(s.deltaAtr)} ATR`
      : 'อนาคต T+1…T+10 ถูกซ่อนอยู่ · Feature ใช้ข้อมูลถึง T0 เท่านั้น';
    $('reveal-badge').textContent=state.reveal ? 'T+10 '+s.outcome : 'Future ซ่อนอยู่';
    $('reveal-badge').className='badge '+(state.reveal?(s.outcome==='HIGH'?'good':s.outcome==='LOW'?'bad':'warn'):'');
    $('sample-reveal').textContent=state.reveal?'ซ่อนอนาคต':'Reveal T+10';
  }

  function moveSample(delta) {
    if (!state.sampleRows.length) return;
    state.sampleCursor=(state.sampleCursor+delta+state.sampleRows.length)%state.sampleRows.length;
    state.reveal=false;
    renderSample();
  }

  function exportResearch() {
    if (!state.samples.length) return;
    const groups=CORE().groupByStage(state.samples).map(g=>({
      stage:g.stage,n:g.rows.length,playability:g.playability.score,label:g.playability.label,
      train:g.summary.train,validation:g.summary.validation,holdout:g.summary.holdout
    }));
    const payload={
      schema:'aris-training2-research-export-v1',
      exportedAt:new Date().toISOString(),
      purpose:'Exact T+10 market predictability research; no live mutation',
      session:{id:state.session?.id,datasetId:state.session?.datasetId,symbol:state.session?.symbol,interval:'1m',analysisStart:state.session?.analysisStart,analysisEnd:state.session?.analysisEnd},
      horizonMinutes:10,
      counts:{bars:state.bars.length,samples:state.samples.length},
      integrity:CORE().auditDataset(state.samples),
      stages:groups,
      candidates:state.candidates
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='ARIS-Training2-'+(state.session?.symbol||'MARKET')+'-'+Date.now()+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }

  function bindTabs() {
    $('tabs').querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
      $('tabs').querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+btn.dataset.tab));
    }));
  }

  function bind() {
    $('go-chart').addEventListener('click',()=>location.href='index.html');
    $('go-train1').addEventListener('click',()=>location.href='training.html');
    $('market').innerHTML=MARKETS.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('');
    $('bar-count').addEventListener('change',syncStartFromBarCount);
    $('end-time').addEventListener('change',syncStartFromBarCount);
    $('download-data').addEventListener('click',downloadData);
    $('cancel-download').addEventListener('click',()=>state.controller?.abort?.());
    $('refresh-sessions').addEventListener('click',refreshSessions);
    $('use-session').addEventListener('click',useSelectedSession);
    $('build-dataset').addEventListener('click',buildDataset);
    $('export-research').addEventListener('click',exportResearch);
    $('clear-stage').addEventListener('click',()=>setStage(null));
    $('feature-stage').addEventListener('change',renderFeatureExplorer);
    $('feature-key').addEventListener('change',renderFeatureExplorer);
    $('refresh-feature').addEventListener('click',renderFeatureExplorer);
    $('combo-add').addEventListener('click',()=>addComboFilter());
    $('combo-run').addEventListener('click',runCombo);
    $('combo-save-a').addEventListener('click',saveCompareA);
    $('combo-save-candidate').addEventListener('click',saveCandidate);
    $('combo-stage').addEventListener('change',runCombo);
    $('sample-prev').addEventListener('click',()=>moveSample(-1));
    $('sample-next').addEventListener('click',()=>moveSample(1));
    $('sample-reveal').addEventListener('click',()=>{state.reveal=!state.reveal;renderSample();});
    bindTabs();
  }

  async function init() {
    if (!HD() || !CORE()) {
      alert('Training 2 โหลดโมดูลไม่ครบค่ะ');
      return;
    }
    initTimeRange();
    bind();
    await refreshSessions();
    resetPanels();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
