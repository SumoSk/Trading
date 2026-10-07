const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'v2.js'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const core=scripts.find(s=>s.includes('const ACTIVE_VERSION_STORE='));
function runtime(version='ARIS-2.0.0'){
 const c={console,localStorage:{getItem(){return version;}}};vm.createContext(c);vm.runInContext(core,c);vm.runInContext(source,c);return c;
}
const c=runtime(),api=c.ArisV2Engine;
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
function fixture(d=1){
 const bars=Array.from({length:40},(_,i)=>({time:6000+i*60,open:995,close:1000,high:1010,low:980,volume:100,closed:true}));
 const f={atr:100,ema8:1000,ema21:1000,trend:d*.4,momAccel:d*.2,b:bars};
 const x={price:1000+d*20,flow:d*.08,coverage:60,current:{open:1000,high:1030,low:970,close:1000+d*20}};
 const story={state:'REVERSAL_WATCH',playbook:'exhaustion_reversal',playDirection:d,highEvidence:d>0?70:30,lowEvidence:d>0?30:70,
 candle:{rejection:d,engulf:d,liveDir:d,pressure:d*.3,oneSided:d,liveCloseLoc:d>0?.85:.15,liveRangeAtr:.6},
 range:{lo:980,hi:1010,pos:d>0?.1:.9,balanced:true,edgePressureDir:0},fib:{valid:false},higher:{m5:{available:false},m15:{available:false}},zones:[]};
 return {f,x,story};
}
test('all production scripts parse',()=>scripts.forEach(s=>new vm.Script(s)));
for(const d of [1,-1]){
 test('reversal requires micro structure '+d,()=>{const {f,x,story}=fixture(d);x.price=1000;const q=api.entryOpportunity(f,x,story);assert.equal(q.enter,false);assert(q.blockers.some(b=>b.code==='micro_structure'));});
 test('confirmed reversal can enter '+d,()=>{const {f,x,story}=fixture(d);x.price=d>0?1020:970;assert.equal(api.entryOpportunity(f,x,story).enter,true);});
 test('strong opposing flow cannot be outvoted '+d,()=>{const {f,x,story}=fixture(d);x.flow=-d*.8;const q=api.entryOpportunity(f,x,story);assert(!q.enter);assert(q.blockers.some(b=>b.code==='flow'));});
 test('missing flow history cannot enter '+d,()=>{const {f,x,story}=fixture(d);x.coverage=0;assert(!api.entryOpportunity(f,x,story).enter);});
 test('reversal needs candle reaction as well as flow and structure '+d,()=>{const {f,x,story}=fixture(d);x.price=d>0?1020:970;story.candle.rejection=0;story.candle.engulf=0;assert(!api.entryOpportunity(f,x,story).enter);});
 test('near opposing zone blocks entry '+d,()=>{const {f,x,story}=fixture(d);x.price=d>0?1020:970;story.zones=[{kind:d>0?'resistance':'support',price:x.price+d*5}];assert(!api.entryOpportunity(f,x,story).enter);});
 test('breakout cannot enter before break '+d,()=>{const {f,x,story}=fixture(d);story.playbook='breakout_follow';story.range.breakDir=0;x.price=1000;assert(!api.entryOpportunity(f,x,story).enter);});
 test('breakout can enter early when all gates pass '+d,()=>{const {f,x,story}=fixture(d);story.playbook='breakout_follow';story.range.breakDir=d;x.price=d>0?1020:970;assert(api.entryOpportunity(f,x,story).enter);});
 test('late breakout requires a new pullback '+d,()=>{const {f,x,story}=fixture(d);story.playbook='breakout_follow';story.range.breakDir=d;x.price=d>0?1100:900;assert(!api.entryOpportunity(f,x,story).enter);});
 test('range edge fade rejects edge pressure '+d,()=>{const {f,x,story}=fixture(d);story.playbook='range_edge_fade';story.range.edgePressureDir=-d;assert(!api.entryOpportunity(f,x,story).enter);});
 test('retest requires actual remembered retest '+d,()=>{const {f,x,story}=fixture(d);story.playbook='breakout_retest';assert(!api.entryOpportunity(f,x,story).enter);});
 test('pullback needs reclaim even with engulfing '+d,()=>{const {f,x,story}=fixture(d);story.playbook='fib_pullback';story.fib={valid:true,d,retracement:.4,nearest:{price:1000}};x.price=1000-d*20;assert(!api.entryOpportunity(f,x,story).enter);});
 test('candidate identity survives EMA and bar changes '+d,()=>{const {f,x,story}=fixture(d),o=api.entryOpportunity(f,x,story),e=new c.EventSignalV6.Engine(),cand=api.makeCandidate(e,o,{...x,ts:10000},f,story);const moved={...o,level:o.level+.1};assert(api.sameSetup(cand,moved,{...f,b:[{time:999999}]}));assert.equal(cand.id,cand.key);});
 test('candidate structural invalidation uses anchored level '+d,()=>{const {f,x,story}=fixture(d),o=api.entryOpportunity(f,x,story),e=new c.EventSignalV6.Engine(),cand=api.makeCandidate(e,o,{...x,ts:10000},f,story);assert(api.invalidationReason(cand,{price:cand.invalidationLevel-d*10},f));assert.equal(api.invalidationReason(cand,{price:cand.invalidationLevel+d*10},f),null);});
}
test('candidate export connects signal IDs and preserves issued status',()=>{
 c.engine=new c.EventSignalV6.Engine();c.engine.log('detected',100,{id:'C',candidateId:'C',type:'v2_trend_pullback',candidate:{type:'v2_trend_pullback'},detectedAt:100});
 c.engine.log('issued',500,{id:'S',candidateId:'C',direction:'HIGH'});c.engine.log('v2_episode_closed',600,{id:'C',reason:'new story'});
 const begin=html.indexOf('  function candidateDataset(){'),end=html.indexOf('  function trainingBundle()',begin);vm.runInContext(html.slice(begin,end),c);
 const row=c.candidateDataset()[0];assert.equal(row.status,'issued');assert.equal(row.signalId,'S');
});
test('settlement remains at original ten-minute timestamp',()=>{
 const e=new c.EventSignalV6.Engine(),s={id:'test',version:'ARIS-2.0.0',direction:'HIGH',entryTime:1000,entryPrice:100,expiresAt:601000,result:'pending',lastObserved:1000};e.signals.push(s);
 e.settle({ts:600500,price:99});assert.equal(s.result,'pending');e.settle({ts:601100,price:101});assert.equal(s.result,'correct');assert.equal(s.entryPrice,100);
});
test('missing settlement is not counted as a win or loss',()=>{const e=new c.EventSignalV6.Engine(),s={id:'test',direction:'HIGH',entryTime:1000,entryPrice:100,expiresAt:601000,result:'pending',lastObserved:1000};e.signals.push(s);e.settle({ts:608000,price:101});assert.equal(s.result,'missing');});
test('reload and reset discard half-confirmed candidate without deleting history',()=>{const e=new c.EventSignalV6.Engine();e.v2Candidate={id:'C',stage:'CONFIRMING'};e.signals=[{id:'S'}];e.reset('disconnect',1000);assert.equal(e.v2Candidate,null);assert.equal(e.signals.length,1);});
test('older engines are not patched by v2.js',()=>{
 for(const version of ['6.5.0','6.6.0','7.0.0','7.0.1','7.1.0','7.1.1','7.2.0','ARIS-1.0.0','ARIS-1.1.0','ARIS-1.2.0']){
  const old={localStorage:{getItem(){return version;}}};vm.createContext(old);vm.runInContext(core,old);const fn=old.EventSignalV6.Engine.prototype.step;vm.runInContext(source,old);assert.equal(old.EventSignalV6.Engine.prototype.step,fn);assert.equal(old.EventSignalV6.CFG.version,({'6.5.0':'6.6.0','7.0.0':'7.2.0','7.0.1':'7.2.0','7.1.0':'7.2.0','7.1.1':'7.2.0','ARIS-1.0.0':'ARIS-1.2.0','ARIS-1.1.0':'ARIS-1.2.0'})[version]||version);
 }
});
function streamFixture(){
 const bars=Array.from({length:40},(_,i)=>({time:6000+i*60,open:995,close:i%2?1000:995,high:1010,low:980,volume:100,closed:true}));
 const tick=(i,extra={})=>({id:i,ts:8400000+i*250,price:1015+i*.1,bars,flow:.2,coverage:60,fresh:true,bookValid:false,current:{time:8400,open:1000,high:1016,low:1000,close:1015,volume:100,closed:false},...extra});
 return {bars,tick};
}
test('complete production engine: watch, confirm, issue once, hold and settle',()=>{
 const e=new c.EventSignalV6.Engine(),{tick}=streamFixture();
 assert.equal(e.step(tick(0)).status,'warming');const first=e.step(tick(1));assert.equal(first.status,'confirming');const id=first.event.id;
 assert.equal(e.step(tick(2)).event.id,id);const issued=e.step(tick(3));assert.equal(issued.status,'new');assert.equal(e.signals.length,1);
 const original=JSON.stringify(issued.signal.dataset.entry),price=issued.signal.entryPrice,time=issued.signal.entryTime;
 assert.equal(e.step(tick(4)).status,'issued');assert.equal(e.step(tick(5)).status,'issued');assert.equal(e.signals.length,1);
 assert.equal(JSON.stringify(issued.signal.dataset.entry),original);assert.equal(e.audit.find(a=>a.type==='issued').candidateId,id);
 e.settle({ts:time+599500,price:price-1});e.settle({ts:time+600100,price:price+1});assert.equal(issued.signal.result,'correct');assert(issued.signal.dataset.review.v2);
});
test('duplicate and out-of-order trades cannot satisfy confirmation',()=>{
 const e=new c.EventSignalV6.Engine(),{tick}=streamFixture();e.step(tick(0));const v=e.step(tick(1));
 e.step(tick(1));e.step(tick(2,{ts:8400100}));assert.equal(e.v2Candidate.ticks,1);assert.equal(e.signals.length,0);assert.equal(e.v2Candidate.id,v.event.id);
});
test('flow interruption resets evidence, not the setup identity',()=>{
 const e=new c.EventSignalV6.Engine(),{tick}=streamFixture();e.step(tick(0));const id=e.step(tick(1)).event.id;
 e.step(tick(2,{flow:0}));assert.equal(e.v2Candidate.ticks,0);assert.equal(e.v2Candidate.id,id);
 assert.notEqual(e.step(tick(3)).status,'new');assert.notEqual(e.step(tick(4)).status,'new');assert.equal(e.step(tick(5)).status,'new');
});
test('disconnection cancels the candidate and preserves issued history',()=>{
 const e=new c.EventSignalV6.Engine(),{tick}=streamFixture();e.step(tick(0));e.step(tick(1));
 const v=e.step(tick(2,{fresh:false}));assert.equal(v.status,'offline');assert.equal(e.v2Candidate,null);assert(e.audit.some(a=>a.type==='cancelled'));
 assert.equal(e.step(tick(3)).status,'warming');
});
test('first breakout observation is not mislabeled a retest',()=>{
 const e=new c.EventSignalV6.Engine(),{tick}=streamFixture();const v=e.step(tick(0));assert.equal(v.v2Story.playbook,'breakout_follow');assert.equal(v.v2Story.breakoutRetest,null);
});
test('expedite shortens confirmation without bypassing flow gates',()=>{
 const e=new c.EventSignalV6.Engine(),{tick}=streamFixture();e.step(tick(0,{expedite:true}));e.step(tick(1,{expedite:true}));
 assert.equal(e.step(tick(2,{expedite:true})).status,'new');assert.equal(e.signals[0].dataset.entry.v2ConfirmationMs,200);
 const blocked=new c.EventSignalV6.Engine();for(let i=0;i<8;i++)blocked.step(tick(i,{expedite:true,flow:-.3}));assert.equal(blocked.signals.length,0);
});
test('closed-bar rollover preserves setup identity',()=>{
 const e=new c.EventSignalV6.Engine(),{bars,tick}=streamFixture();e.step(tick(0));const id=e.step(tick(1)).event.id;
 const next=[...bars,{...bars.at(-1),time:8400}];const v=e.step(tick(2,{bars:next,current:{time:8460,open:1000,high:1016,low:1000,close:1015,volume:100,closed:false}}));assert.equal(v.event.id,id);
});
console.log(count+' regression checks passed');
