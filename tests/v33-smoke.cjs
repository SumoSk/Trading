const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'v33.css'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach(s=>new vm.Script(s));
for(const f of ['v33-base.js','v33.js','v33-ui.js','training-engine-core.js','training-engine-registry.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'));
const api=require('../v33.js');

const piv=prices=>prices.map((price,i)=>({id:'P'+i,time:i*600,i:i*10,price,type:i%2?'H':'L',provisional:false}));
const candidate=(key,score,direction,pattern='IMPULSE',wave='2')=>({key,score,pattern,currentWave:wave,next:{direction}});

// Hard rules and pattern position.
assert(api.hardRules(piv([100,110,104,125,115,130])).valid);
assert(api.hardRules(piv([100,90,96,75,85,70])).valid);
assert(!api.hardRules(piv([100,110,99])).valid);
assert(!api.hardRules(piv([100,110,104,125,109])).valid);
assert(api.hardRules(piv([100,120,110,125,118,128]),'DIAGONAL_CANDIDATE').valid);
assert(api.hardRules(piv([100,110,104,140,120,135])).valid);
assert(api.hardRules(piv([100,110,104,135,120,130])).valid);
assert(api.hardRules(piv([100,110,105,120]),'ZIGZAG').valid);
assert(api.hardRules(piv([100,110,99,112]),'FLAT').valid);
assert(!api.hardRules(piv([100,120,105,116,108,113]),'TRIANGLE').valid);
assert(api.hardRules(piv([100,120,105,116,108,113]),'TRIANGLE',{parentWave:'4'}).valid);
assert(!api.hardRules(piv([100,110,110])).valid,'duplicate/equal pivot must not validate');

// Stable IDs for every degree/candidate.
const idA=api.candidateIdentity({key:'Working|IMPULSE|P1|P2',degree:'Working'});
const idB=api.candidateIdentity({key:'Working|IMPULSE|P1|P2',degree:'Working'});
const idMicro=api.candidateIdentity({key:'Micro|ZIGZAG|P3|P4',degree:'Micro'});
assert.equal(idA.id,idB.id);assert.equal(idA.waveId,idB.waveId);
assert.match(idA.id,/^COUNT-/);assert.match(idA.waveId,/^W33-WRK-/);assert.match(idMicro.waveId,/^W33-MIC-/);

// Unknown and ambiguity policy.
assert.equal(api.selectCounts([]).unknown,'INSUFFICIENT_STRUCTURE');
const close=api.selectCounts([candidate('A',69,1),candidate('B',66,-1,'ZIGZAG','C')],{...api.DEFAULTS,ambiguityGap:6,minScore:48});
assert.equal(close.unknown,'MULTIPLE_COUNTS_CLOSE');assert.equal(close.alternate.key,'B');
assert.equal(api.resolveUnknown(null,9,'INSUFFICIENT_STRUCTURE'),'COMPLEX_CORRECTION');
assert.equal(api.resolveUnknown(candidate('A',70,1),12,null),null);

// Previous preferred count can be invalidated by the new live endpoint.
const oldCount={id:'COUNT-OLD',degree:'Working',pattern:'IMPULSE',pivots:piv([100,110,104]),parentWave:null};
const status=api.previousCountStatus(oldCount,{Working:piv([100,110])},{bars:[],price:99,time:1800});
assert(status.invalid);assert(status.reasons.includes('W2_ORIGIN_BROKEN'));

// Prediction lifecycle.
const box={state:'ACTIVE',direction:1,invalidationDirection:1,invalidation:90,trigger:{direction:1,price:105},triggered:true,startTime:10,endTime:20,targetLow:110,targetHigh:115};
assert.equal(api.updateBox({...box},{price:112,ts:15000}).state,'HIT');
assert.equal(api.updateBox({...box},{price:112,ts:21000}).state,'EXPIRED');
assert.equal(api.updateBox({...box},{price:89,ts:15000}).state,'INVALIDATED');

// Evaluation contains fixed metrics, recount and count stability.
const reportObserver=new api.Observer({sequence:3,contexts:{'BTCUSDT|1m':{symbol:'BTCUSDT',timeframe:'1m',seconds:60,bars:[],audit:[],boxes:[
 {id:'BOX-1',state:'HIT',directionCorrect:true,priceHitAt:120000,createdAt:0,at:120000,seconds:60,score:82,wave:'3',pattern:'IMPULSE',degree:'Working',regime:'TREND',timeframe:'1m',symbol:'BTCUSDT',recounted:false},
 {id:'BOX-2',state:'INVALIDATED',directionCorrect:false,createdAt:120000,at:300000,seconds:60,score:72,wave:'5',pattern:'IMPULSE',degree:'Working',regime:'TREND',timeframe:'1m',symbol:'BTCUSDT',recounted:true}
],durationsByDegree:{Micro:[],Working:[],Structural:[]},lastTs:300000,samples:10,known:6,recounts:2,evictedAudit:0,degreeSignatures:{},degreeLinks:{},stabilityBars:[2,3],preferredSinceTs:null}}});
const rep=reportObserver.report();
assert.equal(rep.completed.n,2);assert.equal(rep.completed.recountRate,.5);
assert(Number.isFinite(rep.completed.countStabilityAvgBars));assert.equal(rep.contexts['BTCUSDT|1m'].countStabilityMedianBars,3);
assert('80–89' in rep.scoreBuckets);assert('70–79' in rep.scoreBuckets);

function barsFor(count,seconds=60,start=6000,flat=false){
 let previous=1000;const out=[];
 for(let i=0;i<count;i++){
  const close=flat?1000:1000+i*.08+10*Math.sin(i/11)+2*Math.sin(i/3);
  out.push({time:start+i*seconds,open:previous,high:Math.max(previous,close)+.6,low:Math.min(previous,close)-.6,close,volume:100+i%20,closed:true});previous=close;
 }
 return out;
}
function obsInput(symbol,timeframe,seconds,bars,price=bars.at(-1)?.close||1000,extra={}){
 return {symbol,timeframe,timeframeSeconds:seconds,ts:(bars.at(-1).time+seconds)*1000,price,bars:structuredClone(bars),fresh:true,flow:.1,coverage:60,bookValid:false,current:{...bars.at(-1),time:bars.at(-1).time+seconds,closed:false},...extra};
}

// Insufficient structure, flat market, missing volume, gap/huge candle and context isolation.
const edge=new api.Observer();
const shortBars=barsFor(5);assert.doesNotThrow(()=>edge.observe(obsInput('SHORT','1m',60,shortBars)));
assert(edge.contexts['SHORT|1m'].output.unknown);
const flatBars=barsFor(80,60,10000,true);assert.doesNotThrow(()=>edge.observe(obsInput('FLAT','1m',60,flatBars)));
const noVol=barsFor(100,60,20000).map(({volume,...q})=>q);assert.doesNotThrow(()=>edge.observe(obsInput('NOVOL','1m',60,noVol)));
const shock=barsFor(120,60,30000);shock[70]={...shock[70],open:shock[69].close+20,high:shock[69].close+75,low:shock[69].close-55,close:shock[69].close+35};
assert.doesNotThrow(()=>edge.observe(obsInput('SHOCK','1m',60,shock)));
const btcBars=barsFor(160,60,40000),xauBars=barsFor(90,300,50000);
const btcIn=obsInput('BTCUSDT','1m',60,btcBars),xauIn=obsInput('XAUUSDT','5m',300,xauBars);
edge.observe(btcIn);edge.observe(xauIn);
assert(edge.contexts['BTCUSDT|1m']);assert(edge.contexts['XAUUSDT|5m']);
assert.notEqual(edge.contexts['BTCUSDT|1m'],edge.contexts['XAUUSDT|5m']);
for(const d of ['Micro','Working','Structural'])assert(Array.isArray(edge.contexts['BTCUSDT|1m'].durationsByDegree[d]));
const auditBefore=edge.contexts['BTCUSDT|1m'].audit.length;
edge.observe({...btcIn,ts:btcIn.ts-1000,price:btcIn.price+1});
assert.equal(edge.contexts['BTCUSDT|1m'].audit.length,auditBefore,'stale/reconnect tick must not rewrite audit');

// Browser reload / reconstruction preserves append-only audit.
const persisted=edge.serialize(),frozenAudit=JSON.stringify(persisted.contexts['BTCUSDT|1m'].audit),restored=new api.Observer(persisted);
assert.equal(JSON.stringify(restored.serialize().contexts['BTCUSDT|1m'].audit),frozenAudit);

// Static integration guards for persistence and responsive UI.
assert(html.includes('v33Memory:mergeV33Memory(full.v33Memory,local?.v33Memory)'));
assert(html.includes('id="elliott-panel"'));assert(html.includes('v33-base.js'));assert(html.includes('v33-ui.js'));
assert(css.includes('@media(max-width:480px)'));assert(css.includes('@media(min-width:1200px)'));
const registry=fs.readFileSync(path.join(root,'training-engine-registry.js'),'utf8'),trainingCore=fs.readFileSync(path.join(root,'training-engine-core.js'),'utf8');
assert(registry.includes("version:'ARIS-3.3.0'"));assert(trainingCore.includes("version:'ARIS-3.3.0'"));

// 3.1 execution regression: same input, same trading decisions/Fib; Elliott remains observer-only.
const bootScript=scripts.find(s=>s.includes("const DEFAULT_ENGINE_VERSION='ARIS-3.1.0'"));
assert(bootScript,'engine boot script not found');
function runtime(v){
 const c={console,structuredClone,localStorage:{getItem:()=>v,setItem:()=>{}}};vm.createContext(c);vm.runInContext(bootScript,c);
 for(const f of ['v2.js','v3.js','v31.js','v33-base.js','v33.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);
 return c;
}
const defaultRuntime=runtime(undefined);assert.equal(defaultRuntime.EventSignalV6.CFG.version,'ARIS-3.1.0');
const a=runtime('ARIS-3.1.0'),c=runtime('ARIS-3.3.0');assert.equal(c.EventSignalV6.CFG.version,'ARIS-3.3.0');assert(c.ArisV33BaseEngine);
const ea=new a.EventSignalV6.Engine(),ec=new c.EventSignalV6.Engine();ea.session=ec.session='TEST';
let bars=[],previous=1000,signals=0;
const signalCore=s=>s?{entryPrice:s.entryPrice,direction:s.direction,type:s.type,playbook:s.playbook,status:s.status,result:s.result}:null;
for(let i=0;i<400;i++){
 const close=1000+i*.1+12*Math.sin(i/14)+3*Math.sin(i/3);
 bars.push({time:6000+i*60,open:previous,high:Math.max(previous,close)+.6,low:Math.min(previous,close)-.6,close,volume:100+i%20,closed:true});previous=close;
 if(i<40)continue;
 for(let j=0;j<3;j++){
  const x={symbol:'BTCUSDT',timeframe:'1m',timeframeSeconds:60,id:i*3+j,ts:(6060+i*60)*1000+j*400,price:close+.1*j,bars:structuredClone(bars),fresh:true,flow:Math.sign(close-bars[i-1].close)*.15,coverage:60,bookValid:false,current:{...bars.at(-1),time:6060+i*60,closed:false}};
  const u=ea.step(structuredClone(x)),v=ec.step(structuredClone(x));
  assert.equal(v.status,u.status);assert.equal(v.reason,u.reason);
  assert.equal(v.event?.type,u.event?.type);assert.equal(v.event?.d,u.event?.d);
  assert.equal(JSON.stringify(signalCore(v.signal)),JSON.stringify(signalCore(u.signal)));
  assert.equal(JSON.stringify(v.v3Story),JSON.stringify(u.v3Story));
  assert.equal(JSON.stringify(v.v3Story?.fib),JSON.stringify(u.v3Story?.fib));
  assert(!v.v33Elliott?.error,v.v33Elliott?.error);
  if(u.signal)signals++;
 }
}
assert(signals>0,'regression stream must issue real signals');
const history=ec.elliott.serialize(),frozen=JSON.stringify(history.contexts['BTCUSDT|1m'].audit),restoredRuntime=new api.Observer(history);
assert.equal(JSON.stringify(restoredRuntime.serialize().contexts['BTCUSDT|1m'].audit),frozen);
const last=ec.lastView.v33Elliott;assert(last.historyBars>=390);assert(last.degrees.Working.pivots.length>0);
assert.equal(ea.signals.length,ec.signals.length);
assert.equal(JSON.stringify(ec.elliott.serialize().contexts['BTCUSDT|1m'].audit.slice(0,10)),JSON.stringify(history.contexts['BTCUSDT|1m'].audit.slice(0,10)));

console.log(JSON.stringify({checks:'hard rules, pattern position, stable ids, ambiguity, complex/insufficient unknown, invalidation, box lifecycle, metrics, edge cases, context isolation, reload audit, responsive integration, training integration, strict 3.1 regression',matchedSignalCount:signals,storedSignals:ec.signals.length,history:last.historyBars,pivots:last.degrees.Working.pivots.length,unknown:last.unknown,preferred:last.preferred?.currentWave,boxes:history.contexts['BTCUSDT|1m'].boxes.length}));
