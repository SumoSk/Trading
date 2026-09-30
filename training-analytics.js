(() => {
  'use strict';

  const SCHEMA='training-analytics-v1';
  const BANGKOK_OFFSET_MS=7*60*60*1000;
  const isSettled=s=>s&&['correct','incorrect','equal'].includes(s.result);
  const scored=s=>s&&['correct','incorrect'].includes(s.result);
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const pct=(w,n)=>n?Math.round(w/n*1000)/10:null;
  const avg=arr=>{const a=arr.map(num).filter(v=>v!==null);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;};
  const median=arr=>{
    const a=arr.map(num).filter(v=>v!==null).sort((x,y)=>x-y);
    if(!a.length)return null;
    const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
  };
  const r1=v=>v===null?null:Math.round(v*10)/10;
  const safeKey=v=>String(v??'UNKNOWN')||'UNKNOWN';

  function summarize(rows,keyFn){
    const map=new Map();
    for(const s of rows){
      const key=safeKey(keyFn(s));
      if(!map.has(key))map.set(key,{key,n:0,w:0,l:0,equal:0,audits:[],mfe:[],mae:[],moves:[]});
      const x=map.get(key);x.n++;
      if(s.result==='correct')x.w++;else if(s.result==='incorrect')x.l++;else if(s.result==='equal')x.equal++;
      if(num(s.entry?.audit?.score)!==null)x.audits.push(Number(s.entry.audit.score));
      if(num(s.outcome?.mfeAtr)!==null)x.mfe.push(Number(s.outcome.mfeAtr));
      if(num(s.outcome?.maeAtr)!==null)x.mae.push(Number(s.outcome.maeAtr));
      if(num(s.outcome?.directionalMoveAtr)!==null)x.moves.push(Number(s.outcome.directionalMoveAtr));
    }
    return [...map.values()].map(x=>({
      key:x.key,n:x.n,w:x.w,l:x.l,equal:x.equal,
      winRate:pct(x.w,x.w+x.l),
      avgAudit:r1(avg(x.audits)),avgMfeAtr:r1(avg(x.mfe)),avgMaeAtr:r1(avg(x.mae)),avgMoveAtr:r1(avg(x.moves))
    })).sort((a,b)=>b.n-a.n||String(a.key).localeCompare(String(b.key)));
  }

  function auditBand(score){
    const s=num(score);if(s===null)return 'NO_AUDIT';
    if(s>=90)return '90-100';if(s>=80)return '80-89';if(s>=70)return '70-79';if(s>=60)return '60-69';return '0-59';
  }

  function calibration(rows){
    const order=['90-100','80-89','70-79','60-69','0-59'];
    const raw=summarize(rows.filter(s=>num(s.entry?.audit?.score)!==null),s=>auditBand(s.entry.audit.score));
    const by=new Map(raw.map(x=>[x.key,x]));
    const bands=order.map(key=>by.get(key)||{key,n:0,w:0,l:0,equal:0,winRate:null,avgAudit:null,avgMfeAtr:null,avgMaeAtr:null,avgMoveAtr:null});
    const usable=bands.filter(x=>x.n>=5&&Number.isFinite(x.winRate));
    let comp=0,ordered=0;
    for(let i=0;i<usable.length-1;i++){comp++;if(usable[i].winRate>=usable[i+1].winRate)ordered++;}
    const high=usable[0],low=usable.at(-1);
    const separation=high&&low&&high!==low?high.winRate-low.winRate:null;
    return {
      bands,
      health:{
        samples:rows.filter(s=>num(s.entry?.audit?.score)!==null).length,
        orderingPct:comp?Math.round(ordered/comp*100):null,
        separationPct:separation===null?null:r1(separation),
        status:rows.length<20?'collecting':comp===0?'insufficient':ordered===comp?'ordered':'mixed'
      }
    };
  }

  function bangkokBucket(ms){
    const t=num(ms);if(t===null)return 'UNKNOWN';
    const h=new Date(t+BANGKOK_OFFSET_MS).getUTCHours(),start=Math.floor(h/3)*3,end=(start+3)%24;
    return String(start).padStart(2,'0')+'–'+String(end).padStart(2,'0');
  }

  function fibBucket(s){
    const f=s.entry?.fib;if(!f?.valid)return 'NO_FIB';
    if(num(f.extension)!==null&&Number(f.extension)>=1.618)return 'EXT_161.8+';
    if(num(f.extension)!==null&&Number(f.extension)>=1.272)return 'EXT_127.2+';
    if(f.deep)return 'DEEP_PULLBACK';
    if(f.healthy&&f.confluence)return 'HEALTHY_CONFLUENCE';
    if(f.healthy)return 'HEALTHY';
    return 'OTHER_FIB';
  }

  function volatilityBuckets(rows){
    const ratios=rows.map(s=>{
      const atr=num(s.entry?.atr),p=num(s.entryPrice);
      return atr!==null&&p>0?atr/p:null;
    }).filter(v=>v!==null&&v>0);
    const med=median(ratios);
    const classify=s=>{
      const atr=num(s.entry?.atr),p=num(s.entryPrice),v=atr!==null&&p>0?atr/p:null;
      if(v===null||med===null||med<=0)return 'UNKNOWN';
      const k=v/med;
      if(k<.75)return 'LOW';
      if(k<=1.35)return 'NORMAL';
      if(k<=2.2)return 'HIGH';
      return 'EXTREME';
    };
    return {medianAtrPct:med===null?null:r1(med*100),groups:summarize(rows,classify)};
  }

  function tagSummary(rows,mode){
    const map=new Map();
    for(const s of rows){
      if(mode==='loss'&&s.result!=='incorrect')continue;
      if(mode==='win'&&s.result!=='correct')continue;
      for(const tag of (s.tags||[])){
        const key=safeKey(tag);map.set(key,(map.get(key)||0)+1);
      }
    }
    return [...map.entries()].map(([tag,n])=>({tag,n})).sort((a,b)=>b.n-a.n||a.tag.localeCompare(b.tag)).slice(0,15);
  }

  function auditMisses(rows){
    const map=new Map();
    for(const s of rows){
      const k=s.auditEvaluation?.missType;if(k)map.set(k,(map.get(k)||0)+1);
    }
    return [...map.entries()].map(([type,n])=>({type,n})).sort((a,b)=>b.n-a.n);
  }

  function timingQuality(rows){
    const counts={cleanWin:0,roughWin:0,noFollowLoss:0,gaveBackLoss:0,otherLoss:0};
    for(const s of rows){
      const mfe=num(s.outcome?.mfeAtr)||0,mae=num(s.outcome?.maeAtr)||0,move=num(s.outcome?.directionalMoveAtr);
      if(s.result==='correct'){
        if(mae>=.30)counts.roughWin++;else counts.cleanWin++;
      }else if(s.result==='incorrect'){
        if(mfe<.12)counts.noFollowLoss++;
        else if(mfe>=.30&&(move===null||move<0))counts.gaveBackLoss++;
        else counts.otherLoss++;
      }
    }
    return counts;
  }

  function componentPerformance(rows){
    const keys=['entry','state','playbook','structure','location','fib','priceAction','flow','timing'];
    return keys.map(key=>{
      const win=rows.filter(s=>s.result==='correct').map(s=>num(s.entry?.audit?.components?.[key])).filter(v=>v!==null);
      const loss=rows.filter(s=>s.result==='incorrect').map(s=>num(s.entry?.audit?.components?.[key])).filter(v=>v!==null);
      return {key,winAvg:r1(avg(win)),lossAvg:r1(avg(loss)),gap:win.length&&loss.length?r1(avg(win)-avg(loss)):null,nWin:win.length,nLoss:loss.length};
    }).sort((a,b)=>(b.gap??-999)-(a.gap??-999));
  }

  async function loadSignals(sessionId){
    const rows=await globalThis.HistoricalDataV1.getBySession('signals',sessionId);
    return rows.map(r=>r.signal).filter(Boolean).sort((a,b)=>(a.entryTime||0)-(b.entryTime||0));
  }

  async function build(sessionId){
    if(!globalThis.HistoricalDataV1)throw new Error('HistoricalDataV1 ไม่พร้อม');
    const [session,signals]=await Promise.all([
      globalThis.HistoricalDataV1.getSession(sessionId),
      loadSignals(sessionId)
    ]);
    if(!session)throw new Error('ไม่พบ Training Session');
    const settled=signals.filter(isSettled),scoredRows=signals.filter(scored);
    const wins=scoredRows.filter(s=>s.result==='correct').length,losses=scoredRows.filter(s=>s.result==='incorrect').length;
    const audit=calibration(scoredRows);
    const vol=volatilityBuckets(scoredRows);
    const report={
      schema:SCHEMA,phase:3,generatedAt:new Date().toISOString(),sessionId,datasetId:session.datasetId,
      source:'historical_replay_compact',replayMode:session.replayMode||'1m_bar_close_replay',
      engineVersion:session.engineVersion,engineBlobSha:session.engineBlobSha,auditSchema:session.auditSchema,dataQuality:session.quality?.grade||null,
      counts:{signals:signals.length,settled:settled.length,scored:scoredRows.length,wins,losses,equal:settled.filter(s=>s.result==='equal').length,pending:signals.filter(s=>s.result==='pending').length},
      winRate:pct(wins,wins+losses),
      auditCalibration:audit,
      byState:summarize(scoredRows,s=>s.entry?.state),
      byPlaybook:summarize(scoredRows,s=>s.entry?.playbook||s.type),
      byDirection:summarize(scoredRows,s=>s.direction),
      byStorySequence:summarize(scoredRows,s=>Number(s.episodeSequence)>=3?'3+':String(s.episodeSequence||1)),
      byTimeBangkok:summarize(scoredRows,s=>bangkokBucket(s.entryTime)),
      byVolatility:vol.groups,
      volatilityMedianAtrPct:vol.medianAtrPct,
      byFib:summarize(scoredRows,fibBucket),
      lossTags:tagSummary(scoredRows,'loss'),
      winTags:tagSummary(scoredRows,'win'),
      auditMisses:auditMisses(scoredRows),
      auditComponents:componentPerformance(scoredRows),
      timingQuality:timingQuality(scoredRows),
      mfeMae:{
        winMfe:r1(avg(scoredRows.filter(s=>s.result==='correct').map(s=>s.outcome?.mfeAtr))),
        winMae:r1(avg(scoredRows.filter(s=>s.result==='correct').map(s=>s.outcome?.maeAtr))),
        lossMfe:r1(avg(scoredRows.filter(s=>s.result==='incorrect').map(s=>s.outcome?.mfeAtr))),
        lossMae:r1(avg(scoredRows.filter(s=>s.result==='incorrect').map(s=>s.outcome?.maeAtr)))
      },
      notes:[
        'Historical replay uses 1m bar-close resolution.',
        'Order book/tick flow are not reconstructed.',
        'Audit score is a quality score, not a win probability.',
        'Analytics are descriptive; use Phase 4 holdout/walk-forward before changing live rules.'
      ]
    };
    await globalThis.HistoricalDataV1.putMany('reports',[{id:sessionId+':phase3',sessionId,updatedAt:Date.now(),report}]);
    return report;
  }

  async function get(sessionId){
    const rows=await globalThis.HistoricalDataV1.getBySession('reports',sessionId);
    return rows.find(r=>r.id===sessionId+':phase3')?.report||null;
  }

  async function exportBundle(sessionId){
    const [session,signals,report]=await Promise.all([
      globalThis.HistoricalDataV1.getSession(sessionId),
      loadSignals(sessionId),
      get(sessionId)
    ]);
    const analytics=report||await build(sessionId);
    return {
      schema:'aris-training-compact-v1',
      exportedAt:new Date().toISOString(),
      session:{
        id:session.id,datasetId:session.datasetId,symbol:session.symbol,interval:session.interval,
        analysisStart:session.analysisStart,analysisEnd:session.analysisEnd,warmupBars:session.warmupBars,
        engineVersion:session.engineVersion,engineBlobSha:session.engineBlobSha,auditSchema:session.auditSchema,
        dataQuality:session.quality?.grade||null,replayMode:session.replayMode||null,replayResolution:session.replayResolution||null,
        replayNoLookahead:session.replayNoLookahead===true
      },
      analytics,
      records:signals
    };
  }

  async function download(sessionId){
    const bundle=await exportBundle(sessionId);
    const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='ARIS-training-'+sessionId+'-'+Date.now()+'.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    return bundle;
  }

  globalThis.TrainingAnalyticsV1={schema:SCHEMA,phase:3,loadSignals,build,get,exportBundle,download};
})();