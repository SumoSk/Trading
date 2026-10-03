(() => {
  'use strict';
  const SCHEMA='ten-candle-challenge-v4',STORE='aris-ten-candle-challenge-v1',HISTORY_STORE='aris-ten-candle-challenge-history-v1',CONTEXT_BARS=100,FUTURE_BARS=10,ENGINE_WARMUP=360,MINUTE=60000;
  const REASONS=['ตามเทรนด์','แนวรับ','แนวต้าน','Breakout','Reject','Fib','ปลายขา','Sideway'];
  let dialog=null,chart=null,series=null,emaFastSeries=null,emaSlowSeries=null,rsiSeries=null,rsiUpper=null,rsiLower=null,macdHistSeries=null,macdSeries=null,macdSignalSeries=null,entryPriceLine=null,entryMarkerApi=null,resizeObserver=null,revealTimer=null,onClose=null,session=null,bars=[],round=null,selectedReasons=new Set(),used=new Set(),engineVersion='ARIS-3.1.0',analysisBusy=false;
  let stats={played:0,correct:0,wrong:0,skipped:0,streak:0,bestStreak:0,reasons:{}};
  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const pct=(a,b)=>b?Math.round(a/b*100):0;
  const chartBar=b=>({time:Math.floor(Number(b.time)/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)});
  const outcome=(entry,finish)=>finish>entry?'HIGH':finish<entry?'LOW':'EQUAL';
  const marketLabel=symbol=>({BTCUSDT:'BTC',XAUUSDT:'XAU',SKHYUSDT:'SKHY',AMDUSDT:'AMD',INTCUSDT:'INTEL',NVDAUSDT:'NVDA',OPENAIUSDT:'OPENAI'})[symbol]||String(symbol||'—').replace(/USDT$/,'');
  const intervalMs=()=>globalThis.HistoricalDataV1?.intervalMs?.(session?.interval||'1m')||MINUTE;
  const trainingEligible=()=>String(session?.symbol||'BTCUSDT')==='BTCUSDT'&&String(session?.interval||'1m')==='1m';
  const assistAvailable=()=>trainingEligible();
  function durationText(ms){
    const min=Math.round(Number(ms)/MINUTE);
    if(min<60)return min+' นาที';
    const h=min/60;if(h<24)return (Number.isInteger(h)?h:h.toFixed(1))+' ชั่วโมง';
    const d=h/24;return (Number.isInteger(d)?d:d.toFixed(1))+' วัน';
  }
  const horizonText=()=>durationText(intervalMs()*FUTURE_BARS);
  function emaValues(values,period){
    if(!values.length)return [];
    const k=2/(period+1),out=[Number(values[0])];
    for(let i=1;i<values.length;i++)out.push(Number(values[i])*k+out[i-1]*(1-k));
    return out;
  }
  function emaPoints(src,period){
    const vals=emaValues(src.map(b=>Number(b.close)),period);
    return src.map((b,i)=>({time:Math.floor(Number(b.time)/1000),value:vals[i]}));
  }
  function rsiPoints(src,period=14){
    if(src.length<=period)return [];
    const out=[];let gain=0,loss=0;
    for(let i=1;i<=period;i++){const d=Number(src[i].close)-Number(src[i-1].close);gain+=Math.max(0,d);loss+=Math.max(0,-d);}
    gain/=period;loss/=period;
    const value=()=>loss?100-100/(1+gain/loss):gain?100:50;
    out.push({time:Math.floor(Number(src[period].time)/1000),value:value()});
    for(let i=period+1;i<src.length;i++){
      const d=Number(src[i].close)-Number(src[i-1].close);
      gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;
      out.push({time:Math.floor(Number(src[i].time)/1000),value:value()});
    }
    return out;
  }
  function macdPoints(src){
    if(src.length<26)return {macd:[],signal:[],hist:[]};
    const closes=src.map(b=>Number(b.close)),fast=emaValues(closes,12),slow=emaValues(closes,26),m=closes.map((_,i)=>fast[i]-slow[i]),sig=emaValues(m,9);
    const macd=[],signal=[],hist=[];
    for(let i=25;i<src.length;i++){
      const time=Math.floor(Number(src[i].time)/1000),v=m[i],sg=sig[i],h=v-sg;
      macd.push({time,value:v});signal.push({time,value:sg});hist.push({time,value:h,color:h>=0?'#22524a':'#543143'});
    }
    return {macd,signal,hist};
  }
  function setChallengeIndicators(src){
    if(!emaFastSeries||!emaSlowSeries||!rsiSeries||!rsiUpper||!rsiLower||!macdHistSeries||!macdSeries||!macdSignalSeries)return;
    emaFastSeries.setData(emaPoints(src,8));emaSlowSeries.setData(emaPoints(src,21));
    const r=rsiPoints(src),m=macdPoints(src);
    rsiSeries.setData(r);rsiUpper.setData(r.map(x=>({time:x.time,value:70})));rsiLower.setData(r.map(x=>({time:x.time,value:30})));
    macdHistSeries.setData(m.hist);macdSeries.setData(m.macd);macdSignalSeries.setData(m.signal);
  }
  function visibleRoundBars(){
    if(!round)return [];
    return bars.slice(round.index-CONTEXT_BARS+1,round.index+1+round.revealed);
  }
  function clearEntryCue(){
    if(entryPriceLine&&series){try{series.removePriceLine(entryPriceLine);}catch{}}
    entryPriceLine=null;
    if(entryMarkerApi)entryMarkerApi.setMarkers([]);
  }
  function showEntryCue(){
    if(!round||!series)return;
    clearEntryCue();
    const L=globalThis.LightweightCharts,price=Number(round.entry.close);
    entryPriceLine=series.createPriceLine({price,color:'#a899ff',lineWidth:1,lineStyle:L?.LineStyle?.Dashed??2,axisLabelVisible:true,title:''});
    if(L?.createSeriesMarkers){
      entryMarkerApi=L.createSeriesMarkers(series,[{
        time:Math.floor(Number(round.entry.time)/1000),
        position:round.answer==='LOW'?'aboveBar':'belowBar',
        color:'#a899ff',
        shape:'circle',
        text:''
      }]);
    }
  }
  function syncSessionUi(){
    if(!session)return;
    const mode=byId('tc-mode-pill');if(mode)mode.textContent=marketLabel(session.symbol||'BTCUSDT')+' · '+(session.interval||'1m')+' · 10 แท่ง = '+horizonText();
    const sub=byId('tc-question-sub');if(sub)sub.textContent='โจทย์นี้ 10 แท่ง = '+horizonText()+(assistAvailable()?' · จะเลือกเองหรือให้ ARIS ช่วยอ่านก่อนตอบก็ได้':' · เล่นจากกราฟล้วน ไม่ใช้ ARIS Assist ข้าม TF');
    setupEngineSelect();renderStats();
  }

  const emptyStats=()=>({played:0,correct:0,wrong:0,skipped:0,streak:0,bestStreak:0,reasons:{}});
  const statsKey=s=>STORE+':'+String(s?.symbol||'BTCUSDT')+':'+String(s?.interval||'1m');
  function loadStats(s=session){
    try{
      const key=statsKey(s),raw=localStorage.getItem(key);
      let x=raw?JSON.parse(raw):null;
      if(!x&&String(s?.symbol||'BTCUSDT')==='BTCUSDT'&&String(s?.interval||'1m')==='1m')x=JSON.parse(localStorage.getItem(STORE)||'{}');
      if(!x||typeof x!=='object')return emptyStats();
      return {played:Number(x.played)||0,correct:Number(x.correct)||0,wrong:Number(x.wrong)||0,skipped:Number(x.skipped)||0,streak:Number(x.streak)||0,bestStreak:Number(x.bestStreak)||0,reasons:x.reasons&&typeof x.reasons==='object'?x.reasons:{}};
    }catch{return emptyStats();}
  }
  function saveStats(){try{if(session)localStorage.setItem(statsKey(session),JSON.stringify(stats));}catch{}}
  function loadHistory(){try{const x=JSON.parse(localStorage.getItem(HISTORY_STORE)||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
  function saveHistoryRecord(record){
    try{
      const rows=loadHistory();rows.push(record);
      if(rows.length>1000)rows.splice(0,rows.length-1000);
      localStorage.setItem(HISTORY_STORE,JSON.stringify(rows));
    }catch{}
  }
  function ensureStyles(){
    if(byId('ten-candle-challenge-style'))return;
    const style=document.createElement('style');style.id='ten-candle-challenge-style';
    style.textContent=[
      '#ten-candle-dialog{--bg:#071019;--surface:#0b1622;--surface2:#0e1b29;--line:#26384b;--muted:#8396aa;--text:#e7f0fa;--purple:#8f7ce6;--green:#63ddb5;--red:#ff7894;width:min(1280px,calc(100vw - 20px));height:min(900px,96vh);padding:0;border:1px solid #33475d;border-radius:20px;background:var(--bg);color:var(--text);box-shadow:0 30px 90px #000b;overflow:hidden}',
      '#ten-candle-dialog::backdrop{background:#02060bd9;backdrop-filter:blur(5px)}',
      '#ten-candle-dialog button,#ten-candle-dialog select{font-family:IBM Plex Sans Thai,Segoe UI,sans-serif}',
      '.tc-shell{height:100%;display:grid;grid-template-rows:auto auto minmax(0,1fr);background:radial-gradient(circle at 88% -10%,rgba(126,102,214,.16),transparent 32%),var(--bg)}',
      '.tc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-bottom:1px solid #1e3042;background:#0a1520}',
      '.tc-title-row{display:flex;align-items:center;gap:10px}.tc-title small{display:block;color:var(--purple);font-size:10px;font-weight:750;letter-spacing:.9px}.tc-title h2{margin:3px 0 0;font:700 21px/1.2 IBM Plex Sans Thai,Segoe UI,sans-serif;color:#f1f6fd}.tc-mode-pill{padding:6px 9px;border:1px solid #493f71;border-radius:999px;background:#19162b;color:#bdb3ef;font-size:11px;white-space:nowrap}',
      '.tc-head-actions{display:flex;gap:8px}.tc-head-actions button{min-height:36px;border:1px solid #33485e;border-radius:10px;background:#101d2a;color:#a7b8ca;padding:0 12px;font-size:12px;cursor:pointer}.tc-head-actions button:hover{filter:brightness(1.12)}.tc-head-actions .tc-back{border-color:#5b4f91;background:#201a38;color:#ddd5ff}',
      '.tc-scorebar{display:flex;gap:7px;padding:8px 12px;border-bottom:1px solid #1b2a39;background:#08131d;overflow-x:auto;scrollbar-width:none}.tc-scorebar::-webkit-scrollbar{display:none}.tc-stat{min-width:110px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border:1px solid #213447;border-radius:9px;background:#0c1824}.tc-stat span{font-size:11px;color:#74899f;white-space:nowrap}.tc-stat b{font-size:14px;color:#d4e1ef}',
      '.tc-body{min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(340px,.7fr);align-content:start;gap:12px;padding:12px}',
      '.tc-chart-card,.tc-panel,.tc-analysis{border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 8px 26px rgba(0,0,0,.18)}',
      '.tc-chart-card{min-height:590px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.tc-chart-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-bottom:1px solid #1e3042;background:#0b1723}.tc-chart-meta b{font-size:13px;color:#dce7f3}.tc-chart-meta span{font-size:11px;color:#7f93a8}.tc-chart-meta>span{padding:5px 8px;border-radius:999px;background:#131f2c;border:1px solid #293b4f}.tc-chart-foot{display:flex;justify-content:space-between;gap:8px;padding:9px 12px;border-top:1px solid #1e3042;background:#0a1520;font-size:11px;color:#71879e}.tc-chart-foot b{color:#b9cadc}#tc-chart{min-height:520px}',
      '.tc-panel{padding:14px;align-self:start}.tc-stage-track{display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;gap:7px;margin-bottom:13px}.tc-stage-track i{height:1px;background:#2b3d50}.tc-stage-track span{padding:5px 8px;border:1px solid #2b3d50;border-radius:999px;color:#71869d;background:#0a151f;font-size:10px;white-space:nowrap}.tc-stage-track span.active{border-color:#6b59b3;background:#211b3a;color:#ddd5ff}',
      '.tc-question-kicker{display:inline-flex;align-items:center;gap:6px;color:#9f90ea;font-size:10px;font-weight:750;letter-spacing:.7px}.tc-question h3{margin:7px 0 5px;font:700 20px/1.35 IBM Plex Sans Thai,Segoe UI,sans-serif;color:#eff5fc}.tc-question p{margin:0;color:#8397ad;font-size:12px;line-height:1.55}',
      '.tc-entry-price{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;padding:11px 12px;border:1px solid #294057;border-radius:11px;background:#0d1b28}.tc-entry-price span{font-size:11px;color:#71869d}.tc-entry-price b{font-size:19px;color:#edf4fb}',
      '.tc-helper{margin:12px 0;padding:11px;border:1px solid #463d70;border-radius:12px;background:linear-gradient(135deg,#17142a,#0d1b27)}.tc-helper-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.tc-helper-head b{font-size:12px;color:#dcd5ff}.tc-helper-head span{font-size:10px;color:#8579bb}.tc-helper-controls{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:8px}.tc-helper-controls select,.tc-helper-controls button{min-height:36px;border:1px solid #3d4f64;border-radius:9px;background:#101d2a;color:#afc0d1;padding:0 10px;font-size:11px}.tc-helper-controls .tc-assist{border-color:#6655aa;background:#261f45;color:#eee9ff;font-weight:700}.tc-helper-controls .tc-follow{grid-column:1/-1;border-color:#397561;background:#123027;color:#8ee4c2;font-weight:700}.tc-helper-controls .tc-follow:disabled{opacity:.38}',
      '.tc-reason-title{margin:12px 0 7px;font-size:11px;color:#8195aa}.tc-reasons{display:flex;flex-wrap:wrap;gap:6px}.tc-reason{min-height:31px;padding:0 10px;border:1px solid #30455b;border-radius:999px;background:#0f1d2b;color:#8ba0b6;font-size:11px;cursor:pointer}.tc-reason.active{border-color:#7764c6;background:#211a3a;color:#e4ddff}',
      '.tc-answers{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.tc-answer{height:62px;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer}.tc-high{border:1px solid #2e806a;background:linear-gradient(180deg,#11392f,#0f2e27);color:#78e3be}.tc-low{border:1px solid #91445a;background:linear-gradient(180deg,#3a1823,#2c131b);color:#ff94a9}.tc-answer:hover{filter:brightness(1.08)}.tc-skip{grid-column:1/-1;height:34px;border:1px solid #34485f;border-radius:9px;background:#101c29;color:#8297ae;font-size:11px;cursor:pointer}',
      '.tc-locked{margin-top:11px;padding:10px 11px;border:1px solid #4d426e;border-radius:10px;background:#18152b;color:#b9b0df;font-size:11px;line-height:1.5}.tc-reveal-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.tc-reveal-actions button{min-height:39px;border:1px solid #544778;border-radius:9px;background:#211b39;color:#ded6ff;font-size:11px;font-weight:700;cursor:pointer}.tc-progress{margin-top:10px}.tc-progress-head{display:flex;justify-content:space-between;font-size:10px;color:#7c91a8}.tc-progress-line{height:8px;margin-top:6px;border:1px solid #2a3c50;border-radius:99px;background:#07111b;overflow:hidden}.tc-progress-line i{display:block;width:0;height:100%;background:linear-gradient(90deg,#7765cb,#58b495);transition:width .22s}',
      '.tc-result{margin-top:12px;padding:12px;border:1px solid #2b5a4c;border-radius:12px;background:#0c231d}.tc-result.wrong{border-color:#673747;background:#26131a}.tc-result.equal{border-color:#5a5337;background:#211f14}.tc-result strong{display:block;font-size:16px;color:#7be1bc}.tc-result.wrong strong{color:#ff91a8}.tc-result.equal strong{color:#d8c77a}.tc-result span{display:block;margin-top:5px;font-size:11px;line-height:1.6;color:#9aada8}.tc-next{width:100%;height:42px;margin-top:9px;border:1px solid #526a93;border-radius:10px;background:#17263b;color:#e0ebf8;font-weight:750;font-size:12px;cursor:pointer}',
      '.tc-analysis{grid-column:1/-1;padding:14px 15px}.tc-analysis[hidden]{display:none}.tc-analysis-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:11px;border-bottom:1px solid #213446}.tc-analysis-title small{display:block;color:#8f7ce6;font-size:10px;font-weight:750;letter-spacing:.7px}.tc-analysis-title b{display:block;margin-top:3px;font-size:15px;color:#e3ecf6}.tc-analysis-note{padding:6px 9px;border:1px solid #30465d;border-radius:999px;background:#0d1925;color:#8094aa;font-size:10px;white-space:nowrap}',
      '.tc-analysis-empty{margin-top:11px;padding:12px;border:1px dashed #31465c;border-radius:10px;color:#8296ab;font-size:12px;line-height:1.55}.tc-analysis-hero{display:grid;grid-template-columns:180px 1fr;gap:9px;margin-top:11px}.tc-engine-call,.tc-engine-story{border:1px solid #293d51;border-radius:11px;background:#09141f;padding:11px}.tc-engine-call span{display:block;font-size:10px;color:#75899f}.tc-engine-call strong{display:block;margin-top:4px;font-size:27px;color:#edf4fb}.tc-engine-call small{display:block;margin-top:5px;color:#8ca0b4;font-size:11px;line-height:1.45}.tc-engine-story b{font-size:13px;color:#d5e0ec}.tc-engine-story p{margin:5px 0 0;color:#879aaf;font-size:12px;line-height:1.55}',
      '.tc-gates{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.tc-gate{padding:10px;border:1px solid #2a3d52;border-radius:10px;background:#09151f}.tc-gate.pass{border-color:#2c6653;background:#0d241e}.tc-gate.developing{border-color:#6b6035;background:#211d12}.tc-gate.block{border-color:#69394a;background:#25131a}.tc-gate span{display:block;font-size:10px;color:#75899e}.tc-gate b{display:block;margin:4px 0;font-size:12px;color:#d2dfec}.tc-gate p{margin:0;font-size:11px;line-height:1.45;color:#8b9eb1}',
      '.tc-analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.tc-analysis-box{padding:10px;border:1px solid #293d51;border-radius:10px;background:#09141e}.tc-analysis-box h4{margin:0 0 6px;font-size:11px;color:#ac9ff0}.tc-analysis-box p,.tc-analysis-box li{font-size:11px;line-height:1.55;color:#8b9eb2}.tc-analysis-box p{margin:0}.tc-analysis-box ul{margin:0;padding-left:17px}.tc-postmortem{margin-top:12px;border-top:1px solid #26394d;padding-top:12px}.tc-postmortem h4{margin:0 0 8px;font-size:13px;color:#d3deea}.tc-path-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.tc-path-stat{padding:9px;border:1px solid #2a3d50;border-radius:9px;background:#08131d}.tc-path-stat span{display:block;font-size:10px;color:#75899f}.tc-path-stat b{display:block;margin-top:3px;font-size:13px;color:#d4e2ef}.tc-post-note{margin-top:8px;padding:9px 10px;border:1px solid #454d38;border-radius:9px;background:#171b12;color:#aeb98f;font-size:10px;line-height:1.55}',
      '.tc-empty{grid-column:1/-1;display:grid;place-items:center;min-height:520px;text-align:center;padding:28px}.tc-empty div{max-width:430px}.tc-empty h3{margin:0 0 8px;font-size:20px}.tc-empty p{margin:0;color:#8195aa;font-size:12px;line-height:1.65}.tc-empty button{margin-top:14px;min-height:40px;padding:0 15px;border:1px solid #5d4fa0;border-radius:10px;background:#201a3b;color:#ded7ff;font-size:12px}',
      '@media(max-width:920px){.tc-body{grid-template-columns:1fr}.tc-chart-card{min-height:510px}#tc-chart{min-height:440px}.tc-panel{order:2}.tc-analysis{order:3}.tc-gates{grid-template-columns:repeat(2,1fr)}}',
      '@media(max-width:600px){#ten-candle-dialog{width:calc(100vw - 6px);height:calc(100dvh - 6px);max-height:calc(100dvh - 6px);border-radius:13px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y}.tc-shell{height:auto;min-height:100%;display:block}.tc-head{position:sticky;top:0;z-index:20;padding:10px 11px}.tc-scorebar{position:sticky;top:57px;z-index:19}.tc-body{overflow:visible;min-height:auto}.tc-chart-card,.tc-panel,.tc-analysis{scroll-margin-top:112px}.tc-head{padding:10px 11px}.tc-title h2{font-size:17px}.tc-title small{font-size:9px}.tc-mode-pill{display:none}.tc-head-actions button{min-height:33px;padding:0 9px;font-size:10px}.tc-head-actions #tc-reset-score{display:none}.tc-scorebar{padding:6px 8px}.tc-stat{min-width:96px;padding:6px 8px}.tc-stat span{font-size:10px}.tc-stat b{font-size:12px}.tc-body{padding:8px;gap:8px}.tc-chart-card{min-height:390px}#tc-chart{min-height:325px}.tc-chart-meta{padding:9px 10px}.tc-chart-meta>span{font-size:9px}.tc-chart-foot{font-size:9px}.tc-panel{padding:11px}.tc-stage-track span{font-size:9px;padding:4px 6px}.tc-question h3{font-size:17px}.tc-question p{font-size:11px}.tc-helper-controls{grid-template-columns:1fr}.tc-helper-controls .tc-follow{grid-column:auto}.tc-answers{gap:6px}.tc-answer{height:56px;font-size:14px}.tc-analysis{padding:11px}.tc-analysis-head{align-items:flex-start;flex-direction:column}.tc-analysis-note{white-space:normal}.tc-analysis-hero,.tc-analysis-grid{grid-template-columns:1fr}.tc-gates{grid-template-columns:1fr}.tc-path-grid{grid-template-columns:repeat(2,1fr)}}'
    ].join('\n');document.head.append(style);
  }
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='ten-candle-dialog';
    dialog.innerHTML=[
      '<div class="tc-shell">',
        '<header class="tc-head"><div class="tc-title-row"><div class="tc-title"><small>10-CANDLE CHALLENGE</small><h2>เดา 10 แท่งแบบไม่เห็นอนาคต</h2></div><span class="tc-mode-pill" id="tc-mode-pill">BTC · 1m · 10 แท่ง = 10 นาที</span></div><div class="tc-head-actions"><button type="button" id="tc-reset-score">ล้างคะแนน</button><button type="button" class="tc-back" id="tc-close">กลับหน้า Train</button></div></header>',
        '<div class="tc-scorebar"><div class="tc-stat"><span>เล่นแล้ว</span><b id="tc-stat-played">0</b></div><div class="tc-stat"><span>ถูก</span><b id="tc-stat-correct">0</b></div><div class="tc-stat"><span>ความแม่น</span><b id="tc-stat-accuracy">0%</b></div><div class="tc-stat"><span>Streak</span><b id="tc-stat-streak">0</b></div><div class="tc-stat"><span>Best</span><b id="tc-stat-best">0</b></div></div>',
        '<main class="tc-body" id="tc-body">',
          '<section class="tc-chart-card" id="tc-chart-card"><div class="tc-chart-meta"><div><b>กราฟโจทย์</b><span> · 100 แท่งก่อนจุดตัด</span></div><span id="tc-round-label">อนาคตถูกซ่อน 10 แท่ง</span></div><div id="tc-chart"></div><div class="tc-chart-foot"><span>เวลาและแท่งอนาคตจะยังไม่เปิดก่อนตอบ</span><b id="tc-reveal-count">เปิดแล้ว 0 / 10</b></div></section>',
          '<aside class="tc-panel" id="tc-panel">',
            '<div class="tc-stage-track"><span id="tc-stage-guess" class="active">1 · เดา</span><i></i><span id="tc-stage-reveal">2 · เปิดกราฟ</span><i></i><span id="tc-stage-review">3 · เฉลย</span></div>',
            '<div class="tc-question"><span class="tc-question-kicker">โจทย์รอบนี้</span><h3>อีก 10 แท่ง ราคาจะปิดสูงหรือต่ำกว่าจุดนี้?</h3><p id="tc-question-sub">เลือกเองได้เลย หรือให้ ARIS ช่วยอ่านก่อนตอบในชุด 1m</p></div>',
            '<div class="tc-entry-price"><span>ราคาอ้างอิง</span><b id="tc-entry-price">—</b></div>',
            '<div class="tc-helper"><div class="tc-helper-head"><b>✦ ARIS Assist</b><span id="tc-helper-mode">ตัวช่วยก่อนตอบ</span></div><div class="tc-helper-controls"><select id="tc-engine-select" aria-label="เครื่องยนต์ช่วยวิเคราะห์"></select><button type="button" class="tc-assist" id="tc-analyze">วิเคราะห์จุดนี้</button><button type="button" class="tc-follow" id="tc-follow-engine" disabled>เลือกตาม ARIS</button></div></div>',
            '<div class="tc-reason-title">เหตุผลของซูโม่ <span style="opacity:.65">· เลือกได้หลายอัน</span></div><div class="tc-reasons" id="tc-reasons"></div>',
            '<div class="tc-answers" id="tc-answers"><button class="tc-answer tc-high" data-tc-answer="HIGH">HIGH<br><span style="font-size:11px;font-weight:600;opacity:.8">ปิดสูงกว่า</span></button><button class="tc-answer tc-low" data-tc-answer="LOW">LOW<br><span style="font-size:11px;font-weight:600;opacity:.8">ปิดต่ำกว่า</span></button><button class="tc-skip" data-tc-answer="SKIP">ขอผ่านข้อนี้</button></div>',
            '<div class="tc-locked" id="tc-locked" hidden></div><div class="tc-reveal-actions" id="tc-reveal-actions" hidden><button type="button" id="tc-reveal-start">▶ เปิดทีละแท่ง</button><button type="button" id="tc-reveal-all">เปิดครบ 10 ทันที</button></div><div class="tc-progress" id="tc-progress" hidden><div class="tc-progress-head"><span>กำลังเปิดอนาคต</span><b id="tc-progress-text">0 / 10</b></div><div class="tc-progress-line"><i id="tc-progress-bar"></i></div></div><div class="tc-result" id="tc-result" hidden></div><button type="button" class="tc-next" id="tc-next" hidden>ข้อต่อไป →</button>',
          '</aside>',
          '<section class="tc-analysis" id="tc-analysis" hidden><div class="tc-analysis-head"><div class="tc-analysis-title"><small>ARIS ANALYSIS · BEFORE FUTURE</small><b>สิ่งที่เครื่องยนต์เห็นก่อนเปิด 10 แท่ง</b></div><span class="tc-analysis-note">ใช้ข้อมูลถึงจุดตัดเท่านั้น</span></div><div id="tc-analysis-content"></div></section>',
        '</main>',
      '</div>'
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
    byId('tc-follow-engine').addEventListener('click',()=>{const d=round?.engineAnalysis?.decision;if(!round?.answer&&(d==='HIGH'||d==='LOW'))choose(d);});
    byId('tc-engine-select').addEventListener('change',()=>{
      engineVersion=byId('tc-engine-select').value||'ARIS-3.1.0';
      if(round&&!round.answer){
        round.engineVersionAtRound=engineVersion;round.engineAnalysis=null;renderAnalysisEmpty();
        const targetRound=round;
        targetRound.enginePrime=engineAnalysisAt(round.index,engineVersion).then(a=>{if(round===targetRound&&!targetRound.engineAnalysis)targetRound.engineAnalysis=a;return a;}).catch(err=>{console.error('Challenge engine re-prime failed',err);return null;});
      }
    });
    return dialog;
  }
  function setStage(stage){
    [['tc-stage-guess',1],['tc-stage-reveal',2],['tc-stage-review',3]].forEach(([id,n])=>byId(id)?.classList.toggle('active',n===stage));
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
    let v='ARIS-3.1.0';
    try{
      let saved=localStorage.getItem('btc-active-engine-version-aris-v2');
      const migration='aris-default-engine-v31-20261002';
      if(!localStorage.getItem(migration)&&(!saved||saved==='ARIS-3.0.0')){
        saved='ARIS-3.1.0';
        localStorage.setItem('btc-active-engine-version-aris-v2',saved);
        localStorage.setItem(migration,'1');
      }
      if(saved)v=saved;
    }catch{}
    const map={'6.5.0':'6.6.0','7.0.0':'7.2.0','7.0.1':'7.2.0','7.1.0':'7.2.0','7.1.1':'7.2.0','ARIS-1.0.0':'ARIS-1.2.0','ARIS-1.1.0':'ARIS-1.2.0'};v=map[v]||v;
    return supported.has(v)?v:(supported.has('ARIS-3.1.0')?'ARIS-3.1.0':[...supported][0]||'ARIS-3.1.0');
  }
  function setupEngineSelect(){
    const sel=byId('tc-engine-select'),registry=globalThis.TrainingEngineRegistryV1;if(!sel||!registry)return;
    sel.innerHTML=(registry.supported||[]).map(x=>'<option value="'+esc(x.version)+'">'+esc(x.label||x.version)+'</option>').join('');
    engineVersion=resolveLiveEngineVersion();sel.value=engineVersion;sel.disabled=!assistAvailable();
    const analyze=byId('tc-analyze'),mode=byId('tc-helper-mode');
    if(analyze)analyze.disabled=!assistAvailable();
    if(mode)mode.textContent=assistAvailable()?'ตัวช่วยก่อนตอบ':'Assist ใช้กับ Session 1m เท่านั้น';
  }
  function analysisStory(view){return view?.v3Story||view?.phase?.v3View?.story||view?.v2Story||view?.phase?.v2View?.story||view?.v4Story||view?.phase?.v4View?.story||null;}
  function normalizeDirection(v){return v==='HIGH'||v==='LOW'?v:null;}
  function analysisBias(view,story){return normalizeDirection(story?.direction)||normalizeDirection(view?.gate?.direction)||normalizeDirection(view?.watch?.direction)||normalizeDirection(view?.phase?.v3View?.direction)||normalizeDirection(view?.phase?.v2View?.direction)||null;}
  function analysisDecision(view){
    const signalDir=normalizeDirection(view?.signal?.direction);
    if(signalDir)return signalDir;
    const gateState=String(view?.gate?.state||'').toUpperCase();
    if(gateState==='ENTER')return normalizeDirection(view?.gate?.direction);
    return null;
  }
  async function engineAnalysisAt(index,version){
    if(!assistAvailable())throw new Error('ARIS Assist รองรับ Dataset 1m เท่านั้น');
    const registry=globalThis.TrainingEngineRegistryV1;if(!registry)throw new Error('Training Engine Registry ไม่พร้อม');
    const loaded=await registry.load(version),Core=loaded.Core;if(!Core?.Engine)throw new Error('โหลดเครื่องยนต์ไม่สำเร็จ');
    const engine=new Core.Engine({}),recent=[],agg5=makeAggregate(5),agg15=makeAggregate(15),start=Math.max(0,index-ENGINE_WARMUP+1);
    let latest=null;
    for(let i=start;i<=index;i++){
      const bar=bars[i],eb=toEngineBar(bar),logicalClose=Number(bar.time)+MINUTE;recent.push(eb);if(recent.length>220)recent.splice(0,recent.length-220);updateAggregate(agg5,bar);updateAggregate(agg15,bar);bridgeContinuity(engine,i>start?Number(bars[i-1].close):Number(bar.open),logicalClose);
      for(const off of [0,400,800])latest=engine.step(engineInput(recent,agg5,agg15,bar,eb,logicalClose+off,'CHALLENGE:'+index+':'+i+':'+off))||latest;
    }
    const story=analysisStory(latest),decision=analysisDecision(latest),bias=analysisBias(latest,story);
    return {version,view:latest,story,decision,bias,direction:decision,status:latest?.status||'—',reason:latest?.reason||story?.summary||'ยังไม่มีคำอธิบาย'};
  }
  function gateLabel(k){return ({structure:'โครงสร้างราคา',location:'ตำแหน่งราคา',behavior:'พฤติกรรมแท่ง',micro:'แรงซื้อขายระยะสั้น'})[k]||k;}
  function gateHtml(story){
    const g=story?.gates;if(!g)return '';
    return '<div class="tc-gates">'+['structure','location','behavior','micro'].map(k=>{const x=g[k]||{},state=String(x.state||'—'),cls=state==='PASS'?'pass':state==='DEVELOPING'?'developing':state==='BLOCK'?'block':'';return '<div class="tc-gate '+cls+'"><span>'+esc(gateLabel(k))+'</span><b>'+esc(state)+'</b><p>'+esc(x.reason||'ยังไม่มีรายละเอียด')+'</p></div>';}).join('')+'</div>';
  }
  function listHtml(rows,empty){const a=(rows||[]).filter(Boolean).slice(0,6);return a.length?'<ul>'+a.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>'+esc(empty)+'</p>';}
  function renderAnalysisEmpty(){
    const section=byId('tc-analysis');if(section)section.hidden=true;
    const c=byId('tc-analysis-content');if(c)c.innerHTML='';
    const follow=byId('tc-follow-engine');if(follow){follow.disabled=true;follow.textContent='เลือกตาม ARIS';}
  }
  function renderEngineAnalysis(a){
    if(!a)return renderAnalysisEmpty();
    const section=byId('tc-analysis');if(section)section.hidden=false;
    const c=byId('tc-analysis-content'),st=a.story,v=a.view||{},dir=a.decision||'WATCH',bias=a.bias||null,gateCount=st?((st.gatePassed??0)+'/'+(st.gateTotal??4)):'—';
    const fib=st?.fib,htf=st?.htf;
    const fibText=fib?.valid?((fib.extension>1?'ต่อขา '+(fib.extension*100).toFixed(1)+'% · '+(fib.extensionZone||''):'ย่อ '+Math.max(0,fib.retracement*100).toFixed(1)+'% · '+(fib.retraceZone||''))+(fib.confluence?' · มี Confluence':'')):'ยังไม่มี Fib swing ที่ยืนยัน';
    const htfText='5m '+(htf?.m5?.available?(htf.m5.dir>0?'ขึ้น':htf.m5.dir<0?'ลง':'กลาง'):'—')+' · 15m '+(htf?.m15?.available?(htf.m15.dir>0?'ขึ้น':htf.m15.dir<0?'ลง':'กลาง'):'—');
    c.innerHTML='<div class="tc-analysis-hero"><div class="tc-engine-call"><span>'+esc(a.version)+' · '+esc(a.status)+'</span><strong>'+esc(dir)+'</strong><small>'+(bias?('Bias '+esc(bias)+' · '):'')+(st?('Gate '+esc(gateCount)+' · '+esc(st.entryState||'OBSERVE')):esc(v?.gate?.state||v?.status||'OBSERVE'))+'</small></div><div class="tc-engine-story"><b>'+esc(st?.stateLabel||v?.phase?.phase||'ภาพตลาด')+(st?.playbookLabel?' · '+esc(st.playbookLabel):'')+'</b><p>'+esc(st?.summary||a.reason)+'</p></div></div>'+
      gateHtml(st)+
      '<div class="tc-analysis-grid"><div class="tc-analysis-box"><h4>หลักฐานที่หนุน</h4>'+listHtml(st?.supports,'ยังไม่มีหลักฐานหนุนที่เครื่องยนต์จัดเป็นข้อเด่น')+'</div><div class="tc-analysis-box"><h4>สิ่งที่ยังขวาง / ต้องระวัง</h4>'+listHtml(st?.warnings||st?.blocked,'ยังไม่มีคำเตือนเด่น')+'</div><div class="tc-analysis-box"><h4>Fib / ภาพใหญ่</h4><p>'+esc(fibText)+'<br>'+esc(htfText)+'</p></div><div class="tc-analysis-box"><h4>แผนต่อจากนี้</h4><p>'+esc(st?.trigger||v?.gate?.blocker||'รอดูพฤติกรรมต่อ')+(st?.invalidation?'<br>เสียแผน: '+esc(st.invalidation):'')+(st?.nextPlan?'<br>ถัดไป: '+esc(st.nextPlan):'')+'</p></div></div><div id="tc-postmortem"></div>';
    const follow=byId('tc-follow-engine');if(follow){follow.disabled=!!round?.answer||!(a.decision==='HIGH'||a.decision==='LOW');follow.textContent=a.decision?'เลือกตาม ARIS · '+a.decision:(a.bias?'ARIS WATCH · Bias '+a.bias:'ARIS ยัง WATCH');}
  }
  async function analyzeCurrent(){
    if(!round||analysisBusy)return;
    if(!assistAvailable()){const c=byId('tc-analysis-content');const section=byId('tc-analysis');if(section)section.hidden=false;if(c)c.innerHTML='<div class="tc-analysis-empty">Session '+esc(session?.interval||'')+' เล่นเกม 10 แท่งได้ตามปกติ แต่ ARIS Assist รุ่นนี้ยึดโครงสร้าง Historical 1m จึงไม่ฝืนวิเคราะห์ TF อื่นค่ะ</div>';return;}
    analysisBusy=true;const section=byId('tc-analysis');if(section)section.hidden=false;const c=byId('tc-analysis-content');if(c)c.innerHTML='<div class="tc-analysis-empty">ARIS กำลัง Replay ข้อมูลถึงจุดนี้และอ่านสถานการณ์…</div>';const btn=byId('tc-analyze');if(btn){btn.disabled=true;btn.textContent='กำลังวิเคราะห์…';}
    try{
      let a=round.engineAnalysis;
      if(!a||round.engineVersionAtRound!==engineVersion){
        round.engineVersionAtRound=engineVersion;
        a=await engineAnalysisAt(round.index,engineVersion);
        round.engineAnalysis=a;
      }else if(round.enginePrime){
        a=await round.enginePrime||a;round.engineAnalysis=a||round.engineAnalysis;
      }
      renderEngineAnalysis(round.engineAnalysis);if(round.finished)renderPostmortem();
    }
    catch(err){console.error('Challenge engine analysis failed',err);const c=byId('tc-analysis-content');if(c)c.innerHTML='<div class="tc-analysis-empty">วิเคราะห์ไม่สำเร็จ · '+esc(err?.message||err)+'</div>';}
    finally{analysisBusy=false;if(btn){btn.disabled=false;btn.textContent='วิเคราะห์จุดนี้';}if(byId('tc-analysis')&&!byId('tc-analysis').hidden)byId('tc-analysis').scrollIntoView({behavior:'smooth',block:'nearest'});}
  }
  function renderPostmortem(target=round){
    const host=byId('tc-postmortem');if(!host||!target?.finished)return;
    const entry=Number(target.entry.close),future=target.future||[],finish=Number(future.at(-1)?.close);
    const high=Math.max(...future.map(x=>Number(x.high))),low=Math.min(...future.map(x=>Number(x.low)));
    const up=high-entry,down=entry-low,greens=future.filter(x=>Number(x.close)>Number(x.open)).length,reds=future.filter(x=>Number(x.close)<Number(x.open)).length;
    const actual=outcome(entry,finish),delta=finish-entry,a=target.engineAnalysis;
    const decision=a?.decision||null,bias=a?.bias||null;
    const engineBefore=decision?('แนะนำ '+decision):(bias?('WATCH · Bias '+bias):'WATCH · ยังไม่เลือกฝั่ง');
    const userHit=actual==='EQUAL'?null:target.answer===actual;
    const engineHit=decision?(actual==='EQUAL'?null:decision===actual):null;
    const c1=Number(future[0]?.close),c3=Number(future[2]?.close),c5=Number(future[4]?.close);
    const compare=finish===entry?'=':finish>entry?'>':'<';
    const verdictReason='แท่งที่ 10 ปิด '+money(finish)+' '+compare+' ราคาอ้างอิง '+money(entry)+' จึงเฉลย '+actual;
    host.innerHTML='<div class="tc-postmortem"><h4>เฉลยจริง · ตัดสินจากราคาปิดแท่งที่ 10 เท่านั้น</h4>'+
      '<div class="tc-path-grid"><div class="tc-path-stat"><span>ซูโม่ตอบ</span><b>'+esc(target.answer)+(userHit===true?' ✅':userHit===false?' ❌':'')+'</b></div><div class="tc-path-stat"><span>ARIS ก่อนตอบ</span><b>'+esc(engineBefore)+(engineHit===true?' ✅':engineHit===false?' ❌':'')+'</b></div><div class="tc-path-stat"><span>เฉลย T+10</span><b>'+esc(actual)+'</b></div><div class="tc-path-stat"><span>ราคาเปลี่ยน</span><b>'+(delta>=0?'+':'')+money(delta)+'</b></div></div>'+
      '<div class="tc-analysis-grid"><div class="tc-analysis-box"><h4>เหตุผลของเฉลย</h4><p>'+esc(verdictReason)+'</p></div><div class="tc-analysis-box"><h4>สถานะ ARIS ก่อนตอบ</h4><p>'+esc(a?((a.version||'ARIS')+' · '+engineBefore+' · '+(a.status||'—')):'ไม่มี snapshot เครื่องยนต์')+'</p></div></div>'+
      '<div class="tc-path-grid"><div class="tc-path-stat"><span>สูงสุดระหว่าง 10 แท่ง</span><b>'+money(high)+' <small>(+'+money(up)+')</small></b></div><div class="tc-path-stat"><span>ต่ำสุดระหว่าง 10 แท่ง</span><b>'+money(low)+' <small>(-'+money(down)+')</small></b></div><div class="tc-path-stat"><span>เขียว / แดง</span><b>'+greens+' / '+reds+'</b></div><div class="tc-path-stat"><span>T+1 / T+3 / T+5 / T+10</span><b>'+money(c1)+' / '+money(c3)+' / '+money(c5)+' / '+money(finish)+'</b></div></div>'+
      '<div class="tc-post-note">เฉลยไม่ได้ใช้ความเห็นของ ARIS: ใช้ราคาอ้างอิงกับ Close ของแท่งที่ 10 เท่านั้น ส่วน ARIS คือ snapshot ก่อนตอบเพื่อเอาไปเทียบและเรียนรู้ภายหลังค่ะ</div></div>';
  }
  async function ensurePostAnalysis(target=round){
    if(!target)return;
    if(assistAvailable()){
      if(!target.engineAnalysis&&target.enginePrime){const a=await target.enginePrime;if(a)target.engineAnalysis=a;}
      if(!target.engineAnalysis){
        try{target.engineAnalysis=await engineAnalysisAt(target.index,target.engineVersionAtRound||engineVersion);}catch(err){console.error('Challenge result snapshot failed',err);}
      }
    }
    saveRoundHistory(target);
    if(round!==target)return;
    if(target.engineAnalysis){
      const section=byId('tc-analysis');if(section)section.hidden=false;
      renderEngineAnalysis(target.engineAnalysis);
    }
    renderPostmortem(target);
  }
  async function resolveSession(preferredId){
    const api=globalThis.HistoricalDataV1;if(!api)throw new Error('HistoricalDataV1 ไม่พร้อม');
    if(preferredId){const preferred=await api.getSession(preferredId);if(preferred?.datasetId&&Number(preferred.loadedBars)>=CONTEXT_BARS+FUTURE_BARS+5)return preferred;}
    const rows=await api.listSessions(30);return rows.find(s=>s?.datasetId&&['ready','quality_warning'].includes(s.status)&&Number(s.loadedBars)>=CONTEXT_BARS+FUTURE_BARS+5)||null;
  }
  function eligibleIndexes(){
    const warm=assistAvailable()?Math.max(CONTEXT_BARS,ENGINE_WARMUP):CONTEXT_BARS,step=intervalMs();
    if(!session||bars.length<warm+FUTURE_BARS+2)return [];
    const minTime=Number(session.analysisStart)||-Infinity,maxTime=Number(session.analysisEnd)||Infinity,out=[];
    for(let i=warm-1;i<bars.length-FUTURE_BARS;i++){
      if(bars[i].time<minTime||bars[i+FUTURE_BARS].time>maxTime)continue;
      let ok=true;for(let j=i-CONTEXT_BARS+2;j<=i+FUTURE_BARS;j++){if(Number(bars[j].time)-Number(bars[j-1].time)!==step){ok=false;break;}}
      if(ok)out.push(i);
    }return out;
  }
  function pickIndex(){let c=eligibleIndexes().filter(i=>!used.has(i));if(!c.length){used.clear();c=eligibleIndexes();}if(!c.length)return null;const i=c[Math.floor(Math.random()*c.length)];used.add(i);return i;}
  function initChart(){
    const host=byId('tc-chart');if(!host||!globalThis.LightweightCharts)return false;
    if(chart){try{chart.remove();}catch{}chart=null;}
    series=emaFastSeries=emaSlowSeries=rsiSeries=rsiUpper=rsiLower=macdHistSeries=macdSeries=macdSignalSeries=entryPriceLine=entryMarkerApi=null;
    const L=globalThis.LightweightCharts,opt={lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false};
    const mobileTouch=window.matchMedia?.('(max-width: 600px)')?.matches===true;chart=L.createChart(host,{width:Math.max(300,host.clientWidth),height:Math.max(280,host.clientHeight),layout:{background:{type:'solid',color:'#09131e'},textColor:'#8297ad',panes:{separatorColor:'#243043',separatorHoverColor:'#3a4b63',enableResize:true}},grid:{vertLines:{color:'#122231'},horzLines:{color:'#122231'}},rightPriceScale:{borderColor:'#25384c'},timeScale:{visible:false,borderColor:'#25384c',timeVisible:false,secondsVisible:false,rightOffset:4,barSpacing:7},handleScroll:mobileTouch?{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false}:undefined,handleScale:mobileTouch?{axisPressedMouseMove:true,mouseWheel:true,pinch:true}:undefined,crosshair:{mode:L.CrosshairMode?.Normal??0}});
    series=chart.addSeries(L.CandlestickSeries,{upColor:'#43d8ad',downColor:'#ff6f8c',borderVisible:false,wickUpColor:'#43d8ad',wickDownColor:'#ff6f8c',priceFormat:{type:'price',precision:2,minMove:.01}});
    emaFastSeries=chart.addSeries(L.LineSeries,{...opt,color:'#a899ff'});
    emaSlowSeries=chart.addSeries(L.LineSeries,{...opt,color:'#dfb875'});
    rsiSeries=chart.addSeries(L.LineSeries,{...opt,color:'#a899ff',priceFormat:{type:'price',precision:1,minMove:.1}},1);
    rsiUpper=chart.addSeries(L.LineSeries,{...opt,color:'#5f6c80',lineStyle:L.LineStyle.Dashed},1);
    rsiLower=chart.addSeries(L.LineSeries,{...opt,color:'#5f6c80',lineStyle:L.LineStyle.Dashed},1);
    rsiSeries.priceScale().applyOptions({scaleMargins:{top:.12,bottom:.12}});
    macdHistSeries=chart.addSeries(L.HistogramSeries,{lastValueVisible:false,priceLineVisible:false,priceFormat:{type:'price',precision:2,minMove:.01}},2);
    macdSeries=chart.addSeries(L.LineSeries,{...opt,color:'#72b7ff',priceFormat:{type:'price',precision:2,minMove:.01}},2);
    macdSignalSeries=chart.addSeries(L.LineSeries,{...opt,color:'#dfb875',priceFormat:{type:'price',precision:2,minMove:.01}},2);
    macdHistSeries.createPriceLine({price:0,color:'#536176',lineWidth:1,lineStyle:L.LineStyle.Dashed,axisLabelVisible:false,title:''});
    macdHistSeries.priceScale().applyOptions({scaleMargins:{top:.15,bottom:.15}});
    const panes=chart.panes();if(panes[0])panes[0].setStretchFactor(5);if(panes[1])panes[1].setStretchFactor(1.35);if(panes[2])panes[2].setStretchFactor(1.55);
    if(resizeObserver)resizeObserver.disconnect();resizeObserver=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(chart&&r?.width>0&&r.height>0)chart.resize(r.width,r.height);});resizeObserver.observe(host);return true;
  }
  function restoreGameBody(){if(byId('tc-chart'))return;dialog.remove();dialog=null;chart=null;series=emaFastSeries=emaSlowSeries=rsiSeries=rsiUpper=rsiLower=macdHistSeries=macdSeries=macdSignalSeries=entryPriceLine=entryMarkerApi=null;ensureDialog();if(!dialog.open)dialog.showModal();}
  async function loadSession(preferredId){
    session=await resolveSession(preferredId);
    if(!session){showEmpty('ยังไม่มีกราฟย้อนหลังสำหรับเล่น','โหลดข้อมูลย้อนหลังอย่างน้อย 1 ชุดในหน้า Train ก่อน แล้วกดเข้าเกมใหม่ค่ะ');return false;}
    bars=(await globalThis.HistoricalDataV1.getDatasetBars(session.datasetId)).filter(b=>Number.isFinite(Number(b.time))).sort((a,b)=>a.time-b.time);
    const need=(assistAvailable()?ENGINE_WARMUP:CONTEXT_BARS)+FUTURE_BARS+2;
    if(bars.length<need){showEmpty('ข้อมูลยังสั้นเกินไป','ชุด '+marketLabel(session.symbol)+' '+(session.interval||'1m')+' ต้องมีอย่างน้อย '+need+' แท่งสำหรับเกมนี้ค่ะ');return false;}
    stats=loadStats(session);syncSessionUi();
    return true;
  }
  function resetRoundUi(){
    selectedReasons.clear();document.querySelectorAll('#tc-reasons .tc-reason').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#tc-answers button').forEach(b=>b.disabled=false);
    byId('tc-answers').hidden=false;byId('tc-locked').hidden=true;byId('tc-reveal-actions').hidden=true;byId('tc-progress').hidden=true;byId('tc-result').hidden=true;byId('tc-result').className='tc-result';byId('tc-next').hidden=true;byId('tc-progress-bar').style.width='0%';byId('tc-progress-text').textContent='0 / 10';byId('tc-reveal-count').textContent='เปิดแล้ว 0 / 10';byId('tc-reveal-start').disabled=false;setStage(1);renderAnalysisEmpty();
    if(byId('tc-analyze')){byId('tc-analyze').disabled=!assistAvailable();byId('tc-analyze').textContent=assistAvailable()?'วิเคราะห์จุดนี้':'Assist เฉพาะ 1m';}
    if(byId('tc-engine-select'))byId('tc-engine-select').disabled=!assistAvailable();
  }
  function newRound(){
    clearReveal();const idx=pickIndex();if(idx===null){showEmpty('หาโจทย์ที่ต่อเนื่องไม่พอ','ชุดข้อมูลนี้มีช่วงขาดของแท่งมากเกินไป ลองโหลด Session ใหม่ค่ะ');return;}
    round={index:idx,entry:bars[idx],future:bars.slice(idx+1,idx+1+FUTURE_BARS),answer:null,revealed:0,finished:false,engineAnalysis:null,engineVersionAtRound:engineVersion,enginePrime:null};resetRoundUi();byId('tc-entry-price').textContent=money(round.entry.close);byId('tc-round-label').textContent='ซ่อนอนาคต 10 แท่ง · '+horizonText();
    if(!chart||!series)initChart();clearEntryCue();const visible=bars.slice(idx-CONTEXT_BARS+1,idx+1);series.setData(visible.map(chartBar));setChallengeIndicators(visible);chart.timeScale().fitContent();
    if(assistAvailable()){
      const targetRound=round;
      targetRound.enginePrime=engineAnalysisAt(idx,targetRound.engineVersionAtRound).then(a=>{if(round===targetRound&&!targetRound.engineAnalysis)targetRound.engineAnalysis=a;return a;}).catch(err=>{console.error('Challenge pre-answer engine snapshot failed',err);return null;});
    }
  }
  function choose(answer){
    if(!round||round.answer)return;if(answer==='SKIP'){stats.skipped++;saveStats();renderStats();newRound();return;}
    round.answer=answer;round.reasons=[...selectedReasons];round.lockedAt=Date.now();document.querySelectorAll('#tc-answers button').forEach(b=>b.disabled=true);if(byId('tc-follow-engine'))byId('tc-follow-engine').disabled=true;byId('tc-locked').hidden=false;byId('tc-locked').textContent='ล็อกคำตอบแล้ว: '+answer+(round.reasons.length?' · เหตุผล '+round.reasons.join(' / '):' · ไม่ได้เลือกเหตุผล');setStage(2);byId('tc-reveal-actions').hidden=false;byId('tc-progress').hidden=false;byId('tc-round-label').textContent='คำตอบถูกล็อก · ยังไม่เห็นผล';
  }
  function clearReveal(){if(revealTimer){clearInterval(revealTimer);revealTimer=null;}}
  function revealOne(){
    if(!round||!round.answer||round.finished)return;if(round.revealed>=FUTURE_BARS){finishRound();return;}
    series.update(chartBar(round.future[round.revealed]));round.revealed++;setChallengeIndicators(visibleRoundBars());byId('tc-progress-bar').style.width=(round.revealed/FUTURE_BARS*100)+'%';byId('tc-progress-text').textContent=round.revealed+' / '+FUTURE_BARS;byId('tc-reveal-count').textContent='เปิดแล้ว '+round.revealed+' / '+FUTURE_BARS;byId('tc-round-label').textContent='กำลังเปิดอนาคต · '+round.revealed+'/10';chart.timeScale().scrollToRealTime();if(round.revealed>=FUTURE_BARS)finishRound();
  }
  function startReveal(){if(revealTimer||!round?.answer)return;byId('tc-reveal-start').disabled=true;revealTimer=setInterval(()=>{revealOne();if(round?.finished){clearReveal();byId('tc-reveal-start').disabled=false;}},520);}
  function revealAll(){if(!round?.answer)return;clearReveal();while(round&&!round.finished&&round.revealed<FUTURE_BARS)revealOne();byId('tc-reveal-start').disabled=false;}
  function updateReasonStats(correct){for(const r of round.reasons||[]){const row=stats.reasons[r]||{played:0,correct:0};row.played++;if(correct)row.correct++;stats.reasons[r]=row;}}
  function saveRoundHistory(target=round){
    if(!trainingEligible())return;
    if(!target?.finished||target.historySaved)return;
    const future=target.future||[],entry=Number(target.entry.close),finish=Number(future.at(-1)?.close);
    if(!Number.isFinite(entry)||!Number.isFinite(finish)||future.length<FUTURE_BARS)return;
    const actual=outcome(entry,finish),a=target.engineAnalysis,st=a?.story||null;
    const high=Math.max(...future.map(x=>Number(x.high))),low=Math.min(...future.map(x=>Number(x.low)));
    const record={
      schema:'ten-candle-challenge-round-v2',savedAt:Date.now(),sessionId:session?.id||null,datasetId:session?.datasetId||null,
      symbol:session?.symbol||'BTCUSDT',interval:session?.interval||'1m',horizonBars:FUTURE_BARS,horizonMs:intervalMs()*FUTURE_BARS,
      cutoffTime:Number(target.entry.time),referencePrice:entry,user:{answer:target.answer,reasons:[...(target.reasons||[])],lockedAt:target.lockedAt||null},
      engine:{version:a?.version||target.engineVersionAtRound||null,decision:a?.decision||null,bias:a?.bias||null,status:a?.status||null,reason:a?.reason||null,state:st?.state||null,stateLabel:st?.stateLabel||null,playbook:st?.playbook||null,playbookLabel:st?.playbookLabel||null,entryState:st?.entryState||null,gatePassed:st?.gatePassed??null,gateTotal:st?.gateTotal??null},
      outcome:{actual,t10Close:finish,delta:finish-entry,high,low,maxUp:high-entry,maxDown:entry-low,t1:Number(future[0]?.close),t3:Number(future[2]?.close),t5:Number(future[4]?.close),t10:finish,greenBars:future.filter(x=>Number(x.close)>Number(x.open)).length,redBars:future.filter(x=>Number(x.close)<Number(x.open)).length},
      correct:actual==='EQUAL'?null:target.answer===actual
    };
    target.historySaved=true;saveHistoryRecord(record);
  }

  function finishRound(){
    if(!round||round.finished)return;clearReveal();round.finished=true;showEntryCue();
    const finish=round.future[FUTURE_BARS-1],actual=outcome(Number(round.entry.close),Number(finish.close)),scored=actual!=='EQUAL',correct=scored&&round.answer===actual;
    if(scored){stats.played++;if(correct){stats.correct++;stats.streak++;stats.bestStreak=Math.max(stats.bestStreak,stats.streak);}else{stats.wrong++;stats.streak=0;}updateReasonStats(correct);}saveStats();renderStats();
    const delta=Number(finish.close)-Number(round.entry.close),result=byId('tc-result');result.hidden=false;result.className=actual==='EQUAL'?'tc-result equal':'tc-result'+(correct?'':' wrong');
    const when=new Date(Number(round.entry.time)).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const title=actual==='EQUAL'?'เฉลย: เสมอ · ไม่นับคะแนน':correct?'ซูโม่ถูก ✅ · เฉลย '+actual:'ซูโม่ผิด ❌ · เฉลย '+actual;
    result.innerHTML='<strong>'+esc(title)+'</strong><span>ซูโม่ตอบ '+esc(round.answer)+' · ราคาอ้างอิง '+money(round.entry.close)+' → Close แท่งที่ 10 '+money(finish.close)+' · ต่าง '+(delta>=0?'+':'')+money(delta)+'<br>เกณฑ์ตัดสิน: T+10 '+(Number(finish.close)>Number(round.entry.close)?'>':Number(finish.close)<Number(round.entry.close)?'<':'=')+' ราคาอ้างอิง = '+esc(actual)+(round.reasons?.length?'<br>เหตุผลที่ซูโม่เลือก: '+esc(round.reasons.join(' / ')):'')+'</span>';setStage(3);byId('tc-next').hidden=false;byId('tc-reveal-actions').hidden=true;byId('tc-round-label').textContent='เฉลยแล้ว · '+actual;ensurePostAnalysis(round).catch(err=>console.error('Challenge post analysis failed',err));
  }
  async function open(preferredSessionId,opts={}){
    ensureStyles();ensureDialog();onClose=typeof opts.onClose==='function'?opts.onClose:null;if(!dialog.open)dialog.showModal();
    try{const ok=await loadSession(preferredSessionId);if(!ok)return;if(!byId('tc-chart'))restoreGameBody();syncSessionUi();initChart();newRound();}catch(err){console.error('10-Candle Challenge failed',err);showEmpty('เปิดเกมไม่สำเร็จ',String(err?.message||err));}
  }
  function close(){clearReveal();if(dialog?.open)dialog.close();const cb=onClose;onClose=null;if(cb)queueMicrotask(cb);}
  globalThis.TenCandleChallengeV1={schema:SCHEMA,open,close,stats:()=>JSON.parse(JSON.stringify(stats))};
})();