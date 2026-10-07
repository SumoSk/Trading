/* ARIS 3.3 Elliott analysis and entry policy. EXPERIMENTAL scores, never probabilities.
 * Confirmed structure, live timing, immutable forecasts and optional 3.1 execution baseline.
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
const HORIZON_MS=600000,MAX_SETTLEMENT_DELAY_MS=3000;
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
  const aLen=v[1]-v[0];
  if(n>=2&&v[2]<=v[0])fail.push('ZIGZAG_B_ORIGIN_BROKEN');
  if(n>=3&&v[3]<=v[1])fail.push('ZIGZAG_C_NOT_BEYOND_A');
  if(n>=3&&aLen>0&&(v[3]-v[2])/aLen<.382)fail.push('ZIGZAG_C_TOO_SMALL');
 }else if(pattern==='FLAT'){
  const aLen=v[1]-v[0],bRetrace=n>=2&&aLen>0?(v[1]-v[2])/aLen:null;
  if(n>=2&&(!finite(bRetrace)||bRetrace<.9))fail.push('FLAT_B_TOO_SHALLOW');
  if(n>=3&&aLen>0){
   const cLen=(v[3]-v[2])/aLen,cBeyondA=(v[3]-v[1])/aLen;
   if(cLen<.382)fail.push('FLAT_C_TOO_SMALL');
   if(bRetrace<=1.05&&cBeyondA<-.10)fail.push('FLAT_REGULAR_C_TOO_SHORT');
  }
 }else if(pattern==='TRIANGLE'){
  if(!['4','B','X'].includes(opts.parentWave))fail.push('TRIANGLE_POSITION_UNCONFIRMED');
  if(n>=5&&!(v[3]<v[1]&&v[4]>v[2]&&v[5]<v[3]&&v[5]>v[4]))fail.push('TRIANGLE_NOT_CONTRACTING');
 }
 return {valid:!fail.length,reasons:[...new Set(fail)]};
}
function correctionGeometry(p,pattern){
 if(!['ZIGZAG','FLAT'].includes(pattern)||p.length<3)return null;
 const d=Math.sign(p[1]?.price-p[0]?.price),a=Math.abs((p[1]?.price??0)-(p[0]?.price??0));
 if(!d||!finite(a)||a<=0)return null;
 const bRetrace=Math.abs(p[2].price-p[1].price)/a,n=p.length-1;
 let cLengthRatio=null,cBeyondA=null,variant=null;
 if(n>=3){
  cLengthRatio=Math.abs(p[3].price-p[2].price)/a;
  cBeyondA=d*(p[3].price-p[1].price)/a;
  if(pattern==='ZIGZAG')variant='ZIGZAG';
  else if(bRetrace>1.05)variant=cBeyondA>=0?'EXPANDED':'RUNNING';
  else variant='REGULAR';
 }
 return {direction:d,bRetrace,cLengthRatio,cBeyondA,variant};
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
 // Depart from the completed endpoint, rather than requiring a break of the previous wave's origin.
 // In particular, a Wave-4 trigger must occur above the Wave-1 overlap invalidation.
 const smallestMove=Math.min(...levels.map(l=>Math.abs(l.price-base))),buffer=Math.min(a*.15,magnitude*.1,smallestMove*.25);
 const triggerPrice=base+dir*buffer;
 const confirmed=ranked.find(l=>l.confluence.length>0&&dir*(l.price-triggerPrice)>tol&&dir*(l.price-ctx.price)>-tol)||null;
 const best=confirmed||ranked[0],fibOnlyTarget=best?{low:best.price-tol,high:best.price+tol,ratio:best.ratio}:null;
 const primary=confirmed?{low:confirmed.price-tol,high:confirmed.price+tol,sources:['WAVE_FIB',...new Set(confirmed.confluence.map(q=>q.source))],confluence:confirmed.confluence}:null;
 const extendedLevel=levels.at(-1),extended=primary&&ratios.at(-1)>1?{low:extendedLevel.price-tol,high:extendedLevel.price+tol}:null;
 // Origin for W2/W3; W4 cannot overlap W1 in ordinary impulse; W5 cannot undo W4 origin.
 const invalidation=motive?(n===1||n===2?p[0].price:n===3?(c.pattern==='IMPULSE'?p[1].price:p[2].price):n===4?p[2].price:p.at(-1).price):p.at(-1).price;
 const invalidationDirection=motive&&n<5?d:dir;
 return {wave:next,direction:dir,targetLow:primary?.low??null,targetHigh:primary?.high??null,primary,fibOnlyTarget,projectionReady:!!primary,targetStatus:primary?'CONFLUENT':'FIB_ONLY_UNCONFIRMED',extended,fromBars,toBars,startTime:ctx.time+fromBars*ctx.seconds,endTime:targetTime,
  trigger:{price:triggerPrice,direction:dir,kind:'PIVOT_DEPARTURE_AND_HOLD',holdMs:350,minTicks:2},invalidation,invalidationDirection,score:c.score,
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
 c.correctionGeometry=correctionGeometry(p,pattern);
 if(c.correctionGeometry?.variant)c.variant=c.correctionGeometry.variant;
 const behavior=personality(c,ctx);c.personality=behavior;
 const durations=p.slice(1).map((q,i)=>q.time-p[i].time),durationConsistency=median(durations)?clip(5-(Math.max(...durations)/median(durations)),0,4):0;
 const ratio=n>=2?Math.abs(p[2].price-p[1].price)/w1:0,fibFit=ratio>=.236&&ratio<=.786?4:0;
 c.scoreParts={structure:Math.min(20,8+n*2),subwaves:sub.quality*25,degree:p.at(-1).significance?5:2,duration:durationConsistency,fib:fibFit,...behavior.parts};
 c.score=Math.round(clip(20+Object.values(c.scoreParts).reduce((s,x)=>s+x,0),0,100));
 c.next=project(c,ctx);
 c.scoreParts.channel=c.next.channel?2:0;c.scoreParts.targetConfluence=c.next.projectionReady?Math.min(6,Math.max(1,(c.next.primary?.sources?.length||1)-1)*2):-3;
 c.score=Math.round(clip(20+Object.values(c.scoreParts).reduce((s,x)=>s+x,0),0,100));
 if(pattern==='DIAGONAL_CANDIDATE'&&!['1','5','A','C'].includes(parent?.currentWave))c.score=Math.min(c.score,45);
 if(sub.state!=='VALID')c.score=Math.min(c.score,68); // Never claim validated pattern from an outline alone.
 if(parent&&parent.currentDirection!==c.direction){c.parentConflict=true;c.score=Math.max(0,c.score-6);}
 c.next.score=c.score;return c;
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
 const unconfirmed=preferred&&preferred.state!=='CONFIRMED_COMPLETE';
 const unknown=!preferred?'INSUFFICIENT_STRUCTURE':preferred.score<cfg.minScore||unconfirmed?'UNRESOLVED':alternate&&preferred.score-alternate.score<cfg.ambiguityGap?'MULTIPLE_COUNTS_CLOSE':null;
 return {preferred,alternate,unknown,consensus:directionConsensus(candidates,cfg)};
}
function directionConsensus(candidates,cfg=DEFAULTS){
 const top=candidates[0]?.score??0;
 const eligible=candidates.filter(c=>c.state==='CONFIRMED_COMPLETE'&&c.score>=cfg.minScore&&top-c.score<cfg.ambiguityGap);
 const directions=[...new Set(eligible.map(c=>Math.sign(c.next?.direction||0)).filter(Boolean))];
 return {direction:directions.length===1?directions[0]:0,count:eligible.length,agreement:directions.length===1?1:0,
  score:eligible.length?Math.min(...eligible.map(c=>c.score)):0,candidateIds:eligible.map(c=>c.id||c.key),structurallyConfirmed:eligible.length>0};
}
function resolveUnknown(preferred,microPivotCount,selectedUnknown){return !preferred&&microPivotCount>8?'COMPLEX_CORRECTION':selectedUnknown;}
function previousCountStatus(previous,sets,ctx){
 if(!previous)return {invalid:false,reasons:[]};
 // Validate the original anchors. A later, unrelated swing cannot invalidate an older count.
 const pivots=previous.pivots||[],n=pivots.length-1;
 if(n<1)return {invalid:false,reasons:['NO_ORIGINAL_PIVOT_SET']};
 let seq=pivots;
 if(pivots.at(-1).provisional){const end=liveEndpoint(pivots.slice(0,-1),ctx.bars||[],ctx.price,ctx.time);if(end)seq=pivots.slice(0,-1).concat(end);}
 const check=hardRules(seq,previous.pattern,{parentWave:previous.parentWave?.wave});
 if(!check.valid)return {invalid:true,reasons:check.reasons};
 const d=Math.sign(pivots[1].price-pivots[0].price),motive=['IMPULSE','DIAGONAL_CANDIDATE'].includes(previous.pattern);
 if(motive){
  const forming=!!pivots.at(-1).provisional;
  const level=forming?(n%2===1?pivots[n-1].price:pivots[n-2].price):
   previous.next?.invalidation??(n<=2?pivots[0].price:n===3?(previous.pattern==='IMPULSE'?pivots[1].price:pivots[2].price):n===4?pivots[2].price:pivots.at(-1).price);
  const invDir=forming||n<5?d:(previous.next?.invalidationDirection||-d);
  if(finite(ctx.price)&&invDir*(ctx.price-level)<0)return {invalid:true,reasons:[n<=2?'W2_ORIGIN_BROKEN':n===3&&!forming?'IMPULSE_W4_OVERLAP':'ANCHORED_ORIGIN_BROKEN']};
 }else if(previous.next&&finite(previous.next.invalidation)&&previous.next.invalidationDirection*(ctx.price-previous.next.invalidation)<0){
  return {invalid:true,reasons:['ANCHORED_CORRECTION_INVALIDATED']};
 }
 return {invalid:false,reasons:[]};
}
function updateBox(box,q){
 if(!['ACTIVE','EXTENDED'].includes(box.state))return null;
 const invalid=box.invalidationDirection*(q.price-box.invalidation)<0;
 if(invalid)return {state:'INVALIDATED',reason:'STRUCTURAL_INVALIDATION',at:q.ts};
 if(q.ts>box.endTime*1000)return {state:'EXPIRED',reason:'TIME_BOX_EXPIRED',at:q.ts};
 let triggered=box.triggered,change={};
 if(!triggered){
  if(box.trigger.direction*(q.price-box.trigger.price)<0)return box.triggerSince!=null?{state:box.state,triggerSince:null,triggerTicks:0,at:q.ts,reason:'TRIGGER_RESET'}:null;
  const since=box.triggerSince??q.ts,ticks=(box.triggerTicks||0)+1;
  triggered=q.ts-since>=(box.trigger.holdMs||0)&&ticks>=(box.trigger.minTicks||1);
  change={triggerSince:since,triggerTicks:ticks,triggered};
  if(!triggered)return {...change,state:box.state,at:q.ts,reason:'TRIGGER_CONFIRMING'};
  change.triggeredAt=q.ts;
 }
 const hit=q.price>=box.targetLow&&q.price<=box.targetHigh;
 if(triggered&&hit&&q.ts>=box.startTime*1000)return {...change,state:'HIT',priceHitAt:q.ts,at:q.ts,reason:'TARGET_AND_TIME_HIT'};
 if(triggered&&hit&&!box.priceHitAt)return {...change,state:box.state,priceHitAt:q.ts,at:q.ts,reason:'PRICE_HIT_OUTSIDE_TIME'};
 if(triggered&&box.extended&&box.direction*(q.price-(box.direction>0?box.targetHigh:box.targetLow))>0&&box.state==='ACTIVE')return {...change,state:'EXTENDED',at:q.ts,reason:'EXTENSION_IN_PROGRESS'};
 if(Object.keys(change).length)return {...change,state:box.state,at:q.ts,reason:'TRIGGER_RECLAIMED'};
 return null;
}
function settleForecast(f,q){
 if(f.result!=='pending'||!finite(q.ts)||!finite(q.price)||q.ts<f.expiresAt)return null;
 if(q.ts-f.expiresAt>MAX_SETTLEMENT_DELAY_MS)return {result:'missing',settledAt:q.ts,reason:'NO_OBSERVATION_AT_T_PLUS_10',exitPrice:null};
 const move=f.direction*(q.price-f.entryPrice);
 return {result:move===0?'equal':move>0?'correct':'incorrect',settledAt:q.ts,exitPrice:q.price,directionalMove:move};
}
class Observer{
 constructor(saved={},cfg={}){this.cfg={...DEFAULTS,...cfg};this.contexts=clone(saved.contexts||{});this.sequence=saved.sequence||0;this.cache=new Map();}
 serialize(){return {schema:'aris-elliott-1',sequence:this.sequence,contexts:clone(this.contexts)};}
 record(s,type,data,ts){s.audit.push({id:'EA-'+(++this.sequence),timestamp:ts,symbol:s.symbol,timeframe:s.timeframe,type,...clone(data)});if(s.audit.length>this.cfg.auditLimit){s.audit.shift();s.evictedAudit++;}}
 addForecast(x,data){
  const seconds=x.timeframeSeconds||60,key=(x.symbol||'UNSPECIFIED')+'|'+(x.timeframe||seconds+'s'),s=this.contexts[key];
  if(!s||!data.direction||!finite(x.price)||!finite(x.ts))return null;
  s.forecasts=s.forecasts||[];
  const existing=s.forecasts.find(f=>f.id===data.id);if(existing)return existing;
  if(s.forecasts.length>=800){const i=s.forecasts.findIndex(f=>f.result!=='pending');if(i<0){this.record(s,'FORECAST_CAPACITY_REACHED',{id:data.id},x.ts);return null;}s.forecasts.splice(i,1);s.evictedForecasts=(s.evictedForecasts||0)+1;}
  const f={...clone(data),symbol:s.symbol,timeframe:s.timeframe,entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+HORIZON_MS,horizonMs:HORIZON_MS,result:'pending',inputScope:'decision_time_only'};
  s.forecasts.push(f);this.record(s,'T10_FORECAST_CREATED',{forecast:f},x.ts);return f;
 }
 resetEvaluation(){
  for(const s of Object.values(this.contexts)){s.audit=[];s.boxes=[];s.forecasts=[];s.samples=0;s.known=0;s.recounts=0;s.stabilityBars=[];s.preferredSinceTs=null;s.evictedAudit=0;s.evictedForecasts=0;s.output=null;}
 }
 observe(x,view={}){
  const seconds=x.timeframeSeconds||({ '1m':60,'5m':300,'15m':900,'1h':3600 }[x.timeframe]||60),symbol=x.symbol||'UNSPECIFIED',timeframe=x.timeframe||seconds+'s',key=symbol+'|'+timeframe;
  let s=this.contexts[key];if(!s)s=this.contexts[key]={symbol,timeframe,seconds,bars:[],audit:[],boxes:[],durationsByDegree:{Micro:[],Working:[],Structural:[]},lastTs:0,samples:0,known:0,recounts:0,evictedAudit:0,degreeSignatures:{},degreeLinks:{},stabilityBars:[],preferredSinceTs:null};
  s.durationsByDegree=s.durationsByDegree||{Micro:[],Working:Array.isArray(s.durations)?s.durations:[],Structural:[]};s.degreeLinks=s.degreeLinks||{};s.stabilityBars=s.stabilityBars||[];s.forecasts=s.forecasts||[];
  if(!finite(x.ts)||!finite(x.price)||x.ts<s.lastTs||!x.fresh)return s.output||{unknown:'INSUFFICIENT_STRUCTURE',degrees:{}};
  for(const f of s.forecasts){const result=settleForecast(f,x);if(result){Object.assign(f,result);this.record(s,'T10_FORECAST_SETTLED',{id:f.id,...result},x.ts);}}
  for(const box of s.boxes){const update=updateBox(box,x);if(update){Object.assign(box,update);if(['HIT','EXPIRED','INVALIDATED'].includes(box.state)){box.terminalPrice=x.price;box.directionCorrect=box.direction*(x.price-box.originPrice)>0;}this.record(s,'BOX_'+update.reason,{box},x.ts);}}
  const incoming=barsOnly(x.bars,x.ts/1000,seconds),last=incoming.at(-1),rebuild=last&&last.time!==s.lastBarTime;
  if(rebuild){
   const map=new Map(s.bars.map(q=>[q.time,q]));for(const q of incoming)if(!map.has(q.time))map.set(q.time,clone(q)); // closed candles immutable in our audit
   s.bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-this.cfg.historyLimit);s.lastBarTime=last.time;
  }
  const a=Math.max(atr(s.bars),x.price*.000001),meaningful=!s.output||rebuild||Math.abs(x.price-(s.lastCalcPrice??x.price))>=a*.35||s.boxes.some(q=>q.state==='INVALIDATED'&&q.at===x.ts);
  s.lastTs=x.ts;if(!meaningful){s.output.timestamp=x.ts;s.output.box=clone([...s.boxes].reverse().find(q=>q.candidateKey===s.output.preferred?.key)||null);return clone(s.output);}
  const b=s.bars,cached=this.cache.get(key),sets=cached&&cached.barTime===s.lastBarTime?cached.sets:{};let lower=[];
  for(const spec of (cached&&cached.barTime===s.lastBarTime?[]:this.cfg.degrees)){const p=spec.name==='Micro'?feed(b,spec.radius).slice(-this.cfg.pivotLimit):degreePivots(b,lower,spec,a,this.cfg.pivotLimit);sets[spec.name]=p;lower=p;}
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
  const unknown=resolveUnknown(p,sets.Micro.length,selected.unknown);
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
  // One immutable prediction per count/state. A HIT/EXPIRED forecast must not restart its clock.
  if(p?.state==='CONFIRMED_COMPLETE'&&!unknown&&p.next.projectionReady&&!s.boxes.some(q=>q.candidateKey===p.key&&q.currentState===p.state)){
   const box={id:'BOX-'+(++this.sequence),candidateId:p.id,candidateKey:p.key,currentState:p.state,degree:'Working',pattern:p.pattern,currentWave:p.currentWave,...clone(p.next),createdAt:x.ts,originPrice:x.price,symbol,timeframe,seconds,regime:view.v3Story?.state||'UNKNOWN',state:'ACTIVE',triggered:false};
   s.boxes.push(box);if(s.boxes.length>300)s.boxes.shift();this.record(s,'PREDICTION_CREATED',{box},x.ts);
   this.addForecast(x,{id:'T10:'+box.id,kind:'WAVE',direction:box.direction,candidateId:p.id,wave:box.wave,pattern:p.pattern,score:p.score,regime:box.regime});
  }
  if(old&&p&&old.key===p.key&&old.state!==p.state)this.record(s,'WAVE_STATE_CHANGED',{candidateId:p.id,from:old.state,to:p.state},x.ts);
  s.lastCalcPrice=x.price;
  const activeBox=[...s.boxes].reverse().find(q=>q.candidateKey===p?.key)||null;
  const output={schema:'aris-elliott-1',experimental:true,scoreIsProbability:false,symbol,timeframe,seconds,timestamp:x.ts,unknown,preferred:p,alternate:selected.alternate,consensus:selected.consensus,degrees,box:activeBox,
   executionFib:clone(view.v3Story?.fib||null),auditCount:s.audit.length,historyBars:b.length,combinationCandidate:unknown&&sets.Micro.length>=9?'COMBINATION_CANDIDATE':null};
  s.output=clone(output);
  if(rebuild||reason||old?.state!==p?.state)this.record(s,'COUNT_SNAPSHOT',{degree:'Working',pattern:p?.pattern||null,currentWave:p?.currentWave||null,currentState:p?.state||null,preferredCount:p?.id||null,preferredScore:p?.score||null,
   alternateCount:selected.alternate?.id||null,alternateScore:selected.alternate?.score||null,nextWave:p?.next.wave||null,nextDirection:p?.next.direction||null,
   targetLow:p?.next.targetLow||null,targetHigh:p?.next.targetHigh||null,targetStartBar:p?.next.fromBars||null,targetEndBar:p?.next.toBars||null,trigger:p?.next.trigger||null,invalidation:p?.next.invalidation||null,predictionState:activeBox?.state||null,
   pivotSet:p?.pivots||[],subwaveStructure:p?.subwaves||null,waveFib:p?.next.waveFib||null,htfContext:ctx.htf,recountReason:reason,invalidationReason:activeBox?.reason||null,unknown},x.ts);
  return clone(output);
 }
 report(){
  const rows=Object.values(this.contexts).flatMap(s=>s.boxes),terminal=rows.filter(q=>['HIT','EXPIRED','INVALIDATED'].includes(q.state));
  const lifeBars=q=>Math.max(0,((q.at||q.createdAt)-q.createdAt)/(1000*(q.seconds||({'1m':60,'5m':300,'15m':900,'1h':3600}[q.timeframe]||60))));
  const stats=a=>{const directionRows=a.filter(q=>typeof q.directionCorrect==='boolean'),stability=a.map(lifeBars).filter(finite);return {n:a.length,directionScored:directionRows.length,directionUnscored:a.length-directionRows.length,directionAccuracy:directionRows.length?a.filter(q=>q.directionCorrect===true).length/directionRows.length:null,targetHitRate:a.length?a.filter(q=>q.state==='HIT'||q.priceHitAt).length/a.length:null,timeHitRate:a.length?a.filter(q=>q.state==='HIT').length/a.length:null,invalidationRate:a.length?a.filter(q=>q.state==='INVALIDATED').length/a.length:null,recountRate:a.length?a.filter(q=>q.recounted).length/a.length:null,countStabilityAvgBars:stability.length?mean(stability):null,countStabilityMedianBars:stability.length?median(stability):null};};
  const group=k=>{const map={};for(const q of terminal){const v=k(q);(map[v]||(map[v]=[])).push(q);}return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,stats(v)]));};
  const forecasts=Object.values(this.contexts).flatMap(s=>s.forecasts||[]),t10=a=>{const wins=a.filter(f=>f.result==='correct').length,losses=a.filter(f=>f.result==='incorrect').length;return {n:a.length,wins,losses,equal:a.filter(f=>f.result==='equal').length,missing:a.filter(f=>f.result==='missing').length,pending:a.filter(f=>f.result==='pending').length,scored:wins+losses,winRate:wins+losses?wins/(wins+losses):null};};
  const t10Group=fn=>{const m={};for(const f of forecasts){const k=String(fn(f)??'UNKNOWN');(m[k]||(m[k]=[])).push(f);}return Object.fromEntries(Object.entries(m).map(([k,a])=>[k,t10(a)]));};
  return {schema:'elliott-evaluation-2',experimental:true,scoresAreProbabilities:false,metricPolicy:'Projection metrics measure box lifecycle only, not trade win probability. T+10 outcomes freeze direction/price/time at creation, are never cancelled by recount, and accept the first observed price within 3 seconds of expiry. Missing observations are excluded, never guessed.',
   fixed10m:{horizonMs:HORIZON_MS,maxSettlementDelayMs:MAX_SETTLEMENT_DELAY_MS,overall:t10(forecasts),byKind:t10Group(f=>f.kind),byScore:t10Group(f=>f.kind+':'+Math.floor(f.score/10)*10),byRegime:t10Group(f=>f.regime),bySymbol:t10Group(f=>f.symbol),byTimeframe:t10Group(f=>f.timeframe)},
   totalPredictions:rows.length,completed:stats(terminal),scoreBuckets:group(q=>q.score<50?'0–49':q.score>=90?'90–100':Math.floor(q.score/10)*10+'–'+(Math.floor(q.score/10)*10+9)),
   byWave:group(q=>q.wave),byPattern:group(q=>q.pattern),byDegree:group(q=>q.degree),byRegime:group(q=>q.regime),byTimeframe:group(q=>q.timeframe),bySymbol:group(q=>q.symbol),
   contexts:Object.fromEntries(Object.entries(this.contexts).map(([k,s])=>{const stability=(s.stabilityBars||[]).filter(finite);return [k,{coverage:s.samples?s.known/s.samples:null,unknownRate:s.samples?1-s.known/s.samples:null,recountRate:s.samples?s.recounts/s.samples:null,countStabilityAvgBars:stability.length?mean(stability):null,countStabilityMedianBars:stability.length?median(stability):null,samples:s.samples,evictedAudit:s.evictedAudit,evictedForecasts:s.evictedForecasts||0}];}))};
 }
}

const ENTRY_DEFAULTS=Object.freeze({profile:'balanced-r8-t10',enabled:true,oppositionScore:78,supportScore:58,minTargetRoomAtr:.18,hardTargetRoomAtr:.08,entryMinQuality:70,waveEarlyMinEvidence:.06});
function elliottEntryDecision(elliott,direction,price,atrValue,mode='WAIT',cfg={}){
 const c={...ENTRY_DEFAULTS,...(cfg||{})},d=direction==='HIGH'?1:direction==='LOW'?-1:Math.sign(Number(direction)||0);
 if(!c.enabled)return {allow:true,state:'OFF',entryScoreDelta:0,reason:'Elliott entry influence ปิดอยู่'};
 const working=elliott?.degrees?.Working||{},p=working.preferred||elliott?.preferred||null,unknown=working.unknown??elliott?.unknown??null;
 const neutral=reason=>({allow:true,state:'NEUTRAL',entryScoreDelta:0,reason,unknown,structurallyUsable:false});
 if(!d)return neutral('ยังไม่มีทิศของจุดเข้าให้ Elliott ประเมิน');
 if(!p)return neutral('ยังไม่มีโครงสร้างคลื่นที่ยืนยัน ใช้หลักฐานจุดเข้าเดิม');
 const frozen=elliott?.box?.candidateKey===p.key&&elliott.box.currentState===p.state?elliott.box:null;
 const n=frozen||p.next||{},nextDirection=Math.sign(Number(n.direction)||0),score=Number(p.score)||0;
 const consensus=working.consensus||elliott?.consensus||directionConsensus(working.candidates||[p]);
 const countClear=!unknown&&p.state==='CONFIRMED_COMPLETE';
 const consensusClear=unknown==='MULTIPLE_COUNTS_CLOSE'&&p.state==='CONFIRMED_COMPLETE'&&consensus.count>=2&&consensus.agreement===1&&consensus.direction===nextDirection;
 const structurallyUsable=countClear||consensusClear;
 const invalid=finite(n.invalidation)&&finite(n.invalidationDirection)&&n.invalidationDirection*(price-n.invalidation)<0;
 const seconds=elliott?.seconds||60,horizonBars=HORIZON_MS/(seconds*1000);
 const fromBars=finite(n.startTime)&&finite(elliott?.timestamp)?Math.max(0,(n.startTime-elliott.timestamp/1000)/seconds):n.fromBars;
 const timeRelevant=finite(fromBars)&&fromBars<=horizonBars&&(!finite(n.endTime)||!finite(elliott?.timestamp)||n.endTime>=elliott.timestamp/1000);
 const triggerReached=!!n.trigger&&finite(n.trigger.price)&&Math.sign(n.trigger.direction)===nextDirection&&nextDirection*(price-n.trigger.price)>=0&&(elliott?.entryTriggerConfirmed!==false);
 const aligned=nextDirection===d,opposed=!!nextDirection&&!aligned;
 let targetRoomAtr=null;
 if(aligned&&n.projectionReady&&finite(price)&&finite(atrValue)&&atrValue>0){const edge=d>0?n.targetLow:n.targetHigh;if(finite(edge))targetRoomAtr=d*(edge-price)/atrValue;}
 const common={candidateId:p.id||null,candidateKey:p.key||null,pattern:p.pattern||null,currentWave:p.currentWave||null,waveState:p.state||null,nextWave:n.wave||null,nextDirection,score,unknown,targetRoomAtr,mode,countClear,consensus:clone(consensus),structurallyUsable,timeRelevant,triggerReached,horizonBars};
 if(invalid)return {...common,...neutral('สมมติฐานคลื่นเดิมเสียแล้ว ใช้โครงสร้างจุดเข้าและรอ Count ใหม่'),discardedCount:true};
 if(frozen&&['EXPIRED','INVALIDATED'].includes(frozen.state))return {...common,...neutral('การคาดการณ์คลื่นเดิมจบแล้ว รอโครงสร้างใหม่')};
 if(!structurallyUsable)return {...common,...neutral('ชื่อหรือโครงสร้างคลื่นยังไม่ยืนยัน จึงไม่เปลี่ยนจุดเข้า')};
 if(!timeRelevant)return {...common,...neutral('เป้าคลื่นยังอยู่นอกช่วง 10 นาที ใช้เป็นบริบทระยะใหญ่')};
 const nearTarget=finite(targetRoomAtr)&&targetRoomAtr<c.minTargetRoomAtr;
 if(opposed&&countClear&&triggerReached&&score>=c.oppositionScore&&n.projectionReady)return {...common,allow:false,state:'BLOCK',entryScoreDelta:-100,reason:'คลื่นยืนยันและผ่าน Trigger ฝั่งสวนในช่วง 10 นาที'};
 if(aligned&&countClear&&triggerReached&&score>=c.oppositionScore&&n.projectionReady&&finite(targetRoomAtr)&&targetRoomAtr<c.hardTargetRoomAtr)return {...common,allow:false,state:'BLOCK',entryScoreDelta:-100,reason:'เป้าคลื่นอยู่ใกล้มากแล้ว จึงรอจุดเข้าใหม่'};
 if(aligned&&triggerReached&&score>=c.supportScore&&!nearTarget){
  const delta=n.projectionReady?(consensusClear?8:12):4;
  return {...common,allow:true,state:n.projectionReady?'BOOST':'PASS',entryScoreDelta:delta,allowWaveEarly:!!n.projectionReady,reason:consensusClear?'หลาย Count ที่ยืนยันเห็นทิศเดียวกันและผ่าน Trigger':'คลื่นยืนยันหนุนจุดเข้าและผ่าน Trigger ในช่วง 10 นาที'};
 }
 if(aligned&&nearTarget)return {...common,allow:true,state:'CAUTION',entryScoreDelta:-4,reason:'เริ่มเข้าใกล้เป้าคลื่น จึงลดคะแนนจุดเข้า'};
 if(opposed&&triggerReached)return {...common,allow:true,state:'CAUTION',entryScoreDelta:-8,reason:'คลื่นเอนสวนจุดเข้า แต่ยังไม่ครบเงื่อนไขบล็อก'};
 return {...common,allow:true,state:'NEUTRAL',entryScoreDelta:0,reason:'รอ Trigger ของคลื่น ใช้หลักฐานจุดเข้าเดิม'};
}
function adjustEntryBundle(bundle,decision,thesis,cfg=ENTRY_DEFAULTS){
 if(decision.state==='OFF'||!bundle.gates)return bundle;
 const g=bundle.gates,weight=q=>q.state==='PASS'?20:q.state==='DEVELOPING'?10:0;
 const baseQuality=clip(weight(g.structure)+weight(g.location)+weight(g.behavior)+weight(g.micro)+clip(bundle.alignedEvidence*15,0,10),0,100);
 const quality=clip(baseQuality+(decision.entryScoreDelta||0),0,100),impacts=decision.structurallyUsable&&decision.entryScoreDelta!==0;
 const continuation=['trend_continuation','breakout_continuation','pullback_reclaim'].includes(thesis.playbook);
 const source=g.micro.source,coverageOK=source==='historical_1m_adapter'||g.micro.coverage>=(core?.CFG?.v3FlowCoverageSec||20);
 const waveEarly=!!(decision.allowWaveEarly&&continuation&&bundle.hardReady&&!bundle.softBlocked&&!bundle.policyBlocked&&coverageOK&&bundle.alignedEvidence>=cfg.waveEarlyMinEvidence&&quality>=cfg.entryMinQuality);
 const waveWaiting=thesis.v33WaveEntry&&!decision.allowWaveEarly;
 const eligible=(bundle.entryReady||waveEarly)&&!waveWaiting,qualityOK=!impacts||quality>=cfg.entryMinQuality;
 const entryReady=eligible&&decision.allow&&qualityOK&&!bundle.policyBlocked;
 const reason=!decision.allow?decision.reason:waveWaiting?'แผนคลื่น 3.3 ยังรอ Trigger ที่ยืนได้และเป้าในช่วง 10 นาที':eligible&&!qualityOK?'คะแนนจุดเข้า 3.3 ยังไม่ถึงเกณฑ์หลังประเมินคลื่น':null;
 return {...bundle,entryReady,earlyReady:entryReady&&!bundle.fullReady,mode:entryReady?(bundle.fullReady?'FULL':waveEarly&&!bundle.entryReady?'WAVE_EARLY':'EARLY'):'WAIT',
  state:entryReady?'READY':reason?'BLOCKED':bundle.state,softBlocked:bundle.softBlocked||!!reason,
  blocked:reason?[...bundle.blocked,reason]:bundle.blocked,v33:{decision:clone(decision),baseQuality,quality,threshold:impacts?cfg.entryMinQuality:null,waveEarly,baseEntryReady:bundle.entryReady},elliottBlocked:!!reason};
}

const api={Observer,DEFAULTS,ENTRY_DEFAULTS,HORIZON_MS,MAX_SETTLEMENT_DELAY_MS,feed,degreePivots,hardRules,correctionGeometry,subdivision,makeCandidate,generate,selectCounts,directionConsensus,resolveUnknown,project,previousCountStatus,updateBox,settleForecast,candidateIdentity,elliottEntryDecision,adjustEntryBundle,STATE_TH,UNKNOWN_TH};root.ArisV33=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
const core=root.EventSignalV6;
if(core?.CFG?.version==='ARIS-3.3.0'&&root.ArisV33BaseEngine){
 const Base=core.Engine;
 core.Engine=class V33Engine extends Base{
  constructor(saved={}){
   super(saved);this.elliott=new Observer(saved.v33Memory||{});
   const cfg=saved.v33EntryConfig||{};
   this.v33EntryCfg=cfg.profile===ENTRY_DEFAULTS.profile?{...ENTRY_DEFAULTS,...cfg}:{...ENTRY_DEFAULTS,enabled:cfg.enabled??(core.CFG.elliottInfluence!==false)};
   this.v33EntryMemory=clone(saved.v33EntryMemory||{blocks:{}});this.v33Frame=null;
  }
  serialize(){return {...super.serialize(),v33Memory:this.elliott.serialize(),v33EntryConfig:clone(this.v33EntryCfg),v33EntryMemory:clone(this.v33EntryMemory)};}
  v33PrepareThesis(x,preview,thesis,reader){
   try{
    const observed=this.elliott.observe(x,preview);this.v33Frame={observed,ts:x.ts};
    if(!this.v33EntryCfg.enabled||thesis.playbook)return thesis;
    const p=observed.preferred,dir=p?.next?.direction;
    const decision=elliottEntryDecision(observed,dir,x.price,preview.f?.atr,'WAVE_EARLY',this.v33EntryCfg);
    const waveResume=['3','5','C'].includes(p?.next?.wave),marketOK=['TRANSITION','PULLBACK','TREND_ADVANCE'].includes(reader.state);
    if(decision.allowWaveEarly&&waveResume&&marketOK&&(reader.dir===dir||reader.structure.structuralDir===dir))return {...thesis,
     code:'V33_WAVE_RESUMPTION',d:dir,playbook:'trend_continuation',v33WaveEntry:true,why:'คลื่นพักตัวที่ยืนยันแล้วเริ่มกลับไปต่อ Wave '+p.next.wave,
     trigger:'ผ่าน Trigger คลื่น พร้อมโครงสร้างและตำแหน่งเข้า',invalidation:'จุดอ้างอิงคลื่นหรือโครงสร้างเสีย',nextPlan:'ติดตามแรงไปต่อภายใน 10 นาที'};
   }catch(error){this.v33Frame={error:String(error.message),ts:x.ts};}
   return thesis;
  }
  v33ApplyEntryBundle(x,preview,bundle,thesis,reader,ep){
   if(!this.v33EntryCfg.enabled)return bundle;
   try{
    const observed=this.v33Frame?.observed;if(!observed)return bundle;
    observed.timestamp=x.ts;
    const p=observed.degrees?.Working?.preferred||observed.preferred,n=observed.box?.candidateKey===p?.key?observed.box:p?.next,t=n?.trigger;
    const triggerKey=p?.key+'|'+t?.direction+'|'+t?.price,held=this.v33EntryMemory.trigger;
    if(t&&t.direction*(x.price-t.price)>=0){
     const continuous=held?.key===triggerKey&&x.ts>held.lastTs&&x.ts-held.lastTs<=5000;
     const h=continuous?{...held,ticks:held.ticks+1,lastTs:x.ts}:{key:triggerKey,since:x.ts,lastTs:x.ts,ticks:1};
     this.v33EntryMemory.trigger=h;observed.entryTriggerConfirmed=x.ts-h.since>=(t.holdMs||350)&&h.ticks>=(t.minTicks||2);
    }else{this.v33EntryMemory.trigger=null;observed.entryTriggerConfirmed=false;}
    const decision=elliottEntryDecision(observed,thesis.d,x.price,preview.f?.atr,bundle.mode,this.v33EntryCfg);
    const adjusted=adjustEntryBundle(bundle,decision,thesis,this.v33EntryCfg);this.v33Frame.decision=decision;this.v33Frame.bundle=adjusted;
    const blockKey=ep.id+'|'+ep.legKey+'|'+thesis.d,blockStore=this.v33EntryMemory.blocks||(this.v33EntryMemory.blocks={});
    if(bundle.entryReady&&!adjusted.entryReady&&!(ep.issuedLegKeys||[]).includes(ep.legKey)&&finite(this.v33PrevTs)&&x.ts-this.v33PrevTs<=5000){
     const key=ep.id+'|'+ep.legKey+'|'+thesis.d,blocks=this.v33EntryMemory.blocks||(this.v33EntryMemory.blocks={});
     let item=blocks[key];if(!item)item=blocks[key]={since:x.ts,ticks:0,logged:false};if(item.lastTs==null||x.ts-item.lastTs>5000||!item.qualified){item.since=x.ts;item.ticks=0;}item.ticks++;item.lastTs=x.ts;item.qualified=true;
     const needed=bundle.fullReady?(core.CFG.v3ConfirmMs||500):(core.CFG.v3EarlyConfirmMs||650);
     if(!item.logged&&item.ticks>=2&&x.ts-item.since>=needed){
      item.logged=true;this.log('v33_elliott_entry_blocked',x.ts,{episodeId:ep.id,legKey:ep.legKey,direction:dirLabelForEntry(thesis.d),elliott:clone(decision),entryQuality:adjusted.v33?.quality,signalIssued:false});
      this.elliott.addForecast(x,{id:'BLOCKED:'+key,kind:'BLOCKED',direction:thesis.d,candidateId:decision.candidateId,score:adjusted.v33?.quality||0,regime:reader.state,decision:clone(decision)});
     }
     const keys=Object.keys(blocks);if(keys.length>300)delete blocks[keys[0]];
    }else if(blockStore[blockKey]){blockStore[blockKey].qualified=false;blockStore[blockKey].ticks=0;}
    return adjusted;
   }catch(error){this.v33Frame.error=String(error.message);return bundle;}
  }
  step(x){
   this.v33Frame=null;this.v33PrevTs=this.previous?.ts;const view=super.step(x);
   try{
    const observed=this.v33Frame?.observed||this.elliott.observe(x,view);view.v33Elliott=observed;
    const direction=view.signal?.direction||view.gate?.direction||view.watch?.direction||null;
    const decision=this.v33Frame?.decision||elliottEntryDecision(observed,direction,x.price,view.f?.atr,'WAIT',this.v33EntryCfg);
    const quality=this.v33Frame?.bundle?.v33;
    view.v33EntryContext={...decision,baseQuality:quality?.baseQuality??null,entryQuality:quality?.quality??null,qualityThreshold:quality?.threshold??null};
    if(view.gate&&this.v33EntryCfg.enabled)view.gate={...view.gate,elliott:clone(view.v33EntryContext),metrics:{...view.gate.metrics,v33ElliottGate:decision.state,v33EntryQuality:quality?.quality??null,v33EntryQualityDelta:decision.entryScoreDelta||0,v33ElliottNextWave:decision.nextWave||null,v33EntryQualityThreshold:quality?.threshold??null}};
    if(view.signal){
     const sig=view.signal,e=sig.dataset?.entry;
     if(e)e.v33Elliott=clone({schema:observed.schema,symbol:observed.symbol,timeframe:observed.timeframe,timestamp:observed.timestamp,unknown:observed.unknown,preferred:observed.preferred,alternate:observed.alternate,consensus:observed.consensus,box:observed.box,experimental:true});
     if(e)e.v33EntryContext=clone(view.v33EntryContext);
     if(this.v33EntryCfg.enabled){
      sig.decisionPolicy='aris_v33_pre_entry_t10';if(e)e.decisionPolicy=sig.decisionPolicy;
      if(e?.v3Thesis?.code==='V33_WAVE_RESUMPTION'){sig.type='v33_wave_resumption';e.setupType=sig.type;}
      sig.reason='ARIS 3.3 · '+decision.reason+(quality?' · คุณภาพจุดเข้า '+Math.round(quality.quality)+'/100':'')+' · '+String(sig.reason||'').replace(/^ARIS V3\.1 · /,'');
      view.reason=sig.reason;this.log('v33_elliott_entry_pass',x.ts,{signalId:sig.id,direction:sig.direction,elliott:clone(view.v33EntryContext)});
     }
     this.elliott.addForecast(x,{id:'ENTRY:'+sig.id,kind:'ENTRY',direction:sig.direction==='HIGH'?1:-1,score:quality?.quality??observed.preferred?.score??0,regime:view.v3Story?.state||'UNKNOWN',decision:clone(view.v33EntryContext),signalId:sig.id});
    }
    if(this.v33Frame?.error)view.v33Elliott.error=this.v33Frame.error;
    this.lastView=view;
   }catch(error){view.v33Elliott={unknown:'UNRESOLVED',error:String(error.message),degrees:{}};view.v33EntryContext={allow:true,state:'NEUTRAL',entryScoreDelta:0,reason:'ส่วนวิเคราะห์คลื่นขัดข้อง ใช้จุดเข้าฐานเดิม'};}
   return view;
  }
 };
}
function dirLabelForEntry(d){return d>0?'HIGH':'LOW';}
})(typeof globalThis!=='undefined'?globalThis:window);
