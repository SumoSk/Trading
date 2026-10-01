/* ARIS 3.2 — Stage-Adaptive Event Engine
   Block 1: standalone Feature Brain + Structure Brain + Stage Brain.
   This file intentionally does NOT import decision logic from v2.js / v3.js / v31.js / v4.js.
   No entry signal is emitted in Block 1. */

(function(root){
'use strict';

const VERSION='ARIS-3.2.0';
const REVISION='stage-brain-b1-r4';

const CFG=Object.freeze({
  version:VERSION,
  revision:REVISION,
  horizonMs:600000,

  // Data sufficiency
  minBars1m:40,
  atrBars:14,
  featureLookback:80,
  pivotLookback:70,

  // Structure
  pivotWing:2,
  pivotEqualAtr:.03,
  structureBreakAtr:.08,

  // Range / compression
  rangeLookback:18,
  rangeGuardBars:6,
  rangeMinWidthAtr:1.60,
  rangeMaxWidthAtr:8.50,
  rangeEdgeBand:.24,
  rangeEfficiencyGood:.22,
  rangeSlopeGood:.15,
  compressionRecentBars:4,
  compressionPriorBars:6,
  compressionRangeRatio:.72,
  compressionBodyRatio:.72,

  // Breakout
  breakoutBufferAtr:.06,
  breakoutAcceptedAtr:.04,
  breakoutRecaptureAtr:.03,
  breakoutCloseMin:.58,
  breakoutExpansionRangeAtr:.55,
  breakoutExpansionBodyAtr:.30,

  // Trend / exhaustion / transition
  trendEffMin:.30,
  trendSlopeMin:.16,
  trendSepMin:.18,
  exhaustionExtensionAtr:1.85,
  exhaustionBodyDecayRatio:.72,
  transitionEffDrop:.18,
  transitionSlopeDrop:.12,
  transitionProgressRatio:.62,

  // Stage confidence
  softmaxTemperature:.19,
  confidenceFloor:.01
});

const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=Number.isFinite;
const avg=a=>a?.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const sum=a=>a?.reduce((s,v)=>s+v,0)||0;
const median=a=>{
  if(!a?.length)return 0;
  const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
};
const sign=(v,dead=0)=>v>dead?1:v<-dead?-1:0;
const safeDiv=(a,b,fallback=0)=>Math.abs(b)>1e-12?a/b:fallback;
const unique=a=>[...new Set((a||[]).filter(Boolean))];

function ema(values,n){
  if(!values?.length)return [];
  const k=2/(n+1);
  let x=values[0];
  return values.map(v=>(x=x+k*(v-x)));
}

function trueRangeSeries(bars){
  const out=[];
  for(let i=1;i<bars.length;i++){
    const q=bars[i],p=bars[i-1].close;
    out.push(Math.max(q.high-q.low,Math.abs(q.high-p),Math.abs(q.low-p)));
  }
  return out;
}

function atr(bars,n=14){
  const tr=trueRangeSeries(bars);
  return avg(tr.slice(-n));
}

function sanitizeBars(rows){
  return (rows||[])
    .filter(q=>q&&finite(+q.open)&&finite(+q.high)&&finite(+q.low)&&finite(+q.close))
    .map(q=>({
      time:+(q.time??q.openTime??q.ts??0),
      open:+q.open,high:+q.high,low:+q.low,close:+q.close,
      volume:finite(+q.volume)?+q.volume:0,
      closed:q.closed!==false
    }))
    .sort((a,b)=>a.time-b.time);
}

function candleMetric(q,a){
  const r=Math.max(q.high-q.low,1e-9),body=q.close-q.open;
  return {
    d:Math.sign(body),
    bodyAtr:Math.abs(body)/Math.max(a,1e-9),
    rangeAtr:r/Math.max(a,1e-9),
    closeLoc:clip((q.close-q.low)/r),
    upper:clip((q.high-Math.max(q.open,q.close))/r),
    lower:clip((Math.min(q.open,q.close)-q.low)/r),
    bodyRatio:Math.abs(body)/r
  };
}

function pathEfficiency(closes,n){
  const c=closes.slice(-(n+1));
  if(c.length<n+1)return 0;
  let path=0;
  for(let i=1;i<c.length;i++)path+=Math.abs(c[i]-c[i-1]);
  return path?safeDiv(Math.abs(c.at(-1)-c[0]),path):0;
}

function signedProgress(closes,n,a){
  if(closes.length<n+1)return 0;
  return safeDiv(closes.at(-1)-closes.at(-(n+1)),Math.max(a,1e-9));
}

function regressionSlope(values,n,a){
  const y=values.slice(-n);
  if(y.length<3)return 0;
  const xm=(y.length-1)/2,ym=avg(y);
  let num=0,den=0;
  for(let i=0;i<y.length;i++){
    const dx=i-xm;
    num+=dx*(y[i]-ym);
    den+=dx*dx;
  }
  return safeDiv(safeDiv(num,den),Math.max(a,1e-9));
}

function confirmedPivots(bars,a){
  const b=bars.filter(q=>q.closed).slice(-CFG.pivotLookback),raw=[],w=CFG.pivotWing;
  for(let i=w;i<b.length-w;i++){
    const q=b[i],left=b.slice(i-w,i),right=b.slice(i+1,i+w+1);
    if(left.every(v=>q.high>v.high)&&right.every(v=>q.high>=v.high))raw.push({i,type:'H',price:q.high,time:q.time});
    if(left.every(v=>q.low<v.low)&&right.every(v=>q.low<=v.low))raw.push({i,type:'L',price:q.low,time:q.time});
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
  const highs=piv.filter(q=>q.type==='H'),lows=piv.filter(q=>q.type==='L');
  const h1=highs.at(-1),h0=highs.at(-2),l1=lows.at(-1),l0=lows.at(-2),eq=a*CFG.pivotEqualAtr;
  const highTag=h1&&h0?(h1.price>h0.price+eq?'HH':h1.price<h0.price-eq?'LH':'EH'):'—';
  const lowTag=l1&&l0?(l1.price>l0.price+eq?'HL':l1.price<l0.price-eq?'LL':'EL'):'—';
  let dir=0;
  if(highTag==='HH'&&lowTag==='HL')dir=1;
  else if(highTag==='LH'&&lowTag==='LL')dir=-1;
  const mixed=(highTag==='HH'||lowTag==='HL')&&(highTag==='LH'||lowTag==='LL');
  const lastLeg=piv.length>=2?{
    start:piv.at(-2),end:piv.at(-1),
    d:piv.at(-1).price>piv.at(-2).price?1:-1,
    moveAtr:Math.abs(piv.at(-1).price-piv.at(-2).price)/Math.max(a,1e-9)
  }:null;
  return {pivots:piv,highs,lows,lastHigh:h1,prevHigh:h0,lastLow:l1,prevLow:l0,
    highTag,lowTag,dir,integrity:dir>0?'BULLISH':dir<0?'BEARISH':mixed?'MIXED':'UNCONFIRMED',lastLeg};
}

function rangeReference(bars,a){
  const closed=bars.filter(q=>q.closed);
  const guard=Math.max(3,CFG.rangeGuardBars||6);
  const base=closed.slice(-(CFG.rangeLookback+guard),-guard);
  if(base.length<Math.max(10,CFG.rangeLookback-4))return null;
  const high=Math.max(...base.map(q=>q.high)),low=Math.min(...base.map(q=>q.low));
  const width=Math.max(high-low,1e-9),widthAtr=width/Math.max(a,1e-9),mid=(high+low)/2;
  const current=closed.at(-1)?.close??mid;
  const position=clip((current-low)/width);
  let crosses=0;
  for(let i=1;i<base.length;i++){
    if((base[i-1].close-mid)*(base[i].close-mid)<0)crosses++;
  }
  const touchBand=a*CFG.rangeEdgeBand;
  const lowerTouches=base.filter(q=>q.low<=low+touchBand).length;
  const upperTouches=base.filter(q=>q.high>=high-touchBand).length;
  const baseCloses=base.map(q=>q.close);
  const baseEff=pathEfficiency(baseCloses,Math.min(10,baseCloses.length-1));
  return {high,low,mid,width,widthAtr,position,crosses,lowerTouches,upperTouches,baseEff,startTime:base[0].time,endTime:base.at(-1).time};
}

function volumeContext(bars){
  const closed=bars.filter(q=>q.closed),v=closed.map(q=>q.volume||0),last=v.at(-1)||0;
  const med20=Math.max(median(v.slice(-21,-1)),1e-9),avg3=Math.max(avg(v.slice(-4,-1)),1e-9);
  return {
    rel:last/med20,
    ratio3:last/avg3,
    median20:med20,
    last
  };
}

function sequenceContext(bars,a){
  const closed=bars.filter(q=>q.closed),rows=closed.slice(-12),m=rows.map(q=>({...candleMetric(q,a),bar:q}));
  const recent=m.slice(-CFG.compressionRecentBars),prior=m.slice(-(CFG.compressionRecentBars+CFG.compressionPriorBars),-CFG.compressionRecentBars);
  const recentRange=avg(recent.map(x=>x.rangeAtr)),priorRange=avg(prior.map(x=>x.rangeAtr));
  const recentBody=avg(recent.map(x=>x.bodyAtr)),priorBody=avg(prior.map(x=>x.bodyAtr));
  const compressionRangeRatio=safeDiv(recentRange,Math.max(priorRange,1e-9),1);
  const compressionBodyRatio=safeDiv(recentBody,Math.max(priorBody,1e-9),1);
  const pressure=clip(avg(recent.map(x=>x.d*(x.bodyAtr*.55+(x.d>0?x.closeLoc:1-x.closeLoc)*.45))),-1,1);
  const upFollow=recent.filter(x=>x.d>0&&x.closeLoc>=.62).length/recent.length;
  const downFollow=recent.filter(x=>x.d<0&&x.closeLoc<=.38).length/recent.length;
  const rejectionUp=avg(recent.map(x=>x.lower>=.30&&x.closeLoc>=.48?1:0));
  const rejectionDown=avg(recent.map(x=>x.upper>=.30&&x.closeLoc<=.52?1:0));
  const bodyDecay=safeDiv(recentBody,Math.max(priorBody,1e-9),1);

  const highs=rows.map(q=>q.high),lows=rows.map(q=>q.low);
  const recentHighProgress=highs.length>=6?Math.max(0,Math.max(...highs.slice(-3))-Math.max(...highs.slice(-6,-3)))/Math.max(a,1e-9):0;
  const recentLowProgress=lows.length>=6?Math.max(0,Math.min(...lows.slice(-6,-3))-Math.min(...lows.slice(-3)))/Math.max(a,1e-9):0;
  const priorHighProgress=highs.length>=9?Math.max(0,Math.max(...highs.slice(-6,-3))-Math.max(...highs.slice(-9,-6)))/Math.max(a,1e-9):0;
  const priorLowProgress=lows.length>=9?Math.max(0,Math.min(...lows.slice(-9,-6))-Math.min(...lows.slice(-6,-3)))/Math.max(a,1e-9):0;

  return {
    metrics:m,recentRange,priorRange,recentBody,priorBody,
    compressionRangeRatio,compressionBodyRatio,pressure,
    followUp:upFollow,followDown:downFollow,
    rejectionUp,rejectionDown,bodyDecay,
    recentHighProgress,recentLowProgress,priorHighProgress,priorLowProgress
  };
}

function breakoutContext(bars,a,range,vol,seq,flow){
  if(!range)return {attemptDir:0,acceptedDir:0,failedDir:0,outsideAtr:0,recaptureStrength:0,baseContext:false,reason:'no_reference_range'};
  const boundedBase=range.baseEff<=.52&&(range.crosses>=1||(range.lowerTouches>=2&&range.upperTouches>=2));
  const compressionBase=seq.compressionRangeRatio<=.82&&seq.compressionBodyRatio<=.88;
  const baseContext=boundedBase||compressionBase;
  if(!baseContext)return {attemptDir:0,acceptedDir:0,failedDir:0,outsideAtr:0,recaptureStrength:0,baseContext:false,reason:'no_breakout_base'};
  const closed=bars.filter(q=>q.closed),last=closed.at(-1),prev=closed.at(-2),recent=closed.slice(-7);
  const upOutside=(last.close-range.high)/Math.max(a,1e-9),downOutside=(range.low-last.close)/Math.max(a,1e-9);
  const attemptDir=upOutside>=CFG.breakoutBufferAtr?1:downOutside>=CFG.breakoutBufferAtr?-1:0;
  const lastM=candleMetric(last,a);
  const expansion=lastM.rangeAtr>=CFG.breakoutExpansionRangeAtr||lastM.bodyAtr>=CFG.breakoutExpansionBodyAtr;
  const volPart=Math.max(vol.rel,vol.ratio3)>=1.10;
  const alignedClose=attemptDir>0?lastM.closeLoc:attemptDir<0?1-lastM.closeLoc:.5;
  const flowAligned=attemptDir&&finite(flow)?attemptDir*flow:0;

  let acceptedDir=0;
  if(attemptDir&&alignedClose>=CFG.breakoutCloseMin&&expansion&&(volPart||flowAligned>.02))acceptedDir=attemptDir;
  if(attemptDir&&prev){
    const prevOutside=attemptDir>0?(prev.close-range.high)/Math.max(a,1e-9):(range.low-prev.close)/Math.max(a,1e-9);
    if(prevOutside>=CFG.breakoutAcceptedAtr&&alignedClose>=.52)acceptedDir=attemptDir;
  }

  let failedDir=0,recaptureStrength=0;
  const priorOutsideUp=recent.slice(0,-1).some(q=>q.high>=range.high+a*CFG.breakoutBufferAtr);
  const priorOutsideDown=recent.slice(0,-1).some(q=>q.low<=range.low-a*CFG.breakoutBufferAtr);
  if(priorOutsideUp&&last.close<=range.high-a*CFG.breakoutRecaptureAtr){
    failedDir=-1;
    recaptureStrength=clip((range.high-last.close)/(a*.40));
  }else if(priorOutsideDown&&last.close>=range.low+a*CFG.breakoutRecaptureAtr){
    failedDir=1;
    recaptureStrength=clip((last.close-range.low)/(a*.40));
  }

  return {
    attemptDir,acceptedDir,failedDir,
    outsideAtr:attemptDir>0?upOutside:attemptDir<0?downOutside:0,
    expansion,volPart,flowAligned,alignedClose,recaptureStrength,
    priorOutsideUp,priorOutsideDown,baseContext:true,reason:'base_context_confirmed'
  };
}

function higherFrameContext(rows){
  const b=sanitizeBars(rows).filter(q=>q.closed).slice(-60);
  if(b.length<20)return {available:false,dir:0,eff:0,slope:0,sep:0};
  const a=Math.max(atr(b,14),b.at(-1).close*.00005,1e-9),c=b.map(q=>q.close),e8=ema(c,8),e21=ema(c,21);
  const eff=pathEfficiency(c,10),slope=regressionSlope(e21,5,a),sep=(e8.at(-1)-e21.at(-1))/a;
  return {available:true,dir:sign(sep*.55+slope*.45,.08),eff,slope,sep};
}

function featureBrain(input){
  const bars=sanitizeBars(input?.bars1m??input?.bars??[]);
  if(bars.length<CFG.minBars1m)return {ready:false,reason:'need_more_1m_bars',have:bars.length,need:CFG.minBars1m};

  const b=bars.slice(-CFG.featureLookback),closed=b.filter(q=>q.closed),price=finite(+input.price)?+input.price:closed.at(-1).close;
  const a=Math.max(atr(closed,CFG.atrBars),price*.00004,1e-9),c=closed.map(q=>q.close),e8=ema(c,8),e21=ema(c,21);
  const seq=sequenceContext(closed,a),vol=volumeContext(closed),range=rangeReference(closed,a),sw=confirmedPivots(closed,a);
  const eff6=pathEfficiency(c,6),eff12=pathEfficiency(c,12),eff24=pathEfficiency(c,24);
  const slope5=regressionSlope(e21,5,a),slope12=regressionSlope(e21,12,a),slope24=regressionSlope(e21,24,a),sep=(e8.at(-1)-e21.at(-1))/a;
  const mom3=signedProgress(c,3,a),mom8=signedProgress(c,8,a),mom16=signedProgress(c,16,a),mom24=signedProgress(c,24,a);
  const momAccel=mom3-safeDiv(mom8,8/3);
  const extension=(price-e21.at(-1))/a;
  const rangePosition=range?clip((price-range.low)/Math.max(range.width,1e-9)):.5;
  const flow=finite(+input.flow)?+input.flow:0;
  const book=finite(+input.book)?+input.book:0;
  const breakout=breakoutContext(closed,a,range,vol,seq,flow);
  const htf={m5:higherFrameContext(input.bars5m),m15:higherFrameContext(input.bars15m)};

  const current=candleMetric(closed.at(-1),a);
  const priorEff=pathEfficiency(c.slice(0,-3),12);
  const effDrop=Math.max(0,priorEff-eff12);
  const slopeDrop=Math.max(0,Math.abs(slope12)-Math.abs(slope5));

  return {
    ready:true,price,atr:a,bars:closed,
    ema8:e8.at(-1),ema21:e21.at(-1),emaSepAtr:sep,emaSlope5:slope5,emaSlope12:slope12,emaSlope24:slope24,
    eff6,eff12,eff24,priorEff,effDrop,slopeDrop,
    momentum3:mom3,momentum8:mom8,momentum16:mom16,momentum24:mom24,momentumAccel:momAccel,
    extensionAtr:extension,current,seq,vol,range,rangePosition,sw,breakout,flow,book,htf
  };
}

function structureBrain(f){
  if(!f.ready)return {ready:false};
  const s=f.sw,price=f.price,a=f.atr;
  const protectedLow=s.lastLow?.price??Math.min(...f.bars.slice(-8).map(q=>q.low));
  const protectedHigh=s.lastHigh?.price??Math.max(...f.bars.slice(-8).map(q=>q.high));
  const bullBroken=price<protectedLow-a*CFG.structureBreakAtr;
  const bearBroken=price>protectedHigh+a*CFG.structureBreakAtr;
  const trendDir=sign(f.emaSepAtr*.38+f.emaSlope5*.27+f.momentum8*.20+f.seq.pressure*.15,.10);
  const dir=s.dir||trendDir;
  const strength=clip(
    Math.abs(f.emaSepAtr)*.22+
    Math.abs(f.emaSlope5)*.22+
    f.eff12*.32+
    Math.abs(f.momentum8)*.14+
    Math.abs(f.seq.pressure)*.10
  );
  return {
    ready:true,dir,swingDir:s.dir,trendDir,strength,
    highTag:s.highTag,lowTag:s.lowTag,integrity:s.integrity,
    protectedLow,protectedHigh,bullBroken,bearBroken,
    reverseUp:(s.dir<=0||s.integrity==='MIXED')&&bearBroken,
    reverseDown:(s.dir>=0||s.integrity==='MIXED')&&bullBroken,
    summary:s.highTag+' / '+s.lowTag+' · '+s.integrity
  };
}

function rangeQuality(f,s){
  if(!f.range)return 0;
  const widthOK=1-clip(Math.abs(f.range.widthAtr-4.0)/4.5);
  const eff=1-clip(f.eff12/Math.max(CFG.rangeEfficiencyGood,.01));
  const slope=1-clip(Math.abs(f.emaSlope5)/Math.max(CFG.rangeSlopeGood,.01));
  const sep=1-clip(Math.abs(f.emaSepAtr)/.45);
  const rotation=clip(f.range.crosses/4);
  const touches=clip((Math.min(f.range.lowerTouches,3)+Math.min(f.range.upperTouches,3))/6);
  const structurePenalty=s.dir?Math.min(.25,s.strength*.25):0;
  return clip(widthOK*.16+eff*.24+slope*.18+sep*.14+rotation*.14+touches*.14-structurePenalty);
}

function trendQuality(f,s){
  const eff=clip((f.eff12-CFG.trendEffMin)/.55);
  const slope=clip((Math.abs(f.emaSlope5)-CFG.trendSlopeMin)/.65);
  const sep=clip((Math.abs(f.emaSepAtr)-CFG.trendSepMin)/1.0);
  const structure=s.dir?clip(.50+s.strength*.50):clip(s.strength*.65);
  const d=s.dir||s.trendDir||sign(f.momentum8,.10);
  const follow=d>0?f.seq.followUp:d<0?f.seq.followDown:0;
  const momentum=d?clip(d*f.momentum8/1.5):0;
  return clip(eff*.22+slope*.16+sep*.12+structure*.20+follow*.15+momentum*.15);
}

function compressionQuality(f){
  const rr=1-clip((f.seq.compressionRangeRatio-CFG.compressionRangeRatio)/.55);
  const br=1-clip((f.seq.compressionBodyRatio-CFG.compressionBodyRatio)/.55);
  const lowEff=1-clip(f.eff6/.48);
  const narrow=f.range?1-clip((f.range.widthAtr-2.6)/4.5):.2;
  return clip(rr*.34+br*.28+lowEff*.22+narrow*.16);
}

function exhaustionQuality(f,s){
  const d=s.dir||s.trendDir||sign(f.momentum8,.08);
  if(!d)return 0;
  const ext=clip((d*f.extensionAtr-CFG.exhaustionExtensionAtr)/1.7);
  const bodyDecay=clip((CFG.exhaustionBodyDecayRatio-f.seq.bodyDecay)/CFG.exhaustionBodyDecayRatio);
  const opposingWick=d>0?f.seq.rejectionDown:f.seq.rejectionUp;
  const progressRecent=d>0?f.seq.recentHighProgress:f.seq.recentLowProgress;
  const progressPrior=d>0?f.seq.priorHighProgress:f.seq.priorLowProgress;
  const progressDecay=progressPrior>.03?clip(1-safeDiv(progressRecent,progressPrior)):0;
  const effDecay=clip(f.effDrop/.40);
  return clip(ext*.30+bodyDecay*.18+opposingWick*.18+progressDecay*.20+effDecay*.14);
}

function transitionQuality(f,s,trendScore,rangeScore,exhaustScore){
  const flatten=clip(f.slopeDrop/.35);
  const effLoss=clip(f.effDrop/.45);
  const mixed=s.integrity==='MIXED'?1:s.integrity==='UNCONFIRMED'?.55:0;
  const d=s.dir||s.trendDir||sign(f.momentum16,.08);
  const recentProgress=d>0?f.seq.recentHighProgress:d<0?f.seq.recentLowProgress:0;
  const priorProgress=d>0?f.seq.priorHighProgress:d<0?f.seq.priorLowProgress:0;
  const progressLoss=priorProgress>.03?clip(1-safeDiv(recentProgress,priorProgress)):0;
  const defense=d>0?f.seq.rejectionDown:d<0?f.seq.rejectionUp:Math.max(f.seq.rejectionUp,f.seq.rejectionDown);
  const recentMomRef=Math.max(Math.abs(f.momentum8),Math.abs(f.momentum16));
  const longMomRef=Math.abs(f.momentum24);
  const momentumDecay=clip((Math.max(recentMomRef,longMomRef)-Math.abs(f.momentum3))/Math.max(Math.max(recentMomRef,longMomRef),.25));
  const slopeRef=Math.max(Math.abs(f.emaSlope12),Math.abs(f.emaSlope24));
  const slopeFlatten=clip(1-Math.abs(f.emaSlope5)/Math.max(slopeRef,.08));
  const longTrendMemory=clip(
    Math.max(0,Math.abs(f.emaSlope24)-Math.abs(f.emaSlope5))/.55*.55+
    Math.max(0,Math.abs(f.momentum24)-Math.abs(f.momentum3))/1.8*.45
  );
  const between=clip((1-Math.abs(trendScore-rangeScore))*0.55+.15);
  return clip(flatten*.10+effLoss*.12+mixed*.08+progressLoss*.14+defense*.10+momentumDecay*.17+slopeFlatten*.12+longTrendMemory*.12+exhaustScore*.02+between*.03);
}

function pullbackQuality(f,s,trendScore){
  const d=s.dir||s.trendDir;
  if(!d||trendScore<.35)return 0;
  const dist8=Math.abs(f.price-f.ema8)/f.atr,dist21=Math.abs(f.price-f.ema21)/f.atr;
  const nearValue=1-clip(Math.min(dist8,dist21)/1.2);
  const counterMove=d>0?clip(-f.momentum3/.9):clip(f.momentum3/.9);
  const structureIntact=d>0?!s.bullBroken:!s.bearBroken;
  const followBefore=d>0?f.seq.followUp:f.seq.followDown;
  const notDeep=clip(1-Math.max(0,-d*f.extensionAtr-.35)/1.6);
  return structureIntact?clip(trendScore*.28+nearValue*.28+counterMove*.18+followBefore*.10+notDeep*.16):0;
}

function reversalQuality(f,s,exhaustScore){
  const upBreak=s.reverseUp?1:0,downBreak=s.reverseDown?1:0,breakSeen=Math.max(upBreak,downBreak);
  const newDir=upBreak?1:downBreak?-1:0;
  const rejection=newDir>0?f.seq.rejectionUp:newDir<0?f.seq.rejectionDown:Math.max(f.seq.rejectionUp,f.seq.rejectionDown)*.35;
  const flowFlip=newDir?clip(newDir*f.flow/.12):0;
  const pressure=newDir?clip(newDir*f.seq.pressure/.30):0;
  return clip(breakSeen*.38+exhaustScore*.20+rejection*.16+flowFlip*.12+pressure*.14);
}

function breakoutAttemptQuality(f){
  const b=f.breakout;
  if(!b.attemptDir)return 0;
  const displacement=clip(Math.abs(b.outsideAtr)/.65);
  const close=clip((b.alignedClose-.50)/.45);
  const expansion=b.expansion?1:0;
  const participation=clip(Math.max(f.vol.rel/1.5,f.vol.ratio3/1.5,Math.max(0,b.flowAligned)/.10));
  return clip(displacement*.28+close*.24+expansion*.20+participation*.28);
}

function breakoutAcceptedQuality(f){
  const b=f.breakout;
  if(!b.acceptedDir)return 0;
  const follow=b.acceptedDir>0?f.seq.followUp:f.seq.followDown;
  const participation=clip(Math.max(f.vol.rel/1.5,f.vol.ratio3/1.5,Math.max(0,b.flowAligned)/.10));
  return clip(.42+follow*.22+participation*.24+clip(Math.abs(b.outsideAtr)/.65)*.12);
}

function failedBreakoutQuality(f){
  const b=f.breakout;
  if(!b.failedDir)return 0;
  const rejection=b.failedDir>0?f.seq.rejectionUp:f.seq.rejectionDown;
  const pressure=clip(b.failedDir*f.seq.pressure/.30);
  const flow=clip(b.failedDir*f.flow/.10);
  return clip(b.recaptureStrength*.46+rejection*.18+pressure*.18+flow*.18);
}

function softmaxScores(raw){
  const entries=Object.entries(raw),t=Math.max(CFG.softmaxTemperature,.05);
  const max=Math.max(...entries.map(([,v])=>v/t));
  const exp=entries.map(([k,v])=>[k,Math.exp(v/t-max)]);
  const total=sum(exp.map(([,v])=>v));
  return Object.fromEntries(exp.map(([k,v])=>[k,Math.max(CFG.confidenceFloor,v/total)]));
}

function stageBrain(f,s){
  if(!f.ready||!s.ready)return {ready:false,reason:'features_not_ready'};

  const trend=trendQuality(f,s);
  const range=rangeQuality(f,s);
  const compression=compressionQuality(f);
  const exhaustion=exhaustionQuality(f,s);
  const transition=transitionQuality(f,s,trend,range,exhaustion);
  const pullback=pullbackQuality(f,s,trend);
  const reversal=reversalQuality(f,s,exhaustion);
  const breakoutAttempt=breakoutAttemptQuality(f);
  const breakoutAccepted=breakoutAcceptedQuality(f);
  const failedBreakout=failedBreakoutQuality(f);

  // Competition adjustments: accepted/failed breakout are distinct hypotheses.
  let raw={
    TREND_ADVANCE:trend*(1-exhaustion*.45)*(1-breakoutAccepted*.30)*(1-transition*.50),
    RANGE:range*(1-breakoutAccepted*.75)*(1-breakoutAttempt*.30),
    COMPRESSION:compression*(1-breakoutAttempt*.60),
    BREAKOUT_ATTEMPT:breakoutAttempt*(1-breakoutAccepted*.55)*(1-failedBreakout*.80),
    BREAKOUT_ACCEPTED:breakoutAccepted*(1-failedBreakout*.95),
    FAILED_BREAKOUT:failedBreakout*(1-breakoutAccepted*.95),
    PULLBACK:pullback*(1-reversal*.65)*(1-transition*.75),
    EXHAUSTION:exhaustion*(.65+trend*.35),
    REVERSAL_DEVELOPING:reversal,
    TRANSITION:transition*(1-breakoutAccepted*.35)
  };

  for(const k of Object.keys(raw))raw[k]=clip(raw[k]);

  const confidence=softmaxScores(raw);
  const ranked=Object.entries(confidence).sort((a,b)=>b[1]-a[1]).map(([stage,confidence])=>({stage,confidence,raw:raw[stage]}));
  const dominant=ranked[0]?.stage||'TRANSITION';

  const reasons=[];
  if(dominant==='TREND_ADVANCE')reasons.push('โครงสร้างและการเดินราคายังมีประสิทธิภาพ','EMA/โมเมนตัมยังมีทิศ','แท่งถัดไปยังมี follow-through');
  if(dominant==='RANGE')reasons.push('ประสิทธิภาพการเดินทางต่ำ','ราคาเกิดการหมุนในกรอบ','ความชันและระยะ EMA ไม่ได้คุมตลาดแรง');
  if(dominant==='COMPRESSION')reasons.push('ช่วงแท่งและ body กำลังหด','ตลาดกำลังสะสมแรงมากกว่ากำลังเดินทาง');
  if(dominant==='BREAKOUT_ATTEMPT')reasons.push('ราคาเริ่มออกนอกกรอบ','การยอมรับราคานอกกรอบยังไม่ครบ');
  if(dominant==='BREAKOUT_ACCEPTED')reasons.push('ราคาออกนอกกรอบและเริ่มยืนได้','มี expansion/participation สนับสนุน');
  if(dominant==='FAILED_BREAKOUT')reasons.push('ราคาเคยออกนอกกรอบแต่ถูกดึงกลับ','การ recapture ให้น้ำหนักฝั่งตรงข้าม');
  if(dominant==='PULLBACK')reasons.push('โครงสร้างหลักยังอยู่','ราคากำลังย้อนกลับเข้า value/base ของขาเดิม');
  if(dominant==='EXHAUSTION')reasons.push('ราคาเริ่มยืดจาก value','ความคืบหน้าของ high/low หรือ body เริ่มลดลง');
  if(dominant==='REVERSAL_DEVELOPING')reasons.push('protected structure เริ่มถูกเจาะ','แรงฝั่งใหม่เริ่มมี rejection/flow/pressure รองรับ');
  if(dominant==='TRANSITION')reasons.push('คุณสมบัติของเทรนด์เดิมกำลังเสื่อม','ตลาดยังไม่ได้สร้าง regime ใหม่ที่ชัด');

  const trendDir=s.dir||s.trendDir||sign(f.momentum8,.08);
  const rangeForming=dominant==='TRANSITION'&&trend>range&&(
    f.effDrop>=CFG.transitionEffDrop||
    f.slopeDrop>=CFG.transitionSlopeDrop||
    exhaustion>=.38
  );

  return {
    ready:true,
    dominant,
    dominantConfidence:ranked[0]?.confidence||0,
    ranked,
    confidence,
    raw,
    rangeForming,
    priorTrendDir:trendDir,
    reasons:unique(reasons),
    diagnostics:{
      trend,range,compression,breakoutAttempt,breakoutAccepted,failedBreakout,pullback,exhaustion,reversal,transition,
      effDrop:f.effDrop,slopeDrop:f.slopeDrop,
      rangePosition:f.rangePosition,
      breakout:f.breakout
    }
  };
}

function explainStage(f,s,stage){
  if(!stage?.ready)return {headline:'รอข้อมูล',details:[stage?.reason||'ข้อมูลยังไม่พอ']};
  const top=stage.ranked.slice(0,3);
  const details=[
    ...stage.reasons,
    'Stage mix: '+top.map(q=>q.stage+' '+Math.round(q.confidence*100)+'%').join(' · ')
  ];
  if(stage.rangeForming)details.push('ตรวจพบลักษณะ trend deceleration → range forming เร็วกว่าการรอให้กรอบ Sideway สมบูรณ์');
  if(f.range)details.push('ตำแหน่งในกรอบอ้างอิง '+Math.round(f.rangePosition*100)+'% · ความกว้าง '+f.range.widthAtr.toFixed(2)+' ATR');
  details.push('Structure: '+s.summary);
  return {headline:stage.dominant,details};
}

function analyze(input={}){
  const features=featureBrain(input);
  if(!features.ready)return {schema:'aris-v32-stage-snapshot-v1',version:VERSION,revision:REVISION,ready:false,reason:features.reason,features};
  const structure=structureBrain(features);
  const stage=stageBrain(features,structure);
  return {
    schema:'aris-v32-stage-snapshot-v1',
    version:VERSION,
    revision:REVISION,
    ready:true,
    ts:finite(+input.ts)?+input.ts:Date.now(),
    price:features.price,
    features,
    structure,
    stage,
    explanation:explainStage(features,structure,stage)
  };
}

root.ArisV32=Object.freeze({
  version:VERSION,
  revision:REVISION,
  CFG,
  analyze,
  featureBrain,
  structureBrain,
  stageBrain,
  internals:Object.freeze({
    sanitizeBars,atr,ema,pathEfficiency,regressionSlope,confirmedPivots,rangeReference,
    sequenceContext,breakoutContext,higherFrameContext,softmaxScores
  })
});

})(typeof globalThis!=='undefined'?globalThis:window);
