/* ARIS 3.2 — Adaptive Direction Brain
   Block 2: stage-specific evidence models + confidence-weighted mixer.
   Depends only on ARIS 3.2 Block 1 (v32.js). No legacy engine dependency. */

(function(root){
'use strict';

const Base=root.ArisV32;
if(!Base)throw new Error('ARIS 3.2 Block 1 (v32.js) must load before v32-direction.js');

const VERSION=Base.version;
const REVISION='adaptive-direction-b2-r1';
const clip=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
const finite=Number.isFinite;
const avg=a=>a?.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const sign=(v,dead=0)=>v>dead?1:v<-dead?-1:0;
const abs01=v=>Math.min(1,Math.abs(v));
const unique=a=>[...new Set((a||[]).filter(Boolean))];

const PROFILE_SPECS=Object.freeze({
  RANGE:Object.freeze({
    name:'Range mean-reversion',
    weights:Object.freeze({edge:.30,rejection:.22,failedEscape:.18,meanReversion:.12,flow:.08,htf:.05,oldTrend:.05})
  }),
  TREND_ADVANCE:Object.freeze({
    name:'Trend follow-through',
    weights:Object.freeze({structure:.25,momentum:.20,trendSlope:.15,followThrough:.15,flow:.12,room:.08,htf:.05})
  }),
  COMPRESSION:Object.freeze({
    name:'Compression pressure',
    weights:Object.freeze({pressure:.20,flow:.20,volumeSkew:.15,structure:.10,htf:.10,incipientBreak:.25})
  }),
  BREAKOUT_ATTEMPT:Object.freeze({
    name:'Breakout attempt',
    weights:Object.freeze({breakDirection:.25,acceptance:.20,volume:.20,flow:.20,followThrough:.10,room:.05})
  }),
  BREAKOUT_ACCEPTED:Object.freeze({
    name:'Breakout accepted',
    weights:Object.freeze({breakDirection:.25,acceptance:.25,volume:.18,flow:.18,followThrough:.09,room:.05})
  }),
  FAILED_BREAKOUT:Object.freeze({
    name:'Failed breakout',
    weights:Object.freeze({failedDirection:.28,recapture:.22,rejection:.18,flowFlip:.14,poorProgress:.10,structure:.08})
  }),
  PULLBACK:Object.freeze({
    name:'Pullback continuation',
    weights:Object.freeze({structure:.25,valueLocation:.20,reclaimProxy:.20,baseQuality:.15,renewedMomentum:.13,micro:.07})
  }),
  EXHAUSTION:Object.freeze({
    name:'Exhaustion caution',
    weights:Object.freeze({oldTrend:.15,rejection:.23,progressFailure:.22,flowShift:.15,structureDamage:.15,extensionRisk:.10})
  }),
  REVERSAL_DEVELOPING:Object.freeze({
    name:'Reversal transfer',
    weights:Object.freeze({structureBreak:.25,rejection:.20,flowFlip:.15,oldTrendExhaustion:.15,location:.15,htf:.10})
  }),
  TRANSITION:Object.freeze({
    name:'Transition / regime transfer',
    weights:Object.freeze({defense:.20,efficiencyLoss:.20,trendDecay:.20,flowChange:.15,structureMix:.15,htf:.10})
  })
});

function dirFromHTF(f){
  const rows=[f.htf?.m5,f.htf?.m15].filter(q=>q?.available&&q.dir);
  if(!rows.length)return 0;
  return clip(avg(rows.map(q=>q.dir*(.45+.55*Math.min(1,q.eff||0)))));
}

function rangeEdgeEvidence(f){
  if(!f.range)return {dir:0,strength:0};
  const p=f.rangePosition;
  if(p<=.35)return {dir:1,strength:clip((.35-p)/.35,0,1)};
  if(p>=.65)return {dir:-1,strength:clip((p-.65)/.35,0,1)};
  return {dir:0,strength:0};
}

function rejectionEvidence(f){
  return clip((f.seq.rejectionUp||0)-(f.seq.rejectionDown||0));
}

function followEvidence(f){
  return clip((f.seq.followUp||0)-(f.seq.followDown||0));
}

function pressureEvidence(f){
  return clip((f.seq.pressure||0)/.35);
}

function flowEvidence(f){
  return clip((f.flow||0)/.12);
}

function bookEvidence(f){
  return clip((f.book||0)/.20);
}

function structureEvidence(f,s){
  const d=s.swingDir||s.trendDir||s.dir||0;
  return clip(d*(.45+.55*(s.strength||0)));
}

function trendSlopeEvidence(f){
  return clip(f.emaSepAtr*.34+f.emaSlope5*.38+f.momentum8*.28);
}

function momentumEvidence(f){
  return clip(f.momentum3*.32+f.momentum8*.46+f.momentumAccel*.22);
}

function breakoutDirection(f){
  return f.breakout.acceptedDir||f.breakout.attemptDir||0;
}

function failedBreakDirection(f){
  return f.breakout.failedDir||0;
}

function roomEvidence(f,d){
  if(!f.range||!d)return .25*d;
  const p=f.rangePosition;
  const room=d>0?1-p:p;
  return d*clip(room/.65,0,1);
}

function valueLocationForTrend(f,d){
  if(!d)return 0;
  const dist8=Math.abs(f.price-f.ema8)/f.atr;
  const dist21=Math.abs(f.price-f.ema21)/f.atr;
  const near=1-clip(Math.min(dist8,dist21)/1.1,0,1);
  return d*near;
}

function reclaimProxy(f,d){
  if(!d)return 0;
  const close=d>0?f.current.closeLoc:1-f.current.closeLoc;
  const short=d*f.momentum3;
  const pressure=d*f.seq.pressure;
  return d*clip((close-.45)/.45*.35+Math.max(0,short)/.8*.35+Math.max(0,pressure)/.30*.30,0,1);
}

function progressFailureDirection(f,s){
  const old=s.swingDir||s.trendDir||sign(f.momentum16,.08);
  if(!old)return 0;
  const recent=old>0?f.seq.recentHighProgress:f.seq.recentLowProgress;
  const prior=old>0?f.seq.priorHighProgress:f.seq.priorLowProgress;
  const failure=prior>.03?clip(1-recent/prior,0,1):clip(f.effDrop/.35,0,1);
  return -old*failure;
}

function trendDecayDirection(f,s){
  const old=s.swingDir||s.trendDir||sign(f.momentum16,.08);
  if(!old)return 0;
  const decay=clip(f.effDrop/.35*.45+f.slopeDrop/.30*.35+Math.max(0,1-f.seq.bodyDecay)*.20,0,1);
  return -old*decay;
}

function structureDamageDirection(s){
  if(s.reverseUp)return 1;
  if(s.reverseDown)return -1;
  return 0;
}

function poorProgressBreakout(f,d){
  if(!d)return 0;
  const volHot=Math.max(f.vol.rel,f.vol.ratio3);
  const progress=Math.abs(f.breakout.outsideAtr||0);
  const poor=clip((volHot-1.0)/1.2,0,1)*clip(1-progress/.35,0,1);
  return -d*poor;
}

function component(key,value,weight,label){
  const signed=clip(value);
  return {key,label,value:signed,weight,contribution:signed*weight};
}

function finishModel(stage,profile,components,notes=[]){
  const score=clip(components.reduce((s,c)=>s+c.contribution,0));
  const positive=components.filter(c=>c.contribution>0).sort((a,b)=>b.contribution-a.contribution);
  const negative=components.filter(c=>c.contribution<0).sort((a,b)=>a.contribution-b.contribution);
  return {
    stage,
    profile:profile.name,
    score,
    direction:score>.08?'HIGH':score<-.08?'LOW':'BALANCED',
    components,
    strongestFor:positive.slice(0,3),
    strongestAgainst:negative.slice(0,3),
    notes:unique(notes)
  };
}

function modelRange(f,s){
  const p=PROFILE_SPECS.RANGE,w=p.weights,edge=rangeEdgeEvidence(f),rej=rejectionEvidence(f),failed=failedBreakDirection(f);
  const mean=edge.dir?edge.dir*clip(edge.strength*(1-Math.min(.75,Math.abs(f.momentum3)/1.2))):0;
  const htf=dirFromHTF(f),oldTrend=structureEvidence(f,s);
  const comps=[
    component('edge',edge.dir*edge.strength,w.edge,'ตำแหน่งขอบกรอบ'),
    component('rejection',rej,w.rejection,'แรงปฏิเสธที่ขอบ'),
    component('failed_escape',failed,w.failedEscape,'การหลุดกรอบที่ล้มเหลว'),
    component('mean_reversion',mean,w.meanReversion,'แรงกลับเข้าค่าเฉลี่ย'),
    component('flow',flowEvidence(f),w.flow,'Flow ระยะสั้น'),
    component('htf_context',htf,w.htf,'ภาพ 5m/15m (น้ำหนักต่ำใน Range)'),
    component('old_trend',oldTrend,w.oldTrend,'เทรนด์เดิม (บริบทเท่านั้น)')
  ];
  const notes=[];
  if(edge.dir&&Math.sign(htf)===-edge.dir)notes.push('HTF สวนขอบกรอบ แต่ใน RANGE ถูกใช้เป็น penalty เล็ก ไม่ใช่ veto');
  if(!edge.dir)notes.push('อยู่กลางกรอบ จึงไม่มี edge จาก mean reversion มากพอ');
  if(f.breakout.acceptedDir)notes.push('มี accepted breakout; Range model ควรถูก Stage Brain ลดน้ำหนักลง');
  return finishModel('RANGE',p,comps,notes);
}

function modelTrend(f,s){
  const p=PROFILE_SPECS.TREND_ADVANCE,w=p.weights,d=s.swingDir||s.trendDir||sign(f.momentum8,.08);
  const structure=structureEvidence(f,s);
  const mom=momentumEvidence(f);
  const slope=trendSlopeEvidence(f);
  const follow=followEvidence(f);
  const flow=flowEvidence(f);
  const room=roomEvidence(f,d);
  const htf=dirFromHTF(f);
  const comps=[
    component('structure',structure,w.structure,'ความต่อเนื่องของโครงสร้าง'),
    component('momentum',mom,w.momentum,'Momentum persistence'),
    component('trend_slope',slope,w.trendSlope,'EMA trend/slope'),
    component('follow_through',follow,w.followThrough,'แท่งถัดไปยังยก/กดต่อ'),
    component('flow',flow,w.flow,'Flow participation'),
    component('room',room,w.room,'พื้นที่ให้แนวโน้มเดินต่อ'),
    component('htf',htf,w.htf,'บริบท 5m/15m')
  ];
  const notes=[];
  const exhaustion=abs01(f.extensionAtr)>Base.CFG.exhaustionExtensionAtr&&f.seq.bodyDecay<Base.CFG.exhaustionBodyDecayRatio;
  if(exhaustion)notes.push('ราคาไกล value และ body decay; continuation จะถูก Stage EXHAUSTION แย่งน้ำหนัก ไม่บล็อกด้วย extension อย่างเดียว');
  return finishModel('TREND_ADVANCE',p,comps,notes);
}

function modelCompression(f,s){
  const p=PROFILE_SPECS.COMPRESSION,w=p.weights,bdir=breakoutDirection(f),pressure=pressureEvidence(f),flow=flowEvidence(f),htf=dirFromHTF(f),structure=structureEvidence(f,s);
  const incipient=bdir||sign(pressure*.55+flow*.45,.12);
  const volSkew=incipient*clip((Math.max(f.vol.rel,f.vol.ratio3)-.85)/1.25,0,1);
  const comps=[
    component('pressure',pressure,w.pressure,'แรงกดภายในกรอบบีบ'),
    component('flow',flow,w.flow,'Flow skew'),
    component('volume_skew',volSkew,w.volumeSkew,'Volume buildup ตามฝั่งที่กด'),
    component('structure',structure,w.structure,'โครงสร้างเดิม'),
    component('htf',htf,w.htf,'5m/15m context'),
    component('incipient_break',incipient,w.incipientBreak,'ทิศของการเริ่มออกจากกรอบ')
  ];
  return finishModel('COMPRESSION',p,comps,['Compression ให้ bias ได้ แต่ปกติ Trigger Brain ควร WATCH จนมี displacement/acceptance']);
}

function modelBreakout(f,s,accepted){
  const stage=accepted?'BREAKOUT_ACCEPTED':'BREAKOUT_ATTEMPT',p=PROFILE_SPECS[stage],w=p.weights,d=breakoutDirection(f);
  const acceptance=d?d*clip((f.breakout.alignedClose-.46)/.48,0,1):0;
  const volume=d?d*clip((Math.max(f.vol.rel,f.vol.ratio3)-.85)/1.2,0,1):0;
  const flow=d?d*clip(d*flowEvidence(f),0,1):0;
  const follow=d?d*clip(d*followEvidence(f),0,1):0;
  const room=roomEvidence(f,d);
  const comps=[
    component('break_direction',d,w.breakDirection,'ทิศ displacement'),
    component('acceptance',acceptance,w.acceptance,'Close/acceptance นอกกรอบ'),
    component('volume',volume,w.volume,'Volume participation'),
    component('flow',flow,w.flow,'Flow follow'),
    component('follow_through',follow,w.followThrough,'แท่งถัดไปตาม'),
    component('room',room,w.room,'พื้นที่ก่อนชนขอบตรงข้าม/ข้อจำกัด')
  ];
  const notes=[];
  if(d&&volume===0)notes.push('เบรกมี displacement แต่ Volume ยังไม่ร่วม จึงไม่ได้คะแนน continuation จากส่วน Volume');
  if(d&&flow===0)notes.push('Flow ไม่ตามทิศ breakout; continuation edge ถูกลดแทนการฟันธงว่าเบรกสำเร็จ');
  return finishModel(stage,p,comps,notes);
}

function modelFailedBreak(f,s){
  const p=PROFILE_SPECS.FAILED_BREAKOUT,w=p.weights,d=failedBreakDirection(f);
  const recapture=d*d*0 + d*clip(f.breakout.recaptureStrength||0,0,1);
  const rej=d?d*clip(d*rejectionEvidence(f),0,1):0;
  const flow=d?d*clip(d*flowEvidence(f),0,1):0;
  const original=-d;
  const poor=original?poorProgressBreakout(f,original):0;
  const structure=structureDamageDirection(s)||structureEvidence(f,s)*.35;
  const comps=[
    component('failed_direction',d,w.failedDirection,'ทิศตรงข้าม breakout ที่ล้มเหลว'),
    component('recapture',recapture,w.recapture,'ความแรงของการกลับเข้ากรอบ'),
    component('rejection',rej,w.rejection,'Rejection ฝั่งใหม่'),
    component('flow_flip',flow,w.flowFlip,'Flow เปลี่ยนฝั่ง'),
    component('poor_progress',poor,w.poorProgress,'Volume/แรงเดิมสร้าง progress ไม่ได้'),
    component('structure',structure,w.structure,'โครงสร้างเริ่มเสีย')
  ];
  return finishModel('FAILED_BREAKOUT',p,comps,['Failed breakout เป็นโมเดลแยก ไม่ใช่ Breakout ที่คะแนนต่ำ']);
}

function modelPullback(f,s){
  const p=PROFILE_SPECS.PULLBACK,w=p.weights,d=s.swingDir||s.trendDir||sign(f.momentum16,.08);
  const structure=d?d*clip(.45+(s.strength||0)*.55):0;
  const value=valueLocationForTrend(f,d);
  const reclaim=reclaimProxy(f,d);
  const base=d*d*0+d*clip((1-f.eff6)*.55+(1-Math.min(1,f.seq.recentRange/Math.max(f.seq.priorRange,.01)))*.45,0,1);
  const renewed=d?d*clip(d*momentumEvidence(f),0,1):0;
  const micro=d?d*clip(d*(flowEvidence(f)*.75+bookEvidence(f)*.25),0,1):0;
  const comps=[
    component('structure',structure,w.structure,'โครงสร้างเดิมยังอยู่'),
    component('value_location',value,w.valueLocation,'ตำแหน่งกลับเข้า value/EMA'),
    component('reclaim_proxy',reclaim,w.reclaimProxy,'การเริ่ม reclaim'),
    component('base_quality',base,w.baseQuality,'ฐาน/การชะลอของ pullback'),
    component('renewed_momentum',renewed,w.renewedMomentum,'Momentum กลับตามเทรนด์'),
    component('micro',micro,w.micro,'Micro confirmation')
  ];
  return finishModel('PULLBACK',p,comps,d?[]:['ยังไม่มี trend direction ที่เชื่อถือได้']);
}

function modelExhaustion(f,s){
  const p=PROFILE_SPECS.EXHAUSTION,w=p.weights,old=s.swingDir||s.trendDir||sign(f.momentum16,.08);
  const oldTrend=old*.35;
  const rejection=rejectionEvidence(f);
  const progressFail=progressFailureDirection(f,s);
  const flowShift=old?-old*clip(-old*flowEvidence(f),0,1):0;
  const damage=structureDamageDirection(s);
  const extension=old?-old*clip((old*f.extensionAtr-Base.CFG.exhaustionExtensionAtr)/1.6,0,1):0;
  const comps=[
    component('old_trend',oldTrend,w.oldTrend,'แรงเฉื่อยจากเทรนด์เดิม'),
    component('rejection',rejection,w.rejection,'Rejection ฝั่งตรงข้าม'),
    component('progress_failure',progressFail,w.progressFailure,'new high/low คืบหน้าน้อยลง'),
    component('flow_shift',flowShift,w.flowShift,'Flow เริ่มสวน'),
    component('structure_damage',damage,w.structureDamage,'Structure damage'),
    component('extension_risk',extension,w.extensionRisk,'ความยืดที่เริ่มเสียประสิทธิภาพ')
  ];
  return finishModel('EXHAUSTION',p,comps,['Exhaustion ไม่เท่ากับ reversal; score มักควรอ่อนจนกว่าจะมี structure transfer']);
}

function modelReversal(f,s){
  const p=PROFILE_SPECS.REVERSAL_DEVELOPING,w=p.weights,d=structureDamageDirection(s)||sign(rejectionEvidence(f)+flowEvidence(f),.18);
  const structureBreak=d?d:0;
  const rejection=d?d*clip(d*rejectionEvidence(f),0,1):0;
  const flow=d?d*clip(d*flowEvidence(f),0,1):0;
  const old=s.swingDir||s.trendDir||-d;
  const exhaust=d?d*clip((old?old*f.extensionAtr:0)/2.8,0,1):0;
  const edge=rangeEdgeEvidence(f);
  const location=d?d*clip((edge.dir===d?edge.strength:0)+Math.min(1,Math.abs(f.extensionAtr)/3)*.35,0,1):0;
  const htf=dirFromHTF(f);
  const comps=[
    component('structure_break',structureBreak,w.structureBreak,'Protected swing break'),
    component('rejection',rejection,w.rejection,'Rejection/failed expansion ฝั่งใหม่'),
    component('flow_flip',flow,w.flowFlip,'Flow ตามฝั่งใหม่'),
    component('old_trend_exhaustion',exhaust,w.oldTrendExhaustion,'เทรนด์เดิมหมดแรง'),
    component('location',location,w.location,'ตำแหน่งที่รองรับ reversal'),
    component('htf',htf,w.htf,'5m/15m context')
  ];
  return finishModel('REVERSAL_DEVELOPING',p,comps,d?[]:['ยังไม่มี transfer direction ที่ชัด']);
}

function modelTransition(f,s){
  const p=PROFILE_SPECS.TRANSITION,w=p.weights;
  const defense=rejectionEvidence(f);
  const eff=trendDecayDirection(f,s);
  const decay=trendDecayDirection(f,s);
  const flow=flowEvidence(f);
  const mix=s.integrity==='MIXED'?sign(defense+flow,.05):structureDamageDirection(s);
  const htf=dirFromHTF(f);
  const comps=[
    component('defense',defense,w.defense,'Repeated defense / wick shift'),
    component('efficiency_loss',eff,w.efficiencyLoss,'ประสิทธิภาพเทรนด์เดิมลด'),
    component('trend_decay',decay,w.trendDecay,'Slope/progress เดิมเสื่อม'),
    component('flow_change',flow,w.flowChange,'Flow เปลี่ยน'),
    component('structure_mix',mix,w.structureMix,'โครงสร้างเริ่มผสม/เปลี่ยน'),
    component('htf',htf,w.htf,'5m/15m context')
  ];
  return finishModel('TRANSITION',p,comps,[f.effDrop>.18?'Directional efficiency ลดลงชัด':null,f.slopeDrop>.12?'EMA slope กำลังแบนลง':null]);
}

function modelFor(stage,f,s){
  switch(stage){
    case 'RANGE': return modelRange(f,s);
    case 'TREND_ADVANCE': return modelTrend(f,s);
    case 'COMPRESSION': return modelCompression(f,s);
    case 'BREAKOUT_ATTEMPT': return modelBreakout(f,s,false);
    case 'BREAKOUT_ACCEPTED': return modelBreakout(f,s,true);
    case 'FAILED_BREAKOUT': return modelFailedBreak(f,s);
    case 'PULLBACK': return modelPullback(f,s);
    case 'EXHAUSTION': return modelExhaustion(f,s);
    case 'REVERSAL_DEVELOPING': return modelReversal(f,s);
    case 'TRANSITION': return modelTransition(f,s);
    default: return finishModel(stage,{name:'Unknown',weights:{}},[],['ไม่มีโมเดลสำหรับ stage นี้']);
  }
}

function adaptiveDirection(snapshot){
  if(!snapshot?.ready||!snapshot.stage?.ready)return {ready:false,reason:'stage_snapshot_not_ready'};
  const f=snapshot.features,s=snapshot.structure,conf=snapshot.stage.confidence;
  const models={};
  for(const stage of Object.keys(PROFILE_SPECS))models[stage]=modelFor(stage,f,s);

  let signed=0,weightSum=0;
  const blended=[];
  for(const [stage,c] of Object.entries(conf)){
    const model=models[stage];
    if(!model||c<.005)continue;
    signed+=c*model.score;
    weightSum+=c;
    blended.push({stage,stageConfidence:c,stageScore:model.score,contribution:c*model.score});
  }
  signed=weightSum?clip(signed/weightSum):0;

  // When the classifier itself is uncertain, shrink the final directional conviction.
  const dominant=snapshot.stage.dominantConfidence||0;
  const uncertaintyShrink=clip((dominant-.12)/.55,0.35,1);
  signed*=uncertaintyShrink;

  const highEdge=Math.round(clip(50+signed*42,8,92));
  const lowEdge=100-highEdge;
  const direction=Math.abs(signed)<.08?'BALANCED':signed>0?'HIGH':'LOW';

  blended.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
  const active=blended.slice(0,4);
  const notes=[];
  if(snapshot.stage.rangeForming)notes.push('Stage Brain พบ trend → range forming; น้ำหนัก Trend follow ถูกลดผ่าน stage mix โดยอัตโนมัติ');
  if(dominant<.35)notes.push('Stage ยังไม่ชัด จึง shrink directional conviction แทนการฟันธง');
  if(snapshot.stage.dominant==='RANGE')notes.push('ใน RANGE ภาพใหญ่มีน้ำหนักต่ำกว่าตำแหน่งขอบ/rejection และไม่เป็น veto อัตโนมัติ');
  if(['BREAKOUT_ATTEMPT','BREAKOUT_ACCEPTED'].includes(snapshot.stage.dominant)&&Math.max(f.vol.rel,f.vol.ratio3)<1.10)notes.push('Breakout participation ต่ำ: displacement ไม่ถูกตีความว่าไปต่อแน่นอน');

  return {
    ready:true,
    schema:'aris-v32-adaptive-direction-v1',
    version:VERSION,
    revision:REVISION,
    direction,
    signedEdge:signed,
    highEdge,
    lowEdge,
    dominantStage:snapshot.stage.dominant,
    dominantStageConfidence:dominant,
    activeStageModels:active,
    models,
    notes:unique(notes)
  };
}

function analyze(inputOrSnapshot={}){
  const snapshot=inputOrSnapshot?.schema==='aris-v32-stage-snapshot-v1'?inputOrSnapshot:Base.analyze(inputOrSnapshot);
  const direction=adaptiveDirection(snapshot);
  return {...snapshot,direction};
}

root.ArisV32Direction=Object.freeze({
  version:VERSION,
  revision:REVISION,
  profiles:PROFILE_SPECS,
  analyze,
  adaptiveDirection,
  modelFor
});

})(typeof globalThis!=='undefined'?globalThis:window);
