/* ARIS 3.3 Elliott observer. EXPERIMENTAL scores, never trade probabilities.
 * Closed-data decisions; append-only snapshots; execution delegated to frozen 3.1.
 */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)), finite=Number.isFinite;
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{const b=a.filter(finite).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0;};
const DEFAULTS=Object.freeze({historyLimit:2400,auditLimit:1200,pivotLimit:320,topK:7,maxDepth:2,ambiguityGap:6,minScore:48,
 degrees:[{name:'Micro',radius:2,minBars:2,minChildren:1,atr:.35},{name:'Working',radius:5,minBars:6,minChildren:3,atr:.9},{name:'Structural',radius:12,minBars:16,minChildren:3,atr:1.8}]});
const STATE_TH={CANDIDATE:'เริ่มเข้าข่าย',FORMING:'กำลังก่อตัว',PROBABLE_COMPLETE:'อาจจบแล้ว รอยืนยัน',CONFIRMED_COMPLETE:'ยืนยันจบแล้ว',INVALIDATED:'สมมติฐานยกเลิก'};
const UNKNOWN_TH={INSUFFICIENT_STRUCTURE:'จุดสวิงยังไม่พอ',UNRESOLVED:'ยังจำแนกคลื่นไม่ได้',COMPLEX_CORRECTION:'การพักตัวซับซ้อน',MULTIPLE_COUNTS_CLOSE:'Wave Count ยังไม่ชัด'};
const DEGREE_CODE={Micro:'MIC',Working:'WRK',Structural:'STR'};
function hashKey(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36).toUpperCase().padStart(7,'0');}
function candidateIdentity(c){if(!c)return c;const h=hashKey(c.key);c.id=c.id||'COUNT-'+h;c.waveId=c.waveId||'W33-'+(DEGREE_CODE[c.degree]||'UNK')+'-'+h;return c;}
function atr(b){return mean(b.slice(-24).map((q,i,a)=>Math.max(q.high-q.low,Math.abs(q.high-(a[i-1]?.close??q.open)),Math.abs(q.low-(a[i-1]?.close??q.open)))));}
function barsOnly(b,asOf,seconds){return (b||[]).filter(q=>q.closed&&[q.time,q.open,q.high,q.low,q.close].every(finite)&&q.high>=Math.max(q.open,q.close)&&q.low<=Math.min(q.open,q.close)&&q.time+seconds<=asOf);}
function feed(b,radius=2){
 const p=[];
 for(let i=radius;i<b.length-radius;i++){
  const q=b[i],left=b.slice(i-radius,i),right=b.slice(i+1,i+radius+1);
  const hi=left.every(v=>q.high>v.high)&&right.every(v=>q.high>=v.high),lo=left.every(v=>q.low<v.low)&&right.every(v=>q.low<=v.low);
  if(hi===lo)continue; // Ambiguous outside bars have no knowable H/L order.
  const type=hi?'H':'L',price=hi?q.high:q.low,item={id:'P:'+q.time+':'+type,time:q.time,i,price,type,confirmedAt:b[i+radius].time,provisional:false};
  const last=p.at(-1);
  if(last?.type===type){if(type==='H'?price>last.price:price<last.price)p[p.length-1]=item;}
  else p.push(item);
 }
 return p;
}
function degreePivots(b,lower,config,a,limit){
 const raw=feed(b,config.radius),out=[];
 for(const p of raw){
  const last=out.at(-1);if(!last){out.push(p);continue;}
  const childCount=lower.filter(q=>q.time>last.time&&q.time<=p.time).length;
  const duration=p.i-last.i,move=Math.abs(p.price-last.price);
  if(p.type===last.type){if(p.type==='H'?p.price>last.price:p.price<last.price)out[out.length-1]=p;continue;}
  // Degree uses duration, pivot significance and children, never ATR alone.
  if(duration>=config.minBars&&move>=a*config.atr&&childCount>=config.minChildren)out.push({...p,significance:{duration,moveAtr:move/a,childCount}});
 }
 return out.slice(-limit);
}
function hardRules(p,pattern='IMPULSE',opts={}){
 const n=p.length-1,d=Math.sign(p[1]?.price-p[0]?.price),v=p.map(x=>x.price*d),fail=[];
 if(!d||n<1)return {valid:false,reasons:['INSUFFICIENT_STRUCTURE']};
 for(let i=1;i<p.length;i++)if(p[i].time<=p[i-1].time||p[i].price===p[i-1].price||Math.sign(p[i].price-p[i-1].price)!==(i%2?d:-d))fail.push('PIVOT_SEQUENCE_INVALID');
 if(pattern==='IMPULSE'||pattern==='DIAGONAL_CANDIDATE'){
  if(n>=2&&v[2]<=v[0])fail.push('W2_ORIGIN_BROKEN');
  if(n>=3&&v[3]<=v[1])fail.push('W3_NOT_BEYOND_W1');
  if(n>=4&&v[4]<=v[2])fail.push('W4_FULL_RETRACE');
  if(n>=4&&pattern==='IMPULSE'&&v[4]<=v[1])fail.push('IMPULSE_W4_OVERLAP');
  if(n>=5){
   const w1=v[1]-v[0],w3=v[3]-v[2],w5=v[5]-v[4];
   if(w3<Math.min(w1,w5))fail.push('W3_TOO_SHORT');
   if(pattern==='DIAGONAL_CANDIDATE'){
    const contract=w3<w1&&w5<w3&&(v[3]-v[4])<(v[1]-v[2]);
    const expand=w3>w1&&w5>w3&&(v[3]-v[4])>(v[1]-v[2]);
    if(!(v[4]<v[1]&&v[4]>v[2]&&(contract||expand)))fail.push('DIAGONAL_GEOMETRY_INVALID');
   }
  }
 }else if(pattern==='ZIGZAG'){
  if(n>=2&&v[2]<=v[0])fail.push('ZIGZAG_B_ORIGIN_BROKEN');
  if(n>=3&&v[3]<=v[1])fail.push('ZIGZAG_C_NOT_BEYOND_A');
 }else if(pattern==='FLAT'){
  if(n>=2&&(v[1]-v[2])/(v[1]-v[0])<.9)fail.push('FLAT_B_TOO_SHALLOW');
 }else if(pattern==='TRIANGLE'){
  if(!['4','B','X'].includes(opts.parentWave))fail.push('TRIANGLE_POSITION_UNCONFIRMED');
  if(n>=5&&!(v[3]<v[1]&&v[4]>v[2]&&v[5]<v[3]&&v[5]>v[4]))fail.push('TRIANGLE_NOT_CONTRACTING');
 }
 return {valid:!fail.length,reasons:[...new Set(fail)]};
}
function subdivision(p,pattern,layers,depth=0,maxDepth=2){
 const n=p.length-1,expected=pattern==='IMPULSE'?[5,3,5,3,5]:pattern==='ZIGZAG'?[5,3,5]:pattern==='FLAT'?[3,3,5]:[3,3,3,3,3];
 const lower=layers[0]||[],legs=[];
 for(let i=1;i<=n;i++){
  const start=p[i-1],end=p[i],inside=lower.filter(q=>q.time>start.time&&q.time<end.time),seq=[start,...inside,end];
  const needed=expected[i-1],count=seq.length-1;
  let state='UNRESOLVED',patternChild=null,nested=null;
  if(!end.provisional&&count===needed){
   if(needed===5&&hardRules(seq,'IMPULSE').valid){state='VALID';patternChild='IMPULSE';}
   if(needed===3){for(const pat of ['ZIGZAG','FLAT'])if(hardRules(seq,pat).valid){state='VALID';patternChild=pat;break;}}
   if(state==='VALID'&&depth<maxDepth&&layers.length>1){nested=subdivision(seq,patternChild,layers.slice(1),depth+1,maxDepth);if(nested.state==='INVALID')state='INVALID';}
  }
  // Extension: validate an actual five-wave internal sequence with one nested motive leg.
  if(!end.provisional&&needed===5&&count>5&&depth<maxDepth&&layers.length>1){
   const coarse=feedFromPivots(seq);
   if(coarse.length===6&&hardRules(coarse,'IMPULSE').valid){nested=subdivision(coarse,'IMPULSE',[seq,...layers.slice(1)],depth+1,maxDepth);if(nested.validLegs>=3){state='VALID';patternChild='EXTENDED_IMPULSE';}}
  }
  legs.push({id:'W33:'+start.id+':'+end.id,from:start.id,to:end.id,expected:needed,observed:count,state,pattern:patternChild,children:seq.map(q=>q.id),nested});
 }
 const validLegs=legs.filter(x=>x.state==='VALID').length;
 return {state:validLegs===n?'VALID':'UNRESOLVED',validLegs,totalLegs:n,quality:n?validLegs/n:0,legs};
}
function feedFromPivots(seq){return seq.filter((p,i)=>i===0||i===seq.length-1||i>0&&i<seq.length-1&&(p.type==='H'?p.price>seq[i-2]?.price&&p.price>=seq[i+2]?.price:p.price<seq[i-2]?.price&&p.price<=seq[i+2]?.price));}
function channel(p){
 if(p.length<4)return null;
 const n=p.length-1,a=n>=4?p[2]:p[1],b=n>=4?p[4]:p[3],through=n>=4?p[3]:p[2];
 if(!a||!b||b.time===a.time)return null;
 return {a,b,through,slope:(b.price-a.price)/(b.time-a.time),targetWave:n>=4?'5':'4'};
}
function project(c,ctx){
 const p=c.pivots,n=p.length-1,d=c.direction,motive=['IMPULSE','DIAGONAL_CANDIDATE'].includes(c.pattern);
 let next=motive?(n<5?String(n+1):'A'):c.pattern==='TRIANGLE'?'THRUST':n<3?['A','B','C'][n]:'1';
 let dir=-Math.sign(p.at(-1).price-p.at(-2).price),base=p.at(-1).price,sourceStart=p[0],sourceEnd=p[1],ratios=[.382,.5,.618];
 if(motive&&n===2){dir=d;ratios=[1,1.272,1.618,2.618];}
 else if(motive&&n===4){dir=d;ratios=[.618,1,1.618];}
 else if(motive&&n===3){sourceStart=p[2];sourceEnd=p[3];ratios=[.236,.382,.5];}
 else if(!motive&&n===2){dir=d;ratios=[1,1.272,1.618];}
 else if(n>=5){sourceStart=p[0];sourceEnd=p.at(-1);}
 const magnitude=Math.abs(sourceEnd.price-sourceStart.price),a=ctx.atr;
 const levels=ratios.map(r=>({price:base+dir*magnitude*r,ratio:r,source:'WAVE_FIB'}));
 const duration=p.slice(1).map((q,i)=>(q.time-p[i].time)/ctx.seconds),historical=(ctx.durations||[]).slice(-60);
 const speed=Math.abs(ctx.momentum||0),typical=median([...duration,...historical])||8;
 const durationBase=typical*clip(1.2-speed*.25,.65,1.4),fromBars=Math.max(1,Math.floor(durationBase*.618)),toBars=Math.max(fromBars+2,Math.ceil(durationBase*1.618));
 const targetTime=ctx.time+toBars*ctx.seconds,ch=channel(p);
 const references=[...ctx.zones.map(q=>({price:q.price,source:'ZONE'})),...p.slice(0,-1).map(q=>({price:q.price,source:'SWING'}))];
 for(const h of Object.values(ctx.htf||{}))if(finite(h?.obstacle?.price))references.push({price:h.obstacle.price,source:'HTF'});
 if(ch)references.push({price:ch.a.price+ch.slope*(targetTime-ch.a.time),source:'CHANNEL'},{price:ch.through.price+ch.slope*(targetTime-ch.through.time),source:'CHANNEL'});
 const tol=Math.max(a*.3,magnitude*.05),ranked=levels.map(l=>({...l,confluence:references.filter(q=>Math.abs(q.price-l.price)<=tol)})).sort((x,y)=>y.confluence.length-x.confluence.length||Math.abs(x.ratio-1)-Math.abs(y.ratio-1));
 const best=ranked[0],primary={low:best.price-tol,high:best.price+tol,sources:['WAVE_FIB',...new Set(best.confluence.map(q=>q.source))],confluence:best.confluence};
 const extendedLevel=levels.at(-1),extended=ratios.at(-1)>1?{low:extendedLevel.price-tol,high:extendedLevel.price+tol}:null;
 // Origin for W2/W3; W4 cannot overlap W1 in ordinary impulse; W5 cannot undo W4 origin.
 const invalidation=motive?(n===1||n===2?p[0].price:n===3?(c.pattern==='IMPULSE'?p[1].price:p[2].price):n===4?p[2].price:p.at(-1).price):p.at(-1).price;
 const invalidationDirection=motive&&n<5?d:dir;
 const triggerPrice=dir>0?Math.max(...p.slice(-2).map(q=>q.price)):Math.min(...p.slice(-2).map(q=>q.price));
 return {wave:next,direction:dir,targetLow:primary.low,targetHigh:primary.high,primary,extended,fromBars,toBars,startTime:ctx.time+fromBars*ctx.seconds,endTime:targetTime,
  trigger:{price:triggerPrice,direction:dir,kind:'RECLAIM_AND_HOLD'},invalidation,invalidationDirection,score:c.score,
  waveFib:{degree:c.degree,sourceWave:motive&&n===3?'3':'1/A',targetWave:next,start:sourceStart.price,end:sourceEnd.price,projectionBase:base,ratios,levels},channel:ch,
  timing:{method:'same-degree duration distribution × speed-adjusted range',samples:duration.length+historical.length,experimental:true}};
}
function personality(c,ctx){
 const label=c.currentWave,dir=c.currentDirection, f=ctx.features||{},b=ctx.behavior||{},parts={},notes=[];
 parts.momentum=clip(dir*(f.mom||0)*4,-5,5);parts.acceleration=clip(dir*(f.momAccel||0)*3,-3,3);parts.efficiency=clip((f.eff||0)*5,0,5);
 parts.volume=finite(f.relVolume)?clip((f.relVolume-1)*3,-2,4):0;parts.flow=finite(ctx.flow)?clip(dir*ctx.flow*8,-3,3):0;
 parts.htf=Object.values(ctx.htf||{}).reduce((s,h)=>s+(h?.available?Math.sign(h.dir)*dir*2:0),0);
 if(label==='3'){notes.push('คลื่น 3 ต้องการแรงต่อเนื่อง');if(dir*(f.mom||0)<=0)parts.personality=-5;}
 if(label==='2')notes.push('พักตัวสวนคลื่น 1 ต้องรักษาจุดเริ่มต้น');
 if(label==='4'){notes.push('พักตัว/บีบตัวก่อนคลื่นสุดท้าย');parts.personality=b.compression?3:0;}
 if(label==='5'){notes.push('ปลายขา เฝ้าดูแรงอ่อนและ divergence');parts.personality=b.exhaustion?2:0;}
 if(label==='B')notes.push('เด้งสวนใน correction ยังอาจเป็นการฟื้นหลอก');
 if(label==='C')notes.push('ขาจบ correction ต้องตรวจ motive ภายใน');
 const p=c.pivots;if(p.length>=5){const r2=Math.abs(p[2].price-p[1].price)/Math.abs(p[1].price-p[0].price),r4=Math.abs(p[4].price-p[3].price)/Math.abs(p[3].price-p[2].price);parts.alternation=Math.abs(r2-r4)>.2?3:-1;}
 return {parts,notes,score:Object.values(parts).reduce((s,x)=>s+x,0)};
}
function makeCandidate(p,pattern,degree,layers,ctx,parent){
 const check=hardRules(p,pattern,{parentWave:parent?.currentWave});if(!check.valid)return null;
 const n=p.length-1,motive=['IMPULSE','DIAGONAL_CANDIDATE'].includes(pattern),labels=motive?['0','1','2','3','4','5']:pattern==='TRIANGLE'?['0','A','B','C','D','E']:['0','A','B','C'];
 const sub=subdivision(p,pattern,layers,0,ctx.maxDepth),provisional=!!p.at(-1).provisional,d=Math.sign(p[1].price-p[0].price);
 const key=[degree,pattern,...p.map(q=>q.provisional?'LIVE:'+q.type:q.id)].join('|');
 const c={key,degree,pattern,category:motive?'MOTIVE':'CORRECTIVE',direction:d,currentDirection:Math.sign(p.at(-1).price-p.at(-2).price),currentWave:labels[n],
  state:provisional?'FORMING':sub.state==='VALID'?'CONFIRMED_COMPLETE':'CANDIDATE',pivots:p.map((q,i)=>({...q,label:labels[i]})),subwaves:sub,hardRules:check,parentWave:parent?{key:parent.key,wave:parent.currentWave,degree:parent.degree}:null,children:sub.legs};
 if(provisional&&ctx.behavior?.rejection===-c.currentDirection)c.state='PROBABLE_COMPLETE';
 const w1=Math.abs(p[1].price-p[0].price),w3=n>=3?Math.abs(p[3].price-p[2].price):0;
 c.extension=motive&&n>=3&&w3>w1*1.618;c.truncated=motive&&n===5&&d*(p[5].price-p[3].price)<=0;
 if(c.truncated&&sub.legs[4]?.state!=='VALID')c.state='CANDIDATE';
 if(pattern==='FLAT'&&n>=3){const ratio=Math.abs(p[2].price-p[1].price)/w1;c.variant=ratio>1.05?(d*(p[3].price-p[1].price)>0?'EXPANDED':'RUNNING'):'REGULAR';}
 const behavior=personality(c,ctx);c.personality=behavior;
 const durations=p.slice(1).map((q,i)=>q.time-p[i].time),durationConsistency=median(durations)?clip(5-(Math.max(...durations)/median(durations)),0,4):0;
 const ratio=n>=2?Math.abs(p[2].price-p[1].price)/w1:0,fibFit=ratio>=.236&&ratio<=.786?4:0;
 c.scoreParts={structure:Math.min(20,8+n*2),subwaves:sub.quality*25,degree:p.at(-1).significance?5:2,duration:durationConsistency,fib:fibFit,...behavior.parts};
 c.score=Math.round(clip(20+Object.values(c.scoreParts).reduce((s,x)=>s+x,0),0,100));
 if(pattern==='DIAGONAL_CANDIDATE'&&!['1','5','A','C'].includes(parent?.currentWave))c.score=Math.min(c.score,45);
 if(sub.state!=='VALID')c.score=Math.min(c.score,68); // Never claim validated pattern from an outline alone.
 if(parent&&parent.currentDirection!==c.direction){c.parentConflict=true;c.score=Math.max(0,c.score-6);}
 c.next=project(c,ctx);return c;
}
function liveEndpoint(p,b,price,time){
 if(!p.length)return null;const last=p.at(-1),after=b.filter(q=>q.time>=last.time),type=last.type==='H'?'L':'H';
 const value=type==='H'?Math.max(price,...after.map(q=>q.high)):Math.min(price,...after.map(q=>q.low));
 return {id:'LIVE:'+type,time:Math.max(time,last.time+1),i:b.length,price:value,type,provisional:true};
}
function generate(p,degree,layers,ctx,parent){
 const found=[];const end=liveEndpoint(p,ctx.bars,ctx.price,ctx.time),sets=[p,...(end?[p.concat(end)]:[])];
 for(const seq of sets){
  for(let n=2;n<=5;n++){
   if(seq.length<n+1)continue;const points=seq.slice(-n-1);
   for(const pat of ['IMPULSE',...(n===5?['DIAGONAL_CANDIDATE','TRIANGLE']:[]),...(n<=3?['ZIGZAG','FLAT']:[])]){
    const c=makeCandidate(points,pat,degree,layers,ctx,parent);if(c)found.push(c);
   }
  }
 }
 const unique=new Map();for(const c of found)unique.set(c.key,c);
 return [...unique.values()].sort((a,b)=>b.score-a.score||b.pivots.length-a.pivots.length||a.key.localeCompare(b.key)).slice(0,ctx.topK).map(candidateIdentity);
}
function selectCounts(candidates,cfg=DEFAULTS){
 const preferred=candidates[0]||null;
 const alternate=candidates.find(q=>preferred&&q.key!==preferred.key&&(q.next.direction!==preferred.next.direction||q.pattern!==preferred.pattern||q.currentWave!==preferred.currentWave))||null;
 const unknown=!preferred?'INSUFFICIENT_STRUCTURE':preferred.score<cfg.minScore?'UNRESOLVED':alternate&&preferred.score-alternate.score<cfg.ambiguityGap?'MULTIPLE_COUNTS_CLOSE':null;
 return {preferred,alternate,unknown};
}
function previousCountStatus(previous,sets,ctx){
 if(!previous)return {invalid:false,reasons:[]};
 const pivots=sets?.[previous.degree]||[];
 if(!pivots.length)return {invalid:false,reasons:['NO_CURRENT_PIVOT_SET']};
 const end=liveEndpoint(pivots,ctx.bars,ctx.price,ctx.time),seq=end?pivots.concat(end):pivots,len=previous.pivots?.length||0;
 if(len>=2&&seq.length>=len){
  const check=hardRules(seq.slice(-len),previous.pattern,{parentWave:previous.parentWave?.wave});
  if(!check.valid)return {invalid:true,reasons:check.reasons};
 }
 return {invalid:false,reasons:[]};
}
function updateBox(box,q){
 if(!['ACTIVE','EXTENDED'].includes(box.state))return null;
 const invalid=box.invalidationDirection*(q.price-box.invalidation)<0;
 if(invalid)return {state:'INVALIDATED',reason:'STRUCTURAL_INVALIDATION',at:q.ts};
 if(q.ts>box.endTime*1000)return {state:'EXPIRED',reason:'TIME_BOX_EXPIRED',at:q.ts};
 if(!box.triggered&&box.trigger.direction*(q.price-box.trigger.price)>=0)return {state:box.state,triggered:true,at:q.ts,reason:'TRIGGER_RECLAIMED'};
 if(box.triggered&&q.ts>=box.startTime*1000&&q.price>=box.targetLow&&q.price<=box.targetHigh)return {state:'HIT',at:q.ts,reason:'TARGET_AND_TIME_HIT'};
 if(box.triggered&&q.price>=box.targetLow&&q.price<=box.targetHigh&&!box.priceHitAt)return {state:box.state,priceHitAt:q.ts,at:q.ts,reason:'PRICE_HIT_OUTSIDE_TIME'};
 if(box.triggered&&box.extended&&box.direction*(q.price-(box.direction>0?box.targetHigh:box.targetLow))>0&&box.state==='ACTIVE')return {state:'EXTENDED',at:q.ts,reason:'EXTENSION_IN_PROGRESS'};
 return null;
}
class Observer{
 constructor(saved={},cfg={}){this.cfg={...DEFAULTS,...cfg};this.contexts=clone(saved.contexts||{});this.sequence=saved.sequence||0;this.cache=new Map();}
 serialize(){return {schema:'aris-elliott-1',sequence:this.sequence,contexts:clone(this.contexts)};}
 record(s,type,data,ts){s.audit.push({id:'EA-'+(++this.sequence),timestamp:ts,symbol:s.symbol,timeframe:s.timeframe,type,...clone(data)});if(s.audit.length>this.cfg.auditLimit){s.audit.shift();s.evictedAudit++;}}
 observe(x,view={}){
  const seconds=x.timeframeSeconds||({ '1m':60,'5m':300,'15m':900,'1h':3600 }[x.timeframe]||60),symbol=x.symbol||'UNSPECIFIED',timeframe=x.timeframe||seconds+'s',key=symbol+'|'+timeframe;
  let s=this.contexts[key];if(!s)s=this.contexts[key]={symbol,timeframe,seconds,bars:[],audit:[],boxes:[],durationsByDegree:{Micro:[],Working:[],Structural:[]},lastTs:0,samples:0,known:0,recounts:0,evictedAudit:0,degreeSignatures:{},degreeLinks:{},stabilityBars:[],preferredSinceTs:null};
  s.durationsByDegree=s.durationsByDegree||{Micro:[],Working:Array.isArray(s.durations)?s.durations:[],Structural:[]};s.degreeLinks=s.degreeLinks||{};s.stabilityBars=s.stabilityBars||[];
  if(!finite(x.ts)||!finite(x.price)||x.ts<s.lastTs||!x.fresh)return s.output||{unknown:'INSUFFICIENT_STRUCTURE',degrees:{}};
  for(const box of s.boxes){const update=updateBox(box,x);if(update){Object.assign(box,update);if(['HIT','EXPIRED','INVALIDATED'].includes(box.state)){box.terminalPrice=x.price;box.directionCorrect=box.direction*(x.price-box.originPrice)>0;}this.record(s,'BOX_'+update.reason,{box},x.ts);}}
  const incoming=barsOnly(x.bars,x.ts/1000,seconds),last=incoming.at(-1),rebuild=last&&last.time!==s.lastBarTime;
  if(rebuild){
   const map=new Map(s.bars.map(q=>[q.time,q]));for(const q of incoming)if(!map.has(q.time))map.set(q.time,clone(q)); // closed candles immutable in our audit
   s.bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-this.cfg.historyLimit);s.lastBarTime=last.time;
  }
  const a=Math.max(atr(s.bars),x.price*.000001),meaningful=!s.output||rebuild||Math.abs(x.price-(s.lastCalcPrice??x.price))>=a*.35||s.boxes.some(q=>q.state==='INVALIDATED'&&q.at===x.ts);
  s.lastTs=x.ts;if(!meaningful)return clone(s.output);
  const b=s.bars,cached=this.cache.get(key),sets=cached?.barTime===s.lastBarTime?cached.sets:{};let lower=[];
  for(const spec of (cached?.barTime===s.lastBarTime?[]:this.cfg.degrees)){const p=spec.name==='Micro'?feed(b,spec.radius).slice(-this.cfg.pivotLimit):degreePivots(b,lower,spec,a,this.cfg.pivotLimit);sets[spec.name]=p;lower=p;}
  this.cache.set(key,{barTime:s.lastBarTime,sets});
  if(rebuild)for(const degree of ['Micro','Working','Structural']){const pairs=sets[degree]||[];if(pairs.length>1)s.durationsByDegree[degree]=pairs.slice(1).map((p,i)=>(p.time-pairs[i].time)/seconds).filter(finite).slice(-60);}
  const baseCtx={...this.cfg,atr:a,bars:b,price:x.price,time:x.ts/1000,seconds,zones:view.z||[],htf:view.v3Story?.htf||{},behavior:view.v3Story?.behavior||{},features:view.f||{},momentum:view.f?.mom||0,flow:x.flow};
  const degrees={};let parent=null;
  for(const degree of ['Structural','Working','Micro']){
   const layers=degree==='Structural'?[sets.Working,sets.Micro]:degree==='Working'?[sets.Micro]:[],degreeCtx={...baseCtx,durations:s.durationsByDegree[degree]||[]};
   const candidates=generate(sets[degree],degree,layers,degreeCtx,parent);
   const selected=selectCounts(candidates,this.cfg);degrees[degree]={...selected,candidates,pivots:sets[degree]};parent=selected.preferred;
   const signature=sets[degree].map(p=>p.id+':'+p.price).join('|');if(signature!==s.degreeSignatures[degree]){this.record(s,'NEW_PIVOT',{degree,pivotSet:sets[degree].slice(-12)},x.ts);s.degreeSignatures[degree]=signature;}
  }
  const ctx={...baseCtx,durations:s.durationsByDegree.Working||[]};
  // Link contained child structures and audit promotion/reclassification without rewriting prior snapshots.
  for(const [outer,inner] of [['Structural','Working'],['Working','Micro']]){
   const p=degrees[outer].preferred,c=degrees[inner].preferred;
   if(p&&c){const leg=p.pivots.findIndex((q,i)=>i>0&&c.pivots[0].time>=p.pivots[i-1].time&&c.pivots.at(-1).time<=q.time);
    if(leg>0){c.parentWave={id:p.id,key:p.key,wave:p.pivots[leg].label,degree:outer};p.childCounts=[c.id];}
    else{c.parentWave=null;c.parentConflict=true;}
   }
   const link=c?.parentWave?c.id+'>'+c.parentWave.id+':'+c.parentWave.wave:null,previousLink=s.degreeLinks[inner]??null;
   if(link!==previousLink){
    if(link)this.record(s,previousLink?'DEGREE_RECLASSIFIED':'DEGREE_PROMOTED',{degree:inner,childId:c.id,parent:c.parentWave,previousLink},x.ts);
    else if(previousLink)this.record(s,'DEGREE_RECLASSIFIED',{degree:inner,childId:c?.id||null,parent:null,previousLink,reason:'PARENT_RELATION_NO_LONGER_VALID'},x.ts);
    s.degreeLinks[inner]=link;
   }
  }
  const selected=degrees.Working,p=selected.preferred,old=s.output?.preferred,previousStatus=previousCountStatus(old,sets,ctx);
  let reason=null;
  if(!old&&p)reason='INITIAL_COUNT';
  else if(old&&!p)reason=previousStatus.invalid?(previousStatus.reasons[0]||'HARD_RULE_INVALIDATED'):'NO_VALID_CURRENT_COUNT';
  else if(old&&p&&old.key!==p.key)reason=previousStatus.invalid?(previousStatus.reasons[0]||'HARD_RULE_INVALIDATED'):'NEW_CONFIRMED_STRUCTURE_OR_RECLASSIFICATION';
  if(p&&old?.key===p.key&&old.id){p.id=old.id;p.waveId=old.waveId||p.waveId;}
  if(!old&&p){s.preferredSinceTs=x.ts;this.record(s,'NEW_CANDIDATE',{reason,count:p},x.ts);}
  if(old&&!s.preferredSinceTs)s.preferredSinceTs=s.output?.timestamp||x.ts;
  if(old&&reason&&old.key!==p?.key){
   if(finite(s.preferredSinceTs)){s.stabilityBars.push(Math.max(0,(x.ts-s.preferredSinceTs)/(seconds*1000)));s.stabilityBars=s.stabilityBars.slice(-240);}
   s.preferredSinceTs=p?x.ts:null;
   s.recounts++;
   this.record(s,previousStatus.invalid?'COUNT_INVALIDATED':'RECOUNT',{replaces:old.id||null,previous:{id:old.id||null,key:old.key,degree:old.degree,pattern:old.pattern,wave:old.currentWave,state:'INVALIDATED'},replacement:p?{id:p.id,key:p.key,degree:p.degree,pattern:p.pattern,wave:p.currentWave}:null,reason,reasons:previousStatus.reasons},x.ts);
  }
  if(rebuild){s.samples++;if(p&&!selected.unknown)s.known++;}
  const unknown=!p&&sets.Micro.length>8?'COMPLEX_CORRECTION':selected.unknown;
  const activeWorking=s.boxes.filter(q=>['ACTIVE','EXTENDED'].includes(q.state)&&q.degree==='Working');
  for(const box of activeWorking){
   const countChanged=box.candidateKey!==p?.key||!!unknown;
   const stateChanged=!countChanged&&p&&box.currentState!==p.state;
   if(countChanged||stateChanged){
    box.state='INVALIDATED';
    box.reason=countChanged?(previousStatus.invalid?(previousStatus.reasons[0]||'COUNT_INVALIDATED'):(p?'COUNT_REPLACED':'COUNT_NO_LONGER_VALID')):'WAVE_STATE_CHANGED_REPROJECT';
    box.recounted=countChanged&&!!old&&old.key!==p?.key;
    box.at=x.ts;
    this.record(s,'BOX_INVALIDATED',{box},x.ts);
   }
  }
  if(p&&!unknown&&!s.boxes.some(q=>['ACTIVE','EXTENDED'].includes(q.state)&&q.candidateKey===p.key&&q.currentState===p.state)){
   const box={id:'BOX-'+(++this.sequence),candidateId:p.id,candidateKey:p.key,currentState:p.state,degree:'Working',pattern:p.pattern,currentWave:p.currentWave,...clone(p.next),createdAt:x.ts,originPrice:x.price,symbol,timeframe,seconds,regime:view.v3Story?.state||'UNKNOWN',state:'ACTIVE',triggered:false};
   s.boxes.push(box);if(s.boxes.length>300)s.boxes.shift();this.record(s,'PREDICTION_CREATED',{box},x.ts);
  }
  if(old&&p&&old.key===p.key&&old.state!==p.state)this.record(s,'WAVE_STATE_CHANGED',{candidateId:p.id,from:old.state,to:p.state},x.ts);
  s.lastCalcPrice=x.price;
  const activeBox=[...s.boxes].reverse().find(q=>q.candidateKey===p?.key)||null;
  const output={schema:'aris-elliott-1',experimental:true,scoreIsProbability:false,symbol,timeframe,seconds,timestamp:x.ts,unknown,preferred:p,alternate:selected.alternate,degrees,box:activeBox,
   executionFib:clone(view.v3Story?.fib||null),auditCount:s.audit.length,historyBars:b.length,combinationCandidate:unknown&&sets.Micro.length>=9?'COMBINATION_CANDIDATE':null};
  s.output=clone(output);
  if(rebuild||reason||old?.state!==p?.state)this.record(s,'COUNT_SNAPSHOT',{degree:'Working',pattern:p?.pattern||null,currentWave:p?.currentWave||null,currentState:p?.state||null,preferredCount:p?.id||null,preferredScore:p?.score||null,
   alternateCount:selected.alternate?.key||null,alternateScore:selected.alternate?.score||null,nextWave:p?.next.wave||null,nextDirection:p?.next.direction||null,
   targetLow:p?.next.targetLow||null,targetHigh:p?.next.targetHigh||null,targetStartBar:p?.next.fromBars||null,targetEndBar:p?.next.toBars||null,trigger:p?.next.trigger||null,invalidation:p?.next.invalidation||null,predictionState:activeBox?.state||null,
   pivotSet:p?.pivots||[],subwaveStructure:p?.subwaves||null,waveFib:p?.next.waveFib||null,htfContext:ctx.htf,recountReason:reason,invalidationReason:activeBox?.reason||null,unknown},x.ts);
  return clone(output);
 }
 report(){
  const rows=Object.values(this.contexts).flatMap(s=>s.boxes),terminal=rows.filter(q=>['HIT','EXPIRED','INVALIDATED'].includes(q.state));
  const lifeBars=q=>Math.max(0,((q.at||q.createdAt)-q.createdAt)/(1000*(q.seconds||({'1m':60,'5m':300,'15m':900,'1h':3600}[q.timeframe]||60))));
  const stats=a=>{const directionRows=a.filter(q=>typeof q.directionCorrect==='boolean'),stability=a.map(lifeBars).filter(finite);return {n:a.length,directionAccuracy:a.filter(q=>q.directionCorrect===true).length/(directionRows.length||1),targetHitRate:a.filter(q=>q.state==='HIT'||q.priceHitAt).length/(a.length||1),timeHitRate:a.filter(q=>q.state==='HIT').length/(a.length||1),invalidationRate:a.filter(q=>q.state==='INVALIDATED').length/(a.length||1),recountRate:a.filter(q=>q.recounted).length/(a.length||1),countStabilityAvgBars:stability.length?mean(stability):null,countStabilityMedianBars:stability.length?median(stability):null};};
  const group=k=>{const map={};for(const q of terminal){const v=k(q);(map[v]||(map[v]=[])).push(q);}return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,stats(v)]));};
  return {schema:'elliott-evaluation-1',experimental:true,scoresAreProbabilities:false,metricPolicy:'Fixed at creation: trigger required; target overlap on observed prices; invalidation first; time window inclusive; missing feed is not a hit. Direction evaluated at terminal observation; no unobserved intra-bar ordering inferred. Recounts and count-stability are measured from append-only lifecycle events.',
   totalPredictions:rows.length,completed:stats(terminal),scoreBuckets:group(q=>q.score<50?'0–49':q.score>=90?'90–100':Math.floor(q.score/10)*10+'–'+(Math.floor(q.score/10)*10+9)),
   byWave:group(q=>q.wave),byPattern:group(q=>q.pattern),byDegree:group(q=>q.degree),byRegime:group(q=>q.regime),byTimeframe:group(q=>q.timeframe),bySymbol:group(q=>q.symbol),
   contexts:Object.fromEntries(Object.entries(this.contexts).map(([k,s])=>{const stability=(s.stabilityBars||[]).filter(finite);return [k,{coverage:s.samples?s.known/s.samples:null,unknownRate:s.samples?1-s.known/s.samples:null,recountRate:s.samples?s.recounts/s.samples:null,countStabilityAvgBars:stability.length?mean(stability):null,countStabilityMedianBars:stability.length?median(stability):null,samples:s.samples,evictedAudit:s.evictedAudit}];}))};
 }
}
const api={Observer,DEFAULTS,feed,degreePivots,hardRules,subdivision,makeCandidate,generate,selectCounts,project,previousCountStatus,updateBox,candidateIdentity,STATE_TH,UNKNOWN_TH};root.ArisV33=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
const core=root.EventSignalV6;
if(core?.CFG?.version==='ARIS-3.3.0'&&root.ArisV33BaseEngine){
 const Base=core.Engine;
 core.Engine=class V33Engine extends Base{
  constructor(saved={}){super(saved);this.elliott=new Observer(saved.v33Memory||{});}
  serialize(){return {...super.serialize(),v33Memory:this.elliott.serialize()};}
  step(x){
   const view=super.step(x);
   try{const elliott=this.elliott.observe(x,view);view.v33Elliott=elliott;if(view.signal?.dataset?.entry&&!view.signal.dataset.entry.v33Elliott)view.signal.dataset.entry.v33Elliott=clone({schema:elliott.schema,symbol:elliott.symbol,timeframe:elliott.timeframe,timestamp:elliott.timestamp,unknown:elliott.unknown,preferred:elliott.preferred,alternate:elliott.alternate,box:elliott.box,experimental:true});}
   catch(error){view.v33Elliott={unknown:'UNRESOLVED',error:String(error.message),degrees:{}};}
   return view;
  }
 };
}
})(typeof globalThis!=='undefined'?globalThis:window);
