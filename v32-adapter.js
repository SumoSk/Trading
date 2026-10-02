/* ARIS 3.2 — Production/Training compatibility adapter
   Connects the standalone 3.2 brains to the existing EventSignalV6 shell
   without reusing legacy entry logic. */
(function(root){
'use strict';

const core=root.EventSignalV6;
const Base=root.ArisV32;
const Direction=root.ArisV32Direction;
const Triggers=root.ArisV32Triggers;
const Entry=root.ArisV32Entry;
const Training=root.ArisV32Training;
if(!core||!core.Engine||!core.CFG||core.CFG.version!=='ARIS-3.2.0')return;
if(!Base||!Direction||!Triggers||!Entry||!Training){
  console.error('ARIS 3.2 adapter: required 3.2 modules are missing');
  return;
}

const BaseEngine=core.Engine,{CFG,features}=core;
const finite=Number.isFinite;
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const stageToRegime=stage=>stage==='RANGE'?'RANGE':stage==='TREND_ADVANCE'||stage==='PULLBACK'?'TREND':'TRANSITION';
const stageToPhase=stage=>({
  RANGE:'RANGE',
  COMPRESSION:'TRANSITION',
  BREAKOUT_ATTEMPT:'IMPULSE',
  BREAKOUT_ACCEPTED:'IMPULSE',
  FAILED_BREAKOUT:'REVERSAL',
  TREND_ADVANCE:'TREND',
  PULLBACK:'TREND',
  EXHAUSTION:'EXHAUSTION',
  REVERSAL_DEVELOPING:'REVERSAL',
  TRANSITION:'TRANSITION'
})[stage]||'TRANSITION';
const triggerType=id=>'v32_'+String(id||'observer').toLowerCase();
const stageDir=snap=>snap?.direction?.direction==='HIGH'?1:snap?.direction?.direction==='LOW'?-1:0;

function compactCandles(bars,a,n=10){
  return (bars||[]).slice(-n).map(q=>{
    const o=+q.open,c=+q.close,h=+q.high,l=+q.low,r=Math.max(h-l,1e-9),body=c-o;
    return {
      time:q.time,open:o,high:h,low:l,close:c,volume:+q.volume||0,closed:q.closed!==false,
      direction:body>0?'GREEN':body<0?'RED':'DOJI',
      bodyAtr:Math.abs(body)/Math.max(a,1e-9),
      rangeAtr:r/Math.max(a,1e-9),
      closeLocation:clip((c-l)/r),
      upperWickAtr:(h-Math.max(o,c))/Math.max(a,1e-9),
      lowerWickAtr:(Math.min(o,c)-l)/Math.max(a,1e-9)
    };
  });
}

function compatFib(raw){
  if(!raw?.valid)return raw||null;
  const levels=Object.entries(raw.levels||{}).map(([ratio,price])=>({ratio:+ratio,price:+price})).filter(x=>finite(x.ratio)&&finite(x.price)).sort((a,b)=>a.ratio-b.ratio);
  const extensions=Object.entries(raw.extensions||{}).map(([ratio,price])=>({ratio:+ratio,price:+price})).filter(x=>finite(x.ratio)&&finite(x.price)).sort((a,b)=>a.ratio-b.ratio);
  const retr=raw.retracement,ext=raw.extension;
  const retraceZone=raw.zone||(
    finite(retr)?retr<.236?'ตื้นกว่า 23.6%':retr<=.382?'23.6–38.2%':retr<=.5?'38.2–50%':retr<=.618?'50–61.8%':retr<=.786?'61.8–78.6%':'ลึกเกิน 78.6%':'—'
  );
  const extensionZone=finite(ext)?ext>=1.618?'เหนือ 161.8%':ext>=1.272?'127.2–161.8%':ext>=1?'100–127.2%':'ยังไม่ extension':'—';
  return {...raw,levels,extensions,retraceZone,extensionZone};
}

function compatZones(snap){
  const p=snap?.price??0;
  return (snap?.features?.zones?.zones||[]).map(z=>({
    price:z.price,
    kind:z.type==='support'?'support':z.type==='resistance'?'resistance':z.price<=p?'support':'resistance',
    touches:z.touches||0,
    confirmedAt:z.lastTime||null,
    strength:z.strength
  }));
}

function compatRegime(snap){
  const stage=snap?.stage?.dominant||'TRANSITION',mode=stageToRegime(stage),d=stageDir(snap);
  return {
    raw:mode,mode,stableMode:mode,dir:d,
    position:snap?.features?.rangePosition??.5,
    v32Stage:stage,
    v32Confidence:snap?.stage?.dominantConfidence||0,
    v32RangeForming:!!snap?.stage?.rangeForming
  };
}

function compatPhase(snap){
  const stage=snap?.stage?.dominant||'TRANSITION',d=stageDir(snap),trigger=snap?.triggers?.primary;
  return {
    phase:stageToPhase(stage),dir:d,priorDir:snap?.stage?.priorTrendDir||0,
    score:trigger?.quality||Math.round((snap?.stage?.dominantConfidence||0)*100),
    extensionAtr:Math.abs(snap?.features?.extensionAtr||0),
    liveVolumePace:snap?.features?.live?.volumePace??snap?.features?.vol?.rel??0,
    v32Stage:stage,
    v32StageConfidence:snap?.stage?.dominantConfidence||0,
    v32RangeForming:!!snap?.stage?.rangeForming,
    v32Snapshot:snap
  };
}

function entryDataset(internal,snap,x,f,z){
  const a=Math.max(snap?.features?.atr||f?.atr||1,1e-9),d=internal.direction==='HIGH'?1:-1;
  const ns=snap?.features?.zones?.nearestSupport,nr=snap?.features?.zones?.nearestResistance;
  return {
    schema:core.DATASET_SCHEMA,
    episodeId:'ARIS32:'+String(internal.type||'event')+':'+Math.floor(internal.entryTime/60000),
    episodeSequence:1,
    path1m:[],
    context1m:[],
    entry:{
      capturedAt:internal.entryTime,
      price:internal.entryPrice,
      outputDirection:internal.direction,
      modelDirection:internal.direction,
      decisionPolicy:'aris_v32_stage_adaptive',
      decisionReason:internal.reason,
      strategyVersion:CFG.version,
      setupType:triggerType(internal.type),
      setupReason:internal.reason,
      level:internal.entryPrice,
      entryLow:d>0?internal.entryPrice-a*.10:internal.entryPrice-a*.35,
      entryHigh:d>0?internal.entryPrice+a*.35:internal.entryPrice+a*.10,
      atr:a,
      trend:f?.trend??0,
      momentum:f?.mom??0,
      momentumAccel:f?.momAccel??0,
      eff:f?.eff??0,
      ema8:f?.ema8??snap?.features?.ema8,
      ema21:f?.ema21??snap?.features?.ema21,
      emaSepAtr:f?.emaSepAtr??snap?.features?.emaSepAtr,
      emaSlopeAtr:f?.emaSlopeAtr??snap?.features?.emaSlope5,
      rangeHigh:snap?.features?.range?.high??f?.high,
      rangeLow:snap?.features?.range?.low??f?.low,
      fair:snap?.features?.range?.mid??f?.fair,
      rangeWidthAtr:snap?.features?.range?.widthAtr??f?.rangeWidthAtr,
      rangePosition:snap?.features?.rangePosition??f?.rangePosition,
      relativeVolume:snap?.features?.vol?.rel??f?.relVolume,
      volume3Ratio:snap?.features?.vol?.ratio3??f?.volume3Ratio,
      bodyAtr:snap?.features?.live?.bodyAtr??snap?.features?.current?.bodyAtr??f?.bodyAtr,
      rangeAtr:snap?.features?.live?.rangeAtr??snap?.features?.current?.rangeAtr??f?.rangeAtr,
      closeLocation:snap?.features?.live?.closeLoc??snap?.features?.current?.closeLoc??f?.closeLocation,
      liveVolumePace:snap?.features?.live?.volumePace??null,
      flow:x.flow||0,coverage:x.coverage||0,book:x.book||0,bookValid:!!x.bookValid,
      zones:{
        nearestSupport:ns?{price:ns.price,distanceAtr:Math.abs(ns.distanceAtr),touches:ns.touches||0,confirmedAt:ns.lastTime||null}:null,
        nearestResistance:nr?{price:nr.price,distanceAtr:Math.abs(nr.distanceAtr),touches:nr.touches||0,confirmedAt:nr.lastTime||null}:null
      },
      candleSequence:compactCandles(x.bars,a,10),
      prior1m:(x.bars||[]).filter(q=>q.closed!==false).slice(-24).map(q=>[q.time,q.open,q.high,q.low,q.close,q.volume]),
      v32:internal.dataset,
      v32Stage:snap?.stage?.dominant,
      v32StageConfidence:snap?.stage?.dominantConfidence,
      v32StageMix:snap?.stage?.confidence,
      v32Trigger:snap?.triggers?.primary,
      v32Direction:snap?.direction,
      v32Fib:snap?.features?.fib,
      v32Zones:snap?.features?.zones,
      v32Progression:internal.dataset?.features?.progression||null,
      v32SourceMode:snap?.features?.sourceMode||null
    }
  };
}

function compatSignal(internal,snap,x,f,z){
  return {
    id:internal.id,
    version:CFG.version,
    type:triggerType(internal.type),
    direction:internal.direction,
    modelDirection:internal.direction,
    decisionPolicy:'aris_v32_stage_adaptive',
    entryTime:internal.entryTime,
    entryPrice:internal.entryPrice,
    expiresAt:internal.expiresAt,
    result:'pending',
    lastObserved:internal.entryTime,
    event:{
      id:internal.id,
      type:triggerType(internal.type),
      d:internal.direction==='HIGH'?1:-1,
      stage:internal.stage,
      triggerQuality:internal.triggerQuality,
      entryQuality:internal.entryQuality
    },
    features:{
      atr:snap?.features?.atr??f?.atr,
      trend:f?.trend??0,
      flow:x.flow||0,book:x.book||0,
      regime:stageToRegime(snap?.stage?.dominant),
      stableMode:stageToRegime(snap?.stage?.dominant),
      marketPhase:stageToPhase(snap?.stage?.dominant),
      rangePosition:snap?.features?.rangePosition,
      relativeVolume:snap?.features?.vol?.rel,
      volume3Ratio:snap?.features?.vol?.ratio3,
      bodyAtr:snap?.features?.live?.bodyAtr??snap?.features?.current?.bodyAtr,
      rangeAtr:snap?.features?.live?.rangeAtr??snap?.features?.current?.rangeAtr,
      extensionAtr:snap?.features?.extensionAtr,
      v32Stage:snap?.stage?.dominant,
      v32StageConfidence:snap?.stage?.dominantConfidence,
      v32Trigger:internal.type,
      v32EntryQuality:internal.entryQuality
    },
    dataset:entryDataset(internal,snap,x,f,z),
    reason:'ARIS 3.2 · '+internal.reason
  };
}

function v32Input(x){
  return {
    bars1m:x.bars||[],
    bars5m:x.five||[],
    bars15m:x.fifteen||[],
    price:x.price,
    flow:x.flow||0,
    book:x.bookValid?x.book||0:0,
    ts:x.ts,
    fresh:!!x.fresh,
    currentCandle:x.current||null,
    liveVolumePace:finite(x.liveVolumePace)?x.liveVolumePace:null
  };
}

function statusMap(status){
  return ({
    WARMUP:'warmup',
    BLOCKED_DATA:'offline',
    DUPLICATE:'issued',
    CONFIRMING:'confirming',
    ENTER:'new',
    WAIT_REARM:'issued',
    WATCH:'watch',
    TRACKING:'tracking',
    BLOCKED:'tracking'
  })[status]||'watch';
}

class V32CompatEngine extends BaseEngine{
  constructor(saved={}){
    super(saved);
    this.v32Entry=new Entry.Engine(saved.v32Engine||{});
    this.v32Training=new Training.Ledger(saved.v32Training||{});
    this.v32LastSnapshot=null;
  }
  serialize(){
    const base=super.serialize();
    return {...base,v32Engine:this.v32Entry.serialize(),v32Training:this.v32Training.serialize()};
  }
  reset(reason,time){
    this.v32Entry.reset();
    this.v32LastSnapshot=null;
    return super.reset(reason,time);
  }
  finalizeReview(sig){
    super.finalizeReview(sig);
    if(sig.version!==CFG.version||!sig.dataset)return;
    const lr=this.v32Training.signals.find(q=>q.id===sig.id);
    if(lr?.review){
      sig.dataset.review=sig.dataset.review||{};
      sig.dataset.review.v32={...lr.review,ledgerResult:lr.result,causality:'post_entry_labels_only'};
      sig.dataset.review.summary=(sig.dataset.review.summary||'')+' · ARIS 3.2 เก็บ Stage/Trigger path หลังเข้าแยกจากข้อมูลตัดสินใจ';
    }
  }
  settle(t){
    this.v32Training.observe(t.ts,t.price,this.v32LastSnapshot);
    return super.settle(t);
  }
  step(x){
    const f=features(x.bars,x.price,x.horizonBars||10);
    if(!f)return {status:'warmup',reason:'ARIS 3.2 · รอแท่งสมบูรณ์อย่างน้อย 40 แท่ง',signal:null};

    const input=v32Input(x);
    const primary=(x.horizonBars||10)===10;
    const res=primary?this.v32Entry.step(input):{...Triggers.analyze(input),status:'WATCH',signal:null};
    const snap=res.snapshot||res;
    this.v32LastSnapshot=snap?.ready?snap:this.v32LastSnapshot;

    if(primary&&res.snapshot?.ready)this.v32Training.record(res);

    const z=compatZones(snap),regime=compatRegime(snap),phase=compatPhase(snap);
    const trigger=snap?.triggers?.primary||res.trigger||null;
    const currentEntryQuality=trigger&&snap?.ready?Entry.entryQuality(snap,trigger):null;
    const d=trigger?.d||stageDir(snap);
    const watch=d?{
      direction:d>0?'HIGH':'LOW',
      d,
      score:trigger?.quality??Math.round(Math.abs(snap?.direction?.signedEdge||0)*100),
      state:trigger?.ready?'READY':'WATCH',
      reasons:[snap?.stage?.dominant,trigger?.id,...(trigger?.reasons||[]).slice(0,3)].filter(Boolean),
      reason:(trigger?.reasons||[])[0]||snap?.explanation?.headline||'กำลังอ่าน Stage'
    }:null;

    let signal=null;
    if(primary&&res.signal){
      signal=compatSignal(res.signal,snap,x,f,z);
      if(!this.signals.some(q=>q.id===signal.id)){
        this.signals.push(signal);
        if(this.signals.length>CFG.maxHistory){
          const i=this.signals.findIndex(q=>q.result!=='pending');
          if(i>=0)this.signals.splice(i,1);
        }
        this.log('issued',x.ts,{id:signal.id,setupType:signal.type,direction:signal.direction,price:x.price,v32Stage:snap?.stage?.dominant,v32Trigger:res.signal.type,entryQuality:res.signal.entryQuality});
      }else signal=null;
    }

    const state=statusMap(res.status);
    const reason=res.reason||(
      trigger
        ?'ARIS 3.2 · '+String(snap?.stage?.dominant||'TRANSITION')+' · '+trigger.id+' · '+(trigger.missing?.[0]||trigger.reasons?.[0]||'กำลังประเมิน')
        :'ARIS 3.2 · '+String(snap?.stage?.dominant||'TRANSITION')+' · ยังไม่มี Trigger'
    );
    const gate={
      state:signal?'ENTER':trigger?.ready?'READY':state==='tracking'?'WATCH':'WAIT',
      direction:d?(d>0?'HIGH':'LOW'):null,
      code:'v32_'+String(trigger?.id||snap?.stage?.dominant||'observe').toLowerCase(),
      blocker:trigger?.hardBlocks?.[0]||trigger?.missing?.[0]||null,
      waitingFor:[...(trigger?.missing||[])],
      metrics:{
        stage:snap?.stage?.dominant,
        stageConfidence:snap?.stage?.dominantConfidence,
        trigger:trigger?.id||null,
        triggerQuality:trigger?.quality??null,
        triggerThresholdWatch:trigger?.thresholds?.watch??null,
        triggerThresholdReady:trigger?.thresholds?.ready??null,
        triggerStatus:trigger?.status||null,
        triggerReady:!!trigger?.ready,
        entryQuality:res.signal?.entryQuality??currentEntryQuality,
        candidateTicks:res.candidate?.ticks??null,
        candidateBestQuality:res.candidate?.bestQuality??null,
        rearmFamily:res.rearm?.family||null,
        rearmArmed:res.rearm?.armed??null,
        missing:[...(trigger?.missing||[])],
        penalties:[...(trigger?.penalties||[])],
        hardBlocks:[...(trigger?.hardBlocks||[])],
        rangeForming:!!snap?.stage?.rangeForming,
        roomUpAtr:snap?.features?.zones?.roomUpAtr,
        roomDownAtr:snap?.features?.zones?.roomDownAtr
      }
    };

    return this.lastView={
      f,z,regime,phase,
      v32Story:{
        schema:'aris-v32-ui-story-v2',
        stage:snap?.stage,
        direction:snap?.direction,
        trigger,
        explanation:snap?.explanation,
        structure:snap?.structure,
        fib:compatFib(snap?.features?.fib),
        zones:snap?.features?.zones,
        range:snap?.features?.range,
        breakout:snap?.features?.breakout,
        currentEntryQuality,
        candidate:res.candidate||null,
        rearm:res.rearm||null,
        status:res.status,
        reason:res.reason||reason
      },
      signal,event:trigger?{type:triggerType(trigger.id),d:trigger.d,stage:snap?.stage?.dominant}:null,
      watch,
      status:signal?'new':state,
      reason,
      gate,
      continuation:0,
      reversal:0
    };
  }
}

core.Engine=V32CompatEngine;
root.ArisV32Adapter=Object.freeze({version:CFG.version,revision:'v32-adapter-r1',Engine:V32CompatEngine});

const priorAssess=root.ContinuousDirection?.assess;
if(root.ContinuousDirection){
  root.ContinuousDirection.assess=function(x){
    if(CFG.version!=='ARIS-3.2.0')return priorAssess?priorAssess(x):{available:false,reason:'Direction engine unavailable'};
    const snap=x.phase?.v32Snapshot;
    if(!x.fresh||!snap?.ready||!snap.direction?.ready)return {available:false,reason:x.reason||'ARIS 3.2 · กำลังสร้าง Stage'};
    const high=snap.direction.highEdge,low=snap.direction.lowEdge,direction=snap.direction.direction,d=direction==='HIGH'?1:direction==='LOW'?-1:0;
    const trigger=snap.triggers?.primary;
    const risk=trigger?.ready?(trigger.quality>=75?'ต่ำตามเกณฑ์':'กลาง'):trigger?.hardBlocks?.length?'สูง':'กลาง';
    const room=d>0?snap.features?.zones?.roomUpAtr:d<0?snap.features?.zones?.roomDownAtr:null;
    return {
      available:true,high,low,direction,risk,riskScore:risk==='สูง'?4:risk==='กลาง'?2:0,
      referencePrice:x.price,referenceTime:x.ts,targetTime:x.ts+CFG.horizonMs,
      reason:'ARIS 3.2 · '+snap.stage.dominant+' '+Math.round((snap.stage.dominantConfidence||0)*100)+'% · '+(trigger?.id||'กำลังหา Trigger')+(trigger?.missing?.[0]?' · รอ '+trigger.missing[0]:''),
      parts:{
        stage:snap.stage.dominant,
        stageMix:snap.stage.confidence,
        trigger:trigger?.id||null,
        triggerQuality:trigger?.quality??null,
        rangeForming:!!snap.stage.rangeForming
      },
      weights:snap.direction.models?.[snap.stage.dominant]?.components||null,
      regime:stageToRegime(snap.stage.dominant),
      coverage:x.coverage||0,
      room:finite(room)?room:null,
      extension:Math.abs(snap.features?.extensionAtr||0),
      retreat:0,
      v32:snap
    };
  };
}
})(typeof globalThis!=='undefined'?globalThis:window);
