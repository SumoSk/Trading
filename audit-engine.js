(() => {
  'use strict';

  const SCHEMA='trade-audit-v2';
  const AUDIT_REVISION='weakness-guard-r1';
  const TARGET_VERSION='ARIS-2.0.0';
  const HORIZON_MS=600000;
  const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,Number(v)||0));
  const finite=v=>Number.isFinite(Number(v));
  const round=v=>Math.round(clamp(v));
  const W=Object.freeze({
    // ลดการพึ่งคะแนนจาก engine เอง และเพิ่มน้ำหนักตัวตรวจอิสระ
    entry:12,state:10,playbook:13,structure:13,location:12,
    fib:8,priceAction:10,flow:12,timing:10
  });

  const RANGE_STATES=new Set(['FRESH_RANGE','BALANCED_RANGE','RANGE_COMPRESSION','EDGE_PRESSURE','CHOP']);
  const BREAK_STATES=new Set(['BREAKOUT_ATTEMPT','BREAKOUT_RETEST','BREAKOUT_ACCEPTED','FALSE_BREAK']);
  const TREND_STATES=new Set(['EXPANSION','IMPULSE','TREND','PULLBACK','MATURE_TREND']);
  const REV_STATES=new Set(['EXHAUSTION','REVERSAL_WATCH','REVERSAL_CONFIRMED']);

  function dsign(signal){return signal?.direction==='HIGH'?1:signal?.direction==='LOW'?-1:0;}
  function entry(signal){return signal?.dataset?.entry||null;}
  function text(v){return String(v??'').toLowerCase();}
  function hasAny(v,parts){const s=text(v);return parts.some(x=>s.includes(x));}
  function riskText(e){return text(e?.v2TrendChangeRisk);}

  function nearestRoom(e,d){
    const q=d>0?e?.zones?.nearestResistance:e?.zones?.nearestSupport;
    return finite(q?.distanceAtr)?Number(q.distanceAtr):null;
  }

  function scoreEntryEvidence(signal,e){
    const v=finite(e.v2EntryEvidence)?Number(e.v2EntryEvidence):Number(signal.features?.v2Evidence);
    return round(Number.isFinite(v)?v:65);
  }

  function scoreState(e){
    const conf=finite(e.v2StateConfidence)?Number(e.v2StateConfidence):65;
    let score=conf;
    if(e.v2State==='CONFLICT')score-=10;
    else if(e.v2State==='TRANSITION')score-=6;
    else if(e.v2State==='CHOP')score-=5;
    return round(score);
  }

  function playbookFit(e){
    const state=String(e.v2State||''),p=String(e.v2Playbook||e.setupType||'');
    if(!state||!p)return {score:65,label:'State/Playbook ข้อมูลไม่ครบ'};
    let fit=68;

    if(RANGE_STATES.has(state)){
      if(hasAny(p,['range_edge_fade','range_rotation']))fit=90;
      else if(state==='RANGE_COMPRESSION'&&hasAny(p,['compression_breakout']))fit=92;
      else if(state==='EDGE_PRESSURE'&&hasAny(p,['edge_pressure_breakout']))fit=92;
      else if(hasAny(p,['breakout']))fit=72;
    }else if(BREAK_STATES.has(state)){
      if(state==='FALSE_BREAK'&&hasAny(p,['failed_break_reversal','breakout_trap_reversal']))fit=94;
      else if(hasAny(p,['breakout_follow','breakout_micro_pullback','breakout_retest']))fit=89;
      else if(hasAny(p,['reversal']))fit=72;
    }else if(TREND_STATES.has(state)){
      if(hasAny(p,['trend_pullback','fib_pullback','trend_reacceleration','continuation','mature_recovery','shock_follow']))fit=90;
      else if(hasAny(p,['reversal']))fit=58;
    }else if(REV_STATES.has(state)){
      if(hasAny(p,['exhaustion_reversal','reversal_follow','shock_failure','failed_break_reversal']))fit=93;
      else if(hasAny(p,['continuation','trend_reacceleration']))fit=48;
    }else if(state==='CONFLICT'){
      fit=hasAny(p,['observe_conflict'])?78:52;
    }else if(state==='TRANSITION'){
      fit=64;
    }
    return {score:round(fit),label:fit>=85?'State กับ Playbook สอดคล้อง':fit>=65?'State/Playbook ใช้ได้':'State/Playbook ขัดกัน'};
  }

  function structureScore(e){
    let score=e.v2StructuralReady===true?92:e.v2StructuralReady===false?58:68;
    const checks=Array.isArray(e.v2Checks)?e.v2Checks:[];
    if(checks.length){
      const known=checks.filter(q=>typeof q?.ok==='boolean'||typeof q?.pass==='boolean'||typeof q?.ready==='boolean');
      if(known.length){
        const passed=known.filter(q=>q.ok===true||q.pass===true||q.ready===true).length;
        score=score*.70+(passed/known.length*100)*.30;
      }
    }
    return round(score);
  }

  function locationScore(e,d){
    const roomAtr=nearestRoom(e,d);
    let score=roomAtr===null?66:
      roomAtr>=.55?92:
      roomAtr>=.40?85:
      roomAtr>=.30?78:
      roomAtr>=.20?70:
      roomAtr>=.12?61:50;

    const rp=Number(e.rangePosition);
    let label='ตำแหน่งใช้ได้';
    if(Number.isFinite(rp)){
      const favorable=d>0?1-rp:rp;
      if(favorable>=.70){score+=5;label='มีพื้นที่จากตำแหน่งราคา';}
      else if(favorable<=.20){score-=7;label='ใกล้ปลายฝั่งเป้าหมาย';}
      else if(favorable<=.35){score-=3;label='พื้นที่เริ่มจำกัด';}
    }
    return {score:round(score),roomAtr,label};
  }

  function fibScore(e){
    const fib=e.v2Fib;
    if(!fib?.valid)return {score:65,label:'Fib ยังไม่ยืนยัน'};
    const ext=Number(fib.extension),ret=Number(fib.retracement);
    if(fib.confluence&&fib.healthy)return {score:94,label:'Fib healthy + confluence'};
    if(fib.healthy)return {score:87,label:'Fib healthy'};
    if(fib.deep)return {score:67,label:'Fib deep pullback'};
    if(Number.isFinite(ext)&&ext>=1.618)return {score:48,label:'Fib extension >161.8%'};
    if(Number.isFinite(ext)&&ext>=1.272)return {score:58,label:'Fib extension >127.2%'};
    if(Number.isFinite(ext)&&ext>1)return {score:70,label:'ราคาเลย swing เดิม'};
    if(Number.isFinite(ret)&&ret<.20)return {score:64,label:'Fib pullback ตื้น'};
    return {score:75,label:'Fib อยู่บริบทปกติ'};
  }

  function priceActionScore(e,d){
    const c=e.v2CandleBehavior||{};
    let score=72;
    const tags=[];
    if(c.bodyDecay){score-=8;tags.push('body decay');}
    if(c.failedExpansion){score-=8;tags.push('failed expansion');}
    if(c.contraction){score-=3;tags.push('contraction');}
    if(c.shock){score+=4;tags.push('shock');}
    if(c.marubozu){score+=5;tags.push('marubozu');}

    const pressure=Number(c.pressureDir??c.pressure);
    if(Number.isFinite(pressure)){
      if(Math.sign(pressure)===d)score+=5;
      else if(Math.sign(pressure)===-d)score-=7;
    }

    const rejection=Number(c.rejectionDir??c.rejection);
    if(Number.isFinite(rejection)){
      if(Math.sign(rejection)===d)score+=5;
      else if(Math.sign(rejection)===-d)score-=7;
    }

    if(Array.isArray(c.tags))tags.push(...c.tags.slice(0,3));
    return {score:round(score),tags:[...new Set(tags)].slice(0,5)};
  }

  function flowScore(e,d){
    const aligned=finite(e.flow)?d*Number(e.flow):null;
    const flow=aligned===null?60:
      aligned>=.08?90:
      aligned>=.05?82:
      aligned>=.025?74:
      aligned>=0?66:
      aligned>=-.025?58:
      aligned>=-.05?50:42;

    let volume=60;
    if(finite(e.relativeVolume)){
      const rv=Number(e.relativeVolume);
      volume=rv>=1.6?84:rv>=1.2?76:rv>=.9?68:rv>=.6?60:54;
    }

    let book=60;
    if(e.bookValid&&finite(e.book)){
      const ab=d*Number(e.book);
      book=ab>=.20?82:ab>=.05?72:ab>=-.05?62:ab>=-.20?52:44;
    }

    const score=flow*.65+volume*.22+book*.13;
    return {
      score:round(score),
      alignedFlow:aligned,
      volume:finite(e.relativeVolume)?Number(e.relativeVolume):null,
      book:e.bookValid&&finite(e.book)?Number(e.book):null,
      coverage:finite(e.coverage)?Number(e.coverage):0
    };
  }

  function repeatStory(signal,all){
    const e=entry(signal),family=e?.v2Family;
    if(!family)return {repeat:false,count:0};
    const prev=(all||[]).filter(q=>
      q!==signal&&q.version===TARGET_VERSION&&q.direction===signal.direction&&
      q.dataset?.entry?.v2Family===family&&Number(q.entryTime)<Number(signal.entryTime)&&
      Number(signal.entryTime)-Number(q.entryTime)<=180000
    );
    return {repeat:prev.length>0,count:prev.length};
  }

  function episodeCrowding(signal,all){
    const t=Number(signal?.entryTime);
    if(!Number.isFinite(t))return {total:0,sameDirection:0,oppositeDirection:0,openAtEntry:0};
    const prev=(all||[]).filter(q=>
      q!==signal&&q.version===TARGET_VERSION&&Number(q.entryTime)<t&&
      t-Number(q.entryTime)<=HORIZON_MS
    );
    const same=prev.filter(q=>q.direction===signal.direction).length;
    const opposite=prev.filter(q=>q.direction&&q.direction!==signal.direction).length;
    const open=prev.filter(q=>Number(q.expiresAt)>t||q.result==='pending').length;
    return {total:prev.length,sameDirection:same,oppositeDirection:opposite,openAtEntry:open};
  }

  function historicalPlaybookRisk(signal,e,all){
    const t=Number(signal?.entryTime),p=String(e?.v2Playbook||e?.setupType||'');
    if(!Number.isFinite(t)||!p)return {n:0,w:0,l:0,winRate:null,penalty:0,label:null};
    // ใช้เฉพาะผลที่ “รู้ได้แล้ว” ก่อนเวลาเข้าไม้ปัจจุบัน ป้องกัน future leakage
    const prior=(all||[]).filter(q=>
      q!==signal&&q.version===TARGET_VERSION&&['correct','incorrect'].includes(q.result)&&
      String(q.dataset?.entry?.v2Playbook||q.dataset?.entry?.setupType||'')===p&&
      Number(q.expiresAt)<=t
    );
    const n=prior.length,w=prior.filter(q=>q.result==='correct').length,l=n-w;
    const winRate=n?w/n:null;
    let penalty=0,label=null;
    if(n>=5&&winRate<.50){
      penalty=winRate<.25?12:winRate<.35?9:winRate<.45?6:3;
      label='Playbook เดิม '+w+'/'+n+' ไม้ ('+Math.round(winRate*100)+'%)';
    }
    return {n,w,l,winRate,penalty,label};
  }

  function weaknessGuardAdjustments(signal,e,ctx){
    const out=[];
    const add=(code,points,label)=>out.push({code,points:-Math.abs(points),label});
    const p=String(e.v2Playbook||e.setupType||'');
    const c=e.v2CandleBehavior||{};
    const ep=ctx.episode||{};

    // จุดอ่อนที่พบจากชุด 2.0: playbook บางกลุ่มได้คะแนนสูงทั้งที่ผลจริงอ่อน
    if(hasAny(p,['trend_reacceleration']))add('weak_playbook_reacceleration',10,'Trend re-acceleration มีความเสี่ยงจากประวัติ');
    else if(hasAny(p,['range_edge_fade']))add('weak_playbook_range_fade',10,'Range edge fade มีความเสี่ยงจากประวัติ');
    else if(hasAny(p,['failed_break_reversal']))add('weak_playbook_failed_break',7,'Failed-break reversal ต้องระวังเป็นพิเศษ');

    if(ctx.history?.penalty)add('rolling_playbook_history',ctx.history.penalty,ctx.history.label||'ผลย้อนหลังของ Playbook อ่อน');

    // 10 นาทีเดียวกันไม่ควรถูกมองเป็นหลักฐานอิสระหลายชุด
    if(ep.sameDirection>=4)add('episode_crowding_high',10,'มีไม้ฝั่งเดียวกันซ้อนใน 10 นาทีหลายไม้');
    else if(ep.sameDirection>=2)add('episode_crowding_medium',6,'มีไม้ฝั่งเดียวกันซ้อนใน 10 นาที');
    else if(ep.sameDirection>=1)add('episode_crowding_low',3,'มีไม้ฝั่งเดียวกันอยู่ใน Episode เดียวกัน');

    const aligned=ctx.flow?.alignedFlow;
    if(Number.isFinite(aligned)&&aligned<0)add('flow_against_entry',7,'Flow ตอนเข้าเริ่มสวนฝั่งสัญญาณ');
    else if(Number.isFinite(aligned)&&aligned<.025)add('fragile_flow',4,'Flow หนุนบาง เสี่ยงพลิกเร็ว');

    if(Number(e.relativeVolume)>=1.45&&(c.bodyDecay||c.failedExpansion)){
      add('hot_volume_weak_candle',6,'Volume ร้อนแต่แท่งเริ่มอ่อน/ขยายไม่ผ่าน');
    }

    const ext=ctx.timing?.extensionAtr,room=ctx.location?.roomAtr;
    if(Number.isFinite(ext)&&ext>=1.75&&Number.isFinite(room)&&room<.20){
      add('late_plus_low_room',8,'ปลายขาพร้อม Room แคบ');
    }

    if(e.v2StructuralReady===false)add('structure_not_ready',8,'Structure ตอนเข้าไม่พร้อมเต็ม');
    return out;
  }

  function timingScore(signal,e,all,d){
    const ext=finite(signal.features?.extensionAtr)?Number(signal.features.extensionAtr):
      finite(e.ema21)&&finite(e.atr)?d*(Number(e.price)-Number(e.ema21))/Math.max(Number(e.atr),1e-9):null;

    let score=80;
    if(Number.isFinite(ext)){
      if(ext>=3.25)score=52;
      else if(ext>=2.40)score=60;
      else if(ext>=1.75)score=68;
      else if(ext>=1.20)score=75;
      else if(ext>=.20)score=84;
      else if(ext<-.30)score=66;
    }

    const risk=riskText(e);
    if(risk.includes('สูง')||risk.includes('high'))score-=12;
    else if(risk.includes('กลาง')||risk.includes('medium'))score-=5;

    if(e.v2CandleBehavior?.bodyDecay)score-=4;

    const rep=repeatStory(signal,all);
    if(rep.repeat)score-=Math.min(8,2+rep.count*2);

    if(['MATURE_TREND','EXHAUSTION'].includes(e.v2State)&&hasAny(e.v2Playbook,['continuation','trend_reacceleration']))score-=6;

    return {score:round(score),extensionAtr:Number.isFinite(ext)?ext:null,repeat:rep};
  }

  function auditConfidence(e){
    const checks=[
      [finite(e.v2EntryEvidence),14],
      [finite(e.v2StateConfidence),12],
      [!!e.v2State,10],
      [!!e.v2Playbook,10],
      [typeof e.v2StructuralReady==='boolean',10],
      [!!e.zones&&(finite(e.zones?.nearestSupport?.distanceAtr)||finite(e.zones?.nearestResistance?.distanceAtr)),10],
      [!!e.v2Fib,10],
      [!!e.v2CandleBehavior,8],
      [finite(e.flow),8],
      [finite(e.coverage)&&Number(e.coverage)>=8,4],
      [finite(e.relativeVolume),2],
      [e.bookValid&&finite(e.book),2]
    ];
    return round(checks.reduce((sum,[ok,w])=>sum+(ok?w:0),0));
  }

  function riskFlags(signal,e,ctx){
    const out=[];
    const add=(code,label,severity='medium')=>out.push({code,label,severity});
    const ext=ctx.timing.extensionAtr,room=ctx.location.roomAtr,fib=e.v2Fib||{};

    if(Number.isFinite(ext)&&ext>=3.25)add('hard_late_extension','ขาเดิมยืดมาก','high');
    else if(Number.isFinite(ext)&&ext>=2.40)add('late_extension','ขาเดิมยืดไกล','medium');
    else if(Number.isFinite(ext)&&ext>=1.75)add('soft_late_extension','ขาเดิมเริ่มยืด','low');

    if(Number.isFinite(room)&&room<.08)add('critical_low_room','Room ก่อนชนแนวต่ำมาก','high');
    else if(Number.isFinite(room)&&room<.20)add('low_room','Room ข้างหน้าแคบ','medium');
    else if(Number.isFinite(room)&&room<.30)add('soft_low_room','Room เริ่มจำกัด','low');

    if(Number(fib.extension)>=1.618)add('fib_1618','Fib extension เกิน 161.8%','high');
    else if(Number(fib.extension)>=1.272)add('fib_1272','Fib extension เกิน 127.2%','medium');

    if(e.v2CandleBehavior?.bodyDecay)add('body_decay','Body เริ่มอ่อน','medium');
    if(e.v2CandleBehavior?.failedExpansion)add('failed_expansion','Expansion ล้มเหลว','medium');

    const tr=riskText(e);
    if(tr.includes('สูง')||tr.includes('high'))add('trend_change_high','Trend-change risk สูง','high');
    else if(tr.includes('กลาง')||tr.includes('medium'))add('trend_change_medium','Trend-change risk กลาง','medium');

    if(ctx.timing.repeat.repeat)add('repeat_story','ไม้ซ้ำใน Story เดิม','medium');
    if(ctx.episode?.sameDirection>=2)add('episode_crowding','มีไม้ฝั่งเดียวกันซ้อนใน 10 นาที','high');
    else if(ctx.episode?.sameDirection===1)add('episode_overlap','ยังอยู่ใน Episode 10 นาทีเดียวกับไม้ก่อน','medium');
    if(ctx.history?.penalty)add('weak_playbook_history',ctx.history.label||'สถิติย้อนหลังของ Playbook อ่อน',ctx.history.penalty>=9?'high':'medium');
    if(ctx.playbook.score<55)add('state_playbook_conflict','State กับ Playbook ขัดกัน','high');

    const aligned=ctx.flow?.alignedFlow;
    if(Number.isFinite(aligned)&&aligned<0)add('flow_against_entry','Flow ตอนเข้าเริ่มสวนฝั่งสัญญาณ','high');
    else if(Number.isFinite(aligned)&&aligned<.025)add('fragile_flow','Flow หนุนบาง เสี่ยงพลิกเร็ว','medium');

    if(Number(e.relativeVolume)>=1.45&&(e.v2CandleBehavior?.bodyDecay||e.v2CandleBehavior?.failedExpansion)){
      add('hot_volume_weak_candle','Volume ร้อนแต่ Price action เริ่มอ่อน','high');
    }

    const primary=e.v2PrimaryHypothesis?.direction;
    if(primary&&['HIGH','LOW'].includes(primary)&&primary!==signal.direction)add('primary_hypothesis_conflict','Primary hypothesis สวนฝั่งเข้า','high');

    return out;
  }

  function criticalAdjustments(signal,e,ctx,flags){
    const out=[];
    const add=(code,points,label)=>out.push({code,points:-Math.abs(points),label});

    if(ctx.playbook.score<45)add('critical_state_playbook_conflict',5,'State/Playbook ขัดกันรุนแรง');

    if(Number.isFinite(ctx.location.roomAtr)&&ctx.location.roomAtr<.08){
      add('critical_room',5,'แทบไม่มี Room ก่อนชนแนว');
    }

    const primary=e.v2PrimaryHypothesis?.direction;
    if(primary&&['HIGH','LOW'].includes(primary)&&primary!==signal.direction){
      add('critical_primary_conflict',5,'Primary hypothesis สวนฝั่งเข้า');
    }

    const fibExt=Number(e.v2Fib?.extension);
    const highRisk=riskText(e).includes('สูง')||riskText(e).includes('high');
    if(Number.isFinite(fibExt)&&fibExt>=1.618&&(highRisk||['MATURE_TREND','EXHAUSTION'].includes(e.v2State))){
      add('critical_overextension_combo',4,'ปลายขามากพร้อมความเสี่ยงกลับตัว');
    }

    out.push(...weaknessGuardAdjustments(signal,e,ctx));
    // Audit มีหน้าที่เตือนให้ชัด จึงไม่จำกัดเหลือ 3 ธงเหมือนรุ่นเดิม
    return out.slice(0,8);
  }

  function deriveReasons(ctx,flags){
    const positives=[],risks=[];
    const c=ctx.components;

    if(c.entry>=82)positives.push('Entry evidence แข็ง');
    if(c.state>=80)positives.push('State ชัด');
    if(c.playbook>=85)positives.push('Playbook เหมาะกับ State');
    if(c.structure>=85)positives.push('Structure พร้อม');
    if(c.location>=80)positives.push('Location/Room ดี');
    if(c.fib>=85)positives.push('Fib สนับสนุน');
    if(c.priceAction>=80)positives.push('Price action สนับสนุน');
    if(c.flow>=80)positives.push('Flow/Volume สนับสนุน');
    if(c.timing>=80)positives.push('Timing ยังดี');

    for(const f of flags.filter(x=>x.severity!=='low').slice(0,4))risks.push(f.label);
    if(!risks.length){
      if(c.flow<58)risks.push('Flow ไม่เด่น');
      if(c.location<62)risks.push('Room ค่อนข้างจำกัด');
      if(c.timing<62)risks.push('Timing เริ่มตึง');
    }

    return {positives:[...new Set(positives)].slice(0,5),risks:[...new Set(risks)].slice(0,5)};
  }

  function auditSignal(signal,allSignals=[]){
    if(!signal||signal.version!==TARGET_VERSION||!entry(signal))return null;
    const e=entry(signal),d=dsign(signal);if(!d)return null;

    const playbook=playbookFit(e);
    const location=locationScore(e,d);
    const fib=fibScore(e);
    const pa=priceActionScore(e,d);
    const flow=flowScore(e,d);
    const timing=timingScore(signal,e,allSignals,d);
    const episode=episodeCrowding(signal,allSignals);
    const history=historicalPlaybookRisk(signal,e,allSignals);

    const components={
      entry:scoreEntryEvidence(signal,e),
      state:scoreState(e),
      playbook:playbook.score,
      structure:structureScore(e),
      location:location.score,
      fib:fib.score,
      priceAction:pa.score,
      flow:flow.score,
      timing:timing.score
    };

    let rawComposite=0;
    for(const [k,w] of Object.entries(W))rawComposite+=components[k]*w/100;
    rawComposite=Math.round(rawComposite*10)/10;

    const ctx={components,playbook,location,fib,priceAction:pa,flow,timing,episode,history};
    const flags=riskFlags(signal,e,ctx);
    const adjustments=criticalAdjustments(signal,e,ctx,flags);
    const adjustmentTotal=adjustments.reduce((sum,x)=>sum+Math.abs(x.points),0);
    const score=round(rawComposite-Math.min(30,adjustmentTotal));
    const confidence=auditConfidence(e);
    const rr=deriveReasons(ctx,flags);

    return {
      schema:SCHEMA,
      version:2,
      revision:AUDIT_REVISION,
      targetVersion:TARGET_VERSION,
      inputScope:'entry_only',
      notWinProbability:true,
      frozen:true,
      score,
      rawComposite,
      confidence,
      grade:score>=88?'แข็งแรงมาก':score>=80?'แข็งแรง':score>=70?'ดี':score>=60?'พอใช้':'เสี่ยง',
      weights:{...W},
      components,
      riskFlags:flags,
      criticalAdjustments:adjustments,
      adjustmentTotal,
      positives:rr.positives,
      risks:rr.risks,
      calibrationBand:globalThis.AuditCalibrationV2?.bandFor?.(score)?.key||null,
      scoreOrigin:signal.result==='pending'?'prospective':'backfilled_entry_snapshot',
      context:{
        state:e.v2State||null,
        stateConfidence:finite(e.v2StateConfidence)?Number(e.v2StateConfidence):null,
        playbook:e.v2Playbook||null,
        family:e.v2Family||null,
        direction:signal.direction,
        roomAtr:location.roomAtr,
        fibLabel:fib.label,
        alignedFlow:flow.alignedFlow,
        extensionAtr:timing.extensionAtr,
        repeatStory:timing.repeat.repeat,
        repeatCount:timing.repeat.count,
        episodeTotal:episode.total,
        episodeSameDirection:episode.sameDirection,
        episodeOppositeDirection:episode.oppositeDirection,
        episodeOpenAtEntry:episode.openAtEntry,
        historicalPlaybookN:history.n,
        historicalPlaybookWinRate:Number.isFinite(history.winRate)?history.winRate:null,
        trendChangeRisk:e.v2TrendChangeRisk||null
      },
      dataCompleteness:{
        coverage:finite(e.coverage)?Number(e.coverage):null,
        bookValid:!!e.bookValid,
        fibValid:!!e.v2Fib?.valid,
        structuralReady:typeof e.v2StructuralReady==='boolean'
      },
      auditedAt:Date.now()
    };
  }

  function ensureAudit(signal,allSignals){
    if(!signal?.dataset?.entry)return null;
    const existing=signal.dataset.entry.auditV2;
    if(existing?.schema===SCHEMA&&finite(existing.score))return existing;
    const audit=auditSignal(signal,allSignals);
    if(audit)signal.dataset.entry.auditV2=audit;
    return audit;
  }

  function ensureUI(){
    let panel=document.getElementById('audit-v1-panel');
    if(panel)return panel;
    const card=document.getElementById('main-signal-card');
    const direction=card?.querySelector('.signal-card-direction');
    if(!card||!direction)return null;

    panel=document.createElement('section');
    panel.id='audit-v1-panel';
    panel.className='audit-v1-panel empty';
    panel.innerHTML=`
      <div class="audit-v1-head">
        <div><span>AUDIT V2 · WEAKNESS GUARD</span><small>ตรวจหลัง 2.0 ออกไม้ · ไม่บล็อกและไม่แก้เครื่องยนต์</small></div>
        <b id="audit-v1-status">รอไม้</b>
      </div>
      <div class="audit-v1-main">
        <strong id="audit-v1-score">—/100</strong>
        <div><b id="audit-v1-grade">ยังไม่มีไม้</b><span id="audit-v1-confidence">Confidence —/100</span></div>
      </div>
      <div class="audit-v1-components">
        <span>Structure <b id="audit-v1-structure">—</b></span>
        <span>Flow <b id="audit-v1-flow">—</b></span>
        <span>Timing <b id="audit-v1-timing">—</b></span>
      </div>
      <p id="audit-v1-reasons">เมื่อ 2.0 ออกไม้ Auditor จะตรวจคุณภาพจากข้อมูลตอนเข้า</p>
      <div class="audit-v1-calibration">
        <span id="audit-v1-band">Calibration V2 · รอข้อมูล</span>
        <b id="audit-v1-history">—</b>
      </div>
      <small id="audit-v1-note">คะแนน Audit เป็น quality score ไม่ใช่ % โอกาสชนะ</small>
    `;
    direction.insertAdjacentElement('afterend',panel);
    panel.hidden=globalThis.EventSignalV6?.CFG?.version!==TARGET_VERSION;

    if(!document.getElementById('audit-v1-style')){
      const style=document.createElement('style');
      style.id='audit-v1-style';
      style.textContent=`
        .audit-v1-panel{margin-top:7px;padding:8px;border-top:1px solid #2b3b50;background:#0d1723}
        .audit-v1-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
        .audit-v1-head>div{min-width:0}.audit-v1-head span{display:block;font-size:7px;font-weight:700;color:#a9bbcf;letter-spacing:.45px}
        .audit-v1-head small{display:block;margin-top:2px;font-size:6px;color:#6f829a;line-height:1.3}
        .audit-v1-head>b{font-size:6.5px;padding:2px 5px;border:1px solid #394b61;border-radius:999px;color:#8fa3bb;white-space:nowrap}
        .audit-v1-main{display:flex;align-items:center;gap:8px;margin-top:7px}
        .audit-v1-main>strong{font-size:19px;line-height:1;color:#d9e6f5;letter-spacing:-.4px}
        .audit-v1-main>div{display:grid;gap:2px}.audit-v1-main b{font-size:8px;color:#b6c5d6}.audit-v1-main span{font-size:6.5px;color:#7f92aa}
        .audit-v1-components{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:7px}
        .audit-v1-components span{padding:4px 5px;border:1px solid #28394d;border-radius:6px;background:#101b29;font-size:6px;color:#7f92aa;min-width:0}
        .audit-v1-components b{display:block;margin-top:1px;font-size:8px;color:#c5d4e4}
        #audit-v1-reasons{margin:6px 0 0;font-size:6.5px;line-height:1.4;color:#8ea2ba}
        .audit-v1-calibration{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-top:7px;padding-top:6px;border-top:1px solid #253448}
        .audit-v1-calibration span{font-size:6px;color:#7c90a8}.audit-v1-calibration b{font-size:7px;color:#a8bacd;text-align:right}
        #audit-v1-note{display:block;margin-top:3px;font-size:5.8px;color:#64778e;line-height:1.3}
        .audit-v1-panel.strong .audit-v1-main>strong,.audit-v1-panel.strong .audit-v1-main b{color:#62dfba}
        .audit-v1-panel.good .audit-v1-main>strong{color:#a7d49b}
        .audit-v1-panel.watch .audit-v1-main>strong{color:#e4c477}
        .audit-v1-panel.risk .audit-v1-main>strong{color:#ee8fa2}
        .audit-v1-panel.empty{opacity:.78}
        @media(max-width:560px){
          .audit-v1-panel{padding:7px}.audit-v1-main>strong{font-size:17px}
          .audit-v1-components span{font-size:5.8px}.audit-v1-components b{font-size:7.5px}
          #audit-v1-reasons{font-size:6px}
        }
      `;
      document.head.append(style);
    }
    return panel;
  }

  function calibrationFor(audit,signals){
    const report=globalThis.AuditCalibrationV2?.report?.(signals||[]);
    const bandKey=globalThis.AuditCalibrationV2?.bandFor?.(audit?.score)?.key;
    const source=audit?.revision===AUDIT_REVISION?report?.bands:report?.legacyBands;
    const band=source?.find(x=>x.key===bandKey)||null;
    return {report,band};
  }

  function render(audit,signal,signals){
    const panel=ensureUI();if(!panel)return;
    const $=id=>document.getElementById(id);
    panel.className='audit-v1-panel';

    if(!audit){
      panel.classList.add('empty');
      $('audit-v1-status').textContent='รอไม้';
      $('audit-v1-score').textContent='—/100';
      $('audit-v1-grade').textContent='ยังไม่มีไม้ 2.0';
      $('audit-v1-confidence').textContent='Confidence —/100';
      $('audit-v1-structure').textContent='—';$('audit-v1-flow').textContent='—';$('audit-v1-timing').textContent='—';
      $('audit-v1-reasons').textContent='เมื่อ 2.0 ออกไม้ Auditor จะตรวจคุณภาพจากข้อมูลตอนเข้า';
      $('audit-v1-band').textContent='Calibration V2 · รอข้อมูล';
      $('audit-v1-history').textContent='—';
      return;
    }

    panel.classList.add(audit.score>=88?'strong':audit.score>=75?'good':audit.score>=62?'watch':'risk');
    $('audit-v1-status').textContent=signal?.direction||'AUDIT';
    $('audit-v1-score').textContent=audit.score+'/100';
    $('audit-v1-grade').textContent=audit.grade;
    $('audit-v1-confidence').textContent='Confidence '+audit.confidence+'/100';
    $('audit-v1-structure').textContent=audit.components.structure+'/100';
    $('audit-v1-flow').textContent=audit.components.flow+'/100';
    $('audit-v1-timing').textContent=audit.components.timing+'/100';

    const reasonBits=[...audit.positives.slice(0,2),...audit.risks.slice(0,2)];
    $('audit-v1-reasons').textContent=reasonBits.length?reasonBits.join(' · '):'ยังไม่มีธงเด่นเป็นพิเศษ';

    const cal=calibrationFor(audit,signals);
    const label=globalThis.AuditCalibrationV2?.bandFor?.(audit.score)?.label||'ช่วงคะแนน';
    $('audit-v1-band').textContent=(audit.revision===AUDIT_REVISION?'Guard r1 ':'Legacy ')+label;

    if(cal.band?.n>=5&&Number.isFinite(cal.band.winRate)){
      $('audit-v1-history').textContent='ชนะ '+cal.band.winRate.toFixed(1)+'% · '+cal.band.w+'/'+cal.band.n+' ไม้';
    }else if(cal.band?.n){
      $('audit-v1-history').textContent='มี '+cal.band.n+' ไม้ · ข้อมูลยังน้อย';
    }else{
      $('audit-v1-history').textContent='ยังไม่มีผลในช่วงนี้';
    }

    const health=audit.revision===AUDIT_REVISION?cal.report?.health:cal.report?.legacy?.health;
    $('audit-v1-note').textContent=health?.samples>=20&&Number.isFinite(health.score)
      ?'Audit calibration '+health.score+'/100 · '+health.note
      :'คะแนน Audit เป็น quality score ไม่ใช่ % ชนะ · กำลังสะสม Calibration V2';
  }

  function update(signals=[]){
    const rows=Array.isArray(signals)?signals:[];
    for(const s of rows)if(s?.version===TARGET_VERSION&&s.dataset?.entry)ensureAudit(s,rows);
    globalThis.AuditCalibrationV2?.update?.(rows);
    const panel=ensureUI();
    const activeVersion=globalThis.EventSignalV6?.CFG?.version||null;
    if(panel)panel.hidden=activeVersion!==TARGET_VERSION;
    if(activeVersion!==TARGET_VERSION)return null;
    const latest=[...rows].reverse().find(s=>s?.version===TARGET_VERSION&&s.dataset?.entry);
    const audit=latest?ensureAudit(latest,rows):null;
    render(audit,latest,rows);
    return audit;
  }

  function exportReport(signals=[]){
    const rows=Array.isArray(signals)?signals:[];
    update(rows);
    return {
      schema:SCHEMA,
      revision:AUDIT_REVISION,
      targetVersion:TARGET_VERSION,
      generatedAt:new Date().toISOString(),
      weights:{...W},
      totalAudited:rows.filter(s=>s?.dataset?.entry?.auditV2?.schema===SCHEMA).length,
      calibration:globalThis.AuditCalibrationV2?.report?.(rows)||null,
      history:globalThis.AuditCalibrationV2?.history?.(rows)||[]
    };
  }

  globalThis.AuditEngineV2={
    schema:SCHEMA,
    revision:AUDIT_REVISION,
    targetVersion:TARGET_VERSION,
    weights:{...W},
    auditSignal,
    ensureAudit,
    update,
    exportReport
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI,{once:true});
  else ensureUI();
})();