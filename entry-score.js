(() => {
  'use strict';

  const SCHEMA='entry-quality-v1';
  const TARGET_VERSION='ARIS-2.0.0';
  const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,Number(v)||0));
  const finite=v=>Number.isFinite(Number(v));
  const round=v=>Math.round(clamp(v));

  function directionSign(signal){
    return signal?.direction==='HIGH'?1:signal?.direction==='LOW'?-1:0;
  }

  function opposingRoom(entry,d){
    const z=entry?.zones;
    const q=d>0?z?.nearestResistance:z?.nearestSupport;
    return finite(q?.distanceAtr)?Number(q.distanceAtr):null;
  }

  function fibQuality(fib){
    if(!fib?.valid)return {score:55,label:'Fib ยังไม่ชัด'};
    const ext=Number(fib.extension),ret=Number(fib.retracement);
    if(fib.healthy)return {score:90,label:'Fib อยู่โซน healthy'};
    if(fib.deep)return {score:55,label:'Fib ย่อลึก'};
    if(finite(ext)&&ext>=1.618)return {score:20,label:'Fib extension เกิน 161.8%'};
    if(finite(ext)&&ext>=1.272)return {score:35,label:'Fib extension เกิน 127.2%'};
    if(finite(ext)&&ext>1)return {score:65,label:'ราคาเลย swing เดิมแล้ว'};
    if(finite(ret)&&ret<.20)return {score:60,label:'Fib ย่อตื้น'};
    return {score:75,label:'Fib อยู่บริบทใช้ได้'};
  }

  function riskQuality(entry){
    const risk=String(entry?.v2TrendChangeRisk||'').toLowerCase();
    let score=risk.includes('สูง')||risk.includes('high')?35:risk.includes('กลาง')||risk.includes('medium')?60:85;
    if(entry?.v2CandleBehavior?.bodyDecay)score-=15;
    if(entry?.v2CandleBehavior?.failedExpansion)score-=10;
    return {score:clamp(score),label:score>=75?'ความเสี่ยงเปลี่ยนเทรนด์ต่ำ':score>=50?'มีความเสี่ยงเปลี่ยนจังหวะ':'เสี่ยงเปลี่ยนจังหวะสูง'};
  }

  function componentReasons(c){
    const positives=[],negatives=[];
    if(c.evidence>=80)positives.push('หลักฐานเข้าแข็ง');
    else if(c.evidence<70)negatives.push('หลักฐานเข้าไม่สูงมาก');

    if(c.state>=78)positives.push('State ชัด');
    else if(c.state<60)negatives.push('State ยังไม่นิ่ง');

    if(c.flow>=72)positives.push('Flow หนุน');
    else if(c.flow<45)negatives.push('Flow ไม่ค่อยหนุน');

    if(c.room>=75)positives.push('Room พอ');
    else if(c.room<45)negatives.push('Room ข้างหน้าแคบ');

    if(c.fib>=82)positives.push('Fib ดี');
    else if(c.fib<50)negatives.push('Fib เสี่ยง');

    if(c.structure>=85)positives.push('โครงสร้างพร้อม');
    else if(c.structure<60)negatives.push('โครงสร้างยังไม่เต็ม');

    if(c.risk>=75)positives.push('Trend risk ต่ำ');
    else if(c.risk<50)negatives.push('Trend risk สูง');

    return {positives,negatives};
  }

  function scoreSignal(signal,allSignals=[]){
    if(!signal||signal.version!==TARGET_VERSION||!signal.dataset?.entry)return null;
    const e=signal.dataset.entry,d=directionSign(signal);
    if(!d)return null;

    const evidence=clamp(finite(e.v2EntryEvidence)?e.v2EntryEvidence:signal.features?.v2Evidence??50);
    const state=clamp(finite(e.v2StateConfidence)?e.v2StateConfidence:signal.features?.v2StateConfidence??50);

    const alignedFlow=finite(e.flow)?d*Number(e.flow):0;
    const flow=clamp(50+(alignedFlow/.08)*50);

    const roomAtr=opposingRoom(e,d);
    const room=roomAtr===null?50:clamp((roomAtr/.45)*100);

    const fibInfo=fibQuality(e.v2Fib);
    const structure=e.v2StructuralReady===true?95:e.v2StructuralReady===false?55:65;
    const riskInfo=riskQuality(e);

    const components={
      evidence:round(evidence),
      state:round(state),
      flow:round(flow),
      room:round(room),
      fib:round(fibInfo.score),
      structure:round(structure),
      risk:round(riskInfo.score)
    };

    let score=
      evidence*.30+
      state*.20+
      flow*.15+
      room*.10+
      fibInfo.score*.10+
      structure*.10+
      riskInfo.score*.05;

    const extension=Number(signal.features?.extensionAtr);
    const family=e.v2Family;
    const repeat=!!family&&allSignals.some(q=>
      q!==signal&&q.version===TARGET_VERSION&&q.direction===signal.direction&&
      q.dataset?.entry?.v2Family===family&&
      Number(q.entryTime)<Number(signal.entryTime)&&
      Number(signal.entryTime)-Number(q.entryTime)<90000
    );

    const penalties=[];
    if(finite(extension)&&extension>=3.25){score-=8;penalties.push('ขาเดิมยืดมาก');}
    else if(finite(extension)&&extension>=1.75){score-=4;penalties.push('ขาเดิมเริ่มยืด');}
    if(repeat){score-=4;penalties.push('เป็นไม้ซ้ำใน Story ใกล้กัน');}

    score=round(score);
    const rr=componentReasons(components);
    const reasons=[...rr.positives.slice(0,3),...rr.negatives.slice(0,2),...penalties].slice(0,4);

    return {
      schema:SCHEMA,
      score,
      label:score>=82?'เด่น':score>=72?'ดี':score>=62?'กลาง':'เสี่ยง',
      notWinProbability:true,
      inputScope:'entry_only',
      components,
      inputs:{
        alignedFlow:Number(alignedFlow.toFixed(4)),
        roomAtr:roomAtr===null?null:Number(roomAtr.toFixed(3)),
        fibLabel:fibInfo.label,
        riskLabel:riskInfo.label,
        extensionAtr:finite(extension)?Number(extension.toFixed(3)):null,
        repeatStory:repeat
      },
      reasons
    };
  }

  function ensureScore(signal,allSignals){
    if(!signal?.dataset?.entry)return null;
    const existing=signal.dataset.entry.entryQualityV1;
    if(existing?.schema===SCHEMA&&finite(existing.score))return existing;
    const scored=scoreSignal(signal,allSignals);
    if(scored)signal.dataset.entry.entryQualityV1={...scored,scoredAt:Date.now()};
    return scored;
  }

  function ensureUI(){
    let box=document.getElementById('entry-quality-box');
    if(box)return box;
    const button=document.getElementById('expedite-five-toggle');
    if(!button)return null;

    box=document.createElement('div');
    box.id='entry-quality-box';
    box.className='entry-quality-box empty';
    box.innerHTML='<div><span>คะแนนไม้ล่าสุด</span><strong id="entry-quality-value">—/100</strong><b id="entry-quality-label">รอไม้ 2.0</b></div><small id="entry-quality-reasons">เป็นคะแนนคัดกรองคุณภาพไม้ ไม่ใช่ % ชนะ</small>';
    button.insertAdjacentElement('afterend',box);

    if(!document.getElementById('entry-quality-style')){
      const style=document.createElement('style');
      style.id='entry-quality-style';
      style.textContent=`
        .entry-quality-box{margin:0 0 7px;padding:6px 8px;border:1px solid #304159;border-radius:8px;background:#0f1926}
        .entry-quality-box>div{display:flex;align-items:baseline;gap:6px;min-width:0}
        .entry-quality-box span{font-size:7px;color:#8194ad;white-space:nowrap}
        .entry-quality-box strong{font-size:11px;line-height:1;color:#dce8f7}
        .entry-quality-box b{font-size:7px;color:#9eb0c6;font-weight:600}
        .entry-quality-box small{display:block;margin-top:4px;font-size:6.5px;line-height:1.35;color:#71859f;white-space:normal}
        .entry-quality-box.strong{border-color:#397b68;background:#10211d}.entry-quality-box.strong strong{color:#67dfbb}
        .entry-quality-box.good{border-color:#526d55}.entry-quality-box.good strong{color:#a6d49b}
        .entry-quality-box.watch{border-color:#78663e}.entry-quality-box.watch strong{color:#e1c27a}
        .entry-quality-box.risk{border-color:#784557}.entry-quality-box.risk strong{color:#ef91a2}
        .entry-quality-box.empty{opacity:.75}
        @media(max-width:560px){.entry-quality-box{padding:5px 7px}.entry-quality-box strong{font-size:10px}.entry-quality-box span,.entry-quality-box b{font-size:6.5px}.entry-quality-box small{font-size:6px}}
      `;
      document.head.append(style);
    }
    return box;
  }

  function render(score,signal){
    const box=ensureUI();if(!box)return;
    const value=document.getElementById('entry-quality-value');
    const label=document.getElementById('entry-quality-label');
    const reasons=document.getElementById('entry-quality-reasons');
    box.className='entry-quality-box';

    if(!score){
      box.classList.add('empty');
      value.textContent='—/100';
      label.textContent='รอไม้ 2.0';
      reasons.textContent='เป็นคะแนนคัดกรองคุณภาพไม้ ไม่ใช่ % ชนะ';
      return;
    }

    box.classList.add(score.score>=82?'strong':score.score>=72?'good':score.score>=62?'watch':'risk');
    value.textContent=score.score+'/100';
    label.textContent=score.label;
    const time=Number(signal?.entryTime);
    const when=Number.isFinite(time)?new Date(time).toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}):'';
    reasons.textContent=(when?when+' · ':'')+(score.reasons.length?score.reasons.join(' · '):'ข้อมูลตอนเข้าอยู่ในเกณฑ์กลาง')+' · ไม่ใช่ % ชนะ';
  }

  function update(signals=[]){
    ensureUI();
    const rows=Array.isArray(signals)?signals:[];
    for(const s of rows)if(s?.version===TARGET_VERSION&&s.dataset?.entry)ensureScore(s,rows);
    const latest=[...rows].reverse().find(s=>s?.version===TARGET_VERSION&&s.dataset?.entry);
    render(latest?ensureScore(latest,rows):null,latest||null);
    return latest?.dataset?.entry?.entryQualityV1||null;
  }

  globalThis.EntryScoreV1={
    schema:SCHEMA,
    targetVersion:TARGET_VERSION,
    scoreSignal,
    ensureScore,
    update
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI,{once:true});
  else ensureUI();
})();