/* Binance observed liquidation snapshots, not projected open-position liquidations. */
(function (root) {
  'use strict';
  const LOOKBACK_MS=3600000, MAX_SNAPSHOTS=2400;
  function clustersFromSnapshots(snapshots,now,referencePrice) {
    if (!(referencePrice>0) || !Number.isFinite(now)) return [];
    const step=Math.max(.01,referencePrice*.0004), groups=new Map();
    for(const e of Array.isArray(snapshots)?snapshots:[]) {
      if(!e||!Number.isFinite(e.ts)||e.ts<now-LOOKBACK_MS||e.ts>now+5000||
        !(e.price>0)||!(e.notional>0)||!Number.isFinite(e.price)||!Number.isFinite(e.notional)||
        !['LONG','SHORT'].includes(e.side))continue;
      const bucket=Math.round(e.price/step),key=e.side+':'+bucket;
      const x=groups.get(key)||{price:bucket*step,side:e.side,notional:0,count:0};
      x.notional+=e.notional;x.count++;groups.set(key,x);
    }
    return [...groups.values()].sort((a,b)=>b.notional-a.notional);
  }
  function create({chart,series,canvas,toggle,status,symbol}){
    const tape=[],ctx=canvas?.getContext('2d');
    let visible=true,scheduled=0,observer=null,disposed=false;
    const store='aris-observed-liq-visible:'+symbol;
    try{const old=localStorage.getItem(store);if(old!==null)visible=old!=='0';}catch{}
    function updateStatus(){
      toggle?.setAttribute('aria-pressed',String(visible));
      toggle?.classList.toggle('is-active',visible);
      const state=toggle?.querySelector('b');if(state)state.textContent=visible?'เปิด':'ปิด';
      if(status)status.textContent=!visible?'ซ่อนแผนที่':
        tape.length?'Binance · '+tape.length+' สแนปช็อตล้างพอร์ตแล้ว / 60 นาที':
        'รอเหตุการณ์ล้างพอร์ตจริงจาก Binance';
    }
    function draw(){
      if(disposed||!ctx||!canvas)return;
      const r=canvas.getBoundingClientRect(),w=r.width,h=r.height;
      if(w<2||h<2)return;
      const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
      const cw=Math.round(w*dpr),ch=Math.round(h*dpr);
      if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const now=Date.now();
      while(tape.length&&tape[0].ts<now-LOOKBACK_MS)tape.shift();
      updateStatus();
      if(!visible||!tape.length)return;
      const groups=clustersFromSnapshots(tape,now,tape[tape.length-1].price);
      if(!groups.length)return;
      const pw=Math.min(w,Math.max(0,chart.timeScale().width()));
      const pane=chart.panes()[0]?.getHTMLElement();
      if(!pane||pw<12)return;
      const pr=pane.getBoundingClientRect();
      const top=Math.max(0,pr.top-r.top),bottom=Math.min(h,pr.bottom-r.top);
      if(bottom<=top)return;
      const items=[];
      for(const g of groups){
        const localY=series.priceToCoordinate(g.price);
        if(!Number.isFinite(localY))continue;
        const y=top+localY;
        if(y>top+5&&y<bottom-5)items.push({...g,y});
        if(items.length>=80)break;
      }
      if(!items.length)return;
      const maximum=Math.max(1,groups[0].notional);
      ctx.save();ctx.beginPath();ctx.rect(0,top,pw,bottom-top);ctx.clip();
      for(const item of [...items].reverse()){
        const strength=Math.sqrt(item.notional/maximum);
        const rgb=strength>=.62?'255,218,54':'153,103,250';
        const alpha=.08+.24*strength;
        const fade=ctx.createLinearGradient(0,0,pw,0);
        fade.addColorStop(0,'rgba('+rgb+',0.015)');
        fade.addColorStop(.22,'rgba('+rgb+','+(alpha*.6).toFixed(3)+')');
        fade.addColorStop(.84,'rgba('+rgb+','+alpha.toFixed(3)+')');
        fade.addColorStop(1,'rgba('+rgb+','+(alpha*.7).toFixed(3)+')');
        ctx.fillStyle=fade;ctx.fillRect(0,item.y-(5+11*strength)/2,pw,5+11*strength);
        ctx.fillStyle=strength>=.62?'rgba(255,237,104,.48)':'rgba(178,139,248,.25)';
        ctx.fillRect(0,item.y-.5,pw,1);
      }
      const placed=[];
      function shortUSD(n){return n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(0);}
      for(const item of items){
        if(placed.length>=3)break;
        if(placed.some(y=>Math.abs(y-item.y)<20))continue;
        placed.push(item.y);
        const label=item.side+' LIQ · '+item.price.toLocaleString('en-US',{maximumFractionDigits:2})+' · '+shortUSD(item.notional);
        ctx.font='600 10px Segoe UI, sans-serif';
        const tx=ctx.measureText(label).width;
        const x=Math.max(6,pw-tx-17),y=Math.max(top+2,Math.min(bottom-19,item.y-17));
        ctx.fillStyle='rgba(9,14,24,.87)';ctx.fillRect(x-5,y,tx+11,16);
        ctx.fillStyle=item.side==='LONG'?'#ff9cad':'#ffe879';
        ctx.fillText(label,x,y+11);
      }
      ctx.restore();
    }
    function render(){
      if(disposed||scheduled)return;
      scheduled=setTimeout(()=>{scheduled=0;if(!disposed)requestAnimationFrame(draw);},110);
    }
    function add(e){
      if(disposed||!e||!Number.isFinite(e.ts)||!(e.price>0)||!(e.notional>0)||
        !Number.isFinite(e.price)||!Number.isFinite(e.notional)||!['LONG','SHORT'].includes(e.side))return;
      tape.push({ts:e.ts,price:e.price,notional:e.notional,side:e.side});
      if(tape.length>1&&tape[tape.length-2].ts>e.ts)tape.sort((a,b)=>a.ts-b.ts);
      const cutoff=Date.now()-LOOKBACK_MS;
      while(tape.length&&(tape[0].ts<cutoff||tape.length>MAX_SNAPSHOTS))tape.shift();
      render();
    }
    function setVisible(v){
      visible=!!v;try{localStorage.setItem(store,visible?'1':'0');}catch{}
      updateStatus();render();
    }
    toggle?.addEventListener('click',()=>setVisible(!visible));
    if(typeof ResizeObserver!=='undefined'){
      observer=new ResizeObserver(render);observer.observe(canvas.parentElement);
    }
    updateStatus();render();
    return{add,render,setVisible,destroy(){disposed=true;clearTimeout(scheduled);observer?.disconnect();}};
  }
  const api=Object.freeze({create,clustersFromSnapshots,LOOKBACK_MS});
  root.ArisLiquidationHeatmap=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
