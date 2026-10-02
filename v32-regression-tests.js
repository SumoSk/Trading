/* ARIS 3.2 Regression Suite
   Load after: v32.js -> v32-direction.js -> v32-triggers.js -> v32-entry.js -> v32-training.js
   This file is test-only and is never part of the production decision path. */
(function(root){
'use strict';

function assert(cond,msg){if(!cond)throw new Error('ARIS 3.2 regression failed: '+msg);}
function close(a,b,eps=1e-9){return Math.abs(a-b)<=eps;}
function bar(i,o,c,h=.16,l=.16,v=100){
  return {time:i*60000,open:o,high:Math.max(o,c)+h,low:Math.min(o,c)-l,close:c,volume:v,closed:true};
}
function trendBars(n=80,start=100,step=.40){
  const a=[];
  for(let i=0;i<n;i++){const o=start+i*step,c=o+.28;a.push(bar(i,o,c,.14,.10,105+(i%4)*4));}
  return a;
}
function rangeBars(n=80){
  const a=[];
  for(let i=0;i<n;i++){
    const c=100+Math.sin(i*Math.PI/3)*1.25,o=100+Math.sin((i-1)*Math.PI/3)*1.25;
    a.push(bar(i,o,c,.13,.13,100+(i%4)*3));
  }
  return a;
}
function breakoutBars(participation=true){
  const a=rangeBars(70);let i=70;
  a.push(bar(i++,a.at(-1).close,101.60,.18,.08,participation?155:80));
  a.push(bar(i++,101.60,101.95,.16,.08,participation?160:82));
  a.push(bar(i++,101.95,102.18,.14,.08,participation?150:78));
  return a;
}
function failedBreakBars(){
  const a=rangeBars(70);let i=70;
  a.push(bar(i++,a.at(-1).close,101.72,.28,.08,150));
  a.push(bar(i++,101.72,101.20,.10,.18,135));
  a.push(bar(i++,101.20,100.62,.08,.20,125));
  a.push(bar(i++,100.62,100.18,.08,.18,118));
  return a;
}
function transitionBars(){
  const a=[];let px=120;
  for(let i=0;i<58;i++){const o=px,c=o-.34+(i%4)*.01;a.push(bar(i,o,c,.10,.15,105));px=c;}
  for(let j=0;j<22;j++){
    const i=58+j,drift=Math.max(.02,.18-j*.008),o=px,c=o-drift+(j%3===0?.06:0);
    a.push({time:i*60000,open:o,high:Math.max(o,c)+.14,low:Math.min(o,c)-(.18+j*.005),close:c,volume:102+(j%3)*3,closed:true});
    px=c;
  }
  return a;
}

function run(){
  const Base=root.ArisV32,Direction=root.ArisV32Direction,Triggers=root.ArisV32Triggers,Entry=root.ArisV32Entry,Training=root.ArisV32Training;
  assert(Base&&Direction&&Triggers&&Entry&&Training,'required ARIS 3.2 modules are loaded');

  const results=[];

  for(const [name,bars,flow,expected] of [
    ['trend',trendBars(),.05,'TREND_ADVANCE'],
    ['range',rangeBars(),0,'RANGE'],
    ['breakout',breakoutBars(true),.06,'BREAKOUT_ACCEPTED'],
    ['failed-breakout',failedBreakBars(),-.04,'FAILED_BREAKOUT'],
    ['transition',transitionBars(),0,'TRANSITION']
  ]){
    const out=Triggers.analyze({bars1m:bars,price:bars.at(-1).close,flow,book:0,ts:bars.at(-1).time+1000,fresh:true});
    const total=Object.values(out.stage.confidence).reduce((a,b)=>a+b,0);
    assert(close(total,1,1e-8),name+' stage confidence must normalize to 1');
    assert(out.stage.dominant===expected,name+' stage expected '+expected+' got '+out.stage.dominant);
    results.push({test:'stage:'+name,pass:true,stage:out.stage.dominant});
  }

  const profileSums=Object.fromEntries(Object.entries(Direction.profiles).map(([k,v])=>[k,Object.values(v.weights).reduce((a,b)=>a+b,0)]));
  for(const [k,v] of Object.entries(profileSums))assert(close(v,1,1e-8),k+' profile weights must sum to 1');
  results.push({test:'profile-weight-normalization',pass:true});

  {
    const bars=breakoutBars(false);
    const out=Triggers.analyze({bars1m:bars,price:bars.at(-1).close,flow:0,book:0,ts:bars.at(-1).time+1000,fresh:true});
    const t=out.triggers.candidates.find(x=>x.id==='BREAKOUT_FOLLOW');
    assert(t,'breakout trigger must exist without participation');
    assert(!t.ready,'breakout without participation must not be READY');
    assert(out.triggers.primary?.id==='BREAKOUT_FOLLOW','dominant breakout stage must keep breakout watch as primary');
    results.push({test:'breakout-no-participation',pass:true,status:t.status});
  }

  {
    const bars=rangeBars(80);
    const pre=Base.analyze({bars1m:bars,price:bars.at(-1).close,flow:0,ts:bars.at(-1).time+1000,fresh:true});
    const r=pre.features.range,a=pre.features.atr,last=bars.at(-1);
    const live={time:last.time+30000,open:r.high-a*.06,high:r.high+a*.35,low:r.high-a*.08,close:r.high+a*.22,volume:145,closed:false};
    const out=Base.analyze({bars1m:bars,currentCandle:live,liveVolumePace:1.45,price:live.close,flow:.05,ts:live.time,fresh:true});
    assert(out.features.breakout.liveAttempt===true,'live displacement must be visible before candle close');
    assert(out.features.breakout.acceptedDir===0,'live attempt alone must not fake closed breakout acceptance');
    results.push({test:'live-breakout-attempt',pass:true});
  }

  {
    const bars=transitionBars();
    const out=Triggers.analyze({bars1m:bars,price:bars.at(-1).close,flow:0,book:0,ts:bars.at(-1).time+1000,fresh:true});
    assert(out.stage.rangeForming===true,'decelerating trend must flag range forming');
    assert(out.stage.priorTrendDir===-1,'transition test must remember prior downtrend');
    assert(out.triggers.primary?.id==='TRANSITION_EDGE_DEFENSE','transition edge defense should become primary');
    results.push({test:'trend-to-range-forming',pass:true});
  }

  {
    const aligned=Entry.entryQuality({direction:{signedEdge:.60,models:{TREND_ADVANCE:{score:.60}}}},{quality:70,stageConfidence:.60,penalties:[],d:1,stage:'TREND_ADVANCE'});
    const opposed=Entry.entryQuality({direction:{signedEdge:-.60,models:{TREND_ADVANCE:{score:-.60}}}},{quality:70,stageConfidence:.60,penalties:[],d:1,stage:'TREND_ADVANCE'});
    assert(aligned>opposed,'entry quality must reward direction alignment and penalize opposition');
    results.push({test:'entry-direction-alignment',pass:true,aligned,opposed});
  }

  {
    const bars=trendBars(),eng=new Entry.Engine({});
    const t=bars.at(-1).time+1000;
    const a=eng.step({bars1m:bars,price:bars.at(-1).close,flow:.05,book:.02,ts:t,fresh:true});
    const b=eng.step({bars1m:bars,price:bars.at(-1).close,flow:.05,book:.02,ts:t+350,fresh:true});
    assert(a.status==='CONFIRMING'&&b.status==='ENTER','trend test must confirm then enter');
    const bars2=[...bars,bar(80,bars.at(-1).close,bars.at(-1).close+.42,.14,.08,112)];
    const c=eng.step({bars1m:bars2,price:bars2.at(-1).close,flow:.05,book:.02,ts:bars2.at(-1).time+1000,fresh:true});
    assert(c.status==='WAIT_REARM','continuing trend without reset must not immediately issue again');
    assert(eng.memory.signals.length===1,'re-arm guard must keep one signal until reset');
    results.push({test:'family-rearm',pass:true});
  }

  {
    const bars=trendBars(),eng=new Entry.Engine({});
    const t=bars.at(-1).time+1000;
    const a=eng.step({bars1m:bars,flow:.05,book:.02,ts:t,fresh:false});
    const b=eng.step({bars1m:bars,flow:.05,book:.02,ts:t+350,fresh:false});
    assert(a.status==='BLOCKED_DATA'&&b.status==='BLOCKED_DATA','fresh:false must hard-block entry');
    assert(eng.memory.signals.length===0,'stale feed must never emit a signal');
    results.push({test:'stale-data-hard-block',pass:true});
  }

  {
    const bars=trendBars(),eng=new Entry.Engine({}),ledger=new Training.Ledger({});
    const t=bars.at(-1).time+1000;
    const a=eng.step({bars1m:bars,price:bars.at(-1).close,flow:.05,book:.02,ts:t,fresh:true});ledger.record(a);
    const b=eng.step({bars1m:bars,price:bars.at(-1).close,flow:.05,book:.02,ts:t+350,fresh:true});ledger.record(b);
    assert(!!b.signal,'training test needs an entry signal');
    ledger.observe(b.signal.entryTime+60000,b.signal.entryPrice-.25,{stage:{dominant:'PULLBACK',dominantConfidence:.4},features:{flow:-.04,breakout:{}},structure:{bullBroken:false}});
    ledger.observe(b.signal.entryTime+120000,b.signal.entryPrice+.10,{stage:{dominant:'TREND_ADVANCE',dominantConfidence:.5},features:{flow:.02,breakout:{}},structure:{bullBroken:false}});
    ledger.observe(b.signal.entryTime+300000,b.signal.entryPrice+.45,{stage:{dominant:'TREND_ADVANCE',dominantConfidence:.6},features:{flow:.03,breakout:{acceptedDir:1}},structure:{bullBroken:false}});
    ledger.observe(b.signal.expiresAt,b.signal.entryPrice+.70,{stage:{dominant:'TREND_ADVANCE',dominantConfidence:.65},features:{flow:.04,breakout:{}},structure:{bullBroken:false}});
    const review=ledger.signals[0].review,serialized=ledger.serialize(),restored=new Training.Ledger(serialized);
    assert(review.fastReverse1m===true&&review.fastReverse2m===true&&review.fastReverse5m===true,'training must retain 1m/2m/5m reverse labels');
    assert(review.stageChanges.length>=2,'training must retain stage changes');
    assert(review.breakoutStateChanges.length>=2,'training must retain breakout state changes');
    assert((serialized.paths?.[b.signal.id]||[]).length===(restored.paths?.[b.signal.id]||[]).length,'pending/review price paths must survive serialization');
    assert(b.signal.dataset.direction.triggerStageModel?.components?.length>0,'entry snapshot must store stage-specific component contributions');
    assert(!!b.signal.dataset.features.fib&&!!b.signal.dataset.features.zones,'entry snapshot must store fib and zone context');
    results.push({test:'training-causality-and-labels',pass:true});
  }

  return {schema:'aris-v32-regression-v1',version:Base.version,passed:results.length,failed:0,results};
}

root.ArisV32Regression=Object.freeze({run});
})(typeof globalThis!=='undefined'?globalThis:window);
