(function(root){
'use strict';

const core=root.EventSignalV6;
if(!core||!core.Engine)return;
const {Engine,CFG,features,zones,marketPhase}=core;
if(CFG.version!=='ARIS-2.0.0')return;

const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const median=a=>{if(!a.length)return 0;const q=[...a].sort((a,b)=>a-b),m=Math.floor(q.length/2);return q.length%2?q[m]:(q[m-1]+q[m])/2;};
const dirLabel=d=>d>0?'HIGH':d<0?'LOW':'BALANCED';
const fibRatios=[.236,.382,.5,.618,.786];

function stateLabel(s){
 return ({
  FRESH_RANGE:'Fresh Sideway',BALANCED_RANGE:'Sideway สมดุล',RANGE_COMPRESSION:'Sideway กำลังบีบ',
  EDGE_PRESSURE:'Sideway กดขอบ',CHOP:'Swing / Chop',BREAKOUT_ATTEMPT:'Breakout Attempt',BREAKOUT_RETEST:'Breakout Retest',
  BREAKOUT_ACCEPTED:'Breakout Accepted',FALSE_BREAK:'False Break',EXPANSION:'Expansion',
  IMPULSE:'Impulse',TREND:'Trend',PULLBACK:'Pullback',MATURE_TREND:'Mature Trend',
  EXHAUSTION:'Exhaustion',REVERSAL_WATCH:'Reversal Watch',REVERSAL_CONFIRMED:'Reversal Confirmed',
  CONFLICT:'Conflict / No Edge',TRANSITION:'Transition'
 })[s]||s;
}
function playbookLabel(p){
 return ({
  range_edge_fade:'Range Edge Fade',range_rotation:'Range Rotation',compression_breakout:'Compression Breakout',
  edge_pressure_breakout:'Edge Pressure Breakout',breakout_follow:'Immediate Breakout Follow',
  breakout_micro_pullback:'Breakout Micro Pullback',breakout_retest:'Breakout Retest',
  failed_break_reversal:'Failed Break Reversal',breakout_trap_reversal:'Breakout Trap Reversal',
  trend_pullback:'Trend Pullback',fib_pullback:'Fib Pullback',trend_reacceleration:'Trend Re-Acceleration',
  continuation:'Trend Continuation',mature_recovery:'Mature Trend Recovery',
  exhaustion_reversal:'Exhaustion Reversal',reversal_follow:'Reversal Follow',
  shock_follow:'Shock Follow',shock_failure:'Shock Failure',observe_conflict:'Observe / No Edge'
 })[p]||p;
}
function typeForPlaybook(p){
 return ({
  range_edge_fade:'v2_range_edge',range_rotation:'v2_range_rotation',compression_breakout:'v2_compression_breakout',
  edge_pressure_breakout:'v2_edge_breakout',breakout_follow:'v2_breakout_follow',
  breakout_micro_pullback:'v2_breakout_pullback',breakout_retest:'v2_breakout_retest',
  failed_break_reversal:'v2_failed_break',breakout_trap_reversal:'v2_breakout_trap',
  trend_pullback:'v2_trend_pullback',fib_pullback:'v2_fib_pullback',trend_reacceleration:'v2_reacceleration',
  continuation:'v2_continuation',mature_recovery:'v2_mature_recovery',
  exhaustion_reversal:'v2_exhaustion_reversal',reversal_follow:'v2_reversal_follow',
  shock_follow:'v2_shock_follow',shock_failure:'v2_shock_failure'
 })[p]||'v2_observer_entry';
}
function slope(a){
 if(a.length<2)return 0;
 const n=a.length,sx=(n-1)*n/2,sy=a.reduce((s,v)=>s+v,0),sxx=(n-1)*n*(2*n-1)/6,sxy=a.reduce((s,v,i)=>s+i*v,0);
 const d=n*sxx-sx*sx;return d?(n*sxy-sx*sy)/d:0;
}
function clusters(rows,pred){
 let n=0,on=false;
 for(const r of rows){const h=!!pred(r);if(h&&!on)n++;on=h;}
 return n;
}
function liveMetrics(f,x,d){
 const p=x.price,a=Math.max(f.atr,1e-9),q=x.current||x.bars?.at(-1)||f.b.at(-1);
 const o=q?.open??p,h=Math.max(q?.high??p,p),l=Math.min(q?.low??p,p),r=Math.max(h-l,1e-9),cl=clip((p-l)/r,0,1);
 return {body:d*(p-o)/a,rangeAtr:r/a,closeLoc:cl,alignedClose:d>0?cl:1-cl,
  upper:(h-Math.max(o,p))/r,lower:(Math.min(o,p)-l)/r,dir:Math.sign(p-o)};
}
function roomAtr(z,p,d,a){
 const q=(z||[]).filter(v=>d*(v.price-p)>0).map(v=>d*(v.price-p)/Math.max(a,1e-9)).filter(Number.isFinite).sort((a,b)=>a-b);
 return q.length?q[0]:Infinity;
}
function rangeBehavior(f,x){
 const a=Math.max(f.atr,1e-9),b=f.b.slice(-Math.max(20,CFG.v2RangeLookback||20)),r=b.slice(-Math.min(b.length,CFG.v2RangeWindowBars||12));
 const base=r,hi=Math.max(...base.map(q=>q.high)),lo=Math.min(...base.map(q=>q.low)),w=Math.max(hi-lo,a*.1),pos=clip((x.price-lo)/w,0,1),near=(CFG.v2RangeEdgeAtr||.14)*a;
 const upTouches=clusters(base,q=>q.high>=hi-near),loTouches=clusters(base,q=>q.low<=lo+near);
 function reject(side){
  const out=[];
  for(let i=0;i<base.length;i++){
   const q=base[i],hit=side>0?q.high>=hi-near:q.low<=lo+near;if(!hit)continue;
   const n=base.slice(i+1,i+4);if(!n.length)continue;
   const m=side>0?(hi-Math.min(...n.map(v=>v.close))):(Math.max(...n.map(v=>v.close))-lo);
   out.push(Math.max(0,m/a));
  }
  return out;
 }
 const ur=reject(1),lr=reject(-1),weak=q=>q.length>=3&&avg(q.slice(-2))<avg(q.slice(0,2))*.70;
 const last6=base.slice(-6),lowSlope=slope(last6.map(q=>q.low))/a,highSlope=slope(last6.map(q=>q.high))/a;
 const recent=base.slice(-5),prior=base.slice(-12,-5);
 const rw=Math.max(...recent.map(q=>q.high))-Math.min(...recent.map(q=>q.low)),pw=prior.length?Math.max(...prior.map(q=>q.high))-Math.min(...prior.map(q=>q.low)):w;
 const ratio=pw>0?rw/pw:1,compression=ratio<=(CFG.v2CompressionRatio||.72);
 const balanced=f.eff<=(CFG.v2RangeBalancedEff||.38)&&f.sideCrosses>=2&&upTouches>=1&&loTouches>=1&&w/a<=5;
 const lastLower=[...base].map((q,i)=>q.low<=lo+near?i:-1).filter(i=>i>=0).at(-1);
 const lastUpper=[...base].map((q,i)=>q.high>=hi-near?i:-1).filter(i=>i>=0).at(-1);
 let upRotationReach=null,downRotationReach=null;
 if(Number.isInteger(lastLower)&&base.length-lastLower>=3){const after=base.slice(lastLower+1);if(after.length)upRotationReach=clip((Math.max(...after.map(q=>q.high))-lo)/w,0,1.5);}
 if(Number.isInteger(lastUpper)&&base.length-lastUpper>=3){const after=base.slice(lastUpper+1);if(after.length)downRotationReach=clip((hi-Math.min(...after.map(q=>q.low)))/w,0,1.5);}
 const bullRotationFailure=Number.isFinite(upRotationReach)&&upRotationReach<.55,bearRotationFailure=Number.isFinite(downRotationReach)&&downRotationReach<.55;
 const rotationSamples=[upRotationReach,downRotationReach].filter(Number.isFinite),rotationQuality=rotationSamples.length?clip(avg(rotationSamples),0,1.5):1;
 const upperWeakening=weak(ur),lowerWeakening=weak(lr);
 const upperPressure=(pos>=.62?1:0)+(lowSlope>=.035?1:0)+(compression?1:0)+(upperWeakening||upTouches>=3?1:0)+(bearRotationFailure?1:0);
 const lowerPressure=(pos<=.38?1:0)+(highSlope<=-.035?1:0)+(compression?1:0)+(lowerWeakening||loTouches>=3?1:0)+(bullRotationFailure?1:0);
 const pressure=upperPressure>=3&&upperPressure>lowerPressure?1:lowerPressure>=3&&lowerPressure>upperPressure?-1:0;
 const bu=(x.price-hi)/a,bd=(lo-x.price)/a,breakDir=bu>=(CFG.v2BreakBuffer||.04)?1:bd>=(CFG.v2BreakBuffer||.04)?-1:0;
 let fakeDir=0,fakeLevel=null,fakeAgeBars=null,fakeIndex=-1;
 for(let i=Math.max(6,b.length-8);i<b.length;i++){
  const p=b.slice(Math.max(0,i-10),i);if(p.length<6)continue;
  const ph=Math.max(...p.map(q=>q.high)),pl=Math.min(...p.map(q=>q.low)),q=b[i];
  if(q.high>ph+a*(CFG.v2FakeBreakBuffer||.05)&&q.close<=ph){fakeDir=1;fakeLevel=ph;fakeIndex=i;}
  if(q.low<pl-a*(CFG.v2FakeBreakBuffer||.05)&&q.close>=pl){fakeDir=-1;fakeLevel=pl;fakeIndex=i;}
 }
 if(fakeDir&&fakeIndex>=0){
  fakeAgeBars=b.length-1-fakeIndex;
  const reaccepted=fakeDir>0?x.price>fakeLevel+a*.08:x.price<fakeLevel-a*.08;
  if(fakeAgeBars>(CFG.v2FakeBreakMemoryBars||4)||reaccepted){fakeDir=0;fakeLevel=null;fakeAgeBars=null;}
 }
 let age=0;for(let i=b.length-1;i>=0;i--){const q=b[i];if(q.close<lo-a*.08||q.close>hi+a*.08)break;age++;}
 return {hi,lo,widthAtr:w/a,pos,upperTouches:upTouches,lowerTouches:loTouches,upperRejectAvg:avg(ur.slice(-2)),lowerRejectAvg:avg(lr.slice(-2)),
  upperWeakening,lowerWeakening,lowSlope,highSlope,compression,compressionRatio:ratio,balanced,edgePressureDir:pressure,upperPressure,lowerPressure,
  upRotationReach,downRotationReach,bullRotationFailure,bearRotationFailure,rotationQuality,
  breakDir,breakProgress:breakDir>0?bu:breakDir<0?bd:0,fakeDir,fakeLevel,fakeAgeBars,ageBars:age};
}
function fibContext(f,x,z){
 const a=Math.max(f.atr,1e-9),b=f.b.slice(-60),p=[];
 for(let i=2;i<b.length-2;i++){
  const q=b[i],l=b.slice(i-2,i),r=b.slice(i+1,i+3);
  if(l.every(v=>q.high>v.high)&&r.every(v=>q.high>=v.high))p.push({i,type:'H',price:q.high,time:q.time});
  if(l.every(v=>q.low<v.low)&&r.every(v=>q.low<=v.low))p.push({i,type:'L',price:q.low,time:q.time});
 }
 p.sort((m,n)=>m.i-n.i);const alternating=[];for(const q of p){const last=alternating.at(-1);if(last?.i===q.i)continue;if(last?.type===q.type){if(q.type==='H'?q.price>last.price:q.price<last.price)alternating[alternating.length-1]=q;}else alternating.push(q);}p.splice(0,p.length,...alternating);let leg=null;
 for(let i=1;i<p.length;i++){const a0=p[i-1],a1=p[i];if(a0.type===a1.type)continue;const m=Math.abs(a1.price-a0.price);if(m<f.atr*.8)continue;leg={start:a0,end:a1,d:a1.price>a0.price?1:-1,move:m};}
 if(!leg||b.length-1-leg.end.i>(CFG.v2FibMaxAgeBars||25))return {valid:false};
 const d=leg.d,start=leg.start.price,end=leg.end.price,m=leg.move,retr=d>0?(end-x.price)/m:(x.price-end)/m,ext=d*(x.price-start)/m;
 const levels=fibRatios.map(r=>({ratio:r,price:end-d*m*r}));let nearest=null;
 for(const q of levels){const dist=Math.abs(x.price-q.price)/a;if(!nearest||dist<nearest.distanceAtr)nearest={...q,distanceAtr:dist};}
 const extensions=[1.272,1.618].map(r=>({ratio:r,price:start+d*m*r,distanceAtr:Math.abs(x.price-(start+d*m*r))/a}));
 const nearestExtension=[...extensions].sort((u,v)=>u.distanceAtr-v.distanceAtr)[0];
 const confluence=nearest&&nearest.distanceAtr<=(CFG.v2FibZoneAtr||.15)&&(z||[]).some(q=>Math.abs(q.price-nearest.price)/a<=(CFG.v2FibZoneAtr||.15));
 const retraceZone=retr<.20?'ตื้นกว่า 23.6%':retr<=.382?'23.6–38.2%':retr<=.50?'38.2–50%':retr<=.618?'50–61.8%':retr<=.786?'61.8–78.6%':'ลึกเกิน 78.6%';
 const extensionZone=ext<1?'ยังไม่พ้น swing เดิม':ext<1.272?'100–127.2%':ext<1.618?'127.2–161.8%':'เกิน 161.8%';
 return {valid:true,d,start,end,startTime:leg.start.time,endTime:leg.end.time,confirmedAt:b[leg.end.i+2]?.time,moveAtr:m/a,retracement:retr,extension:ext,levels,nearest,extensions,nearestExtension,confluence,
  healthy:retr>=.236&&retr<=.618,deep:retr>.618&&retr<=.786,retraceZone,extensionZone};
}
function candleBehavior(f,x){
 const a=Math.max(f.atr,1e-9),b=f.b.slice(-10),last=b.at(-1),prev=b.at(-2),live=x.current||x.bars?.at(-1)||last,p=x.price;
 const met=q=>{const h=Math.max(q.high??p,q.close??p),l=Math.min(q.low??p,q.close??p),r=Math.max(h-l,1e-9),c=q.close??p,o=q.open??p,body=c-o;return {d:Math.sign(body),body:Math.abs(body)/a,range:r/a,bodyRatio:Math.abs(body)/r,closeLoc:clip((c-l)/r,0,1),upper:(h-Math.max(o,c))/r,lower:(Math.min(o,c)-l)/r};};
 const ms=b.slice(-5).map(met),lm=met({...live,close:p,high:Math.max(live?.high??p,p),low:Math.min(live?.low??p,p)});
 const pressure=clip(avg(ms.map(m=>m.d*(m.body*.5+.25*(m.d>0?m.closeLoc:1-m.closeLoc)+.15))),-1,1);
 const highCloses=ms.filter(m=>m.closeLoc>=.72).length,lowCloses=ms.filter(m=>m.closeLoc<=.28).length,oneSided=highCloses>=3?1:lowCloses>=3?-1:0;
 const recent=ms.slice(-3).map(m=>m.range),prior=ms.slice(0,Math.max(1,ms.length-3)).map(m=>m.range),contraction=prior.length&&avg(recent)<avg(prior)*.70;
 const recentBody=avg(ms.slice(-3).map(m=>m.body)),priorBody=avg(ms.slice(0,Math.max(1,ms.length-3)).map(m=>m.body)),bodyDecay=priorBody>0&&recentBody<priorBody*.72;
 let engulf=0;if(last&&prev){if(last.close>last.open&&prev.close<prev.open&&last.close>=prev.open&&last.open<=prev.close)engulf=1;else if(last.close<last.open&&prev.close>prev.open&&last.open>=prev.close&&last.close<=prev.open)engulf=-1;}
 const rejection=lm.lower>=.38&&lm.closeLoc>=.55?1:lm.upper>=.38&&lm.closeLoc<=.45?-1:0;
 const shock=(lm.range>=.80||lm.body>=.60)&&Math.max(f.relVolume||0,x.phase?.liveVolumePace||0)>=1.25;
 const inside=!!(last&&prev&&last.high<=prev.high&&last.low>=prev.low),doji=!!(last&&met(last).bodyRatio<=.12&&met(last).range>=.16);
 const marubozu=lm.bodyRatio>=.78&&lm.upper<=.12&&lm.lower<=.12?lm.d:0;
 const threeBarDir=ms.slice(-3).length===3&&ms.slice(-3).every(m=>m.d===ms.at(-1).d)&&ms.at(-1).d?ms.at(-1).d:0;
 let failedExpansion=0,postShockHold=0;
 if(last){const pm=met(last),mid=(last.open+last.close)/2;if(pm.body>=.55||pm.range>=.80){if(pm.d>0){if(p<mid)failedExpansion=-1;else if(p>=last.close-(last.close-last.open)*.35)postShockHold=1;}else if(pm.d<0){if(p>mid)failedExpansion=1;else if(p<=last.close+(last.open-last.close)*.35)postShockHold=-1;}}}
 const tags=[];if(doji)tags.push('Doji / hesitation');if(inside)tags.push('Inside Bar / compression');if(engulf)tags.push(engulf>0?'Bullish Engulfing':'Bearish Engulfing');if(rejection)tags.push(rejection>0?'Lower-wick rejection':'Upper-wick rejection');if(marubozu)tags.push(marubozu>0?'Bullish conviction candle':'Bearish conviction candle');if(threeBarDir)tags.push(threeBarDir>0?'3-bar buying pressure':'3-bar selling pressure');if(shock)tags.push('Shock / unusual expansion');if(failedExpansion)tags.push('Failed expansion');if(postShockHold)tags.push('Post-shock hold');
 return {pressure,oneSided,contraction,bodyDecay,engulf,rejection,shock,inside,doji,marubozu,threeBarDir,postShockHold,failedExpansion,liveDir:lm.d,liveBodyAtr:lm.body,liveRangeAtr:lm.range,liveCloseLoc:lm.closeLoc,upperWick:lm.upper,lowerWick:lm.lower,tags};
}
function higherContext(bars,p){
 const b=(bars||[]).filter(q=>q.closed).slice(-50);if(b.length<12)return {available:false};
 const c=b.map(q=>q.close),ema=n=>{let y=c[0];for(const v of c)y+=2/(n+1)*(v-y);return y;},e8=ema(8),e21=ema(21);
 const tr=b.slice(1).map((q,i)=>Math.max(q.high-q.low,Math.abs(q.high-b[i].close),Math.abs(q.low-b[i].close))),a=Math.max(avg(tr.slice(-14)),p*.00008,1e-9);
 const trend=clip((e8-e21)/a,-1,1),hi=Math.max(...b.slice(-20).map(q=>q.high)),lo=Math.min(...b.slice(-20).map(q=>q.low));
 return {available:true,trend,dir:Math.abs(trend)>=.12?Math.sign(trend):0,high:hi,low:lo,roomUp:(hi-p)/a,roomDown:(p-lo)/a,atr:a};
}
function zoneContext(f,x,z){
 const a=Math.max(f.atr,1e-9),p=x.price;
 const nearest=kind=>(z||[]).filter(q=>q.kind===kind).map(q=>({...q,distanceAtr:Math.abs(q.price-p)/a})).sort((a,b)=>a.distanceAtr-b.distanceAtr)[0]||null;
 const support=nearest('support'),resistance=nearest('resistance');
 return {support,resistance,nearSupport:!!support&&support.distanceAtr<=(CFG.v2ZoneNearAtr||.25),nearResistance:!!resistance&&resistance.distanceAtr<=(CFG.v2ZoneNearAtr||.25)};
}
function remember(engine,x,f,state,key){
 const m=engine.v2Memory||(engine.v2Memory={snapshots:[],history:[],lastKey:null,lastLog:0,lastBreakout:null});
 if(!m.snapshots.length||m.snapshots.at(-1).ts!==x.ts)m.snapshots.push({ts:x.ts,price:x.price,state,flow:x.flow||0});
 if(m.snapshots.length>(CFG.v2SnapshotMemory||240))m.snapshots.splice(0,m.snapshots.length-(CFG.v2SnapshotMemory||240));
 while(m.snapshots.length&&x.ts-m.snapshots[0].ts>(CFG.v2StateMemoryMs||3600000))m.snapshots.shift();
 if(key&&key!==m.lastKey&&x.ts-m.lastLog>(CFG.v2StoryLogCooldownMs||10000)){m.history.push({ts:x.ts,state,key,price:x.price});if(m.history.length>120)m.history.shift();engine.log('v2_story_shift',x.ts,{state,storyKey:key,price:x.price});m.lastKey=key;m.lastLog=x.ts;}
 const old=[...m.snapshots].reverse().find(q=>x.ts-q.ts>=5000),speed=old?((x.price-old.price)/Math.max(f.atr,1e-9))/Math.max(1,(x.ts-old.ts)/1000):0;
 return {memory:m,speed};
}
function observe(engine,f,x,z,regime,phase){
 const a=Math.max(f.atr,1e-9),r=rangeBehavior(f,x),fib=fibContext(f,x,z),c=candleBehavior(f,x),zone=zoneContext(f,x,z),h5=higherContext(x.five,x.price),h15=higherContext(x.fifteen,x.price);
 const flow=x.flow||0,book=x.bookValid?(x.book||0):0,trendDir=Math.abs(f.trend)>=.14?Math.sign(f.trend):Math.abs(f.mom)>=.18?Math.sign(f.mom):phase?.dir||0;
 const breakD=r.breakDir,breakFlow=breakD?breakD*flow:0,breakClose=breakD>0?c.liveCloseLoc:breakD<0?1-c.liveCloseLoc:.5;
 const accepted=!!breakD&&r.breakProgress>=(CFG.v2BreakAccepted||.08)&&breakFlow>=.025&&breakClose>=.62&&(c.liveRangeAtr>=.42||Math.max(f.relVolume||0,phase?.liveVolumePace||0)>=1.15);
 let retestDir=0,retestProgress=null;
 const oldBreak=engine.v2BreakoutMemory;
 if(oldBreak&&x.ts-oldBreak.startedAt>(CFG.v2BreakoutMemoryMs||180000))engine.v2BreakoutMemory=null;
 if(accepted){
  const level=breakD>0?r.hi:r.lo,bm=engine.v2BreakoutMemory;engine.v2BreakoutMemory=bm&&bm.d===breakD&&Math.abs(bm.level-level)/a<.20?{...bm,lastSeen:x.ts}:{d:breakD,level,startedAt:x.ts,lastSeen:x.ts};
 }else if(engine.v2BreakoutMemory){
  const bm=engine.v2BreakoutMemory;bm.lastSeen=x.ts;retestProgress=bm.d*(x.price-bm.level)/a;
  if(retestProgress<-(CFG.v2BreakFailAtr||.08)){r.fakeDir=bm.d;r.fakeLevel=bm.level;engine.v2BreakoutMemory=null;}
  else if(!breakD&&retestProgress>=-(CFG.v2RetestBelowAtr||.04)&&retestProgress<=(CFG.v2RetestMaxAtr||.16))retestDir=bm.d;
 }
 let state='TRANSITION',stateDir=trendDir,conf=50;
 const pullback=fib.valid&&trendDir&&fib.d===trendDir&&fib.retracement>=.18&&fib.retracement<=.82;
 if(r.fakeDir){state='FALSE_BREAK';stateDir=-r.fakeDir;conf=76;}
 else if(retestDir){state='BREAKOUT_RETEST';stateDir=retestDir;conf=74;}
 else if(breakD){state=accepted?'BREAKOUT_ACCEPTED':'BREAKOUT_ATTEMPT';stateDir=breakD;conf=accepted?84:67;}
 else if(phase?.phase==='REVERSAL'){state='REVERSAL_CONFIRMED';stateDir=phase.dir||-trendDir;conf=82;}
 else if(phase?.phase==='EXHAUSTION'){state='EXHAUSTION';stateDir=trendDir;conf=72;}
 else if(r.balanced&&r.compression){state='RANGE_COMPRESSION';stateDir=r.edgePressureDir||trendDir;conf=76;}
 else if(r.balanced&&r.edgePressureDir){state='EDGE_PRESSURE';stateDir=r.edgePressureDir;conf=78;}
 else if(r.balanced){state=(r.ageBars>=10&&r.upperTouches>=2&&r.lowerTouches>=2)?'BALANCED_RANGE':'FRESH_RANGE';stateDir=0;conf=state==='BALANCED_RANGE'?80:64;}
 else if(pullback&&['TREND','TRANSITION'].includes(phase?.phase||'')){state='PULLBACK';stateDir=trendDir;conf=72;}
 else if(phase?.phase==='MATURE_IMPULSE'){state='MATURE_TREND';stateDir=phase.dir||trendDir;conf=74;}
 else if(phase?.phase==='IMPULSE'){state='IMPULSE';stateDir=phase.dir||trendDir;conf=80;}
 else if(phase?.phase==='TREND'||regime.mode==='TREND'){state='TREND';stateDir=phase?.dir||trendDir;conf=74;}
 else if(f.sideCrosses>=3&&f.eff<.34&&f.rangeWidthAtr>=2.2){state='CHOP';stateDir=0;conf=70;}

 let edge=clip(f.trend,-1,1)*.20+clip((f.mom||0)/1.2,-1,1)*.15+clip((f.momAccel||0)/.9,-1,1)*.10+clip(flow,-1,1)*.18+clip(book,-1,1)*.04+r.edgePressureDir*.11+c.pressure*.08+c.oneSided*.05+c.engulf*.03+c.rejection*.03;
 if(breakD)edge+=breakD*(accepted?.18:.10);if(r.fakeDir)edge-=r.fakeDir*.18;if(fib.valid&&fib.healthy&&trendDir===fib.d)edge+=fib.d*.05;if(h5.available)edge+=h5.trend*.025;if(h15.available)edge+=h15.trend*.025;
 if(r.balanced&&!r.edgePressureDir){if(r.pos<=.24)edge+=.22;else if(r.pos>=.76)edge-=.22;}
 edge=clip(edge,-1,1);
 const high=Math.round(clip(50+edge*42,10,90)),low=100-high,evidenceDir=Math.abs(high-low)>=8?(high>low?1:-1):0;
 if(!stateDir)stateDir=evidenceDir;

 const rem=remember(engine,x,f,state,state+'|'+stateDir+'|'+r.edgePressureDir+'|'+r.fakeDir),speed=rem.speed;
 const breakLevel=breakD>0?r.hi:r.lo;
 let lastBreakout=rem.memory.lastBreakout;
 if(accepted){
  if(!lastBreakout||lastBreakout.d!==breakD||Math.abs(lastBreakout.level-breakLevel)/a>.18||x.ts-lastBreakout.startedAt>180000){
   lastBreakout=rem.memory.lastBreakout={startedAt:x.ts,lastSeen:x.ts,d:breakD,level:breakLevel,extreme:x.price,pivot:x.price,maxRetreat:0,rebound:0};
  }else{
   lastBreakout.lastSeen=x.ts;
   const extended=breakD>0?x.price>lastBreakout.extreme:x.price<lastBreakout.extreme;
   if(extended){lastBreakout.extreme=x.price;lastBreakout.pivot=x.price;lastBreakout.maxRetreat=0;lastBreakout.rebound=0;}
   else{
    const retreat=breakD*(lastBreakout.extreme-x.price)/a;
    if(retreat>lastBreakout.maxRetreat){lastBreakout.maxRetreat=retreat;lastBreakout.pivot=x.price;}
    lastBreakout.rebound=breakD*(x.price-lastBreakout.pivot)/a;
   }
  }
 }else if(lastBreakout&&x.ts-lastBreakout.startedAt<=180000){
  const bd=lastBreakout.d,extended=bd>0?x.price>lastBreakout.extreme:x.price<lastBreakout.extreme;
  if(extended){lastBreakout.extreme=x.price;lastBreakout.pivot=x.price;lastBreakout.maxRetreat=0;lastBreakout.rebound=0;}
  else{
   const retreat=bd*(lastBreakout.extreme-x.price)/a;
   if(retreat>lastBreakout.maxRetreat){lastBreakout.maxRetreat=retreat;lastBreakout.pivot=x.price;}
   lastBreakout.rebound=bd*(x.price-lastBreakout.pivot)/a;
  }
  lastBreakout.lastSeen=x.ts;
 }
 const breakoutRetest=lastBreakout&&lastBreakout.maxRetreat>=.07&&lastBreakout.d*(lastBreakout.extreme-lastBreakout.level)/a>=.12&&x.ts-lastBreakout.startedAt>=500&&x.ts-lastBreakout.startedAt<=180000&&Math.abs(x.price-lastBreakout.level)/a<=.14&&lastBreakout.d*(x.price-lastBreakout.level)/a>=-.06?{...lastBreakout,distanceAtr:Math.abs(x.price-lastBreakout.level)/a}:null;
 const reaccel=!!trendDir&&trendDir*(f.momAccel||0)>=.10&&trendDir*flow>=.025&&(c.oneSided===trendDir||c.liveDir===trendDir);
 const shockFailure=c.failedExpansion||0;
 const failedContinuation=!!trendDir&&c.failedExpansion===-trendDir&&trendDir*(f.momAccel||0)<-.08;
 const speedReady=rem.memory.snapshots.some(q=>x.ts-q.ts>=5000);const absorption=speedReady?(flow>=.10&&Math.abs(speed)<.012?-1:flow<=-.10&&Math.abs(speed)<.012?1:0):0;
 const ext=stateDir?stateDir*(x.price-f.ema21)/a:0;
 const majorAgainst5=trendDir>0?(h5.available&&h5.roomUp>=0&&h5.roomUp<=.30):trendDir<0?(h5.available&&h5.roomDown>=0&&h5.roomDown<=.30):false;
 const majorAgainst15=trendDir>0?(h15.available&&h15.roomUp>=0&&h15.roomUp<=.35):trendDir<0?(h15.available&&h15.roomDown>=0&&h15.roomDown<=.35):false;
 let change=0;if((zone.nearResistance&&trendDir>0)||(zone.nearSupport&&trendDir<0))change++;if(majorAgainst5)change++;if(majorAgainst15)change++;if(Math.abs(ext)>=1.6)change++;if((trendDir>0&&c.rejection<0)||(trendDir<0&&c.rejection>0))change++;if(c.bodyDecay&&trendDir*(f.momAccel||0)<=0)change++;if(trendDir*(f.momAccel||0)<-.15)change++;if(trendDir*flow<-.04)change++;if(fib.valid&&fib.extension>=1.272)change++;
 const trendChangeRisk=change>=4?'สูง':change>=2?'กลาง':'ต่ำ';
 if(['TREND','MATURE_TREND'].includes(state)&&trendChangeRisk==='สูง'&&trendDir){state='REVERSAL_WATCH';stateDir=-trendDir;conf=Math.max(conf,78);}
 else if(['TREND','PULLBACK','TRANSITION'].includes(state)&&failedContinuation){state='REVERSAL_WATCH';stateDir=-trendDir;conf=Math.max(conf,72);}
 else if(state==='TRANSITION'&&shockFailure){state='EXPANSION';stateDir=shockFailure;conf=72;}
 else if(state==='TRANSITION'&&c.shock&&c.liveDir){state='EXPANSION';stateDir=c.liveDir;conf=74;}

 let play='observe_conflict',d=stateDir||evidenceDir,trigger='รอ behavior ชัดขึ้น',invalid='ยังไม่มี thesis หลัก',next='ประเมิน State ใหม่เมื่อพฤติกรรมเปลี่ยน';
 if(breakoutRetest&&state!=='FALSE_BREAK'){
  d=breakoutRetest.d;play='breakout_retest';trigger='retest จุด breakout แล้วต้องรับอยู่ + flow กลับตาม';invalid='หลุดกลับเข้ากรอบลึกและยืนไม่ได้';next='ถ้า retest fail → Failed Break / Trap Reversal';
 }else if(shockFailure&&state!=='FALSE_BREAK'){
  d=shockFailure;play='shock_failure';trigger='แท่ง expansion ถูกกินกลับ + flow สนับสนุนฝั่งสวน';invalid='กลับไปยืนตามทิศ shock เดิม';next='ถ้า fail → กลับ Trend/Range เดิม';
 }else if(reaccel&&['PULLBACK','TREND'].includes(state)){
  d=trendDir;play='trend_reacceleration';trigger='momentum + flow กลับมาเร่งหลังพัก และ micro structure ยังอยู่';invalid='แรงเร่งดับและหลุดฐานพัก';next='ถ้า fail → Pullback ต่อ / Reversal Watch';
 }else if(['BALANCED_RANGE','FRESH_RANGE'].includes(state)){
  if(r.pos<=.24){play='range_edge_fade';d=1;trigger='รอ rejection + flow กลับจากขอบล่าง';invalid='หลุดขอบล่างและเกิด acceptance';next='Breakout LOW';}
  else if(r.pos>=.76){play='range_edge_fade';d=-1;trigger='รอ rejection + flow กลับจากขอบบน';invalid='ทะลุขอบบนและเกิด acceptance';next='Breakout HIGH';}
  else{play='range_rotation';d=0;trigger='รอราคาเข้าใกล้ขอบ ไม่เล่นกลางกรอบ';invalid='เกิด edge pressure / breakout';next='Compression Breakout';}
 }else if(state==='RANGE_COMPRESSION'){d=r.edgePressureDir||evidenceDir;play='compression_breakout';trigger='รอพ้นขอบ + flow + displacement';invalid='แทงออกแล้วกลับเข้ากรอบเร็ว';next='Failed Break Reversal';}
 else if(state==='EDGE_PRESSURE'){d=r.edgePressureDir;play='edge_pressure_breakout';trigger='รอขอบที่ถูกกดแตกและเกิด acceptance';invalid='เกิด rejection ใหญ่กลับกลางกรอบ';next='Range Rotation / Failed Break';}
 else if(state==='BREAKOUT_ATTEMPT'){d=breakD;play='breakout_follow';trigger='รอ acceptance หรือ micro pullback ที่รับอยู่';invalid='กลับเข้ากรอบเร็ว';next='Failed Break Reversal';}
 else if(state==='BREAKOUT_ACCEPTED'){d=breakD;play=r.breakProgress<=.28?'breakout_follow':'breakout_micro_pullback';trigger=r.breakProgress<=.28?'Follow ถ้ายังสด':'รอย่อสั้น / retest แล้ว reclaim';invalid='กลับเข้ากรอบและ flow พลิก';next='Failed Break / Trap Reversal';}
 else if(state==='BREAKOUT_RETEST'){d=retestDir;play='breakout_retest';trigger='แตะ breakout level แล้วรับอยู่ + flow กลับตามทิศเดิม';invalid='หลุดกลับเข้ากรอบเกิน '+(CFG.v2BreakFailAtr||.08).toFixed(2)+' ATR';next='ถ้า retest fail → Failed Break Reversal';}
 else if(state==='FALSE_BREAK'){d=-r.fakeDir;play=c.failedExpansion===d?'breakout_trap_reversal':'failed_break_reversal';trigger='กลับเข้า range + flow/rejection หนุนฝั่งสวน';invalid='กลับไปยืนฝั่ง breakout เดิม';next='Breakout Follow ฝั่งเดิม';}
 else if(state==='PULLBACK'){d=trendDir;play=fib.valid&&fib.nearest?.distanceAtr<=(CFG.v2FibZoneAtr||.15)?'fib_pullback':'trend_pullback';trigger='รอแรงย่อหยุด + reclaim / flow กลับตามเทรนด์';invalid='หลุด Fib 78.6% พร้อมเสีย swing structure';next='Transition / Reversal Watch';}
 else if(state==='IMPULSE'){d=stateDir;play=c.shock?'shock_follow':'continuation';trigger='Follow เมื่อ flow ยังหนุนและ extension ไม่แพง';invalid='Expansion ถูกกินกลับและ flow พลิก';next='Shock Failure / Pullback';}
 else if(state==='MATURE_TREND'){d=stateDir;play='mature_recovery';trigger='ไม่ไล่ รอ pullback / retest ใหม่';invalid='structure แตก + flow พลิก';next='Exhaustion / Reversal Watch';}
 else if(state==='EXHAUSTION'){d=-stateDir;play='exhaustion_reversal';trigger='รอ flow พลิก + rejection + micro structure break';invalid='ขาเดิมทำ new extreme พร้อม flow';next='Trend Continuation';}
 else if(state==='REVERSAL_WATCH'){d=stateDir;play='exhaustion_reversal';trigger='ถึงแนวสำคัญแล้ว · รอ rejection + flow พลิก + micro structure break ก่อนสวน';invalid='trend เดิมทะลุแนวและทำ new extreme พร้อม flow';next='ถ้าไม่กลับ → Trend Continuation / Breakout Follow';}
 else if(state==='EXPANSION'){d=stateDir;play=shockFailure?'shock_failure':'shock_follow';trigger=shockFailure?'รอการกินกลับยืนยัน + flow ฝั่งสวน':'รอ follow-through ของ shock โดยไม่ถูกกินกลับ';invalid=shockFailure?'กลับไปยืนตาม shock เดิม':'ถูกกินกลับเกินครึ่งแท่ง expansion';next=shockFailure?'Return to prior state':'Micro Pullback / Shock Failure';}
 else if(state==='REVERSAL_CONFIRMED'){d=stateDir;play='reversal_follow';trigger='ตาม reversal หลัง micro pullback / reclaim';invalid='reversal fail และ reclaim trend เดิม';next='Failed Reversal → Continuation';}
 else if(state==='TREND'){d=stateDir;play='trend_pullback';trigger='รอย่อที่ยังรักษา structure แล้ว flow กลับ';invalid='เสีย swing structure + flow สวน';next='Reversal Watch';}
 else if(state==='CHOP'){d=0;play='observe_conflict';trigger='รอกรอบหรือทิศชัด ไม่ไล่กลาง swing';invalid='เกิด compression / directional expansion';next='Range หรือ Breakout playbook';}

 const supports=[],warnings=[];
 if(r.balanced)supports.push('Sideway ตอบสนองทั้งขอบบนและขอบล่าง · rotation '+Math.round(r.rotationQuality*100)+'% ของกรอบ');
 if(r.compression)supports.push('กรอบกำลังบีบ · width ล่าสุด '+r.compressionRatio.toFixed(2)+' เท่าช่วงก่อน');
 if(r.edgePressureDir)supports.push('ราคาเกาะ'+(r.edgePressureDir>0?'ขอบบน':'ขอบล่าง')+' · มี edge pressure');
 if(r.bullRotationFailure)warnings.push('เด้งจากขอบล่างแล้วไปไม่ถึงอีกฝั่ง · bullish rotation กำลัง fail');
 if(r.bearRotationFailure)warnings.push('ลงจากขอบบนแล้วไปไม่ถึงอีกฝั่ง · bearish rotation กำลัง fail');
 if(r.upperWeakening)warnings.push('แรง reject ขอบบนอ่อนลง · resistance อาจกำลังถูกกัด');
 if(r.lowerWeakening)warnings.push('แรงเด้งขอบล่างอ่อนลง · support อาจกำลังถูกกัด');
 if(r.fakeDir)warnings.push('พบ fake break ฝั่ง'+(r.fakeDir>0?'บน':'ล่าง')+' · เฝ้าวิ่งสวนอีกฝั่ง');
 if(c.shock)supports.push('เกิด shock / expansion · ตรวจ post-shock follow-through');
 if(c.postShockHold)supports.push('Post-shock hold ยังรักษาครึ่งแท่งแรงไว้ได้ · เฝ้า continuation');
 if(c.inside)supports.push('Inside Bar · volatility กำลังหด');
 if(c.doji)warnings.push('Doji / hesitation · รอแท่งถัดไปเลือกทิศ');
 if(c.marubozu)supports.push((c.marubozu>0?'Bullish':'Bearish')+' conviction candle');
 if(c.threeBarDir)supports.push('3-bar '+(c.threeBarDir>0?'buying':'selling')+' pressure ต่อเนื่อง');
 if(c.contraction)supports.push('ช่วงแท่งหดตัวต่อเนื่อง · compression เพิ่ม');
 if(c.bodyDecay&&trendDir)warnings.push('Body ของแท่งตามเทรนด์เล็กลง · momentum decay เริ่มชัด');
 if(c.oneSided)supports.push('หลายแท่งปิดใกล้'+(c.oneSided>0?'high':'low')+' · pressure ต่อเนื่อง');
 if(c.failedExpansion)warnings.push('Expansion ก่อนหน้าถูกกินกลับ · เสี่ยง trap');
 if(failedContinuation)warnings.push('Failed Continuation · ขาเดิมพยายามไปต่อแต่ถูกกินกลับและ momentum ชะลอ');
 if(r.balanced&&r.rotationQuality<.55)warnings.push('Range rotation ไปไม่สุดกรอบ · สมดุล Sideway เริ่มเปลี่ยน');
 if(absorption)warnings.push((absorption>0?'แรงขาย':'แรงซื้อ')+'มากแต่ราคาไปต่อได้น้อย · possible absorption');
 if(Math.abs(speed)>=.055)supports.push('ความเร็วราคาเปลี่ยนชัด · behavior shift');
 if(fib.valid&&fib.nearest&&fib.nearest.distanceAtr<=(CFG.v2FibZoneAtr||.15))supports.push('ใกล้ Fib '+(fib.nearest.ratio*100).toFixed(1)+'%'+(fib.confluence?' + zone confluence':''));
 if(fib.valid&&fib.extension>=1.618)warnings.push('เกิน Fib extension 161.8% · ขาเดิมยืดมาก เปิด exhaustion / reversal watch เข้มขึ้น');
 else if(fib.valid&&fib.extension>=1.272)warnings.push('เกิน Fib extension 127.2% · เพิ่ม exhaustion watch');
 if(zone.nearResistance)warnings.push('ใกล้ resistance '+zone.resistance.distanceAtr.toFixed(2)+' ATR');
 if(zone.nearSupport)warnings.push('ใกล้ support '+zone.support.distanceAtr.toFixed(2)+' ATR');
 if(h5.available&&d>0&&h5.roomUp>=0&&h5.roomUp<=.25)warnings.push('5m resistance อยู่ใกล้ทาง HIGH');
 if(h5.available&&d<0&&h5.roomDown>=0&&h5.roomDown<=.25)warnings.push('5m support อยู่ใกล้ทาง LOW');
 if(h15.available&&d>0&&h15.roomUp>=0&&h15.roomUp<=.30)warnings.push('15m resistance อยู่ใกล้ทาง HIGH');
 if(h15.available&&d<0&&h15.roomDown>=0&&h15.roomDown<=.30)warnings.push('15m support อยู่ใกล้ทาง LOW');
 if(trendChangeRisk!=='ต่ำ')warnings.push('Trend-change watch '+trendChangeRisk+' · รอ rejection + flow + structure');

 const side=r.balanced?'Sideway '+r.ageBars+' แท่ง · แตะบน '+r.upperTouches+' / ล่าง '+r.lowerTouches+' · ราคา '+Math.round(r.pos*100)+'% ของกรอบ':'';
 const fs=fib.valid?'Fib leg '+(fib.d>0?'ขึ้น ':'ลง ')+fib.moveAtr.toFixed(2)+' ATR · retrace '+Math.max(0,fib.retracement*100).toFixed(1)+'% ('+fib.retraceZone+') · extension '+fib.extensionZone:'Fib: ยังไม่มี impulse leg ที่ยืนยัน';
 const summary=[stateLabel(state),side,fs].filter(Boolean).join(' · ');
 const primary={direction:dirLabel(d||evidenceDir),evidence:d>0?high:d<0?low:Math.max(high,low),thesis:playbookLabel(play)};
 const altD=d?-d:evidenceDir?-evidenceDir:0,alternative={direction:dirLabel(altD),evidence:altD>0?high:altD<0?low:50,thesis:state.includes('BREAKOUT')?'Failed Break / Return to Range':state.includes('RANGE')?'Breakout from Range':'Opposite structure shift'};
 const conflict=(evidenceDir&&d&&evidenceDir!==d)||(!d&&Math.abs(high-low)<10);if(conflict&&['TRANSITION','CHOP'].includes(state)){state='CONFLICT';conf=Math.max(conf,66);}
 return {schema:'aris-v2-story-v1',state,stateLabel:stateLabel(state),stateConfidence:conf,stateDirection:stateDir,highEvidence:high,lowEvidence:low,evidenceDirection:evidenceDir,
  primary,alternative,playbook:play,playbookLabel:playbookLabel(play),playDirection:d,trigger,invalidation:invalid,nextPlan:next,summary,
  supports:[...new Set(supports)].slice(0,6),warnings:[...new Set(warnings)].slice(0,6),range:r,fib,candle:c,zone,higher:{m5:h5,m15:h15},flow,book,speedAtrPerSec:speed,absorption,trendChangeRisk,breakoutRetest,breakoutMemory:lastBreakout?{...lastBreakout}:null,reacceleration:reaccel,shockFailure,
  zones:z,metrics:{trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,extensionAtr:ext,relativeVolume:f.relVolume,liveVolumePace:phase?.liveVolumePace||0}};
}
// Scores describe evidence. Hard gates must pass independently of the score.
function setupFamily(play){
 if(['compression_breakout','edge_pressure_breakout','breakout_follow','breakout_micro_pullback','breakout_retest'].includes(play))return 'breakout';
 if(['trend_pullback','fib_pullback','trend_reacceleration','mature_recovery'].includes(play))return 'pullback';
 if(['failed_break_reversal','breakout_trap_reversal'].includes(play))return 'failed_break';
 return play;
}
function entryOpportunity(f,x,s){
 const a=Math.max(f.atr,1e-9),p=x.price,d=s.playDirection,c=s.candle,r=s.range,fib=s.fib,flow=d*(x.flow||0),ext=d*(p-f.ema21)/a;
 if(!d||['observe_conflict','range_rotation'].includes(s.playbook))return null;
 const checks=[],reasons=[];let score=42,level=p,progress=0,mode=s.playbook;
 const check=(code,ok,label)=>checks.push({code,passed:!!ok,label});
 const add=(ok,n,label)=>{if(ok){score+=n;reasons.push(label);}};
 const evidence=d>0?s.highEvidence:s.lowEvidence;
 const reversal=['exhaustion_reversal','reversal_follow','failed_break_reversal','breakout_trap_reversal','shock_failure'].includes(s.playbook);
 const minFlow=reversal?(CFG.v2ReverseFlow||.04):(CFG.v2MinFlow||.02);
 check('flow',flow>=minFlow,'รอ flow ตามทิศ ≥ '+minFlow.toFixed(2));
 check('coverage',(x.coverage||0)>=(CFG.v2FlowCoverageSec||12),'รอข้อมูล flow ต่อเนื่อง '+(CFG.v2FlowCoverageSec||12)+' วินาที');
 const opposing=(s.zones||[]).filter(q=>q.kind===(d>0?'resistance':'support'));
 const room=roomAtr(opposing,p,d,a);
 check('room',room>=(CFG.v2MinRoomAtr||.12),'พื้นที่ถึงแนวขวางอย่างน้อย '+(CFG.v2MinRoomAtr||.12)+' ATR');
 add(evidence>=60,8,'น้ำหนักตลาดหนุน');add(flow>=minFlow,8,'flow หนุน');add(flow>=.06,4,'flow หนุนแรง');
 add(c.oneSided===d||c.pressure*d>=.18,6,'ลำดับแท่งหนุน');add(c.rejection===d,5,'rejection หนุน');add(c.engulf===d,4,'engulf หนุน');
 add(s.higher.m5.available&&(!s.higher.m5.dir||s.higher.m5.dir===d),3,'5m ไม่ขวาง');add(s.higher.m15.available&&(!s.higher.m15.dir||s.higher.m15.dir===d),2,'15m ไม่ขวาง');
 const micro=f.b.slice(-3),microLevel=d>0?Math.max(...micro.map(q=>q.high)):Math.min(...micro.map(q=>q.low));
 const microBreak=d*(p-microLevel)/a>=(CFG.v2MicroBreakAtr||.02);
 const reaction=c.rejection===d||c.engulf===d;
 const recent=f.b.slice(-3),live=x.current||x.bars?.at(-1),last=f.b.at(-1);
 const pullbackSeen=[...recent,...(live?[live]:[])].some(q=>d>0?q.low<=f.ema8+a*.12:q.high>=f.ema8-a*.12);
 const reclaim=c.liveDir===d&&d*(p-f.ema8)/a>=-.05&&d*(p-(last.open+last.close)/2)>=0;
 const follow=['compression_breakout','edge_pressure_breakout','breakout_follow','continuation','shock_follow','trend_reacceleration'].includes(s.playbook);
 check('extension',!follow||ext<(CFG.v2HardExtension||3.25),'ขาเดิมยืดเกินเขตตาม · รอ pullback');
 if(s.playbook==='range_edge_fade'){
  level=d>0?r.lo:r.hi;progress=d*(p-level)/a;
  check('range',r.balanced&&!r.edgePressureDir,'รอกรอบสมดุล ไม่มีแรงกดขอบ');
  check('edge',d>0?r.pos<=.24:r.pos>=.76,'รอขอบกรอบ ไม่เข้ากลางกรอบ');
  check('rejection',reaction||(c.liveDir===d&&progress>=.03),'รอ rejection แล้วเริ่มกลับเข้ากรอบ');
  add(r.balanced,10,'กรอบสมดุล');add(reaction,8,'มีแรงกลับจากขอบ');mode='Range Rejection';
 }else if(['compression_breakout','edge_pressure_breakout','breakout_follow'].includes(s.playbook)){
  level=d>0?r.hi:r.lo;progress=d*(p-level)/a;
  check('break',r.breakDir===d&&progress>=(CFG.v2BreakBuffer||.04),'รอราคาพ้นขอบจริง');
  check('chase',progress<=(CFG.v2BreakMaxChaseAtr||.36),'พ้นจุดตามแล้ว · รอ micro pullback/retest');
  check('acceptance',(d>0?c.liveCloseLoc:1-c.liveCloseLoc)>=.58,'รอแท่งรับราคาในฝั่ง breakout');
  add(r.breakDir===d,10,'พ้นขอบ');add(c.liveRangeAtr>=.42||c.shock,8,'มี expansion');mode='Breakout Follow';
 }else if(s.playbook==='breakout_micro_pullback'){
  const bm=s.breakoutMemory;level=bm?.pivot??(d>0?r.hi:r.lo);progress=bm?.rebound||0;
  check('pullback',bm&&bm.d===d&&bm.maxRetreat>=.07&&bm.maxRetreat<=.65,'รอย่อจริง 0.07–0.65 ATR');
  check('reclaim',bm&&bm.rebound>=.02&&bm.rebound<=.35&&(c.liveDir===d||reaction),'รอ reclaim จากฐานย่อใหม่');
  add(bm&&bm.maxRetreat>=.07,10,'ย่อจากปลายจริง');add(bm&&bm.rebound>=.02,9,'reclaim ฐานย่อ');mode='Breakout Micro Pullback';
 }else if(s.playbook==='breakout_retest'){
  level=s.breakoutRetest?.level??(d>0?r.hi:r.lo);progress=d*(p-level)/a;
  check('retest',!!s.breakoutRetest&&Math.abs(progress)<=.16&&progress>=-.04,'รอ retest แนวเดิมและรับอยู่');
  check('reclaim',c.liveDir===d||reaction,'รอแท่งเริ่มกลับตามหลัง retest');
  add(!!s.breakoutRetest,10,'ทดสอบแนว breakout เดิม');add(reaction||c.liveDir===d,8,'แรงกลับตาม');mode='Breakout Retest';
 }else if(['failed_break_reversal','breakout_trap_reversal','shock_failure'].includes(s.playbook)){
  level=s.playbook==='shock_failure'&&last?(last.open+last.close)/2:r.fakeLevel;
  if(!Number.isFinite(level))level=d>0?r.lo:r.hi;
  progress=d*(p-level)/a;
  check('failure',r.fakeDir===-d||c.failedExpansion===d,'รอการเบรก/expansion ล้มเหลวจริง');
  check('return',progress>=.02&&progress<=.65,'รอกลับผ่านแนวที่ fail และยังไม่ไล่ปลาย');
  check('reaction',reaction||c.liveDir===d,'รอแท่งรับทิศสวน');
  add(r.fakeDir===-d||c.failedExpansion===d,12,'failure ยืนยัน');add(progress>=.02,8,'กลับผ่านแนว');mode='Failure Reversal';
 }else if(['trend_pullback','fib_pullback','mature_recovery'].includes(s.playbook)){
  const useFib=fib.valid&&fib.d===d;
  level=useFib?fib.nearest.price:f.ema8;progress=d*(p-level)/a;
  check('trend',d*f.trend>=.10,'รอโครงสร้างเทรนด์หนุนทิศเข้า');
  check('pullback',useFib?fib.retracement>=.236&&fib.retracement<=.786:pullbackSeen,'รอย่อเข้า Fib/ฐาน EMA จริง');
  check('reclaim',reclaim,'รอราคากลับผ่านฐานและกลางแท่งล่าสุดตามทิศเทรนด์');
  check('chase',ext<=(CFG.v2MaxFollowExtension||1.75),'รอฐานใหม่ ราคายืดจาก EMA21 มากไป');
  add(useFib||pullbackSeen,8,'ย่อเข้าแนว');add(useFib&&fib.confluence,5,'Fib ซ้อนแนว');add(reclaim,8,'reclaim ยืนยัน');mode=useFib?'Fib Reclaim':'Pullback Reclaim';
 }else if(['continuation','shock_follow','trend_reacceleration'].includes(s.playbook)){
  level=last.close;progress=d*(p-level)/a;
  check('extension_follow',ext<=(CFG.v2MaxFollowExtension||1.75),'รอย่อใหม่ ไม่ตามขาที่วิ่งไกล');
  check('acceleration',c.shock||d*(f.momAccel||0)>=.08||s.reacceleration,'รอแรงเร่งกลับมา');
  check('follow_through',c.liveDir===d&&progress>=.02,'รอไปต่อผ่านราคาปิดแท่งล่าสุด');
  add(ext<=1.75,7,'ระยะตามยังไม่แพง');add(c.shock||s.reacceleration||d*(f.momAccel||0)>=.08,8,'แรงเร่งกลับมา');mode='Continuation';
 }else if(['exhaustion_reversal','reversal_follow'].includes(s.playbook)){
  level=microLevel;progress=d*(p-level)/a;
  check('reaction',reaction,'รอ rejection หรือ engulfing ฝั่งสวน');
  check('micro_structure',microBreak,'รอผ่าน high/low ของ 3 แท่งปิดล่าสุด + 0.02 ATR');
  check('chase',progress<=.45,'จุดกลับตัววิ่งไกลแล้ว · รอฐานใหม่');
  add(microBreak,15,'micro structure ถูกทำลาย');add(reaction,8,'แท่งกลับตัวยืนยัน');mode='Structure Reversal';
 }else check('supported',false,'ยังไม่มีเงื่อนไขเข้าของท่านี้');
 score=Math.round(clip(score,0,100));
 const blockers=checks.filter(q=>!q.passed),structuralReady=!blockers.length;
 return {type:typeForPlaybook(s.playbook),playbook:s.playbook,family:setupFamily(s.playbook),d,level,progress,score,checks,blockers,room,
  contextReady:score>=(CFG.v2EntryReady||58),structuralReady,ready:structuralReady&&score>=(CFG.v2EntryReady||58),enter:structuralReady&&score>=(CFG.v2EntryEnter||66),
  waiting:blockers.map(q=>q.label).join(' · ')||'หลักฐานครบ · รอยืนยันข้อมูลสด',mode,reasons,
  key:['V2',setupFamily(s.playbook),d].join(':'),reason:playbookLabel(s.playbook)+' · '+reasons.join(' + ')};
}
function compactCandles(bars,a,n=8){
 return (bars||[]).slice(-n).map(q=>{const r=Math.max(q.high-q.low,1e-9),body=q.close-q.open;return {time:q.time,open:q.open,high:q.high,low:q.low,close:q.close,volume:q.volume,closed:!!q.closed,direction:body>0?'GREEN':body<0?'RED':'DOJI',bodyAtr:Math.abs(body)/a,rangeAtr:r/a,closeLocation:clip((q.close-q.low)/r,0,1),upperWickAtr:(q.high-Math.max(q.open,q.close))/a,lowerWickAtr:(Math.min(q.open,q.close)-q.low)/a};});
}
function compactBars(bars,n=20){return (bars||[]).filter(q=>q.closed).slice(-n).map(q=>[q.time,q.open,q.high,q.low,q.close,q.volume]);}
function nearestZone(z,p,kind,a){
 const q=(z||[]).filter(v=>v.kind===kind).map(v=>({...v,distanceAtr:Math.abs(v.price-p)/a})).sort((a,b)=>a.distanceAtr-b.distanceAtr)[0];
 return q?{price:q.price,distanceAtr:q.distanceAtr,touches:q.touches||0,confirmedAt:q.confirmedAt||null}:null;
}
function sameSetup(c,o,f){
 if(!c||!o||c.family!==o.family||c.d!==o.d)return false;
 // Identity belongs to the setup episode, not an EMA/Fib tick or candle timestamp.
 return Math.abs(c.anchorLevel-o.level)<=Math.max(c.anchorAtr,f.atr)*(CFG.v2AnchorDriftAtr||.60);
}
function endCandidate(engine,ts,reason,status='cancelled'){
 const c=engine.v2Candidate;if(!c)return;
 engine.log(c.issued?'v2_episode_closed':status,ts,{id:c.id,candidateId:c.id,signalId:c.signalId||null,reason,stage:c.stage,revision:CFG.arisRevision});
 engine.v2Candidate=null;engine.v2Switch=null;
}
function invalidationReason(c,x,f){
 const a=Math.max(c.anchorAtr,f.atr),move=c.d*(x.price-c.invalidationLevel)/a;
 return move<-(CFG.v2InvalidationAtr||.08)?'ราคาเสียแนวโครงสร้างที่ล็อกไว้ '+c.invalidationLevel.toFixed(2):null;
}
function makeCandidate(engine,o,x,f,s){
 const recent=f.b.slice(-4),floor=Math.min(...recent.map(q=>q.low)),ceiling=Math.max(...recent.map(q=>q.high));
 let invalid=o.d>0?floor:ceiling;
 if(o.family==='breakout')invalid=s.breakoutMemory?.level??(o.d>0?s.range.hi:s.range.lo);
 if(o.playbook==='range_edge_fade')invalid=o.d>0?s.range.lo:s.range.hi;
 if(o.family==='failed_break')invalid=s.range.fakeLevel??o.level;
 const id='V2-C:'+engine.session+':'+x.ts+':'+o.key;
 return {...o,id,key:id,anchorLevel:o.level,anchorAtr:f.atr,invalidationLevel:invalid,startedAt:x.ts,lastSupportedAt:x.ts,startPrice:x.price,extreme:x.price,
  entryLow:o.d>0?o.level-f.atr*.04:o.level-f.atr*.35,entryHigh:o.d>0?o.level+f.atr*.35:o.level+f.atr*.04,
  evidenceSince:0,ticks:0,issued:false,logged:false,stage:'WATCH'};
}
function heldIssuedView(engine,base,x){
 const last=engine.v2LastSignal;
 if(!last||x.ts-last.entryTime>(CFG.v2IssuedDisplayMs||8000))return null;
 return {...base,event:{...last.event,issued:true,signalId:last.id},status:'issued',issuedSignal:last,
  reason:'ออก '+last.direction+' แล้วที่ '+last.entryPrice+' · เก็บผลตามเวลาเดิม · มุมมองสดยังติดตามต่อ',
  gate:{state:'ISSUED',direction:last.direction,code:'v2_issued',blocker:'บันทึกจุดเข้าแล้ว',waitingFor:['ราคาและเวลาเข้าเดิมไม่เปลี่ยนตามมุมมองสด'],metrics:{}}};
}
function v2Step(x){
 const f=features(x.bars,x.price,x.horizonBars||10);if(!f)return {status:'warmup',reason:'ARIS V2 · รอแท่งสมบูรณ์อย่างน้อย 35 แท่ง',signal:null};
 if(!x.fresh||!Number.isFinite(x.price)||!Number.isFinite(x.ts)||x.price<=0){endCandidate(this,x.ts,'ข้อมูลสดขาด · หยุดยืนยันจุดเข้า');this.previous=null;return this.lastView={f,status:'offline',signal:null,event:null,reason:'ARIS V2 · พักจน Futures สดและต่อเนื่อง'};}
 if(x.id===this.lastId)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
 if(this.previous&&x.ts<=this.previous.ts)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
 const prev=this.previous;this.lastId=x.id;this.previous={price:x.price,ts:x.ts};
 const z=zones(x.bars||[],f.atr),regime=this.trackRegime(f,x.price),phase=marketPhase(f,x,regime);x.phase=phase;
 const story=observe(this,f,x,z,regime,phase),viewPhase={...phase,v2View:{high:story.highEvidence,low:story.lowEvidence,direction:story.primary.direction,risk:story.trendChangeRisk,reason:story.summary,story}};
 // Follow-up observations are label-time data, never entry-time model inputs.
 for(const sig of this.signals){
  if(sig.version!=='ARIS-2.0.0'||sig.result!=='pending'||!sig.dataset||x.ts>=sig.expiresAt)continue;
  const entry=sig.dataset.entry||{},d=sig.direction==='HIGH'?1:-1,rows=sig.dataset.v2Followup||(sig.dataset.v2Followup=[]);
  const snap={ts:x.ts,price:x.price,state:story.state,playbook:story.playbook,alignedFlow:d*(x.flow||0),structureBroken:Number.isFinite(entry.v2InvalidationPrice)?d*(x.price-entry.v2InvalidationPrice)/Math.max(entry.atr,1e-9)<-.08:null};
  const last=rows.at(-1),changed=!last||last.state!==snap.state||last.playbook!==snap.playbook||last.structureBroken!==snap.structureBroken||(last.alignedFlow<-.04)!==(snap.alignedFlow<-.04);
  if(changed&&(!last||x.ts-last.ts>=1000)){rows.push(snap);if(rows.length>120)rows.splice(1,1);}
 }
 const base={f,z,regime:{...regime,v2State:story.state},phase:viewPhase,v2Story:story,signal:null,event:null,continuation:0,reversal:0};
 if(!prev||x.ts-prev.ts>5000){endCandidate(this,x.ts,'ข้อมูลราคาไม่ต่อเนื่อง · เริ่มยืนยันใหม่');return this.lastView={...base,status:'warming',reason:'ARIS V2 · กำลังต่อเรื่องราวจากข้อมูลสด'};}
 let opp=entryOpportunity(f,x,story),cand=this.v2Candidate;
 const invalid=cand&&invalidationReason(cand,x,f);
 if(invalid){const old={...cand};endCandidate(this,x.ts,invalid,'invalidated');return this.lastView=heldIssuedView(this,base,x)||{...base,status:'invalidated',event:old,reason:invalid+' · แผนต่อไป: '+story.nextPlan,gate:{state:'WAIT',direction:dirLabel(old.d),code:'v2_invalidated',blocker:invalid,waitingFor:[story.nextPlan],metrics:{}}};}
 if(cand&&!cand.issued&&x.ts-cand.startedAt>(CFG.v2CandidateMaxAgeMs||90000)){endCandidate(this,x.ts,'ครบอายุจังหวะเฝ้าดู · ประเมินโครงสร้างใหม่');cand=null;}
 let switching=false;
 if(cand&&opp&&!sameSetup(cand,opp,f)){
  const key=opp.key,sw=this.v2Switch;
  if(!sw||sw.key!==key)this.v2Switch={key,since:x.ts};
  switching=x.ts-this.v2Switch.since<(CFG.v2SwitchConfirmMs||800);
  if(!switching){endCandidate(this,x.ts,'พฤติกรรมใหม่ต่อเนื่อง · เปลี่ยนจาก '+cand.playbook+' เป็น '+opp.playbook);cand=null;}
 }else this.v2Switch=null;
 if(!cand&&opp){cand=this.v2Candidate=makeCandidate(this,opp,x,f,story);}
 if(cand){
  if(opp&&sameSetup(cand,opp,f)&&!switching){
   if(cand.playbook!==opp.playbook){cand.evidenceSince=0;cand.ticks=0;this.log('v2_plan_transition',x.ts,{id:cand.id,from:cand.playbook,to:opp.playbook});}
   Object.assign(cand,{playbook:opp.playbook,type:opp.type,progress:opp.progress,score:opp.score,checks:opp.checks,room:opp.room,lastSupportedAt:x.ts});
  }else{
   cand.evidenceSince=0;cand.ticks=0;
   if(!opp&&x.ts-cand.lastSupportedAt>(CFG.v2LostContextMs||2500)){endCandidate(this,x.ts,'บริบทเดิมไม่กลับมาภายในช่วงเฝ้ารอ');cand=null;}
  }
 }
 const d=cand?.d||opp?.d||story.playDirection||story.evidenceDirection||0,direction=dirLabel(d),watchScore=d>0?story.highEvidence:d<0?story.lowEvidence:Math.max(story.highEvidence,story.lowEvidence);
 const watch={direction:direction==='BALANCED'?null:direction,d,score:watchScore,state:opp?.ready&&!switching?'READY':'WATCH',reasons:[story.stateLabel,story.playbookLabel,story.trigger],reason:story.summary};
 base.watch=watch;
 if(cand&&!cand.logged){cand.logged=true;this.log('detected',x.ts,{id:cand.id,candidateId:cand.id,key:cand.key,type:cand.type,detectedAt:x.ts,direction:dirLabel(cand.d),price:x.price,level:cand.level,revision:CFG.arisRevision,candidate:{schema:'aris-v2-candidate-v2',type:cand.type,modelDirection:dirLabel(cand.d),revision:CFG.arisRevision,story,entry:opp,anchorLevel:cand.anchorLevel,invalidationLevel:cand.invalidationLevel}});}
 const held=heldIssuedView(this,base,x);if(held)return this.lastView=held;
 if(!cand||!opp||switching){return this.lastView={...base,event:cand?{...cand}:null,status:'watch',reason:switching?'ARIS V2 · พฤติกรรมใหม่เริ่มมา · รอยืนยันก่อนเปลี่ยนแผน':'ARIS V2 · '+story.summary,gate:{state:'WATCH',direction:watch.direction,code:'v2_story_watch',blocker:switching?'กำลังยืนยันแผนใหม่':story.trigger,waitingFor:[story.trigger,'ยกเลิกเมื่อ: '+story.invalidation,'แผนถัดไป: '+story.nextPlan],metrics:{evidence:watchScore}}};}
 if(cand.issued){
  if(!opp.enter){if(!cand.rearmSince)cand.rearmSince=x.ts;if(x.ts-cand.rearmSince>=1000)cand.rearmed=true;}
  else cand.rearmSince=0;
  if(opp.enter&&cand.rearmed&&x.ts-cand.issuedAt>90000){endCandidate(this,x.ts,'เกิดรอบ setup ใหม่หลังจุดเข้าเดิม');cand=this.v2Candidate=makeCandidate(this,opp,x,f,story);return this.lastView={...base,status:'watch',reason:'ARIS V2 · เริ่มติดตามรอบใหม่'};}
  return this.lastView={...base,event:{...cand},status:'issued',reason:'ARIS V2 · จุดเข้าเดิมถูกบันทึกแล้ว · รอจังหวะรอบใหม่',gate:{state:'ISSUED',direction:dirLabel(cand.d),code:'v2_already_issued',blocker:'ไม่ออกซ้ำจังหวะเดิม',waitingFor:[story.trigger],metrics:{evidence:opp.score}}};
 }
 const stage=opp.enter?'CONFIRMING':opp.ready?'READY':'WATCH';
 if(cand.stage!==stage){this.log('v2_candidate_stage',x.ts,{id:cand.id,from:cand.stage,to:stage,score:opp.score,checks:opp.checks});cand.stage=stage;}
 const metrics={evidence:opp.score,flow:opp.d*(x.flow||0),progress:opp.progress,room:Number.isFinite(opp.room)?opp.room:null,extensionAtr:opp.d*(x.price-f.ema21)/f.atr,stateConfidence:story.stateConfidence};
 if(!opp.enter){cand.evidenceSince=0;cand.ticks=0;return this.lastView={...base,event:{...cand},status:opp.ready?'confirming':'tracking',reason:'ARIS V2 · '+story.playbookLabel+' · '+opp.waiting,gate:{state:opp.ready?'READY':'WATCH',direction:dirLabel(opp.d),code:'v2_entry_evidence',blocker:opp.blockers[0]?.label||'รอคะแนนจุดเข้า',waitingFor:opp.blockers.map(q=>q.label).concat('ถ้าผิด: '+story.nextPlan),metrics}};}
 if(!cand.evidenceSince)cand.evidenceSince=x.ts;cand.ticks++;
 const confirmMs=x.expedite?200:(CFG.v2ConfirmMs||350);
 if(cand.ticks<(CFG.v2ConfirmTicks||2)||x.ts-cand.evidenceSince<confirmMs)return this.lastView={...base,event:{...cand},status:'confirming',reason:'ARIS V2 · เงื่อนไขบังคับครบ · กำลังยืนยันข้อมูลสด',gate:{state:'READY',direction:dirLabel(opp.d),code:'v2_live_confirm',blocker:'รอข้อมูลสดยืนยัน',waitingFor:['ยืนยันอย่างน้อย '+(CFG.v2ConfirmTicks||2)+' ครั้ง และ '+confirmMs+' ms'],metrics}};
 const dup=[...this.signals].reverse().find(q=>q.version===CFG.version&&x.ts-q.entryTime<90000&&q.direction===dirLabel(opp.d)&&q.dataset?.entry?.v2Family===opp.family&&Math.abs(q.entryPrice-x.price)<=f.atr*.60);
 if(dup){cand.evidenceSince=0;cand.ticks=0;return this.lastView={...base,event:{...cand},status:'tracking',reason:'ARIS V2 · รอ setup รอบใหม่ ไม่ออกซ้ำจังหวะเดิม',gate:{state:'WAIT',direction:dirLabel(opp.d),code:'v2_same_story',blocker:'เพิ่งออกไม้ในจังหวะเดียวกัน',waitingFor:[story.nextPlan],metrics}};}
 const out=dirLabel(opp.d),id='ARIS2:'+this.session+':'+x.ts+':'+cand.key,a=Math.max(f.atr,1e-9),entryLow=opp.d>0?opp.level-a*.04:opp.level-a*.35,entryHigh=opp.d>0?opp.level+a*.35:opp.level+a*.04;
 const signal={id,version:CFG.version,type:opp.type,direction:out,modelDirection:out,decisionPolicy:'aris_v2_story_playbook_entry',entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,result:'pending',lastObserved:x.ts,event:{...cand},
  features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,progress:opp.progress,regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,rangePosition:f.rangePosition,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,extensionAtr:opp.d*(x.price-f.ema21)/a,v2State:story.state,v2Playbook:story.playbook,v2Evidence:opp.score,v2StateConfidence:story.stateConfidence},
  dataset:{schema:'btc-t10-training-v2',episodeId:'ARIS2:'+this.session+':'+Math.floor(x.ts/60000),episodeSequence:1,path1m:[],context1m:[],entry:{capturedAt:x.ts,price:x.price,outputDirection:out,modelDirection:out,decisionPolicy:'aris_v2_story_playbook_entry',decisionReason:opp.reason,strategyVersion:CFG.version,setupType:opp.type,setupReason:opp.reason,level:opp.level,entryLow,entryHigh,atr:f.atr,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,phaseDir:phase.dir,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,closeLocation:f.closeLocation,liveVolumePace:phase.liveVolumePace,flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,progress:opp.progress,zones:{nearestSupport:nearestZone(z,x.price,'support',a),nearestResistance:nearestZone(z,x.price,'resistance',a)},candleSequence:compactCandles(x.bars,a,8),prior1m:compactBars(x.bars,20),arisRevision:CFG.arisRevision,v2CandidateId:cand.id,v2Family:opp.family,v2ExpediteRequested:!!x.expedite,v2ConfirmationMs:confirmMs,v2Checks:opp.checks.map(q=>({...q})),v2InvalidationPrice:cand.invalidationLevel,v2SetupKey:cand.key,v2EntryMode:opp.mode,v2EntryEvidence:opp.score,v2StructuralReady:!!opp.structuralReady,v2EntryReasons:[...opp.reasons],v2Story:story,v2State:story.state,v2StateConfidence:story.stateConfidence,v2PrimaryHypothesis:story.primary,v2AlternativeHypothesis:story.alternative,v2Playbook:story.playbook,v2Trigger:story.trigger,v2Invalidation:story.invalidation,v2NextPlan:story.nextPlan,v2Range:story.range,v2Fib:story.fib,v2CandleBehavior:story.candle,v2TrendChangeRisk:story.trendChangeRisk}},
  reason:'ARIS V2 · '+story.stateLabel+' · '+story.playbookLabel+' · '+opp.mode+' · Entry '+opp.score+'/100 · '+opp.reason};
 this.signals.push(signal);if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(q=>q.result!=='pending');if(i>=0)this.signals.splice(i,1);}
 cand.level=opp.level;cand.issued=true;cand.stage='ISSUED';cand.issuedAt=x.ts;cand.signalId=id;cand.entryLow=entryLow;cand.entryHigh=entryHigh;
 this.v2LastSignal=signal;
 this.log('issued',x.ts,{id,candidateId:cand.id,revision:CFG.arisRevision,type:opp.type,direction:out,price:x.price,v2State:story.state,v2Playbook:story.playbook,v2EntryEvidence:opp.score});
 return this.lastView={...base,event:{...cand},watch,status:'new',reason:signal.reason,signal,gate:{state:'ENTER',direction:out,code:'v2_enter',blocker:'ARIS V2 · Story + Playbook + Entry ผ่าน',waitingFor:[],metrics:{evidence:opp.score,flow:opp.d*(x.flow||0),progress:opp.progress,extensionAtr:opp.d*(x.price-f.ema21)/a,stateConfidence:story.stateConfidence}}};
}

const previousStep=Engine.prototype.step;
Engine.prototype.step=function(x){return CFG.version==='ARIS-2.0.0'?v2Step.call(this,x):previousStep.call(this,x);};


const priorFinalize=Engine.prototype.finalizeReview;
Engine.prototype.finalizeReview=function(sig){
 priorFinalize.call(this,sig);
 if(sig.version!=='ARIS-2.0.0'||!sig.dataset?.entry)return;
 const e=sig.dataset.entry,observations=sig.dataset.v2Followup||[],review=sig.dataset.review;
 const broken=observations.some(q=>q.structureBroken),flowFlip=observations.some(q=>q.alignedFlow<-.04);
 review.v2={revision:e.arisRevision,playbook:e.v2Playbook,entryChecks:e.v2Checks||[],observations:observations.length,structureBroken:broken,flowFlipped:flowFlip,states:[...new Set(observations.map(q=>q.state))],causality:'observations_only'};
 review.summary+=' · V2 '+(e.v2Playbook||sig.type)+' · '+(broken?'พบการเสียแนวโครงสร้างระหว่างไม้':'ไม่พบการเสียแนวในข้อมูลที่บันทึก')+' · '+(flowFlip?'พบ flow พลิกสวน':'ไม่พบ flow พลิกสวนในจุดที่บันทึก')+' · เป็นข้อสังเกต ไม่ใช่ข้อพิสูจน์สาเหตุ';
};

const priorReset=Engine.prototype.reset;
Engine.prototype.reset=function(reason,time){if(CFG.version==='ARIS-2.0.0'){endCandidate(this,time,reason||'รีเซ็ตข้อมูล');this.v2LastSignal=null;this.v2Switch=null;}return priorReset.call(this,reason,time);};

const previousAssess=root.ContinuousDirection?.assess;
if(root.ContinuousDirection){
 root.ContinuousDirection.assess=function(x){
  if(CFG.version!=='ARIS-2.0.0')return previousAssess?previousAssess(x):{available:false,reason:'Direction engine unavailable'};
  const f=x.features,q=x.phase?.v2View;if(!x.fresh||!f||!q)return {available:false,reason:x.reason||'ARIS V2 · กำลังสร้าง Market Story'};
  let high=Math.round(q.high),low=Math.round(q.low);
  const pref=q.story?.primary?.direction,pe=Number(q.story?.primary?.evidence);
  let direction=(['HIGH','LOW'].includes(pref)&&pe>=55)?pref:(Math.abs(high-low)<8?'BALANCED':high>low?'HIGH':'LOW');
  if(['HIGH','LOW'].includes(pref)&&pe>=55&&direction===pref){
   const conf=Math.round(clip(50+Math.abs(high-low)/2,55,90));high=pref==='HIGH'?conf:100-conf;low=100-high;
  }
  const d=direction==='HIGH'?1:direction==='LOW'?-1:0,room=d?roomAtr(x.zones||[],x.price,d,f.atr):null,extension=d?d*(x.price-f.ema21)/Math.max(f.atr,1e-9):0;
  const risk=q.risk==='สูง'?'สูง':q.risk==='กลาง'?'กลาง':'ต่ำตามเกณฑ์';
  return {available:true,high,low,direction,risk,riskScore:risk==='สูง'?4:risk==='กลาง'?2:0,referencePrice:x.price,referenceTime:x.ts,targetTime:x.ts+CFG.horizonMs,reason:'ARIS V2 · '+q.reason,parts:{marketState:q.story?.state,playbook:q.story?.playbook,flow:x.flow||0},weights:null,regime:x.regime?.v2State||x.regime?.mode||'TRANSITION',coverage:x.coverage||0,room:Number.isFinite(room)?room:null,extension,retreat:0,v2Story:q.story};
 };
}

root.ArisV2Engine={version:'ARIS-2.0.0',observe,entryOpportunity,rangeBehavior,fibContext,candleBehavior,higherContext,zoneContext,sameSetup,invalidationReason,makeCandidate,setupFamily};
})(typeof globalThis!=='undefined'?globalThis:window);
