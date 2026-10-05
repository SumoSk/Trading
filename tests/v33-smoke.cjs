const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);scripts.forEach(s=>new vm.Script(s));
for(const f of ['v33-base.js','v33.js','v33-ui.js','training-engine-core.js','training-engine-registry.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'));
const api=require('../v33.js');
const piv=prices=>prices.map((price,i)=>({id:'P'+i,time:i*600,i:i*10,price,type:i%2?'H':'L'}));
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
const b={state:'ACTIVE',direction:1,invalidationDirection:1,invalidation:90,trigger:{direction:1,price:105},triggered:true,startTime:10,endTime:20,targetLow:110,targetHigh:115};
assert.equal(api.updateBox(b,{price:112,ts:15000}).state,'HIT');assert.equal(api.updateBox(b,{price:112,ts:21000}).state,'EXPIRED');assert.equal(api.updateBox(b,{price:89,ts:15000}).state,'INVALIDATED');
function runtime(v){const c={console,localStorage:{getItem:()=>v}};vm.createContext(c);vm.runInContext(scripts.find(s=>s.includes('const ACTIVE_VERSION_STORE=')),c);for(const f of ['v2.js','v3.js','v31.js','v33-base.js','v33.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);return c;}
const a=runtime('ARIS-3.1.0'),c=runtime('ARIS-3.3.0');assert.equal(c.EventSignalV6.CFG.version,'ARIS-3.3.0');assert(c.ArisV33BaseEngine);
const ea=new a.EventSignalV6.Engine(),ec=new c.EventSignalV6.Engine();ea.session=ec.session='TEST';
let bars=[],previous=1000,signals=0;
for(let i=0;i<400;i++){
 const close=1000+i*.1+12*Math.sin(i/14)+3*Math.sin(i/3);
 bars.push({time:6000+i*60,open:previous,high:Math.max(previous,close)+.6,low:Math.min(previous,close)-.6,close,volume:100+i%20,closed:true});previous=close;
 if(i<40)continue;
 for(let j=0;j<3;j++){
  const x={symbol:'BTCUSDT',timeframe:'1m',timeframeSeconds:60,id:i*3+j,ts:(6060+i*60)*1000+j*400,price:close+.1*j,bars:structuredClone(bars),fresh:true,flow:Math.sign(close-bars[i-1].close)*.15,coverage:60,bookValid:false,current:{...bars.at(-1),time:6060+i*60,closed:false}};
  const u=ea.step(structuredClone(x)),v=ec.step(structuredClone(x));
  assert.equal(v.status,u.status);assert.equal(v.signal?.direction,u.signal?.direction);assert.equal(v.signal?.entryPrice,u.signal?.entryPrice);assert.equal(JSON.stringify(v.v3Story?.fib),JSON.stringify(u.v3Story?.fib));assert(!v.v33Elliott?.error,v.v33Elliott?.error);
  if(u.signal)signals++;
 }
}
assert(signals>0,'regression stream must issue real signals');
const history=ec.elliott.serialize(),frozen=JSON.stringify(history.contexts['BTCUSDT|1m'].audit), restored=new api.Observer(history);assert.equal(JSON.stringify(restored.serialize().contexts['BTCUSDT|1m'].audit),frozen);
const last=ec.lastView.v33Elliott;assert(last.historyBars>=390);assert(last.degrees.Working.pivots.length>0);assert.equal(ea.signals.length,ec.signals.length);
assert.equal(JSON.stringify(ec.elliott.serialize().contexts['BTCUSDT|1m'].audit.slice(0,10)),JSON.stringify(history.contexts['BTCUSDT|1m'].audit.slice(0,10)));
console.log(JSON.stringify({checks:'parse, hard rules, diagonal, truncation, ABC, triangle position, lifecycle, restore, observer integration',matchedSignalCount:signals,storedSignals:ec.signals.length,history:last.historyBars,pivots:last.degrees.Working.pivots.length,unknown:last.unknown,preferred:last.preferred?.currentWave,boxes:history.contexts['BTCUSDT|1m'].boxes.length}));
