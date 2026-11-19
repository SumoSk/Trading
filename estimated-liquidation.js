/* ARIS estimated liquidation STRESS SCENARIOS.
 * NOT order-level liquidation positions or Coinglass-equivalent observations.
 * Uses Binance OI change + 5m candles; equal LONG/SHORT OI by contract identity.
 * Leverage mix is an explicit, unverified scenario assumption: 10/20/50/100x.
 * No exact liquidation price: ignores maintenance margin, fee/funding and cross margin.
 */
(function(root){
'use strict';
const PERIOD_MS=300000;
const LOOKBACK_BARS=144;
const MAX_AGE_MS=15*60*1000;
const LEVERAGES=Object.freeze([10,20,50,100]);
const REFRESH_MS=300000;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function finitePositive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function normalizeInput(openInterest,klines,nowMs){
 if(!Array.isArray(openInterest)||!Array.isArray(klines)||!Number.isFinite(nowMs))return [];
 const candleMap=new Map();
 for(const row of klines){
  if(!Array.isArray(row)||row.length<7)continue;
  const openTime=Number(row[0]),close=finitePositive(row[4]);
  if(!Number.isFinite(openTime)||!close||Number(row[6])>nowMs)continue;
  candleMap.set(Math.floor(openTime/PERIOD_MS)*PERIOD_MS,{price:close,high:finitePositive(row[2]),low:finitePositive(row[3])});
 }
 const result=[];
 for(const item of openInterest){
  if(!item)continue;
  const time=Number(item.timestamp),oi=finitePositive(item.sumOpenInterest);
  if(!Number.isFinite(time)||!oi||time>nowMs+10000||time<nowMs-PERIOD_MS*(LOOKBACK_BARS+3))continue;
  // Binance timestamp is the period close; candle timestamp is period open.
  const candle=candleMap.get(Math.floor((time-1)/PERIOD_MS)*PERIOD_MS);
  if(!candle)continue;
  result.push({time,oi,price:candle.price,high:candle.high,low:candle.low});
 }
 return result.sort((a,b)=>a.time-b.time).filter((p,i,a)=>!i||p.time>a[i-1].time);
}
function buildEstimate(openInterest,klines,nowMs){
 const points=normalizeInput(openInterest,klines,nowMs);
 if(points.length<24)return {available:false,reason:'ข้อมูล OI/แท่งเทียนที่จับคู่กันไม่พอ (ต้องมีอย่างน้อย 24 ช่วง)',points:points.length};
 const latest=points[points.length-1];
 if(nowMs-latest.time>MAX_AGE_MS)return {available:false,reason:'ข้อมูล OI ล่าช้าเกิน 15 นาที',points:points.length};
 const ref=latest.price;
 if(!(ref>0))return {available:false,reason:'ราคาอ้างอิงไม่ถูกต้อง'};
 const bins=320, min=ref*.8,max=ref*1.2,step=(max-min)/bins;
 const intensities={LONG:new Float64Array(bins),SHORT:new Float64Array(bins)};
 let active=0;
 // A rise in OI can suggest newly opened net contracts, but does NOT prove
 // entry at candle close nor that such positions remain open now.
 for(let i=1;i<points.length;i++){
  const prev=points[i-1],cur=points[i];
  if(cur.time-prev.time>PERIOD_MS*1.6)continue; // never invent missing windows
  const inc=cur.oi-prev.oi;
  if(!(inc>0))continue;
  const age=(nowMs-cur.time)/3600000;
  const discount=Math.exp(-Math.max(0,age)/5); // unverified position survival
  const input=inc*cur.price*discount; // proxy score, NOT liquidation notional
  if(!(input>0))continue;
  active++;
  for(const leverage of LEVERAGES){
   const offset=1/leverage;
   const longPrice=cur.price*(1-offset);
   const shortPrice=cur.price*(1+offset);
   // Maintenance margin is unknown. Use broad stress *zones*, never exact points.
   const sigma=Math.max(cur.price*.0018,cur.price*offset*.16);
   const spread=Math.ceil(2.5*sigma/step);
   for(const [side,level] of [['LONG',longPrice],['SHORT',shortPrice]]){
    const center=Math.floor((level-min)/step);
    if(center+spread<0||center-spread>=bins)continue;
    for(let b=Math.max(0,center-spread);b<=Math.min(bins-1,center+spread);b++){
     const d=((min+(b+.5)*step)-level)/sigma;
     intensities[side][b]+=(input/LEVERAGES.length)*Math.exp(-.5*d*d);
    }
   }
  }
 }
 if(active<8)return {available:false,reason:'ช่วงที่ OI เพิ่มขึ้นมีไม่พอสำหรับประเมินโซน',points:points.length,active};
 let peak=0;
 for(const side of ['LONG','SHORT'])for(const val of intensities[side])peak=Math.max(peak,val);
 if(!(peak>0))return {available:false,reason:'ไม่พบแรงกระจุกตามสมมติฐานในช่วงราคา',points:points.length};
 // No USD figures and no liquidation probabilities: only normalized relative intensity.
 const bands=[];
 for(const side of ['LONG','SHORT'])for(let i=0;i<bins;i++){
  const intensity=Math.sqrt(intensities[side][i]/peak);
  if(intensity>=.10)bands.push({side,price:min+(i+.5)*step,intensity});
 }
 const top=[];
 for(const band of [...bands].sort((a,b)=>b.intensity-a.intensity)){
  if(top.some(x=>x.side===band.side&&Math.abs(x.price-band.price)<ref*.003))continue;
  top.push(band);
  if(top.length===3)break;
 }
 return {available:true,bands,top,points:points.length,active,latestTime:latest.time,
  referencePrice:ref,leverageScenarios:LEVERAGES.slice(),binWidth:step,
  model:'OI delta / 5m close / equal LONG-SHORT / equal leverage scenarios / 5h survival assumption'};
}
function create({chart,series,canvas,toggle,status,symbol}){
 const ctx=canvas?.getContext('2d');
 const store='aris-estimated-liq-visible:'+symbol;
 let visible=true,current=null,loading=false,disposed=false,drawTimer=0,pollTimer=null,observer=null,lastError='';
 try{const saved=localStorage.getItem(store);if(saved!==null)visible=saved!=='0';}catch{}
 function updateStatus(){
  toggle?.setAttribute('aria-pressed',String(visible));
  toggle?.classList.toggle('is-active',visible);
  const b=toggle?.querySelector('b');if(b)b.textContent=visible?'เปิด':'ปิด';
  if(!status)return;
  if(!visible){status.textContent='แผนที่ประมาณการ: ปิด';return;}
  if(lastError){status.textContent=lastError;return;}
  if(!current){status.textContent='กำลังโหลด OI 5 นาทีจาก Binance…';return;}
  status.textContent=current.available?
   'ประมาณการเท่านั้น · OI '+current.points+' ช่วง · สมมติ 10/20/50/100× · ความเข้มสัมพัทธ์':
   'ไม่แสดงแถบ: '+current.reason;
 }
 async function json(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),9000);
  try{
   const response=await fetch(url,{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('Binance HTTP '+response.status);
   const result=await response.json();
   if(!Array.isArray(result)||result.code)throw new Error('Binance ไม่ส่งชุดข้อมูลที่ถูกต้อง');
   return result;
  }finally{clearTimeout(timeout);}
 }
 async function refresh(){
  if(loading||disposed)return;
  if(!/^[A-Z0-9]{2,18}USDT$/.test(symbol)){
   lastError='สัญลักษณ์นี้ยังไม่มีข้อมูล Futures Binance ที่ยืนยันได้';current=null;updateStatus();render();return;
  }
  loading=true;
  const base='https://fapi.binance.com';
  const query='?symbol='+encodeURIComponent(symbol);
  try{
   const [oi,klines]=await Promise.all([
    json(base+'/futures/data/openInterestHist'+query+'&period=5m&limit=150'),
    json(base+'/fapi/v1/klines'+query+'&interval=5m&limit=151')
   ]);
   if(disposed)return;
   current=buildEstimate(oi,klines,Date.now());
   lastError='';
  }catch(error){
   if(disposed)return;
   // Never keep an old model on chart as though it were current.
   current=null;
   lastError='ประมาณการไม่พร้อม · Binance Futures API ไม่ตอบสนอง ('+(error?.message||'เชื่อมต่อไม่สำเร็จ')+')';
  }finally{loading=false;updateStatus();render();}
 }
 function draw(){
  if(disposed||!ctx||!canvas)return;
  const box=canvas.getBoundingClientRect(),w=box.width,h=box.height;
  if(w<2||h<2)return;
  const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!visible||!current?.available)return;
  // 15-minute expiration prevents a disconnected tab showing a false live map.
  if(Date.now()-current.latestTime>MAX_AGE_MS){current=null;lastError='ข้อมูล OI เกิน 15 นาที · รออัปเดต';updateStatus();return;}
  const pane=chart.panes()[0]?.getHTMLElement();
  if(!pane)return;
  const p=pane.getBoundingClientRect(),top=Math.max(0,p.top-box.top),bottom=Math.min(h,p.bottom-box.top);
  const pw=Math.min(w,Math.max(0,chart.timeScale().width()));
  if(pw<20||bottom<=top)return;
  ctx.save();ctx.beginPath();ctx.rect(0,top,pw,bottom-top);ctx.clip();
  const binPx=Math.max(2,Math.abs((series.priceToCoordinate(current.referencePrice+current.binWidth)??0)-
   (series.priceToCoordinate(current.referencePrice)??0)));
  for(const band of current.bands){
   const y0=series.priceToCoordinate(band.price);
   if(!Number.isFinite(y0))continue;
   const y=top+y0;
   if(y<top-6||y>bottom+6)continue;
   const strong=band.intensity;
   const isYellow=strong>.63;
   const rgb=isYellow?'255,219,51':'144,91,230';
   const gradient=ctx.createLinearGradient(0,0,pw,0);
   const alpha=.02+strong*.23;
   gradient.addColorStop(0,'rgba('+rgb+',0.018)');
   gradient.addColorStop(.3,'rgba('+rgb+','+(alpha*.5).toFixed(3)+')');
   gradient.addColorStop(.85,'rgba('+rgb+','+alpha.toFixed(3)+')');
   gradient.addColorStop(1,'rgba('+rgb+','+(alpha*.7).toFixed(3)+')');
   ctx.fillStyle=gradient;
   ctx.fillRect(0,y-Math.max(2,binPx)/2,pw,Math.max(2,binPx));
  }
  const textLabels=[];
  for(const zone of current.top){
   const coord=series.priceToCoordinate(zone.price);
   if(!Number.isFinite(coord))continue;
   const y=top+coord;
   if(y<top+14||y>bottom-14||textLabels.some(z=>Math.abs(z-y)<20))continue;
   textLabels.push(y);
   const label='สมมติ '+zone.side+' · '+zone.price.toLocaleString('en-US',{maximumFractionDigits:2});
   ctx.font='600 10px Segoe UI,sans-serif';
   const width=ctx.measureText(label).width;
   const x=Math.max(3,pw-width-16);
   ctx.fillStyle='rgba(8,12,22,.9)';ctx.fillRect(x-4,y-18,width+10,15);
   ctx.fillStyle=zone.side==='LONG'?'#ffabc2':'#ffe982';ctx.fillText(label,x,y-7);
  }
  ctx.restore();
 }
 function render(){
  if(disposed||drawTimer)return;
  drawTimer=setTimeout(()=>{drawTimer=0;if(!disposed)requestAnimationFrame(draw);},120);
 }
 function setVisible(value){
  visible=!!value;
  try{localStorage.setItem(store,visible?'1':'0');}catch{}
  updateStatus();render();
  if(visible&&!current&&!loading)refresh();
 }
 toggle?.addEventListener('click',()=>setVisible(!visible));
 if(typeof ResizeObserver!=='undefined'&&canvas){observer=new ResizeObserver(render);observer.observe(canvas.parentElement);}
 pollTimer=setInterval(()=>{if(!document.hidden)refresh();},REFRESH_MS);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visible)refresh();});
 updateStatus();if(visible)refresh();
 return {render,refresh,setVisible,destroy(){disposed=true;clearInterval(pollTimer);clearTimeout(drawTimer);observer?.disconnect();}};
}
const api=Object.freeze({create,buildEstimate,normalizeInput,LEVERAGES,MAX_AGE_MS});
root.ArisEstimatedLiq=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
