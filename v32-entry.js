/* ARIS 3.2 — Entry & Re-arm Engine
   Block 4: converts stage-specific trigger readiness into deterministic T+10 signals.
   Re-entry is owned by each trigger family; there is no universal one-entry-per-leg rule. */

(function(root){
'use strict';

const Trigger=root.ArisV32Triggers;
if(!Trigger)throw new Error('ARIS 3.2 Blocks 1–3 must load before v32-entry.js');

const VERSION=Trigger.version;
const REVISION='entry-rearm-b4-audit-r1';

const CFG=Object.freeze({
  horizonMs:600000,
  confirmTicks:2,
  confirmMs:250,
  candidateGraceMs:1800,
  maxSignals:2000,

  rangeMidLow:.38,
  rangeMidHigh:.62,
  trendResetEffMax:.52,
  trendResetMoveAtr:.55,
  breakoutClearConfidence:.16,
  transitionRearmConfidence:.18
});

const finite=Number.isFinite;
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const unique=a=>[...new Set((a||[]).filter(Boolean))];

function familyKey(trigger){
  if(!trigger)return 'NONE';
  if(trigger.family==='RANGE_REVERSION')return 'RANGE';
  if(trigger.family==='FAILED_BREAKOUT')return 'FAILED_BREAKOUT';
  if(trigger.family==='BREAKOUT')return 'BREAKOUT';
  if(trigger.family==='TREND')return 'TREND';
  if(trigger.family==='PULLBACK')return 'PULLBACK';
  if(trigger.family==='REVERSAL')return 'REVERSAL';
  if(trigger.family==='TRANSITION')return 'TRANSITION';
  return trigger.family||'OTHER';
}

function structureSignature(s){
  return [s?.highTag||'—',s?.lowTag||'—',s?.integrity||'—',s?.dir||0].join(':');
}

function referenceSignature(snap,trigger){
  const f=snap.features||{},r=f.range||{};
  const base=[
    familyKey(trigger),
    trigger?.id||'NONE',
    trigger?.d||0,
    r.startTime||0,
    r.endTime||0,
    structureSignature(snap.structure)
  ];
  // Event-specific breakout direction belongs in the reference.
  if(trigger?.family==='BREAKOUT')base.push(f.breakout?.attemptDir||0,f.breakout?.acceptedDir||0);
  if(trigger?.family==='FAILED_BREAKOUT')base.push(f.breakout?.failedDir||0);
  return base.join('|');
}

function defaultMemory(){
  return {
    lastIssued:null,
    familyArmed:{
      RANGE:true,
      FAILED_BREAKOUT:true,
      BREAKOUT:true,
      TREND:true,
      PULLBACK:true,
      REVERSAL:true,
      TRANSITION:true
    },
    resetReason:{},
    lastIssuedByFamily:{},
    lastStage:null,
    lastStepTs:null,
    stageHistory:[],
    candidate:null,
    signals:[]
  };
}

function normalizeMemory(saved){
  const d=defaultMemory(),m=saved&&typeof saved==='object'?saved:{};
  return {
    ...d,
    ...m,
    familyArmed:{...d.familyArmed,...(m.familyArmed||{})},
    resetReason:{...(m.resetReason||{})},
    lastIssuedByFamily:{...(m.lastIssuedByFamily||{})},
    stageHistory:Array.isArray(m.stageHistory)?m.stageHistory.slice(-60):[],
    signals:Array.isArray(m.signals)?m.signals.slice(-CFG.maxSignals):[],
    candidate:m.candidate||null
  };
}

function rearmFamily(mem,key,reason){
  mem.familyArmed[key]=true;
  mem.resetReason[key]=reason;
}

function updateRearm(mem,snap){
  const f=snap.features||{},stage=snap.stage||{},conf=stage.confidence||{};
  const currentStage=stage.dominant||null;

  if(currentStage&&currentStage!==mem.lastStage){
    mem.stageHistory.push({ts:snap.ts,stage:currentStage,confidence:stage.dominantConfidence||0});
    if(mem.stageHistory.length>60)mem.stageHistory.shift();
    mem.lastStage=currentStage;
  }

  for(const [key,last] of Object.entries(mem.lastIssuedByFamily||{})){
    if(mem.familyArmed[key]!==false||!last)continue;
    const movedAtr=Math.abs((snap.price-last.price)/Math.max(f.atr||last.atr||1,1e-9));

    if(key==='RANGE'){
      const p=f.rangePosition;
      if(finite(p)&&p>=CFG.rangeMidLow&&p<=CFG.rangeMidHigh)rearmFamily(mem,key,'ราคาได้หมุนกลับผ่านกลางกรอบหลังไม้ก่อน');
    }

    if(key==='TRANSITION'){
      const p=f.rangePosition;
      const centerRotate=finite(p)&&p>=CFG.rangeMidLow&&p<=CFG.rangeMidHigh;
      const regimeReset=(conf.TRANSITION||0)<CFG.transitionRearmConfidence&&movedAtr>=.35;
      if(centerRotate||regimeReset)rearmFamily(mem,key,centerRotate?'ราคาได้หมุนกลับผ่านกลางกรอบหลังไม้ก่อน':'Transition เดิมคลายตัวและราคาเดินห่างพอสำหรับเหตุการณ์ใหม่');
    }

    if(key==='TREND'){
      const resetStage=((conf.PULLBACK||0)>=.18||(conf.COMPRESSION||0)>=.18||(conf.TRANSITION||0)>=.22)&&movedAtr>=.20;
      const microReset=movedAtr>=CFG.trendResetMoveAtr&&(f.eff6||1)<=CFG.trendResetEffMax;
      if(resetStage||microReset)rearmFamily(mem,'TREND',resetStage?'เกิด pullback/compression/transition ใหม่หลังราคาเดินออกจากจุดเดิม':'ราคาเดินห่างและสร้าง micro reset ใหม่');
    }

    if(key==='PULLBACK'){
      if((conf.TREND_ADVANCE||0)>=.30&&movedAtr>=.35)rearmFamily(mem,'PULLBACK','pullback เดิมจบและราคาเดินกลับเข้าสู่ trend advance แล้ว');
    }

    if(key==='BREAKOUT'){
      const cleared=(conf.BREAKOUT_ATTEMPT||0)<CFG.breakoutClearConfidence&&(conf.BREAKOUT_ACCEPTED||0)<CFG.breakoutClearConfidence&&
        !f.breakout?.attemptDir&&!f.breakout?.acceptedDir;
      if(cleared)rearmFamily(mem,'BREAKOUT','เหตุการณ์ breakout เดิมจบแล้ว รอฐาน/กรอบใหม่');
    }

    if(key==='FAILED_BREAKOUT'){
      if(!f.breakout?.failedDir)rearmFamily(mem,'FAILED_BREAKOUT','failed-break event เดิมเคลียร์แล้ว');
    }

    if(key==='REVERSAL'){
      const sig=structureSignature(snap.structure);
      if(sig!==last.structureSignature&&movedAtr>=.30)rearmFamily(mem,'REVERSAL','โครงสร้างเปลี่ยน materially หลัง reversal เดิม');
    }
  }
}

function entryQuality(snap,trigger){
  if(!trigger)return 0;
  const d=trigger.d||0;
  const globalEdge=snap.direction?.signedEdge||0;
  const stageModel=snap.direction?.models?.[trigger.stage];
  const stageEdge=stageModel?.score??globalEdge;
  const alignedStage=clip(d*stageEdge,-1,1);
  const alignedGlobal=clip(d*globalEdge,-1,1);
  const stage=trigger.stageConfidence||0;
  const penalty=Math.min(12,(trigger.penalties||[]).length*3);
  const oppositionPenalty=Math.max(0,-alignedStage)*18+Math.max(0,-alignedGlobal)*8;
  const raw=trigger.quality*.60+Math.max(0,alignedStage)*100*.20+stage*100*.12+Math.max(0,alignedGlobal)*100*.08-penalty-oppositionPenalty;
  return Math.round(clip(raw/100)*100);
}

function signalReason(snap,trigger,quality){
  const stage=snap.stage?.dominant||trigger.stage;
  const pieces=[
    stage,
    trigger.id,
    'Entry quality '+quality+'/100',
    ...(trigger.reasons||[]).slice(0,3)
  ];
  return pieces.filter(Boolean).join(' · ');
}

class V32EntryEngine{
  constructor(saved={}){
    this.memory=normalizeMemory(saved.memory||saved);
    this.session=saved.session||('V32-'+Date.now().toString(36));
  }

  serialize(){
    return {
      version:VERSION,
      revision:REVISION,
      session:this.session,
      memory:JSON.parse(JSON.stringify(this.memory))
    };
  }

  reset(){
    this.memory=defaultMemory();
  }

  step(input={}){
    const inputTs=finite(+input.ts)?+input.ts:null;
    if(inputTs!=null&&this.memory.lastStepTs!=null&&inputTs<=this.memory.lastStepTs){
      return {status:'DUPLICATE',signal:null,snapshot:null,reason:'timestamp ไม่เดินหน้า'};
    }
    const snap=Trigger.analyze(input);
    if(inputTs!=null)this.memory.lastStepTs=inputTs;
    if(!snap.ready||!snap.triggers?.ready){
      this.memory.candidate=null;
      const hard=!!snap.features?.hardBlock;
      return {status:hard?'BLOCKED_DATA':'WARMUP',signal:null,snapshot:snap,reason:snap.reason||snap.triggers?.reason||'ข้อมูลยังไม่พร้อม'};
    }

    updateRearm(this.memory,snap);
    const trigger=snap.triggers.primary;
    if(!trigger){
      this.memory.candidate=null;
      return {status:'WATCH',signal:null,snapshot:snap,reason:'ยังไม่มี stage-specific trigger'};
    }

    const key=familyKey(trigger),ref=referenceSignature(snap,trigger);
    const armed=this.memory.familyArmed[key]!==false;
    const duplicate=!armed;

    if(trigger.hardBlocks?.length){
      this.memory.candidate=null;
      return {status:'BLOCKED',signal:null,snapshot:snap,reason:trigger.hardBlocks[0],trigger};
    }

    if(duplicate){
      this.memory.candidate=null;
      return {
        status:'WAIT_REARM',signal:null,snapshot:snap,trigger,
        reason:'ตระกูล '+key+' ยังไม่เกิด re-arm หลังไม้ก่อน แม้ reference window จะขยับ',
        rearm:{family:key,armed:false,lastReason:this.memory.resetReason[key]||null}
      };
    }

    if(!trigger.ready){
      const cand=this.memory.candidate;
      if(cand&&cand.reference===ref&&trigger.watch&&snap.ts-(cand.lastReadyAt||cand.startedAt)<=CFG.candidateGraceMs){
        return {status:'CONFIRMING',signal:null,snapshot:snap,trigger,reason:'Trigger อ่อนลงชั่วคราวแต่ยังอยู่ใน candidate grace'};
      }
      this.memory.candidate=null;
      return {status:trigger.watch||trigger.watchOnly?'WATCH':'TRACKING',signal:null,snapshot:snap,trigger,reason:(trigger.missing||[])[0]||'Trigger quality ยังไม่พร้อม'};
    }

    const quality=entryQuality(snap,trigger);
    let cand=this.memory.candidate;
    if(!cand||cand.reference!==ref){
      cand=this.memory.candidate={
        reference:ref,
        familyKey:key,
        triggerId:trigger.id,
        d:trigger.d,
        startedAt:snap.ts,
        lastReadyAt:snap.ts,
        ticks:1,
        firstQuality:quality,
        bestQuality:quality
      };
    }else{
      cand.ticks++;
      cand.lastReadyAt=snap.ts;
      cand.bestQuality=Math.max(cand.bestQuality,quality);
    }

    if(cand.ticks<CFG.confirmTicks||snap.ts-cand.startedAt<CFG.confirmMs){
      return {
        status:'CONFIRMING',signal:null,snapshot:snap,trigger,
        reason:'Stage-specific trigger พร้อมแล้ว กำลังยืนยันสด '+cand.ticks+'/'+CFG.confirmTicks,
        candidate:{...cand}
      };
    }

    const id='ARIS32:'+this.session+':'+snap.ts+':'+this.memory.signals.length;
    const signal={
      id,
      version:VERSION,
      revision:REVISION,
      direction:trigger.direction,
      type:trigger.id,
      family:trigger.family,
      entryTime:snap.ts,
      entryPrice:snap.price,
      expiresAt:snap.ts+CFG.horizonMs,
      result:'pending',
      entryQuality:quality,
      stage:snap.stage.dominant,
      stageConfidence:snap.stage.dominantConfidence,
      directionEdge:snap.direction.signedEdge,
      highEdge:snap.direction.highEdge,
      lowEdge:snap.direction.lowEdge,
      triggerQuality:trigger.quality,
      reason:signalReason(snap,trigger,quality),
      dataset:{
        schema:'aris-v32-entry-v1',
        capturedAt:snap.ts,
        stage:{
          dominant:snap.stage.dominant,
          confidence:snap.stage.confidence,
          raw:snap.stage.raw,
          rangeForming:snap.stage.rangeForming,
          priorTrendDir:snap.stage.priorTrendDir
        },
        direction:{
          direction:snap.direction.direction,
          signedEdge:snap.direction.signedEdge,
          highEdge:snap.direction.highEdge,
          lowEdge:snap.direction.lowEdge,
          activeStageModels:snap.direction.activeStageModels
        },
        trigger:JSON.parse(JSON.stringify(trigger)),
        features:{
          atr:snap.features.atr,
          ema8:snap.features.ema8,
          ema21:snap.features.ema21,
          emaSepAtr:snap.features.emaSepAtr,
          emaSlope5:snap.features.emaSlope5,
          emaSlope12:snap.features.emaSlope12,
          emaSlope24:snap.features.emaSlope24,
          eff6:snap.features.eff6,
          eff12:snap.features.eff12,
          eff24:snap.features.eff24,
          momentum3:snap.features.momentum3,
          momentum8:snap.features.momentum8,
          momentum16:snap.features.momentum16,
          momentum24:snap.features.momentum24,
          extensionAtr:snap.features.extensionAtr,
          rangePosition:snap.features.rangePosition,
          volume:snap.features.vol,
          breakout:snap.features.breakout,
          flow:snap.features.flow,
          book:snap.features.book
        },
        structure:JSON.parse(JSON.stringify(snap.structure)),
        reference:ref,
        rearmFamily:key
      }
    };

    this.memory.signals.push(signal);
    if(this.memory.signals.length>CFG.maxSignals)this.memory.signals.shift();
    this.memory.lastIssued={
      id,
      ts:snap.ts,
      price:snap.price,
      atr:snap.features.atr,
      familyKey:key,
      triggerId:trigger.id,
      d:trigger.d,
      reference:ref,
      structureSignature:structureSignature(snap.structure)
    };
    this.memory.lastIssuedByFamily[key]={...this.memory.lastIssued};
    this.memory.familyArmed[key]=false;
    this.memory.resetReason[key]=null;
    this.memory.candidate=null;

    return {status:'ENTER',signal,snapshot:snap,trigger,reason:signal.reason,rearm:{family:key,armed:false}};
  }
}

root.ArisV32Entry=Object.freeze({
  version:VERSION,
  revision:REVISION,
  CFG,
  Engine:V32EntryEngine,
  entryQuality,
  familyKey,
  referenceSignature
});

})(typeof globalThis!=='undefined'?globalThis:window);
