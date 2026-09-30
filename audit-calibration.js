(() => {
  'use strict';

  const SCHEMA='audit-calibration-v1';
  const AUDIT_SCHEMA='trade-audit-v1';
  const TARGET_VERSION='ARIS-2.0.0';
  const isClosed=s=>s&&['correct','incorrect'].includes(s.result);
  const pct=(w,n)=>n?Math.round((w/n)*1000)/10:null;

  function bandFor(score){
    const s=Number(score);
    if(!Number.isFinite(s))return null;
    if(s>=90)return {key:'90-100',min:90,max:100,label:'90–100'};
    if(s>=80)return {key:'80-89',min:80,max:89,label:'80–89'};
    if(s>=70)return {key:'70-79',min:70,max:79,label:'70–79'};
    if(s>=60)return {key:'60-69',min:60,max:69,label:'60–69'};
    return {key:'0-59',min:0,max:59,label:'ต่ำกว่า 60'};
  }

  function auditOf(signal){return signal?.dataset?.entry?.auditV1||null;}

  function ensureEvaluation(signal){
    if(!isClosed(signal))return null;
    const audit=auditOf(signal);
    if(!audit||audit.schema!==AUDIT_SCHEMA)return null;
    if(signal.dataset.auditEvaluationV1?.schema===SCHEMA)return signal.dataset.auditEvaluationV1;

    const outcome=signal.dataset?.outcome||{};
    const evaluation={
      schema:SCHEMA,
      auditSchema:audit.schema,
      frozenAuditScore:Number(audit.score),
      frozenAuditConfidence:Number(audit.confidence),
      band:bandFor(audit.score)?.key||null,
      result:signal.result,
      correct:signal.result==='correct',
      settledAt:Number(signal.expiresAt)||Date.now(),
      finalMoveAtr:Number.isFinite(Number(outcome.directionalMoveAtr))?Number(outcome.directionalMoveAtr):null,
      mfeAtr:Number.isFinite(Number(outcome.mfeAtr))?Number(outcome.mfeAtr):null,
      maeAtr:Number.isFinite(Number(outcome.maeAtr))?Number(outcome.maeAtr):null,
      state:audit.context?.state||signal.dataset?.entry?.v2State||null,
      playbook:audit.context?.playbook||signal.dataset?.entry?.v2Playbook||null,
      direction:signal.direction||null,
      expedite:!!signal.dataset?.entry?.v2ExpediteRequested,
      auditMissType:null
    };

    if(signal.result==='incorrect'&&audit.score>=82)evaluation.auditMissType='overrated_high_score_loss';
    else if(signal.result==='incorrect'&&audit.score>=72)evaluation.auditMissType='overrated_loss';
    else if(signal.result==='correct'&&audit.score<60)evaluation.auditMissType='underrated_low_score_win';
    else if(signal.result==='correct'&&audit.score<70)evaluation.auditMissType='underrated_win';

    signal.dataset.auditEvaluationV1=evaluation;
    return evaluation;
  }

  function group(rows,keyFn){
    const map=new Map();
    for(const signal of rows){
      const audit=auditOf(signal),key=keyFn(signal,audit);
      if(!key)continue;
      if(!map.has(key))map.set(key,{key,n:0,w:0,l:0,sumScore:0,sumConfidence:0});
      const x=map.get(key);
      x.n++;
      x.sumScore+=Number(audit.score)||0;
      x.sumConfidence+=Number(audit.confidence)||0;
      if(signal.result==='correct')x.w++;else if(signal.result==='incorrect')x.l++;
    }
    return [...map.values()].map(x=>({
      key:x.key,n:x.n,w:x.w,l:x.l,winRate:pct(x.w,x.n),
      avgScore:Math.round((x.sumScore/x.n)*10)/10,
      avgConfidence:Math.round((x.sumConfidence/x.n)*10)/10
    })).sort((a,b)=>b.n-a.n||String(a.key).localeCompare(String(b.key)));
  }

  function bandRows(rows){
    const order=['90-100','80-89','70-79','60-69','0-59'];
    const grouped=group(rows,(_,audit)=>bandFor(audit.score)?.key);
    const byKey=new Map(grouped.map(x=>[x.key,x]));
    return order.map(key=>{
      const base=byKey.get(key)||{key,n:0,w:0,l:0,winRate:null,avgScore:null,avgConfidence:null};
      return {...base,label:key==='90-100'?'90–100':key==='80-89'?'80–89':key==='70-79'?'70–79':key==='60-69'?'60–69':'ต่ำกว่า 60'};
    });
  }

  function calibrationHealth(bands,total){
    const populated=bands.filter(x=>x.n>=5&&Number.isFinite(x.winRate));
    let comparisons=0,ordered=0;
    for(let i=0;i<populated.length-1;i++){
      const hi=populated[i],lo=populated[i+1];
      comparisons++;
      if(hi.winRate>=lo.winRate)ordered++;
    }
    const ordering=comparisons?ordered/comparisons:null;
    const top=populated[0],bottom=populated.at(-1);
    const spread=top&&bottom&&top!==bottom?Math.max(0,Math.min(50,top.winRate-bottom.winRate)):null;
    const sample=Math.min(1,total/120);
    const score=ordering===null?null:Math.round((ordering*.60+(Math.min(1,(spread||0)/30))*.25+sample*.15)*100);
    return {
      score,
      status:total<20?'collecting':score===null?'insufficient':score>=80?'strong':score>=65?'usable':'needs_tuning',
      samples:total,
      orderingPct:ordering===null?null:Math.round(ordering*100),
      separationPct:spread===null?null:Math.round(spread*10)/10,
      note:total<20?'ข้อมูลยังน้อย ใช้ดูแนวโน้มก่อน':score>=80?'คะแนนเรียงผลจริงได้ดีในตัวอย่างปัจจุบัน':score>=65?'เริ่มแยกไม้ได้ แต่ยังต้องสะสมข้อมูล':'คะแนนแต่ละช่วงยังแยกผลจริงได้ไม่ดีพอ'
    };
  }

  function missSummary(rows){
    const misses={overratedHighLoss:0,overratedLoss:0,underratedLowWin:0,underratedWin:0};
    const records=[];
    for(const s of rows){
      const e=ensureEvaluation(s);if(!e?.auditMissType)continue;
      if(e.auditMissType==='overrated_high_score_loss')misses.overratedHighLoss++;
      else if(e.auditMissType==='overrated_loss')misses.overratedLoss++;
      else if(e.auditMissType==='underrated_low_score_win')misses.underratedLowWin++;
      else if(e.auditMissType==='underrated_win')misses.underratedWin++;
      records.push({id:s.id,entryTime:s.entryTime,score:e.frozenAuditScore,confidence:e.frozenAuditConfidence,result:e.result,missType:e.auditMissType,state:e.state,playbook:e.playbook,mfeAtr:e.mfeAtr,maeAtr:e.maeAtr});
    }
    return {...misses,records:records.slice(-200)};
  }

  function history(signals=[]){
    return (signals||[]).filter(s=>s?.version===TARGET_VERSION&&auditOf(s)).map(s=>{
      const a=auditOf(s),ev=isClosed(s)?ensureEvaluation(s):null;
      return {
        id:s.id,entryTime:s.entryTime,direction:s.direction,type:s.type,
        score:a.score,confidence:a.confidence,band:bandFor(a.score)?.key||null,
        grade:a.grade,state:a.context?.state||null,playbook:a.context?.playbook||null,
        penalties:a.penalties||[],positives:a.positives||[],risks:a.risks||[],
        result:s.result,evaluation:ev
      };
    });
  }

  function report(signals=[]){
    const all=(signals||[]).filter(s=>s?.version===TARGET_VERSION&&auditOf(s));
    const closed=all.filter(isClosed);
    for(const s of closed)ensureEvaluation(s);
    const bands=bandRows(closed);
    return {
      schema:SCHEMA,
      auditSchema:AUDIT_SCHEMA,
      generatedAt:new Date().toISOString(),
      totalAudited:all.length,
      totalClosed:closed.length,
      bands,
      health:calibrationHealth(bands,closed.length),
      byState:group(closed,(s,a)=>a.context?.state||s.dataset?.entry?.v2State||'UNKNOWN').slice(0,30),
      byPlaybook:group(closed,(s,a)=>a.context?.playbook||s.dataset?.entry?.v2Playbook||s.type||'UNKNOWN').slice(0,30),
      byDirection:group(closed,s=>s.direction||'UNKNOWN'),
      byExpedite:group(closed,s=>s.dataset?.entry?.v2ExpediteRequested?'EXPEDITE':'NORMAL'),
      misses:missSummary(closed)
    };
  }

  function update(signals=[]){
    for(const s of signals||[])if(s?.version===TARGET_VERSION&&isClosed(s))ensureEvaluation(s);
    return report(signals);
  }

  globalThis.AuditCalibrationV1={schema:SCHEMA,bandFor,ensureEvaluation,history,report,update};
})();