(() => {
  'use strict';

  const SCHEMA='historical-replay-v1';
  const MODE='1m_bar_close_replay';
  const DEFAULT_VERSION='ARIS-2.0.0';
  const MINUTE=60_000;
  const CONFIRM_OFFSETS=[0,400,800];
  const CHECKPOINT_EVERY=500;
  const HISTORY_LIMIT=220;
  const state={run:null};

  const clone=v=>{try{return structuredClone(v);}catch{return JSON.parse(JSON.stringify(v));}};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function toEngineBar(b){
    return {
      time:Math.floor(Number(b.time)/1000),
      open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume),
      closed:true
    };
  }

  function minuteFlow(bar){
    const q=Number(bar.quoteVolume),buy=Number(bar.takerBuyQuote);
    if(!(q>0)||!Number.isFinite(buy))return 0;
    return clamp((2*buy-q)/q,-1,1);
  }

  function makeAggregate(minutes){
    return {minutes,current:null,closed:[]};
  }

  function updateAggregate(agg,bar){
    const bucketMs=agg.minutes*MINUTE,bucketStart=Math.floor(Number(bar.time)/bucketMs)*bucketMs;
    if(agg.current&&agg.current.bucketStart!==bucketStart){
      if(agg.current.count>0){
        agg.closed.push({...agg.current.bar,closed:true});
        if(agg.closed.length>100)agg.closed.splice(0,agg.closed.length-100);
      }
      agg.current=null;
    }
    if(!agg.current){
      agg.current={
        bucketStart,count:0,
        bar:{time:Math.floor(bucketStart/1000),open:Number(bar.open),high:Number(bar.high),low:Number(bar.low),close:Number(bar.close),volume:0,closed:false}
      };
    }
    const c=agg.current;c.count++;
    c.bar.high=Math.max(c.bar.high,Number(bar.high));c.bar.low=Math.min(c.bar.low,Number(bar.low));c.bar.close=Number(bar.close);c.bar.volume+=Number(bar.volume)||0;

    if(Number(bar.time)+MINUTE>=bucketStart+bucketMs){
      agg.closed.push({...c.bar,closed:true});
      if(agg.closed.length>100)agg.closed.splice(0,agg.closed.length-100);
      agg.current=null;
    }
  }

  function runtimeSnapshot(engine){
    return {
      previous:clone(engine.previous),lastId:engine.lastId,session:engine.session,
      active:clone(engine.active),consumed:[...(engine.consumed||new Map()).entries()],
      watchState:clone(engine.watchState),lastWatchRecorded:clone(engine.lastWatchRecorded),
      regimeMode:engine.regimeMode,regimeCandidate:engine.regimeCandidate,regimeCandidateCount:engine.regimeCandidateCount,regimeBarTime:engine.regimeBarTime,
      v2Candidate:clone(engine.v2Candidate),v2Switch:clone(engine.v2Switch),v2LastSignal:clone(engine.v2LastSignal),v2Memory:clone(engine.v2Memory),
      v3Episode:clone(engine.v3Episode),v3Candidate:clone(engine.v3Candidate),v3LastSignal:clone(engine.v3LastSignal)
    };
  }

  function restoreRuntime(engine,r={}){
    if(r.previous)engine.previous=r.previous;
    if(r.lastId!=null)engine.lastId=r.lastId;
    if(Number.isFinite(r.session))engine.session=r.session;
    if(r.active)engine.active=r.active;
    if(Array.isArray(r.consumed))engine.consumed=new Map(r.consumed);
    if(r.watchState)engine.watchState=r.watchState;
    if(r.lastWatchRecorded)engine.lastWatchRecorded=r.lastWatchRecorded;
    if(r.regimeMode)engine.regimeMode=r.regimeMode;
    if(r.regimeCandidate!==undefined)engine.regimeCandidate=r.regimeCandidate;
    if(Number.isFinite(r.regimeCandidateCount))engine.regimeCandidateCount=r.regimeCandidateCount;
    if(Number.isFinite(r.regimeBarTime))engine.regimeBarTime=r.regimeBarTime;
    if(r.v2Candidate)engine.v2Candidate=r.v2Candidate;
    if(r.v2Switch)engine.v2Switch=r.v2Switch;
    if(r.v2LastSignal)engine.v2LastSignal=r.v2LastSignal;
    if(r.v2Memory)engine.v2Memory=r.v2Memory;
    if(r.v3Episode)engine.v3Episode=r.v3Episode;
    if(r.v3Candidate)engine.v3Candidate=r.v3Candidate;
    if(r.v3LastSignal)engine.v3LastSignal=r.v3LastSignal;
  }

  function resetAtTestBoundary(engine){
    engine.signals=[];engine.audit=[];engine.watchSamples=[];
    engine.active=null;engine.v2Candidate=null;engine.v2Switch=null;engine.v2LastSignal=null;
    engine.v3Episode=null;engine.v3Candidate=null;engine.v3LastSignal=null;
    engine.watchState=null;engine.lastWatchRecorded={HIGH:0,LOW:0};engine.lastId=null;
    engine.consumed=new Map();engine.session=0;
  }

  function replayMeta(run,barIndex){
    return {
      schema:SCHEMA,source:'historical_replay',mode:MODE,sessionId:run.session.id,datasetId:run.session.datasetId,
      replayResolution:'1m_close',barIndex,dataQuality:run.session.quality?.grade||null,
      noLookahead:true,orderBookAvailable:false,tickFlowAvailable:false,liquidationAvailable:false,
      flowSource:'derived_from_1m_taker_buy_quote',
      confirmationAdapter:'same_close_0_400_800ms',
      continuityAdapter:'previous_close_timestamp_bridge',
      limitation:'Entry logic is evaluated at completed 1m candle close; this is not tick-for-tick live reconstruction.'
    };
  }

  function inputFor(run,bar,engineBar,ts,id){
    return {
      ts,id,price:Number(bar.close),bars:run.recentBars,
      five:run.agg5.closed,fifteen:run.agg15.closed,
      flow:minuteFlow(bar),coverage:60,book:0,bookValid:false,fresh:true,
      current:engineBar,expedite:false,horizonBars:10
    };
  }

  function bridgeContinuity(engine,price,ts){
    if(!engine.previous)return;
    if(ts-engine.previous.ts>5000)engine.previous={price:Number(price),ts:ts-1000};
  }

  function normalizeNewSignal(run,signal,barIndex,logicalClose){
    if(!signal?.dataset?.entry)return signal;
    const originalEntryTime=signal.entryTime;
    signal.dataset.replay=replayMeta(run,barIndex);
    signal.dataset.entry.replay=replayMeta(run,barIndex);
    signal.dataset.entry.replay.originalEngineEntryTime=originalEntryTime;
    signal.dataset.entry.replay.logicalEntryTime=logicalClose;
    signal.dataset.entry.capturedAt=logicalClose;
    signal.entryTime=logicalClose;
    signal.expiresAt=logicalClose+10*MINUTE;
    signal.lastObserved=logicalClose;
    globalThis.AuditEngineV2?.ensureAudit?.(signal,run.engine.signals);
    run.records.set(signal.id,signal);
    run.pending.set(signal.id,{signal,entryIndex:barIndex,exitIndex:barIndex+10});
    run.stats.signals++;
    return signal;
  }

  function appendOutcomeBar(meta,bar,barIndex,view,flow){
    const sig=meta.signal;
    if(!sig?.dataset||barIndex<=meta.entryIndex||barIndex>meta.exitIndex)return;
    const minute=barIndex-meta.entryIndex,closeTs=Number(bar.time)+MINUTE;
    const path=sig.dataset.path1m||(sig.dataset.path1m=[]);
    path.push({
      minute,startMs:Number(bar.time),endMs:closeTs,open:Number(bar.open),high:Number(bar.high),low:Number(bar.low),close:Number(bar.close),lastTs:closeTs,
      source:'historical_1m'
    });
    const story=view?.v3Story||view?.phase?.v3View?.story||view?.v2Story||view?.phase?.v2View?.story||null;
    const context=sig.dataset.context1m||(sig.dataset.context1m=[]);
    context.push({
      minute,ts:closeTs,price:Number(bar.close),flow,book:0,bookValid:false,coverage:60,
      regime:view?.regime?.mode||null,phase:view?.phase?.phase||null,trend:view?.f?.trend??null,momentum:view?.f?.mom??null,
      rangePosition:view?.f?.rangePosition??null,room:null,
      v2State:view?.v2Story?story?.state||null:null,v2Playbook:view?.v2Story?story?.playbook||null:null,
      v3State:view?.v3Story?story?.state||null:null,v3Playbook:view?.v3Story?story?.playbook||null:null,v3EpisodeId:view?.v3Story?story?.episodeId||null:null,source:'historical_1m_close'
    });
  }


  function compactStoredSignal(signal){
    const e=signal?.dataset?.entry||{},o=signal?.dataset?.outcome||{},review=signal?.dataset?.review||{},a=e.auditV2||{},ev=signal?.dataset?.auditEvaluationV2||null;
    return {
      id:signal.id,version:signal.version,type:signal.type,direction:signal.direction,
      episodeSequence:signal.dataset?.episodeSequence||1,
      entryTime:signal.entryTime,entryPrice:signal.entryPrice,result:signal.result,
      exitTime:signal.exitTime??null,exitPrice:signal.exitPrice??null,
      entry:{
        state:e.v3State||e.v2State||null,playbook:e.v3Playbook||e.v2Playbook||null,family:e.v3EpisodeFamily||e.v2Family||null,
        evidence:e.v3GateQuality??e.v2EntryEvidence??null,stateConfidence:e.v2StateConfidence??null,
        atr:e.atr??null,trend:e.trend??null,momentum:e.momentum??null,flow:e.flow??null,
        rangePosition:e.rangePosition??null,relativeVolume:e.relativeVolume??null,
        roomSupport:e.zones?.nearestSupport?.distanceAtr??null,roomResistance:e.zones?.nearestResistance?.distanceAtr??null,
        extensionAtr:signal.features?.extensionAtr??null,
        fib:(e.v3Fib||e.v2Fib)?{valid:!!(e.v3Fib||e.v2Fib).valid,retracement:(e.v3Fib||e.v2Fib).retracement??null,extension:(e.v3Fib||e.v2Fib).extension??null,retraceZone:(e.v3Fib||e.v2Fib).retraceZone??null,extensionZone:(e.v3Fib||e.v2Fib).extensionZone??null,healthy:!!(e.v3Fib||e.v2Fib).healthy,deep:!!(e.v3Fib||e.v2Fib).deep,confluence:!!(e.v3Fib||e.v2Fib).confluence}:null,
        candleFlags:e.v2CandleBehavior?{
          bodyDecay:!!e.v2CandleBehavior.bodyDecay,failedExpansion:!!e.v2CandleBehavior.failedExpansion,
          shock:!!e.v2CandleBehavior.shock,marubozu:!!e.v2CandleBehavior.marubozu
        }:null,
        audit:a?.schema?{
          score:a.score,confidence:a.confidence,grade:a.grade,components:a.components,
          risks:(a.riskFlags||[]).map(x=>x.code),critical:(a.criticalAdjustments||[]).map(x=>x.code)
        }:null
      },
      outcome:{
        directionalMoveAtr:o.directionalMoveAtr??null,mfeAtr:o.mfeAtr??null,maeAtr:o.maeAtr??null,
        mfeAtMinute:o.mfeAtMinute??null,maeAtMinute:o.maeAtMinute??null
      },
      tags:review.tags||[],
      auditEvaluation:ev?{band:ev.band??null,missType:ev.auditMissType??null}:null,
      replay:{sessionId:signal.dataset?.replay?.sessionId||null,mode:signal.dataset?.replay?.mode||null,dataQuality:signal.dataset?.replay?.dataQuality||null}
    };
  }
  async function storeSettled(run,signal){
    const compact=compactStoredSignal(signal);
    const record={
      id:run.session.id+'::'+signal.id,sessionId:run.session.id,originalSignalId:signal.id,
      entryTime:signal.entryTime,result:signal.result,updatedAt:Date.now(),storageProfile:'compact-training-v1',signal:compact
    };
    const audit={
      id:run.session.id+'::'+signal.id,sessionId:run.session.id,originalSignalId:signal.id,updatedAt:Date.now(),
      entryAudit:clone(signal.dataset?.entry?.auditV2||null),evaluation:clone(signal.dataset?.auditEvaluationV2||null)
    };
    await globalThis.HistoricalDataV1.putMany('signals',[record]);
    await globalThis.HistoricalDataV1.putMany('audit',[audit]);
  }

  async function settleAtBar(run,meta,bar){
    const sig=meta.signal,exit=Number(bar.close),exitTime=Number(bar.time)+MINUTE;
    sig.exitPrice=exit;sig.exitTime=exitTime;sig.lastObserved=exitTime;
    sig.result=exit===sig.entryPrice?'equal':((exit>sig.entryPrice)===(sig.direction==='HIGH')?'correct':'incorrect');
    run.engine.finalizeReview(sig);
    globalThis.AuditCalibrationV2?.ensureEvaluation?.(sig);
    sig.dataset.replay.settledBy='bar_index_plus_10';
    sig.dataset.replay.exitBarIndex=meta.exitIndex;
    sig.dataset.replay.exitResolution='1m_close';
    run.stats.settled++;
    if(sig.result==='correct')run.stats.correct++;
    else if(sig.result==='incorrect')run.stats.incorrect++;
    else if(sig.result==='equal')run.stats.equal++;
    else run.stats.missing++;
    await storeSettled(run,sig);
  }

  async function processExistingPending(run,bar,barIndex,view,flow){
    const rows=[...run.pending.values()];
    for(const meta of rows){
      if(barIndex<=meta.entryIndex)continue;
      appendOutcomeBar(meta,bar,barIndex,view,flow);
      if(barIndex>=meta.exitIndex){
        await settleAtBar(run,meta,bar);
        run.pending.delete(meta.signal.id);
      }
    }
  }

  function stepBar(run,bar,barIndex){
    const engine=run.engine,eb=toEngineBar(bar),logicalClose=Number(bar.time)+MINUTE,flow=minuteFlow(bar);
    run.recentBars.push(eb);if(run.recentBars.length>HISTORY_LIMIT)run.recentBars.splice(0,run.recentBars.length-HISTORY_LIMIT);
    updateAggregate(run.agg5,bar);updateAggregate(run.agg15,bar);
    bridgeContinuity(engine,run.previousClose??bar.open,logicalClose);

    let latestView=null,newSignal=null;
    for(let j=0;j<CONFIRM_OFFSETS.length;j++){
      const ts=logicalClose+CONFIRM_OFFSETS[j];
      const input=inputFor(run,bar,eb,ts,'REPLAY:'+run.session.id+':'+barIndex+':'+j);
      const v=engine.step(input);latestView=v||latestView;
      if(v?.signal&&!newSignal)newSignal=v.signal;
    }
    run.previousClose=Number(bar.close);
    if(newSignal&&barIndex>=run.testStartIndex)normalizeNewSignal(run,newSignal,barIndex,logicalClose);
    return {view:latestView,flow,newSignal};
  }

  function checkpointPayload(run,nextIndex){
    return {
      schema:'replay-checkpoint-v1',mode:MODE,nextIndex,engineVersion:run.engineVersion,
      engineState:clone(run.engine.serialize()),runtime:runtimeSnapshot(run.engine),
      pending:[...run.pending.values()].map(x=>({signalId:x.signal.id,entryIndex:x.entryIndex,exitIndex:x.exitIndex})),
      recentBars:clone(run.recentBars),agg5:clone(run.agg5),agg15:clone(run.agg15),previousClose:run.previousClose,
      stats:clone(run.stats),testStartIndex:run.testStartIndex,totalBars:run.bars.length
    };
  }

  async function saveCheckpoint(run,nextIndex){
    await globalThis.HistoricalDataV1.saveCheckpoint(run.session.id,checkpointPayload(run,nextIndex));
    run.lastCheckpointIndex=nextIndex;
  }

  function hydrateFromCheckpoint(run,cp){
    const Core=run.core;
    if(cp?.engineVersion&&cp.engineVersion!==run.engineVersion)throw new Error('Checkpoint เป็นคนละเวอร์ชันกับที่เลือกเทรน');
    run.engine=new Core.Engine(cp.engineState||{});
    restoreRuntime(run.engine,cp.runtime||{});
    run.recentBars=cp.recentBars||[];
    run.agg5=cp.agg5||makeAggregate(5);run.agg15=cp.agg15||makeAggregate(15);
    run.previousClose=cp.previousClose;
    run.stats={...run.stats,...(cp.stats||{})};
    run.testStartIndex=Number.isFinite(cp.testStartIndex)?cp.testStartIndex:run.testStartIndex;
    run.nextIndex=Number.isFinite(cp.nextIndex)?cp.nextIndex:0;
    const byId=new Map(run.engine.signals.map(s=>[s.id,s]));
    run.pending=new Map((cp.pending||[]).map(x=>{
      const signal=byId.get(x.signalId);
      return signal?[x.signalId,{signal,entryIndex:x.entryIndex,exitIndex:x.exitIndex}]:null;
    }).filter(Boolean));
  }

  async function finalReport(run,status='completed'){
    const stored=await globalThis.HistoricalDataV1.getBySession('signals',run.session.id);
    const unique=new Map(stored.map(r=>[r.originalSignalId,r.signal]));
    for(const [id,s] of run.records)if(s.result!=='pending')unique.set(id,clone(s));
    const signals=[...unique.values()].sort((a,b)=>(a.entryTime||0)-(b.entryTime||0));
    const settled=signals.filter(s=>['correct','incorrect','equal'].includes(s.result));
    const correct=signals.filter(s=>s.result==='correct').length,incorrect=signals.filter(s=>s.result==='incorrect').length,equal=signals.filter(s=>s.result==='equal').length;
    return {
      schema:'replay-report-v1',phase:2,status,sessionId:run.session.id,datasetId:run.session.datasetId,
      mode:MODE,generatedAt:new Date().toISOString(),noLookahead:true,
      engineVersion:run.session.engineVersion,engineBlobSha:run.session.engineBlobSha,auditSchema:globalThis.AuditEngineV2?.schema||run.session.auditSchema,
      resolution:{market:'1m closed candles',entry:'bar-close confirmation adapter',outcome:'close of bar +10',intrabarOrder:'not reconstructed'},
      dataQuality:run.session.quality?.grade||null,
      counts:{signals:signals.length,settled:settled.length,correct,incorrect,equal,missing:signals.filter(s=>s.result==='missing').length,pending:signals.filter(s=>s.result==='pending').length},
      winRate:(correct+incorrect)?correct/(correct+incorrect):null,
      limitations:[
        'Historical order book is unavailable in Kline dataset.',
        'Tick-by-tick flow and sub-minute price path are not reconstructed.',
        'Flow uses 1m taker-buy quote imbalance known at candle close.',
        'Entry timing therefore represents a 1m bar-close replay, not live tick timing.'
      ]
    };
  }

  async function updateSession(run,patch){
    run.session={...run.session,...patch,updatedAt:Date.now()};
    await globalThis.HistoricalDataV1.saveSession(run.session);
  }

  async function execute(run){
    const started=performance.now(),total=run.bars.length;
    await updateSession(run,{
      status:'replaying',phase:2,replaySchema:SCHEMA,replayMode:MODE,replayStartedAt:run.session.replayStartedAt||Date.now(),
      replayResolution:'1m_close',replayNoLookahead:true,replayEngineVersion:run.engineVersion,engineVersion:run.engineVersion
    });

    for(let i=run.nextIndex;i<total;i++){
      if(run.stopRequested){
        await saveCheckpoint(run,i);
        const report=await finalReport(run,'stopped');
        await globalThis.HistoricalDataV1.saveReport(run.session.id,report);
        await updateSession(run,{status:'stopped',replayProgress:i/total,replayProcessedBars:i,replayReport:report.counts});
        run.onProgress?.({...run.stats,status:'stopped',processedBars:i,totalBars:total,progress:i/total,replayClock:run.bars[Math.max(0,i-1)]?.time||null,report});
        return report;
      }
      while(run.paused){
        if(!run.pauseCheckpointSaved){await saveCheckpoint(run,i);run.pauseCheckpointSaved=true;await updateSession(run,{status:'paused',replayProgress:i/total,replayProcessedBars:i});}
        await delay(120);
        if(run.stopRequested)break;
      }
      if(run.stopRequested){i--;continue;}
      run.pauseCheckpointSaved=false;

      const bar=run.bars[i];
      if(i===run.testStartIndex&&!run.boundaryResetDone){
        resetAtTestBoundary(run.engine);run.records.clear();run.pending.clear();run.stats.signals=0;run.stats.settled=0;run.stats.correct=0;run.stats.incorrect=0;run.stats.equal=0;run.stats.missing=0;
        run.boundaryResetDone=true;
      }

      const out=stepBar(run,bar,i);
      if(i>=run.testStartIndex){
        await processExistingPending(run,bar,i,out.view,out.flow);
        run.stats.testBarsProcessed++;
      }else run.stats.warmupBarsProcessed++;

      run.stats.processedBars=i+1;
      run.stats.pending=run.pending.size;

      if((i+1)%CHECKPOINT_EVERY===0)await saveCheckpoint(run,i+1);

      const batch=run.speed==='balanced'?80:run.speed==='safe'?25:250;
      if((i+1)%batch===0){
        const elapsed=Math.max(.001,(performance.now()-started)/1000);
        run.onProgress?.({
          ...run.stats,status:'replaying',processedBars:i+1,totalBars:total,progress:(i+1)/total,
          replayClock:Number(bar.time)+MINUTE,barsPerSecond:(i-run.startIndex+1)/elapsed,
          currentState:out.view?.v2Story?.state||out.view?.regime?.v2State||null,currentPlaybook:out.view?.v2Story?.playbook||null
        });
        await delay(0);
      }
    }

    // Any entry without ten future bars is not scored; store it as pending replay tail.
    for(const meta of run.pending.values()){
      meta.signal.dataset.replay.tailIncomplete=true;
      const record={id:run.session.id+'::'+meta.signal.id,sessionId:run.session.id,originalSignalId:meta.signal.id,entryTime:meta.signal.entryTime,result:'pending',updatedAt:Date.now(),storageProfile:'compact-training-v1',signal:compactStoredSignal(meta.signal)};
      await globalThis.HistoricalDataV1.putMany('signals',[record]);
    }

    await globalThis.HistoricalDataV1.clearCheckpoint(run.session.id);
    const report=await finalReport(run,'completed');
    await globalThis.HistoricalDataV1.saveReport(run.session.id,report);
    await updateSession(run,{
      status:'replay_complete',replayCompletedAt:Date.now(),replayProgress:1,replayProcessedBars:total,
      replayReport:report.counts,replayWinRate:report.winRate
    });
    run.onProgress?.({...run.stats,status:'completed',processedBars:total,totalBars:total,progress:1,replayClock:Number(run.bars.at(-1)?.time)+MINUTE,barsPerSecond:0,report});
    return report;
  }

  async function createRun(sessionId,options={}){
    if(state.run&&state.run.running)throw new Error('มี Replay กำลังทำงานอยู่แล้ว');
    if(!globalThis.HistoricalDataV1)throw new Error('HistoricalDataV1 ไม่พร้อม');
    if(!globalThis.TrainingEngineRegistryV1)throw new Error('Training Engine Registry ไม่พร้อม');

    const session=await globalThis.HistoricalDataV1.getSession(sessionId);
    if(!session)throw new Error('ไม่พบ Training Session');
    if(!session.datasetId)throw new Error('Session ไม่มี Historical Dataset');
    if(!['ready','paused','stopped','replaying','replay_complete'].includes(session.status)&&!session.replayReady)throw new Error('Dataset ยังไม่พร้อม Replay');

    const requestedVersion=String(options.engineVersion||session.engineVersion||DEFAULT_VERSION);
    const loaded=await globalThis.TrainingEngineRegistryV1.load(requestedVersion);
    const Core=loaded.Core;
    if(!Core?.Engine||Core.CFG?.version!==requestedVersion)throw new Error('Training engine '+requestedVersion+' ไม่พร้อม');

    const bars=await globalThis.HistoricalDataV1.getDatasetBars(session.datasetId);
    if(!bars.length)throw new Error('ไม่พบแท่งย้อนหลังใน Training DB');
    const testStartIndex=Math.max(0,bars.findIndex(b=>Number(b.time)>=Number(session.analysisStart)));
    if(testStartIndex<35)throw new Error('Warm-up ไม่พอสำหรับการ Replay');

    const run={
      running:true,paused:false,stopRequested:false,pauseCheckpointSaved:false,boundaryResetDone:false,
      session:{...session,engineVersion:requestedVersion},bars,testStartIndex,nextIndex:0,startIndex:0,
      core:Core,engineVersion:requestedVersion,
      engine:new Core.Engine({}),recentBars:[],agg5:makeAggregate(5),agg15:makeAggregate(15),previousClose:null,
      pending:new Map(),records:new Map(),
      stats:{processedBars:0,testBarsProcessed:0,warmupBarsProcessed:0,signals:0,settled:0,correct:0,incorrect:0,equal:0,missing:0,pending:0},
      speed:options.speed||'fast',onProgress:typeof options.onProgress==='function'?options.onProgress:null
    };

    const requestedResume=!!options.resume;
    const storedCp=requestedResume?await globalThis.HistoricalDataV1.getCheckpoint(sessionId):null;
    const resume=!!storedCp&&(!storedCp.engineVersion||storedCp.engineVersion===requestedVersion);
    const cp=resume?storedCp:null;
    if(cp){
      hydrateFromCheckpoint(run,cp);
      run.startIndex=run.nextIndex;
      run.boundaryResetDone=run.nextIndex>run.testStartIndex;
    }else{
      await globalThis.HistoricalDataV1.clearReplayArtifacts(sessionId);
      run.session={...session,status:'ready',replayReport:null,replayWinRate:null};
      await globalThis.HistoricalDataV1.saveSession(run.session);
    }
    state.run=run;
    return run;
  }

  async function start(sessionId,options={}){
    const run=await createRun(sessionId,options);
    try{return await execute(run);}
    finally{run.running=false;if(state.run===run)state.run=null;}
  }

  function pause(){if(state.run?.running){state.run.paused=true;return true;}return false;}
  function resume(){if(state.run?.running&&state.run.paused){state.run.paused=false;state.run.pauseCheckpointSaved=false;return true;}return false;}
  function stop(){if(state.run?.running){state.run.stopRequested=true;state.run.paused=false;return true;}return false;}
  function current(){return state.run;}
  async function hasCheckpoint(sessionId,engineVersion=null){
    const cp=await globalThis.HistoricalDataV1.getCheckpoint(sessionId);
    if(!cp)return false;
    return !engineVersion||!cp.engineVersion||cp.engineVersion===engineVersion;
  }

  globalThis.HistoricalReplayV1={
    schema:SCHEMA,phase:2,mode:MODE,defaultVersion:DEFAULT_VERSION,
    start,pause,resume,stop,current,hasCheckpoint
  };
})();