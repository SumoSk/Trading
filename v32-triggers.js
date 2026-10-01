/* ARIS 3.2 — Stage-specific Trigger Brain
   Block 3: each market stage owns different trigger logic.
   Depends only on v32.js + v32-direction.js. No legacy engine dependency. */

(function(root){
'use strict';

const Base=root.ArisV32;
const Direction=root.ArisV32Direction;
if(!Base||!Direction)throw new Error('ARIS 3.2 Block 1 and Block 2 must load before v32-triggers.js');

const VERSION=Base.version;
const REVISION='stage-triggers-b3-r1';
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=Number.isFinite;
const sign=(v,dead=0)=>v>dead?1:v<-dead?-1:0;
const unique=a=>[...new Set((a||[]).filter(Boolean))];

const CFG=Object.freeze({
  watchQuality:44,
  readyQuality:62,

  rangeStageMin:.28,
  rangeEdgeEnter:.28,
  rangeEdgeWatch:.36,
  rangeRejectionMin:.20,

  breakoutAttemptStageMin:.18,
  breakoutAcceptedStageMin:.20,
  breakoutMinParticipation:.18,
  breakoutMaxChaseAtr:1.15,

  failedBreakStageMin:.12,
  failedBreakRecaptureMin:.12,

  trendStageMin:.25,
  trendFollowMin:.38,
  trendMaxExhaustion:.58,

  pullbackStageMin:.18,
  pullbackValueMaxAtr:1.10,

  transitionStageMin:.25,
  transitionEdgeMax:.30,

  reversalStageMin:.12
});

const stageConf=(snap,k)=>snap.stage?.confidence?.[k]||0;
const dirNum=d=>d==='HIGH'?1:d==='LOW'?-1:finite(d)?Math.sign(d):0;
const dirText=d=>d>0?'HIGH':d<0?'LOW':'BALANCED';
const score100=v=>Math.round(clip(v)*100);

function mkTrigger({id,family,direction,quality,stage,stageConfidence,state,reasons=[],missing=[],penalties=[],hardBlocks=[],invalidation=[],meta={}}){
  const q=score100(quality);
  const blocked=hardBlocks.length>0;
  const ready=!blocked&&state!=='WATCH_ONLY'&&q>=CFG.readyQuality;
  const watch=!ready&&!blocked&&q>=CFG.watchQuality;
  return {
    id,family,direction:dirText(direction),d:direction,
    quality:q,
    stage,stageConfidence,
    status:blocked?'BLOCKED':ready?'READY':watch?'WATCH':'WEAK',
    ready,watch,watchOnly:state==='WATCH_ONLY',
    reasons:unique(reasons),
    missing:unique(missing),
    penalties:unique(penalties),
    hardBlocks:unique(hardBlocks),
    invalidation:unique(invalidation),
    meta
  };
}

function rangeTrigger(snap){
  const f=snap.features,sc=stageConf(snap,'RANGE'),tc=stageConf(snap,'TRANSITION');
  if(!f.range)return null;
  const p=f.rangePosition,lower=p<=CFG.rangeEdgeWatch,upper=p>=1-CFG.rangeEdgeWatch;
  if(!lower&&!upper)return null;
  const d=lower?1:-1;
  const edgeStrength=lower?clip((CFG.rangeEdgeWatch-p)/CFG.rangeEdgeWatch):clip((p-(1-CFG.rangeEdgeWatch))/CFG.rangeEdgeWatch);
  const rejection=d>0?f.seq.rejectionUp:f.seq.rejectionDown;
  const failed=f.breakout.failedDir===d?clip(.45+(f.breakout.recaptureStrength||0)*.55):0;
  const hold=d>0?clip((f.price-f.range.low)/(f.atr*.45)):clip((f.range.high-f.price)/(f.atr*.45));
  const flow=clip(d*f.flow/.10);
  const pressure=clip(d*f.seq.pressure/.30);
  const stageMix=clip(sc+tc*.35);
  const acceptedAgainst=f.breakout.acceptedDir===-d;
  const strongEdge=(lower?p<=CFG.rangeEdgeEnter:p>=1-CFG.rangeEdgeEnter);

  let q=edgeStrength*.25+rejection*.24+failed*.20+hold*.12+flow*.07+pressure*.07+stageMix*.05;
  if(strongEdge)q+=.05;
  q=clip(q);

  const reasons=[
    lower?'ราคาอยู่ขอบล่างของกรอบ':'ราคาอยู่ขอบบนของกรอบ',
    rejection>=CFG.rangeRejectionMin?'มี rejection ที่ขอบ':null,
    failed>0?'มี failed breakout กลับเข้ากรอบ':null,
    hold>.35?'ราคากลับมายืนด้านในกรอบได้':null
  ];
  const missing=[];
  if(rejection<CFG.rangeRejectionMin&&failed===0)missing.push('ต้องการ rejection หรือ failed escape ที่ชัดขึ้น');
  if(hold<.25)missing.push('รอให้ราคากลับมายืนด้านในกรอบมากขึ้น');
  if(sc<CFG.rangeStageMin&&tc<CFG.transitionStageMin)missing.push('ความมั่นใจว่าเป็น Range/Transition ยังต่ำ');
  const penalties=[];
  const htfRows=[f.htf?.m5,f.htf?.m15].filter(x=>x?.available&&x.dir===-d);
  if(htfRows.length)penalties.push('HTF สวน '+htfRows.length+' กรอบ แต่เป็น penalty ไม่ใช่ veto ใน Range');
  if(htfRows.length===2)q=clip(q-.06);
  if(sc<CFG.rangeStageMin)q=clip(q-.05);

  return mkTrigger({
    id:d>0?'RANGE_LOWER_REJECTION':'RANGE_UPPER_REJECTION',
    family:'RANGE_REVERSION',direction:d,quality:q,stage:'RANGE',stageConfidence:sc,
    reasons,missing,penalties,
    hardBlocks:acceptedAgainst?['มี accepted breakout ทะลุขอบในทิศตรงข้ามกับ mean reversion']:[],
    invalidation:[d>0?'ยอมรับราคาต่ำกว่าขอบล่างพร้อม volume/flow ตาม':'ยอมรับราคาสูงกว่าขอบบนพร้อม volume/flow ตาม'],
    meta:{rangePosition:p,edgeStrength,rejection,failedEscape:failed,hold,flow,pressure}
  });
}

function breakoutTrigger(snap){
  const f=snap.features,b=f.breakout,d=b.acceptedDir||b.attemptDir;
  if(!d)return null;
  const accepted=b.acceptedDir===d;
  const sc=stageConf(snap,accepted?'BREAKOUT_ACCEPTED':'BREAKOUT_ATTEMPT');
  const volume=clip((Math.max(f.vol.rel,f.vol.ratio3)-.90)/1.1);
  const flow=clip(d*f.flow/.10);
  const follow=d>0?f.seq.followUp:f.seq.followDown;
  const close=clip((b.alignedClose-.48)/.45);
  const displacement=clip(Math.abs(b.outsideAtr)/.75);
  const participation=clip(volume*.50+flow*.50);
  const chase=Math.abs(b.outsideAtr||0);
  const chasePenalty=clip((chase-.65)/.70);
  let q=(accepted?.20:.08)+close*.18+displacement*.12+volume*.20+flow*.20+follow*.12+sc*.10-chasePenalty*.12;
  q=clip(q);
  const reasons=[
    accepted?'ราคานอกกรอบเริ่มถูกยอมรับ':'ราคาเริ่มออกนอกกรอบแต่ยังไม่ accepted',
    volume>=CFG.breakoutMinParticipation?'Volume มีส่วนร่วม':null,
    flow>=CFG.breakoutMinParticipation?'Flow ตาม breakout':null,
    follow>=.50?'แท่งถัดไปยัง follow-through':null
  ];
  const missing=[];
  if(!accepted)missing.push('รอ acceptance นอกกรอบ');
  if(volume<CFG.breakoutMinParticipation)missing.push('Volume ยังไม่ร่วมพอ');
  if(flow<CFG.breakoutMinParticipation)missing.push('Flow ยังไม่ตาม breakout');
  if(follow<.35)missing.push('Follow-through ยังไม่ชัด');
  const penalties=[];
  if(chase>.65)penalties.push('ราคาห่างกรอบเริ่มมาก ลดคุณภาพแทนการ veto ทันที');
  if(chase>CFG.breakoutMaxChaseAtr)penalties.push('Chase สูงมาก ควรรอฐาน/retest ใหม่');
  const watchOnly=!accepted||volume<CFG.breakoutMinParticipation||flow<CFG.breakoutMinParticipation;

  return mkTrigger({
    id:'BREAKOUT_FOLLOW',family:'BREAKOUT',direction:d,quality:q,
    stage:accepted?'BREAKOUT_ACCEPTED':'BREAKOUT_ATTEMPT',stageConfidence:sc,
    state:watchOnly?'WATCH_ONLY':null,reasons,missing,penalties,
    hardBlocks:[],
    invalidation:['ราคาถูก recapture กลับเข้ากรอบเดิม','Flow พลิกสวนพร้อม rejection'],
    meta:{accepted,volume,flow,follow,close,displacement,chase,participation}
  });
}

function failedBreakTrigger(snap){
  const f=snap.features,d=f.breakout.failedDir;
  if(!d)return null;
  const sc=stageConf(snap,'FAILED_BREAKOUT');
  const recapture=clip(f.breakout.recaptureStrength||0);
  const rejection=d>0?f.seq.rejectionUp:f.seq.rejectionDown;
  const flow=clip(d*f.flow/.10);
  const pressure=clip(d*f.seq.pressure/.30);
  const meanRoom=f.range?(d>0?1-f.rangePosition:f.rangePosition):.5;
  let q=.22+recapture*.25+rejection*.18+flow*.12+pressure*.10+clip(meanRoom/.65)*.08+clip(sc/.45)*.05;
  q=clip(q);
  const missing=[];
  if(recapture<CFG.failedBreakRecaptureMin)missing.push('Recapture กลับเข้ากรอบยังตื้น');
  if(rejection<.15&&flow<.15)missing.push('ต้องการ rejection หรือ flow ฝั่งสวนเพิ่ม');
  const penalties=[];
  if(sc<CFG.failedBreakStageMin)penalties.push('Stage classifier ยังให้น้ำหนัก FAILED_BREAKOUT ต่ำ แต่ event recapture ถูกตรวจพบ');
  return mkTrigger({
    id:'FAILED_BREAKOUT_REVERSAL',family:'FAILED_BREAKOUT',direction:d,quality:q,
    stage:'FAILED_BREAKOUT',stageConfidence:sc,
    reasons:['มี breakout excursion ก่อนหน้า','ราคาถูก recapture กลับเข้ากรอบ',rejection>.15?'มี rejection ฝั่งกลับ':null,flow>.15?'Flow เริ่มตามฝั่งกลับ':null],
    missing,penalties,hardBlocks:[],
    invalidation:['ราคากลับออกนอกกรอบเดิมและเกิด acceptance อีกครั้ง'],
    meta:{recapture,rejection,flow,pressure,meanRoom}
  });
}

function trendTrigger(snap){
  const f=snap.features,s=snap.structure,d=s.swingDir||s.trendDir||dirNum(snap.direction?.direction);
  if(!d)return null;
  const sc=stageConf(snap,'TREND_ADVANCE');
  const structure=clip(.45+(s.strength||0)*.55);
  const follow=d>0?f.seq.followUp:f.seq.followDown;
  const momentum=clip(d*(f.momentum8*.65+f.momentum3*.35)/1.25);
  const flow=clip(d*f.flow/.10);
  const pressure=clip(d*f.seq.pressure/.30);
  const progress=d>0?f.seq.recentHighProgress:f.seq.recentLowProgress;
  const progressive=clip(progress/.45);
  const exhaustion=stageConf(snap,'EXHAUSTION');
  const extension=Math.max(0,d*f.extensionAtr);
  const extensionPenalty=clip((extension-1.55)/1.7);
  const opposingReject=d>0?f.seq.rejectionDown:f.seq.rejectionUp;

  let q=structure*.22+follow*.20+momentum*.18+flow*.12+pressure*.10+progressive*.10+clip(sc/.60)*.08;
  q-=exhaustion*.18+extensionPenalty*.08+opposingReject*.10;
  q=clip(q);

  const reasons=[
    'โครงสร้างยังคงทิศ '+dirText(d),
    follow>=CFG.trendFollowMin?'แท่งถัดไปยัง follow-through':null,
    momentum>.35?'Momentum ยังต่อ':null,
    progressive>.20?'High/Low ยังขยับไปข้างหน้า':null,
    flow>.20?'Flow ยังมีส่วนร่วม':null
  ];
  const missing=[];
  if(follow<CFG.trendFollowMin)missing.push('Follow-through ของแท่งยังไม่ต่อเนื่อง');
  if(momentum<.25)missing.push('Momentum ระยะสั้นยังไม่พอ');
  if(exhaustion>CFG.trendMaxExhaustion)missing.push('Exhaustion สูง ควรรอฐานใหม่');
  const penalties=[];
  if(extensionPenalty>.1)penalties.push('ราคาเริ่มยืดจาก value แต่เป็น penalty ไม่ใช่ veto เดี่ยว');
  if(opposingReject>.2)penalties.push('เริ่มมี rejection สวน');
  return mkTrigger({
    id:'TREND_FOLLOW_THROUGH',family:'TREND',direction:d,quality:q,
    stage:'TREND_ADVANCE',stageConfidence:sc,
    reasons,missing,penalties,hardBlocks:[],
    invalidation:[d>0?'Protected low เสีย + follow-through ขึ้นหาย':'Protected high เสีย + follow-through ลงหาย'],
    meta:{structure,follow,momentum,flow,pressure,progressive,exhaustion,extension,extensionPenalty}
  });
}

function pullbackTrigger(snap){
  const f=snap.features,s=snap.structure,d=s.swingDir||s.trendDir||snap.stage.priorTrendDir;
  if(!d)return null;
  const sc=stageConf(snap,'PULLBACK');
  const dist8=Math.abs(f.price-f.ema8)/f.atr,dist21=Math.abs(f.price-f.ema21)/f.atr;
  const value=clip(1-Math.min(dist8,dist21)/CFG.pullbackValueMaxAtr);
  const close=d>0?f.current.closeLoc:1-f.current.closeLoc;
  const reclaim=clip((close-.45)/.45*.35+Math.max(0,d*f.momentum3)/.75*.35+Math.max(0,d*f.seq.pressure)/.30*.30);
  const base=clip((1-f.eff6)*.55+(1-Math.min(1,f.seq.recentRange/Math.max(f.seq.priorRange,.01)))*.45);
  const intact=d>0?!s.bullBroken:!s.bearBroken;
  const flow=clip(d*f.flow/.10);
  let q=(intact?.18:0)+value*.24+reclaim*.25+base*.14+flow*.09+clip(sc/.45)*.10;
  q=clip(q);
  const missing=[];
  if(value<.35)missing.push('Pullback ยังไม่กลับเข้า value/base ที่ดี');
  if(reclaim<.35)missing.push('Reclaim ยังไม่ชัด');
  if(!intact)missing.push('โครงสร้างเดิมเสียแล้ว จึงไม่ควรใช้ pullback continuation');
  return mkTrigger({
    id:'PULLBACK_RECLAIM',family:'PULLBACK',direction:d,quality:q,
    stage:'PULLBACK',stageConfidence:sc,
    reasons:[intact?'Protected structure ยังอยู่':null,value>.35?'ราคาอยู่ใกล้ value/EMA':null,reclaim>.35?'เริ่ม reclaim ตามเทรนด์':null],
    missing,penalties:[],hardBlocks:!intact?['Protected structure ของเทรนด์เดิมเสียแล้ว']:[],
    invalidation:[d>0?'หลุด protected low':'ทะลุ protected high'],
    meta:{value,reclaim,base,flow,dist8,dist21}
  });
}

function transitionTrigger(snap){
  const f=snap.features,sc=stageConf(snap,'TRANSITION');
  if(sc<.08&&!snap.stage.rangeForming)return null;
  const prior=snap.stage.priorTrendDir||0;
  const p=f.rangePosition;
  const lower=p<=CFG.transitionEdgeMax,upper=p>=1-CFG.transitionEdgeMax;
  const edgeDir=lower?1:upper?-1:0;
  const defense=edgeDir>0?f.seq.rejectionUp:edgeDir<0?f.seq.rejectionDown:0;
  const flow=edgeDir?clip(edgeDir*f.flow/.10):0;
  const trendWasOpposing=edgeDir&&prior===-edgeDir;
  const decay=clip(f.stageDecay??(f.slopeDrop/.30*.45+Math.max(0,Math.abs(f.momentum24)-Math.abs(f.momentum3))/1.6*.55));
  let q=edgeDir?(defense*.28+flow*.12+clip(sc/.50)*.18+clip(decay)*.22+(snap.stage.rangeForming?.20:0)):clip(sc/.60)*.40;
  q=clip(q);
  const watchOnly=!edgeDir||defense<.18;
  return mkTrigger({
    id:edgeDir?'TRANSITION_EDGE_DEFENSE':'TRANSITION_RANGE_FORMING',
    family:'TRANSITION',direction:edgeDir,quality:q,
    stage:'TRANSITION',stageConfidence:sc,state:watchOnly?'WATCH_ONLY':null,
    reasons:[snap.stage.rangeForming?'เทรนด์เดิมกำลังเสื่อมเป็น Range forming':null,edgeDir?(lower?'ราคากำลังป้องกันขอบล่าง':'ราคากำลังป้องกันขอบบน'):null,defense>.18?'มี repeated defense/rejection':null,trendWasOpposing?'เป็นโอกาสไม้แรกหลังเทรนด์เดิมเริ่มกด/ดันต่อไม่สำเร็จ':null],
    missing:[!edgeDir?'รอให้ราคาเข้าใกล้ขอบที่มีเหตุผล':null,edgeDir&&defense<.18?'ต้องการ defense/rejection ชัดขึ้น':null],
    penalties:[prior===edgeDir?'ทิศ edge ยังเป็นทิศเดียวกับเทรนด์เดิม จึงยังไม่ใช่ regime-turn opportunity เต็มรูป':null],
    hardBlocks:f.breakout.acceptedDir===-edgeDir&&edgeDir?['เกิด accepted breakout ทะลุ edge แล้ว']:[],
    invalidation:['ราคาเริ่มทำ progress ต่อในทิศเทรนด์เดิมและ efficiency กลับสูง'],
    meta:{priorTrendDir:prior,rangePosition:p,edgeDir,defense,flow,decay,rangeForming:snap.stage.rangeForming}
  });
}

function reversalTrigger(snap){
  const f=snap.features,s=snap.structure,d=s.reverseUp?1:s.reverseDown?-1:0;
  if(!d)return null;
  const sc=stageConf(snap,'REVERSAL_DEVELOPING');
  const rejection=d>0?f.seq.rejectionUp:f.seq.rejectionDown;
  const flow=clip(d*f.flow/.10);
  const pressure=clip(d*f.seq.pressure/.30);
  const close=d>0?f.current.closeLoc:1-f.current.closeLoc;
  const acceptance=clip((close-.48)/.42);
  const exhaustion=stageConf(snap,'EXHAUSTION');
  let q=.24+rejection*.18+flow*.15+pressure*.12+acceptance*.14+clip(sc/.45)*.10+clip(exhaustion/.55)*.07;
  q=clip(q);
  return mkTrigger({
    id:'REVERSAL_TRANSFER',family:'REVERSAL',direction:d,quality:q,
    stage:'REVERSAL_DEVELOPING',stageConfidence:sc,
    reasons:['Protected structure เดิมถูกเจาะ',rejection>.15?'มี rejection ฝั่งใหม่':null,flow>.15?'Flow ตามฝั่งใหม่':null,acceptance>.25?'แท่งเริ่มรับฝั่งใหม่':null],
    missing:[rejection<.12&&flow<.12?'ต้องการ rejection หรือ flow ฝั่งใหม่เพิ่ม':null],
    penalties:[],hardBlocks:[],
    invalidation:['ราคากลับมายืนเหนือ/ใต้ protected structure เดิมและฝั่งใหม่เสีย acceptance'],
    meta:{rejection,flow,pressure,acceptance,exhaustion}
  });
}

function compressionWatch(snap){
  const f=snap.features,sc=stageConf(snap,'COMPRESSION');
  if(sc<.12)return null;
  const pressure=clip(Math.abs(f.seq.pressure)/.30);
  const flow=clip(Math.abs(f.flow)/.10);
  const skew=sign(f.seq.pressure*.55+f.flow*.45,.04);
  const q=clip(sc*.35+pressure*.25+flow*.20+(f.breakout.attemptDir?.20:0));
  return mkTrigger({
    id:'COMPRESSION_WATCH',family:'COMPRESSION',direction:skew,quality:q,
    stage:'COMPRESSION',stageConfidence:sc,state:'WATCH_ONLY',
    reasons:['ช่วงแท่งกำลังบีบตัว',skew?'แรงภายในเริ่มเอน '+dirText(skew):'ยังไม่มีฝั่งคุมชัด'],
    missing:['รอ displacement ออกจากกรอบและตรวจ acceptance'],
    penalties:[],hardBlocks:[],invalidation:['compression คลายโดยไม่เลือกทิศ'],
    meta:{pressure,flow,skew}
  });
}

function triggerBrain(inputOrSnapshot={}){
  const snap=inputOrSnapshot?.direction?.schema==='aris-v32-adaptive-direction-v1'?inputOrSnapshot:Direction.analyze(inputOrSnapshot);
  if(!snap.ready||!snap.direction?.ready)return {...snap,triggers:{ready:false,reason:'direction_not_ready',candidates:[]}};

  const candidates=[
    failedBreakTrigger(snap),
    rangeTrigger(snap),
    breakoutTrigger(snap),
    trendTrigger(snap),
    pullbackTrigger(snap),
    transitionTrigger(snap),
    reversalTrigger(snap),
    compressionWatch(snap)
  ].filter(Boolean);

  const ready=candidates.filter(x=>x.ready).sort((a,b)=>b.quality-a.quality);
  const watches=candidates.filter(x=>!x.ready&&!x.hardBlocks.length&&(x.watch||x.watchOnly)).sort((a,b)=>b.quality-a.quality);
  let primary=ready[0]||watches[0]||candidates.sort((a,b)=>b.quality-a.quality)[0]||null;

  // Conflict policy: an accepted breakout outranks an opposite range-reversion idea.
  const breakout=candidates.find(x=>x.id==='BREAKOUT_FOLLOW'&&x.meta?.accepted);
  if(breakout?.ready){
    const oppositeReady=ready.find(x=>x.d===-breakout.d&&x.family==='RANGE_REVERSION');
    if(oppositeReady)primary=breakout;
  }

  return {
    ...snap,
    triggers:{
      ready:true,
      schema:'aris-v32-trigger-snapshot-v1',
      version:VERSION,
      revision:REVISION,
      primary,
      readyCandidates:ready,
      watchCandidates:watches,
      candidates
    }
  };
}

root.ArisV32Triggers=Object.freeze({
  version:VERSION,
  revision:REVISION,
  CFG,
  analyze:triggerBrain,
  triggerBrain
});

})(typeof globalThis!=='undefined'?globalThis:window);
