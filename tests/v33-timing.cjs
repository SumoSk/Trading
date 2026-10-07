// Deterministic engineering checks. Synthetic fixtures are not market performance evidence.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),api=require('../v33.js');
const html=read('index.html'),boot=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("const DEFAULT_ENGINE_VERSION='ARIS-3.1.0'"));
let checks=0;const pendingTests=[];
function test(name,fn){const result=fn(),done=()=>{checks++;console.log('PASS '+name);};if(result?.then)pendingTests.push(result.then(done));else done();}
const piv=(prices,d=1)=>prices.map((price,i)=>({id:'P'+i,time:i*600,i:i*10,price,type:(i%2===0)===(d>0)?'L':'H',provisional:false}));
const ctx={...api.DEFAULTS,atr:2,bars:[],price:120,time:3600,seconds:60,zones:[{price:114}],htf:{},momentum:0,durations:[8,10,12]};
test('Wave 4 trigger precedes both target and overlap invalidation in both directions',()=>{
 for(const d of [1,-1]){
  const map=p=>d>0?p:220-p,p=piv([100,110,104,120].map(map),d),n=api.project({pivots:p,direction:d,pattern:'IMPULSE',degree:'Working',score:80},{...ctx,price:map(120),zones:[{price:map(114)}]});
  assert(n.projectionReady);assert(n.direction*(n.trigger.price-p.at(-1).price)>0);
  assert(n.direction*((n.direction>0?n.targetLow:n.targetHigh)-n.trigger.price)>0);
  assert(d*(n.trigger.price-n.invalidation)>0);
  let b={...n,state:'ACTIVE',triggered:false};
  Object.assign(b,api.updateBox(b,{price:map(116),ts:n.startTime*1000}));assert.equal(b.triggered,false);
  Object.assign(b,api.updateBox(b,{price:map(114),ts:n.startTime*1000+400}));assert.equal(b.state,'HIT');
 }
});
test('Prior-count invalidation uses original anchors, not unrelated latest swings',()=>{
 const old={degree:'Working',pattern:'IMPULSE',pivots:piv([100,110,104])};
 assert.equal(api.previousCountStatus(old,{Working:piv([200,210])},{price:196,time:6000,bars:[]}).invalid,false);
 assert.equal(api.previousCountStatus(old,{Working:piv([200,210])},{price:99,time:6000,bars:[]}).invalid,true);
});
const wave={seconds:60,timestamp:1000000,unknown:null,preferred:{id:'C',key:'C',state:'CONFIRMED_COMPLETE',pattern:'IMPULSE',currentWave:'2',score:82,next:{wave:'3',direction:1,fromBars:2,toBars:12,startTime:1120,endTime:1720,trigger:{direction:1,price:103},invalidation:98,invalidationDirection:1,projectionReady:true,targetLow:112,targetHigh:116}}};
test('Unknown, stale, remote-horizon and unreached triggers do not boost or veto',()=>{
 const scenarios=[
  {...wave,unknown:'UNRESOLVED',preferred:{...wave.preferred,state:'FORMING'}},
  {...wave,preferred:{...wave.preferred,next:{...wave.preferred.next,invalidation:110}}},
  {...wave,preferred:{...wave.preferred,next:{...wave.preferred.next,startTime:2000}}},
  {...wave,entryTriggerConfirmed:false},
  {...wave,preferred:{...wave.preferred,next:{...wave.preferred.next,trigger:{direction:1,price:108}}}}
 ];
 for(const w of scenarios){const q=api.elliottEntryDecision(w,'HIGH',104,2,'FULL');assert.equal(q.allow,true);assert.equal(q.state,'NEUTRAL');assert.equal(q.entryScoreDelta,0);}
});
test('Ambiguous confirmed counts may agree in direction without claiming a clear count',()=>{
 const other={...wave.preferred,id:'ALT',key:'ALT',pattern:'ZIGZAG',currentWave:'B',score:80},counts=api.selectCounts([wave.preferred,other]);
 assert.equal(counts.unknown,'MULTIPLE_COUNTS_CLOSE');assert.equal(counts.consensus.count,2);
 const decision=api.elliottEntryDecision({...wave,...counts},'HIGH',104,2,'EARLY');
 assert.equal(decision.countClear,false);assert.equal(decision.state,'BOOST');assert.equal(decision.entryScoreDelta,8);
 const opposed=api.selectCounts([wave.preferred,{...other,next:{...other.next,direction:-1}}]);
 assert.equal(api.elliottEntryDecision({...wave,...opposed},'HIGH',104,2,'EARLY').state,'NEUTRAL');
});
const bundle={entryReady:false,fullReady:false,earlyReady:false,hardReady:true,softBlocked:false,policyBlocked:false,alignedEvidence:.09,passed:2,total:4,state:'DEVELOPING',mode:'WAIT',blocked:[],gates:{structure:{state:'PASS'},location:{state:'PASS'},behavior:{state:'DEVELOPING'},micro:{state:'DEVELOPING',coverage:60}}};
test('BOOST really opens qualified early entry and cannot bypass hard gates, flow or HTF',()=>{
 const decision=api.elliottEntryDecision(wave,'HIGH',104,2,'EARLY'),thesis={playbook:'trend_continuation'};
 const q=api.adjustEntryBundle(bundle,decision,thesis);assert(q.entryReady);assert.equal(q.mode,'WAVE_EARLY');assert(q.v33.quality>q.v33.baseQuality);
 for(const b of [{...bundle,hardReady:false},{...bundle,policyBlocked:true},{...bundle,softBlocked:true},{...bundle,gates:{...bundle.gates,micro:{state:'DEVELOPING',coverage:0}}}])assert.equal(api.adjustEntryBundle(b,decision,thesis).entryReady,false);
 assert.equal(api.adjustEntryBundle(bundle,{...decision,state:'OFF'},thesis),bundle);
 const caution={...decision,state:'CAUTION',entryScoreDelta:-8,allowWaveEarly:false};
 assert.equal(api.adjustEntryBundle({...bundle,entryReady:true},caution,thesis).entryReady,false);
 assert.equal(api.adjustEntryBundle({...bundle,entryReady:true},{...decision,state:'NEUTRAL',entryScoreDelta:0,allowWaveEarly:false},thesis).entryReady,true);
 assert.equal(api.adjustEntryBundle({...bundle,entryReady:true},{...decision,state:'NEUTRAL',entryScoreDelta:0,allowWaveEarly:false},{...thesis,v33WaveEntry:true}).entryReady,false);
});
test('Frozen prediction clock is used at entry and terminal predictions do not restart',()=>{
 const frozen={...wave.preferred.next,candidateKey:'C',currentState:'CONFIRMED_COMPLETE',state:'ACTIVE',endTime:1001};
 assert.equal(api.elliottEntryDecision({...wave,timestamp:2000000,box:frozen},'HIGH',104,2).state,'NEUTRAL');
 assert.equal(api.elliottEntryDecision({...wave,box:{...frozen,state:'EXPIRED'}},'HIGH',104,2).state,'NEUTRAL');
 assert(read('v33.js').includes('!s.boxes.some(q=>q.candidateKey===p.key&&q.currentState===p.state)'));
});
test('Fixed T+10 labels survive recount, settle once, and exclude missing observations',()=>{
 const o=new api.Observer();const x={symbol:'BTCUSDT',timeframe:'1m',timeframeSeconds:60,ts:1000000,price:100,bars:[],fresh:true};o.observe(x);
 const f=o.addForecast(x,{id:'FIXED',kind:'WAVE',direction:1,score:80});
 assert.equal(api.settleForecast(f,{price:120,ts:1599999}),null);
 o.observe({...x,price:99,ts:1500000});assert.equal(f.result,'pending');assert.equal(f.entryTime,1000000);assert.equal(f.entryPrice,100);
 const restored=new api.Observer(o.serialize());restored.observe({...x,price:102,ts:1600800});
 const settled=restored.contexts['BTCUSDT|1m'].forecasts[0];assert.equal(settled.result,'correct');assert.equal(settled.exitPrice,102);
 restored.observe({...x,price:90,ts:1660000});assert.equal(settled.result,'correct');
 restored.addForecast({...x,ts:1660000},{id:'MISSING',kind:'ENTRY',direction:1,score:72});restored.observe({...x,ts:2264000,price:120});
 const r=restored.report().fixed10m;assert.equal(r.overall.scored,1);assert.equal(r.overall.missing,1);assert.equal(r.overall.winRate,1);
 assert.equal(restored.contexts['BTCUSDT|1m'].forecasts[1].exitPrice,null);
 restored.resetEvaluation();assert.equal(restored.report().fixed10m.overall.n,0);
});
test('Journal merging preserves settled labels, pending forecasts and entry settings',()=>{
 const begin=html.indexOf('  function mergeV33Memory('),end=html.indexOf('  async function restoreJournalBeforeBoot',begin),c={};vm.createContext(c);vm.runInContext(html.slice(begin,end),c);
 const settled={id:'A',result:'correct',entryTime:1,exitPrice:102,settledAt:601000},pending={id:'B',result:'pending',entryTime:2};
 const context=f=>({lastTs:1,bars:[],audit:[],boxes:[],forecasts:f});
 const s=c.mergeJournalState({signals:[],v33Memory:{contexts:{X:context([settled])}},v33EntryConfig:{enabled:false}},{signals:[],v33Memory:{contexts:{X:context([{...settled,result:'pending'},pending])}}});
 assert.equal(s.v33Memory.contexts.X.forecasts[0].result,'correct');assert.equal(s.v33Memory.contexts.X.forecasts.length,2);assert.equal(s.v33EntryConfig.enabled,false);
});
const doc={readyState:'loading',addEventListener(){},getElementById(){return null;}};
const validation={document:doc,setTimeout(){}};vm.createContext(validation);vm.runInContext(read('training-validation.js'),validation);const va=validation.TrainingValidationV1;
const rows=Array.from({length:100},(_,i)=>({id:'R'+i,version:'ARIS-3.3.0',entryTime:1000000+i*60000,expiresAt:1600000+i*60000,exitTime:1600000+i*60000,episodeId:'E'+Math.floor(i/8),result:i%2?'correct':'incorrect',entry:{v33EntryContext:{entryQuality:i%2?82:68}}}));
test('Train/validation/walk-forward purge future labels and shared episodes',()=>{
 const s=va.chronologicalSplit(rows);assert(s.purge.total>0);assert(s.purge.episodeOverlap>0);
 for(const [early,later] of [[s.train,s.validation],[s.train,s.holdout],[s.validation,s.holdout]]){
  for(const q of early){assert(q.exitTime<later[0].entryTime);assert(!later.some(r=>r.episodeId===q.episodeId));}
 }
 const wf=va.walkForward(rows);assert(wf.folds.length);for(const f of wf.folds){assert(f.purged>0);assert(f.trainEnd+600000<f.testStart);}
 assert.equal(va.entryScore(rows[1]),82);assert.equal(va.entryScore({version:'ARIS-3.3.0',entry:{audit:{score:99}}}),null);
 assert.equal(va.rulesLabel({auditMin:null}),'กติกาเดิม · ไม่เพิ่มตัวกรอง');
});
test('Replay cannot score ten later available bars when the T+10 candle is missing',()=>{
 const source=read('replay-engine.js'),start=source.indexOf('  async function settleAtBar('),end=source.indexOf('  function stepBar(',start),c={MINUTE:60000,appendOutcomeBar(){},async storeSettled(){}};vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 const s={id:'GAP',entryTime:1000000,expiresAt:1600000,entryPrice:100,direction:'HIGH',dataset:{replay:{}}},meta={signal:s,entryIndex:0,exitIndex:10};
 const run={engine:{finalizeReview(){}},stats:{settled:0,correct:0,incorrect:0,equal:0,missing:0},pending:new Map([['GAP',meta]])};
 // The next available close is a minute late; it must be missing even though price increased.
 return c.processExistingPending(run,{time:1600000,close:120},9,null,0).then(()=>{assert.equal(s.result,'missing');assert.equal(s.exitPrice,null);assert.equal(run.stats.correct,0);assert.equal(run.stats.missing,1);});
});
function runtime(training){const c={console,structuredClone,performance,setTimeout,document:doc,localStorage:{getItem:()=> 'ARIS-3.3.0'},__TRAINING_VERSION:'ARIS-3.3.0'};vm.createContext(c);vm.runInContext(training?read('training-engine-core.js'):boot,c);for(const f of ['v2.js','v3.js','v31.js','v33-base.js','v33.js'])vm.runInContext(read(f),c);return c;}
test('Live and Training share the exact 3.3 revision and entry engine',()=>{
 const live=runtime(false),train=runtime(true);assert.equal(live.EventSignalV6.CFG.arisRevision,train.EventSignalV6.CFG.arisRevision);assert.equal(live.EventSignalV6.CFG.arisRevision,'elliott-entry-v33-r8-t10');
 for(const asset of ['v33-base.js','v33.js']){assert(html.includes(asset+'?v=20261007-r8-t10'));assert(read('training-engine-registry.js').includes("asset('"+asset+"','20261007-r8-t10')"));}
 const reader={state:'PULLBACK',dir:1,structure:{structuralDir:1}},thesis={code:'WAIT',playbook:null};
 const engine=new live.EventSignalV6.Engine();engine.elliott.observe=()=>structuredClone(wave);
 const next=engine.v33PrepareThesis({price:104,ts:1000000},{f:{atr:2}},thesis,reader);assert.equal(next.code,'V33_WAVE_RESUMPTION');
 assert.equal(engine.v33PrepareThesis({price:104,ts:1000000},{f:{atr:2}},thesis,{...reader,state:'RANGE_CHOP'}),thesis);
 engine.elliott.observe=()=>{throw Error('fixture failure');};assert.equal(engine.v33PrepareThesis({price:104,ts:1000000},{f:{atr:2}},thesis,reader),thesis);
});
test('Live trigger must hold, reclaim resets it, and an unconfirmed wave plan cannot issue',()=>{
 const c=runtime(false),e=new c.EventSignalV6.Engine(),thesis={playbook:'trend_continuation',v33WaveEntry:true,d:1},ep={id:'E',legKey:'L',issuedLegKeys:[]},reader={state:'PULLBACK'};
 const apply=(ts,price)=>{e.v33Frame={observed:structuredClone(wave)};return e.v33ApplyEntryBundle({ts,price},{f:{atr:2}},bundle,thesis,reader,ep);};
 assert.equal(apply(1000000,104).entryReady,false);assert.equal(apply(1000200,104).entryReady,false);assert.equal(apply(1000400,104).entryReady,true);
 assert.equal(apply(1000500,102).entryReady,false);assert.equal(apply(1000600,104).entryReady,false);assert.equal(apply(1001000,104).entryReady,true);
 assert.equal(apply(1060000,104).entryReady,false,'missing live continuity must restart trigger confirmation');
});
test('Enabled 3.3 still issues entries on a natural stream and preserves structure/location gates',()=>{
 const c=runtime(false),e=new c.EventSignalV6.Engine();e.session='ACTIVE';let bars=[],previous=1000;
 for(let i=0;i<400;i++){
  const close=1000+i*.1+12*Math.sin(i/14)+3*Math.sin(i/3);bars.push({time:6000+i*60,open:previous,high:Math.max(previous,close)+.6,low:Math.min(previous,close)-.6,close,volume:100+i%20,closed:true});previous=close;if(i<40)continue;
  for(let j=0;j<3;j++){
   const v=e.step({id:i*3+j,ts:(6060+i*60)*1000+j*400,price:close+.1*j,symbol:'BTCUSDT',timeframe:'1m',timeframeSeconds:60,bars:structuredClone(bars),fresh:true,flow:Math.sign(close-bars[i-1].close)*.15,coverage:60,bookValid:false,current:{...bars.at(-1),time:6060+i*60,closed:false}});
   assert(!v.v33Elliott?.error,v.v33Elliott?.error);
   if(v.signal){const states=v.signal.dataset.entry.v3GateStates;assert.equal(states.structure,'PASS');assert.equal(states.location,'PASS');assert.equal(v.signal.dataset.entry.v33EntryContext.allow,true);}
  }
 }
 assert(e.signals.length>0);assert.equal(new Set(e.signals.map(s=>s.dataset.episodeId+'|'+s.dataset.entry.v3StructuralLegKey)).size,e.signals.length);
 console.log('Synthetic enabled stream: '+e.signals.length+' entries (engineering check only)');
});
async function replayChecks(){
 await Promise.all(pendingTests);
 const c=runtime(true),first=6000000,bars=[];let previous=1000;
 for(let i=0;i<400;i++){const close=1000+i*.1+12*Math.sin(i/14)+3*Math.sin(i/3);bars.push({time:first+i*60000,open:previous,high:Math.max(previous,close)+.6,low:Math.min(previous,close)-.6,close,volume:100+i%20,quoteVolume:100000,takerBuyQuote:55000,trades:100});previous=close;}
 let session={id:'TRAIN-TEST',datasetId:'DATA',status:'ready',symbol:'XAUUSDT',engineVersion:'ARIS-3.3.0',analysisStart:first+40*60000,quality:{grade:'A'}},checkpoint=null;
 const db={signals:new Map(),audit:new Map(),reports:new Map()};
 c.HistoricalDataV1={async getSession(){return session;},async saveSession(s){session=s;},async getDatasetBars(){return bars;},async getBySession(k){return [...db[k].values()];},async putMany(k,rs){for(const r of rs)db[k].set(r.id,r);},async saveCheckpoint(id,p){checkpoint=p;},async clearCheckpoint(){checkpoint=null;},async getCheckpoint(){return checkpoint;},async clearReplayArtifacts(){for(const m of Object.values(db))m.clear();},async saveReport(id,report){db.reports.set(id,{report});}};
 c.TrainingEngineRegistryV1={async load(){return {Core:c.EventSignalV6};}};
 vm.runInContext(read('replay-engine.js'),c);
 const report=await c.HistoricalReplayV1.start(session.id,{engineVersion:'ARIS-3.3.0'});
 assert.equal(report.engineRevision,'elliott-entry-v33-r8-t10');assert(report.counts.signals>0);assert(report.elliottEvaluation);
 assert(report.elliottEvaluation.contexts['XAUUSDT|1m']);assert.equal(report.elliottEvaluation.contexts['XAUUSDT|1m'].samples,360);
 for(const r of db.signals.values()){
  const s=r.signal;assert(s.entry.v33EntryContext);assert.equal(s.entry.revision,report.engineRevision);assert(s.entryTime>=session.analysisStart);
  if(['correct','incorrect','equal'].includes(s.result))assert.equal(s.exitTime-s.entryTime,600000);
 }
 checkpoint={engineVersion:'ARIS-3.3.0',engineRevision:'old'};
 await assert.rejects(c.HistoricalReplayV1.start(session.id,{resume:true,engineVersion:'ARIS-3.3.0'}),/Checkpoint 3.3/);
 console.log('PASS real 3.3 replay: warmup isolation, symbol identity, immutable entry quality, exact T+10 and revision guard');checks++;
 console.log(JSON.stringify({checks,syntheticReplaySignals:report.counts.signals,revision:report.engineRevision,marketAccuracyClaim:false}));
}
replayChecks().catch(error=>{console.error(error);process.exitCode=1;});
