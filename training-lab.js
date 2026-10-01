(() => {
  'use strict';

  const DAY=86_400_000;
  const MINUTE=60_000;
  const TRAINING_VERSION_STORE='btc-training-engine-version-v1';
  const TRAINING_ENGINE_BUILD='training-registry-20261001-r2';
  let activeController=null;
  let selectedPreset=30;
  let selectedTrainingVersion='ARIS-2.0.0';
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
      .training-head-actions{display:flex;align-items:center;gap:7px}
      .training-guide-open{min-height:30px;padding:0 11px;border:1px solid #6557a3;border-radius:7px;background:#211b3a;color:#ddd5ff;font-size:8px;font-weight:600}
      .training-lab-close{width:30px;height:30px;padding:0;border:1px solid #304157;border-radius:7px;background:#111d2a;color:#9cafc4;font-size:16px}
      .training-lab-body{overflow:auto;padding:14px 16px 18px;display:grid;gap:10px}
      #training-guide-dialog{width:min(720px,calc(100vw - 18px));max-height:88vh;padding:0;border:1px solid #3d4860;border-radius:13px;background:#0d1622;color:#d6e0ec;box-shadow:0 24px 80px #000b}
      #training-guide-dialog::backdrop{background:#02060bd6;backdrop-filter:blur(4px)}
      .training-guide-shell{display:grid;grid-template-rows:auto 1fr;max-height:88vh}
      .training-guide-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #27364a;background:#101a27}
      .training-guide-head h2{margin:0;font-size:15px;font-weight:600}.training-guide-close{width:30px;height:30px;padding:0;border:1px solid #34455b;border-radius:7px;background:#111d2a;color:#aebed1;font-size:16px}
      .training-guide-body{overflow:auto;padding:14px 16px 18px;display:grid;gap:8px}
      .training-guide-step{border:1px solid #26364a;border-radius:9px;background:#0c1520;padding:10px}
      .training-guide-step h3{margin:0 0 5px;font-size:9px;color:#c8d5e5}.training-guide-step p{margin:0;font-size:7.5px;line-height:1.6;color:#889bb1}
      .training-guide-step b{color:#cdd8e8;font-weight:600}
      .training-guide-rule{padding:8px 10px;border:1px solid #5a4f2f;border-radius:8px;background:#201c13;color:#cfba7f;font-size:7.5px;line-height:1.55}
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
      .replay-card{border-color:#403765;background:linear-gradient(145deg,#111929,#15142a)}
      .replay-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.replay-head h3{margin-bottom:3px}.replay-mode{font-size:6.5px;color:#8d9fb6;line-height:1.4;text-align:right}
      .replay-session{margin-top:8px;padding:7px 8px;border:1px solid #2c3c52;border-radius:7px;background:#0c1622;font-size:7px;color:#8497ae;line-height:1.45}.replay-session b{color:#c0d0e2}
      .replay-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:8px}.replay-controls select{height:32px;border:1px solid #304258;border-radius:7px;background:#0d1723;color:#b9c8da;padding:0 7px;font-size:8px}
      .replay-progress{margin-top:9px}.replay-progress-line{height:8px;border:1px solid #293b51;border-radius:999px;background:#09131e;overflow:hidden}.replay-progress-line i{display:block;width:0;height:100%;background:linear-gradient(90deg,#735fc9,#4f9f90);transition:width .12s}
      .replay-progress-meta{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:6.5px;color:#7b8ea6}
      .replay-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-top:8px}.replay-kpi{border:1px solid #25364a;border-radius:7px;background:#0c1622;padding:6px}.replay-kpi span{display:block;font-size:5.8px;color:#6f8299}.replay-kpi b{display:block;margin-top:2px;font-size:9px;color:#bfd0e3}
      .replay-note{margin-top:8px!important;padding:7px;border:1px solid #4d452e;border-radius:7px;background:#211d13;color:#bcae82!important}
      .replay-result{margin-top:8px;padding:8px;border:1px solid #2d4d47;border-radius:8px;background:#0e211d}.replay-result strong{font-size:9px;color:#62dab3}.replay-result span{display:block;margin-top:3px;font-size:7px;color:#89a6a0}
      .analytics-card{border-color:#31504b;background:#0d1c1b}.analytics-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
      .analytics-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.analytics-kpi{padding:7px;border:1px solid #29423f;border-radius:7px;background:#0b1717}.analytics-kpi span{display:block;font-size:6px;color:#718f8b}.analytics-kpi b{display:block;margin-top:2px;font-size:11px;color:#b9d7d2}
      .analytics-panels{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.analytics-panel{border:1px solid #263a3a;border-radius:7px;background:#0b1618;padding:7px}.analytics-panel h4{margin:0 0 5px;font-size:7px;color:#9dbab6}
      .analytics-table{width:100%;border-collapse:collapse;font-size:6.3px}.analytics-table th,.analytics-table td{padding:3px 2px;border-bottom:1px solid #1e3032;text-align:left}.analytics-table th{color:#667f80;font-weight:500}.analytics-table td{color:#a9bdbe}.analytics-table td:last-child,.analytics-table th:last-child{text-align:right}
      .analytics-tags{display:flex;gap:4px;flex-wrap:wrap}.analytics-tags span{padding:3px 5px;border:1px solid #2b4141;border-radius:999px;background:#101d1e;color:#91aaaa;font-size:6px}
      .analytics-note{margin-top:7px!important;color:#748d8e!important}.analytics-empty{font-size:7px;color:#72878a}
      @media(max-width:760px){.train-grid{grid-template-columns:1fr}.train-fields{grid-template-columns:1fr 1fr}.train-fields .train-field:last-child{grid-column:1/-1}.train-preview{grid-template-columns:1fr 1fr}.feature-grid{grid-template-columns:1fr}.replay-kpis{grid-template-columns:repeat(3,1fr)}.analytics-grid{grid-template-columns:repeat(2,1fr)}.analytics-panels{grid-template-columns:1fr}}
      @media(max-width:560px){.training-lab-open{height:28px;padding:0 7px;font-size:8px}#training-lab-dialog{width:calc(100vw - 8px);max-height:96vh}.training-lab-shell{max-height:96vh}.training-lab-head{padding:11px}.training-lab-body{padding:9px}.train-card{padding:9px}.quality-stats{grid-template-columns:1fr 1fr}}

      /* 2026 Training Lab redesign: action-first, technical detail hidden by default */
      #training-lab-dialog{width:min(900px,calc(100vw - 20px));border-color:#29384c;border-radius:20px;background:#090f17}
      .training-lab-shell{grid-template-rows:auto 1fr}
      .training-lab-head{align-items:center;padding:17px 20px;background:#0c141f;border-bottom-color:#1e2b3b}
      .training-lab-head h2{margin:0;font-size:19px;letter-spacing:-.2px;color:#eef4fb}
      .training-kicker{display:block!important;margin-bottom:3px;font-size:7px!important;letter-spacing:1.3px!important;color:#8878cb!important}
      .training-guide-open{min-height:34px;padding:0 13px;border-color:#3a4560;background:#111a27;color:#bdc9d9;border-radius:9px}
      .training-lab-close{width:34px;height:34px;border-radius:9px}
      .training-lab-body{padding:16px 18px 22px;gap:12px}
      .train-card{padding:15px;border:1px solid #202f40;border-radius:15px;background:#0d1621}
      .train-card h3{margin:0;font-size:13px;font-weight:650;color:#e0e9f4}
      .train-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}
      .train-section-head>div{min-width:0}
      .train-section-sub{display:block;margin-top:2px;font-size:7px;color:#6e8299}
      .train-status-badge{padding:4px 8px;font-size:7px;border-radius:999px}
      .training-start-card{background:linear-gradient(145deg,#11182a 0%,#0d1721 58%,#0d191d 100%);border-color:#343658}
      .training-engine-block{display:grid;gap:7px}
      .training-engine-label{font-size:8px;color:#8394aa}
      .train-version-select-wrap{position:relative}
      .train-version-select{width:100%;min-height:44px;padding:0 38px 0 12px;border:1px solid #3a4560;border-radius:11px;background:#0b141f;color:#e3eaf4;font-size:10px;font-weight:650;appearance:auto}
      .train-version-select:focus{outline:none;border-color:#7763cf;box-shadow:0 0 0 2px #7763cf22}
      .train-range-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:13px}
      .train-presets{margin:0}
      .train-presets button{min-height:32px;padding:0 12px;border-radius:9px;font-size:8px}
      .train-range-summary{margin-left:auto;font-size:7px;color:#71849b}.train-range-summary b{font-size:10px;color:#c9d6e6}
      .train-more{margin-top:10px;border-top:1px solid #1d2a39;padding-top:8px}
      .train-more summary{cursor:pointer;list-style:none;color:#7f91a8;font-size:8px}.train-more summary::-webkit-details-marker{display:none}
      .train-more[open] summary{margin-bottom:9px;color:#a9b8ca}
      .train-fields{grid-template-columns:1fr 1fr 100px}
      .train-field input{height:36px;border-radius:9px;font-size:10px}
      .train-load-actions{margin-top:13px}
      .train-primary{min-height:40px;padding:0 16px;border-radius:10px;border-color:#7763cf;background:#6a57be;color:#fff;font-size:9px}
      .train-primary:hover{background:#7764cc}
      .train-secondary{min-height:38px;border-radius:9px}
      .train-progress-wrap{margin-top:10px}.train-progress-line{height:6px;border:0;background:#162233}.train-progress-line i{background:linear-gradient(90deg,#7a65cf,#55a697)}
      .technical-meta{display:none!important}
      .quality-card{background:#0c1717;border-color:#243b3a}
      .quality-card[hidden]{display:none!important}
      .quality-hero{justify-content:flex-start}.quality-grade{width:38px;height:38px;border-radius:10px;font-size:18px}
      .quality-stats{grid-template-columns:repeat(2,minmax(0,1fr));max-width:360px}
      .quality-stat:nth-child(n+3){display:none}
      .quality-details{margin-top:8px;border-top:1px solid #1c302f;padding-top:7px}
      .quality-details summary{font-size:7px;color:#728b89;cursor:pointer}
      .session-card{background:#0b141e}
      .session-list{gap:6px}.session-row{padding:9px 10px;border-radius:10px;background:#0a121c;border-color:#1f3042}
      .session-row strong{font-size:8.5px}.session-row small{font-size:6.7px;line-height:1.45}
      .session-row button{min-height:30px;border-radius:8px}
      .replay-card{background:#101322;border-color:#343450}
      .replay-session{margin-top:0;padding:9px 10px;border-radius:10px;background:#0a111c;border-color:#272f45;font-size:7px}
      .replay-controls{margin-top:10px}.replay-controls select{height:38px;border-radius:9px}
      .replay-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
      .replay-kpi{padding:8px;border-radius:9px;background:#0a121c;border-color:#202e40}
      .replay-kpi span{font-size:6px}.replay-kpi b{font-size:12px}
      .replay-kpi.optional-kpi{display:none}
      .replay-result{border-radius:10px}
      .analytics-card{background:#0c1717;border-color:#24413d}
      .analytics-actions{margin:0}
      .analytics-grid{margin-top:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
      .analytics-kpi{padding:9px;border-radius:9px}.analytics-kpi:nth-child(3){display:none}
      .analytics-panels-wrap{margin-top:9px;border-top:1px solid #1d3230;padding-top:8px}
      .analytics-panels-wrap summary{cursor:pointer;font-size:7px;color:#718e8a}
      .analytics-panels{margin-top:8px}
      @media(max-width:760px){
        #training-lab-dialog{width:calc(100vw - 10px);border-radius:14px}
        .training-lab-head{padding:13px 12px}.training-lab-body{padding:10px 10px 16px}
        .train-fields{grid-template-columns:1fr}.train-fields .train-field:last-child{grid-column:auto}
        .train-range-summary{width:100%;margin-left:0}
        .analytics-grid{grid-template-columns:repeat(2,1fr)}
      }
      @media(max-width:430px){
        .training-lab-head h2{font-size:16px}.training-guide-open{padding:0 9px;font-size:7px}
        .train-card{padding:12px}
        .replay-kpis{grid-template-columns:repeat(2,1fr)}
      }
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
          <div><span class="training-kicker">HISTORICAL TRAINING</span><h2>Training Lab</h2></div>
          <div class="training-head-actions">
            <button type="button" class="training-guide-open" id="training-guide-open">คู่มือ</button>
            <button type="button" class="training-lab-close" id="training-lab-close">×</button>
          </div>
        </header>

        <div class="training-lab-body">
          <section class="train-card training-start-card">
            <div class="train-section-head">
              <div><h3>ตั้งค่าการเทรน</h3><span class="train-section-sub">เลือกเวอร์ชันและช่วงข้อมูล</span></div>
              <span class="train-status-badge" id="train-load-status">พร้อม</span>
            </div>

            <div class="training-engine-block">
              <label class="training-engine-label" for="train-engine-select">เวอร์ชันที่ใช้เทรน</label>
              <div class="train-version-select-wrap">
                <select class="train-version-select" id="train-engine-select" aria-label="เวอร์ชันที่ใช้เทรน"></select>
              </div>
            </div>

            <div class="train-range-row">
              <div class="train-presets">
                <button type="button" data-train-days="7">7 วัน</button>
                <button type="button" data-train-days="30" class="active">30 วัน</button>
                <button type="button" data-train-days="90">90 วัน</button>
                <button type="button" data-train-days="custom">กำหนดเอง</button>
              </div>
              <div class="train-range-summary">ประมาณ <b id="train-preview-bars">—</b> แท่ง</div>
            </div>

            <details class="train-more" id="train-range-details">
              <summary>ช่วงเวลา / Warm-up</summary>
              <div class="train-fields">
                <label class="train-field"><span>เริ่ม</span><input id="train-start" type="datetime-local"></label>
                <label class="train-field"><span>สิ้นสุด</span><input id="train-end" type="datetime-local"></label>
                <label class="train-field"><span>Warm-up</span><input id="train-warmup" type="number" min="100" max="5000" step="100" value="500"></label>
              </div>
            </details>
            <span id="train-preview-total" hidden></span><span id="train-preview-requests" hidden></span><span id="train-preview-size" hidden></span>

            <div class="train-load-actions">
              <button type="button" class="train-primary" id="train-load">โหลดข้อมูล</button>
              <button type="button" class="train-secondary train-danger" id="train-cancel" hidden>ยกเลิก</button>
            </div>
            <div class="train-progress-wrap" id="train-progress-wrap">
              <div class="train-progress-line"><i id="train-progress-bar"></i></div>
              <div class="train-progress-text"><span id="train-progress-left">0 / 0 bars</span><span id="train-progress-right">0%</span></div>
            </div>
          </section>

          <div class="technical-meta" hidden>
            <b id="train-engine-meta"></b><b id="train-audit-meta"></b><b id="train-storage-meta"></b>
          </div>

          <section class="train-card quality-card" id="train-quality-card" hidden>
            <div class="train-section-head"><div><h3>คุณภาพข้อมูล</h3></div></div>
            <div id="train-quality-empty"></div>
            <div id="train-quality-result" hidden>
              <div class="quality-hero">
                <div class="quality-grade" id="train-quality-grade">—</div>
                <div class="quality-copy"><b id="train-quality-title">Data Quality</b><span id="train-quality-note" hidden></span></div>
              </div>
              <div class="quality-stats">
                <div class="quality-stat"><span>Loaded</span><b id="train-quality-loaded">—</b></div>
                <div class="quality-stat"><span>Missing</span><b id="train-quality-missing">—</b></div>
                <div class="quality-stat"><span>Duplicate</span><b id="train-quality-duplicate">—</b></div>
                <div class="quality-stat"><span>Invalid OHLC</span><b id="train-quality-invalid">—</b></div>
              </div>
              <details class="quality-details"><summary>รายละเอียดข้อมูล</summary><div class="feature-grid" id="train-feature-grid"></div></details>
            </div>
          </section>

          <section class="train-card session-card">
            <div class="train-section-head"><div><h3>ชุดข้อมูลของฉัน</h3></div></div>
            <div class="session-list" id="training-session-list"><div class="session-row"><div><strong>กำลังโหลด</strong></div></div></div>
          </section>

          <section class="train-card replay-card">
            <div class="train-section-head">
              <div><h3>Replay</h3><span class="train-section-sub">จำลองสัญญาณจากข้อมูลย้อนหลัง</span></div>
              <span class="train-status-badge" id="train-replay-status">รอชุดข้อมูล</span>
            </div>
            <div class="replay-session" id="train-replay-session"><b>ยังไม่ได้เลือกชุดข้อมูล</b></div>
            <div class="replay-controls">
              <select id="train-replay-speed" aria-label="ความเร็ว Replay"><option value="fast">เร็ว</option><option value="balanced">กลาง</option><option value="safe">ช้า</option></select>
              <button type="button" class="train-primary" id="train-replay-start" disabled>เริ่ม Replay</button>
              <button type="button" class="train-secondary" id="train-replay-pause" hidden>Pause</button>
              <button type="button" class="train-secondary" id="train-replay-resume" hidden>Resume</button>
              <button type="button" class="train-secondary train-danger" id="train-replay-stop" hidden>Stop</button>
            </div>
            <div class="replay-progress">
              <div class="replay-progress-line"><i id="train-replay-progress-bar"></i></div>
              <div class="replay-progress-meta"><span id="train-replay-progress-left">0 / 0 bars</span><span id="train-replay-clock">—</span><span id="train-replay-progress-right">0%</span></div>
            </div>
            <div class="replay-kpis">
              <div class="replay-kpi"><span>Signals</span><b id="train-replay-signals">0</b></div>
              <div class="replay-kpi"><span>Settled</span><b id="train-replay-settled">0</b></div>
              <div class="replay-kpi"><span>Win</span><b id="train-replay-win">0</b></div>
              <div class="replay-kpi"><span>Loss</span><b id="train-replay-loss">0</b></div>
              <div class="replay-kpi optional-kpi"><span>Pending</span><b id="train-replay-pending">0</b></div>
              <div class="replay-kpi optional-kpi"><span>Speed</span><b id="train-replay-bps">—</b></div>
            </div>
            <div class="replay-result" id="train-replay-result" hidden><strong id="train-replay-result-title">Replay complete</strong><span id="train-replay-result-copy"></span></div>
          </section>

          <section class="train-card analytics-card">
            <div class="train-section-head">
              <div><h3>วิเคราะห์ผล</h3></div>
              <span class="train-status-badge" id="train-analytics-status">รอ Replay</span>
            </div>
            <div class="analytics-actions">
              <button type="button" class="train-primary" id="train-analytics-build" disabled>วิเคราะห์</button>
              <button type="button" class="train-secondary" id="train-analytics-export" disabled>Export</button>
            </div>
            <div id="train-analytics-empty" class="analytics-empty">ยังไม่มีผลวิเคราะห์</div>
            <div id="train-analytics-result" hidden>
              <div class="analytics-grid">
                <div class="analytics-kpi"><span>Trades</span><b id="analytics-trades">—</b></div>
                <div class="analytics-kpi"><span>Win rate</span><b id="analytics-wr">—</b></div>
                <div class="analytics-kpi"><span>Audit samples</span><b id="analytics-audit-n">—</b></div>
                <div class="analytics-kpi"><span>Calibration</span><b id="analytics-order">—</b></div>
              </div>
              <details class="analytics-panels-wrap">
                <summary>ดูรายละเอียด</summary>
                <div class="analytics-panels">
                  <div class="analytics-panel"><h4>Audit Calibration</h4><div id="analytics-calibration"></div></div>
                  <div class="analytics-panel"><h4>State / Playbook</h4><div id="analytics-context"></div></div>
                  <div class="analytics-panel"><h4>รูปแบบที่เจอบ่อย</h4><div id="analytics-patterns"></div></div>
                  <div class="analytics-panel"><h4>MFE / MAE + Audit miss</h4><div id="analytics-quality"></div></div>
                </div>
              </details>
              <p class="analytics-note" id="analytics-note" hidden></p>
            </div>
          </section>
        </div>
      </div>`;
    document.body.append(dialog);
    ensureGuideDialog();
    return dialog;
  }

  function ensureGuideDialog(){
    let guide=byId('training-guide-dialog');
    if(guide)return guide;
    guide=document.createElement('dialog');
    guide.id='training-guide-dialog';
    guide.innerHTML=`
      <div class="training-guide-shell">
        <header class="training-guide-head">
          <h2>คู่มือการเทรน</h2>
          <button type="button" class="training-guide-close" id="training-guide-close">×</button>
        </header>
        <div class="training-guide-body">
          <section class="training-guide-step"><h3>1 · เลือกเวอร์ชัน</h3><p>เลือก V6.6, V7.2, ARIS 1.2, ARIS 2.0 หรือ ARIS 3.0 ที่ด้านบนของหน้าเทรน เวอร์ชันนี้ใช้เฉพาะ Historical Training และไม่เปลี่ยนเวอร์ชัน Live</p></section>
          <section class="training-guide-step"><h3>2 · โหลดข้อมูลย้อนหลัง</h3><p>เลือกช่วง <b>7 / 30 / 90 วัน</b> หรือกำหนดเอง แล้วกด <b>โหลดข้อมูล</b> ระบบใช้ BTCUSDT Futures 1 นาที และเพิ่ม Warm-up ก่อนช่วงทดสอบ</p></section>
          <section class="training-guide-step"><h3>3 · ตรวจ Data Quality</h3><p>ระบบตรวจ Missing candle, Duplicate, OHLC ผิดรูป และ Coverage ของข้อมูลเสริม ถ้าข้อมูลขาดจริง ระบบจะไม่สร้าง Order Book, Tick flow หรือข้อมูลย้อนหลังที่ไม่มีอยู่ขึ้นมาเอง</p></section>
          <section class="training-guide-step"><h3>4 · เลือกชุดข้อมูล</h3><p>Session เก็บช่วงเวลา, Warm-up, Engine snapshot และ Data Quality แยกจาก Live Journal กด <b>ดู</b> ที่ Session ที่ต้องการก่อนทำ Replay</p></section>
          <section class="training-guide-step"><h3>5 · Replay</h3><p>Replay เปิดข้อมูลตามลำดับเวลาแบบ <b>1m bar-close</b> ให้เครื่องยนต์วิเคราะห์ทีละแท่ง จุดเข้าจะถูก freeze ณ ตอนนั้น และตัดสินผลหลังครบ 10 แท่ง จึงไม่ส่งอนาคตย้อนกลับไปช่วยจุดเข้า สามารถ Pause, Resume และ Stop ได้</p></section>
          <section class="training-guide-step"><h3>6 · วิเคราะห์ผล</h3><p>หลัง Replay มีไม้ที่ตัดสินแล้ว กด <b>วิเคราะห์ Phase 3</b> เพื่อดู Win rate, State / Playbook, รูปแบบแพ้ชนะ และ MFE / MAE จาก Compact Training records ส่วน Audit calibration ใช้เฉพาะ ARIS 2.0; ARIS 3.0 ใช้สถานะและเงื่อนไขทั้ง 4 หมวดของตัวเอง</p></section>
          <section class="training-guide-step"><h3>7 · Validation / Walk-forward</h3><p>Phase 4 แบ่งข้อมูลตามเวลาเป็น <b>Train 60% / Validation 20% / Holdout 20%</b> Candidate ถูกสร้างจาก Train เท่านั้น แล้วค่อยสอบกับข้อมูลที่ไม่เคยเห็น พร้อม Walk-forward หลายช่วงเพื่อจับ overfitting</p></section>
          <div class="training-guide-rule"><b>หลักสำคัญ:</b> ผล Historical Training เป็นหลักฐานสำหรับวิจัยและปรับ Candidate ไม่ใช่คำสั่งให้แก้ Live อัตโนมัติ แม้ผล Phase 4 ผ่าน ระบบก็ยังเก็บเป็นรุ่นทดลอง/Shadow ก่อนค่ะ</div>
        </div>
      </div>`;
    document.body.append(guide);
    return guide;
  }

  function ensureButton(){
    let btn=byId('training-lab-open');
    if(btn)return btn;
    const quick=byId('toolbar-more-quick')||document.querySelector('.toolbar-more-popover');
    if(!quick)return null;
    btn=document.createElement('button');
    btn.id='training-lab-open';
    btn.className='training-lab-open';
    btn.type='button';
    btn.textContent='เทรน';
    btn.title='เปิด ARIS Training Lab';
    quick.prepend(btn);
    return btn;
  }

  function setPreset(days){
    selectedPreset=days;
    document.querySelectorAll('[data-train-days]').forEach(b=>b.classList.toggle('active',String(days)===b.dataset.trainDays));
    const details=byId('train-range-details');
    if(days==='custom'){if(details)details.open=true;return;}
    if(details)details.open=false;
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
    document.querySelectorAll('[data-train-days],#train-engine-select,#train-start,#train-end,#train-warmup').forEach(el=>el.disabled=busy);
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
    const card=byId('train-quality-card');if(card)card.hidden=false;
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
      if(!rows.length){list.innerHTML='<div class="session-row"><div><strong>ยังไม่มีชุดข้อมูล</strong></div></div>';return;}
      list.innerHTML=rows.map(s=>{
        const q=s.quality,range=`${humanTime(s.analysisStart)} → ${humanTime(s.analysisEnd)}`;
        return `<div class="session-row" data-session-id="${esc(s.id)}">
          <div><strong>${esc(range)}</strong><small>${fmtInt(s.loadedBars)} แท่ง · Quality ${esc(q?.grade||'—')}</small></div>
          <div class="session-row-actions"><button type="button" data-train-view="${esc(s.id)}">เลือก</button><button type="button" class="train-danger" data-train-delete="${esc(s.id)}">ลบ</button></div>
        </div>`;
      }).join('');
    }catch(err){
      list.innerHTML='<div class="session-row"><div><strong>อ่าน Training DB ไม่สำเร็จ</strong><small>'+esc(err?.message||err)+'</small></div></div>';
    }
  }

  async function showStorage(){
    const target=byId('train-storage-meta');if(!target)return;
    const e=await globalThis.HistoricalDataV1.storageEstimate();
    target.textContent=e.quota?fmtBytes(e.usage)+' / '+fmtBytes(e.quota):'IndexedDB พร้อม';
  }

  function setTrainingVersion(version,{silent=false}={}){
    const supported=globalThis.TrainingEngineRegistryV1?.versions||['6.6.0','7.2.0','ARIS-1.2.0','ARIS-2.0.0','ARIS-3.0.0'];
    if(!supported.includes(version))return false;
    selectedTrainingVersion=version;
    const select=byId('train-engine-select');
    if(select)select.value=version;
    const auditMeta=byId('train-audit-meta');
    if(auditMeta)auditMeta.textContent=version==='ARIS-2.0.0'?(globalThis.AuditEngineV2?.schema||'trade-audit-v2'):'ไม่ใช้ Audit V2';
    try{localStorage.setItem(TRAINING_VERSION_STORE,version);}catch{}
    if(!silent){
      updateReplayPanel(latestSession);
      document.dispatchEvent(new CustomEvent('training-version-change',{detail:{version}}));
    }
    return true;
  }

  function restoreTrainingVersion(){
    let saved=null;try{saved=localStorage.getItem(TRAINING_VERSION_STORE);}catch{}
    const supported=globalThis.TrainingEngineRegistryV1?.versions||[];
    setTrainingVersion(supported.includes(saved)?saved:(globalThis.TrainingEngineRegistryV1?.defaultVersion||'ARIS-2.0.0'),{silent:true});
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
    const qualityCard=byId('train-quality-card');if(qualityCard)qualityCard.hidden=true;
    byId('train-quality-empty').hidden=false;byId('train-quality-result').hidden=true;

    try{
      const session=await globalThis.HistoricalDataV1.downloadDataset({
        symbol:'BTCUSDT',interval:'1m',startTime:start,endTime:safeEnd,warmupBars:warmup,
        signal:activeController.signal,
        engineMeta:{
          engineVersion:selectedTrainingVersion,
          engineBlobSha:selectedTrainingVersion+'@'+TRAINING_ENGINE_BUILD,
          auditSchema:selectedTrainingVersion==='ARIS-2.0.0'?(globalThis.AuditEngineV2?.schema||'trade-audit-v2'):null
        },
        onProgress:showProgress
      });
      latestSession=session;
      showQuality(session);
      status(session.replayReady?'โหลดครบ · พร้อม Phase 2':'โหลดเสร็จ · มีคำเตือนคุณภาพ',session.replayReady?'ready':'warn');
      const footStatus=byId('training-lab-foot-status');
      if(footStatus)footStatus.textContent=session.replayReady
        ?'Phase 1 พร้อม · เลือก Session นี้แล้วเริ่ม Phase 2 ได้'
        :'Phase 1 โหลดแล้ว แต่ Data Quality ต้องตรวจ';
      await updateReplayPanel(session);
    }catch(err){
      if(err?.name==='AbortError')status('ยกเลิกแล้ว · เก็บ Session partial ไว้','error');
      else status('โหลดไม่สำเร็จ · '+String(err?.message||err),'error');
    }finally{
      activeController=null;setBusy(false);await refreshSessions();await showStorage();
    }
  }


  function replayStatus(text,type=''){
    const el=byId('train-replay-status');if(!el)return;
    el.textContent=text;el.className='train-status-badge'+(type?' '+type:'');
  }

  function replayClockText(ms){
    if(!Number.isFinite(Number(ms)))return 'Replay clock —';
    return 'เวลา '+new Date(Number(ms)).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  }

  function renderReplayProgress(p={}){
    const total=Number(p.totalBars)||0,processed=Number(p.processedBars)||0,progress=Number.isFinite(Number(p.progress))?Number(p.progress):(total?processed/total:0);
    const pct=Math.max(0,Math.min(100,progress*100));
    byId('train-replay-progress-bar').style.width=pct.toFixed(1)+'%';
    byId('train-replay-progress-left').textContent=fmtInt(processed)+' / '+fmtInt(total)+' bars';
    byId('train-replay-progress-right').textContent=pct.toFixed(1)+'%';
    byId('train-replay-clock').textContent=replayClockText(p.replayClock);
    byId('train-replay-signals').textContent=fmtInt(p.signals||0);
    byId('train-replay-settled').textContent=fmtInt(p.settled||0);
    byId('train-replay-win').textContent=fmtInt(p.correct||0);
    byId('train-replay-loss').textContent=fmtInt(p.incorrect||0);
    byId('train-replay-pending').textContent=fmtInt(p.pending||0);
    byId('train-replay-bps').textContent=Number(p.barsPerSecond)>0?fmtInt(Math.round(p.barsPerSecond))+'/s':'—';

    if(p.status==='replaying')replayStatus('กำลัง Replay','warn');
    else if(p.status==='stopped')replayStatus('หยุดไว้ที่ Checkpoint','warn');
    else if(p.status==='completed')replayStatus('Replay เสร็จ','ready');
  }

  function showReplayReport(report){
    const box=byId('train-replay-result');if(!box)return;
    if(!report){box.hidden=true;return;}
    box.hidden=false;
    const c=report.counts||{},wr=Number(report.winRate);
    byId('train-replay-result-title').textContent=report.status==='completed'?'Replay complete':'Replay '+(report.status||'');
    byId('train-replay-result-copy').textContent=
      'Signals '+fmtInt(c.signals)+' · ตัดสิน '+fmtInt(c.settled)+' · ชนะ '+fmtInt(c.correct)+' / แพ้ '+fmtInt(c.incorrect)+
      ' · Win rate '+(Number.isFinite(wr)?(wr*100).toFixed(1)+'%':'—')+' · '+String(report.mode||'1m_close_replay');
  }

  function setReplayButtons(mode='idle'){
    const start=byId('train-replay-start'),pause=byId('train-replay-pause'),resume=byId('train-replay-resume'),stop=byId('train-replay-stop');
    const selected=!!latestSession,ready=!!latestSession?.replayReady||['paused','stopped','replay_complete','replaying'].includes(latestSession?.status);
    start.disabled=!selected||!ready||mode==='running'||mode==='paused';
    const versionSelect=byId('train-engine-select');if(versionSelect)versionSelect.disabled=mode==='running'||mode==='paused';
    pause.disabled=mode!=='running';pause.hidden=mode!=='running';
    resume.disabled=mode!=='paused';resume.hidden=mode!=='paused';
    stop.disabled=!['running','paused'].includes(mode);stop.hidden=!['running','paused'].includes(mode);
  }

  async function updateReplayPanel(session=latestSession){
    const box=byId('train-replay-session');if(!box)return;
    if(!session){
      box.innerHTML='<b>ยังไม่ได้เลือก Session</b>';
      replayStatus('รอ Session');setReplayButtons('idle');showReplayReport(null);await updateAnalyticsPanel(null);return;
    }
    latestSession=session;
    const cp=await globalThis.HistoricalReplayV1?.hasCheckpoint?.(session.id,selectedTrainingVersion);
    const range=humanTime(session.analysisStart)+' → '+humanTime(session.analysisEnd);
    box.innerHTML='<b>'+esc(globalThis.TrainingEngineRegistryV1?.label?.(selectedTrainingVersion)||selectedTrainingVersion)+'</b> · '+esc(range)+
      ' · '+fmtInt(session.loadedBars)+' แท่ง'+(cp?' · มี Checkpoint':'');
    const sameVersion=session.engineVersion===selectedTrainingVersion;
    const report=sameVersion?await globalThis.HistoricalDataV1.getReport(session.id):null;
    showReplayReport(report);
    if(!sameVersion)renderReplayProgress({});
    const running=globalThis.HistoricalReplayV1?.current?.();
    const same=running?.session?.id===session.id;
    if(same&&running.paused){replayStatus('Paused · มี Checkpoint','warn');setReplayButtons('paused');}
    else if(same&&running.running){replayStatus('กำลัง Replay','warn');setReplayButtons('running');}
    else{
      const can=!!session.replayReady||['paused','stopped','replay_complete','replaying'].includes(session.status);
      const completedSame=session.status==='replay_complete'&&session.engineVersion===selectedTrainingVersion;
      replayStatus(completedSame?'Replay เสร็จ':cp?'พร้อม Resume':can?'พร้อม':'Dataset ยังไม่พร้อม',completedSame||can?'ready':'warn');
      byId('train-replay-start').textContent=cp?'ทำต่อ':completedSame?'Replay ใหม่':'เริ่ม Replay';
      setReplayButtons('idle');
      if(sameVersion&&session.replayProcessedBars&&session.loadedBars)renderReplayProgress({
        processedBars:session.replayProcessedBars,totalBars:session.loadedBars,progress:session.replayProgress||0,
        signals:session.replayReport?.signals||0,settled:session.replayReport?.settled||0,correct:session.replayReport?.correct||0,incorrect:session.replayReport?.incorrect||0,pending:session.replayReport?.pending||0
      });
    }
    await updateAnalyticsPanel(session);
  }

  async function startReplay(){
    if(!latestSession||!globalThis.HistoricalReplayV1)return;
    const running=globalThis.HistoricalReplayV1.current();
    if(running?.running){
      if(running.paused){globalThis.HistoricalReplayV1.resume();setReplayButtons('running');replayStatus('ทำต่อแล้ว','warn');}
      return;
    }
    const resume=await globalThis.HistoricalReplayV1.hasCheckpoint(latestSession.id,selectedTrainingVersion);
    setReplayButtons('running');replayStatus(resume?'กำลัง Resume':'กำลังเริ่ม Replay','warn');showReplayReport(null);
    try{
      const report=await globalThis.HistoricalReplayV1.start(latestSession.id,{
        speed:byId('train-replay-speed').value||'fast',
        engineVersion:selectedTrainingVersion,
        resume,
        onProgress:renderReplayProgress
      });
      const fresh=await globalThis.HistoricalDataV1.getSession(latestSession.id);
      if(fresh)latestSession=fresh;
      showReplayReport(report);await refreshSessions();await updateReplayPanel(latestSession);await updateAnalyticsPanel(latestSession);await showStorage();
    }catch(err){
      console.error('Historical Replay failed',err);
      replayStatus('Replay error · '+String(err?.message||err),'error');setReplayButtons('idle');
    }
  }

  function pauseReplay(){
    if(globalThis.HistoricalReplayV1?.pause?.()){replayStatus('กำลัง Pause / บันทึก Checkpoint','warn');setReplayButtons('paused');}
  }
  function resumeReplay(){
    if(globalThis.HistoricalReplayV1?.resume?.()){replayStatus('ทำต่อแล้ว','warn');setReplayButtons('running');}
  }
  function stopReplay(){
    if(globalThis.HistoricalReplayV1?.stop?.()){replayStatus('กำลังหยุดและบันทึก Checkpoint','warn');}
  }


  function analyticsStatus(text,type=''){
    const el=byId('train-analytics-status');if(!el)return;
    el.textContent=text;el.className='train-status-badge'+(type?' '+type:'');
  }

  function wrText(v){return Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'—';}

  function analyticsKeyLabel(key){
    return ({
      SHOCK_UNRESOLVED:'แรงกระแทก · ยังไม่เฉลย',BREAKOUT_ATTEMPT:'กำลังลองทะลุกรอบ',BREAKOUT_ACCEPTED:'ทะลุกรอบเริ่มถูกยอมรับ',
      EXHAUSTION:'ปลายขา / แรงเริ่มหมด',REVERSAL_DEVELOPING:'กำลังสร้างโครงกลับตัว',COMPRESSION:'บีบตัวสะสมแรง',
      PULLBACK:'กำลังย่อในโครงสร้างเดิม',TREND_ADVANCE:'เทรนด์กำลังเดิน',RANGE_EDGE:'อยู่ขอบกรอบ',RANGE_CHOP:'แกว่งสลับในกรอบ',TRANSITION:'ช่วงเปลี่ยนจังหวะ',
      breakout_continuation:'ทะลุกรอบแล้วไปต่อ',shock_resolution:'รอผลหลังแรงกระแทก',pullback_reclaim:'ย่อสร้างฐานแล้วกลับมายืน',confirmed_reversal:'กลับตัวที่ยืนยันแล้ว'
    })[String(key)]||String(key??'—');
  }
  function rowsTable(rows,keyLabel='กลุ่ม',limit=6){
    const a=(rows||[]).slice(0,limit);
    if(!a.length)return '<span class="analytics-empty">ยังไม่มีข้อมูล</span>';
    return '<table class="analytics-table"><thead><tr><th>'+esc(keyLabel)+'</th><th>N</th><th>WR</th></tr></thead><tbody>'+
      a.map(x=>'<tr><td>'+esc(analyticsKeyLabel(x.key))+'</td><td>'+fmtInt(x.n)+'</td><td>'+esc(wrText(x.winRate))+'</td></tr>').join('')+'</tbody></table>';
  }

  function renderAnalytics(report){
    const result=byId('train-analytics-result'),empty=byId('train-analytics-empty');
    if(!report){result.hidden=true;empty.hidden=false;return;}
    empty.hidden=true;result.hidden=false;
    byId('analytics-trades').textContent=fmtInt(report.counts?.scored||0);
    byId('analytics-wr').textContent=wrText(report.winRate);
    const isV2=report.engineVersion==='ARIS-2.0.0';
    byId('analytics-audit-n').textContent=fmtInt(report.auditCalibration?.health?.samples||0);
    byId('analytics-order').textContent=Number.isFinite(report.auditCalibration?.health?.orderingPct)?report.auditCalibration.health.orderingPct+'%':'ข้อมูลน้อย';
    const auditCountCard=byId('analytics-audit-n')?.closest('.analytics-kpi');
    const auditCard=byId('analytics-order')?.closest('.analytics-kpi');
    if(auditCountCard)auditCountCard.hidden=!isV2;
    if(auditCard)auditCard.hidden=!isV2;
    const auditPanel=byId('analytics-calibration')?.closest('.analytics-panel');
    if(auditPanel)auditPanel.hidden=!isV2;

    byId('analytics-calibration').innerHTML=isV2?rowsTable(report.auditCalibration?.bands,'Audit',5):'<span class="analytics-empty">ARIS 3.0 ไม่ใช้ Audit V2</span>';

    const states=(report.byState||[]).slice(0,4),plays=(report.byPlaybook||[]).slice(0,4);
    byId('analytics-context').innerHTML=
      '<div style="margin-bottom:5px">'+rowsTable(states,'State',4)+'</div>'+
      rowsTable(plays,'Playbook',4);

    const losses=(report.lossTags||[]).slice(0,5),wins=(report.winTags||[]).slice(0,5);
    byId('analytics-patterns').innerHTML=
      '<div class="analytics-tags">'+losses.map(x=>'<span>แพ้ · '+esc(x.tag)+' ×'+fmtInt(x.n)+'</span>').join('')+
      wins.map(x=>'<span>ชนะ · '+esc(x.tag)+' ×'+fmtInt(x.n)+'</span>').join('')+'</div>';

    const qualityPanel=byId('analytics-quality')?.closest('.analytics-panel');
    if(qualityPanel?.querySelector('h4'))qualityPanel.querySelector('h4').textContent=isV2?'MFE / MAE + Audit miss':'MFE / MAE';
    const mm=report.mfeMae||{},miss=isV2?(report.auditMisses||[]).slice(0,5):[];
    byId('analytics-quality').innerHTML=
      '<div class="analytics-tags"><span>Win MFE '+esc(String(mm.winMfe??'—'))+' ATR</span><span>Win MAE '+esc(String(mm.winMae??'—'))+
      ' ATR</span><span>Loss MFE '+esc(String(mm.lossMfe??'—'))+' ATR</span><span>Loss MAE '+esc(String(mm.lossMae??'—'))+' ATR</span>'+
      miss.map(x=>'<span>'+esc(x.type)+' ×'+fmtInt(x.n)+'</span>').join('')+'</div>';

    const h=report.auditCalibration?.health;
    const analyticsNote=byId('analytics-note');
    if(analyticsNote)analyticsNote.textContent=isV2
      ?'Historical 1m bar-close · Audit ordering '+(Number.isFinite(h?.orderingPct)?h.orderingPct+'%':'ยังวัดไม่ได้')+' · Samples '+fmtInt(h?.samples||0)+' · Phase 4 จะใช้ holdout/walk-forward ยืนยันก่อนแตะ Live'
      :'Historical 1m bar-close · ARIS 3.0 ใช้ State / Playbook / Fib / MFE-MAE และเงื่อนไขของ V3 โดยไม่ใช้ Audit V2 · Phase 4 จะใช้ holdout/walk-forward ยืนยันก่อนแตะ Live';
  }

  async function updateAnalyticsPanel(session=latestSession){
    const buildBtn=byId('train-analytics-build'),exportBtn=byId('train-analytics-export');
    if(!session){buildBtn.disabled=true;exportBtn.disabled=true;analyticsStatus('รอ Session');renderAnalytics(null);return;}
    const sameVersion=session.engineVersion===selectedTrainingVersion;
    const hasSettled=sameVersion&&Number(session.replayReport?.settled||0)>0;
    buildBtn.disabled=!hasSettled;
    const report=sameVersion?await globalThis.TrainingAnalyticsV1?.get?.(session.id):null;
    exportBtn.disabled=!report;
    if(report){renderAnalytics(report);analyticsStatus('Analytics พร้อม','ready');}
    else{renderAnalytics(null);analyticsStatus(hasSettled?'พร้อมวิเคราะห์':'รอผล Replay',hasSettled?'ready':'');}
  }

  async function buildAnalytics(){
    if(!latestSession||!globalThis.TrainingAnalyticsV1)return;
    byId('train-analytics-build').disabled=true;analyticsStatus('กำลังวิเคราะห์','warn');
    try{
      const report=await globalThis.TrainingAnalyticsV1.build(latestSession.id);
      renderAnalytics(report);byId('train-analytics-export').disabled=false;analyticsStatus('Analytics พร้อม','ready');
    }catch(err){
      console.error('Training analytics failed',err);analyticsStatus('วิเคราะห์ไม่สำเร็จ · '+String(err?.message||err),'error');
    }finally{
      const hasSettled=Number(latestSession?.replayReport?.settled||0)>0;
      byId('train-analytics-build').disabled=!hasSettled;
    }
  }

  async function exportAnalytics(){
    if(!latestSession||!globalThis.TrainingAnalyticsV1)return;
    analyticsStatus('กำลังสร้าง JSON','warn');
    try{
      await globalThis.TrainingAnalyticsV1.download(latestSession.id);
      analyticsStatus('Export JSON แล้ว','ready');
    }catch(err){
      console.error('Training export failed',err);analyticsStatus('Export ไม่สำเร็จ · '+String(err?.message||err),'error');
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
    status(s.status==='ready'?'พร้อม':s.status,sessionStatusClass(s.status));
    if(s.expectedBars)showProgress({loadedBars:s.loadedBars,expectedBars:s.expectedBars,progress:(s.loadedBars||0)/(s.expectedBars||1),barsPerSecond:0});
    await updateReplayPanel(s);
  }

  async function removeSession(id){
    const active=globalThis.HistoricalReplayV1?.current?.();
    if(active?.running&&active.session?.id===id){alert('Session นี้กำลัง Replay อยู่ กรุณา Stop ก่อนลบค่ะ');return;}
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
      const more=byId('toolbar-more');if(more?.open)more.open=false;
      if(!dialog.open)dialog.showModal();
      await refreshSessions();await showStorage();updatePreview();await updateReplayPanel(latestSession);
    });
    byId('training-lab-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    const guide=ensureGuideDialog();
    byId('training-guide-open').addEventListener('click',()=>{if(!guide.open)guide.showModal();});
    byId('training-guide-close').addEventListener('click',()=>guide.close());
    guide.addEventListener('click',e=>{if(e.target===guide)guide.close();});

    const versionSelect=byId('train-engine-select');
    if(versionSelect){
      const registry=globalThis.TrainingEngineRegistryV1;
      versionSelect.innerHTML=(registry?.supported||[]).map(x=>'<option value="'+esc(x.version)+'">'+esc(x.label||x.version)+'</option>').join('');
      versionSelect.addEventListener('change',()=>setTrainingVersion(versionSelect.value));
    }
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
    byId('train-replay-start').addEventListener('click',startReplay);
    byId('train-replay-pause').addEventListener('click',pauseReplay);
    byId('train-replay-resume').addEventListener('click',resumeReplay);
    byId('train-replay-stop').addEventListener('click',stopReplay);
    byId('train-analytics-build').addEventListener('click',buildAnalytics);
    byId('train-analytics-export').addEventListener('click',exportAnalytics);

    byId('training-session-list').addEventListener('click',async e=>{
      const view=e.target.closest('[data-train-view]'),del=e.target.closest('[data-train-delete]');
      if(view)await showSession(view.dataset.trainView);
      if(del)await removeSession(del.dataset.trainDelete);
    });

    const engineMeta=byId('train-engine-meta');if(engineMeta)engineMeta.textContent=TRAINING_ENGINE_BUILD;
    const auditMeta=byId('train-audit-meta');if(auditMeta)auditMeta.textContent=selectedTrainingVersion==='ARIS-2.0.0'?(globalThis.AuditEngineV2?.schema||'trade-audit-v2'):'ไม่ใช้ Audit V2';
    restoreTrainingVersion();
    setPreset(30);
    showStorage();
  }

  function init(){
    if(!globalThis.HistoricalDataV1||!globalThis.HistoricalReplayV1||!globalThis.TrainingAnalyticsV1||!globalThis.TrainingEngineRegistryV1){
      console.warn('Training Lab: historical/replay/analytics/engine registry missing');
      return;
    }
    ensureStyles();ensureDialog();ensureButton();bind();
  }

  globalThis.TrainingLabV1={schema:'training-lab-v1',phase:4,engineBlobSha:TRAINING_ENGINE_BUILD,init,refreshSessions,updateReplayPanel,updateAnalyticsPanel,selectedVersion:()=>selectedTrainingVersion,setTrainingVersion};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();