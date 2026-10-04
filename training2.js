(() => {
  'use strict';

  const CORE=()=>globalThis.Training2Core;
  const HD=()=>globalThis.HistoricalDataV1;
  const MINUTE=60_000;
  const MARKETS=[['BTCUSDT','BTC'],['XAUUSDT','XAU'],['SKHYUSDT','SKHY'],['AMDUSDT','AMD'],['INTCUSDT','INTEL'],['NVDAUSDT','NVDA'],['OPENAIUSDT','OPENAI']];

  const state={
    session:null,bars:[],samples:[],groups:[],allResearch:null,stage:null,
    sampleRows:[],sampleCursor:0,reveal:false,overlay:false,
    chart:null,series:null,priceLine:null,controller:null,compareA:null,
    candidates:loadCandidates(),holdoutTests:loadHoldoutTests(),featureRankCache:new Map(),comboTimer:null
  };

  const $=id=>document.getElementById(id);
  const fmt=n=>Number(n||0).toLocaleString('en-US');
  const p1=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
  const n2=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dtLocal=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
  const parseLocal=v=>{const t=new Date(v).getTime();return Number.isFinite(t)?t:null;};
  const marketLabel=symbol=>MARKETS.find(x=>x[0]===symbol)?.[1]||String(symbol||'').replace(/USDT$/,'');
  const stageLabel=stage=>({
    TREND_EARLY:'Trend Early',TREND_HEALTHY:'Trend Healthy',TREND_ACCELERATING:'Trend Accelerating',
    TREND_MATURE:'Trend Mature',TREND_EXTENDED:'Trend Extended',PULLBACK:'Pullback',
    SIDEWAY_STABLE:'Sideway Stable',SIDEWAY_EDGE:'Sideway Edge',SIDEWAY_HIGH_VOLUME:'Sideway High Volume',
    SIDEWAY_CHOP:'Sideway Chop',COMPRESSION:'Compression',BREAKOUT_ATTEMPT:'Breakout Attempt',
    BREAKOUT_ACCEPTED:'Breakout Accepted',FAILED_BREAKOUT:'Failed Breakout',EXHAUSTION:'Exhaustion',
    REVERSAL_DEVELOPING:'Reversal Developing',SHOCK_UNRESOLVED:'Shock / Random Expansion',TRANSITION:'Transition'
  })[stage]||stage||'ALL MARKET';

  function setBadge(el,text,type=''){if(!el)return;el.textContent=text;el.className='badge'+(type?' '+type:'');}
  function loadCandidates(){try{const x=JSON.parse(localStorage.getItem('aris-training2-candidates-v2')||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
  function saveCandidates(){try{localStorage.setItem('aris-training2-candidates-v2',JSON.stringify(state.candidates.slice(0,40)));}catch{}}
  function loadHoldoutTests(){try{const x=JSON.parse(localStorage.getItem('aris-training2-final-holdout-v1')||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
  function saveHoldoutTests(){try{localStorage.setItem('aris-training2-final-holdout-v1',JSON.stringify(state.holdoutTests.slice(0,200)));}catch{}}
  function developmentRows(rows){return (rows||[]).filter(x=>x.split==='TRAIN'||x.split==='VALIDATION');}
  function setupFingerprint(stage,conditions,direction){
    const normalized=(conditions||[]).map(c=>({field:c.field,op:c.op,value:Number(c.value)})).sort((a,b)=>(a.field+a.op+a.value).localeCompare(b.field+b.op+b.value));
    const raw=JSON.stringify({schema:'training2-final-v1',stage:stage||'ALL',direction:direction||null,conditions:normalized});
    let h=2166136261;
    for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(16).padStart(8,'0');
  }
  function holdoutStateFor(group){
    const c=group?.research?.candidate,d=group?.decision||decisionFor(group?.playability);
    if(!c?.evaluation||!c.direction||!d?.showDirection)return {status:'NOT_READY',label:'ยังไม่พร้อมสอบ',record:null};
    const datasetId=state.session?.datasetId||state.session?.id||'unknown';
    const fingerprint=setupFingerprint(group.stage,c.conditions,c.direction);
    const sameScope=state.holdoutTests.filter(x=>x.datasetId===datasetId&&x.stage===group.stage);
    const current=sameScope.find(x=>x.fingerprint===fingerprint);
    if(current)return {status:'TESTED',label:current.result?.verdict?.label||'TESTED',record:current,fingerprint};
    if(sameScope.length)return {status:'INVALIDATED',label:'INVALIDATED · สูตรเปลี่ยนหลังเคยเปิด Holdout',record:null,fingerprint};
    return {status:'LOCKED',label:'🔒 LOCKED · ยังไม่เปิด Holdout',record:null,fingerprint};
  }
  function holdoutText(group){
    const h=holdoutStateFor(group);
    if(h.status==='TESTED'){
      const r=h.record?.result;
      return `${r?.verdict?.label||'TESTED'} · ${p1(r?.holdout?.winRate)} · n=${fmt(r?.holdout?.n||0)}`;
    }
    return h.label;
  }
  function runAutoHoldout(stage){
    const group=state.groups.find(x=>x.stage===stage);
    if(!group)return;
    const h=holdoutStateFor(group),c=group.research?.candidate;
    if(h.status==='TESTED'){alert('Setup นี้สอบ Final Holdout แล้วค่ะ');return;}
    if(h.status==='INVALIDATED'){alert('Holdout เดิมถูกเปิดไปแล้วและ Setup เปลี่ยนค่ะ ต้องใช้ Dataset/ช่วงเวลาใหม่เป็น Final Holdout');return;}
    if(h.status!=='LOCKED'||!c?.evaluation){alert('Setup นี้ยังไม่พร้อมสอบ Holdout ค่ะ');return;}
    const result=CORE().runFinalHoldout(state.samples,c.conditions,c.direction,c.evaluation.validation);
    const record={id:'HOLD-'+Date.now(),datasetId:state.session?.datasetId||state.session?.id||'unknown',sessionId:state.session?.id||null,stage:group.stage,fingerprint:h.fingerprint,conditions:c.conditions,direction:c.direction,testedAt:Date.now(),result};
    state.holdoutTests.unshift(record);saveHoldoutTests();
    renderMarketPanel();renderPlayability();renderBest();updateInspector(activeRows());
  }
  function intervalMs(){return CORE()?.intervalMs?.($('interval')?.value||'1m')||MINUTE;}
  function conditionText(conditions=[]){
    if(!conditions.length)return 'Baseline ของ Stage · ไม่มี filter เพิ่ม';
    return conditions.map(c=>c.field==='stage'?'Stage = '+stageLabel(c.value):`${CORE().featureMeta.find(x=>x.key===c.field)?.label||c.field} ${c.op} ${Number(c.value).toFixed(3)}`).join(' · ');
  }
  function stabilityLabel(v){
    if(!Number.isFinite(v))return '—';
    if(v>=.8)return 'A';
    if(v>=.6)return 'B';
    if(v>=.4)return 'C';
    return 'D';
  }

  function decisionFor(playability){return CORE().researchDecision(playability);}
  function visibleDirection(direction,playability){
    const d=decisionFor(playability);
    return d.showDirection?(direction||'—'):'NO EDGE';
  }
  function candidateRowsFor(group){
    const c=group?.research?.candidate;
    if(!c)return [];
    return developmentRows(CORE().applyConditions(group.rows,c.conditions||[]));
  }
  function openAutoCandidate(stage){
    const group=state.groups.find(x=>x.stage===stage);
    if(!group?.research?.candidate)return;
    setStage(stage);
    const rows=candidateRowsFor(group),c=group.research.candidate;
    chooseSampleRows(rows);
    renderSample();
    updateInspector(rows,{rows,direction:c.direction,evaluation:c.evaluation,playability:group.playability,conditions:c.conditions});
    $('chart')?.scrollIntoView?.({behavior:'smooth',block:'center'});
  }
  function scheduleCombo(){
    if(!state.samples.length)return;
    clearTimeout(state.comboTimer);
    state.comboTimer=setTimeout(()=>runCombo(),120);
  }

  function initTimeRange(){
    const tf=$('interval')?.value||'1m',step=CORE().intervalMs(tf)||MINUTE;
    const end=HD()?.lastClosedOpenTime?.(tf)??(Date.now()-step);
    const bars=Number($('bar-count')?.value||10000);
    $('end-time').value=dtLocal(end);
    $('start-time').value=dtLocal(end-Math.max(1,bars-1)*step);
  }
  function syncStartFromBarCount(){
    const step=intervalMs(),end=parseLocal($('end-time').value)??(Date.now()-step);
    $('start-time').value=dtLocal(end-Math.max(1,Number($('bar-count').value||10000)-1)*step);
  }

  async function refreshSessions(){
    const select=$('session-select');if(!select||!HD())return;
    const tf=$('interval').value;
    const rows=await HD().listSessions(80);
    const eligible=rows.filter(x=>x.interval===tf&&x.datasetId&&Number(x.loadedBars||0)>0);
    select.innerHTML=eligible.length
      ?eligible.map(s=>`<option value="${esc(s.id)}">${esc(marketLabel(s.symbol))} · ${esc(s.interval)} · ${fmt(s.requestedAnalysisBars||s.loadedBars)} bars · ${esc(s.status||'')}</option>`).join('')
      :`<option value="">ยังไม่มี Historical Session ${esc(tf)}</option>`;
  }

  function showQuality(session){
    const q=session?.quality||{};
    $('quality-grade').textContent=q.grade||'—';
    $('quality-missing').textContent=Number.isFinite(Number(q.missing))?fmt(q.missing):'—';
    $('quality-duplicates').textContent=Number.isFinite(Number(q.duplicates))?fmt(q.duplicates):'—';
    $('quality-invalid').textContent=Number.isFinite(Number(q.invalid))?fmt(q.invalid):'—';
    $('quality-coverage').textContent=Number.isFinite(Number(q.extendedCoverage))?(Number(q.extendedCoverage)*100).toFixed(1)+'%':'—';
  }

  async function downloadData(){
    if(!HD())return alert('HistoricalDataV1 ยังไม่พร้อมค่ะ');
    const symbol=$('market').value,interval=$('interval').value;
    const startTime=parseLocal($('start-time').value),endTime=parseLocal($('end-time').value);
    if(!Number.isFinite(startTime)||!Number.isFinite(endTime)||endTime<=startTime)return alert('ช่วงเวลาไม่ถูกต้องค่ะ');
    state.controller?.abort?.();state.controller=new AbortController();
    $('download-data').disabled=true;$('build-dataset').disabled=true;$('cancel-download').hidden=false;$('progress').classList.add('show');setBadge($('data-status'),'กำลังโหลด','warn');
    try{
      const session=await HD().downloadDataset({
        symbol,interval,startTime,endTime,warmupBars:160,signal:state.controller.signal,
        engineMeta:{engineVersion:'TRAINING-2-RESEARCH',engineBlobSha:'training2-core-v2',auditSchema:null},
        onProgress:p=>{const pc=Math.max(0,Math.min(100,Number(p.progress||0)*100));$('progress-bar').style.width=pc.toFixed(1)+'%';$('progress-left').textContent=fmt(p.loadedBars)+' / '+fmt(p.expectedBars)+' bars';$('progress-right').textContent=pc.toFixed(1)+'%';}
      });
      await loadSession(session.id);await refreshSessions();setBadge($('data-status'),'ข้อมูลพร้อม','good');
    }catch(err){
      if(err?.name==='AbortError')setBadge($('data-status'),'ยกเลิกแล้ว','warn');
      else{console.error(err);setBadge($('data-status'),'โหลดไม่สำเร็จ','bad');alert('โหลดข้อมูลไม่สำเร็จ: '+String(err?.message||err));}
    }finally{$('download-data').disabled=false;$('cancel-download').hidden=true;state.controller=null;}
  }

  async function loadSession(id){
    if(!id||!HD())return;
    const session=await HD().getSession(id);if(!session)throw new Error('ไม่พบ Session');
    if(!CORE().supportedIntervals.includes(session.interval))throw new Error('Training 2 รองรับ 1m / 5m / 10m เท่านั้น');
    const bars=await HD().getDatasetBars(session.datasetId);
    state.session=session;state.bars=bars;state.samples=[];state.groups=[];state.allResearch=null;state.stage=null;state.sampleRows=[];state.sampleCursor=0;state.reveal=false;state.featureRankCache=new Map();state.compareA=null;
    $('market').value=session.symbol||'BTCUSDT';$('interval').value=session.interval||'1m';
    $('start-time').value=dtLocal(session.analysisStart);$('end-time').value=dtLocal(session.analysisEnd);
    $('mini-market').textContent=marketLabel(session.symbol)+' · '+session.interval;$('mini-bars').textContent=fmt(bars.length);$('mini-samples').textContent='—';$('mini-integrity').textContent='—';
    $('build-dataset').disabled=bars.length<100;$('export-research').disabled=true;
    showQuality(session);setBadge($('data-status'),session.quality?.grade?'Data '+session.quality.grade:'ข้อมูลพร้อม',session.quality?.grade==='C'?'bad':'good');
    resetPanels();renderRawPreview();
  }
  async function useSelectedSession(){const id=$('session-select').value;if(!id)return;try{await loadSession(id);}catch(e){alert(String(e?.message||e));}}

  async function buildDataset(){
    if(!state.bars.length||!CORE())return;
    $('build-dataset').disabled=true;$('progress').classList.add('show');setBadge($('data-status'),'กำลังสร้าง Samples + ค้น Edge','warn');$('progress-bar').style.width='0%';
    try{
      const result=await CORE().buildSamples(state.bars,{
        interval:state.session?.interval||$('interval').value,
        analysisStart:state.session?.analysisStart,analysisEnd:state.session?.analysisEnd,
        onProgress:p=>{const max=Math.max(1,p.total||state.bars.length),pc=Math.max(0,Math.min(100,(p.scanned||0)/max*100));$('progress-bar').style.width=pc.toFixed(1)+'%';$('progress-left').textContent='Samples '+fmt(p.built||0);$('progress-right').textContent=pc.toFixed(1)+'%';}
      });
      state.bars=result.bars;state.samples=result.samples;state.featureRankCache=new Map();state.compareA=null;
      setBadge($('data-status'),'กำลังค้น Best Conditions','warn');
      await new Promise(r=>setTimeout(r,0));
      state.groups=CORE().groupByStage(state.samples);
      state.allResearch=CORE().researchStage(state.samples);
      const audit=CORE().auditDataset(state.samples);
      $('mini-samples').textContent=fmt(state.samples.length);$('mini-integrity').textContent=audit.ok?'PASS':'FAIL';$('mini-integrity').style.color=audit.ok?'var(--green)':'var(--red)';
      $('export-research').disabled=false;setBadge($('data-status'),'Dataset + Research พร้อม','good');
      renderAll();chooseSampleRows(state.samples);renderSample();
    }catch(err){console.error(err);setBadge($('data-status'),'สร้างไม่สำเร็จ','bad');alert('สร้าง Training Dataset ไม่สำเร็จ: '+String(err?.message||err));}
    finally{$('build-dataset').disabled=false;}
  }

  function resetPanels(){
    $('stage-list').innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    for(const id of ['panel-market','panel-playability','feature-results','panel-outcome','panel-split','panel-best'])$(id).innerHTML='<div class="empty">สร้าง Dataset ก่อนค่ะ</div>';
    $('combo-results').innerHTML='<div class="empty">เลือกเงื่อนไขแล้วกดคำนวณ</div>';$('combo-compare').innerHTML='';updateInspector([]);
  }
  function activeRows(){return state.stage?state.samples.filter(x=>x.stage===state.stage):state.samples;}
  function activeResearch(){return state.stage?state.groups.find(x=>x.stage===state.stage)?.research:state.allResearch;}

  function setStage(stage){
    state.stage=stage||null;document.querySelectorAll('.stage-item').forEach(el=>el.classList.toggle('active',(el.dataset.stage||'')===(state.stage||'')));
    $('inspector-stage').textContent=stageLabel(state.stage);syncStageSelects();renderMarketPanel();renderPlayability();renderFeatureExplorer();renderOutcome();renderBest();updateInspector(activeRows());chooseSampleRows(activeRows());renderSample();
  }

  function renderAll(){renderStageList();populateFeatureControls();syncStageSelects();renderMarketPanel();renderPlayability();renderFeatureExplorer();renderComboFilters();renderComboResults(CORE().evaluateConditionSet(state.samples,[]));renderOutcome();renderSplit();renderBest();updateInspector(activeRows());}

  function renderStageList(){
    const total=state.samples.length;
    $('stage-list').innerHTML=state.groups.map(g=>`<div class="stage-item" data-stage="${esc(g.stage)}"><div><strong>${esc(stageLabel(g.stage))}</strong><small>${fmt(g.rows.length)} samples · ${(g.rows.length/total*100).toFixed(1)}%</small></div><div class="stage-score ${esc(g.playability.level||'')}">${g.playability.score==null?'—':g.playability.score}</div></div>`).join('');
    $('stage-list').querySelectorAll('.stage-item').forEach(el=>el.addEventListener('click',()=>setStage(el.dataset.stage)));
  }

  function summaryTable(rows){
    const s=CORE().bySplit(rows),line=(name,x)=>`<tr><td>${name}</td><td class="num">${fmt(x.decided)}</td><td class="num">${p1(x.highRate)}</td><td class="num">${p1(x.lowRate)}</td></tr>`;
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>ชุดข้อมูล</th><th class="num">n</th><th class="num">HIGH</th><th class="num">LOW</th></tr></thead><tbody>${line('ทั้งหมด',s.all)}${line('Train',s.train)}${line('Validation',s.validation)}${line('Holdout',s.holdout)}</tbody></table></div>`;
  }
  function candidateTable(research){
    const c=research?.candidate;if(!c||!c.evaluation)return '<div class="empty">ข้อมูลของ Stage นี้ยังไม่พอค้น Candidate</div>';
    const e=c.evaluation,p=research.playability,d=research.decision||decisionFor(p),dir=d.showDirection?c.direction:'NO EDGE';
    return `<div class="method-note"><b>Status:</b> ${esc(d.label)} · <b>Best tested condition:</b> ${esc(conditionText(c.conditions))} · <b>Direction:</b> ${esc(dir)} <button type="button" class="btn secondary" data-view-current-candidate style="min-height:26px;margin-left:6px">ดูสูตรบนกราฟ</button></div><div class="table-wrap"><table class="tbl"><thead><tr><th>ชุด</th><th class="num">n</th><th class="num">Win rate ของทิศที่ล็อกจาก Train</th></tr></thead><tbody><tr><td>TRAIN</td><td class="num">${fmt(e.train.n)}</td><td class="num">${p1(e.train.winRate)}</td></tr><tr><td>VALIDATION</td><td class="num">${fmt(e.validation.n)}</td><td class="num">${p1(e.validation.winRate)}</td></tr><tr><td>HOLDOUT</td><td class="num">${fmt(e.holdout.n)}</td><td class="num">${p1(e.holdout.winRate)}</td></tr></tbody></table></div>`;
  }

  function renderMarketPanel(){
    const rows=activeRows();
    if(state.stage){
      $('panel-market').innerHTML=`<div class="card-head"><div><h3>${esc(stageLabel(state.stage))}</h3><small>Outcome ดิบของ Stage + Candidate ที่ค้นจาก Train</small></div><span class="badge">${fmt(rows.length)} samples</span></div>${summaryTable(rows)}${candidateTable(activeResearch())}`;
      $('panel-market').querySelector('[data-view-current-candidate]')?.addEventListener('click',()=>openAutoCandidate(state.stage));
      return;
    }
    $('panel-market').innerHTML=`<div class="card-head"><div><h3>Market Map</h3><small>Stage ของ 10,000 แท่งและผล T+10 ดิบ</small></div><span class="badge">${fmt(rows.length)} samples</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Stage</th><th class="num">Samples</th><th class="num">%</th><th class="num">HIGH</th><th class="num">LOW</th><th class="num">Playability</th></tr></thead><tbody>${state.groups.map(g=>`<tr class="clickable" data-stage-row="${esc(g.stage)}"><td>${esc(stageLabel(g.stage))}</td><td class="num">${fmt(g.rows.length)}</td><td class="num">${(g.rows.length/rows.length*100).toFixed(1)}%</td><td class="num">${p1(g.summary.all.highRate)}</td><td class="num">${p1(g.summary.all.lowRate)}</td><td class="num">${g.playability.score==null?'—':g.playability.score}</td></tr>`).join('')}</tbody></table></div>`;
    $('panel-market').querySelectorAll('[data-stage-row]').forEach(el=>el.addEventListener('click',()=>setStage(el.dataset.stageRow)));
  }

  function renderPlayability(){
    $('panel-playability').innerHTML=`<div class="card-head"><div><h3>Playability Map</h3><small>ค้น Condition จาก Train เท่านั้น แล้วล็อก Condition + Direction เดิมไปสอบ Validation/Holdout</small></div><span class="badge purple">PLAYABILITY ≠ DIRECTION</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Stage</th><th>Status</th><th>Best tested condition</th><th>Direction</th><th class="num">Score</th><th class="num">Stability</th><th class="num">Validation</th><th class="num">Holdout</th><th></th></tr></thead><tbody>${state.groups.map(g=>{const c=g.research.candidate,e=c?.evaluation,p=g.playability,d=g.decision||decisionFor(p),cls=p.level==='good'?'play-good':p.level==='watch'?'play-watch':p.level==='hard'?'play-hard':'';return `<tr><td>${esc(stageLabel(g.stage))}</td><td class="${cls}">${esc(d.label)}</td><td>${esc(conditionText(c?.conditions||[]))}</td><td>${esc(d.showDirection?(c?.direction||'—'):'NO EDGE')}</td><td class="num ${cls}">${p.score==null?'—':p.score}</td><td class="num">${stabilityLabel(p.stability)}</td><td class="num">${p1(e?.validation?.winRate)}</td><td class="num">${p1(e?.holdout?.winRate)}</td><td><button type="button" class="btn secondary" data-view-candidate="${esc(g.stage)}" style="min-height:25px">ดูบนกราฟ</button></td></tr>`;}).join('')}</tbody></table></div><div class="method-note">โซนแดงจะแสดง <b>NO EDGE</b> แม้ Train จะหา Direction ที่ดีที่สุดได้ เพราะข้อมูลใหม่ยังไม่พิสูจน์ว่าควรเล่นค่ะ</div>`;
    $('panel-playability').querySelectorAll('[data-view-candidate]').forEach(btn=>btn.addEventListener('click',()=>openAutoCandidate(btn.dataset.viewCandidate)));
  }

  function populateFeatureControls(){
    const stages=['<option value="">ALL MARKET</option>'].concat(state.groups.map(g=>`<option value="${esc(g.stage)}">${esc(stageLabel(g.stage))}</option>`));
    $('feature-stage').innerHTML=stages.join('');$('combo-stage').innerHTML=stages.join('');
    $('feature-key').innerHTML=CORE().featureMeta.map(f=>`<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('');
  }
  function syncStageSelects(){if($('feature-stage'))$('feature-stage').value=state.stage||'';if($('combo-stage'))$('combo-stage').value=state.stage||'';}

  function renderFeatureExplorer(){
    if(!state.samples.length)return;
    const stage=$('feature-stage')?$('feature-stage').value:(state.stage||''),key=$('feature-key')?.value||CORE().featureMeta[0].key;
    const rows=stage?state.samples.filter(x=>x.stage===stage):state.samples,bins=CORE().featureBins(rows,key,5),meta=CORE().featureMeta.find(x=>x.key===key);
    const cacheKey=stage||'__ALL__';
    let ranking=state.featureRankCache.get(cacheKey);
    if(!ranking){ranking=CORE().discoverFeatureUsefulness(rows);state.featureRankCache.set(cacheKey,ranking);}
    const top=ranking.slice(0,10);
    $('feature-results').innerHTML=`<div class="card-head"><div><h3>Feature Usefulness · ${stage?esc(stageLabel(stage)):'ALL MARKET'}</h3><small>แต่ละ Feature เลือก threshold จาก Train ของตัวเอง แล้วสอบบน Validation/Holdout</small></div><span class="badge">${fmt(rows.length)} samples</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Feature</th><th>Best Train rule</th><th>Direction</th><th class="num">Playability</th><th class="num">Validation</th><th class="num">Holdout</th><th></th></tr></thead><tbody>${top.map((x,i)=>`<tr><td>${esc(CORE().featureMeta.find(f=>f.key===x.featureKey)?.label||x.featureKey)}</td><td>${esc(conditionText([x.rule]))}</td><td>${esc(x.decision.showDirection?x.direction:'NO EDGE')}</td><td class="num">${x.playability.score??'—'}</td><td class="num">${p1(x.evaluation.validation.winRate)}</td><td class="num">${p1(x.evaluation.holdout.winRate)}</td><td><button type="button" class="btn secondary" data-feature-view="${i}" style="min-height:25px">ดูบนกราฟ</button></td></tr>`).join('')}</tbody></table></div><div class="card-head" style="margin-top:12px"><div><h3>${esc(meta?.label||key)}</h3><small>Distribution ของ Feature ที่เลือก · ใช้สำรวจข้อมูล ไม่ใช่อนุมัติสูตร</small></div></div><div class="table-wrap"><table class="tbl"><thead><tr><th>ช่วงค่า</th><th class="num">n</th><th class="num">HIGH</th><th class="num">LOW</th><th class="num">Validation HIGH</th><th class="num">Holdout HIGH</th></tr></thead><tbody>${bins.map(b=>`<tr><td>${n2(b.lo)} → ${n2(b.hi)}</td><td class="num">${fmt(b.rows.length)}</td><td class="num">${p1(b.stats.all.highRate)}</td><td class="num">${p1(b.stats.all.lowRate)}</td><td class="num">${p1(b.stats.validation.highRate)}</td><td class="num">${p1(b.stats.holdout.highRate)}</td></tr>`).join('')}</tbody></table></div><div class="method-note">Feature ranking ช่วยตอบว่า Feature ไหน “มีประโยชน์จริง” มากกว่าการให้ผู้ใช้เดาจากตารางเอง โดย threshold ถูกเลือกจาก Train เท่านั้นค่ะ</div>`;
    $('feature-results').querySelectorAll('[data-feature-view]').forEach(btn=>btn.addEventListener('click',()=>{const item=top[Number(btn.dataset.featureView)];if(!item)return;const matched=CORE().applyConditions(rows,[item.rule]);chooseSampleRows(matched);renderSample();updateInspector(matched,{rows:matched,direction:item.direction,evaluation:item.evaluation,playability:item.playability,conditions:[item.rule]});$('chart')?.scrollIntoView?.({behavior:'smooth',block:'center'});}));
  }

  function renderComboFilters(){if(!state.samples.length||$('combo-filters').children.length)return;addComboFilter();}
  function addComboFilter(prefill={}){
    const wrap=document.createElement('div');wrap.className='filter-row';
    const opts=CORE().featureMeta.map(f=>`<option value="${esc(f.key)}" ${prefill.field===f.key?'selected':''}>${esc(f.label)}</option>`).join('');
    wrap.innerHTML=`<select class="combo-field">${opts}</select><select class="combo-op"><option>&gt;</option><option>&gt;=</option><option>&lt;</option><option>&lt;=</option></select><input class="combo-value" inputmode="decimal" placeholder="ค่า" value="${esc(prefill.value??'')}"><button type="button">×</button>`;
    if(prefill.op)wrap.querySelector('.combo-op').value=prefill.op;
    wrap.querySelectorAll('select').forEach(el=>el.addEventListener('change',scheduleCombo));
    wrap.querySelector('.combo-value').addEventListener('input',scheduleCombo);
    wrap.querySelector('button').addEventListener('click',()=>{wrap.remove();scheduleCombo();});
    $('combo-filters').append(wrap);
    if(prefill.value!==undefined)scheduleCombo();
  }

  function currentConditions(){
    const c=[],stage=$('combo-stage').value;if(stage)c.push({field:'stage',op:'=',value:stage});
    $('combo-filters').querySelectorAll('.filter-row').forEach(row=>{const value=row.querySelector('.combo-value').value.trim();if(value!=='')c.push({field:row.querySelector('.combo-field').value,op:row.querySelector('.combo-op').value,value:Number(value)});});
    return c;
  }
  function renderComboResults(result){
    if(!state.samples.length)return;
    const r=result||CORE().evaluateConditionSet(state.samples,currentConditions()),e=r.evaluation,p=r.playability,raw=CORE().stats(r.rows),decision=decisionFor(p);
    const shownDirection=decision.showDirection?(r.direction||'—'):'NO EDGE';
    $('combo-results').innerHTML=`<div class="method-note">${esc(conditionText(r.conditions))} · <b>Status:</b> ${esc(decision.label)}</div><div class="combo-result"><div class="kpi"><span>MATCHING</span><b>${fmt(r.rows.length)}</b><em>samples</em></div><div class="kpi"><span>RAW HIGH</span><b>${p1(raw.highRate)}</b><em>${fmt(raw.high)} cases</em></div><div class="kpi"><span>RAW LOW</span><b>${p1(raw.lowRate)}</b><em>${fmt(raw.low)} cases</em></div><div class="kpi"><span>DIRECTION</span><b>${esc(shownDirection)}</b><em>${decision.showDirection?'ล็อกจาก Train':'ไม่มี Edge ที่ควรใช้'}</em></div><div class="kpi"><span>TRAIN</span><b>${p1(e?.train?.winRate)}</b><em>${fmt(e?.train?.n||0)}</em></div><div class="kpi"><span>VALIDATION</span><b>${p1(e?.validation?.winRate)}</b><em>${fmt(e?.validation?.n||0)}</em></div><div class="kpi"><span>HOLDOUT</span><b>${p1(e?.holdout?.winRate)}</b><em>${fmt(e?.holdout?.n||0)}</em></div></div>`;
    if(state.compareA&&e){
      const a=state.compareA.evaluation,aN=state.compareA.rows.length,bN=r.rows.length,retention=aN?bN/aN:null,delta=bN-aN;
      $('combo-compare').innerHTML=`<div class="card-head" style="margin-top:10px"><div><h3>Compare A vs B</h3><small>ดูทั้ง Accuracy และจำนวน Sample ที่หายไปเมื่อเพิ่มเงื่อนไข</small></div></div><div class="table-wrap"><table class="tbl"><thead><tr><th>ชุด</th><th>Direction</th><th class="num">Matching n</th><th class="num">Train</th><th class="num">Validation</th><th class="num">Holdout</th></tr></thead><tbody><tr><td>A</td><td>${esc(visibleDirection(state.compareA.direction,state.compareA.playability))}</td><td class="num">${fmt(aN)}</td><td class="num">${p1(a.train.winRate)}</td><td class="num">${p1(a.validation.winRate)}</td><td class="num">${p1(a.holdout.winRate)}</td></tr><tr><td>B</td><td>${esc(shownDirection)}</td><td class="num">${fmt(bN)}</td><td class="num">${p1(e.train.winRate)}</td><td class="num">${p1(e.validation.winRate)}</td><td class="num">${p1(e.holdout.winRate)}</td></tr></tbody></table></div><div class="method-note"><b>Coverage change A→B:</b> ${delta>=0?'+':''}${fmt(delta)} samples · Retention ${p1(retention)} ${retention!=null&&retention<.5?'⚠️ เงื่อนไขใหม่ตัด Sample เกินครึ่ง':''}</div>`;
    }else $('combo-compare').innerHTML='';
  }

  function runCombo(){const r=CORE().evaluateConditionSet(state.samples,currentConditions());renderComboResults(r);chooseSampleRows(r.rows);renderSample();updateInspector(r.rows,r);}
  function saveCompareA(){const r=CORE().evaluateConditionSet(state.samples,currentConditions());if(!r.evaluation)return;state.compareA=r;renderComboResults(r);}
  function saveCandidate(){
    const r=CORE().evaluateConditionSet(state.samples,currentConditions());if(!r.evaluation)return;
    const d=decisionFor(r.playability);
    const c={id:'CAND-'+Date.now(),createdAt:Date.now(),symbol:state.session?.symbol,interval:state.session?.interval,conditions:r.conditions,n:r.rows.length,status:d.status,direction:d.showDirection?r.direction:null,internalTrainDirection:r.direction,train:r.evaluation.train.winRate,validation:r.evaluation.validation.winRate,holdout:r.evaluation.holdout.winRate,playability:r.playability?.score};
    state.candidates.unshift(c);saveCandidates();renderBest();
  }

  function renderOutcome(){
    const rows=activeRows(),traj=CORE().trajectorySummary(rows);
    $('panel-outcome').innerHTML=`<div class="card-head"><div><h3>T+10 Outcome Explorer</h3><small>${state.stage?stageLabel(state.stage):'ALL MARKET'} · T+1…T+10 ใช้ดู Outcome เท่านั้น</small></div><span class="badge">${fmt(rows.length)} samples</span></div>${summaryTable(rows)}<div class="table-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>เวลา</th><th class="num">Avg move / ATR</th><th class="num">Median / ATR</th><th class="num">เหนือ Entry</th><th class="num">n</th></tr></thead><tbody>${traj.map(x=>`<tr><td>T+${x.minute}</td><td class="num">${n2(x.avgMoveAtr)}</td><td class="num">${n2(x.medianMoveAtr)}</td><td class="num">${p1(x.positiveRate)}</td><td class="num">${fmt(x.n)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderSplit(){
    const s=CORE().bySplit(state.samples),purge=state.samples.filter(x=>x.split==='PURGE').length,audit=CORE().auditDataset(state.samples);
    $('panel-split').innerHTML=`<div class="card-head"><div><h3>Chronological Split</h3><small>60 / 20 / 20 ตามเวลา + Purge ทุก Sample ที่ Settlement อาจซ้อนข้ามรอยต่อ</small></div><span class="badge ${audit.ok?'good':'bad'}">${audit.ok?'Integrity PASS':'Integrity FAIL'}</span></div><div class="timeline"><div class="train">TRAIN</div><div class="purge"></div><div class="val">VALIDATION</div><div class="purge"></div><div class="hold">HOLDOUT</div></div><div class="split-grid"><div class="split-box"><span>TRAIN</span><b>${fmt(s.train.n)}</b><small>ใช้ค้น Condition</small></div><div class="split-box"><span>VALIDATION</span><b>${fmt(s.validation.n)}</b><small>ไม่ใช้ค้น threshold</small></div><div class="split-box"><span>HOLDOUT</span><b>${fmt(s.holdout.n)}</b><small>สอบรอบท้าย</small></div></div><div class="method-note">Purge ${fmt(purge)} samples · Candidate ภายในแต่ละ Stage ถูกเลือกจาก Train เท่านั้น · Validation/Holdout ใช้ตรวจ ไม่ใช้เลือก threshold และถ้าปรับสูตรตาม Holdout ซ้ำ ๆ ต้องถือว่า Holdout นั้นไม่ untouched แล้วค่ะ</div><div class="integrity">${audit.issues.length?audit.issues.map(x=>`<div class="integrity-row"><span>${esc(x.text)}</span><b class="fail">${fmt(x.count)}</b></div>`).join(''):'<div class="integrity-row"><span>Exact T+10 / T0 cutoff / finite features / no split overlap</span><b class="ok">PASS</b></div>'}</div>`;
  }

  function renderBest(){
    const playable=state.groups.filter(g=>(g.decision||decisionFor(g.playability)).status==='PLAYABLE').sort((a,b)=>b.playability.score-a.playability.score);
    const selective=state.groups.filter(g=>(g.decision||decisionFor(g.playability)).status==='SELECTIVE').sort((a,b)=>b.playability.score-a.playability.score);
    const avoid=state.groups.filter(g=>(g.decision||decisionFor(g.playability)).status==='AVOID').sort((a,b)=>(a.playability.score??999)-(b.playability.score??999));
    const insufficient=state.groups.filter(g=>(g.decision||decisionFor(g.playability)).status==='INSUFFICIENT');
    const saved=state.candidates.filter(c=>(!state.session?.symbol||c.symbol===state.session.symbol)&&(!state.session?.interval||c.interval===state.session.interval)).slice(0,8);
    const rowsHtml=(arr,status)=>arr.length?arr.map(g=>{const c=g.research.candidate,e=c?.evaluation,d=g.decision||decisionFor(g.playability);return `<tr><td>${esc(stageLabel(g.stage))}</td><td>${esc(conditionText(c?.conditions||[]))}</td><td>${esc(d.showDirection?(c?.direction||'—'):'NO EDGE')}</td><td class="num">${g.playability.score??'—'}</td><td class="num">${p1(e?.validation?.winRate)}</td><td class="num">${p1(e?.holdout?.winRate)}</td><td><button type="button" class="btn secondary" data-best-view="${esc(g.stage)}" style="min-height:25px">ดูสูตรบนกราฟ</button></td></tr>`;}).join(''):`<tr><td colspan="7" style="text-align:center;color:var(--muted)">ไม่มี Stage ในกลุ่ม ${esc(status)}</td></tr>`;
    const table=(title,arr,status)=>`<div class="card-head" style="margin-top:10px"><div><h3>${title}</h3><small>${status}</small></div><span class="badge">${arr.length} stages</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Stage</th><th>Best tested condition</th><th>Direction</th><th class="num">Playability</th><th class="num">Validation</th><th class="num">Holdout</th><th></th></tr></thead><tbody>${rowsHtml(arr,status)}</tbody></table></div>`;
    $('panel-best').innerHTML=`<div class="card-head"><div><h3>Best Conditions / Avoid Zones</h3><small>จัดกลุ่มตามเกณฑ์จริง ไม่บังคับให้ต้องมี “สนามน่าเล่น” ถ้าข้อมูลไม่ถึง</small></div><span class="badge purple">≥70 PLAYABLE · 45–69 SELECTIVE · &lt;45 AVOID</span></div>${table('🟢 ตลาดน่าเล่น',playable,'Playability 70–100')}${table('🟡 ตลาดต้องเลือกจังหวะ',selective,'Playability 45–69')}${table('🔴 ตลาดควรหลีกเลี่ยง',avoid,'Playability 0–44 · Direction = NO EDGE')}${table('⚪ ข้อมูลยังไม่พอ',insufficient,'ยังไม่ควรสรุป')}<div class="candidate-list">${saved.length?saved.map(c=>`<div class="candidate"><b>${esc(c.status||'RESEARCH')} · ${esc(c.direction||'NO EDGE')} · Validation ${p1(c.validation)} · Holdout ${p1(c.holdout)} · Playability ${c.playability??'—'}</b><span>${fmt(c.n)} samples · ${esc(conditionText(c.conditions))}</span></div>`).join(''):'<div class="empty">ยังไม่มี Manual Candidate ที่บันทึกไว้</div>'}</div>`;
    $('panel-best').querySelectorAll('[data-best-view]').forEach(btn=>btn.addEventListener('click',()=>openAutoCandidate(btn.dataset.bestView)));
  }

  function updateInspector(rows,manualResult=null){
    $('sample-count-badge').textContent=fmt(rows?.length||0)+' samples';
    if(!rows?.length){
      $('play-hero').className='play-hero';$('play-hero').innerHTML='<small>PLAYABILITY</small><strong>—</strong><span>รอ Dataset</span>';
      for(const id of ['kpi-high','kpi-low','kpi-side','kpi-hold','kpi-stability','kpi-matching','split-train','split-val','split-hold'])$(id).textContent='—';
      $('kpi-high-n').textContent='—';$('kpi-low-n').textContent='—';$('kpi-side-note').textContent='—';$('integrity-box').innerHTML='';return;
    }
    const raw=CORE().stats(rows);
    const research=manualResult||activeResearch(),c=manualResult||research?.candidate,p=manualResult?.playability||research?.playability,e=manualResult?.evaluation||research?.candidate?.evaluation,d=decisionFor(p);
    $('play-hero').className='play-hero '+(p?.level||'');$('play-hero').innerHTML=`<small>PLAYABILITY</small><strong>${p?.score==null?'—':p.score+'/100'}</strong><span>${esc(d.label)}</span>`;
    $('kpi-high').textContent=p1(raw.highRate);$('kpi-high-n').textContent=fmt(raw.high)+' cases';
    $('kpi-low').textContent=p1(raw.lowRate);$('kpi-low-n').textContent=fmt(raw.low)+' cases';
    $('kpi-side').textContent=d.showDirection?(c?.direction||'—'):'NO EDGE';$('kpi-side-note').textContent=d.showDirection?'Direction จาก Train':'งดใช้ Direction';
    $('kpi-hold').textContent=p1(e?.holdout?.winRate);$('kpi-hold-n').textContent=fmt(e?.holdout?.n||0)+' samples';$('kpi-stability').textContent=stabilityLabel(p?.stability);$('kpi-matching').textContent=fmt((e?.train?.n||0)+(e?.validation?.n||0)+(e?.holdout?.n||0));
    $('split-train').textContent=p1(e?.train?.winRate);$('split-train-n').textContent=fmt(e?.train?.n||0)+' matches';$('split-val').textContent=p1(e?.validation?.winRate);$('split-val-n').textContent=fmt(e?.validation?.n||0)+' matches';$('split-hold').textContent=p1(e?.holdout?.winRate);$('split-hold-n').textContent=fmt(e?.holdout?.n||0)+' matches';
    $('candidate-rule').innerHTML='<b>Status:</b> '+esc(d.label)+'<br><b>Best tested condition:</b> '+esc(conditionText(c?.conditions||[]))+'<br><b>Direction:</b> '+esc(d.showDirection?(c?.direction||'—'):'NO EDGE')+(d.showDirection?' · ถูกเลือกจาก Train เท่านั้น':' · ยังไม่มี Edge ที่ควรนำไปเล่น');
    const audit=CORE().auditDataset(state.samples);$('integrity-box').innerHTML=audit.issues.length?audit.issues.map(x=>`<div class="integrity-row"><span>${esc(x.text)}</span><b class="fail">${fmt(x.count)}</b></div>`).join(''):'<div class="integrity-row"><span>Dataset integrity</span><b class="ok">PASS</b></div>';
  }

  function chooseSampleRows(rows){state.sampleRows=(rows||[]).slice();state.sampleCursor=0;state.reveal=false;}
  function ensureChart(){
    if(state.chart||!globalThis.LightweightCharts)return;const host=$('chart');
    state.chart=LightweightCharts.createChart(host,{width:host.clientWidth,height:host.clientHeight,layout:{background:{type:'solid',color:'#071018'},textColor:'#7890a8',fontSize:10},grid:{vertLines:{color:'#112333'},horzLines:{color:'#112333'}},rightPriceScale:{borderColor:'#20374d'},timeScale:{borderColor:'#20374d',timeVisible:true,secondsVisible:false},crosshair:{mode:0}});
    state.series=state.chart.addSeries&&LightweightCharts.CandlestickSeries?state.chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#4bc99b',downColor:'#d86f88',borderUpColor:'#4bc99b',borderDownColor:'#d86f88',wickUpColor:'#4bc99b',wickDownColor:'#d86f88'}):state.chart.addCandlestickSeries({upColor:'#4bc99b',downColor:'#d86f88',borderUpColor:'#4bc99b',borderDownColor:'#d86f88',wickUpColor:'#4bc99b',wickDownColor:'#d86f88'});
    new ResizeObserver(()=>state.chart?.applyOptions({width:host.clientWidth,height:host.clientHeight})).observe(host);
  }
  function chartData(bars){return bars.map(b=>({time:Math.floor(Number(b.time)/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)}));}
  function renderRawPreview(){
    ensureChart();if(!state.series||!state.bars.length)return;
    const slice=state.bars.slice(-Math.min(220,state.bars.length));state.series.setData(chartData(slice));state.chart.timeScale().fitContent();$('chart-empty').style.display='none';$('chart-title').textContent='Historical Preview · '+marketLabel(state.session?.symbol)+' '+(state.session?.interval||'');$('chart-meta').textContent=fmt(state.bars.length)+' bars · ตรวจข้อมูลก่อนสร้าง Dataset';$('sample-title').textContent='Preview ก่อน Train';$('sample-detail').textContent='กราฟนี้ยังไม่แสดง Future label หรือ Candidate';setBadge($('reveal-badge'),'Preview');$('chart-overlay').classList.remove('show');
  }
  function renderOverlay(sample){
    const f=sample?.features;if(!f){$('chart-overlay').classList.remove('show');return;}
    $('chart-overlay').innerHTML=`<b>${esc(stageLabel(sample.stage))}</b><br>EMA gap ${n2(f.emaDistance)} ATR · Momentum3 ${n2(f.momentum3)}<br>Rel.Vol ${n2(f.relativeVolume)} · Vol accel ${n2(f.volumeAcceleration)}<br>Range pos ${n2(f.rangePosition)} · Width ${n2(f.rangeWidthAtr)} ATR<br>Structure ${esc(f.structureState)} · Fib ${n2(f.fibPosition)} · nearest ${n2(f.fibNearest)}<br>5m ${f.htf5Direction??'—'} · 15m ${f.htf15Direction??'—'}`;
    $('chart-overlay').classList.toggle('show',state.overlay);
  }
  function renderSample(){
    ensureChart();const rows=state.sampleRows;
    if(!rows.length||!state.series){if(state.bars.length)renderRawPreview();else $('chart-empty').style.display='grid';return;}
    $('chart-empty').style.display='none';state.sampleCursor=Math.max(0,Math.min(rows.length-1,state.sampleCursor));const s=rows[state.sampleCursor],i=s.barIndex,from=Math.max(0,i-55),to=Math.min(state.bars.length-1,i+(state.reveal?s.horizonSteps:0));
    state.series.setData(chartData(state.bars.slice(from,to+1)));if(state.priceLine){try{state.series.removePriceLine(state.priceLine);}catch{}}
    state.priceLine=state.series.createPriceLine({price:s.entryPrice,color:'#9a82ff',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'T0'});state.chart.timeScale().fitContent();
    $('chart-title').textContent=stageLabel(s.stage)+' · '+(state.sampleCursor+1)+' / '+rows.length;$('chart-meta').textContent=new Date(s.entryTime).toLocaleString('th-TH')+' · Entry '+n2(s.entryPrice);
    $('sample-title').textContent='T0 · '+stageLabel(s.stage)+' · '+s.split;$('sample-detail').textContent=state.reveal?`T+10 = ${s.outcome} · Settlement ${n2(s.settlementPrice)} · Δ ${n2(s.deltaAtr)} ATR`:'Future ถูกซ่อน · Feature cutoff = เวลาปิดแท่ง T0';
    setBadge($('reveal-badge'),state.reveal?'T+10 '+s.outcome:'Future ซ่อนอยู่',state.reveal?(s.outcome==='HIGH'?'good':s.outcome==='LOW'?'bad':'warn'):'');$('sample-reveal').textContent=state.reveal?'ซ่อนอนาคต':'Reveal T+10';renderOverlay(s);
  }
  function moveSample(d){if(!state.sampleRows.length)return;state.sampleCursor=(state.sampleCursor+d+state.sampleRows.length)%state.sampleRows.length;state.reveal=false;renderSample();}

  function exportResearch(){
    if(!state.samples.length)return;
    const payload={schema:'aris-training2-research-export-v2',exportedAt:new Date().toISOString(),purpose:'Exact T+10 research. Conditions selected from Train; Validation/Holdout evaluation only.',session:{id:state.session?.id,datasetId:state.session?.datasetId,symbol:state.session?.symbol,interval:state.session?.interval,analysisStart:state.session?.analysisStart,analysisEnd:state.session?.analysisEnd},counts:{bars:state.bars.length,samples:state.samples.length},integrity:CORE().auditDataset(state.samples),features:CORE().featureMeta,stages:state.groups.map(g=>({stage:g.stage,n:g.rows.length,playability:g.playability,candidate:g.research.candidate})),manualCandidates:state.candidates};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ARIS-Training2-'+(state.session?.symbol||'MARKET')+'-'+Date.now()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }

  function bindTabs(){$('tabs').querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{$('tabs').querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+btn.dataset.tab));}));}
  function bind(){
    $('go-chart').addEventListener('click',()=>location.href='index.html');$('go-train1').addEventListener('click',()=>location.href='training.html');
    $('market').innerHTML=MARKETS.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('');
    $('interval').addEventListener('change',async()=>{initTimeRange();await refreshSessions();});
    $('bar-count').addEventListener('change',syncStartFromBarCount);$('end-time').addEventListener('change',syncStartFromBarCount);
    $('download-data').addEventListener('click',downloadData);$('cancel-download').addEventListener('click',()=>state.controller?.abort?.());$('refresh-sessions').addEventListener('click',refreshSessions);$('use-session').addEventListener('click',useSelectedSession);$('build-dataset').addEventListener('click',buildDataset);$('export-research').addEventListener('click',exportResearch);$('clear-stage').addEventListener('click',()=>setStage(null));
    $('feature-stage').addEventListener('change',renderFeatureExplorer);$('feature-key').addEventListener('change',renderFeatureExplorer);$('refresh-feature').addEventListener('click',renderFeatureExplorer);
    $('combo-add').addEventListener('click',()=>addComboFilter());$('combo-run').addEventListener('click',runCombo);$('combo-save-a').addEventListener('click',saveCompareA);$('combo-save-candidate').addEventListener('click',saveCandidate);$('combo-stage').addEventListener('change',runCombo);
    $('sample-prev').addEventListener('click',()=>moveSample(-1));$('sample-next').addEventListener('click',()=>moveSample(1));$('sample-reveal').addEventListener('click',()=>{state.reveal=!state.reveal;renderSample();});$('toggle-overlay').addEventListener('click',()=>{state.overlay=!state.overlay;renderSample();});
    bindTabs();
  }

  async function init(){
    if(!HD()||!CORE()){alert('Training 2 โหลดโมดูลไม่ครบค่ะ');return;}
    initTimeRange();bind();await refreshSessions();resetPanels();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
