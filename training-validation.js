(() => {
  'use strict';

  const SCHEMA='training-validation-v1';
  const MIN_TOTAL=30;
  const DEFAULT_SPLIT={train:.60,validation:.20,holdout:.20};
  const AUDIT_THRESHOLDS=[null,60,65,70,75,80,85,90];
  const FOLDS=4;
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const pct=(w,n)=>n?Math.round(w/n*1000)/10:null;
  const r1=v=>Number.isFinite(Number(v))?Math.round(Number(v)*10)/10:null;
  const avg=arr=>{
    const a=(arr||[]).map(num).filter(v=>v!==null);
    return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  };
  const scored=s=>s&&['correct','incorrect'].includes(s.result);

  function stats(rows){
    const a=(rows||[]).filter(scored);
    const wins=a.filter(x=>x.result==='correct').length;
    const losses=a.filter(x=>x.result==='incorrect').length;
    return {
      n:a.length,wins,losses,winRate:pct(wins,wins+losses),
      avgMfeAtr:r1(avg(a.map(x=>x.outcome?.mfeAtr))),
      avgMaeAtr:r1(avg(a.map(x=>x.outcome?.maeAtr))),
      avgMoveAtr:r1(avg(a.map(x=>x.outcome?.directionalMoveAtr))),
      avgAudit:r1(avg(a.map(x=>x.entry?.audit?.score)))
    };
  }

  function wilsonLower(w,n,z=1.645){
    if(!n)return 0;
    const p=w/n,z2=z*z,den=1+z2/n;
    const center=p+z2/(2*n);
    const margin=z*Math.sqrt((p*(1-p)+z2/(4*n))/n);
    return (center-margin)/den;
  }

  function groupStats(rows,keyFn){
    const m=new Map();
    for(const s of rows){
      const key=String(keyFn(s)??'UNKNOWN');
      if(!m.has(key))m.set(key,{key,n:0,w:0,l:0});
      const x=m.get(key);x.n++;
      if(s.result==='correct')x.w++;else if(s.result==='incorrect')x.l++;
    }
    return [...m.values()].map(x=>({...x,winRate:pct(x.w,x.w+x.l)})).sort((a,b)=>b.n-a.n);
  }

  function auditBand(v){
    const s=num(v);
    if(s===null)return 'NO_AUDIT';
    if(s>=90)return '90-100';
    if(s>=80)return '80-89';
    if(s>=70)return '70-79';
    if(s>=60)return '60-69';
    return '0-59';
  }

  function calibration(rows){
    const order=['90-100','80-89','70-79','60-69','0-59'];
    const raw=groupStats(rows.filter(s=>num(s.entry?.audit?.score)!==null),s=>auditBand(s.entry.audit.score));
    const by=new Map(raw.map(x=>[x.key,x]));
    const bands=order.map(key=>by.get(key)||{key,n:0,w:0,l:0,winRate:null});
    const usable=bands.filter(x=>x.n>=3&&Number.isFinite(x.winRate));
    let comparisons=0,ordered=0;
    for(let i=0;i<usable.length-1;i++){
      comparisons++;
      if(usable[i].winRate>=usable[i+1].winRate)ordered++;
    }
    return {
      samples:bands.reduce((n,x)=>n+x.n,0),
      orderingPct:comparisons?Math.round(ordered/comparisons*100):null,
      bands
    };
  }

  function chronologicalSplit(rows,split=DEFAULT_SPLIT){
    const a=(rows||[]).filter(scored).sort((x,y)=>(x.entryTime||0)-(y.entryTime||0));
    if(!a.length)return {train:[],validation:[],holdout:[],bounds:null,mode:'empty'};
    const first=Number(a[0].entryTime)||0,last=Number(a.at(-1).entryTime)||first;
    const span=Math.max(1,last-first);
    const b1=first+span*split.train,b2=first+span*(split.train+split.validation);
    let train=a.filter(x=>Number(x.entryTime)<b1);
    let validation=a.filter(x=>Number(x.entryTime)>=b1&&Number(x.entryTime)<b2);
    let holdout=a.filter(x=>Number(x.entryTime)>=b2);
    let mode='time_ratio';
    const minSlice=Math.max(3,Math.floor(a.length*.08));
    if(train.length<minSlice||validation.length<minSlice||holdout.length<minSlice){
      const n1=Math.max(1,Math.floor(a.length*split.train));
      const n2=Math.max(n1+1,Math.floor(a.length*(split.train+split.validation)));
      train=a.slice(0,n1);validation=a.slice(n1,n2);holdout=a.slice(n2);
      mode='count_ratio_fallback';
    }
    return {
      train,validation,holdout,mode,
      bounds:{
        start:first,end:last,
        trainEnd:train.at(-1)?.entryTime||null,
        validationStart:validation[0]?.entryTime||null,
        validationEnd:validation.at(-1)?.entryTime||null,
        holdoutStart:holdout[0]?.entryTime||null
      }
    };
  }

  function rulesLabel(r){
    const parts=[];
    if(num(r.auditMin)!==null)parts.push('Audit ≥ '+Number(r.auditMin));
    if(r.excludeState)parts.push('ตัด State '+r.excludeState);
    if(r.excludePlaybook)parts.push('ตัด Playbook '+r.excludePlaybook);
    return parts.length?parts.join(' · '):'Baseline เดิม ไม่เพิ่ม filter';
  }

  function applyRules(rows,rules={}){
    return (rows||[]).filter(s=>{
      const score=num(s.entry?.audit?.score);
      if(num(rules.auditMin)!==null&&(score===null||score<Number(rules.auditMin)))return false;
      if(rules.excludeState&&String(s.entry?.state??'UNKNOWN')===rules.excludeState)return false;
      if(rules.excludePlaybook&&String(s.entry?.playbook??s.type??'UNKNOWN')===rules.excludePlaybook)return false;
      return true;
    });
  }

  function weakestGroup(rows,keyFn){
    const base=stats(rows),groups=groupStats(rows,keyFn);
    const minN=Math.max(6,Math.floor(rows.length*.08));
    const weak=groups
      .filter(x=>x.n>=minN&&Number.isFinite(x.winRate)&&Number.isFinite(base.winRate)&&x.winRate<=base.winRate-8)
      .sort((a,b)=>a.winRate-b.winRate||b.n-a.n);
    return weak[0]||null;
  }

  function candidatePool(train){
    const weakState=weakestGroup(train,s=>s.entry?.state);
    const weakPlaybook=weakestGroup(train,s=>s.entry?.playbook||s.type);
    const states=[null,weakState?.key||null].filter((x,i,a)=>i===0||x!==null&&a.indexOf(x)===i);
    const plays=[null,weakPlaybook?.key||null].filter((x,i,a)=>i===0||x!==null&&a.indexOf(x)===i);
    const out=[];
    for(const auditMin of AUDIT_THRESHOLDS){
      for(const excludeState of states){
        for(const excludePlaybook of plays){
          out.push({auditMin,excludeState,excludePlaybook});
        }
      }
    }
    return out;
  }

  function deriveCandidate(train){
    const base=stats(train);
    const minRetained=Math.max(12,Math.floor(train.length*.40));
    const baseWlb=wilsonLower(base.wins,base.n);
    let best={
      rules:{auditMin:null,excludeState:null,excludePlaybook:null},
      metrics:base,coverage:1,wlb:baseWlb,score:baseWlb,complexity:0,improvement:0
    };
    for(const rules of candidatePool(train)){
      const kept=applyRules(train,rules),m=stats(kept);
      if(m.n<minRetained)continue;
      const coverage=train.length?m.n/train.length:0;
      const complexity=(num(rules.auditMin)!==null?1:0)+(rules.excludeState?1:0)+(rules.excludePlaybook?1:0);
      const wlb=wilsonLower(m.wins,m.n);
      const coverageBonus=Math.min(.85,coverage)*.025;
      const complexityPenalty=complexity*.006;
      const score=wlb+coverageBonus-complexityPenalty;
      if(score>best.score+1e-9){
        best={rules,metrics:m,coverage,wlb,score,complexity,improvement:wlb-baseWlb};
      }
    }
    if(best.improvement<.01){
      return {
        rules:{auditMin:null,excludeState:null,excludePlaybook:null},
        metrics:base,coverage:1,wlb:baseWlb,score:baseWlb,complexity:0,improvement:0,
        reason:'Train ยังไม่มีหลักฐานพอให้เพิ่ม filter โดยไม่เสี่ยง overfit'
      };
    }
    return {...best,reason:'เลือกจาก Train เท่านั้นด้วย Wilson lower bound + retention + complexity penalty'};
  }

  function compareSlice(rows,candidateRules){
    const baseline=stats(rows),candidateRows=applyRules(rows,candidateRules),candidate=stats(candidateRows);
    return {
      baseline,candidate,
      retained:candidate.n,
      retention:baseline.n?Math.round(candidate.n/baseline.n*1000)/10:null,
      gainPts:Number.isFinite(candidate.winRate)&&Number.isFinite(baseline.winRate)?r1(candidate.winRate-baseline.winRate):null,
      auditCalibration:{
        baseline:calibration(rows),
        candidate:calibration(candidateRows)
      }
    };
  }

  function walkForward(rows,foldCount=FOLDS){
    const a=(rows||[]).filter(scored).sort((x,y)=>(x.entryTime||0)-(y.entryTime||0));
    if(a.length<24)return {folds:[],positiveFolds:0,positiveRate:null,avgGain:null,status:'insufficient'};
    const baseTrain=Math.max(16,Math.floor(a.length*.40));
    const remain=a.length-baseTrain;
    const folds=Math.max(2,Math.min(foldCount,Math.floor(remain/5)));
    const step=Math.max(1,Math.floor(remain/folds));
    const out=[];
    for(let i=0;i<folds;i++){
      const testStart=baseTrain+i*step;
      const testEnd=i===folds-1?a.length:Math.min(a.length,testStart+step);
      const train=a.slice(0,testStart),test=a.slice(testStart,testEnd);
      if(train.length<12||test.length<3)continue;
      const cand=deriveCandidate(train),cmp=compareSlice(test,cand.rules);
      out.push({
        fold:i+1,trainN:train.length,testN:test.length,
        trainStart:train[0]?.entryTime||null,trainEnd:train.at(-1)?.entryTime||null,
        testStart:test[0]?.entryTime||null,testEnd:test.at(-1)?.entryTime||null,
        rules:cand.rules,rulesLabel:rulesLabel(cand.rules),
        baselineWinRate:cmp.baseline.winRate,candidateWinRate:cmp.candidate.winRate,
        retained:cmp.candidate.n,retention:cmp.retention,gainPts:cmp.gainPts
      });
    }
    const valid=out.filter(x=>Number.isFinite(x.gainPts));
    const positive=valid.filter(x=>x.gainPts>0).length;
    const gains=valid.map(x=>x.gainPts);
    return {
      folds:out,
      positiveFolds:positive,
      positiveRate:valid.length?r1(positive/valid.length*100):null,
      avgGain:r1(avg(gains)),
      status:valid.length<2?'insufficient':positive/valid.length>=.6?'stable':positive/valid.length>=.4?'mixed':'weak'
    };
  }

  function warningsFor(all,trainCmp,valCmp,holdCmp,wf,candidate){
    const w=[];
    if(all.length<60)w.push({code:'SMALL_SAMPLE',level:'warn',text:'จำนวนไม้ทั้งหมดต่ำกว่า 60 ไม้ ผล Phase 4 ยังแกว่งได้มาก'});
    if(candidate.complexity>0&&trainCmp.gainPts>0&&(!Number.isFinite(valCmp.gainPts)||valCmp.gainPts<=0)){
      w.push({code:'TRAIN_VAL_DIVERGENCE',level:'high',text:'Train ดีขึ้น แต่ Validation ไม่ดีขึ้น มีสัญญาณ overfitting'});
    }
    if(Number.isFinite(trainCmp.gainPts)&&Number.isFinite(holdCmp.gainPts)&&trainCmp.gainPts-holdCmp.gainPts>=10){
      w.push({code:'TRAIN_HOLDOUT_GAP',level:'high',text:'ผล Train สูงกว่า Holdout ตั้งแต่ 10 จุดเปอร์เซ็นต์ขึ้นไป'});
    }
    if(Number.isFinite(holdCmp.retention)&&holdCmp.retention<35){
      w.push({code:'LOW_RETENTION',level:'warn',text:'Candidate ตัดไม้ Holdout ออกมากกว่า 65% อาจเลือกเฉพาะอดีตมากเกินไป'});
    }
    if(wf.status==='weak')w.push({code:'WF_WEAK',level:'high',text:'Walk-forward ส่วนใหญ่ไม่ยืนยันการดีขึ้น'});
    else if(wf.status==='mixed')w.push({code:'WF_MIXED',level:'warn',text:'Walk-forward ให้ผลสลับกัน ยังไม่เสถียร'});
    if(!candidate.complexity)w.push({code:'BASELINE_SELECTED',level:'info',text:'Train ยังไม่พบ filter ที่ชนะ Baseline อย่างมีวินัย จึงคง Baseline เป็น Candidate'});
    return w;
  }

  function verdict(all,valCmp,holdCmp,wf,candidate,warnings){
    const high=warnings.some(x=>x.level==='high');
    if(all.length<MIN_TOTAL||valCmp.baseline.n<4||holdCmp.baseline.n<4){
      return {status:'INSUFFICIENT',label:'ข้อมูลยังไม่พอ',promotion:false};
    }
    if(!candidate.complexity){
      return {status:'KEEP_BASELINE',label:'Baseline ยังเหมาะเป็นตัวอ้างอิง',promotion:false};
    }
    const valGood=Number.isFinite(valCmp.gainPts)&&valCmp.gainPts>0&&valCmp.candidate.n>=4;
    const holdGood=Number.isFinite(holdCmp.gainPts)&&holdCmp.gainPts>=0&&holdCmp.candidate.n>=4;
    const wfGood=wf.status==='stable';
    if(valGood&&holdGood&&wfGood&&!high){
      return {status:'SUPPORTED',label:'Candidate ผ่านการตรวจเชิงวิจัย',promotion:true};
    }
    if(valGood||holdGood||wf.status==='mixed'){
      return {status:'MIXED',label:'หลักฐานยังผสม',promotion:false};
    }
    return {status:'REJECTED',label:'ยังไม่ผ่าน Validation',promotion:false};
  }

  async function loadSignals(sessionId){
    if(globalThis.TrainingAnalyticsV1?.loadSignals)return globalThis.TrainingAnalyticsV1.loadSignals(sessionId);
    const rows=await globalThis.HistoricalDataV1.getBySession('signals',sessionId);
    return rows.map(r=>r.signal).filter(Boolean).sort((a,b)=>(a.entryTime||0)-(b.entryTime||0));
  }

  async function build(sessionId){
    if(!globalThis.HistoricalDataV1)throw new Error('HistoricalDataV1 ไม่พร้อม');
    const [session,signals]=await Promise.all([
      globalThis.HistoricalDataV1.getSession(sessionId),
      loadSignals(sessionId)
    ]);
    if(!session)throw new Error('ไม่พบ Training Session');
    const all=signals.filter(scored).sort((a,b)=>(a.entryTime||0)-(b.entryTime||0));
    if(all.length<12)throw new Error('Phase 4 ต้องมีไม้ที่ตัดสินถูก/ผิดอย่างน้อย 12 ไม้');

    const split=chronologicalSplit(all);
    const candidate=deriveCandidate(split.train);
    const trainCmp=compareSlice(split.train,candidate.rules);
    const valCmp=compareSlice(split.validation,candidate.rules);
    const holdCmp=compareSlice(split.holdout,candidate.rules);
    const wf=walkForward(all,FOLDS);
    const warnings=warningsFor(all,trainCmp,valCmp,holdCmp,wf,candidate);
    const decision=verdict(all,valCmp,holdCmp,wf,candidate,warnings);

    const report={
      schema:SCHEMA,phase:4,generatedAt:new Date().toISOString(),sessionId,
      datasetId:session.datasetId,engineVersion:session.engineVersion,engineBlobSha:session.engineBlobSha,
      auditSchema:session.auditSchema,dataQuality:session.quality?.grade||null,
      methodology:{
        split:'chronological_60_20_20',splitMode:split.mode,
        candidateSelection:'train_only_wilson_lower_bound',
        validationUsedForSelection:false,holdoutUsedForSelection:false,
        walkForward:'expanding_window',folds:FOLDS,noLiveMutation:true,noLookahead:true
      },
      counts:{all:all.length,train:split.train.length,validation:split.validation.length,holdout:split.holdout.length},
      bounds:split.bounds,
      candidate:{
        rules:candidate.rules,label:rulesLabel(candidate.rules),complexity:candidate.complexity,
        trainCoverage:r1(candidate.coverage*100),selectionReason:candidate.reason
      },
      comparison:{train:trainCmp,validation:valCmp,holdout:holdCmp},
      walkForward:wf,
      warnings,
      verdict:decision,
      context:{
        trainStates:groupStats(split.train,s=>s.entry?.state).slice(0,8),
        validationStates:groupStats(split.validation,s=>s.entry?.state).slice(0,8),
        holdoutStates:groupStats(split.holdout,s=>s.entry?.state).slice(0,8),
        trainPlaybooks:groupStats(split.train,s=>s.entry?.playbook||s.type).slice(0,8),
        validationPlaybooks:groupStats(split.validation,s=>s.entry?.playbook||s.type).slice(0,8),
        holdoutPlaybooks:groupStats(split.holdout,s=>s.entry?.playbook||s.type).slice(0,8)
      },
      notes:[
        'Candidate is selected from Train only; Validation and Holdout do not participate in rule selection.',
        'Walk-forward uses expanding historical windows and derives each fold candidate only from earlier observations.',
        'This validates a research filter over replay entries; it does not rewrite ARIS 2.0 live logic.',
        'A supported candidate should still be forward/shadow tested before any live promotion.'
      ]
    };
    await globalThis.HistoricalDataV1.putMany('reports',[{
      id:sessionId+':phase4',sessionId,updatedAt:Date.now(),report
    }]);
    return report;
  }

  async function get(sessionId){
    const rows=await globalThis.HistoricalDataV1.getBySession('reports',sessionId);
    return rows.find(r=>r.id===sessionId+':phase4')?.report||null;
  }

  async function exportBundle(sessionId){
    const [session,report]=await Promise.all([
      globalThis.HistoricalDataV1.getSession(sessionId),
      get(sessionId)
    ]);
    if(!session)throw new Error('ไม่พบ Training Session');
    const finalReport=report||await build(sessionId);
    return {
      schema:'aris-validation-bundle-v1',
      exportedAt:new Date().toISOString(),
      session:{
        id:session.id,datasetId:session.datasetId,symbol:session.symbol,interval:session.interval,
        analysisStart:session.analysisStart,analysisEnd:session.analysisEnd,
        engineVersion:session.engineVersion,engineBlobSha:session.engineBlobSha,auditSchema:session.auditSchema,
        dataQuality:session.quality?.grade||null
      },
      validation:finalReport
    };
  }

  async function download(sessionId){
    const bundle=await exportBundle(sessionId);
    const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='ARIS-validation-'+sessionId+'-'+Date.now()+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    return bundle;
  }

  globalThis.TrainingValidationV1={
    schema:SCHEMA,phase:4,build,get,download,exportBundle,
    chronologicalSplit,deriveCandidate,compareSlice,walkForward,rulesLabel
  };

  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=v=>Number(v||0).toLocaleString('en-US');
  const wr=v=>Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'—';
  const human=ms=>Number.isFinite(Number(ms))?new Date(Number(ms)).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';

  function currentSessionId(){
    const label=byId('train-replay-session')?.querySelector('b')?.textContent?.trim()||'';
    return /^TRAIN-/.test(label)?label:null;
  }

  function ensureStyle(){
    if(byId('training-validation-style'))return;
    const s=document.createElement('style');s.id='training-validation-style';
    s.textContent=[
      '.validation-card{border-color:#4b3e67;background:#141523}',
      '.validation-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}',
      '.validation-head b{font-size:7px;color:#a997e9}.validation-head small{display:block;margin-top:3px;color:#71849b;font-size:6.5px}',
      '.validation-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:8px 0}',
      '.validation-split{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:8px 0}',
      '.validation-slice{border:1px solid #302d45;border-radius:7px;background:#0e1420;padding:7px}.validation-slice span{display:block;font-size:6px;color:#7d8198}.validation-slice b{display:block;margin-top:2px;font-size:10px;color:#c8c4e0}',
      '.validation-candidate{border:1px solid #44395e;border-radius:8px;background:#171326;padding:8px;margin-top:7px}.validation-candidate span{display:block;font-size:6px;color:#8d82ab}.validation-candidate b{display:block;margin-top:3px;font-size:8px;color:#d7cef4;line-height:1.45}',
      '.validation-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:6.4px}.validation-table th,.validation-table td{padding:4px 3px;border-bottom:1px solid #262b39;text-align:right}.validation-table th:first-child,.validation-table td:first-child{text-align:left}.validation-table th{color:#707b90;font-weight:500}.validation-table td{color:#b9c5d5}',
      '.validation-good{color:#68dab4!important}.validation-bad{color:#e98aa0!important}.validation-mid{color:#dec079!important}',
      '.validation-warnings{display:grid;gap:4px;margin-top:8px}.validation-warning{padding:6px 7px;border:1px solid #3a3b48;border-radius:6px;background:#111721;color:#929eb0;font-size:6.5px;line-height:1.4}.validation-warning.high{border-color:#6b3949;background:#25151c;color:#e997aa}.validation-warning.warn{border-color:#655330;background:#211d13;color:#d8bd7c}',
      '.validation-verdict{margin-top:8px;padding:8px;border:1px solid #39445a;border-radius:8px;background:#0d1622}.validation-verdict strong{font-size:9px;color:#cbd6e6}.validation-verdict span{display:block;margin-top:3px;font-size:6.5px;color:#8292a8;line-height:1.45}.validation-verdict.supported{border-color:#2f6d58;background:#0e201b}.validation-verdict.supported strong{color:#69deb4}.validation-verdict.rejected{border-color:#67394b;background:#24151c}.validation-verdict.rejected strong{color:#e98ba2}',
      '.wf-table-wrap{overflow:auto;margin-top:8px}',
      '@media(max-width:760px){.validation-split{grid-template-columns:1fr 1fr 1fr}}',
      '@media(max-width:560px){.validation-split{grid-template-columns:1fr}.validation-head{display:block}.validation-head>div:last-child{margin-top:5px}}'
    ].join('');
    document.head.append(s);
  }

  function ensurePanel(){
    if(byId('train-validation-card'))return byId('train-validation-card');
    const body=document.querySelector('#training-lab-dialog .training-lab-body');
    if(!body)return null;
    const section=document.createElement('section');
    section.className='train-card validation-card';section.id='train-validation-card';
    section.innerHTML=[
      '<div class="validation-head">',
      '<div><h3>7 · Phase 4 · Validation / Walk-forward Lab</h3><p>แบ่งเวลา 60/20/20 แบบเรียงตามจริง · Candidate เรียนจาก Train เท่านั้น · Validation / Holdout ห้ามช่วยเลือกกฎ</p></div>',
      '<div><b>NO LIVE MUTATION</b><small>ไม่แก้ ARIS 2.0 · ไม่สุ่ม split · ไม่ใช้อนาคต</small></div>',
      '</div>',
      '<div class="validation-actions">',
      '<button type="button" class="train-primary" id="train-validation-run" disabled>รัน Phase 4</button>',
      '<button type="button" class="train-secondary" id="train-validation-export" disabled>Export Validation JSON</button>',
      '<span class="train-status-badge" id="train-validation-status">รอ Session</span>',
      '</div>',
      '<div class="validation-split">',
      '<div class="validation-slice"><span>TRAIN · 60%</span><b id="validation-train-n">—</b></div>',
      '<div class="validation-slice"><span>VALIDATION · 20%</span><b id="validation-val-n">—</b></div>',
      '<div class="validation-slice"><span>HOLDOUT · 20%</span><b id="validation-hold-n">—</b></div>',
      '</div>',
      '<div id="validation-empty" class="analytics-empty">เลือก Session ที่ Replay มีผลแล้ว จากนั้นรัน Phase 4 เพื่อสอบ Candidate กับข้อมูลที่มันไม่เคยเห็นค่ะ</div>',
      '<div id="validation-result" hidden>',
      '<div class="validation-candidate"><span>Experimental candidate</span><b id="validation-candidate-label">—</b></div>',
      '<div id="validation-compare"></div>',
      '<div class="wf-table-wrap" id="validation-wf"></div>',
      '<div class="validation-warnings" id="validation-warnings"></div>',
      '<div class="validation-verdict" id="validation-verdict"><strong>—</strong><span></span></div>',
      '</div>'
    ].join('');
    body.append(section);
    return section;
  }

  function setStatus(text,type=''){
    const e=byId('train-validation-status');if(!e)return;
    e.textContent=text;e.className='train-status-badge'+(type?' '+type:'');
  }

  function metricClass(g){
    if(!Number.isFinite(Number(g)))return '';
    return Number(g)>0?'validation-good':Number(g)<0?'validation-bad':'validation-mid';
  }

  function render(report){
    const result=byId('validation-result'),empty=byId('validation-empty');
    if(!report){if(result)result.hidden=true;if(empty)empty.hidden=false;return;}
    empty.hidden=true;result.hidden=false;
    byId('validation-train-n').textContent=fmt(report.counts?.train);
    byId('validation-val-n').textContent=fmt(report.counts?.validation);
    byId('validation-hold-n').textContent=fmt(report.counts?.holdout);
    byId('validation-candidate-label').textContent=report.candidate?.label||'—';

    const c=report.comparison||{};
    const rows=[
      ['Train',c.train],['Validation',c.validation],['Holdout',c.holdout]
    ].map(([name,x])=>{
      const gain=x?.gainPts;
      return '<tr><td>'+name+'</td><td>'+wr(x?.baseline?.winRate)+'</td><td>'+wr(x?.candidate?.winRate)+'</td><td>'+fmt(x?.candidate?.n)+'</td><td>'+wr(x?.retention)+'</td><td class="'+metricClass(gain)+'">'+(Number.isFinite(gain)?(gain>0?'+':'')+gain.toFixed(1)+' pp':'—')+'</td><td>'+String(x?.candidate?.avgMfeAtr??'—')+' / '+String(x?.candidate?.avgMaeAtr??'—')+'</td></tr>';
    }).join('');
    byId('validation-compare').innerHTML='<table class="validation-table"><thead><tr><th>ช่วง</th><th>Base WR</th><th>Candidate WR</th><th>N</th><th>Retain</th><th>Gain</th><th>MFE/MAE</th></tr></thead><tbody>'+rows+'</tbody></table>';

    const wf=report.walkForward||{},foldRows=(wf.folds||[]).map(x=>
      '<tr><td>#'+x.fold+'</td><td>'+fmt(x.trainN)+'</td><td>'+fmt(x.testN)+'</td><td>'+wr(x.baselineWinRate)+'</td><td>'+wr(x.candidateWinRate)+'</td><td class="'+metricClass(x.gainPts)+'">'+(Number.isFinite(x.gainPts)?(x.gainPts>0?'+':'')+x.gainPts.toFixed(1)+' pp':'—')+'</td><td>'+wr(x.retention)+'</td></tr>'
    ).join('');
    byId('validation-wf').innerHTML='<div style="margin-top:8px;font-size:7px;color:#9b90bd">Walk-forward · expanding window · บวก '+fmt(wf.positiveFolds)+' fold · '+wr(wf.positiveRate)+' · Avg gain '+(Number.isFinite(wf.avgGain)?(wf.avgGain>0?'+':'')+wf.avgGain.toFixed(1)+' pp':'—')+'</div>'+
      '<table class="validation-table"><thead><tr><th>Fold</th><th>Train N</th><th>Test N</th><th>Base WR</th><th>Cand WR</th><th>Gain</th><th>Retain</th></tr></thead><tbody>'+foldRows+'</tbody></table>';

    const warnings=report.warnings||[];
    byId('validation-warnings').innerHTML=warnings.length
      ?warnings.map(x=>'<div class="validation-warning '+esc(x.level||'')+'">'+esc(x.text)+'</div>').join('')
      :'<div class="validation-warning">ไม่พบธง overfitting ตามเกณฑ์ Phase 4 ชุดนี้</div>';

    const v=report.verdict||{},box=byId('validation-verdict');
    box.className='validation-verdict '+(v.status==='SUPPORTED'?'supported':v.status==='REJECTED'?'rejected':'');
    box.querySelector('strong').textContent=v.label||v.status||'—';
    box.querySelector('span').textContent=
      (v.promotion?'หลักฐานชุดนี้รองรับ Candidate สำหรับ “รุ่นทดลอง/Shadow” เท่านั้น ยังไม่แก้ Live อัตโนมัติ':'ยังไม่ควรย้ายกฎนี้เข้า Live จากหลักฐานชุดนี้')+
      ' · '+human(report.bounds?.start)+' → '+human(report.bounds?.end);
  }

  async function refresh(){
    const id=currentSessionId(),run=byId('train-validation-run'),exp=byId('train-validation-export');
    if(!id){
      run.disabled=true;exp.disabled=true;setStatus('รอ Session');render(null);return;
    }
    try{
      const signals=(await loadSignals(id)).filter(scored);
      run.disabled=signals.length<12;
      const report=await get(id);
      exp.disabled=!report;
      if(report){render(report);setStatus('Validation พร้อม','ready');}
      else{render(null);setStatus(signals.length>=12?'พร้อมรัน · '+fmt(signals.length)+' ไม้':'ข้อมูลยังน้อย · '+fmt(signals.length)+' ไม้',signals.length>=12?'ready':'warn');}
    }catch(err){
      run.disabled=true;exp.disabled=true;setStatus('อ่านข้อมูลไม่สำเร็จ','error');
    }
  }

  async function run(){
    const id=currentSessionId();if(!id)return;
    const btn=byId('train-validation-run');btn.disabled=true;setStatus('กำลัง Validate','warn');
    try{
      const report=await build(id);
      render(report);byId('train-validation-export').disabled=false;setStatus('Phase 4 เสร็จ','ready');
    }catch(err){
      console.error('Phase 4 validation failed',err);setStatus('Validation ไม่สำเร็จ · '+String(err?.message||err),'error');
    }finally{
      btn.disabled=false;
    }
  }

  async function exportReport(){
    const id=currentSessionId();if(!id)return;
    setStatus('กำลัง Export','warn');
    try{await download(id);setStatus('Export แล้ว','ready');}
    catch(err){setStatus('Export ไม่สำเร็จ · '+String(err?.message||err),'error');}
  }

  function decorateLab(){
    const head=document.querySelector('#training-lab-dialog .training-lab-head span');
    if(head)head.textContent='PHASE 1–4 · DATA + REPLAY + ANALYTICS + VALIDATION';
    const p=document.querySelector('#training-lab-dialog .training-lab-head p');
    if(p)p.textContent='Historical Training แบบแยก Live · Replay → Analytics → Validation / Walk-forward โดยกันข้อมูลอนาคตออกจากการเลือกกฎ';
    const foot=byId('training-lab-foot-status');
    if(foot)foot.textContent='Phase 1–4 · Historical Training Pipeline พร้อมใช้งาน';
    const next=document.querySelector('#training-lab-dialog .phase-next');
    if(next)next.innerHTML='<b>Phase 4</b><button type="button" disabled>Validation / Walk-forward · No Live Auto</button>';
  }

  function bindUi(){
    const runBtn=byId('train-validation-run');
    if(!runBtn||runBtn.dataset.bound)return;
    runBtn.dataset.bound='1';
    runBtn.addEventListener('click',run);
    byId('train-validation-export').addEventListener('click',exportReport);
    byId('training-session-list')?.addEventListener('click',()=>setTimeout(refresh,80));
    byId('training-lab-dialog')?.addEventListener('click',e=>{
      if(e.target?.id==='train-replay-start'||e.target?.id==='train-analytics-build')setTimeout(refresh,250);
    });
  }

  function boot(attempt=0){
    ensureStyle();
    const panel=ensurePanel();
    if(!panel){
      if(attempt<30)setTimeout(()=>boot(attempt+1),100);
      return;
    }
    decorateLab();bindUi();refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(),{once:true});
  else boot();
})();