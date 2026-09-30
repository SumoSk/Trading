(() => {
  'use strict';

  const ENGINE_BLOB_SHA='8fe96438fc1b73b7440372baba44edc0552625c5';
  const DAY=86_400_000;
  const MINUTE=60_000;
  let activeController=null;
  let selectedPreset=30;
  let latestSession=null;

  const byId=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,'0');

  function toLocalInput(ms){
    const d=new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fromLocalInput(v){
    const t=new Date(v).getTime();
    return Number.isFinite(t)?t:null;
  }
  function humanTime(ms){
    if(!Number.isFinite(Number(ms)))return '—';
    return new Date(Number(ms)).toLocaleString('th-TH',{
      timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'
    });
  }
  function fmtInt(n){return Number(n||0).toLocaleString('en-US');}
  function fmtBytes(n){
    const v=Number(n)||0;
    if(v<1024)return v+' B';
    if(v<1024**2)return (v/1024).toFixed(1)+' KB';
    if(v<1024**3)return (v/1024**2).toFixed(1)+' MB';
    return (v/1024**3).toFixed(2)+' GB';
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

  function ensureStyles(){
    if(byId('training-lab-style'))return;
    const style=document.createElement('style');
    style.id='training-lab-style';
    style.textContent=`
      .training-lab-open{height:30px;padding:0 10px;border:1px solid #4d426d;border-radius:7px;background:#1b1830;color:#d5cbff;font:600 9px 'Segoe UI',sans-serif;white-space:nowrap;flex:0 0 auto}
      .training-lab-open:hover{border-color:#7d69c8;background:#262043;color:#eee9ff}
      #training-lab-dialog{width:min(980px,calc(100vw - 18px));max-height:92vh;padding:0;border:1px solid #34465d;border-radius:14px;background:#0b131e;color:#d7e3f2;box-shadow:0 24px 80px #000b}
      #training-lab-dialog::backdrop{background:#02060bb8;backdrop-filter:blur(3px)}
      .training-lab-shell{display:grid;grid-template-rows:auto 1fr auto;max-height:92vh}
      .training-lab-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid #26364a;background:#0e1825}
      .training-lab-head span{display:block;font-size:7px;letter-spacing:.7px;color:#8d79df;font-weight:700}
      .training-lab-head h2{margin:3px 0 3px;font-size:17px;font-weight:600}.training-lab-head p{margin:0;color:#8295ad;font-size:8px}
      .training-lab-close{width:30px;height:30px;padding:0;border:1px solid #304157;border-radius:7px;background:#111d2a;color:#9cafc4;font-size:16px}
      .training-lab-body{overflow:auto;padding:14px 16px 18px;display:grid;gap:10px}
      .train-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}
      .train-card{border:1px solid #26374c;border-radius:10px;background:#0f1926;padding:11px}
      .train-card h3{font-size:10px;margin:0 0 8px;color:#c8d7e8}.train-card>p{font-size:7px;line-height:1.45;color:#71869f;margin:0 0 8px}
      .train-presets{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
      .train-presets button{min-height:28px;padding:0 10px;border:1px solid #304158;border-radius:7px;background:#111d2b;color:#8fa4bb;font-size:8px}
      .train-presets button.active{border-color:#806edf;background:#252040;color:#e1daff}
      .train-fields{display:grid;grid-template-columns:1fr 1fr 110px;gap:7px}
      .train-field{display:grid;gap:4px}.train-field span{font-size:7px;color:#8598af}
      .train-field input{width:100%;min-width:0;height:32px;border:1px solid #2d4057;border-radius:7px;background:#0b1521;color:#d1deed;padding:0 8px;font-size:8px;color-scheme:dark}
      .train-preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:8px}
      .train-kpi{border:1px solid #243449;border-radius:7px;background:#0c1622;padding:7px}
      .train-kpi span{display:block;font-size:6px;color:#6f8299}.train-kpi b{display:block;margin-top:2px;font-size:10px;color:#bed0e3}
      .train-data-source{display:grid;gap:5px}.train-data-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #1d2b3d;font-size:7px}
      .train-data-row:last-child{border-bottom:0}.train-data-row span{color:#8094ab}.train-data-row b{color:#bacadd;text-align:right}
      .train-status-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border:1px solid #3c4c61;border-radius:999px;font-size:7px;color:#94a6ba}
      .train-status-badge.ready{border-color:#2f775f;color:#6bd6ad;background:#10231e}.train-status-badge.warn{border-color:#7a6132;color:#dec078;background:#251f13}.train-status-badge.error{border-color:#7a3d51;color:#ec8ca1;background:#29161f}
      .train-load-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:9px}
      .train-primary{min-height:34px;padding:0 13px;border:1px solid #6e5bc2;border-radius:8px;background:#282047;color:#e3dcff;font-size:9px;font-weight:600}
      .train-secondary{min-height:34px;padding:0 11px;border:1px solid #304258;border-radius:8px;background:#111d2a;color:#a8b8ca;font-size:8px}
      .train-danger{border-color:#6b3849!important;color:#e990a4!important;background:#25151c!important}
      .train-primary:disabled,.train-secondary:disabled{opacity:.4;cursor:not-allowed}
      .train-progress-wrap{margin-top:9px;display:none}.train-progress-wrap.active{display:block}
      .train-progress-line{height:7px;border:1px solid #26394f;border-radius:999px;background:#0a131e;overflow:hidden}.train-progress-line i{display:block;height:100%;width:0;background:linear-gradient(90deg,#6555b6,#4e9a8e);transition:width .15s}
      .train-progress-text{display:flex;justify-content:space-between;gap:10px;margin-top:5px;font-size:6.5px;color:#778ba3}
      .quality-hero{display:flex;align-items:center;gap:10px}.quality-grade{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;border:1px solid #354860;background:#111c2a;font-size:22px;font-weight:700;color:#b6c6d8}
      .quality-grade.A{border-color:#34785f;color:#64deb2;background:#10241e}.quality-grade.B{border-color:#796637;color:#e0c277;background:#251f13}.quality-grade.C{border-color:#7d3d50;color:#ed8ea3;background:#2a161e}
      .quality-copy b{display:block;font-size:9px}.quality-copy span{display:block;margin-top:3px;font-size:7px;color:#7c90a8}
      .quality-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:9px}
      .quality-stat{border:1px solid #25364a;border-radius:7px;padding:6px;background:#0c1622}.quality-stat span{display:block;font-size:6px;color:#70849c}.quality-stat b{display:block;font-size:9px;margin-top:2px}
      .feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:8px}
      .feature-item{display:flex;justify-content:space-between;gap:8px;border:1px solid #223247;border-radius:6px;padding:5px 6px;background:#0c1621;font-size:6.5px}.feature-item span{color:#8599b0}.feature-item b.native{color:#65dcb1}.feature-item b.derived{color:#e0c477}.feature-item b.unavailable{color:#d17e90}
      .session-list{display:grid;gap:5px}.session-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid #25364a;border-radius:7px;background:#0c1622;padding:7px}
      .session-row strong{font-size:8px;color:#bdccdc}.session-row small{display:block;margin-top:2px;font-size:6px;color:#71869e;line-height:1.35}.session-row-actions{display:flex;gap:4px;align-items:center}.session-row button{min-height:26px;padding:0 7px;border:1px solid #34475e;border-radius:6px;background:#111d2a;color:#9eb0c3;font-size:7px}
      .training-lab-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-top:1px solid #26364a;background:#0d1723;font-size:7px;color:#73879f}
      .phase-next{display:flex;gap:5px;align-items:center}.phase-next b{color:#9581e6}.phase-next button{height:28px;border:1px solid #2e3f54;border-radius:6px;background:#111b28;color:#65788f;font-size:7px}
      @media(max-width:760px){.train-grid{grid-template-columns:1fr}.train-fields{grid-template-columns:1fr 1fr}.train-fields .train-field:last-child{grid-column:1/-1}.train-preview{grid-template-columns:1fr 1fr}.feature-grid{grid-template-columns:1fr}}
      @media(max-width:560px){.training-lab-open{height:28px;padding:0 7px;font-size:8px}#training-lab-dialog{width:calc(100vw - 8px);max-height:96vh}.training-lab-shell{max-height:96vh}.training-lab-head{padding:11px}.training-lab-body{padding:9px}.train-card{padding:9px}.quality-stats{grid-template-columns:1fr 1fr}}
    `;
    document.head.append(style);
  }

  function ensureDialog(){
    if(byId('training-lab-dialog'))return byId('training-lab-dialog');
    const dialog=document.createElement('dialog');
    dialog.id='training-lab-dialog';
    dialog.innerHTML=`
      <div class="training-lab-shell">
        <header class="training-lab-head">
          <div><span>PHASE 1 · HISTORICAL DATA</span><h2>ARIS TRAINING LAB</h2><p>โหลดและตรวจข้อมูลย้อนหลังแยกจากระบบ Live · ยังไม่ Replay ในเฟสนี้</p></div>
          <button type="button" class="training-lab-close" id="training-lab-close">×</button>
        </header>
        <div class="training-lab-body">
          <div class="train-grid">
            <section class="train-card">
              <h3>1 · ตั้งค่าชุดข้อมูล</h3>
              <p>BTCUSDT Futures · 1 นาที · จะเพิ่ม Warm-up ก่อนช่วงทดสอบเพื่อเตรียม EMA / ATR / Swing / Fib ใน Phase 2</p>
              <div class="train-presets">
                <button type="button" data-train-days="7">7 วัน</button>
                <button type="button" data-train-days="30" class="active">30 วัน</button>
                <button type="button" data-train-days="90">90 วัน</button>
                <button type="button" data-train-days="custom">กำหนดเอง</button>
              </div>
              <div class="train-fields">
                <label class="train-field"><span>เริ่มช่วงทดสอบ</span><input id="train-start" type="datetime-local"></label>
                <label class="train-field"><span>สิ้นสุดช่วงทดสอบ</span><input id="train-end" type="datetime-local"></label>
                <label class="train-field"><span>Warm-up (แท่ง)</span><input id="train-warmup" type="number" min="100" max="5000" step="100" value="500"></label>
              </div>
              <div class="train-preview">
                <div class="train-kpi"><span>Test bars</span><b id="train-preview-bars">—</b></div>
                <div class="train-kpi"><span>รวม Warm-up</span><b id="train-preview-total">—</b></div>
                <div class="train-kpi"><span>ประมาณ Requests</span><b id="train-preview-requests">—</b></div>
                <div class="train-kpi"><span>ขนาดโดยประมาณ</span><b id="train-preview-size">—</b></div>
              </div>
              <div class="train-load-actions">
                <button type="button" class="train-primary" id="train-load">โหลดข้อมูลย้อนหลัง</button>
                <button type="button" class="train-secondary train-danger" id="train-cancel" hidden>ยกเลิกโหลด</button>
                <span class="train-status-badge" id="train-load-status">ยังไม่ได้โหลด</span>
              </div>
              <div class="train-progress-wrap" id="train-progress-wrap">
                <div class="train-progress-line"><i id="train-progress-bar"></i></div>
                <div class="train-progress-text"><span id="train-progress-left">0 / 0 bars</span><span id="train-progress-right">0%</span></div>
              </div>
            </section>

            <section class="train-card">
              <h3>2 · แหล่งข้อมูลและ Storage</h3>
              <div class="train-data-source">
                <div class="train-data-row"><span>Source</span><b>Binance Futures REST</b></div>
                <div class="train-data-row"><span>Symbol / TF</span><b>BTCUSDT · 1m</b></div>
                <div class="train-data-row"><span>Training DB</span><b>btc-training-lab-v1</b></div>
                <div class="train-data-row"><span>Live Journal</span><b>แยกฐาน · ไม่เขียนปน</b></div>
                <div class="train-data-row"><span>Engine snapshot</span><b id="train-engine-meta">ARIS 2.0</b></div>
                <div class="train-data-row"><span>Audit</span><b id="train-audit-meta">Audit V2</b></div>
                <div class="train-data-row"><span>Browser storage</span><b id="train-storage-meta">กำลังตรวจ</b></div>
              </div>
            </section>
          </div>

          <section class="train-card">
            <h3>3 · Data Quality</h3>
            <div id="train-quality-empty"><p>หลังโหลด ระบบจะตรวจ Missing candle, Duplicate, OHLC ผิดรูป, Coverage ของข้อมูลเสริม และระบุสิ่งที่ไม่มีจริงเพื่อป้องกันการสร้างข้อมูลย้อนหลังปลอมค่ะ</p></div>
            <div id="train-quality-result" hidden>
              <div class="quality-hero">
                <div class="quality-grade" id="train-quality-grade">—</div>
                <div class="quality-copy"><b id="train-quality-title">Data Quality</b><span id="train-quality-note"></span></div>
              </div>
              <div class="quality-stats">
                <div class="quality-stat"><span>Loaded</span><b id="train-quality-loaded">—</b></div>
                <div class="quality-stat"><span>Missing</span><b id="train-quality-missing">—</b></div>
                <div class="quality-stat"><span>Duplicate</span><b id="train-quality-duplicate">—</b></div>
                <div class="quality-stat"><span>Invalid OHLC</span><b id="train-quality-invalid">—</b></div>
              </div>
              <div class="feature-grid" id="train-feature-grid"></div>
            </div>
          </section>

          <section class="train-card">
            <h3>4 · Training Sessions ล่าสุด</h3>
            <p>แต่ละ Session จำช่วงเวลา, Warm-up, Engine SHA, Audit schema และ Data Quality ไว้ เพื่อ Phase 2 ใช้ชุดข้อมูลเดิมโดยไม่ต้องโหลดใหม่ค่ะ</p>
            <div class="session-list" id="training-session-list"><div class="session-row"><div><strong>กำลังอ่าน Training DB</strong></div></div></div>
          </section>
        </div>
        <footer class="training-lab-foot">
          <span id="training-lab-foot-status">Phase 1 · Historical data foundation</span>
          <div class="phase-next"><b>ถัดไป Phase 2</b><button type="button" disabled>Historical Replay Engine</button></div>
        </footer>
      </div>`;
    document.body.append(dialog);
    return dialog;
  }

  function ensureButton(){
    let btn=byId('training-lab-open');
    if(btn)return btn;
    const drawing=byId('drawing-tools');
    if(!drawing)return null;
    btn=document.createElement('button');
    btn.id='training-lab-open';
    btn.className='training-lab-open';
    btn.type='button';
    btn.textContent='เทรน';
    btn.title='เปิด ARIS Training Lab';
    drawing.insertAdjacentElement('afterend',btn);
    return btn;
  }

  function setPreset(days){
    selectedPreset=days;
    document.querySelectorAll('[data-train-days]').forEach(b=>b.classList.toggle('active',String(days)===b.dataset.trainDays));
    if(days==='custom')return;
    const end=globalThis.HistoricalDataV1?.lastClosedOpenTime?.()??(Date.now()-MINUTE);
    const bars=Number(days)*1440;
    const start=end-(bars-1)*MINUTE;
    byId('train-start').value=toLocalInput(start);
    byId('train-end').value=toLocalInput(end);
    updatePreview();
  }

  function updatePreview(){
    const start=fromLocalInput(byId('train-start')?.value),end=fromLocalInput(byId('train-end')?.value);
    const warmup=Math.max(0,Number(byId('train-warmup')?.value)||500);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){
      for(const id of ['train-preview-bars','train-preview-total','train-preview-requests','train-preview-size'])byId(id).textContent='—';
      return;
    }
    const bars=Math.floor((end-start)/MINUTE)+1,total=bars+warmup,requests=Math.ceil(total/1500);
    byId('train-preview-bars').textContent=fmtInt(bars);
    byId('train-preview-total').textContent=fmtInt(total);
    byId('train-preview-requests').textContent=fmtInt(requests);
    byId('train-preview-size').textContent='~'+fmtBytes(total*190);
  }

  function status(text,type=''){
    const el=byId('train-load-status');if(!el)return;
    el.textContent=text;el.className='train-status-badge'+(type?' '+type:'');
  }

  function setBusy(busy){
    byId('train-load').disabled=busy;
    byId('train-cancel').hidden=!busy;
    document.querySelectorAll('[data-train-days],#train-start,#train-end,#train-warmup').forEach(el=>el.disabled=busy);
    byId('train-progress-wrap').classList.toggle('active',busy||!!latestSession);
  }

  function showProgress(p){
    const pct=Math.max(0,Math.min(100,(Number(p.progress)||0)*100));
    byId('train-progress-wrap').classList.add('active');
    byId('train-progress-bar').style.width=pct.toFixed(1)+'%';
    byId('train-progress-left').textContent=fmtInt(p.loadedBars)+' / '+fmtInt(p.expectedBars)+' bars';
    const speed=Number(p.barsPerSecond)||0;
    byId('train-progress-right').textContent=pct.toFixed(1)+'%'+(speed?' · '+fmtInt(Math.round(speed))+' bars/s':'');
  }

  function showQuality(session){
    const q=session?.quality;if(!q)return;
    byId('train-quality-empty').hidden=true;
    byId('train-quality-result').hidden=false;
    const grade=byId('train-quality-grade');
    grade.textContent=q.grade||'—';grade.className='quality-grade '+(q.grade||'');
    byId('train-quality-title').textContent='Data Quality '+(q.grade||'—')+(session.replayReady?' · พร้อมสำหรับ Phase 2':' · ต้องตรวจข้อมูล');
    byId('train-quality-note').textContent=q.note||'';
    byId('train-quality-loaded').textContent=fmtInt(q.loadedBars);
    byId('train-quality-missing').textContent=fmtInt(q.missing);
    byId('train-quality-duplicate').textContent=fmtInt(q.duplicates);
    byId('train-quality-invalid').textContent=fmtInt(q.invalid);

    const labels={native:'ข้อมูลจริง',derived:'คำนวณจากข้อมูลจริง',unavailable:'ไม่มีในชุดนี้'};
    byId('train-feature-grid').innerHTML=Object.entries(q.features||{}).map(([key,v])=>
      `<div class="feature-item"><span>${esc(v.label||key)}</span><b class="${esc(v.status)}">${esc(labels[v.status]||v.status)}</b></div>`
    ).join('');
  }

  function sessionStatusClass(s){
    return s==='ready'?'ready':s==='quality_warning'?'warn':s==='error'||s==='cancelled'?'error':'';
  }

  async function refreshSessions(){
    const list=byId('training-session-list');if(!list)return;
    try{
      const rows=await globalThis.HistoricalDataV1.listSessions(8);
      if(!rows.length){list.innerHTML='<div class="session-row"><div><strong>ยังไม่มี Training Session</strong><small>โหลดข้อมูลย้อนหลังครั้งแรกได้เลยค่ะ</small></div></div>';return;}
      list.innerHTML=rows.map(s=>{
        const q=s.quality,range=`${humanTime(s.analysisStart)} → ${humanTime(s.analysisEnd)}`;
        return `<div class="session-row" data-session-id="${esc(s.id)}">
          <div><strong>${esc(s.id)} · ${esc(s.status)}</strong><small>${esc(range)}<br>${fmtInt(s.loadedBars)} bars · Warm-up ${fmtInt(s.warmupBars)} · Quality ${esc(q?.grade||'—')} · Engine SHA ${esc((s.engineBlobSha||'—').slice(0,10))}</small></div>
          <div class="session-row-actions"><button type="button" data-train-view="${esc(s.id)}">ดู</button><button type="button" class="train-danger" data-train-delete="${esc(s.id)}">ลบ</button></div>
        </div>`;
      }).join('');
    }catch(err){
      list.innerHTML='<div class="session-row"><div><strong>อ่าน Training DB ไม่สำเร็จ</strong><small>'+esc(err?.message||err)+'</small></div></div>';
    }
  }

  async function showStorage(){
    const e=await globalThis.HistoricalDataV1.storageEstimate();
    byId('train-storage-meta').textContent=e.quota?fmtBytes(e.usage)+' / '+fmtBytes(e.quota):'IndexedDB พร้อม';
  }

  async function startDownload(){
    if(activeController)return;
    const start=fromLocalInput(byId('train-start').value),end=fromLocalInput(byId('train-end').value);
    const warmup=Math.max(100,Math.min(5000,Number(byId('train-warmup').value)||500));
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){status('ช่วงเวลาไม่ถูกต้อง','error');return;}

    const latest=globalThis.HistoricalDataV1.lastClosedOpenTime();
    if(start>latest){status('เวลาเริ่มอยู่ในอนาคต','error');return;}
    const safeEnd=Math.min(end,latest);
    if(safeEnd!==end)byId('train-end').value=toLocalInput(safeEnd);

    activeController=new AbortController();
    setBusy(true);latestSession=null;status('กำลังโหลด','warn');
    byId('train-progress-bar').style.width='0%';
    byId('train-quality-empty').hidden=false;byId('train-quality-result').hidden=true;

    try{
      const session=await globalThis.HistoricalDataV1.downloadDataset({
        symbol:'BTCUSDT',interval:'1m',startTime:start,endTime:safeEnd,warmupBars:warmup,
        signal:activeController.signal,
        engineMeta:{
          engineVersion:globalThis.EventSignalV6?.CFG?.version||'ARIS-2.0.0',
          engineBlobSha:ENGINE_BLOB_SHA,
          auditSchema:globalThis.AuditEngineV2?.schema||'trade-audit-v2'
        },
        onProgress:showProgress
      });
      latestSession=session;
      showQuality(session);
      status(session.replayReady?'โหลดครบ · พร้อม Phase 2':'โหลดเสร็จ · มีคำเตือนคุณภาพ',session.replayReady?'ready':'warn');
      byId('training-lab-foot-status').textContent=session.replayReady
        ?'Phase 1 พร้อม · Dataset '+session.datasetId
        :'Phase 1 โหลดแล้ว แต่ Data Quality ต้องตรวจ';
    }catch(err){
      if(err?.name==='AbortError')status('ยกเลิกแล้ว · เก็บ Session partial ไว้','error');
      else status('โหลดไม่สำเร็จ · '+String(err?.message||err),'error');
    }finally{
      activeController=null;setBusy(false);await refreshSessions();await showStorage();
    }
  }

  async function showSession(id){
    const s=await globalThis.HistoricalDataV1.getSession(id);
    if(!s)return;
    latestSession=s;
    byId('train-start').value=toLocalInput(s.analysisStart);
    byId('train-end').value=toLocalInput(s.analysisEnd);
    byId('train-warmup').value=s.warmupBars||500;
    selectedPreset='custom';
    document.querySelectorAll('[data-train-days]').forEach(b=>b.classList.toggle('active',b.dataset.trainDays==='custom'));
    updatePreview();
    if(s.quality)showQuality(s);
    status(s.status==='ready'?'Session พร้อม Phase 2':s.status,sessionStatusClass(s.status));
    if(s.expectedBars)showProgress({loadedBars:s.loadedBars,expectedBars:s.expectedBars,progress:(s.loadedBars||0)/(s.expectedBars||1),barsPerSecond:0});
  }

  async function removeSession(id){
    if(!confirm('ลบ Training Session นี้และแท่งย้อนหลังที่เก็บไว้หรือไม่?\n\n'+id))return;
    await globalThis.HistoricalDataV1.deleteSession(id);
    if(latestSession?.id===id)latestSession=null;
    await refreshSessions();await showStorage();
  }

  function bind(){
    const dialog=ensureDialog(),btn=ensureButton();
    if(!btn||btn.dataset.bound)return;
    btn.dataset.bound='1';

    btn.addEventListener('click',async()=>{
      if(!dialog.open)dialog.showModal();
      await refreshSessions();await showStorage();updatePreview();
    });
    byId('training-lab-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});

    document.querySelectorAll('[data-train-days]').forEach(b=>b.addEventListener('click',()=>{
      const v=b.dataset.trainDays;setPreset(v==='custom'?'custom':Number(v));
    }));
    for(const id of ['train-start','train-end']){
      byId(id).addEventListener('change',()=>{
        selectedPreset='custom';
        document.querySelectorAll('[data-train-days]').forEach(b=>b.classList.toggle('active',b.dataset.trainDays==='custom'));
        updatePreview();
      });
    }
    byId('train-warmup').addEventListener('input',updatePreview);
    byId('train-load').addEventListener('click',startDownload);
    byId('train-cancel').addEventListener('click',()=>activeController?.abort());

    byId('training-session-list').addEventListener('click',async e=>{
      const view=e.target.closest('[data-train-view]'),del=e.target.closest('[data-train-delete]');
      if(view)await showSession(view.dataset.trainView);
      if(del)await removeSession(del.dataset.trainDelete);
    });

    byId('train-engine-meta').textContent='ARIS 2.0 · '+ENGINE_BLOB_SHA.slice(0,10);
    byId('train-audit-meta').textContent=globalThis.AuditEngineV2?.schema||'trade-audit-v2';
    setPreset(30);
    showStorage();
  }

  function init(){
    if(!globalThis.HistoricalDataV1){
      console.warn('Training Lab: HistoricalDataV1 missing');
      return;
    }
    ensureStyles();ensureDialog();ensureButton();bind();
  }

  globalThis.TrainingLabV1={schema:'training-lab-v1',phase:1,engineBlobSha:ENGINE_BLOB_SHA,init,refreshSessions};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();