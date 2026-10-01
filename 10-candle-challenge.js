(() => {
  'use strict';
  const SCHEMA='ten-candle-challenge-v2',STORE='aris-ten-candle-challenge-v1',CONTEXT_BARS=100,FUTURE_BARS=10,ENGINE_WARMUP=360,MINUTE=60000;
  const REASONS=['ตามเทรนด์','แนวรับ','แนวต้าน','Breakout','Reject','Fib','ปลายขา','Sideway'];
  let dialog=null,chart=null,series=null,resizeObserver=null,revealTimer=null,onClose=null,session=null,bars=[],round=null,selectedReasons=new Set(),used=new Set(),engineVersion='ARIS-3.0.0',analysisBusy=false;
  let stats=loadStats();
  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const pct=(a,b)=>b?Math.round(a/b*100):0;
  const chartBar=b=>({time:Math.floor(Number(b.time)/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)});
  const outcome=(entry,finish)=>finish>entry?'HIGH':finish<entry?'LOW':'EQUAL';

  function loadStats(){try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');return {played:Number(x.played)||0,correct:Number(x.correct)||0,wrong:Number(x.wrong)||0,skipped:Number(x.skipped)||0,streak:Number(x.streak)||0,bestStreak:Number(x.bestStreak)||0,reasons:x.reasons&&typeof x.reasons==='object'?x.reasons:{}};}catch{return {played:0,correct:0,wrong:0,skipped:0,streak:0,bestStreak:0,reasons:{}};}}
  function saveStats(){try{localStorage.setItem(STORE,JSON.stringify(stats));}catch{}}
  function ensureStyles(){
    if(byId('ten-candle-challenge-style'))return;
    const style=document.createElement('style');style.id='ten-candle-challenge-style';
    style.textContent=[
      '#ten-candle-dialog{width:min(1180px,calc(100vw - 18px));height:min(820px,94vh);padding:0;border:1px solid #34465d;border-radius:18px;background:#08111b;color:#d9e5f3;box-shadow:0 28px 90px #000c}',
      '#ten-candle-dialog::backdrop{background:#02060bd8;backdrop-filter:blur(4px)}',
      '.tc-shell{height:100%;display:grid;grid-template-rows:auto auto 1fr;background:radial-gradient(circle at 84% 0,rgba(117,92,202,.13),transparent 34%),#08111b}',
      '.tc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid #243449;background:#0c1724}',
      '.tc-title small{display:block;color:#8f7ce6;font:700 7px/1.2 Segoe UI,sans-serif;letter-spacing:.8px}.tc-title h2{margin:4px 0 0;font:650 17px/1.2 IBM Plex Sans Thai,Segoe UI,sans-serif;color:#eef5ff}',
      '.tc-head-actions{display:flex;gap:7px}.tc-head-actions button{min-height:31px;border:1px solid #35475c;border-radius:8px;background:#101d2a;color:#9fb2c8;padding:0 11px;font-size:8px}.tc-head-actions .tc-back{border-color:#5b4f91;background:#201a38;color:#d8d0ff}',
      '.tc-scorebar{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;padding:8px 12px;border-bottom:1px solid #1f2d3d;background:#09131e}.tc-stat{padding:7px 8px;border:1px solid #26384c;border-radius:9px;background:#0d1926}.tc-stat span{display:block;font-size:6px;color:#70869f}.tc-stat b{display:block;margin-top:2px;font-size:11px;color:#c8d8e9}',
      '.tc-body{min-height:0;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(290px,.65fr);gap:10px;padding:10px}.tc-chart-card,.tc-panel{min-height:0;border:1px solid #26384d;border-radius:12px;background:#0b1622;overflow:hidden}',
      '.tc-chart-card{display:grid;grid-template-rows:auto 1fr auto}.tc-chart-meta{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #203044}.tc-chart-meta b{font-size:9px}.tc-chart-meta span{font-size:7px;color:#7e92a9}#tc-chart{min-height:430px}.tc-chart-foot{display:flex;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid #203044;font-size:7px;color:#71869e}.tc-chart-foot b{color:#b9cadb}',
      '.tc-panel{padding:12px;overflow:auto}.tc-question-kicker{font:700 7px/1 Segoe UI,sans-serif;letter-spacing:.8px;color:#8f7ce6}.tc-question h3{margin:6px 0 4px;font:650 17px/1.35 IBM Plex Sans Thai,Segoe UI,sans-serif;color:#edf5ff}.tc-question p{margin:0;color:#7f93aa;font-size:8px;line-height:1.5}',
      '.tc-entry-price{margin:10px 0;padding:10px;border:1px solid #2a3d52;border-radius:10px;background:#0c1a28}.tc-entry-price span{display:block;font-size:6.5px;color:#70859d}.tc-entry-price b{display:block;margin-top:3px;font-size:16px;color:#e1edf9}.tc-reason-title{margin:11px 0 6px;font-size:7px;color:#8093a9}.tc-reasons{display:flex;flex-wrap:wrap;gap:5px}.tc-reason{min-height:28px;padding:0 9px;border:1px solid #30445a;border-radius:999px;background:#0f1d2b;color:#8196ad;font-size:7px}.tc-reason.active{border-color:#7865c6;background:#211a3a;color:#ded6ff}',
      '.tc-answers{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}.tc-answer{height:48px;border-radius:10px;font:700 11px IBM Plex Sans Thai,Segoe UI,sans-serif}.tc-high{border:1px solid #2b7d68;background:#103229;color:#79e0bd}.tc-low{border:1px solid #91445a;background:#351721;color:#ff91a7}.tc-skip{grid-column:1/-1;height:32px;border:1px solid #34485f;border-radius:8px;background:#101c29;color:#8297ae;font-size:7px}',
      '.tc-locked{margin-top:10px;padding:9px;border:1px solid #4d426e;border-radius:9px;background:#18152b;color:#afa4dc;font-size:7.5px;line-height:1.5}.tc-reveal-actions{display:flex;gap:6px;margin-top:8px}.tc-reveal-actions button{flex:1;min-height:34px;border:1px solid #4d426d;border-radius:8px;background:#211b39;color:#d7ceff;font-size:8px}.tc-progress{margin-top:10px}.tc-progress-head{display:flex;justify-content:space-between;font-size:7px;color:#768aa2}.tc-progress-line{height:7px;margin-top:5px;border:1px solid #2a3c50;border-radius:99px;background:#08131d;overflow:hidden}.tc-progress-line i{display:block;width:0;height:100%;background:linear-gradient(90deg,#735fc9,#59a891);transition:width .2s}',
      '.tc-result{margin-top:11px;padding:11px;border:1px solid #2b4c45;border-radius:10px;background:#0d211d}.tc-result.wrong{border-color:#59333f;background:#241219}.tc-result.equal{border-color:#514b35;background:#211e13}.tc-result strong{display:block;font-size:13px;color:#75deb8}.tc-result.wrong strong{color:#ff8fa6}.tc-result.equal strong{color:#d5c47b}.tc-result span{display:block;margin-top:4px;font-size:7.5px;line-height:1.55;color:#91a6a0}.tc-next{width:100%;height:38px;margin-top:9px;border:1px solid #526a93;border-radius:9px;background:#17263b;color:#d8e5f5;font-weight:650;font-size:8px}',
      '.tc-analysis{grid-column:1/-1;border:1px solid #31445a;border-radius:12px;background:#0b1622;padding:12px}.tc-analysis-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.tc-analysis-title small{display:block;color:#8f7ce6;font-size:6px;font-weight:700;letter-spacing:.7px}.tc-analysis-title b{display:block;margin-top:3px;font-size:11px;color:#dce8f5}.tc-analysis-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tc-analysis-actions select,.tc-analysis-actions button{height:32px;border:1px solid #3a4d63;border-radius:8px;background:#101d2a;color:#aabbd0;padding:0 9px;font-size:7px}.tc-analysis-actions .tc-assist{border-color:#6554a6;background:#211a3c;color:#ddd4ff;font-weight:700}.tc-analysis-actions .tc-follow{border-color:#397561;background:#123027;color:#8ee4c2;font-weight:700}.tc-analysis-actions .tc-follow:disabled{opacity:.38}.tc-analysis-empty{margin-top:9px;padding:10px;border:1px dashed #2c4055;border-radius:9px;color:#70869d;font-size:7.5px;line-height:1.55}.tc-analysis-hero{display:grid;grid-template-columns:150px 1fr;gap:8px;margin-top:9px}.tc-engine-call,.tc-engine-story{border:1px solid #283b50;border-radius:10px;background:#0a141f;padding:10px}.tc-engine-call span{display:block;font-size:6px;color:#70849a}.tc-engine-call strong{display:block;margin-top:4px;font-size:22px;color:#dce8f5}.tc-engine-call small{display:block;margin-top:4px;color:#8296ad;font-size:7px;line-height:1.45}.tc-engine-story b{font-size:9px;color:#cbd9e8}.tc-engine-story p{margin:5px 0 0;color:#8195aa;font-size:7.5px;line-height:1.55}.tc-gates{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}.tc-gate{padding:8px;border:1px solid #2a3d52;border-radius:9px;background:#0a151f}.tc-gate.pass{border-color:#28634f;background:#0d241e}.tc-gate.developing{border-color:#665b32;background:#211d12}.tc-gate.block{border-color:#663747;background:#24131a}.tc-gate span{display:block;font-size:6px;color:#72869b}.tc-gate b{display:block;margin:3px 0;font-size:8px;color:#c5d5e5}.tc-gate p{margin:0;font-size:6.7px;line-height:1.45;color:#8397aa}.tc-analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.tc-analysis-box{padding:9px;border:1px solid #293c50;border-radius:9px;background:#0a141e}.tc-analysis-box h4{margin:0 0 5px;font-size:7px;color:#9aaddf}.tc-analysis-box p,.tc-analysis-box li{font-size:7px;line-height:1.5;color:#8396aa}.tc-analysis-box p{margin:0}.tc-analysis-box ul{margin:0;padding-left:15px}.tc-postmortem{margin-top:9px;border-top:1px solid #26394d;padding-top:9px}.tc-postmortem h4{margin:0 0 6px;font-size:8px;color:#c7d7e7}.tc-path-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.tc-path-stat{padding:8px;border:1px solid #2a3c4f;border-radius:8px;background:#09141e}.tc-path-stat span{display:block;font-size:6px;color:#70849a}.tc-path-stat b{display:block;margin-top:3px;font-size:9px;color:#cbdbea}.tc-post-note{margin-top:7px;padding:8px;border:1px solid #3f4935;border-radius:8px;background:#171b12;color:#a9b58a;font-size:7px;line-height:1.55}',
      '.tc-empty{display:grid;place-items:center;height:100%;text-align:center;padding:24px}.tc-empty div{max-width:390px}.tc-empty h3{margin:0 0 7px;font-size:16px}.tc-empty p{margin:0;color:#7d91a8;font-size:8px;line-height:1.6}.tc-empty button{margin-top:12px;min-height:35px;padding:0 14px;border:1px solid #5d4fa0;border-radius:9px;background:#201a3b;color:#d8d0ff;font-size:8px}',
      '@media(max-width:760px){#ten-candle-dialog{width:calc(100vw - 8px);height:96vh;border-radius:12px}.tc-body{grid-template-columns:1fr;overflow:auto}.tc-chart-card{min-height:420px}.tc-panel{overflow:visible}.tc-scorebar{grid-template-columns:repeat(3,1fr)}.tc-scorebar .tc-stat:nth-child(4),.tc-scorebar .tc-stat:nth-child(5){display:none}#tc-chart{min-height:350px}.tc-analysis-hero,.tc-analysis-grid{grid-template-columns:1fr}.tc-gates{grid-template-columns:repeat(2,1fr)}.tc-path-grid{grid-template-columns:repeat(2,1fr)}.tc-analysis-head{align-items:flex-start;flex-direction:column}.tc-analysis-actions{width:100%}.tc-analysis-actions select{flex:1}}@media(max-width:430px){.tc-head{padding:10px}.tc-title h2{font-size:15px}.tc-body{padding:7px}.tc-chart-card{min-height:365px}#tc-chart{min-height:300px}.tc-question h3{font-size:15px}}'
    ].join('\n');document.head.append(style);
  }
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='ten-candle-dialog';
    dialog.innerHTML=[
      '<div class="tc-shell"><header class="tc-head"><div class="tc-title"><small>HISTORICAL BLIND GAME</small><h2>10-Candle Challenge</h2></div><div class="tc-head-actions"><button type="button" id="tc-reset-score">ล้างคะแนน</button><button type="button" class="tc-back" id="tc-close">กลับหน้า Train</button></div></header>',
      '<div class="tc-scorebar"><div class="tc-stat"><span>เล่นแล้ว</span><b id="tc-stat-played">0</b></div><div class="tc-stat"><span>ถูก</span><b id="tc-stat-correct">0</b></div><div class="tc-stat"><span>ความแม่น</span><b id="tc-stat-accuracy">0%</b></div><div class="tc-stat"><span>Streak</span><b id="tc-stat-streak">0</b></div><div class="tc-stat"><span>Best</span><b id="tc-stat-best">0</b></div></div>',
      '<div class="tc-body" id="tc-body"><section class="tc-chart-card" id="tc-chart-card"><div class="tc-chart-meta"><div><b>BTCUSDT · 1m</b><span> · กราฟย้อนหลังสุ่ม</span></div><span id="tc-round-label">ซ่อนอนาคต 10 แท่ง</span></div><div id="tc-chart"></div><div class="tc-chart-foot"><span>ซ่อนเวลาและอนาคตจนกว่าจะเฉลย</span><b id="tc-reveal-count">เห็นอนาคต 0 / 10</b></div></section>',
      '<aside class="tc-panel" id="tc-panel"><div class="tc-question"><span class="tc-question-kicker">เดาก่อนเห็นอนาคต</span><h3>อีก 10 แท่งจะปิดสูงหรือต่ำกว่าราคานี้?</h3><p>คำตอบจะถูกล็อกทันที แล้วกราฟจะค่อย ๆ เปิดแท่งอนาคตให้ดู</p></div><div class="tc-entry-price"><span>ราคาอ้างอิง</span><b id="tc-entry-price">—</b></div><div class="tc-reason-title">เหตุผลที่เลือก (เลือกได้หลายอัน)</div><div class="tc-reasons" id="tc-reasons"></div>',
      '<div class="tc-answers" id="tc-answers"><button class="tc-answer tc-high" data-tc-answer="HIGH">HIGH · สูงกว่า</button><button class="tc-answer tc-low" data-tc-answer="LOW">LOW · ต่ำกว่า</button><button class="tc-skip" data-tc-answer="SKIP">ขอผ่านข้อนี้</button></div><div class="tc-locked" id="tc-locked" hidden></div><div class="tc-reveal-actions" id="tc-reveal-actions" hidden><button type="button" id="tc-reveal-start">▶ เปิดทีละแท่ง</button><button type="button" id="tc-reveal-all">เปิดครบ 10 ทันที</button></div><div class="tc-progress" id="tc-progress" hidden><div class="tc-progress-head"><span>อนาคตที่เปิดแล้ว</span><b id="tc-progress-text">0 / 10</b></div><div class="tc-progress-line"><i id="tc-progress-bar"></i></div></div><div class="tc-result" id="tc-result" hidden></div><button type="button" class="tc-next" id="tc-next" hidden>ข้อต่อไป →</button></aside><section class="tc-analysis" id="tc-analysis"><div class="tc-analysis-head"><div class="tc-analysis-title"><small>ARIS ASSIST · CAUSAL ONLY</small><b>วิเคราะห์จุดนี้เหมือนหน้าแรก</b></div><div class="tc-analysis-actions"><select id="tc-engine-select" aria-label="เครื่องยนต์ช่วยวิเคราะห์"></select><button type="button" class="tc-assist" id="tc-analyze">ให้ ARIS ช่วยดู</button><button type="button" class="tc-follow" id="tc-follow-engine" disabled>เลือกตาม ARIS</button></div></div><div id="tc-analysis-content"><div class="tc-analysis-empty">ยังไม่เรียกเครื่องยนต์ · ซูโม่จะเดาเองก่อนก็ได้ หรือกดให้ ARIS วิเคราะห์จากข้อมูลที่เห็น ณ ตอนนี้เท่านั้นค่ะ</div></div></section></div></div>'
    ].join('');
    document.body.append(dialog);
    byId('tc-reasons').innerHTML=REASONS.map(r=>'<button type="button" class="tc-reason" data-tc-reason="'+esc(r)+'">'+esc(r)+'</button>').join('');
    byId('tc-close').addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    byId('tc-reset-score').addEventListener('click',()=>{if(!confirm('ล้างคะแนน 10-Candle Challenge ทั้งหมดหรือไม่?'))return;stats={played:0,correct:0,wrong:0,skipped:0,streak:0,bestStreak:0,reasons:{}};saveStats();renderStats();});
    byId('tc-reasons').addEventListener('click',e=>{const b=e.target.closest('[data-tc-reason]');if(!b||round?.answer)return;const r=b.dataset.tcReason;if(selectedReasons.has(r))selectedReasons.delete(r);else selectedReasons.add(r);b.classList.toggle('active',selectedReasons.has(r));});
    byId('tc-answers').addEventListener('click',e=>{const b=e.target.closest('[data-tc-answer]');if(b)choose(b.dataset.tcAnswer);});
    byId('tc-reveal-start').addEventListener('click',startReveal);byId('tc-reveal-all').addEventListener('click',revealAll);byId('tc-next').addEventListener('click',newRound);
    byId('tc-analyze').addEventListener('click',analyzeCurrent);
    byId('tc-follow-engine').addEventListener('click',()=>{const d=round?.engineAnalysis?.direction;if(!round?.answer&&(d==='HIGH'||d==='LOW'))choose(d);});
    byId('tc-engine-select').addEventListener('change',()=>{engineVersion=byId('tc-engine-select').value||'ARIS-3.0.0';if(round){round.engineAnalysis=null;renderAnalysisEmpty();}});
    return dialog;
  }
  function renderStats(){byId('tc-stat-played').textContent=String(stats.played);byId('tc-stat-correct').textContent=String(stats.correct);byId('tc-stat-accuracy').textContent=pct(stats.correct,stats.played)+'%';byId('tc-stat-streak').textContent=String(stats.streak);byId('tc-stat-best').textContent=String(stats.bestStreak);}
  function showEmpty(title,text){clearReveal();const body=byId('tc-body');body.innerHTML='<div class="tc-empty"><div><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p><button type="button" id="tc-empty-close">กลับไปโหลดข้อมูลในหน้า Train</button></div></div>';byId('tc-empty-close')?.addEventListener('click',close);}

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function toEngineBar(b){return {time:Math.floor(Number(b.time)/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume),closed:true};}
  function minuteFlow(bar){const q=Number(bar.quoteVolume),buy=Number(bar.takerBuyQuote);if(!(q>0)||!Number.isFinite(buy))return 0;return clamp((2*buy-q)/q,-1,1);}
  function makeAggregate(minutes){return {minutes,current:null,closed:[]};}
  function updateAggregate(agg,bar){
    const bucketMs=agg.minutes*MINUTE,bucketStart=Math.floor(Number(bar.time)/bucketMs)*bucketMs;
    if(agg.current&&agg.current.bucketStart!==bucketStart){if(agg.current.count>0){agg.closed.push({...agg.current.bar,closed:true});if(agg.closed.length>100)agg.closed.splice(0,agg.closed.length-100);}agg.current=null;}
    if(!agg.current)agg.current={bucketStart,count:0,bar:{time:Math.floor(bucketStart/1000),open:Number(bar.open),high:Number(bar.high),low:Number(bar.low),close:Number(bar.close),volume:0,closed:false}};
    const c=agg.current;c.count++;c.bar.high=Math.max(c.bar.high,Number(bar.high));c.bar.low=Math.min(c.bar.low,Number(bar.low));c.bar.close=Number(bar.close);c.bar.volume+=Number(bar.volume)||0;
    if(Number(bar.time)+MINUTE>=bucketStart+bucketMs){agg.closed.push({...c.bar,closed:true});if(agg.closed.length>100)agg.closed.splice(0,agg.closed.length-100);agg.current=null;}
  }
  function bridgeContinuity(engine,price,ts){if(engine.previous&&ts-engine.previous.ts>5000)engine.previous={price:Number(price),ts:ts-1000};}
  function engineInput(recent,agg5,agg15,bar,engineBar,ts,id){
    const flow=minuteFlow(bar);return {ts,id,price:Number(bar.close),bars:recent,five:agg5.closed,fifteen:agg15.closed,flow,coverage:60,book:0,bookValid:false,fresh:true,
      micro:{source:'historical_1m_adapter',replay:true,coverageSeconds:60,flow15s:null,flow60s:flow,flow180s:null,trades60s:Number.isFinite(Number(bar.trades))?Number(bar.trades):null,notional60s:Number.isFinite(Number(bar.quoteVolume))?Number(bar.quoteVolume):null,notional180s:null,depthImbalance:null,micropriceBias:null,spreadBps:null,liquidationSigned60s:null,liquidationSigned180s:null,liquidationEvents60s:null,liquidationEvents180s:null},
      current:engineBar,expedite:false,horizonBars:10};
  }
  function resolveLiveEngineVersion(){
    const supported=new Set((globalThis.TrainingEngineRegistryV1?.supported||[]).map(x=>x.version));
    let v='ARIS-3.0.0';try{const saved=localStorage.getItem('btc-active-engine-version-aris-v2');if(saved)v=saved;}catch{}
    const map={'6.5.0':'6.6.0','7.0.0':'7.2.0','7.0.1':'7.2.0','7.1.0':'7.2.0','7.1.1':'7.2.0','ARIS-1.0.0':'ARIS-1.2.0','ARIS-1.1.0':'ARIS-1.2.0'};v=map[v]||v;
    return supported.has(v)?v:(supported.has('ARIS-3.0.0')?'ARIS-3.0.0':[...supported][0]||'ARIS-3.0.0');
  }
  function setupEngineSelect(){
    const sel=byId('tc-engine-select'),registry=globalThis.TrainingEngineRegistryV1;if(!sel||!registry)return;
    sel.innerHTML=(registry.supported||[]).map(x=>'<option value="'+esc(x.version)+'">'+esc(x.label||x.version)+'</option>').join('');
    engineVersion=resolveLiveEngineVersion();sel.value=engineVersion;
  }
  function analysisStory(view){return view?.v3Story||view?.phase?.v3View?.story||view?.v2Story||view?.phase?.v2View?.story||view?.v4Story||view?.phase?.v4View?.story||null;}
  function normalizeDirection(v){return v==='HIGH'||v==='LOW'?v:null;}
  function analysisDirection(view,story){return normalizeDirection(view?.signal?.direction)||normalizeDirection(story?.direction)||normalizeDirection(view?.gate?.direction)||normalizeDirection(view?.watch?.direction)||null;}
  async function engineAnalysisAt(index,version){
    const registry=globalThis.TrainingEngineRegistryV1;if(!registry)throw new Error('Training Engine Registry ไม่พร้อม');
    const loaded=await registry.load(version),Core=loaded.Core;if(!Core?.Engine)throw new Error('โหลดเครื่องยนต์ไม่สำเร็จ');
    const engine=new Core.Engine({}),recent=[],agg5=makeAggregate(5),agg15=makeAggregate(15),start=Math.max(0,index-ENGINE_WARMUP+1);
    let latest=null;
    for(let i=start;i<=index;i++){
      const bar=bars[i],eb=toEngineBar(bar),logicalClose=Number(bar.time)+MINUTE;recent.push(eb);if(recent.length>220)recent.splice(0,recent.length-220);updateAggregate(agg5,bar);updateAggregate(agg15,bar);bridgeContinuity(engine,i>start?Number(bars[i-1].close):Number(bar.open),logicalClose);
      for(const off of [0,400,800])latest=engine.step(engineInput(recent,agg5,agg15,bar,eb,logicalClose+off,'CHALLENGE:'+index+':'+i+':'+off))||latest;
    }
    const story=analysisStory(latest),direction=analysisDirection(latest,story);
    return {version,view:latest,story,direction,status:latest?.status||'—',reason:latest?.reason||story?.summary||'ยังไม่มีคำอธิบาย'};
  }
  function gateLabel(k){return ({structure:'โครงสร้างราคา',location:'ตำแหน่งราคา',behavior:'พฤติกรรมแท่ง',micro:'แรงซื้อขายระยะสั้น'})[k]||k;}
  function gateHtml(story){
    const g=story?.gates;if(!g)return '';
    return '<div class="tc-gates">'+['structure','location','behavior','micro'].map(k=>{const x=g[k]||{},state=String(x.state||'—'),cls=state==='PASS'?'pass':state==='DEVELOPING'?'developing':state==='BLOCK'?'block':'';return '<div class="tc-gate '+cls+'"><span>'+esc(gateLabel(k))+'</span><b>'+esc(state)+'</b><p>'+esc(x.reason||'ยังไม่มีรายละเอียด')+'</p></div>';}).join('')+'</div>';
  }
  function listHtml(rows,empty){const a=(rows||[]).filter(Boolean).slice(0,6);return a.length?'<ul>'+a.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>'+esc(empty)+'</p>';}
  function renderAnalysisEmpty(){
    const c=byId('tc-analysis-content');if(c)c.innerHTML='<div class="tc-analysis-empty">ยังไม่เรียกเครื่องยนต์ · ซูโม่จะเดาเองก่อนก็ได้ หรือกดให้ ARIS วิเคราะห์จากข้อมูลที่เห็น ณ ตอนนี้เท่านั้นค่ะ</div>';
    const follow=byId('tc-follow-engine');if(follow){follow.disabled=true;follow.textContent='เลือกตาม ARIS';}
  }
  function renderEngineAnalysis(a){
    if(!a)return renderAnalysisEmpty();
    const c=byId('tc-analysis-content'),st=a.story,v=a.view||{},dir=a.direction||'WATCH',gateCount=st?((st.gatePassed??0)+'/'+(st.gateTotal??4)):'—';
    const fib=st?.fib,htf=st?.htf;
    const fibText=fib?.valid?((fib.extension>1?'ต่อขา '+(fib.extension*100).toFixed(1)+'% · '+(fib.extensionZone||''):'ย่อ '+Math.max(0,fib.retracement*100).toFixed(1)+'% · '+(fib.retraceZone||''))+(fib.confluence?' · มี Confluence':'')):'ยังไม่มี Fib swing ที่ยืนยัน';
    const htfText='5m '+(htf?.m5?.available?(htf.m5.dir>0?'ขึ้น':htf.m5.dir<0?'ลง':'กลาง'):'—')+' · 15m '+(htf?.m15?.available?(htf.m15.dir>0?'ขึ้น':htf.m15.dir<0?'ลง':'กลาง'):'—');
    c.innerHTML='<div class="tc-analysis-hero"><div class="tc-engine-call"><span>'+esc(a.version)+' · '+esc(a.status)+'</span><strong>'+esc(dir)+'</strong><small>'+(st?('Gate '+esc(gateCount)+' · '+esc(st.entryState||'OBSERVE')):esc(v?.gate?.state||v?.status||'OBSERVE'))+'</small></div><div class="tc-engine-story"><b>'+esc(st?.stateLabel||v?.phase?.phase||'ภาพตลาด')+(st?.playbookLabel?' · '+esc(st.playbookLabel):'')+'</b><p>'+esc(st?.summary||a.reason)+'</p></div></div>'+
      gateHtml(st)+
      '<div class="tc-analysis-grid"><div class="tc-analysis-box"><h4>หลักฐานที่หนุน</h4>'+listHtml(st?.supports,'ยังไม่มีหลักฐานหนุนที่เครื่องยนต์จัดเป็นข้อเด่น')+'</div><div class="tc-analysis-box"><h4>สิ่งที่ยังขวาง / ต้องระวัง</h4>'+listHtml(st?.warnings||st?.blocked,'ยังไม่มีคำเตือนเด่น')+'</div><div class="tc-analysis-box"><h4>Fib / ภาพใหญ่</h4><p>'+esc(fibText)+'<br>'+esc(htfText)+'</p></div><div class="tc-analysis-box"><h4>แผนต่อจากนี้</h4><p>'+esc(st?.trigger||v?.gate?.blocker||'รอดูพฤติกรรมต่อ')+(st?.invalidation?'<br>เสียแผน: '+esc(st.invalidation):'')+(st?.nextPlan?'<br>ถัดไป: '+esc(st.nextPlan):'')+'</p></div></div><div id="tc-postmortem"></div>';
    const follow=byId('tc-follow-engine');if(follow){follow.disabled=!!round?.answer||!(a.direction==='HIGH'||a.direction==='LOW');follow.textContent=a.direction?'เลือกตาม ARIS · '+a.direction:'ARIS ยัง WATCH';}
  }
  async function analyzeCurrent(){
    if(!round||analysisBusy)return;analysisBusy=true;const btn=byId('tc-analyze');if(btn){btn.disabled=true;btn.textContent='ARIS กำลังอ่าน…';}
    try{const a=await engineAnalysisAt(round.index,engineVersion);round.engineAnalysis=a;renderEngineAnalysis(a);if(round.finished)renderPostmortem();}
    catch(err){console.error('Challenge engine analysis failed',err);const c=byId('tc-analysis-content');if(c)c.innerHTML='<div class="tc-analysis-empty">วิเคราะห์ไม่สำเร็จ · '+esc(err?.message||err)+'</div>';}
    finally{analysisBusy=false;if(btn){btn.disabled=false;btn.textContent='ให้ ARIS ช่วยดู';}}
  }
  function renderPostmortem(){
    const host=byId('tc-postmortem');if(!host||!round?.finished)return;
    const entry=Number(round.entry.close),future=round.future||[],finish=Number(future.at(-1)?.close),high=Math.max(...future.map(x=>Number(x.high))),low=Math.min(...future.map(x=>Number(x.low)));
    const up=high-entry,down=entry-low,greens=future.filter(x=>Number(x.close)>Number(x.open)).length,reds=future.filter(x=>Number(x.close)<Number(x.open)).length,actual=outcome(entry,finish);
    const a=round.engineAnalysis,engineHit=a?.direction?(a.direction===actual?'ตรงกับผล T+10':'ไม่ตรงกับผล T+10'):'ไม่ได้เลือกฝั่งก่อนเฉลย';
    const c1=future[0]?.close,c3=future[2]?.close,c5=future[4]?.close;
    host.innerHTML='<div class="tc-postmortem"><h4>เฉลยแบบละเอียด · ข้อมูลหลังตอบเท่านั้น</h4><div class="tc-path-grid"><div class="tc-path-stat"><span>ผล T+10</span><b>'+esc(actual)+'</b></div><div class="tc-path-stat"><span>ขึ้นสูงสุดจากจุดเข้า</span><b>+'+money(up)+'</b></div><div class="tc-path-stat"><span>ลงต่ำสุดจากจุดเข้า</span><b>-'+money(down)+'</b></div><div class="tc-path-stat"><span>แท่งเขียว / แดง</span><b>'+greens+' / '+reds+'</b></div></div><div class="tc-analysis-grid"><div class="tc-analysis-box"><h4>เส้นทางราคา</h4><p>T+1 '+money(c1)+' · T+3 '+money(c3)+' · T+5 '+money(c5)+' · T+10 '+money(finish)+'</p></div><div class="tc-analysis-box"><h4>ARIS เทียบกับเฉลย</h4><p>'+(a?('ก่อนเห็นอนาคต ARIS '+esc(a.direction||'WATCH')+' · '+esc(engineHit)):'กำลังสร้างมุมมอง ARIS จากข้อมูลก่อนเฉลย…')+'</p></div></div><div class="tc-post-note">ส่วนบนคือสิ่งที่เครื่องยนต์รู้ก่อนเห็นอนาคต ส่วนนี้ใช้ 10 แท่งที่เปิดแล้วเพื่ออธิบายผลเท่านั้น ไม่ย้อนข้อมูลอนาคตกลับไปช่วยคำตอบค่ะ</div></div>';
  }
  async function ensurePostAnalysis(){if(!round?.engineAnalysis)await analyzeCurrent();else renderPostmortem();}
  async function resolveSession(preferredId){
    const api=globalThis.HistoricalDataV1;if(!api)throw new Error('HistoricalDataV1 ไม่พร้อม');
    if(preferredId){const preferred=await api.getSession(preferredId);if(preferred?.datasetId&&Number(preferred.loadedBars)>=CONTEXT_BARS+FUTURE_BARS+5)return preferred;}
    const rows=await api.listSessions(30);return rows.find(s=>s?.datasetId&&['ready','quality_warning'].includes(s.status)&&Number(s.loadedBars)>=CONTEXT_BARS+FUTURE_BARS+5)||null;
  }
  function eligibleIndexes(){
    if(!session||bars.length<Math.max(CONTEXT_BARS,ENGINE_WARMUP)+FUTURE_BARS+2)return [];
    const minTime=Number(session.analysisStart)||-Infinity,maxTime=Number(session.analysisEnd)||Infinity,out=[];
    for(let i=Math.max(CONTEXT_BARS,ENGINE_WARMUP)-1;i<bars.length-FUTURE_BARS;i++){
      if(bars[i].time<minTime||bars[i+FUTURE_BARS].time>maxTime)continue;
      let ok=true;for(let j=i-CONTEXT_BARS+2;j<=i+FUTURE_BARS;j++){if(Number(bars[j].time)-Number(bars[j-1].time)!==60000){ok=false;break;}}
      if(ok)out.push(i);
    }return out;
  }
  function pickIndex(){let c=eligibleIndexes().filter(i=>!used.has(i));if(!c.length){used.clear();c=eligibleIndexes();}if(!c.length)return null;const i=c[Math.floor(Math.random()*c.length)];used.add(i);return i;}
  function initChart(){
    const host=byId('tc-chart');if(!host||!globalThis.LightweightCharts)return false;
    if(chart){try{chart.remove();}catch{}chart=null;series=null;}
    const L=globalThis.LightweightCharts;
    chart=L.createChart(host,{width:Math.max(300,host.clientWidth),height:Math.max(280,host.clientHeight),layout:{background:{type:'solid',color:'#09131e'},textColor:'#8297ad'},grid:{vertLines:{color:'#122231'},horzLines:{color:'#122231'}},rightPriceScale:{borderColor:'#25384c'},timeScale:{visible:false,borderColor:'#25384c',timeVisible:false,secondsVisible:false,rightOffset:4,barSpacing:7},crosshair:{mode:L.CrosshairMode?.Normal??0}});
    series=chart.addSeries(L.CandlestickSeries,{upColor:'#43d8ad',downColor:'#ff6f8c',borderVisible:false,wickUpColor:'#43d8ad',wickDownColor:'#ff6f8c',priceFormat:{type:'price',precision:2,minMove:.01}});
    if(resizeObserver)resizeObserver.disconnect();resizeObserver=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(chart&&r?.width>0&&r.height>0)chart.resize(r.width,r.height);});resizeObserver.observe(host);return true;
  }
  function restoreGameBody(){if(byId('tc-chart'))return;dialog.remove();dialog=null;chart=null;series=null;ensureDialog();if(!dialog.open)dialog.showModal();}
  async function loadSession(preferredId){
    session=await resolveSession(preferredId);
    if(!session){showEmpty('ยังไม่มีกราฟย้อนหลังสำหรับเล่น','โหลดข้อมูลย้อนหลังอย่างน้อย 1 ชุดในหน้า Train ก่อน แล้วกดเข้าเกมใหม่ค่ะ');return false;}
    bars=(await globalThis.HistoricalDataV1.getDatasetBars(session.datasetId)).filter(b=>Number.isFinite(Number(b.time))).sort((a,b)=>a.time-b.time);
    if(bars.length<ENGINE_WARMUP+FUTURE_BARS+2){showEmpty('ข้อมูลยังสั้นเกินไป','เกมเวอร์ชัน ARIS Assist ต้องมีอย่างน้อยประมาณ 370 แท่ง เพื่อให้ 5m / 15m และเครื่องยนต์มี Warm-up พอค่ะ');return false;}return true;
  }
  function resetRoundUi(){
    selectedReasons.clear();document.querySelectorAll('#tc-reasons .tc-reason').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#tc-answers button').forEach(b=>b.disabled=false);
    byId('tc-answers').hidden=false;byId('tc-locked').hidden=true;byId('tc-reveal-actions').hidden=true;byId('tc-progress').hidden=true;byId('tc-result').hidden=true;byId('tc-result').className='tc-result';byId('tc-next').hidden=true;byId('tc-progress-bar').style.width='0%';byId('tc-progress-text').textContent='0 / 10';byId('tc-reveal-count').textContent='เห็นอนาคต 0 / 10';byId('tc-reveal-start').disabled=false;renderAnalysisEmpty();
  }
  function newRound(){
    clearReveal();const idx=pickIndex();if(idx===null){showEmpty('หาโจทย์ที่ต่อเนื่องไม่พอ','ชุดข้อมูลนี้มีช่วงขาดของแท่งมากเกินไป ลองโหลด Session ใหม่ค่ะ');return;}
    round={index:idx,entry:bars[idx],future:bars.slice(idx+1,idx+1+FUTURE_BARS),answer:null,revealed:0,finished:false,engineAnalysis:null};resetRoundUi();byId('tc-entry-price').textContent=money(round.entry.close);byId('tc-round-label').textContent='ซ่อนอนาคต 10 แท่ง · ข้อใหม่';
    if(!chart||!series)initChart();series.setData(bars.slice(idx-CONTEXT_BARS+1,idx+1).map(chartBar));chart.timeScale().fitContent();
  }
  function choose(answer){
    if(!round||round.answer)return;if(answer==='SKIP'){stats.skipped++;saveStats();renderStats();newRound();return;}
    round.answer=answer;round.reasons=[...selectedReasons];round.lockedAt=Date.now();document.querySelectorAll('#tc-answers button').forEach(b=>b.disabled=true);if(byId('tc-follow-engine'))byId('tc-follow-engine').disabled=true;byId('tc-locked').hidden=false;byId('tc-locked').textContent='ล็อกคำตอบแล้ว: '+answer+(round.reasons.length?' · เหตุผล '+round.reasons.join(' / '):' · ไม่ได้เลือกเหตุผล');byId('tc-reveal-actions').hidden=false;byId('tc-progress').hidden=false;byId('tc-round-label').textContent='คำตอบถูกล็อก · ยังไม่เห็นผล';
  }
  function clearReveal(){if(revealTimer){clearInterval(revealTimer);revealTimer=null;}}
  function revealOne(){
    if(!round||!round.answer||round.finished)return;if(round.revealed>=FUTURE_BARS){finishRound();return;}
    series.update(chartBar(round.future[round.revealed]));round.revealed++;byId('tc-progress-bar').style.width=(round.revealed/FUTURE_BARS*100)+'%';byId('tc-progress-text').textContent=round.revealed+' / '+FUTURE_BARS;byId('tc-reveal-count').textContent='เห็นอนาคต '+round.revealed+' / '+FUTURE_BARS;byId('tc-round-label').textContent='กำลังเปิดอนาคต · '+round.revealed+'/10';chart.timeScale().scrollToRealTime();if(round.revealed>=FUTURE_BARS)finishRound();
  }
  function startReveal(){if(revealTimer||!round?.answer)return;byId('tc-reveal-start').disabled=true;revealTimer=setInterval(()=>{revealOne();if(round?.finished){clearReveal();byId('tc-reveal-start').disabled=false;}},520);}
  function revealAll(){if(!round?.answer)return;clearReveal();while(round&&!round.finished&&round.revealed<FUTURE_BARS)revealOne();byId('tc-reveal-start').disabled=false;}
  function updateReasonStats(correct){for(const r of round.reasons||[]){const row=stats.reasons[r]||{played:0,correct:0};row.played++;if(correct)row.correct++;stats.reasons[r]=row;}}
  function finishRound(){
    if(!round||round.finished)return;clearReveal();round.finished=true;
    const finish=round.future[FUTURE_BARS-1],actual=outcome(Number(round.entry.close),Number(finish.close)),scored=actual!=='EQUAL',correct=scored&&round.answer===actual;
    if(scored){stats.played++;if(correct){stats.correct++;stats.streak++;stats.bestStreak=Math.max(stats.bestStreak,stats.streak);}else{stats.wrong++;stats.streak=0;}updateReasonStats(correct);}saveStats();renderStats();
    const delta=Number(finish.close)-Number(round.entry.close),result=byId('tc-result');result.hidden=false;result.className=actual==='EQUAL'?'tc-result equal':'tc-result'+(correct?'':' wrong');
    const when=new Date(Number(round.entry.time)).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const title=actual==='EQUAL'?'เสมอ · ไม่นับคะแนน':correct?'ถูก ✅ '+actual:'ผิด ❌ คำตอบ '+round.answer+' · ผลจริง '+actual;
    result.innerHTML='<strong>'+esc(title)+'</strong><span>เข้า '+money(round.entry.close)+' → แท่งที่ 10 ปิด '+money(finish.close)+' · ต่าง '+(delta>=0?'+':'')+money(delta)+'<br>กราฟจริงย้อนหลัง: '+esc(when)+(round.reasons?.length?'<br>เหตุผลที่เลือก: '+esc(round.reasons.join(' / ')):'')+'</span>';byId('tc-next').hidden=false;byId('tc-reveal-actions').hidden=true;byId('tc-round-label').textContent='เฉลยแล้ว · '+actual;ensurePostAnalysis().catch(err=>console.error('Challenge post analysis failed',err));
  }
  async function open(preferredSessionId,opts={}){
    ensureStyles();ensureDialog();onClose=typeof opts.onClose==='function'?opts.onClose:null;if(!dialog.open)dialog.showModal();renderStats();setupEngineSelect();
    try{const ok=await loadSession(preferredSessionId);if(!ok)return;if(!byId('tc-chart'))restoreGameBody();initChart();newRound();}catch(err){console.error('10-Candle Challenge failed',err);showEmpty('เปิดเกมไม่สำเร็จ',String(err?.message||err));}
  }
  function close(){clearReveal();if(dialog?.open)dialog.close();const cb=onClose;onClose=null;if(cb)queueMicrotask(cb);}
  globalThis.TenCandleChallengeV1={schema:SCHEMA,open,close,stats:()=>JSON.parse(JSON.stringify(stats))};
})();