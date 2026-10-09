(() => {
  'use strict';

  const BUILD='training-engine-registry-v2';
  const SUPPORTED=Object.freeze([
    {version:'6.6.0',label:'V6.6'},
    {version:'7.2.0',label:'V7.2'},
    {version:'ARIS-1.2.0',label:'ARIS 1.2'},
    {version:'ARIS-2.0.0',label:'ARIS 2.0'},
    {version:'ARIS-3.0.0',label:'ARIS 3.0'},
    {version:'ARIS-3.1.0',label:'ARIS 3.1'},
    {version:'ARIS-3.3.0',label:'ARIS 3.3 · Elliott'},
    {version:'ARIS-3.2.0',label:'ARIS 3.2'},
    {version:'ARIS-4.0.0',label:'ARIS 4.0 · Sideway'}
  ]);
  const allowed=new Set(SUPPORTED.map(x=>x.version));
  const cache=new Map();

  const escapeHtml=v=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function asset(name,rev){
    return new URL(name+(rev?'?v='+encodeURIComponent(rev):''),document.baseURI).href;
  }

  async function load(version){
    const v=String(version||'');
    if(!allowed.has(v))throw new Error('Training engine version ไม่รองรับ: '+v);
    const hit=cache.get(v);
    if(hit?.frame?.isConnected&&hit.Core?.CFG?.version===v)return hit;

    const frame=document.createElement('iframe');
    frame.hidden=true;
    frame.tabIndex=-1;
    frame.setAttribute('aria-hidden','true');
    frame.dataset.trainingEngine=v;
    const base=new URL('.',document.baseURI).href;
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><base href="'+escapeHtml(base)+'"></head><body>'+
      '<script>window.__TRAINING_VERSION='+JSON.stringify(v)+';<\/script>'+
      '<script src="'+escapeHtml(asset('training-engine-core.js','20261010-r9-confirmed-entry'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v2.js','20260930-r6'))+'"><\/script>'+ 
      '<script src="'+escapeHtml(asset('v3.js','20261001-r6'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v31.js','20261001-r1'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v33-base.js','20261010-r9-confirmed-entry'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v33.js','20261010-r9-confirmed-entry'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v32.js','20261002-r1'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v32-direction.js','20261002-r1'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v32-triggers.js','20261002-r1'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v32-entry.js','20261002-r1'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v32-training.js','20261002-r1'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v32-adapter.js','20261002-r3'))+'"><\/script>'+
      '<script src="'+escapeHtml(asset('v4.js','20261001-r1'))+'"><\/script>'+
      '</body></html>';
    document.body.append(frame);

    const started=performance.now();
    while(performance.now()-started<8000){
      const w=frame.contentWindow;
      const core=w?.EventSignalV6;
      if(core?.Engine&&core?.CFG&&(v!=='ARIS-3.3.0'||w?.ArisV33BaseEngine&&w?.ArisV33)){
        if(core.CFG.version!==v){
          frame.remove();
          throw new Error('Training engine โหลดผิดเวอร์ชัน: '+core.CFG.version+' แทน '+v);
        }
        const entry={version:v,Core:core,frame,loadedAt:Date.now()};
        cache.set(v,entry);
        return entry;
      }
      await new Promise(r=>setTimeout(r,25));
    }
    frame.remove();
    throw new Error('โหลด Training engine '+v+' ไม่สำเร็จ');
  }

  function label(version){
    return SUPPORTED.find(x=>x.version===version)?.label||String(version||'—');
  }

  function release(version){
    const hit=cache.get(version);
    if(hit?.frame?.isConnected)hit.frame.remove();
    cache.delete(version);
  }

  function releaseAll(){
    for(const v of [...cache.keys()])release(v);
  }

  globalThis.TrainingEngineRegistryV1={
    schema:BUILD,
    supported:SUPPORTED,
    versions:SUPPORTED.map(x=>x.version),
    defaultVersion:'ARIS-3.1.0',
    load,label,release,releaseAll
  };
})();

