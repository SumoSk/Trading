(() => {
  'use strict';

  const SCHEMA='trade-audit-v1';
  const TARGET_VERSION='ARIS-2.0.0';
  const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,Number(v)||0));
  const finite=v=>Number.isFinite(Number(v));
  const round=v=>Math.round(clamp(v));
  const W=Object.freeze({
    entry:15,state:12,playbook:12,structure:12,location:12,
    fib:10,priceAction:10,flow:10,timing:7
  });

  const RANGE_STATES=new Set(['FRESH_RANGE','BALANCED_RANGE','RANGE_COMPRESSION','EDGE_PRESSURE','CHOP']);
  const BREAK_STATES=new Set(['BREAKOUT_ATTEMPT','BREAKOUT_RETEST','BREAKOUT_ACCEPTED','FALSE_BREAK']);
  const TREND_STATES=new Set(['EXPANSION','IMPULSE','TREND','PULLBACK','MATURE_TREND']);
  const REV_STATES=new Set(['EXHAUSTION','REVERSAL_WATCH','REVERSAL_CONFIRMED']);

  function dsign(signal){return signal?.direction==='HIGH'?1:signal?.direction==='LOW'?-1:0;}
  function entry(signal){return signal?.dataset?.entry||null;}
  function text(v){return String(v??'').toLowerCase();}
  function hasAny(v,parts){const s=text(v);return parts.some(x=>s.includes(x));}

  function nearestRoom(e,d){
    const q=d>0?e?.zones?.nearestResistance:e?.zones?.nearestSupport;
    return finite(q?.distanceAtr)?Number(q.distanceAtr):null;
  }

  function scoreEntryEvidence(signal,e){
    return round(finite(e.v2EntryEvidence)?e.v2EntryEvidence:signal.features?.v2Evidence??50);
  }

  function scoreState(e){
    const conf=finite(e.v2StateConfidence)?Number(e.v2StateConfidence):50;
    let score=conf;
    if(['CONFLICT','TRANSITION'].includes(e.v2State))score-=15;
    if(e.v2State==='CHOP')score-=10;
    return round(score);
  }

  function playbookFit(e){
    const state=String(e.v2State||''),p=String(e.v2Playbook||e.setupType||'');
    if(!state||!p)return {score:55,label:'State/Playbook ไม่ครบ'};
    let fit=58;
    if(RANGE_STATES.has(state)){
      if(hasAny(p,['range_edge_fade','range_rotation']))fit=90;
      else if(state==='RANGE_COMPRESSION'&&hasAny(p,['compression_breakout']))fit=92;
      else if(state==='EDGE_PRESSURE'&&hasAny(p,['edge_pressure_breakout']))fit=92;
      else if(hasAny(p,['breakout']))fit=68;
    }else if(BREAK_STATES.has(state)){
      if(state==='FALSE_BREAK'&&hasAny(p,['failed_break_reversal','breakout_trap_reversal']))fit=95;
      else if(hasAny(p,['breakout_follow','breakout_micro_pullback','breakout_retest']))fit=90;
      else if(hasAny(p,['reversal']))fit=70;
    }else if(TREND_STATES.has(state)){
      if(hasAny(p,['trend_pullback','fib_pullback','trend_reacceleration','continuation','mature_recovery','shock_follow']))fit=91;
      else if(hasAny(p,['reversal']))fit=55;
    }else if(REV_STATES.has(state)){
      if(hasAny(p,['exhaustion_reversal','reversal_follow','shock_failure','failed_break_reversal']))fit=94;
      else if(hasAny(p,['continuation','trend_reacceleration']))fit=42;
    }else if(state==='CONFLICT'){
      fit=hasAny(p,['observe_conflict'])?82:48;
    }else if(state==='TRANSITION'){
      fit=60;
    }
    return {score:round(fit),label:fit>=85?'State กับ Playbook เข้ากัน':fit>=65?'State/Playbook พอใช้':'State/Playbook มีความขัดแย้ง'};
  }

  function structureScore(e){
    let score=e.v2StructuralReady===true?94:e.v2StructuralReady===false?48:62;
    const checks=Array.isArray(e.v2Checks)?e.v2Checks:[];
    if(checks.length){
      const known=checks.filter(q=>typeof q?.ok==='boolean'||typeof q?.pass==='boolean'||typeof q?.ready==='boolean');
      if(known.length){
        const passed=known.filter(q=>q.ok===true||q.pass===true||q.ready===true).length;
        score=score*.65+(passed/known.length*100)*.35;
      }
    }
    if(!finite(e.v2InvalidationPrice))score-=5;
    return round(score);
  }

  function locationScore(e,d){
    const roomAtr=nearestRoom(e,d);
    let roomScore=roomAtr===null?52:roomAtr>=.55?96:roomAtr>=.40?86:roomAtr>=.30?75:roomAtr>=.20?58:roomAtr>=.12?38:20;
    const rp=Number(e.rangePosition);
    let locationBonus=0,label='ตำแหน่งกลาง';
    if(Number.isFinite(rp)){
      const favorable=d>0?1-rp:rp;
      if(favorable>=.70){locationBonus=8;label='ตำแหน่งเริ่มฝั่งที่มีพื้นที่';}
      else if(favorable<=.20){locationBonus=-12;label='ตำแหน่งปลายฝั่ง/ใกล้ขอบเป้าหมาย';}
      else if(favorable<=.35){locationBonus=-5;label='ตำแหน่งเริ่มตึง';}
    }
    return {score:round(roomScore+locationBonus),roomAtr,label};
  }

  function fibScore(e){
    const fib=e.v2Fib;
    if(!fib?.valid)return {score:55,label:'Fib ยังไม่ยืนยัน'};
    const ext=Number(fib.extension),ret=Number(fib.retracement);
    if(fib.confluence&&fib.healthy)return {score:96,label:'Fib healthy + confluence'};
    if(fib.healthy)return {score:88,label:'Fib healthy'};
    if(fib.deep)return {score:55,label:'Fib deep pullback'};
    if(Number.isFinite(ext)&&ext>=1.618)return {score:20,label:'Fib extension >161.8%'};
    if(Number.isFinite(ext)&&ext>=1.272)return {score:35,label:'Fib extension >127.2%'};
    if(Number.isFinite(ext)&&ext>1)return {score:66,label:'ราคาเลย swing เดิม'};
    if(Number.isFinite(ret)&&ret<.20)return {score:62,label:'Fib pullback ตื้น'};
    return {score:74,label:'Fib ปกติ'};
  }

  function priceActionScore(e,d){
    const c=e.v2CandleBehavior||{};
    let score=70;
    const tags=[];
    if(c.bodyDecay){score-=18;tags.push('body decay');}
    if(c.failedExpansion){score-=14;tags.push('failed expansion');}
    if(c.contraction){score-=4;tags.push('contraction');}
    if(c.shock){score+=4;tags.push('shock');}
    if(c.marubozu){score+=5;tags.push('marubozu');}
    const pressure=Number(c.pressureDir??c.pressure);
    if(Number.isFinite(pressure)){
      if(Math.sign(pressure)===d)score+=8;else if(Math.sign(pressure)===-d)score-=10;
    }
    const rejection=Number(c.rejectionDir??c.rejection);
    if(Number.isFinite(rejection)){
      if(Math.sign(rejection)===d)score+=7;else if(Math.sign(rejection)===-d)score-=10;
    }
    if(Array.isArray(c.tags))tags.push(...c.tags.slice(0,3));
    return {score:round(score),tags:[...new Set(tags)].slice(0,5)};
  }

  function flowScore(e,d){
    const aligned=finite(e.flow)?d*Number(e.flow):null;
    let flow=aligned===null?50:aligned>=.08?95:aligned>=.05?85:aligned>=.025?72:aligned>=0?58:aligned>=-.025?42:aligned>=-.05?28:15;
    let volume=finite(e.relativeVolume)?clamp(45+Number(e.relativeVolume)*25):55;
    volume=Math.min(volume,95);
    let book=55;
    if(e.bookValid&&finite(e.book)){
      const ab=d*Number(e.book);
      book=ab>=.20?85:ab>=.05?70:ab>=-.05?55:ab>=-.20?40:25;
    }
    const coverage=finite(e.coverage)?Number(e.coverage):0;
    let score=flow*.60+volume*.25+book*.15;
    if(coverage<8)score-=7;
    return {score:round(score),alignedFlow:aligned,volume:finite(e.relativeVolume)?Number(e.relativeVolume):null,book:e.bookValid&&finite(e.book)?Number(e.book):null,coverage};
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

  function timingScore(signal,e,all,d){
    const ext=finite(signal.features?.extensionAtr)?Number(signal.features.extensionAtr):
      finite(e.ema21)&&finite(e.atr)?d*(Number(e.price)-Number(e.ema21))/Math.max(Number(e.atr),1e-9):null;
    let score=82;
    if(Number.isFinite(ext)){
      if(ext>=3.25)score-=42;
      else if(ext>=2.40)score-=28;
      else if(ext>=1.75)score-=15;
      else if(ext<=-.30)score-=8;
      else if(ext>=.20&&ext<=1.20)score+=5;
    }
    const risk=text(e.v2TrendChangeRisk);
    if(risk.includes('สูง')||risk.includes('high'))score-=25;
    else if(risk.includes('กลาง')||risk.includes('medium'))score-=10;
    if(e.v2CandleBehavior?.bodyDecay)score-=10;
    const rep=repeatStory(signal,all);
    if(rep.repeat)score-=Math.min(14,5+rep.count*3);
    if(['MATURE_TREND','EXHAUSTION'].includes(e.v2State)&&hasAny(e.v2Playbook,['continuation','trend_reacceleration']))score-=14;
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

  function buildPenalties(signal,e,ctx){
    const penalties=[];
    const add=(code,points,label)=>penalties.push({code,points:-Math.abs(points),label});
    const ext=ctx.timing.extensionAtr,room=ctx.location.roomAtr,fib=e.v2Fib||{};
    if(Number.isFinite(ext)&&ext>=3.25)add('hard_late_extension',12,'ขาเดิมยืดมาก');
    else if(Number.isFinite(ext)&&ext>=2.40)add('late_extension',8,'ขาเดิมยืดไกล');
    else if(Number.isFinite(ext)&&ext>=1.75)add('soft_late_extension',4,'ขาเดิมเริ่มยืด');
    if(Number.isFinite(room)&&room<.12)add('critical_low_room',12,'Room ก่อนชนแนวต่ำมาก');
    else if(Number.isFinite(room)&&room<.20)add('low_room',8,'Room ข้างหน้าแคบ');
    else if(Number.isFinite(room)&&room<.30)add('soft_low_room',4,'Room เริ่มจำกัด');
    if(Number(fib.extension)>=1.618)add('fib_1618',10,'Fib extension เกิน 161.8%');
    else if(Number(fib.extension)>=1.272)add('fib_1272',6,'Fib extension เกิน 127.2%');
    if(e.v2CandleBehavior?.bodyDecay)add('body_decay',5,'Body เริ่มอ่อน');
    if(e.v2CandleBehavior?.failedExpansion)add('failed_expansion',5,'Expansion ล้มเหลว');
    const tr=text(e.v2TrendChangeRisk);
    if(tr.includes('สูง')||tr.includes('high'))add('trend_change_high',8,'Trend-change risk สูง');
    else if(tr.includes('กลาง')||tr.includes('medium'))add('trend_change_medium',3,'Trend-change risk กลาง');
    if(ctx.timing.repeat.repeat)add('repeat_story',Math.min(8,3+ctx.timing.repeat.count*2),'ไม้ซ้ำใน Story เดิม');
    if(ctx.playbook.score<55)add('state_playbook_conflict',7,'State กับ Playbook ขัดกัน');
    const primary=e.v2PrimaryHypothesis?.direction;
    if(primary&&['HIGH','LOW'].includes(primary)&&primary!==signal.direction)add('primary_hypothesis_conflict',6,'Primary hypothesis สวนฝั่งเข้า');
    return penalties;
  }

  function deriveReasons(ctx,penalties){
    const positives=[],risks=[];
    const c=ctx.components;
    if(c.entry>=82)positives.push('Entry evidence แข็ง');
    if(c.state>=80)positives.push('State ชัด');
    if(c.playbook>=85)positives.push('Playbook เหมาะกับ State');
    if(c.structure>=85)positives.push('Structure พร้อม');
    if(c.location>=80)positives.push('ตำแหน่งและ Room ดี');
    if(c.fib>=85)positives.push('Fib สนับสนุน');
    if(c.priceAction>=80)positives.push('Price action สนับสนุน');
    if(c.flow>=80)positives.push('Flow/Volume สนับสนุน');
    if(c.timing>=82)positives.push('Timing ยังไม่ปลายขา');

    if(c.structure<60)risks.push('Structure ไม่แข็ง');
    if(c.location<55)risks.push('Location/Room เสี่ยง');
    if(c.fib<50)risks.push('Fib อยู่โซนเสี่ยง');
    if(c.priceAction<55)risks.push('แท่งเทียนเริ่มขัด');
    if(c.flow<50)risks.push('Flow ไม่หนุน');
    if(c.timing<55)risks.push('Timing เสี่ยง/ปลายขา');
    for(const p of penalties.slice(0,4))risks.push(p.label);
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

    let weighted=0;
    for(const [k,w] of Object.entries(W))weighted+=components[k]*w/100;

    const ctx={components,playbook,location,fib,priceAction:pa,flow,timing};
    const penalties=buildPenalties(signal,e,ctx);
    const penaltyTotal=penalties.reduce((sum,p)=>sum+Math.abs(p.points),0);
    const score=round(weighted-Math.min(30,penaltyTotal));
    const confidence=auditConfidence(e);
    const rr=deriveReasons(ctx,penalties);
    const calibrationBand=globalThis.AuditCalibrationV1?.bandFor?.(score)?.key||null;

    return {
      schema:SCHEMA,
      version:1,
      targetVersion:TARGET_VERSION,
      inputScope:'entry_only',
      notWinProbability:true,
      frozen:true,
      score,
      confidence,
      grade:score>=88?'แข็งแรงมาก':score>=80?'แข็งแรง':score>=70?'ดี':score>=60?'กลาง':'เสี่ยง',
      weights:{...W},
      components,
      penalties,
      penaltyTotal,
      positives:rr.positives,
      risks:rr.risks,
      calibrationBand,
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
    const existing=signal.dataset.entry.auditV1;
    if(existing?.schema===SCHEMA&&finite(existing.score))return existing;
    const audit=auditSignal(signal,allSignals);
    if(audit)signal.dataset.entry.auditV1=audit;
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
        <div><span>AUDIT ไม้ล่าสุด</span><small>ตรวจหลัง 2.0 ออกไม้ · ไม่แตะเครื่องยนต์</small></div>
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
        <span id="audit-v1-band">Calibration · รอข้อมูล</span>
        <b id="audit-v1-history">—</b>
      </div>
      <small id="audit-v1-note">คะแนน Audit เป็น quality score ไม่ใช่ % โอกาสชนะ</small>
    `;
    direction.insertAdjacentElement('afterend',panel);

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
    const report=globalThis.AuditCalibrationV1?.report?.(signals||[]);
    const bandKey=globalThis.AuditCalibrationV1?.bandFor?.(audit?.score)?.key;
    const band=report?.bands?.find(x=>x.key===bandKey)||null;
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
      $('audit-v1-band').textContent='Calibration · รอข้อมูล';
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
    const label=globalThis.AuditCalibrationV1?.bandFor?.(audit.score)?.label||'ช่วงคะแนน';
    $('audit-v1-band').textContent='Calibration '+label;
    if(cal.band?.n>=5&&Number.isFinite(cal.band.winRate)){
      $('audit-v1-history').textContent='ชนะ '+cal.band.winRate.toFixed(1)+'% · '+cal.band.w+'/'+cal.band.n+' ไม้';
    }else if(cal.band?.n){
      $('audit-v1-history').textContent='มี '+cal.band.n+' ไม้ · ข้อมูลยังน้อย';
    }else{
      $('audit-v1-history').textContent='ยังไม่มีผลในช่วงนี้';
    }

    const health=cal.report?.health;
    $('audit-v1-note').textContent=health?.samples>=20&&Number.isFinite(health.score)
      ?'Audit calibration '+health.score+'/100 · '+health.note
      :'คะแนน Audit เป็น quality score ไม่ใช่ % ชนะ · กำลังสะสม Calibration';
  }

  function update(signals=[]){
    const rows=Array.isArray(signals)?signals:[];
    for(const s of rows)if(s?.version===TARGET_VERSION&&s.dataset?.entry)ensureAudit(s,rows);
    globalThis.AuditCalibrationV1?.update?.(rows);
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
      targetVersion:TARGET_VERSION,
      generatedAt:new Date().toISOString(),
      weights:{...W},
      totalAudited:rows.filter(s=>s?.dataset?.entry?.auditV1?.schema===SCHEMA).length,
      calibration:globalThis.AuditCalibrationV1?.report?.(rows)||null,
      history:globalThis.AuditCalibrationV1?.history?.(rows)||[]
    };
  }

  globalThis.AuditEngineV1={
    schema:SCHEMA,
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