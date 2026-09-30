/* ARIS 3.0 — Blueprint implementation
   Separate plugin. ARIS 2.0 is intentionally untouched.
   Pipeline: Market Reader -> Episode -> Structure -> Location -> Behavior -> Micro -> Thesis -> Playbook -> Entry. */
(function(root){
'use strict';
const core=root.EventSignalV6;
if(!core||!core.Engine||!core.CFG||core.CFG.version!=='ARIS-3.0.0')return;

const BaseEngine=core.Engine,{CFG,features,zones,marketPhase}=core;
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a?.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const median=a=>{if(!a?.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const sign=(v,dead=0)=>v>dead?1:v<-dead?-1:0;
const finite=Number.isFinite;
const dirLabel=d=>d>0?'HIGH':d<0?'LOW':'BALANCED';
const sideThai=d=>d>0?'ขึ้น':d<0?'ลง':'ยังไม่เลือกฝั่ง';
const fibRatios=[.236,.382,.5,.618,.786];
const gateState=(pass,developing=false)=>pass?'PASS':developing?'DEVELOPING':'BLOCK';
const unique=a=>[...new Set((a||[]).filter(Boolean))];

function ema(a,n){let x=a[0]||0;return a.map(v=>(x+=2/(n+1)*(v-x)));}
function atrBars(b,n=14){
 if(!b||b.length<2)return 0;
 const tr=[];for(let i=1;i<b.length;i++){const q=b[i],p=b[i-1].close;tr.push(Math.max(q.high-q.low,Math.abs(q.high-p),Math.abs(q.low-p)));}
 return avg(tr.slice(-n));
}
function compactBars(bars,n=24){return (bars||[]).filter(q=>q.closed).slice(-n).map(q=>[q.time,q.open,q.high,q.low,q.close,q.volume]);}
function candleMetric(q,a,p=q?.close||0){
 if(!q)return {d:0,bodyAtr:0,rangeAtr:0,closeLoc:.5,upper:.5,lower:.5,bodyRatio:0};
 const h=Math.max(q.high??p,p),l=Math.min(q.low??p,p),o=q.open??p,c=q.close??p,r=Math.max(h-l,1e-9),body=c-o;
 return {d:Math.sign(body),bodyAtr:Math.abs(body)/Math.max(a,1e-9),rangeAtr:r/Math.max(a,1e-9),closeLoc:clip((c-l)/r,0,1),
  upper:clip((h-Math.max(o,c))/r,0,1),lower:clip((Math.min(o,c)-l)/r,0,1),bodyRatio:Math.abs(body)/r,open:o,close:c,high:h,low:l};
}
function compactCandles(bars,a,n=10){
 return (bars||[]).slice(-n).map(q=>{const m=candleMetric(q,a,q.close);return {time:q.time,open:q.open,high:q.high,low:q.low,close:q.close,volume:q.volume,closed:!!q.closed,
  direction:m.d>0?'GREEN':m.d<0?'RED':'DOJI',bodyAtr:m.bodyAtr,rangeAtr:m.rangeAtr,closeLocation:m.closeLoc,upperWickRatio:m.upper,lowerWickRatio:m.lower,bodyRatio:m.bodyRatio};});
}
function nearestZone(z,p,kind,a){
 const rows=(z||[]).filter(v=>v.kind===kind&&finite(v.price)).map(v=>({...v,distanceAtr:Math.abs(v.price-p)/Math.max(a,1e-9)})).sort((u,v)=>u.distanceAtr-v.distanceAtr);
 const q=rows[0];return q?{price:q.price,distanceAtr:q.distanceAtr,touches:q.touches||0,confirmedAt:q.confirmedAt||null}:null;
}
function roomAtr(z,p,d,a){
 const q=(z||[]).filter(v=>finite(v.price)&&d*(v.price-p)>0).map(v=>d*(v.price-p)/Math.max(a,1e-9)).filter(finite).sort((u,v)=>u-v);
 return q.length?q[0]:Infinity;
}

/* ---------- Structure ---------- */
function confirmedPivots(bars,a,lookback=90){
 const b=(bars||[]).filter(q=>q.closed).slice(-lookback),raw=[];
 for(let i=2;i<b.length-2;i++){
  const q=b[i],l=b.slice(i-2,i),r=b.slice(i+1,i+3);
  if(l.every(v=>q.high>v.high)&&r.every(v=>q.high>=v.high))raw.push({i,type:'H',price:q.high,time:q.time});
  if(l.every(v=>q.low<v.low)&&r.every(v=>q.low<=v.low))raw.push({i,type:'L',price:q.low,time:q.time});
 }
 raw.sort((x,y)=>x.i-y.i);
 const piv=[];
 for(const q of raw){
  const last=piv.at(-1);
  if(last?.i===q.i)continue;
  if(last?.type===q.type){
   if(q.type==='H'?q.price>last.price:q.price<last.price)piv[piv.length-1]=q;
  }else piv.push(q);
 }
 const highs=piv.filter(q=>q.type==='H'),lows=piv.filter(q=>q.type==='L'),h1=highs.at(-1),h0=highs.at(-2),l1=lows.at(-1),l0=lows.at(-2);
 const highTag=h1&&h0?(h1.price>h0.price+a*.03?'HH':h1.price<h0.price-a*.03?'LH':'EH'):'—';
 const lowTag=l1&&l0?(l1.price>l0.price+a*.03?'HL':l1.price<l0.price-a*.03?'LL':'EL'):'—';
 let dir=0;if(highTag==='HH'&&lowTag==='HL')dir=1;else if(highTag==='LH'&&lowTag==='LL')dir=-1;
 const integrity=dir>0?'BULLISH':dir<0?'BEARISH':(highTag==='HH'||lowTag==='HL')&&(highTag==='LH'||lowTag==='LL')?'MIXED':'UNCONFIRMED';
 const lastLeg=piv.length>=2?{start:piv.at(-2),end:piv.at(-1),d:piv.at(-1).price>piv.at(-2).price?1:-1,move:Math.abs(piv.at(-1).price-piv.at(-2).price)}:null;
 return {pivots:piv,highs,lows,lastHigh:h1,prevHigh:h0,lastLow:l1,prevLow:l0,highTag,lowTag,dir,integrity,lastLeg,
  key:(dir>0?'UP':dir<0?'DN':'MX')+':'+(l1?.time||0)+':'+(h1?.time||0)};
}
function structureSnapshot(f,x){
 const a=Math.max(f.atr,1e-9),sw=confirmedPivots(f.b,a),price=x.price;
 const bullProtected=sw.lastLow?.price??f.low,bearProtected=sw.lastHigh?.price??f.high;
 const bullBroken=price<bullProtected-a*(CFG.v3SwingBreakAtr||.08),bearBroken=price>bearProtected+a*(CFG.v3SwingBreakAtr||.08);
 const reverseUp=(sw.dir<=0||sw.integrity==='MIXED')&&bearBroken;
 const reverseDown=(sw.dir>=0||sw.integrity==='MIXED')&&bullBroken;
 const trendDir=sign((f.trend||0)*.45+(f.emaSlopeAtr||0)*.30+(f.mom||0)*.25,.08);
 const alignedEfficiency=f.eff>=CFG.v3StructureEffMin;
 const structuralDir=sw.dir||trendDir;
 return {...sw,trendDir,structuralDir,alignedEfficiency,bullProtected,bearProtected,bullBroken,bearBroken,reverseUp,reverseDown,
  summary:(sw.highTag+' / '+sw.lowTag)+' · '+(sw.integrity==='BULLISH'?'โครงสร้างขึ้น':sw.integrity==='BEARISH'?'โครงสร้างลง':sw.integrity==='MIXED'?'โครงสร้างผสม':'จุดสวิงยังไม่ครบ')};
}

/* ---------- Fibonacci / HTF ---------- */
function fibContext(f,p,z=[],structure=null){
 const a=Math.max(f.atr,1e-9),b=f.b.slice(-80),sw=structure||confirmedPivots(b,a),piv=sw.pivots||[];
 let leg=null;
 for(let i=1;i<piv.length;i++){
  const s=piv[i-1],e=piv[i],m=Math.abs(e.price-s.price);
  if(s.type===e.type||m<a*.8)continue;
  leg={start:s,end:e,d:e.price>s.price?1:-1,move:m};
 }
 if(!leg)return {valid:false,reason:'ยังไม่มีขาสวิงที่ยืนยัน'};
 const endIndex=b.findIndex(q=>q.time===leg.end.time);
 if(endIndex>=0&&b.length-1-endIndex>(CFG.v3FibMaxAgeBars||25))return {valid:false,reason:'ขาสวิงสำหรับฟิโบนัชชีล่าสุดเก่าเกินไป'};
 const d=leg.d,start=leg.start.price,end=leg.end.price,m=leg.move,retr=d>0?(end-p)/m:(p-end)/m,ext=d*(p-start)/m;
 const levels=fibRatios.map(r=>({ratio:r,price:end-d*m*r}));
 let nearest=null;for(const q of levels){const distanceAtr=Math.abs(p-q.price)/a;if(!nearest||distanceAtr<nearest.distanceAtr)nearest={...q,distanceAtr};}
 const extensions=[1.272,1.618].map(r=>({ratio:r,price:start+d*m*r,distanceAtr:Math.abs(p-(start+d*m*r))/a}));
 const nearestExtension=[...extensions].sort((u,v)=>u.distanceAtr-v.distanceAtr)[0]||null;
 const confluence=!!(nearest&&nearest.distanceAtr<=(CFG.v3FibZoneAtr||.15)&&(z||[]).some(q=>Math.abs(q.price-nearest.price)/a<=(CFG.v3FibZoneAtr||.15)));
 const retraceZone=retr<.20?'ตื้นกว่า 23.6%':retr<=.382?'23.6–38.2%':retr<=.50?'38.2–50%':retr<=.618?'50–61.8%':retr<=.786?'61.8–78.6%':'ลึกเกิน 78.6%';
 const extensionZone=ext<1?'ยังไม่พ้นจุดสวิงเดิม':ext<1.272?'100–127.2%':ext<1.618?'127.2–161.8%':'เกิน 161.8%';
 return {valid:true,d,start,end,startTime:leg.start.time,endTime:leg.end.time,confirmedAt:endIndex>=0?b[endIndex+2]?.time:null,
  high:Math.max(start,end),low:Math.min(start,end),moveAtr:m/a,retracement:retr,extension:ext,levels,nearest,extensions,nearestExtension,confluence,
  healthy:retr>=.236&&retr<=.618,deep:retr>.618&&retr<=.786,retraceZone,extensionZone};
}
function higherFrame(bars,p,d){
 const b=(bars||[]).filter(q=>q.closed).slice(-80);
 if(b.length<20)return {available:false,dir:0,eff:0,structure:null,obstacleAtr:null,extensionAtr:null};
 const c=b.map(q=>q.close),a=Math.max(atrBars(b.slice(-24),14),p*.00008,1e-9),e8=ema(c,8),e21=ema(c,21);
 const path=c.slice(-11).slice(1).reduce((s,v,i)=>s+Math.abs(v-c.slice(-11)[i]),0),eff=path?Math.abs(c.at(-1)-c.at(-11))/path:0;
 const sw=confirmedPivots(b,a,70),trend=clip((e8.at(-1)-e21.at(-1))/a,-1,1),slope=(e21.at(-1)-e21.at(-5))/a,dir0=sw.dir||sign(trend*.65+slope*.35,.10);
 const candidates=d>0?[...(sw.highs||[]).map(q=>q.price),Math.max(...b.slice(-20).map(q=>q.high))]:[...(sw.lows||[]).map(q=>q.price),Math.min(...b.slice(-20).map(q=>q.low))];
 const ahead=candidates.filter(v=>d*(v-p)>0).map(v=>({price:v,distanceAtr:d*(v-p)/a})).sort((u,v)=>u.distanceAtr-v.distanceAtr)[0]||null;
 return {available:true,dir:dir0,eff,trend,slope,atr:a,structure:{highTag:sw.highTag,lowTag:sw.lowTag,integrity:sw.integrity},
  obstacle:ahead,obstacleAtr:ahead?.distanceAtr??Infinity,extensionAtr:(p-e21.at(-1))/a,ema8:e8.at(-1),ema21:e21.at(-1)};
}
function higherContext(x,p,d){
 return {m5:higherFrame(x.five,p,d),m15:higherFrame(x.fifteen,p,d)};
}

/* ---------- Behavior ---------- */
function behaviorSequence(f,x,structure){
 const a=Math.max(f.atr,1e-9),closed=f.b.slice(-10),liveBar=x.current||x.bars?.at(-1)||closed.at(-1),live=candleMetric({...liveBar,close:x.price,high:Math.max(liveBar?.high??x.price,x.price),low:Math.min(liveBar?.low??x.price,x.price)},a,x.price);
 const ms=closed.slice(-7).map(q=>candleMetric(q,a,q.close)),last=ms.at(-1),prev=ms.at(-2);
 const recent3=ms.slice(-3),prior3=ms.slice(-6,-3),recentRange=avg(recent3.map(m=>m.rangeAtr)),priorRange=avg(prior3.map(m=>m.rangeAtr));
 const recentBody=avg(recent3.map(m=>m.bodyAtr)),priorBody=avg(prior3.map(m=>m.bodyAtr));
 const compression=prior3.length===3&&recentRange<priorRange*.72;
 const bodyDecay=prior3.length===3&&recentBody<priorBody*.72;
 const expansion=live.rangeAtr>=Math.max(.55,recentRange*1.18)||live.bodyAtr>=Math.max(.38,recentBody*1.25);
 const pace=Math.max(f.relVolume||0,f.volume3Ratio||0,x.phase?.liveVolumePace||0);
 const unusualVolume=pace>=1.35;
 const shock=expansion&&unusualVolume;
 const pressure=clip(avg(ms.slice(-5).map(m=>m.d*(m.bodyAtr*.55+(m.d>0?m.closeLoc:1-m.closeLoc)*.30))),-1,1);
 const upperReject=live.upper>=.34&&live.closeLoc<=.58,lowerReject=live.lower>=.34&&live.closeLoc>=.42;
 const rejection=lowerReject?1:upperReject?-1:0;
 let engulf=0;if(last&&prev){if(last.d>0&&prev.d<0&&last.close>=prev.open&&last.open<=prev.close)engulf=1;else if(last.d<0&&prev.d>0&&last.open>=prev.close&&last.close<=prev.open)engulf=-1;}
 const oneSided=ms.slice(-4).filter(m=>m.closeLoc>=.72).length>=3?1:ms.slice(-4).filter(m=>m.closeLoc<=.28).length>=3?-1:0;
 const priorShock=prev&&(prev.rangeAtr>=.75||prev.bodyAtr>=.55);
 const priorMid=prev?(prev.open+prev.close)/2:null;
 const failedExpansion=priorShock?(prev.d>0&&x.price<priorMid?-1:prev.d<0&&x.price>priorMid?1:0):0;
 const postShockHold=priorShock?(prev.d>0&&x.price>=prev.close-Math.abs(prev.close-prev.open)*.35?1:prev.d<0&&x.price<=prev.close+Math.abs(prev.close-prev.open)*.35?-1:0):0;
 const absorption=unusualVolume&&live.rangeAtr>=.45&&live.bodyRatio<=.32&&(live.upper>=.30||live.lower>=.30);
 const extension=Math.abs((x.price-f.ema21)/a),exhaustion=extension>=CFG.v3ExhaustionExtension&&(bodyDecay||absorption||rejection===-sign(x.price-f.ema21));
 const recent4=closed.slice(-4),recentLow=recent4.length?Math.min(...recent4.map(q=>q.low)):x.price,recentHigh=recent4.length?Math.max(...recent4.map(q=>q.high)):x.price;
 const pullbackNear=CFG.v3PullbackNearAtr||.55;
 const pullbackUp=recentLow<=f.ema8+a*.12&&x.price<=f.ema8+a*pullbackNear&&x.price>=f.ema21-a*.20;
 const pullbackDown=recentHigh>=f.ema8-a*.12&&x.price>=f.ema8-a*pullbackNear&&x.price<=f.ema21+a*.20;
 const reclaimUp=pullbackUp&&x.price>=f.ema8+a*(CFG.v3BaseReclaimAtr||.03)&&live.d>=0&&live.closeLoc>=.55;
 const reclaimDown=pullbackDown&&x.price<=f.ema8-a*(CFG.v3BaseReclaimAtr||.03)&&live.d<=0&&live.closeLoc<=.45;
 const baseFormed=(pullbackUp||pullbackDown)&&recentRange<=Math.max(priorRange*.95,.65);
 const prior=f.b.slice(-13,-1),hi=prior.length?Math.max(...prior.map(q=>q.high)):f.high,lo=prior.length?Math.min(...prior.map(q=>q.low)):f.low;
 const priorPath=prior.slice(1).reduce((s,q,i)=>s+Math.abs(q.close-prior[i].close),0);
 const priorEff=priorPath?Math.abs(prior.at(-1).close-prior[0].open)/priorPath:0;
 const priorWidthAtr=(hi-lo)/a;
 const breakoutContext=compression||priorEff<=(CFG.v3BreakoutBaseEffMax||.35)||(f.sideCrosses||0)>=1;
 const breakoutUp=breakoutContext&&x.price>=hi+a*(CFG.v3BreakBuffer||.06),breakoutDown=breakoutContext&&x.price<=lo-a*(CFG.v3BreakBuffer||.06);
 const acceptedUp=breakoutUp&&live.closeLoc>=CFG.v3BreakCloseMin&&live.d>=0&&!upperReject;
 const acceptedDown=breakoutDown&&live.closeLoc<=1-CFG.v3BreakCloseMin&&live.d<=0&&!lowerReject;
 const recapturedUp=x.price<hi-a*.02,recapturedDown=x.price>lo+a*.02;
 const tags=[];
 if(compression)tags.push('Compression');if(expansion)tags.push('Expansion');if(shock)tags.push('Shock');if(absorption)tags.push('Absorption');
 if(bodyDecay)tags.push('Body decay');if(failedExpansion)tags.push('Failed expansion');if(rejection)tags.push(rejection>0?'Lower rejection':'Upper rejection');
 if(engulf)tags.push(engulf>0?'Bullish engulf':'Bearish engulf');if(exhaustion)tags.push('Exhaustion');if(baseFormed)tags.push('Base forming');
 return {live,metrics:ms,pressure,pace,compression,bodyDecay,expansion,unusualVolume,shock,absorption,exhaustion,rejection,engulf,oneSided,failedExpansion,postShockHold,
  pullbackUp,pullbackDown,reclaimUp,reclaimDown,baseFormed,rangeHigh:hi,rangeLow:lo,priorEff,priorWidthAtr,breakoutContext,breakoutUp,breakoutDown,acceptedUp,acceptedDown,recapturedUp,recapturedDown,tags};
}

/* ---------- Microstructure ---------- */
function microContext(x,d){
 const m=x.micro||{},coverage=finite(m.coverageSeconds)?m.coverageSeconds:(x.coverage||0),source=m.source||'live_composite';
 const f15=finite(m.flow15s)?m.flow15s:null,f60=finite(m.flow60s)?m.flow60s:null,f180=finite(m.flow180s)?m.flow180s:null;
 const composite=finite(x.flow)?x.flow:0,bookComposite=x.bookValid&&finite(x.book)?x.book:null;
 const aligned15=f15===null?null:d*f15,aligned60=f60===null?null:d*f60,aligned180=f180===null?null:d*f180,alignedComposite=d*composite,alignedBook=bookComposite===null?null:d*bookComposite;
 const historical=source==='historical_1m_adapter'||m.replay===true;
 let state='DEVELOPING',reason='แรงซื้อขายระยะสั้นยังไม่ยืนยัน';
 const checks=[];
 if(historical){
  const pass=alignedComposite>=CFG.v3ReplayMinFlow,block=alignedComposite<=-CFG.v3ReverseFlow;
  state=pass?'PASS':block?'BLOCK':'DEVELOPING';
  reason=pass?'แรงซื้อขายจากข้อมูลย้อนหลัง 1 นาทีหนุนทิศ':'แรงซื้อขายจากข้อมูลย้อนหลัง 1 นาทียังไม่หนุนพอ';
  checks.push({key:'replay_flow',label:'1m taker-flow adapter',value:alignedComposite,pass});
 }else{
  const coveragePass=coverage>=CFG.v3FlowCoverageSec;
  const shortPass=aligned15===null?null:aligned15>=CFG.v3MinFlow;
  const mediumPass=aligned60===null?alignedComposite>=CFG.v3MinFlow:aligned60>=CFG.v3MinFlow;
  const longOppose=aligned180!==null&&aligned180<=-CFG.v3ReverseFlow;
  const shortOppose=aligned15!==null&&aligned15<=-CFG.v3ReverseFlow;
  const mediumOppose=aligned60!==null&&aligned60<=-CFG.v3ReverseFlow;
  const bookPass=alignedBook===null?null:alignedBook>=CFG.v3BookAssist,bookAgainst=alignedBook!==null&&alignedBook<=-CFG.v3BookAgainstMax;
  const strong=(aligned60!==null?aligned60:alignedComposite)>=CFG.v3StrongFlow;
  const pass=coveragePass&&!longOppose&&!bookAgainst&&(strong||(mediumPass&&(shortPass===true||bookPass===true||f15===null)));
  const block=coveragePass&&(mediumOppose&&(shortOppose||bookAgainst));
  state=pass?'PASS':block?'BLOCK':'DEVELOPING';
  reason=pass?'แรงซื้อขายหลายช่วงเวลาไม่ขัดกันและข้อมูลระยะสั้นยืนยัน':block?'แรงซื้อขายหรือสมุดคำสั่งสวนมุมมองชัด':'แรงซื้อขายยังต้องสะสมหลักฐาน';
  checks.push({key:'coverage',label:'Flow coverage',value:coverage,pass:coveragePass},{key:'flow15',label:'Flow 15s',value:aligned15,pass:shortPass},
   {key:'flow60',label:'Flow 60s',value:aligned60??alignedComposite,pass:mediumPass},{key:'flow180',label:'แรงซื้อขาย 180 วินาทีไม่สวน',value:aligned180,pass:!longOppose},
   {key:'book',label:'Order book',value:alignedBook,pass:bookPass});
 }
 const liq60=finite(m.liquidationSigned60s)?d*m.liquidationSigned60s:null,liq180=finite(m.liquidationSigned180s)?d*m.liquidationSigned180s:null;
 return {state,pass:state==='PASS',blocked:state==='BLOCK',reason,source,coverage,flow15s:f15,flow60s:f60,flow180s:f180,aligned15,aligned60,aligned180,
  composite,alignedComposite,book:bookComposite,alignedBook,depthImbalance:m.depthImbalance??null,micropriceBias:m.micropriceBias??null,spreadBps:m.spreadBps??null,
  trades60s:m.trades60s??null,notional60s:m.notional60s??null,notional180s:m.notional180s??null,liquidationAligned60s:liq60,liquidationAligned180s:liq180,checks};
}

/* ---------- Market Reader ---------- */
function directionalEvidence(f,x,structure,behavior,htf){
 const trend=clip((f.trend||0)/.85,-1,1),slope=clip((f.emaSlopeAtr||0)/.8,-1,1),mom=clip((f.mom||0)/1.2,-1,1),acc=clip((f.momAccel||0)/.9,-1,1);
 const swing=structure.dir,pressure=behavior.pressure,flow=clip(x.flow||0,-1,1);
 let raw=trend*.22+slope*.14+mom*.18+acc*.08+swing*.16+pressure*.12+flow*.10;
 if(htf?.m5?.available)raw+=htf.m5.dir*.04;if(htf?.m15?.available)raw+=htf.m15.dir*.04;
 raw=clip(raw,-1,1);return {raw,d:sign(raw,.08),high:Math.round(clip(50+raw*32,18,82)),low:Math.round(clip(50-raw*32,18,82)),
  parts:{trend,slope,momentum:mom,acceleration:acc,swing,pressure,flow}};
}
function readMarket(f,x,z,phase){
 const structure=structureSnapshot(f,x),behavior=behaviorSequence(f,x,structure);
 const provisionalDir=structure.structuralDir||sign(f.trend,.08)||sign(f.mom,.12)||behavior.live.d;
 const fib=fibContext(f,x.price,z,structure),htf=higherContext(x,x.price,provisionalDir||1),evidence=directionalEvidence(f,x,structure,behavior,htf);
 const a=Math.max(f.atr,1e-9);let dir=evidence.d||provisionalDir;
 const extension=dir?dir*(x.price-f.ema21)/a:Math.abs((x.price-f.ema21)/a);
 const rangePos=f.rangePosition,nearEdge=rangePos<=.25||rangePos>=.75;
 const reverseUpConfirm=structure.reverseUp&&(behavior.rejection===1||behavior.failedExpansion===1||behavior.engulf===1);
 const reverseDownConfirm=structure.reverseDown&&(behavior.rejection===-1||behavior.failedExpansion===-1||behavior.engulf===-1);
 let state='TRANSITION';
 if(behavior.shock)state='SHOCK_UNRESOLVED';
 else if(reverseUpConfirm||reverseDownConfirm){state='REVERSAL_DEVELOPING';dir=reverseUpConfirm?1:-1;}
 else if(behavior.exhaustion||phase?.phase==='EXHAUSTION')state='EXHAUSTION';
 else if(behavior.acceptedUp||behavior.acceptedDown)state='BREAKOUT_ACCEPTED';
 else if(behavior.breakoutUp||behavior.breakoutDown)state='BREAKOUT_ATTEMPT';
 else if(behavior.compression&&f.eff<.34)state='COMPRESSION';
 else if(structure.dir&&f.eff>=CFG.v3TrendEffMin&&(behavior.pullbackUp||behavior.pullbackDown))state='PULLBACK';
 else if(structure.dir&&f.eff>=CFG.v3TrendEffMin)state='TREND_ADVANCE';
 else if(f.eff<=CFG.v3ChopEffMax&&f.sideCrosses>=1)state=nearEdge?'RANGE_EDGE':'RANGE_CHOP';
 else if(nearEdge)state='RANGE_EDGE';
 return {state,dir,evidence,structure,behavior,fib,htf,phase:phase?.phase||'TRANSITION',extension,rangePosition:rangePos,
  relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,atr:a,price:x.price,reverseUpConfirm,reverseDownConfirm};
}
function marketLabel(s){return ({
 SHOCK_UNRESOLVED:'เกิดแรงกระแทก · ตลาดยังไม่เฉลย',BREAKOUT_ATTEMPT:'กำลังลองทะลุกรอบ',BREAKOUT_ACCEPTED:'การทะลุกรอบเริ่มถูกยอมรับ',
 EXHAUSTION:'ปลายขา / แรงเริ่มหมด',REVERSAL_DEVELOPING:'กำลังสร้างโครงกลับตัว',COMPRESSION:'กำลังบีบตัวสะสมแรง',
 PULLBACK:'กำลังย่อในโครงสร้างเดิม',TREND_ADVANCE:'เทรนด์กำลังเดิน',RANGE_EDGE:'อยู่ขอบกรอบ',RANGE_CHOP:'แกว่งสลับในกรอบ',TRANSITION:'กำลังเปลี่ยนจังหวะ'
 })[s]||'กำลังอ่านตลาด';}
function shockLabel(s){return ({
 UNRESOLVED:'ยังไม่เฉลย',HOLD:'ยืนราคาได้',RETEST:'กลับมาทดสอบ',FAIL:'ถูกตีกลับ / ล้มเหลว',ABSORB:'ถูกดูดซับ',EXHAUST:'แรงหมด'
 })[s]||null;}
function marketDescription(r){
 const d=sideThai(r.dir);
 return ({
 SHOCK_UNRESOLVED:'ราคาและปริมาณซื้อขายขยายผิดปกติ แต่ 3.0 ยังไม่ถือว่าเป็นจุดเข้า ต้องรอดูว่าแรงนี้ยืนราคาได้ ถูกดูดซับ หมดแรง หรือถูกตีกลับ',
 BREAKOUT_ATTEMPT:'ราคาพ้นขอบเดิมแล้ว แต่การยอมรับราคายังไม่ครบ จึงยังแยกไม่ได้ว่าเป็นการทะลุกรอบจริง หรือเป็นการกวาดราคาแล้วกลับเข้ากรอบ',
 BREAKOUT_ACCEPTED:'ราคาพ้นกรอบและแท่งเริ่มยอมรับราคานอกกรอบแล้ว ขั้นต่อไปคือเช็กตำแหน่ง พื้นที่ก่อนชนแนว และแรงซื้อขายสดก่อนเข้า',
 EXHAUSTION:'ราคายืดจากฐานและพฤติกรรมแท่งเริ่มชะลอหรือถูกดูดซับ จึงหยุดไล่ราคาและเฝ้าดูว่าจะสร้างฐานใหม่หรือกลับตัว',
 REVERSAL_DEVELOPING:'โครงสร้างเดิมเริ่มเสียและมีพฤติกรรมสวน แต่ยังต้องให้โครงสร้างแตกจริงและแรงซื้อขายระยะสั้นยืนยันฝั่งใหม่ก่อน',
 COMPRESSION:'ช่วงแท่งล่าสุดหดตัวเมื่อเทียบกับก่อนหน้า ตลาดกำลังสะสมแรง จึงรอการขยายตัวที่มีการยอมรับราคามากกว่าคาดเดาทิศ',
 PULLBACK:'โครงสร้างหลักยังเอียง'+d+' แต่ราคากำลังย่อกลับฐาน ระบบรอให้การย่อจบและกลับมายืนฐานก่อนพิจารณาไม้ใหม่',
 TREND_ADVANCE:'จุดสวิงและประสิทธิภาพการเดินราคายังรองรับฝั่ง'+d+' แต่ 3.0 จะไม่ไล่ทุกแท่ง ต้องรอตำแหน่งหรือฐานใหม่',
 RANGE_EDGE:'ราคาอยู่ใกล้ขอบกรอบ แต่ 3.0 จะไม่สวนจากขอบกรอบอัตโนมัติ ต้องเห็นการยอมรับหรือการปฏิเสธราคา พร้อมโครงสร้างที่ชัด',
 RANGE_CHOP:'ราคาเดินสลับและประสิทธิภาพการเดินราคาต่ำ จุดนี้เสี่ยงถูกหลอกทั้งสองฝั่ง ระบบจึงเน้นเฝ้าดูมากกว่าออกไม้',
 TRANSITION:'องค์ประกอบของตลาดยังไม่เรียงเป็นเรื่องเดียวกันชัด ระบบกำลังอ่านจุดสวิง แท่งเทียน กรอบเวลาใหญ่ และแรงซื้อขายต่อ'
 })[r.state]||'กำลังอ่านตลาด';
}

/* ---------- Shock / Episode ---------- */
function shockSnapshot(reader,x,existing){
 if(!existing)return null;
 const s=existing,a=reader.atr,b=reader.behavior,d=s.d,age=x.ts-s.startedAt,flow=d*(x.flow||0),progress=d*(x.price-s.mid)/a;
 const reverseDir=-d,reverseBreak=reverseDir>0?reader.structure.reverseUp:reader.structure.reverseDown;
 let state=s.state||'UNRESOLVED',why='รอให้แรงกระแทกเฉลย';
 if(age<(CFG.v3ShockResolveMinMs||700))state='UNRESOLVED';
 else if(b.exhaustion&&reader.extension>=CFG.v3ShockExhaustExtension)state='EXHAUST';
 else if(b.absorption&&Math.abs(progress)<CFG.v3AbsorbProgressAtr)state='ABSORB';
 else if(progress<=-.08&&flow<=-CFG.v3ReverseFlow&&reverseBreak)state='FAIL';
 else if(Math.abs(progress)<.12&&(b.pullbackUp||b.pullbackDown))state='RETEST';
 else if(progress>=.05&&flow>=CFG.v3MinFlow&&(b.postShockHold===d||b.live.d===d))state='HOLD';
 else if(age>=(CFG.v3ShockMaxResolveMs||15000)){
  if(progress>=.03&&flow>=-.01)state='HOLD';
  else if(progress<=-.03)state=reverseBreak?'FAIL':'RETEST';
  else state='ABSORB';
 }else state='UNRESOLVED';
 why=state==='HOLD'?'แรงกระแทกรักษาพื้นที่และแรงซื้อขายยังตาม':state==='RETEST'?'ราคากลับมาทดสอบพื้นที่ของแรงกระแทก':
  state==='FAIL'?'แรงกระแทกถูกตีกลับพร้อมการแตกโครงสร้างฝั่งตรงข้าม':state==='ABSORB'?'ปริมาณซื้อขายสูงแต่ราคาไม่คืบและเกิดการดูดซับ':
  state==='EXHAUST'?'แรงกระแทกเกิดช่วงปลายขาและมีสัญญาณหมดแรง':'ยังไม่มีคำตอบว่าราคาจะยืนต่อได้หรือถูกตีกลับ';
 return {...s,state,why,age,progress,alignedFlow:flow,lastPrice:x.price};
}
function episodeSeed(reader){
 let family='TRANSITION',d=reader.dir;
 if(reader.state==='SHOCK_UNRESOLVED')family='SHOCK';
 else if(['BREAKOUT_ATTEMPT','BREAKOUT_ACCEPTED'].includes(reader.state))family='BREAKOUT';
 else if(['TREND_ADVANCE','PULLBACK'].includes(reader.state))family='TREND';
 else if(['REVERSAL_DEVELOPING','EXHAUSTION'].includes(reader.state))family='REVERSAL';
 else if(['RANGE_EDGE','RANGE_CHOP','COMPRESSION'].includes(reader.state))family='RANGE';
 if(reader.behavior.acceptedUp)d=1;if(reader.behavior.acceptedDown)d=-1;
 return {family,d:d||reader.structure.structuralDir||1};
}
function makeShock(reader,x,d){
 if(!reader.behavior.shock)return null;
 const live=reader.behavior.live;
 return {state:'UNRESOLVED',active:true,d:live.d||d||1,startedAt:x.ts,barTime:(x.current||x.bars?.at(-1))?.time||0,high:live.high,low:live.low,mid:(live.high+live.low)/2,
  price:x.price,rangeAtr:live.rangeAtr,volumePace:reader.behavior.pace};
}
function newEpisode(engine,reader,x,reason='new_episode'){
 const seed=episodeSeed(reader),legKey=reader.structure.key+':L0',ep={id:'V3E:'+engine.session+':'+x.ts+':'+seed.family+':'+seed.d,
  family:seed.family,d:seed.d,startedAt:x.ts,lastSeen:x.ts,anchorPrice:x.price,anchorAtr:reader.atr,anchorState:reader.state,
  legKey,legIndex:0,issuedLegKeys:[],lastEntryAt:0,pullbackSeen:false,pullbackExtreme:x.price,baseConfirmed:false,
  shock:makeShock(reader,x,seed.d),thesis:null,stateHistory:[{ts:x.ts,state:reader.state}],thesisHistory:[],transitionHistory:[],reason};
 engine.log('v3_episode_started',x.ts,{episodeId:ep.id,family:ep.family,direction:dirLabel(ep.d),legKey,price:x.price,reason});
 return ep;
}
function updateEpisode(engine,reader,x){
 let ep=engine.v3Episode;if(!ep)return engine.v3Episode=newEpisode(engine,reader,x);
 const seed=episodeSeed(reader),a=reader.atr,s=reader.structure,b=reader.behavior;
 const oppositeBreak=ep.d>0?s.bullBroken:s.bearBroken;
 const confirmedFlip=seed.d&&ep.d&&seed.d!==ep.d&&oppositeBreak&&(seed.family!=='RANGE'||reader.state==='REVERSAL_DEVELOPING');
 const stale=x.ts-ep.startedAt>CFG.v3EpisodeMaxAgeMs&&x.ts-ep.lastEntryAt>60000;
 if(stale||confirmedFlip){
  engine.log('v3_episode_closed',x.ts,{episodeId:ep.id,reason:stale?'stale':'confirmed_direction_flip'});
  return engine.v3Episode=newEpisode(engine,reader,x,stale?'stale_reset':'direction_flip');
 }
 ep.lastSeen=x.ts;
 if(ep.stateHistory.at(-1)?.state!==reader.state)ep.stateHistory.push({ts:x.ts,state:reader.state});
 if(ep.stateHistory.length>20)ep.stateHistory.shift();
 if(seed.family!==ep.family){
  ep.transitionHistory.push({ts:x.ts,from:ep.family,to:seed.family,state:reader.state});
  if(ep.transitionHistory.length>20)ep.transitionHistory.shift();
  ep.family=seed.family;
 }
 if(reader.behavior.shock){
  const barTime=(x.current||x.bars?.at(-1))?.time||0;
  if(!ep.shock||ep.shock.barTime!==barTime)ep.shock=makeShock(reader,x,seed.d||ep.d);
 }
 ep.shock=shockSnapshot(reader,x,ep.shock);
 if(ep.shock?.active!==false&&ep.shock?.age>=(CFG.v3ShockReleaseMs||30000)&&!reader.behavior.shock){
  const terminal=['ABSORB','EXHAUST'].includes(ep.shock.state)||(ep.shock.state==='HOLD'&&['PULLBACK','TREND_ADVANCE','TRANSITION'].includes(reader.state))||(ep.shock.state==='FAIL'&&reader.state!=='SHOCK_UNRESOLVED');
  if(terminal)ep.shock.active=false;
 }
 if(ep.shock?.state==='FAIL'&&ep.shock.d)ep.d=-ep.shock.d;
 else if(seed.d&&reader.structure.dir===seed.d)ep.d=seed.d;

 const pullback=ep.d>0?b.pullbackUp:b.pullbackDown,reclaim=ep.d>0?b.reclaimUp:b.reclaimDown;
 if(pullback){
  if(!ep.pullbackSeen){ep.pullbackSeen=true;ep.pullbackExtreme=x.price;}
  ep.pullbackExtreme=ep.d>0?Math.min(ep.pullbackExtreme,x.price):Math.max(ep.pullbackExtreme,x.price);
 }
 const reclaimMove=ep.pullbackSeen?ep.d*(x.price-ep.pullbackExtreme)/a:0;
 if(ep.pullbackSeen&&reclaim&&reclaimMove>=CFG.v3NewLegReclaimAtr){
  const baseTime=(x.current||x.bars?.at(-1)||reader.structure.lastLeg?.end)?.time||Math.floor(x.ts/60000);
  const key=reader.structure.key+':BASE:'+baseTime;
  if(key!==ep.legKey){
   ep.transitionHistory.push({ts:x.ts,fromLeg:ep.legKey,toLeg:key,reason:'pullback_base_reclaim'});
   ep.legIndex++;ep.legKey=key;ep.baseConfirmed=true;ep.pullbackSeen=false;ep.pullbackExtreme=x.price;
   engine.log('v3_new_structural_leg',x.ts,{episodeId:ep.id,legKey:key,legIndex:ep.legIndex,reason:'pullback_base_reclaim'});
  }
 }else if(reader.structure.key&&!ep.legKey.includes(reader.structure.key)&&ep.pullbackSeen){
  const move=Math.abs(x.price-ep.anchorPrice)/a;
  if(move>=CFG.v3NewLegMinMoveAtr){
   const key=reader.structure.key+':SWING';
   ep.legIndex++;ep.legKey=key;ep.baseConfirmed=true;ep.pullbackSeen=false;ep.pullbackExtreme=x.price;
   engine.log('v3_new_structural_leg',x.ts,{episodeId:ep.id,legKey:key,legIndex:ep.legIndex,reason:'confirmed_swing_leg'});
  }
 }
 return ep;
}

/* ---------- Thesis / Playbook ---------- */
function buildThesis(reader,ep){
 const s=reader.structure,b=reader.behavior,shock=ep?.shock?.active===false?null:ep?.shock,d=shock?.state==='FAIL'?-shock.d:(reader.dir||ep?.d||s.structuralDir);
 let code='OBSERVE',playbook=null,why='',trigger='',invalidate='',next='';
 if(shock&&['UNRESOLVED','RETEST','ABSORB','EXHAUST'].includes(shock.state)){
  code='SHOCK_'+shock.state;why=shock.why;trigger=shock.state==='RETEST'?'รอการกลับมาทดสอบจบ แล้วกลับไปยืนฝั่งแรงกระแทกพร้อมแรงซื้อขาย':'รอแรงกระแทกเฉลยว่า “ยืนราคาได้” หรือ “ถูกตีกลับ” โดยมีโครงสร้างรองรับ';
  invalidate='ยังไม่สร้างไม้จนแรงกระแทกมีคำตอบชัด';next=shock.state==='EXHAUST'?'เฝ้าฐานใหม่หรือรอให้โครงสร้างแตกก่อนพิจารณากลับตัว':'ติดตามแรงกระแทกเดิม';
 }else if(shock?.state==='HOLD'){
  code='SHOCK_HOLD';playbook='shock_resolution';why='แรงกระแทกถูกยอมรับและยังรักษาพื้นที่ได้';trigger='รักษาพื้นที่แรงกระแทก + แรงซื้อขายตาม + ไม่มีแนวจากกรอบเวลาใหญ่ใกล้เกิน';invalidate='หลุดโซนแรงกระแทก / แรงซื้อขายพลิกสวน / โครงสร้างเสีย';next='ถ้าย่อ ให้เปลี่ยนเป็นแผนย่อสร้างฐานแล้วกลับมายืนในเหตุการณ์ตลาดเดิม';
 }else if(shock?.state==='FAIL'){
  code='SHOCK_FAIL_REVERSAL';playbook='confirmed_reversal';why='แรงกระแทกเดิมถูกตีกลับและโครงสร้างฝั่งตรงข้ามเริ่มยืนยัน';trigger='โครงสร้างแตก + พฤติกรรมกลับตัว + แรงซื้อขายระยะสั้นตามฝั่งใหม่';invalidate='ราคากลับเข้าและยืนฝั่งแรงกระแทกเดิม';next='ถ้ายังไม่ยืนยัน ให้เฝ้าดูและไม่สวนทันที';
 }else if(reader.state==='BREAKOUT_ACCEPTED'){
  code='BREAKOUT_CONTINUATION';playbook='breakout_continuation';why='ราคาออกจากกรอบและการยอมรับราคาเริ่มครบ';trigger='การทะลุกรอบยังรักษาพื้นที่ + มีระยะก่อนชนแนว + แท่งและแรงซื้อขายไม่สวน';invalidate='กลับเข้ากรอบเดิมและปิดรับด้านใน';next='ถ้ากลับมาทดสอบ ให้รอย่อสร้างฐานแล้วกลับมายืนแทนการไล่ราคา';
 }else if(reader.state==='BREAKOUT_ATTEMPT'){
  code='BREAKOUT_WATCH';why='ราคาเพิ่งพ้นกรอบแต่การยอมรับราคายังไม่ครบ';trigger='แท่งรับราคานอกกรอบและแรงซื้อขาย 60 วินาทีไม่สวน';invalidate='ถูกดึงกลับเข้ากรอบ';next='ถ้าเป็นการทะลุหลอก ให้เฝ้าการกลับเข้ากรอบ แต่ยังไม่สวนจนโครงสร้างแตก';
 }else if(reader.state==='PULLBACK'&&(d>0?b.reclaimUp:b.reclaimDown)){
  code='PULLBACK_RECLAIM';playbook='pullback_reclaim';why='โครงสร้างเดิมยังอยู่และราคาย่อสร้างฐานก่อนกลับมายืน';trigger='ฐานไม่เสีย + กลับมายืน + พฤติกรรมราคาและแรงซื้อขายระยะสั้นยืนยัน';invalidate='หลุดจุดสวิงป้องกันของโครงสร้างเดิม';next='ถ้ายังกลับมายืนฐานไม่ได้ ให้รอฐานใหม่และไม่ไล่ราคา';
 }else if((d>0?s.reverseUp:s.reverseDown)&&['REVERSAL_DEVELOPING','EXHAUSTION'].includes(reader.state)){
  code='CONFIRMED_REVERSAL';playbook='confirmed_reversal';why='โครงสร้างเดิมถูกเจาะและมีพฤติกรรมฝั่งใหม่';trigger='โครงสร้างที่แตกต้องคงอยู่ + มีการปฏิเสธราคาหรือการขยายตัวล้มเหลว + แรงซื้อขายระยะสั้นตาม';invalidate='ราคากลับมายืนเหนือ/ใต้จุดสวิงป้องกันเดิมได้อีกครั้ง';next='ถ้าการแตกโครงสร้างไม่คงอยู่ ให้ยกเลิกมุมกลับตัว';
 }else if(reader.state==='TREND_ADVANCE'){
  code='TREND_WAIT_BASE';why='เทรนด์ยังเดิน แต่ไม่มีฐานใหม่ให้ได้เปรียบพอ';trigger='รอการย่อสร้างฐาน แล้วกลับมายืนฐาน';invalidate='ถ้าจุดสวิงป้องกันเสีย ให้เปลี่ยนมุมมอง';next='ไม่ออกซ้ำเพียงเพราะปริมาณซื้อขายเพิ่มในขาเดิม';
 }else if(reader.state==='COMPRESSION'){
  code='COMPRESSION_WATCH';why='ราคาและช่วงแท่งบีบตัว กำลังสะสมแรง';trigger='รอการขยายตัว + การยอมรับราคา + โครงสร้าง';invalidate='ไม่มีทิศให้ยกเลิกจนกว่าจะเลือกทาง';next='การทะลุกรอบที่ยังไม่ถูกยอมรับจะยังไม่เข้า';
 }else if(reader.state==='RANGE_EDGE'){
  code='RANGE_EDGE_OBSERVE';why='ราคาอยู่ขอบกรอบแต่ยังไม่มีเหตุผลพอให้สวน';trigger='รอการยอมรับราคานอกกรอบ หรือการปฏิเสธราคาพร้อมโครงสร้างแตก';invalidate='ไม่สร้างไม้จากตำแหน่งขอบเพียงอย่างเดียว';next='ดูว่าขอบกรอบยืนได้หรือถูกตีแตก';
 }else{
  code='OBSERVE';why='ตลาดยังไม่มีมุมมองที่มีโครงสร้างรองรับพอ';trigger='รอเหตุการณ์ตลาดและโครงสร้างให้ชัดขึ้น';invalidate='—';next='เฝ้าดูต่อ';
 }
 return {code,d,playbook,why,trigger,invalidation:invalidate,nextPlan:next};
}
function playbookLabel(p){return ({
 breakout_continuation:'ทะลุกรอบแล้วไปต่อ',shock_resolution:'รอผลหลังแรงกระแทก',pullback_reclaim:'ย่อสร้างฐานแล้วกลับมายืน',confirmed_reversal:'กลับตัวที่ยืนยันแล้ว'
 })[p]||'เฝ้าดูตลาด';}

/* ---------- Independent Gates ---------- */
function structureGate(reader,thesis){
 const d=thesis.d,s=reader.structure,b=reader.behavior,checks=[];
 if(!d)return {state:'BLOCK',pass:false,reason:'ยังไม่มีทิศของมุมมอง'};
 const protectedOK=d>0?!s.bullBroken:!s.bearBroken;
 const swingAligned=s.dir===d,trendAligned=s.trendDir===d&&s.alignedEfficiency;
 const reversalBreak=d>0?s.reverseUp:s.reverseDown;
 const accepted=d>0?b.acceptedUp:b.acceptedDown;
 let pass=false,developing=false;
 if(thesis.playbook==='breakout_continuation'){pass=accepted&&protectedOK&&(swingAligned||trendAligned)&&fEff(reader)>=CFG.v3BreakoutEffMin;developing=!pass&&protectedOK&&(accepted||swingAligned||trendAligned);}
 else if(thesis.playbook==='shock_resolution'){pass=reader.episodeShock?.state==='HOLD'&&protectedOK&&(swingAligned||trendAligned||accepted);developing=!pass&&protectedOK;}
 else if(thesis.playbook==='pullback_reclaim'){pass=protectedOK&&(swingAligned||trendAligned)&&reader.episodeBase===true;developing=!pass&&protectedOK&&(swingAligned||trendAligned);}
 else if(thesis.playbook==='confirmed_reversal'){pass=reversalBreak&&((d>0&&s.bearBroken)||(d<0&&s.bullBroken));developing=!pass&&reversalBreak;}
 checks.push({label:'จุดสวิงป้องกันยังไม่เสียในฝั่งของมุมมอง',pass:protectedOK},{label:'โครงสร้างจุดสวิงหรือเทรนด์รองรับ',pass:swingAligned||trendAligned},
  {label:'การทะลุกรอบหรือการแตกโครงสร้างตรงตามแผน',pass:thesis.playbook==='confirmed_reversal'?reversalBreak:thesis.playbook==='breakout_continuation'?accepted:true});
 const state=gateState(pass,developing);
 return {state,pass,reason:pass?'โครงสร้างรองรับมุมมอง':state==='DEVELOPING'?'โครงสร้างกำลังก่อตัวแต่ยังไม่ครบ':'เงื่อนไขโครงสร้างหลักยังไม่ผ่าน',
  checks,summary:s.summary,highTag:s.highTag,lowTag:s.lowTag,integrity:s.integrity,dir:s.dir,trendDir:s.trendDir,eff:reader.eff,protectedLow:s.bullProtected,protectedHigh:s.bearProtected,
  reverseUp:s.reverseUp,reverseDown:s.reverseDown};
}
function fEff(reader){return reader.eff??0;}
function locationGate(reader,thesis,z){
 const d=thesis.d,a=reader.atr,f=reader.f,room=roomAtr(z,reader.price,d,a),extension=d*(reader.price-f.ema21)/a,rangePos=f.rangePosition;
 const support=nearestZone(z,reader.price,'support',a),resistance=nearestZone(z,reader.price,'resistance',a),fib=reader.fib,htf=reader.htf;
 const htfRows=[htf.m5,htf.m15].filter(q=>q.available),htfConflict=htfRows.filter(q=>q.dir===-d&&q.eff>=.35).length;
 const htfObstacle=htfRows.map(q=>q.obstacleAtr).filter(finite).sort((x,y)=>x-y)[0]??Infinity;
 const chase=thesis.playbook==='breakout_continuation'?Math.abs(d>0?reader.price-reader.behavior.rangeHigh:reader.behavior.rangeLow-reader.price)/a:0;
 const fibSupports=!!(fib?.valid&&fib.d===d&&(fib.healthy||fib.confluence||(thesis.playbook==='confirmed_reversal'&&(fib.deep||fib.extension>=1.272))));
 const baseLocation=thesis.playbook==='pullback_reclaim'&&(Math.abs(reader.price-f.ema8)/a<=.55||fibSupports);
 const reversalLocation=thesis.playbook==='confirmed_reversal'&&(Math.abs(extension)>=CFG.v3ReversalMinExtension||fibSupports||(d>0?support?.distanceAtr:resistance?.distanceAtr)<=.35);
 const roomOK=room>=CFG.v3MinRoomAtr,extOK=extension<=CFG.v3HardExtension,htfOK=htfConflict<2&&htfObstacle>=CFG.v3HtfObstacleAtr;
 let pass=roomOK&&extOK&&htfOK;
 if(thesis.playbook==='breakout_continuation')pass=pass&&chase<=CFG.v3BreakoutMaxChaseAtr;
 if(thesis.playbook==='pullback_reclaim')pass=pass&&baseLocation;
 if(thesis.playbook==='confirmed_reversal')pass=roomOK&&htfOK&&reversalLocation;
 const developing=!pass&&roomOK&&htfConflict<2&&(thesis.playbook==='pullback_reclaim'?true:extOK);
 const state=gateState(pass,developing),why=!roomOK?'พื้นที่ก่อนชนแนวสำคัญแคบ':!htfOK?'กรอบเวลาใหญ่มีแนวขวางหรือสวนแรง':!extOK?'ราคาไกลฐานเกินไป':
  thesis.playbook==='breakout_continuation'&&chase>CFG.v3BreakoutMaxChaseAtr?'ราคาหลังทะลุกรอบถูกไล่ไกลเกินจุดได้เปรียบ':
  thesis.playbook==='pullback_reclaim'&&!baseLocation?'การย่อยังไม่อยู่บริเวณฐานหรือฟิโบนัชชีที่เหมาะ':
  thesis.playbook==='confirmed_reversal'&&!reversalLocation?'จังหวะกลับตัวเกิดกลางทางและไม่มีตำแหน่งราคาที่รองรับ':'ตำแหน่งราคากำลังก่อตัว';
 return {state,pass,reason:pass?'ตำแหน่งราคาเหมาะกับแผนปัจจุบัน':why,room:finite(room)?room:null,extension,rangePosition:rangePos,chaseAtr:chase,
  htfConflict,htfObstacleAtr:finite(htfObstacle)?htfObstacle:null,support,resistance,fib,checks:[
   {label:'มีพื้นที่ก่อนชนแนวสำคัญ',pass:roomOK},{label:'ไม่ไล่ไกลจากฐานเกิน',pass:extOK},{label:'กรอบเวลาใหญ่ไม่ขวางหนัก',pass:htfOK},
   {label:'ตำแหน่งราคาเหมาะกับแผนนี้',pass:thesis.playbook==='pullback_reclaim'?baseLocation:thesis.playbook==='confirmed_reversal'?reversalLocation:thesis.playbook==='breakout_continuation'?chase<=CFG.v3BreakoutMaxChaseAtr:true}
  ]};
}
function behaviorGate(reader,thesis){
 const d=thesis.d,b=reader.behavior,shock=reader.episodeShock,alignedClose=d>0?b.live.closeLoc:1-b.live.closeLoc;
 let pass=false,developing=false;const checks=[];
 if(thesis.playbook==='breakout_continuation'){
  const accepted=d>0?b.acceptedUp:b.acceptedDown,notFail=b.failedExpansion!==-d,follow=alignedClose>=.60&&(b.expansion||b.oneSided===d||b.pressure*d>.12);
  pass=accepted&&notFail&&follow;developing=!pass&&accepted&&notFail;
  checks.push({label:'Breakout acceptance',pass:accepted},{label:'ยังไม่เกิดการขยายตัวแล้วล้มเหลว',pass:notFail},{label:'แท่งมีแรงไปต่อ',pass:follow});
 }else if(thesis.playbook==='shock_resolution'){
  const hold=shock?.state==='HOLD',notAbsorb=!b.absorption,notExhaust=!b.exhaustion;
  pass=hold&&notAbsorb&&notExhaust;developing=!pass&&hold;
  checks.push({label:'แรงกระแทกยืนราคาได้',pass:hold},{label:'ไม่ถูกดูดซับ',pass:notAbsorb},{label:'ยังไม่อยู่ช่วงหมดแรง',pass:notExhaust});
 }else if(thesis.playbook==='pullback_reclaim'){
  const pull=d>0?b.pullbackUp:b.pullbackDown,reclaim=d>0?b.reclaimUp:b.reclaimDown,close=alignedClose>=.55,notFail=b.failedExpansion!==-d;
  pass=pull&&reclaim&&close&&notFail;developing=!pass&&pull;
  checks.push({label:'เกิดการย่อจริง',pass:pull},{label:'ราคากลับมายืนฐานแล้ว',pass:reclaim},{label:'แท่งปิดหนุนทิศ',pass:close},{label:'ไม่มีการขยายตัวล้มเหลวฝั่งสวน',pass:notFail});
 }else if(thesis.playbook==='confirmed_reversal'){
  const rejection=b.rejection===d||b.failedExpansion===d||b.engulf===d,close=alignedClose>=.55,notAbsorb=!b.absorption||b.rejection===d;
  pass=rejection&&close&&notAbsorb;developing=!pass&&(rejection||b.exhaustion);
  checks.push({label:'มีการปฏิเสธราคา การขยายตัวล้มเหลว หรือแท่งกลืนฝั่งใหม่',pass:rejection},{label:'แท่งปิดรับฝั่งใหม่',pass:close},{label:'ไม่ถูกดูดซับกลับทันที',pass:notAbsorb});
 }
 const state=gateState(pass,developing);
 return {state,pass,reason:pass?'พฤติกรรมราคายืนยันแผนปัจจุบัน':state==='DEVELOPING'?'พฤติกรรมราคาเริ่มมาแต่ลำดับยังไม่ครบ':'พฤติกรรมราคายังไม่ยืนยัน',
  checks,tags:b.tags,pressure:b.pressure,compression:b.compression,expansion:b.expansion,absorption:b.absorption,exhaustion:b.exhaustion,rejection:b.rejection,failedExpansion:b.failedExpansion,
  pullback:d>0?b.pullbackUp:b.pullbackDown,reclaim:d>0?b.reclaimUp:b.reclaimDown,closeLocation:b.live.closeLoc,bodyAtr:b.live.bodyAtr,rangeAtr:b.live.rangeAtr};
}
function entryBundle(reader,thesis,z,x,ep){
 if(!thesis.playbook||!thesis.d)return {entryReady:false,state:'OBSERVE',gates:null,passed:0,blocked:['ยังไม่มีแผนที่อนุญาตให้เข้า']};
 reader.episodeShock=ep?.shock||null;reader.episodeBase=!!ep?.baseConfirmed;reader.f=reader._f;
 const structure=structureGate(reader,thesis),location=locationGate(reader,thesis,z),behavior=behaviorGate(reader,thesis),micro=microContext(x,thesis.d);
 const gates={structure,location,behavior,micro},list=Object.values(gates),passed=list.filter(g=>g.state==='PASS').length;
 const blocked=list.filter(g=>g.state==='BLOCK').map(g=>g.reason),developing=list.filter(g=>g.state==='DEVELOPING').map(g=>g.reason);
 const entryReady=passed===4,state=entryReady?'READY':blocked.length?'BLOCKED':'DEVELOPING';
 return {entryReady,state,gates,passed,total:4,blocked,developing};
}
function story(reader,ep,thesis,bundle){
 const e=reader.evidence,d=thesis.d||reader.dir,supports=[],warnings=[],g=bundle?.gates||{};
 if(g.structure?.state==='PASS')supports.push('Structure: '+g.structure.summary);
 else if(g.structure)warnings.push('Structure: '+g.structure.reason);
 if(g.location?.state==='PASS')supports.push('Location: room '+(finite(g.location.room)?g.location.room.toFixed(2):'∞')+' ATR · extension '+g.location.extension.toFixed(2)+' ATR');
 else if(g.location)warnings.push('Location: '+g.location.reason);
 if(g.behavior?.state==='PASS')supports.push('Behavior: '+unique(g.behavior.tags).join(', '));
 else if(g.behavior)warnings.push('Behavior: '+g.behavior.reason);
 if(g.micro?.state==='PASS')supports.push('Micro: '+g.micro.reason);
 else if(g.micro)warnings.push('Micro: '+g.micro.reason);
 const fib=reader.fib;if(fib?.valid)supports.push('Fib: '+(fib.extension>1?'Extension '+(fib.extension*100).toFixed(1)+'% · '+fib.extensionZone:'Retracement '+Math.max(0,fib.retracement*100).toFixed(1)+'% · '+fib.retraceZone)+(fib.confluence?' · ซ้อนแนวสำคัญ':''));
 else warnings.push('Fib: '+(fib?.reason||'ยังไม่มีขาสวิงที่ยืนยัน'));
 const m5=reader.htf.m5,m15=reader.htf.m15;
 if(m5.available)(m5.dir===d?supports:warnings).push('5m '+(m5.dir===d?'หนุน':'เอนสวน/กลาง')+' · '+m5.structure.highTag+'/'+m5.structure.lowTag);
 if(m15.available)(m15.dir===d?supports:warnings).push('15m '+(m15.dir===d?'หนุน':'เอนสวน/กลาง')+' · '+m15.structure.highTag+'/'+m15.structure.lowTag);
 const gateText=bundle?.gates?Object.entries(bundle.gates).map(([k,v])=>k.toUpperCase()+' '+v.state).join(' · '):'Observe';
 const sameLeg=ep&&(ep.issuedLegKeys||[]).includes(ep.legKey);
 const summary=marketLabel(reader.state)+' · '+thesis.why+(sameLeg?' · เหตุการณ์ตลาดนี้ออกไม้ในขาปัจจุบันแล้ว':'');
 return {schema:'aris-v3-story-v3',state:reader.state,stateLabel:marketLabel(reader.state),stateDescription:marketDescription(reader),direction:dirLabel(d||reader.evidence.d),
  highEvidence:e.high,lowEvidence:e.low,evidenceParts:e.parts,episodeId:ep?.id||null,episodeFamily:ep?.family||null,episodeDirection:dirLabel(ep?.d||0),
  structuralLegKey:ep?.legKey||null,legIndex:ep?.legIndex||0,episodeDescription:ep?'Episode '+ep.family+' · '+sideThai(ep.d)+' · ระบบถือเป็นเรื่องเดียวกันจนกว่าโครงสร้างจะรีเซ็ต ไม้ใหม่ต้องมีขาโครงสร้างหรือฐานใหม่':'กำลังสร้างเหตุการณ์ตลาด',
  shockState:ep?.shock?.state||null,shockLabel:shockLabel(ep?.shock?.state),shockReason:ep?.shock?.why||null,structure:reader.structure,behavior:reader.behavior,htf:reader.htf,fib,
  thesis,playbook:thesis.playbook,playbookLabel:playbookLabel(thesis.playbook),entryState:bundle?.state||'OBSERVE',gatePassed:bundle?.passed||0,gateTotal:bundle?.total||4,gates:g,
  blocked:unique([...(bundle?.blocked||[]),...(bundle?.developing||[])]),supports:unique(supports).slice(0,10),warnings:unique(warnings).slice(0,10),
  trigger:thesis.trigger,invalidation:thesis.invalidation,nextPlan:thesis.nextPlan,summary,gateText,sameLeg};
}
function invalidationLevel(reader,d,thesis){
 const s=reader.structure,a=reader.atr;
 if(thesis.playbook==='confirmed_reversal')return d>0?(s.lastLow?.price??reader.price-a):(s.lastHigh?.price??reader.price+a);
 return d>0?(s.bullProtected??Math.min(...reader._f.b.slice(-5).map(q=>q.low))):(s.bearProtected??Math.max(...reader._f.b.slice(-5).map(q=>q.high)));
}

/* ---------- Engine ---------- */
class V3Engine extends BaseEngine{
 constructor(saved={}){
  super(saved);
  const mem=saved.v3Memory&&typeof saved.v3Memory==='object'?saved.v3Memory:{};
  this.v3Episode=mem.episode||null;this.v3Candidate=null;this.v3LastSignal=null;
 }
 serialize(){const base=super.serialize();return {...base,v3Memory:{episode:this.v3Episode?JSON.parse(JSON.stringify(this.v3Episode)):null}};}
 reset(reason,time){this.v3Episode=null;this.v3Candidate=null;this.v3LastSignal=null;return super.reset(reason,time);}
 finalizeReview(sig){
  super.finalizeReview(sig);
  if(sig.version!=='ARIS-3.0.0'||!sig.dataset?.entry||!sig.dataset?.review)return;
  const e=sig.dataset.entry,obs=sig.dataset.v3Followup||[];
  const broken=obs.some(q=>q.structureBroken===true),flowFlip=obs.some(q=>q.flowFlipped===true),episodeChanged=obs.some(q=>q.episodeChanged===true);
  sig.dataset.review.v3={revision:e.arisRevision,episodeId:e.v3EpisodeId,playbook:e.v3Playbook,gateStates:e.v3GateStates,observations:obs.length,
   structureBroken:broken,flowFlipped:flowFlip,episodeChanged,causality:'post_entry_labels_only'};
  sig.dataset.review.summary+=' · V3 '+(e.v3Playbook||sig.type)+' · '+(broken?'พบการแตกโครงสร้างหลังเข้า':'ยังไม่พบการแตกโครงสร้างในข้อมูลที่บันทึก')+' · ข้อมูลติดตามหลังเข้าเป็นป้ายกำกับเพื่อเรียนรู้เท่านั้น ไม่ใช้ย้อนกลับไปช่วยตัดสินตอนเข้า';
 }
 step(x){
  const f=features(x.bars,x.price,x.horizonBars||10);
  if(!f)return {status:'warmup',reason:'ARIS V3 · รอแท่งสมบูรณ์อย่างน้อย 35 แท่ง',signal:null};
  if(!x.fresh||!finite(x.price)||!finite(x.ts)||x.price<=0){this.previous=null;this.v3Candidate=null;return this.lastView={f,status:'offline',signal:null,event:null,reason:'ARIS V3 · พักจน Futures สดและต่อเนื่อง'};}
  if(x.id===this.lastId)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  if(this.previous&&x.ts<=this.previous.ts)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  const prev=this.previous;this.lastId=x.id;this.previous={price:x.price,ts:x.ts};
  const z=zones(x.bars||[],f.atr),regime=this.trackRegime(f,x.price),phase=marketPhase(f,x,regime);x.phase=phase;
  const reader=readMarket(f,x,z,phase);reader._f=f;reader.eff=f.eff;
  const ep=updateEpisode(this,reader,x),thesis=buildThesis(reader,ep),bundle=entryBundle(reader,thesis,z,x,ep),st=story(reader,ep,thesis,bundle);
  ep.thesis={code:thesis.code,d:thesis.d,playbook:thesis.playbook,updatedAt:x.ts};
  const lastThesis=ep.thesisHistory.at(-1);if(!lastThesis||lastThesis.code!==thesis.code||lastThesis.playbook!==thesis.playbook){
   ep.thesisHistory.push({ts:x.ts,code:thesis.code,d:thesis.d,playbook:thesis.playbook});if(ep.thesisHistory.length>20)ep.thesisHistory.shift();
  }
  const viewPhase={...phase,v3View:{high:st.highEvidence,low:st.lowEvidence,direction:st.direction,risk:bundle.entryReady?'ต่ำตามเกณฑ์':bundle.state==='BLOCKED'?'สูง':'กลาง',reason:st.summary,story:st}};
  const base={f,z,regime:{...regime,v3State:st.state},phase:viewPhase,v3Story:st,signal:null,event:null,continuation:0,reversal:0};

  for(const sig of this.signals){
   if(sig.version!=='ARIS-3.0.0'||sig.result!=='pending'||!sig.dataset||x.ts>=sig.expiresAt)continue;
   const e=sig.dataset.entry||{},sd=sig.direction==='HIGH'?1:-1,rows=sig.dataset.v3Followup||(sig.dataset.v3Followup=[]),inv=e.v3InvalidationPrice;
   const structureBroken=finite(inv)?sd*(x.price-inv)/Math.max(e.atr,1e-9)<-.08:null,flowFlipped=sd*(x.flow||0)<-CFG.v3ReverseFlow;
   const snap={ts:x.ts,price:x.price,episodeId:ep.id,state:st.state,thesis:thesis.code,playbook:thesis.playbook,shockState:ep.shock?.state||null,
    structureBroken,flowFlipped,episodeChanged:ep.id!==e.v3EpisodeId};
   const last=rows.at(-1),changed=!last||last.state!==snap.state||last.thesis!==snap.thesis||last.playbook!==snap.playbook||last.shockState!==snap.shockState||
    last.structureBroken!==snap.structureBroken||last.flowFlipped!==snap.flowFlipped||last.episodeChanged!==snap.episodeChanged;
   if(changed&&(!last||x.ts-last.ts>=1000)){rows.push(snap);if(rows.length>120)rows.splice(1,1);}
  }

  const watchDir=thesis.d||reader.dir||ep.d,watch={direction:watchDir?dirLabel(watchDir):null,d:watchDir,
   score:Math.round(Math.abs(reader.evidence.raw)*100),state:bundle.entryReady?'READY':'WATCH',
   reasons:[st.stateLabel,thesis.why,...st.blocked.slice(0,2)],reason:st.summary};
  base.watch=watch;

  if(!prev||x.ts-prev.ts>5000){this.v3Candidate=null;return this.lastView={...base,status:'warming',reason:'ARIS V3 · กำลังต่อเรื่องราวตลาดจากข้อมูลสด',gate:{state:'WATCH',direction:watch.direction,code:'v3_warming',blocker:'รอข้อมูลต่อเนื่อง',waitingFor:[thesis.nextPlan],metrics:gateMetrics(st,bundle,ep)}};}

  if(!thesis.playbook||!thesis.d){
   this.v3Candidate=null;
   return this.lastView={...base,status:'watch',reason:'ARIS V3 · '+st.summary,gate:{state:'WATCH',direction:watch.direction,code:'v3_observe',blocker:thesis.why,waitingFor:[thesis.trigger,thesis.nextPlan],metrics:gateMetrics(st,bundle,ep)}};
  }

  if((ep.issuedLegKeys||[]).includes(ep.legKey)){
   this.v3Candidate=null;
   return this.lastView={...base,status:'issued',reason:'ARIS V3 · เหตุการณ์ตลาดเดิม / ขาโครงสร้างเดิม · ไม่ออกซ้ำ',gate:{state:'WAIT',direction:dirLabel(thesis.d),code:'v3_same_leg',
    blocker:'ไม้ในขาโครงสร้างนี้ถูกใช้แล้ว',waitingFor:['รอการย่อสร้างฐานและกลับมายืน เพื่อสร้างขาใหม่ หรือรอโครงสร้างรีเซ็ต'],metrics:gateMetrics(st,bundle,ep)}};
  }

  if(!bundle.entryReady){
   this.v3Candidate=null;
   const waiting=unique([...bundle.blocked,...bundle.developing,thesis.trigger]).slice(0,7);
   return this.lastView={...base,status:bundle.state==='BLOCKED'?'tracking':'confirming',reason:'ARIS V3 · '+st.summary,
    gate:{state:bundle.state==='BLOCKED'?'WATCH':'READY',direction:dirLabel(thesis.d),code:'v3_independent_gates',blocker:waiting[0]||'เงื่อนไขอิสระยังไม่ครบ',waitingFor:waiting,metrics:gateMetrics(st,bundle,ep)}};
  }

  const d=thesis.d,invalid=invalidationLevel(reader,d,thesis),candidateKey=ep.id+':'+ep.legKey+':'+thesis.playbook+':'+d;
  let cand=this.v3Candidate;
  if(!cand||cand.key!==candidateKey)cand=this.v3Candidate={id:'V3C:'+this.session+':'+x.ts,key:candidateKey,episodeId:ep.id,legKey:ep.legKey,playbook:thesis.playbook,d,startedAt:x.ts,evidenceSince:x.ts,ticks:1,logged:false,invalidationLevel:invalid,stage:'CONFIRMING'};
  else{cand.ticks++;cand.invalidationLevel=invalid;}
  if(!cand.logged){cand.logged=true;this.log('detected',x.ts,{id:cand.id,candidateId:cand.id,episodeId:ep.id,legKey:ep.legKey,setupType:typeFor(thesis.playbook),detectedAt:x.ts,direction:dirLabel(d),price:x.price,
    candidate:{schema:'aris-v3-candidate-v2',episodeId:ep.id,legKey:ep.legKey,thesis:thesis.code,playbook:thesis.playbook,gateStates:gateStates(bundle)}});}
  const confirmMs=CFG.v3ConfirmMs||500;
  if(cand.ticks<(CFG.v3ConfirmTicks||2)||x.ts-cand.evidenceSince<confirmMs){
   return this.lastView={...base,event:{...cand,type:typeFor(thesis.playbook)},status:'confirming',reason:'ARIS V3 · เงื่อนไขทั้ง 4 หมวดผ่านครบ · กำลังยืนยันข้อมูลสด',
    gate:{state:'READY',direction:dirLabel(d),code:'v3_live_confirm',blocker:'รอการยืนยันจากข้อมูลสด',waitingFor:['ยืนยันอย่างน้อย '+(CFG.v3ConfirmTicks||2)+' ครั้ง และ '+confirmMs+' ms'],metrics:gateMetrics(st,bundle,ep)}};
  }

  const out=dirLabel(d),id='ARIS3:'+this.session+':'+x.ts+':'+ep.legIndex,a=Math.max(f.atr,1e-9),entryLow=d>0?x.price-a*.10:x.price-a*.35,entryHigh=d>0?x.price+a*.35:x.price+a*.10;
  const signal={id,version:CFG.version,type:typeFor(thesis.playbook),direction:out,modelDirection:out,decisionPolicy:'aris_v3_blueprint_episode_entry',
   entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,result:'pending',lastObserved:x.ts,event:{...cand,type:typeFor(thesis.playbook)},
   features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,rangePosition:f.rangePosition,
    relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,extensionAtr:d*(x.price-f.ema21)/a,v3State:st.state,v3Playbook:thesis.playbook,v3EpisodeFamily:ep.family},
   dataset:{schema:'btc-t10-training-v2',episodeId:ep.id,episodeSequence:(ep.issuedLegKeys||[]).length+1,path1m:[],context1m:[],entry:{
    capturedAt:x.ts,price:x.price,outputDirection:out,modelDirection:out,decisionPolicy:'aris_v3_blueprint_episode_entry',decisionReason:st.summary,strategyVersion:CFG.version,
    setupType:typeFor(thesis.playbook),setupReason:st.summary,level:x.price,entryLow,entryHigh,atr:f.atr,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,
    ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,
    rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,
    regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,phaseDir:phase.dir,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,
    closeLocation:f.closeLocation,liveVolumePace:phase.liveVolumePace,flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,
    zones:{nearestSupport:nearestZone(z,x.price,'support',a),nearestResistance:nearestZone(z,x.price,'resistance',a)},candleSequence:compactCandles(x.bars,a,10),prior1m:compactBars(x.bars,24),
    arisRevision:CFG.arisRevision,v3State:st.state,v3StateLabel:st.stateLabel,v3EpisodeId:ep.id,v3EpisodeFamily:ep.family,v3StructuralLegKey:ep.legKey,v3LegIndex:ep.legIndex,v3Thesis:thesis,v3Playbook:thesis.playbook,v3PlaybookLabel:st.playbookLabel,
    v3GateStates:gateStates(bundle),v3GateDetails:bundle.gates,v3GatePassCount:bundle.passed,v3Higher:reader.htf,v3Fib:reader.fib,v3MarketState:st.state,v3Structure:reader.structure,
    v3Behavior:behaviorForDataset(reader.behavior),v3Micro:microForDataset(bundle.gates.micro),v3ShockState:ep.shock?.state||null,v3InvalidationPrice:invalid,
    v3Trigger:thesis.trigger,v3Invalidation:thesis.invalidation,v3NextPlan:thesis.nextPlan,v3ReasonNewEntry:(ep.issuedLegKeys||[]).length?'new_structural_leg':'first_entry_in_episode'
   }},reason:'ARIS V3 · '+st.stateLabel+' · '+playbookLabel(thesis.playbook)+' · เงื่อนไขทั้ง 4 หมวดผ่านครบ'};
  this.signals.push(signal);if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(q=>q.result!=='pending');if(i>=0)this.signals.splice(i,1);}
  ep.issuedLegKeys=[...(ep.issuedLegKeys||[]),ep.legKey].slice(-12);ep.lastEntryAt=x.ts;ep.baseConfirmed=false;
  this.v3Candidate=null;this.v3LastSignal=signal;
  this.log('issued',x.ts,{id,episodeId:ep.id,legKey:ep.legKey,legIndex:ep.legIndex,revision:CFG.arisRevision,setupType:typeFor(thesis.playbook),direction:out,price:x.price,v3Playbook:thesis.playbook,gateStates:gateStates(bundle)});
  return this.lastView={...base,event:{...cand,type:typeFor(thesis.playbook),issued:true},watch,status:'new',reason:signal.reason,signal,
   gate:{state:'ENTER',direction:out,code:'v3_enter',blocker:'โครงสร้าง / ตำแหน่งราคา / พฤติกรรมราคา / แรงซื้อขายระยะสั้น ผ่านครบ',waitingFor:[],metrics:gateMetrics(st,bundle,ep)}};
 }
}
function typeFor(p){return ({breakout_continuation:'v3_breakout_continuation',shock_resolution:'v3_shock_resolution',pullback_reclaim:'v3_pullback_reclaim',confirmed_reversal:'v3_confirmed_reversal'})[p]||'v3_observer';}
function gateStates(bundle){const g=bundle?.gates||{};return {structure:g.structure?.state||'—',location:g.location?.state||'—',behavior:g.behavior?.state||'—',micro:g.micro?.state||'—'};}
function gateMetrics(st,bundle,ep){return {episodeId:ep?.id||null,legKey:ep?.legKey||null,legIndex:ep?.legIndex||0,gatePassed:bundle?.passed||0,gateTotal:bundle?.total||4,gateStates:gateStates(bundle),
  flow:bundle?.gates?.micro?.aligned60??bundle?.gates?.micro?.alignedComposite??null,room:bundle?.gates?.location?.room??null,extensionAtr:bundle?.gates?.location?.extension??null,
  structurePassed:bundle?.gates?.structure?.state==='PASS',locationPassed:bundle?.gates?.location?.state==='PASS',behaviorPassed:bundle?.gates?.behavior?.state==='PASS',microPassed:bundle?.gates?.micro?.state==='PASS'};}
function behaviorForDataset(b){return {tags:b.tags,pressure:b.pressure,compression:b.compression,bodyDecay:b.bodyDecay,expansion:b.expansion,unusualVolume:b.unusualVolume,shock:b.shock,
 absorption:b.absorption,exhaustion:b.exhaustion,rejection:b.rejection,engulf:b.engulf,failedExpansion:b.failedExpansion,postShockHold:b.postShockHold,pullbackUp:b.pullbackUp,pullbackDown:b.pullbackDown,reclaimUp:b.reclaimUp,reclaimDown:b.reclaimDown,
 acceptedUp:b.acceptedUp,acceptedDown:b.acceptedDown,live:{bodyAtr:b.live.bodyAtr,rangeAtr:b.live.rangeAtr,closeLoc:b.live.closeLoc,upper:b.live.upper,lower:b.live.lower}};}
function microForDataset(m){return {state:m.state,source:m.source,coverage:m.coverage,flow15s:m.flow15s,flow60s:m.flow60s,flow180s:m.flow180s,composite:m.composite,book:m.book,
 depthImbalance:m.depthImbalance,micropriceBias:m.micropriceBias,spreadBps:m.spreadBps,trades60s:m.trades60s,notional60s:m.notional60s,notional180s:m.notional180s,
 liquidationAligned60s:m.liquidationAligned60s,liquidationAligned180s:m.liquidationAligned180s};}

core.Engine=V3Engine;

const priorAssess=root.ContinuousDirection?.assess;
if(root.ContinuousDirection){
 root.ContinuousDirection.assess=function(x){
  if(CFG.version!=='ARIS-3.0.0')return priorAssess?priorAssess(x):{available:false,reason:'Direction engine unavailable'};
  const st=x.phase?.v3View?.story,f=x.features;if(!x.fresh||!st||!f)return {available:false,reason:x.reason||'ARIS V3 · กำลังสร้างเรื่องราวตลาด'};
  const high=Math.round(st.highEvidence),low=Math.round(st.lowEvidence),direction=Math.abs(high-low)<8?'BALANCED':high>low?'HIGH':'LOW',d=direction==='HIGH'?1:direction==='LOW'?-1:0;
  const room=d?roomAtr(x.zones||[],x.price,d,f.atr):null,extension=d?d*(x.price-f.ema21)/Math.max(f.atr,1e-9):0;
  const risk=st.entryState==='READY'?'ต่ำตามเกณฑ์':st.entryState==='BLOCKED'?'สูง':'กลาง';
  return {available:true,high,low,direction,risk,riskScore:risk==='สูง'?4:risk==='กลาง'?2:0,referencePrice:x.price,referenceTime:x.ts,targetTime:x.ts+CFG.horizonMs,
   reason:'ARIS V3 · '+st.summary+' · '+st.thesis.nextPlan,parts:{episode:st.episodeFamily,state:st.state,thesis:st.thesis.code,playbook:st.playbook,gateStates:Object.fromEntries(Object.entries(st.gates||{}).map(([k,v])=>[k,v.state]))},
   weights:null,regime:x.regime?.v3State||x.regime?.mode||'TRANSITION',coverage:x.coverage||0,room:finite(room)?room:null,extension,retreat:0,v3Story:st};
 };
}
root.ArisV3Engine={version:'ARIS-3.0.0',revision:CFG.arisRevision,confirmedPivots,structureSnapshot,fibContext,higherFrame,behaviorSequence,microContext,readMarket,buildThesis,entryBundle};
})(typeof globalThis!=='undefined'?globalThis:window);
