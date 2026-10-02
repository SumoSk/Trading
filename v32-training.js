/* ARIS 3.2 — Training & Review Ledger
   Block 5: captures decision-time snapshots separately from future outcome labels.
   This module does not auto-change weights. Calibration is a later explicit step. */

(function(root){
'use strict';

const Entry=root.ArisV32Entry;
if(!Entry)throw new Error('ARIS 3.2 Blocks 1–4 must load before v32-training.js');

const VERSION=Entry.version;
const REVISION='training-ledger-b5-audit-r1';
const finite=Number.isFinite;
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

const CFG=Object.freeze({
  maxDecisions:12000,
  maxSignals:4000,
  settlementToleranceMs:5000,
  minCalibrationSamples:20
});

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function pct(w,n){return n?Math.round(w/n*1000)/10:null;}
function bucketQuality(q){
  if(q>=80)return '80-100';
  if(q>=70)return '70-79';
  if(q>=60)return '60-69';
  if(q>=50)return '50-59';
  return '<50';
}
function bucketConfidence(c){
  const p=(c||0)*100;
  if(p>=70)return '70-100';
  if(p>=55)return '55-69';
  if(p>=40)return '40-54';
  if(p>=25)return '25-39';
  return '<25';
}

function aggregate(rows,keyFn){
  const m=new Map();
  for(const r of rows){
    const k=keyFn(r)||'UNKNOWN';
    if(!m.has(k))m.set(k,{key:k,n:0,wins:0,losses:0,ties:0,pending:0,entryQuality:0,stageConfidence:0,mfeAtr:0,maeAtr:0,fastReverse:0});
    const x=m.get(k);x.n++;
    if(r.result==='correct')x.wins++;
    else if(r.result==='wrong')x.losses++;
    else if(r.result==='tie')x.ties++;
    else x.pending++;
    x.entryQuality+=r.entryQuality||0;
    x.stageConfidence+=(r.stageConfidence||0)*100;
    x.mfeAtr+=r.review?.mfeAtr||0;
    x.maeAtr+=r.review?.maeAtr||0;
    if(r.review?.fastReverse2m)x.fastReverse++;
  }
  return [...m.values()].map(x=>{
    const settled=x.wins+x.losses+x.ties;
    return {
      ...x,
      settled,
      winRate:pct(x.wins,x.wins+x.losses),
      avgEntryQuality:x.n?Math.round(x.entryQuality/x.n*10)/10:null,
      avgStageConfidence:x.n?Math.round(x.stageConfidence/x.n*10)/10:null,
      avgMfeAtr:settled?Math.round(x.mfeAtr/settled*100)/100:null,
      avgMaeAtr:settled?Math.round(x.maeAtr/settled*100)/100:null,
      fastReverseRate:settled?pct(x.fastReverse,settled):null
    };
  }).sort((a,b)=>b.n-a.n);
}

function decisionRecord(result){
  const snap=result?.snapshot;
  if(!snap?.ready)return null;
  const t=result.trigger||snap.triggers?.primary||null;
  return {
    ts:snap.ts,
    status:result.status,
    price:snap.price,
    stage:snap.stage?.dominant||null,
    stageConfidence:snap.stage?.dominantConfidence||0,
    stageMix:clone(snap.stage?.confidence||{}),
    rangeForming:!!snap.stage?.rangeForming,
    direction:snap.direction?.direction||'BALANCED',
    signedEdge:snap.direction?.signedEdge||0,
    highEdge:snap.direction?.highEdge,
    lowEdge:snap.direction?.lowEdge,
    triggerId:t?.id||null,
    triggerFamily:t?.family||null,
    triggerStatus:t?.status||null,
    triggerQuality:t?.quality||null,
    entryQuality:result.signal?.entryQuality||null,
    penalties:clone(t?.penalties||[]),
    hardBlocks:clone(t?.hardBlocks||[]),
    missing:clone(t?.missing||[])
  };
}

function reviewPath(signal,path){
  if(!signal||!path?.length)return null;
  const d=signal.direction==='HIGH'?1:-1,a=Math.max(signal.dataset?.features?.atr||1,1e-9),entry=signal.entryPrice;
  let mfe=-Infinity,mae=Infinity,fastReverse1m=false,fastReverse2m=false,fastReverse5m=false;
  let at1m=null,at2m=null,at5m=null,firstFlowFlipMs=null,structureBreakAfterEntry=false;
  const stageChanges=[],breakoutStateChanges=[];
  let prevStage=null,prevBreakout=null;
  for(const q of path){
    const favorable=d*(q.price-entry)/a;
    mfe=Math.max(mfe,favorable);
    mae=Math.min(mae,favorable);
    const age=q.ts-signal.entryTime;
    if(age<=60000){at1m=favorable;if(favorable<=-.18)fastReverse1m=true;}
    if(age<=120000){at2m=favorable;if(favorable<=-.18)fastReverse2m=true;}
    if(age<=300000){at5m=favorable;if(favorable<=-.18)fastReverse5m=true;}
    if(firstFlowFlipMs==null&&finite(q.flow)&&d*q.flow<-.03)firstFlowFlipMs=Math.max(0,age);
    if(q.structureAgainst===true)structureBreakAfterEntry=true;
    if(q.stage&&q.stage!==prevStage){
      stageChanges.push({ts:q.ts,ageMs:Math.max(0,age),stage:q.stage});
      prevStage=q.stage;
    }
    if(q.breakoutState&&q.breakoutState!==prevBreakout){
      breakoutStateChanges.push({ts:q.ts,ageMs:Math.max(0,age),state:q.breakoutState});
      prevBreakout=q.breakoutState;
    }
  }
  return {
    samples:path.length,
    mfeAtr:finite(mfe)?Math.round(mfe*1000)/1000:null,
    maeAtr:finite(mae)?Math.round(mae*1000)/1000:null,
    fastReverse1m,fastReverse2m,fastReverse5m,
    at1mAtr:finite(at1m)?Math.round(at1m*1000)/1000:null,
    at2mAtr:finite(at2m)?Math.round(at2m*1000)/1000:null,
    at5mAtr:finite(at5m)?Math.round(at5m*1000)/1000:null,
    firstFlowFlipMs,
    structureBreakAfterEntry,
    stageChanges,
    breakoutStateChanges
  };
}

function observationFromSnapshot(ts,price,snapshot,signal){
  const d=signal?.direction==='HIGH'?1:signal?.direction==='LOW'?-1:0;
  const s=snapshot?.structure||{};
  const b=snapshot?.features?.breakout||{};
  const breakoutState=b.failedDir?'FAILED_'+(b.failedDir>0?'UP':'DOWN'):b.acceptedDir?'ACCEPTED_'+(b.acceptedDir>0?'UP':'DOWN'):b.attemptDir?'ATTEMPT_'+(b.attemptDir>0?'UP':'DOWN'):'NONE';
  return {
    ts,price,
    stage:snapshot?.stage?.dominant||null,
    stageConfidence:snapshot?.stage?.dominantConfidence??null,
    flow:finite(snapshot?.features?.flow)?snapshot.features.flow:null,
    structureAgainst:d>0?!!s.bullBroken:d<0?!!s.bearBroken:false,
    breakoutState
  };
}

class V32TrainingLedger{
  constructor(saved={}){
    this.decisions=Array.isArray(saved.decisions)?saved.decisions.slice(-CFG.maxDecisions):[];
    this.signals=Array.isArray(saved.signals)?saved.signals.slice(-CFG.maxSignals):[];
    this.paths=saved.paths&&typeof saved.paths==='object'?saved.paths:{};
  }

  record(result){
    const row=decisionRecord(result);
    if(row){
      this.decisions.push(row);
      if(this.decisions.length>CFG.maxDecisions)this.decisions.shift();
    }
    if(result?.signal){
      const sig=clone(result.signal);
      if(!this.signals.some(x=>x.id===sig.id)){
        this.signals.push(sig);
        if(this.signals.length>CFG.maxSignals)this.signals.shift();
        this.paths[sig.id]=[observationFromSnapshot(sig.entryTime,sig.entryPrice,result.snapshot,sig)];
      }
    }
    if(result?.snapshot?.ready&&finite(result.snapshot.ts)&&finite(result.snapshot.price)){
      this.observe(result.snapshot.ts,result.snapshot.price,result.snapshot);
    }
    return row;
  }

  observe(ts,price,snapshot=null){
    if(!finite(ts)||!finite(price))return;
    for(const sig of this.signals){
      if(sig.result!=='pending')continue;
      const path=this.paths[sig.id]||(this.paths[sig.id]=[]);
      const obs=observationFromSnapshot(ts,price,snapshot,sig);
      if(!path.length||ts>path.at(-1).ts)path.push(obs);
      else if(ts===path.at(-1).ts)path[path.length-1]={...path.at(-1),...obs};
      if(path.length>700)path.splice(1,path.length-700);
      if(ts+CFG.settlementToleranceMs<sig.expiresAt)continue;
      const d=sig.direction==='HIGH'?1:-1,delta=d*(price-sig.entryPrice);
      sig.exitTime=ts;
      sig.exitPrice=price;
      sig.result=Math.abs(delta)<1e-9?'tie':delta>0?'correct':'wrong';
      sig.review=reviewPath(sig,path);
    }
  }

  settleFromBars(bars=[]){
    const rows=(bars||[]).filter(q=>finite(+q.time)&&finite(+q.close)).map(q=>({ts:+q.time,price:+q.close})).sort((a,b)=>a.ts-b.ts);
    for(const sig of this.signals){
      if(sig.result!=='pending')continue;
      const target=sig.expiresAt;
      const q=rows.find(x=>x.ts>=target-CFG.settlementToleranceMs);
      if(!q)continue;
      const path=rows.filter(x=>x.ts>=sig.entryTime&&x.ts<=q.ts);
      const d=sig.direction==='HIGH'?1:-1,delta=d*(q.price-sig.entryPrice);
      sig.exitTime=q.ts;sig.exitPrice=q.price;
      sig.result=Math.abs(delta)<1e-9?'tie':delta>0?'correct':'wrong';
      sig.review=reviewPath(sig,path);
      this.paths[sig.id]=path;
    }
  }

  summary(){
    const rows=this.signals;
    const settled=rows.filter(x=>x.result==='correct'||x.result==='wrong');
    const wins=settled.filter(x=>x.result==='correct').length;
    const statusCounts={};
    for(const d of this.decisions)statusCounts[d.status]=(statusCounts[d.status]||0)+1;

    const blockedBy={};
    for(const d of this.decisions){
      for(const h of d.hardBlocks||[])blockedBy[h]=(blockedBy[h]||0)+1;
    }

    return {
      schema:'aris-v32-training-summary-v1',
      version:VERSION,
      revision:REVISION,
      totals:{
        decisions:this.decisions.length,
        signals:rows.length,
        settled:settled.length,
        wins,
        losses:settled.length-wins,
        winRate:pct(wins,settled.length),
        pending:rows.filter(x=>x.result==='pending').length
      },
      statusCounts,
      blockedBy,
      byStage:aggregate(rows,x=>x.stage),
      byTrigger:aggregate(rows,x=>x.type),
      byFamily:aggregate(rows,x=>x.family),
      byDirection:aggregate(rows,x=>x.direction),
      byEntryQuality:aggregate(rows,x=>bucketQuality(x.entryQuality||0)),
      byStageConfidence:aggregate(rows,x=>bucketConfidence(x.stageConfidence||0)),
      calibrationCandidates:aggregate(rows,x=>(x.stage||'UNKNOWN')+'|'+(x.type||'UNKNOWN'))
        .filter(x=>x.settled>=CFG.minCalibrationSamples)
        .map(x=>({...x,eligibleForReview:true,warning:'ใช้เพื่อเสนอ calibration เท่านั้น ห้าม auto-apply โดยไม่ replay/out-of-sample'}))
    };
  }

  export(){
    return {
      schema:'aris-v32-training-ledger-v1',
      version:VERSION,
      revision:REVISION,
      exportedAt:Date.now(),
      decisions:clone(this.decisions),
      signals:clone(this.signals),
      paths:clone(this.paths)
    };
  }

  serialize(){return this.export();}
}

root.ArisV32Training=Object.freeze({
  version:VERSION,
  revision:REVISION,
  CFG,
  Ledger:V32TrainingLedger,
  reviewPath,
  observationFromSnapshot,
  aggregate
});

})(typeof globalThis!=='undefined'?globalThis:window);
