/* ARIS 4.0 — Sideway Specialist
   Separate plugin. V2/V3 logic is intentionally untouched.
   Mission: trade only clean 1m ranges with edge rejection / failed breakout.
   Hard gates: RANGE -> EDGE -> REJECTION -> NO BREAKOUT. All 4/4 required. */
(function(root){
'use strict';
const core=root.EventSignalV6;
if(!core||!core.Engine||!core.CFG||core.CFG.version!=='ARIS-4.0.0')return;

const BaseEngine=core.Engine,{CFG,features,zones,marketPhase}=core;
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a?.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const median=a=>{if(!a?.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const finite=Number.isFinite;
const dirLabel=d=>d>0?'HIGH':d<0?'LOW':'BALANCED';
const gateState=(pass,developing=false)=>pass?'PASS':developing?'DEVELOPING':'BLOCK';

function trueRangeSeries(bars){
 const out=[];
 for(let i=1;i<(bars||[]).length;i++){
  const q=bars[i],pc=bars[i-1].close;
  out.push(Math.max(q.high-q.low,Math.abs(q.high-pc),Math.abs(q.low-pc)));
 }
 return out;
}
function candle(q,a,p=q?.close||0){
 if(!q)return {d:0,bodyAtr:0,rangeAtr:0,closeLoc:.5,upper:.5,lower:.5,bodyRatio:0};
 const h=Math.max(q.high??p,p),l=Math.min(q.low??p,p),o=q.open??p,c=q.close??p,r=Math.max(h-l,1e-9),body=c-o;
 return {d:Math.sign(body),bodyAtr:Math.abs(body)/Math.max(a,1e-9),rangeAtr:r/Math.max(a,1e-9),closeLoc:clip((c-l)/r,0,1),
  upper:clip((h-Math.max(o,c))/r,0,1),lower:clip((Math.min(o,c)-l)/r,0,1),bodyRatio:Math.abs(body)/r,open:o,close:c,high:h,low:l};
}
function compactBars(bars,n=24){
 return (bars||[]).filter(q=>q.closed).slice(-n).map(q=>[q.time,q.open,q.high,q.low,q.close,q.volume]);
}
function rangeContext(f,x){
 const a=Math.max(f.atr,1e-9),closed=(f.b||[]).filter(q=>q.closed).slice(-(CFG.v4RangeLookback||36));
 if(closed.length<24)return {valid:false,reason:'แท่งปิดยังไม่พอสร้างกรอบ Sideway'};
 const highs=closed.map(q=>q.high).sort((u,v)=>u-v),lows=closed.map(q=>q.low).sort((u,v)=>u-v);
 const k=Math.max(3,Math.min(6,Math.floor(closed.length*.14)));
 const upper=median(highs.slice(-k)),lower=median(lows.slice(0,k)),width=Math.max(upper-lower,1e-9),widthAtr=width/a;
 const center=(upper+lower)/2,pos=clip((x.price-lower)/width,-.5,1.5);

 const band=Math.max(a*(CFG.v4TouchBandAtr||.22),width*.035);
 let upperTouches=0,lowerTouches=0;
 for(const q of closed){
  if(q.high>=upper-band)upperTouches++;
  if(q.low<=lower+band)lowerTouches++;
 }
 const tr=trueRangeSeries(closed),recentAtr=avg(tr.slice(-6)),baseAtr=avg(tr.slice(-24)),atrRatio=baseAtr>0?recentAtr/baseAtr:1;
 const compression=atrRatio<(CFG.v4CompressionAtrRatio||.68)&&f.rangeWidthAtr<=(CFG.v4CompressionWidthAtr||3.0);

 const effScore=1-clip((f.eff-(CFG.v4EffGood||.16))/Math.max(.01,(CFG.v4EffBad||.44)-(CFG.v4EffGood||.16)),0,1);
 const sepScore=1-clip((f.emaSepAtr-(CFG.v4SepGood||.10))/Math.max(.01,(CFG.v4SepBad||.42)-(CFG.v4SepGood||.10)),0,1);
 const slopeScore=1-clip((Math.abs(f.emaSlopeAtr)-(CFG.v4SlopeGood||.08))/Math.max(.01,(CFG.v4SlopeBad||.34)-(CFG.v4SlopeGood||.08)),0,1);
 const crossScore=clip((f.sideCrosses||0)/(CFG.v4CrossTarget||3),0,1);
 const touchScore=clip(Math.min(upperTouches,lowerTouches)/(CFG.v4TouchTarget||2),0,1);
 const widthScore=widthAtr<(CFG.v4MinWidthAtr||1.8)?clip(widthAtr/(CFG.v4MinWidthAtr||1.8),0,1):
  widthAtr>(CFG.v4MaxWidthAtr||8)?clip(1-(widthAtr-(CFG.v4MaxWidthAtr||8))/6,0,1):1;
 let quality=Math.round(100*(effScore*.24+sepScore*.17+slopeScore*.16+crossScore*.14+touchScore*.19+widthScore*.10));
 if(compression)quality=Math.min(quality,62);
 const trendThreat=(Math.abs(f.trend||0)>CFG.v4TrendThreat||Math.abs(f.emaSlopeAtr||0)>CFG.v4SlopeThreat)&&f.eff>CFG.v4TrendEffThreat;
 if(trendThreat)quality=Math.min(quality,54);
 const pass=quality>=CFG.v4RangePass&&!compression&&!trendThreat&&widthAtr>=CFG.v4MinWidthAtr;
 const developing=!pass&&quality>=CFG.v4RangeDevelop&&!trendThreat;
 const state=gateState(pass,developing);
 const reason=pass
  ?'กรอบนิ่งพอ · มีการแตะทั้งสองขอบ · ความชันและประสิทธิภาพการเดินทางต่ำ'
  :compression?'กรอบกำลังบีบตัวมาก เสี่ยงเปลี่ยนจาก Sideway เป็น Breakout'
  :trendThreat?'แรงทิศทางเริ่มเด่นเกินกว่าจะสวนแบบ Sideway'
  :widthAtr<CFG.v4MinWidthAtr?'กรอบแคบกว่า noise ที่ยอมรับได้'
  :'คุณภาพกรอบ Sideway ยังไม่ถึง '+CFG.v4RangePass+'/100';
 return {valid:true,state,pass,quality,reason,upper,lower,center,width,widthAtr,pos,upperTouches,lowerTouches,atrRatio,compression,trendThreat,
  parts:{effScore,sepScore,slopeScore,crossScore,touchScore,widthScore}};
}
function edgeContext(f,x,r){
 if(!r?.valid)return {state:'BLOCK',pass:false,d:0,reason:'ยังไม่มีกรอบใช้งาน'};
 const a=Math.max(f.atr,1e-9),insideAtr=CFG.v4EdgeInsideAtr,outsideAtr=CFG.v4EdgeOutsideAtr;
 const dl=(x.price-r.lower)/a,du=(r.upper-x.price)/a;
 const lower=dl<=insideAtr&&dl>=-outsideAtr,upper=du<=insideAtr&&du>=-outsideAtr;
 let d=0;if(lower&&!upper)d=1;else if(upper&&!lower)d=-1;
 const middle=r.pos>CFG.v4MiddleLow&&r.pos<CFG.v4MiddleHigh;
 const pass=!!d&&!middle;
 const developing=!pass&&!middle&&(Math.min(Math.abs(dl),Math.abs(du))<=insideAtr*1.55);
 const state=gateState(pass,developing);
 const reason=pass?(d>0?'ราคาอยู่ขอบล่างของกรอบ · มอง HIGH กลับเข้ากรอบ':'ราคาอยู่ขอบบนของกรอบ · มอง LOW กลับเข้ากรอบ')
  :middle?'ราคาอยู่กลางกรอบ · V4 ไม่เล่นตรงนี้':'ราคายังไม่เข้าเขตขอบที่ได้เปรียบ';
 return {state,pass,d,reason,position:r.pos,distLowerAtr:dl,distUpperAtr:du,middle};
}
function rejectionContext(f,x,r,e){
 const a=Math.max(f.atr,1e-9),d=e?.d||0,closed=f.b.filter(q=>q.closed),last=closed.at(-1),prev=closed.at(-2),live=x.current||x.bars?.at(-1)||last;
 if(!d||!last)return {state:'BLOCK',pass:false,reason:'ยังไม่มีฝั่งที่ขอบกรอบ'};
 const lm=candle(live,a,x.price),cm=candle(last,a,last.close),pm=candle(prev,a,prev?.close);
 const edge=d>0?r.lower:r.upper;
 const excursion=d>0?Math.max(0,(edge-Math.min(live.low,last.low))/a):Math.max(0,(Math.max(live.high,last.high)-edge)/a);
 const reclaimed=d>0?x.price>=r.lower+CFG.v4ReclaimAtr*a:x.price<=r.upper-CFG.v4ReclaimAtr*a;
 const wick=d>0?Math.max(lm.lower,cm.lower):Math.max(lm.upper,cm.upper);
 const closeGood=d>0?Math.max(lm.closeLoc,cm.closeLoc):Math.max(1-lm.closeLoc,1-cm.closeLoc);
 const engulf=d>0?(last.close>last.open&&prev&&last.close>=prev.open&&last.open<=prev.close):(last.close<last.open&&prev&&last.close<=prev.open&&last.open>=prev.close);
 const failedBreak=excursion>=CFG.v4ExcursionAtr&&reclaimed;
 const rejection=wick>=CFG.v4WickMin&&closeGood>=CFG.v4CloseMin;
 const flow=d*(x.flow||0),flowNotOpposing=flow>=-CFG.v4MaxOpposingFlow;
 const pass=(failedBreak||(rejection&&reclaimed))&&flowNotOpposing;
 const developing=!pass&&(failedBreak||rejection||reclaimed);
 const state=gateState(pass,developing);
 const reason=pass?(failedBreak?'ทะลุขอบแล้วกลับเข้ากรอบสำเร็จ · Failed Breakout':'มีไส้/ตำแหน่งปิดยืนยันการ Reject ที่ขอบ')
  :!flowNotOpposing?'แรงซื้อขายระยะสั้นยังสวนการกลับเข้ากรอบ'
  :failedBreak||rejection?'เห็นการ Reject แล้ว แต่ยังต้องกลับมายืนในกรอบให้ชัด':'ยังไม่มีหลักฐาน Reject จากขอบกรอบ';
 return {state,pass,reason,failedBreak,rejection,reclaimed,excursionAtr:excursion,wickRatio:wick,closeQuality:closeGood,engulf,flow,setup:failedBreak?'failed_breakout':'range_rejection'};
}
function breakoutSafety(f,x,r,e,rej){
 const a=Math.max(f.atr,1e-9),d=e?.d||0,closed=f.b.filter(q=>q.closed),last=closed.at(-1),prev=closed.at(-2),live=x.current||x.bars?.at(-1)||last;
 if(!d||!last)return {state:'BLOCK',pass:false,hardBlock:false,risk:100,reason:'ยังระบุขอบที่จะสวนไม่ได้'};
 const outward=-d,edge=d>0?r.lower:r.upper;
 const lastOut=outward>0?(last.close-edge)/a:(edge-last.close)/a;
 const prevOut=prev?(outward>0?(prev.close-edge)/a:(edge-prev.close)/a):0;
 const liveOut=outward>0?(x.price-edge)/a:(edge-x.price)/a;
 const m=candle(live,a,x.price),flowOut=outward*(x.flow||0);
 const acceptedCloses=lastOut>=CFG.v4AcceptedCloseAtr&&prevOut>=CFG.v4AcceptedCloseAtr;
 const impulseOut=liveOut>=CFG.v4LiveBreakAtr&&m.bodyAtr>=CFG.v4BreakBodyAtr&&m.rangeAtr>=CFG.v4BreakRangeAtr&&flowOut>=CFG.v4BreakFlow;
 const atrExpand=r.atrRatio>=CFG.v4BreakAtrExpansion;
 const hardBlock=acceptedCloses||impulseOut||(atrExpand&&liveOut>=CFG.v4AcceptedCloseAtr&&flowOut>0);
 let risk=0;
 if(lastOut>0)risk+=22;if(prevOut>0)risk+=18;if(liveOut>0)risk+=18;
 if(m.bodyAtr>=CFG.v4BreakBodyAtr)risk+=15;if(flowOut>=CFG.v4BreakFlow)risk+=15;if(atrExpand)risk+=12;
 risk=clip(risk,0,100);
 const pass=!hardBlock&&risk<CFG.v4BreakRiskPass;
 const developing=!hardBlock&&!pass;
 const state=gateState(pass,developing);
 const reason=hardBlock?'ตลาดกำลังยอมรับราคานอกกรอบ · ห้ามสวน Breakout'
  :pass?'ยังไม่พบการยอมรับราคานอกกรอบ · ปลอดภัยพอสำหรับ Mean Reversion'
  :'มีแรงพยายามออกจากกรอบ ต้องรอให้ความเสี่ยง Breakout ลดลง';
 return {state,pass,hardBlock,risk,reason,lastOutAtr:lastOut,prevOutAtr:prevOut,liveOutAtr:liveOut,flowOut,atrExpand,acceptedCloses,impulseOut};
}
function buildStory(f,x,r,e,rej,safe){
 const gates={range:{state:r.state,pass:r.pass,reason:r.reason,quality:r.quality},
  edge:{state:e.state,pass:e.pass,reason:e.reason,rangePosition:r.pos},
  rejection:{state:rej.state,pass:rej.pass,reason:rej.reason,setup:rej.setup,excursionAtr:rej.excursionAtr},
  breakout:{state:safe.state,pass:safe.pass,reason:safe.reason,risk:safe.risk,hardBlock:safe.hardBlock}};
 const passed=Object.values(gates).filter(g=>g.state==='PASS').length,d=e.d||0;
 const all=passed===4&&d!==0&&!safe.hardBlock;
 const setup=rej.failedBreak?'v4_failed_breakout':'v4_range_rejection';
 const state=safe.hardBlock?'BREAKOUT_THREAT':r.pass?(e.pass?'RANGE_EDGE':'RANGE_WAIT'):(r.compression?'COMPRESSION':'NOT_RANGE');
 const labels={BREAKOUT_THREAT:'เสี่ยงหลุดกรอบ',RANGE_EDGE:'อยู่ขอบ Sideway',RANGE_WAIT:'Sideway แต่ยังไม่ถึงขอบ',COMPRESSION:'กรอบกำลังบีบ',NOT_RANGE:'ไม่ใช่ Sideway คุณภาพพอ'};
 const confidence=Math.round(clip(50+(r.quality-50)*.30+(rej.pass?10:0)+(rej.failedBreak?5:0)-(safe.risk*.18),50,82));
 return {schema:'aris-v4-story-v1',state,stateLabel:labels[state]||state,direction:dirLabel(d),setup,setupLabel:rej.failedBreak?'Failed Breakout':'Range Rejection',
  range:{upper:r.upper,lower:r.lower,center:r.center,widthAtr:r.widthAtr,position:r.pos,quality:r.quality,touches:{upper:r.upperTouches,lower:r.lowerTouches}},
  gates,gatePassed:passed,gateTotal:4,entryState:all?'READY':safe.hardBlock?'BLOCKED':'WATCH',confidence,
  summary:(labels[state]||state)+' · '+(d>0?'มอง HIGH จากขอบล่าง':d<0?'มอง LOW จากขอบบน':'ยังไม่เลือกฝั่ง')+' · ผ่าน '+passed+'/4',
  trigger:all?'ยืนยัน Reject และไม่มี Breakout acceptance':'รอให้ Range / Edge / Rejection / No Breakout ผ่านครบ 4/4'};
}
function gateMetrics(st){
 const g=st.gates||{};
 return {gatePassed:st.gatePassed,gateTotal:4,gateStates:{range:g.range?.state,edge:g.edge?.state,rejection:g.rejection?.state,breakout:g.breakout?.state},
  rangeQuality:g.range?.quality??null,rangePosition:g.edge?.rangePosition??null,breakoutRisk:g.breakout?.risk??null,
  excursionAtr:g.rejection?.excursionAtr??null,fullReady:st.entryState==='READY',entryMode:'FULL'};
}

class V4Engine extends BaseEngine{
 constructor(saved={}){
  super(saved);
  const mem=saved.v4Memory&&typeof saved.v4Memory==='object'?saved.v4Memory:{};
  this.v4Candidate=null;this.v4LastSignal=null;
  this.v4Armed={HIGH:mem.armed?.HIGH!==false,LOW:mem.armed?.LOW!==false};
 }
 serialize(){const base=super.serialize();return {...base,v4Memory:{armed:{...this.v4Armed}}};}
 reset(reason,time){this.v4Candidate=null;this.v4LastSignal=null;this.v4Armed={HIGH:true,LOW:true};return super.reset(reason,time);}
 finalizeReview(sig){
  super.finalizeReview(sig);
  if(sig.version!=='ARIS-4.0.0'||!sig.dataset?.entry||!sig.dataset?.review)return;
  const e=sig.dataset.entry;
  sig.dataset.review.v4={revision:e.arisRevision,setup:e.v4Setup,rangeQuality:e.v4RangeQuality,rangePosition:e.v4RangePosition,
   breakoutRisk:e.v4BreakoutRisk,gateStates:e.v4GateStates,causality:'entry_snapshot_only'};
  sig.dataset.review.summary+=' · V4 '+(e.v4Setup||sig.type)+' · Sideway-only 4/4';
 }
 step(x){
  const f=features(x.bars,x.price,x.horizonBars||10);
  if(!f)return {status:'warmup',reason:'ARIS V4 · รอแท่งสมบูรณ์อย่างน้อย 35 แท่ง',signal:null};
  if(!x.fresh||!finite(x.price)||!finite(x.ts)||x.price<=0){this.previous=null;this.v4Candidate=null;return this.lastView={f,status:'offline',signal:null,event:null,reason:'ARIS V4 · พักจน Futures สดและต่อเนื่อง'};}
  if(x.id===this.lastId)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  if(this.previous&&x.ts<=this.previous.ts)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  const prev=this.previous;this.lastId=x.id;this.previous={price:x.price,ts:x.ts};

  const z=zones(x.bars||[],f.atr),regime=this.trackRegime(f,x.price),phase=marketPhase(f,x,regime);x.phase=phase;
  const r=rangeContext(f,x),e=edgeContext(f,x,r),rej=rejectionContext(f,x,r,e),safe=breakoutSafety(f,x,r,e,rej),st=buildStory(f,x,r,e,rej,safe);
  const d=e.d||0,out=dirLabel(d),base={f,z,regime:{...regime,v4State:st.state},phase:{...phase,v4View:{story:st,high:d>0?st.confidence:100-st.confidence,low:d<0?st.confidence:100-st.confidence,direction:out}},
   v4Story:st,signal:null,event:null,continuation:0,reversal:0};
  base.watch={direction:d?out:null,d,score:st.confidence,state:st.entryState==='READY'?'READY':'WATCH',reasons:Object.values(st.gates).filter(g=>g.state!=='PASS').map(g=>g.reason).slice(0,4),reason:st.summary};

  if(r.pos>=.38&&r.pos<=.62){this.v4Armed.HIGH=true;this.v4Armed.LOW=true;}
  if(!prev||x.ts-prev.ts>5000){this.v4Candidate=null;return this.lastView={...base,status:'warming',reason:'ARIS V4 · กำลังต่อข้อมูลสดก่อนอ่าน Sideway',
   gate:{state:'WATCH',direction:d?out:null,code:'v4_warming',blocker:'รอข้อมูลต่อเนื่อง',waitingFor:['รอข้อมูลสดต่อเนื่อง'],metrics:gateMetrics(st)}};}

  if(safe.hardBlock){this.v4Candidate=null;return this.lastView={...base,status:'watch',reason:'ARIS V4 · '+safe.reason,
   gate:{state:'WAIT',direction:d?out:null,code:'v4_breakout_threat',blocker:safe.reason,waitingFor:['รอราคากลับเข้ากรอบและ Breakout risk ลดลง'],metrics:gateMetrics(st)}};}

  if(st.gatePassed<4||!d){
   this.v4Candidate=null;
   const waiting=Object.values(st.gates).filter(g=>g.state!=='PASS').map(g=>g.reason).slice(0,4);
   return this.lastView={...base,status:st.gatePassed>=2?'confirming':'watch',reason:'ARIS V4 · '+st.summary,
    gate:{state:st.gatePassed>=3?'READY':'WATCH',direction:d?out:null,code:'v4_four_gates',blocker:waiting[0]||'รอ 4/4',waitingFor:waiting,metrics:gateMetrics(st)}};
  }

  if(this.v4Armed[out]===false){
   this.v4Candidate=null;return this.lastView={...base,status:'issued',reason:'ARIS V4 · ขอบนี้เพิ่งใช้สัญญาณไปแล้ว · รอราคาหมุนกลับกลางกรอบเพื่อ re-arm',
    gate:{state:'WAIT',direction:out,code:'v4_edge_used',blocker:'ขอบเดิมถูกใช้แล้ว',waitingFor:['รอราคากลับกลางกรอบก่อนเล่นขอบเดิมอีกครั้ง'],metrics:gateMetrics(st)}};
  }

  const barTime=f.b.at(-1)?.time||0,key=[barTime,out,st.setup].join(':');
  let cand=this.v4Candidate;
  if(!cand||cand.key!==key)cand=this.v4Candidate={id:'V4C:'+this.session+':'+x.ts,key,d,setup:st.setup,startedAt:x.ts,evidenceSince:x.ts,ticks:1};
  else cand.ticks++;
  if(cand.ticks<CFG.v4ConfirmTicks||x.ts-cand.evidenceSince<CFG.v4ConfirmMs){
   return this.lastView={...base,event:{...cand,type:st.setup},status:'confirming',reason:'ARIS V4 · 4/4 ผ่าน · ยืนยันข้อมูลสดสั้น ๆ ก่อนปล่อยไม้',
    gate:{state:'READY',direction:out,code:'v4_confirm',blocker:'รอ live confirm',waitingFor:['ยืนยัน '+CFG.v4ConfirmTicks+' ครั้ง และ '+CFG.v4ConfirmMs+' ms'],metrics:gateMetrics(st)}};
  }

  const id='ARIS4:'+this.session+':'+x.ts+':'+barTime,a=Math.max(f.atr,1e-9);
  const signal={id,version:CFG.version,type:st.setup,direction:out,modelDirection:out,decisionPolicy:'aris_v4_sideway_four_gate',
   entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,result:'pending',lastObserved:x.ts,
   event:{...cand,type:st.setup},features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,regime:'RANGE',marketPhase:phase.phase,rangePosition:r.pos,
    relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,v4RangeQuality:r.quality,v4BreakoutRisk:safe.risk},
   dataset:{schema:'btc-t10-training-v2',path1m:[],context1m:[],entry:{
    capturedAt:x.ts,price:x.price,outputDirection:out,modelDirection:out,decisionPolicy:'aris_v4_sideway_four_gate',decisionReason:st.summary,strategyVersion:CFG.version,
    setupType:st.setup,setupReason:st.summary,level:x.price,atr:f.atr,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,
    ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:r.upper,rangeLow:r.lower,fair:r.center,rangeWidthAtr:r.widthAtr,
    rangePosition:r.pos,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,
    closeLocation:f.closeLocation,flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,prior1m:compactBars(x.bars,24),
    arisRevision:CFG.arisRevision,v4Setup:st.setup,v4State:st.state,v4RangeQuality:r.quality,v4RangePosition:r.pos,v4BreakoutRisk:safe.risk,
    v4GateStates:gateMetrics(st).gateStates,v4Gates:st.gates,v4Range:st.range,v4ExcursionAtr:rej.excursionAtr,v4FailedBreak:rej.failedBreak
   }},reason:'ARIS V4 · '+st.setupLabel+' · Sideway 4/4 ผ่านครบ'};
  this.signals.push(signal);if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(q=>q.result!=='pending');if(i>=0)this.signals.splice(i,1);}
  this.v4Armed[out]=false;this.v4Candidate=null;this.v4LastSignal=signal;
  this.log('issued',x.ts,{id,setupType:st.setup,direction:out,price:x.price,rangeQuality:r.quality,breakoutRisk:safe.risk,gateStates:gateMetrics(st).gateStates});
  return this.lastView={...base,event:{...cand,type:st.setup,issued:true},status:'new',reason:signal.reason,signal,
   gate:{state:'ENTER',direction:out,code:'v4_enter',blocker:'Range / Edge / Rejection / No Breakout ผ่านครบ 4/4',waitingFor:[],metrics:gateMetrics(st)}};
 }
}

core.Engine=V4Engine;

const priorAssess=root.ContinuousDirection?.assess;
if(root.ContinuousDirection){
 root.ContinuousDirection.assess=function(x){
  if(CFG.version!=='ARIS-4.0.0')return priorAssess?priorAssess(x):{available:false,reason:'Direction engine unavailable'};
  const st=x.phase?.v4View?.story;
  if(!x.fresh||!st)return {available:false,reason:x.reason||'ARIS V4 · กำลังตรวจกรอบ Sideway'};
  const d=st.direction==='HIGH'?1:st.direction==='LOW'?-1:0;
  let high=50;
  if(d>0)high=st.entryState==='READY'?st.confidence:Math.round(50+(st.confidence-50)*.45);
  else if(d<0)high=100-(st.entryState==='READY'?st.confidence:Math.round(50+(st.confidence-50)*.45));
  const low=100-high,direction=Math.abs(high-low)<8?'BALANCED':high>low?'HIGH':'LOW';
  const br=st.gates?.breakout?.risk??100,risk=br>=CFG.v4BreakRiskBlock?'สูง':st.entryState==='READY'?'ต่ำตามเกณฑ์':'กลาง';
  return {available:true,high,low,direction,risk,riskScore:risk==='สูง'?4:risk==='กลาง'?2:0,referencePrice:x.price,referenceTime:x.ts,targetTime:x.ts+CFG.horizonMs,
   reason:'ARIS V4 · '+st.summary+' · '+st.trigger,parts:{rangeQuality:st.range?.quality,rangePosition:st.range?.position,breakoutRisk:br,setup:st.setup,gateStates:Object.fromEntries(Object.entries(st.gates||{}).map(([k,v])=>[k,v.state]))},
   weights:null,regime:st.state,coverage:x.coverage||0,room:null,extension:0,retreat:0,v4Story:st};
 };
}
root.ArisV4Engine={version:'ARIS-4.0.0',revision:CFG.arisRevision,rangeContext,edgeContext,rejectionContext,breakoutSafety,buildStory};
})(typeof globalThis!=='undefined'?globalThis:window);
