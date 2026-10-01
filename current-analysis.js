'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
  const finite=v=>Number.isFinite(Number(v));
  const num=(v,d=2)=>finite(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const pct=v=>finite(v)?Math.round(Number(v))+'%':'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const sign=v=>v>.08?1:v<-.08?-1:0;
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const median=a=>{if(!a.length)return 0;const x=[...a].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;};
  const money=v=>finite(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const gateThai=v=>({PASS:'ผ่าน',DEVELOPING:'กำลังก่อตัว',BLOCK:'ไม่ผ่าน',READY:'พร้อม',BLOCKED:'ติดเงื่อนไข',OBSERVE:'เฝ้าดู',WATCH:'จับตา',WAIT:'รอ',ENTER:'เข้าได้'})[v]||v||'—';
  const dirThai=v=>v==='HIGH'?'สูงกว่า':v==='LOW'?'ต่ำกว่า':v==='BALANCED'?'ใกล้เคียงกัน':v||'—';
  const episodeThai=v=>({RANGE:'กรอบราคา',TREND:'เทรนด์',BREAKOUT:'การทะลุกรอบ',SHOCK:'แรงกระแทก',REVERSAL:'การกลับตัว',TRANSITION:'ช่วงเปลี่ยนจังหวะ'})[v]||v||'—';

  function ema(values,period){
    if(!values.length)return [];
    const k=2/(period+1),out=[];let x=values[0];
    for(let i=0;i<values.length;i++){x=i?values[i]*k+x*(1-k):values[i];out.push(x);}
    return out;
  }
  function atr(bars,period=14){
    if(bars.length<2)return 0;
    const tr=[];
    for(let i=1;i<bars.length;i++){
      const b=bars[i],p=bars[i-1].close;
      tr.push(Math.max(b.high-b.low,Math.abs(b.high-p),Math.abs(b.low-p)));
    }
    return mean(tr.slice(-period));
  }
  function relVolume(bars){
    const closed=bars.filter(b=>b.closed!==false),last=closed.at(-1);
    if(!last)return 0;
    const base=closed.slice(-21,-1).map(b=>Number(b.volume)||0).filter(v=>v>0);
    const med=median(base)||mean(base)||1;
    return (Number(last.volume)||0)/Math.max(med,1e-9);
  }
  function pivots(bars){
    const highs=[],lows=[];
    for(let i=2;i<bars.length-2;i++){
      const b=bars[i];
      if(b.high>=bars[i-1].high&&b.high>=bars[i-2].high&&b.high>=bars[i+1].high&&b.high>=bars[i+2].high)highs.push({price:b.high,time:b.time,index:i});
      if(b.low<=bars[i-1].low&&b.low<=bars[i-2].low&&b.low<=bars[i+1].low&&b.low<=bars[i+2].low)lows.push({price:b.low,time:b.time,index:i});
    }
    return {highs,lows};
  }
  function nearestLevels(snap,bars,price){
    const pv=pivots(bars.slice(-120)),zones=(snap.zones||[]).map(z=>({price:Number(z.price),kind:z.kind||'',source:z.source||'engine'})).filter(z=>finite(z.price));
    const candidates=[
      ...pv.highs.slice(-10).map(x=>({...x,kind:'resistance',source:'swing'})),
      ...pv.lows.slice(-10).map(x=>({...x,kind:'support',source:'swing'})),
      ...zones
    ];
    const supports=candidates.filter(x=>x.price<price).sort((a,b)=>b.price-a.price);
    const resistances=candidates.filter(x=>x.price>price).sort((a,b)=>a.price-b.price);
    return {support:supports[0]||null,support2:supports[1]||null,resistance:resistances[0]||null,resistance2:resistances[1]||null,pv};
  }
  function structureRead(bars,pv){
    const hs=pv.highs.slice(-2),ls=pv.lows.slice(-2);
    const highTag=hs.length<2?'—':hs[1].price>hs[0].price?'HH':hs[1].price<hs[0].price?'LH':'EH';
    const lowTag=ls.length<2?'—':ls[1].price>ls[0].price?'HL':ls[1].price<ls[0].price?'LL':'EL';
    let bias=0;
    if(highTag==='HH')bias+=.5;if(highTag==='LH')bias-=.5;if(lowTag==='HL')bias+=.5;if(lowTag==='LL')bias-=.5;
    return {highTag,lowTag,bias:clip(bias,-1,1),text:highTag+' / '+lowTag};
  }
  function fibRead(bars,price){
    const recent=bars.slice(-60);
    if(recent.length<12)return null;
    let hi=-Infinity,lo=Infinity,hiI=-1,loI=-1;
    recent.forEach((b,i)=>{if(b.high>hi){hi=b.high;hiI=i;}if(b.low<lo){lo=b.low;loI=i;}});
    const range=hi-lo;if(!(range>0))return null;
    const up=loI<hiI,levels={};
    for(const r of [.236,.382,.5,.618,.786]){
      levels[String(r)]=up?hi-range*r:lo+range*r;
    }
    const retrace=up?(hi-price)/range:(price-lo)/range;
    const ext1272=up?lo+range*1.272:hi-range*1.272;
    const ext1618=up?lo+range*1.618:hi-range*1.618;
    return {direction:up?'UP':'DOWN',low:lo,high:hi,retrace,levels,ext1272,ext1618};
  }
  function candleFlowScore(bars,a){
    const rows=bars.slice(-5),base=Math.max(a,1e-9);
    if(!rows.length)return 0;
    let s=0,w=0;
    rows.forEach((b,i)=>{
      const range=Math.max(b.high-b.low,1e-9),body=b.close-b.open,closeLoc=(b.close-b.low)/range;
      const local=clip(body/base,-1,1)*.65+clip((closeLoc-.5)*2,-1,1)*.35;
      const k=i+1;s+=local*k;w+=k;
    });
    return w?s/w:0;
  }
  function marketState(ctx){
    const {bars,price,a,ema8,ema21,score,relVol,rangePosition}=ctx;
    const recent=bars.slice(-21),prior=bars.slice(-21,-1);
    const hi=Math.max(...prior.map(b=>b.high)),lo=Math.min(...prior.map(b=>b.low));
    const efficiency=recent.length>2?Math.abs(recent.at(-1).close-recent[0].open)/Math.max(recent.slice(1).reduce((s,b,i)=>s+Math.abs(b.close-recent[i].close),0),a*.1):0;
    const sep=Math.abs(ema8-ema21)/Math.max(a,1e-9);
    const extension=(price-ema21)/Math.max(a,1e-9);
    const breakoutUp=price>hi+a*.08,breakoutDown=price<lo-a*.08;
    const rangeWidth=(Math.max(...recent.map(b=>b.high))-Math.min(...recent.map(b=>b.low)))/Math.max(a,1e-9);
    let key='TRANSITION',label='กำลังเปลี่ยนจังหวะ';
    if(Math.abs(extension)>2.1&&relVol>1.05){key='EXHAUSTION';label='ปลายขา / ยืดจากฐาน';}
    else if(breakoutUp||breakoutDown){key='BREAKOUT';label='กำลังทะลุกรอบ';}
    else if(efficiency>.42&&sep>.28&&Math.abs(score)>.18){key='TREND';label='เทรนด์มีโครงสร้าง';}
    else if(rangeWidth<4.2&&efficiency<.24){key='COMPRESSION';label='บีบตัว / สะสมแรง';}
    else if(efficiency<.26){key='SIDEWAY';label='แกว่งในกรอบ';}
    return {key,label,efficiency,sep,extension,rangeWidth,breakoutUp,breakoutDown,rangePosition};
  }
  function playbookRead(ctx){
    const {state,score,price,ema8,ema21,a,rangePosition,levels,candleScore,relVol}=ctx;
    const d=sign(score)||sign(price-ema21)||1;
    let name='เฝ้าช่วงเปลี่ยนจังหวะ',checks=[];
    if(state.key==='BREAKOUT'){
      name='ทะลุกรอบ / กลับมาทดสอบ';
      checks=[
        ['ทะลุกรอบแล้ว',true],['ปริมาณซื้อขายขยาย',relVol>=1.1],['แท่งปิดหนุนทิศ',d*candleScore>.12],['มีพื้นที่ก่อนชนแนวถัดไป',d>0?!levels.resistance||levels.resistance.price-price>.45*a:!levels.support||price-levels.support.price>.45*a]
      ];
    }else if(state.key==='TREND'){
      const nearBase=Math.abs(price-ema8)<=.65*a||Math.abs(price-ema21)<=.65*a;
      name=nearBase?'ย่อในเทรนด์':'เทรนด์ไปต่อ';
      checks=[['EMA เรียงตามทิศ',d*(ema8-ema21)>0],['แรงส่งตามเทรนด์',d*score>.18],['ราคาไม่ยืดจากฐานเกินไป',Math.abs(state.extension)<1.8],['แท่งล่าสุดสนับสนุน',d*candleScore>.05]];
    }else if(['SIDEWAY','COMPRESSION'].includes(state.key)){
      name=rangePosition<.28||rangePosition>.72?'เฝ้าสวนจากขอบกรอบ':'เฝ้ากรอบ / การทะลุกรอบ';
      checks=[['อยู่ใกล้ขอบกรอบ',rangePosition<.28||rangePosition>.72],['มีการปฏิเสธราคาจากขอบ',Math.abs(candleScore)>.18],['แรงซื้อขายเริ่มเลือกทิศ',Math.abs(ctx.flowScore)>.12],['ปริมาณซื้อขายเริ่มเพิ่ม',relVol>=1]];
    }else if(state.key==='EXHAUSTION'){
      name='เฝ้าปลายขา / กลับตัว';
      checks=[['ราคายืดจากฐาน',Math.abs(state.extension)>1.8],['แท่งเริ่มสวนขาเดิม',d*candleScore<-.08],['แรงส่งชะลอ',Math.abs(ctx.momentumScore)<.45],['มีแนวสำคัญใกล้ราคา',!!levels.support||!!levels.resistance]];
    }else{
      name='เฝ้าการเปลี่ยนโครงสร้าง';
      checks=[['โครงสร้างเริ่มเลือกทิศ',Math.abs(ctx.structureScore)>.2],['EMA เริ่มแยก',state.sep>.16],['แรงส่งเริ่มชัด',Math.abs(ctx.momentumScore)>.2],['แรงซื้อขายสนับสนุน',Math.abs(ctx.flowScore)>.1]];
    }
    const done=checks.filter(x=>x[1]).length,readiness=Math.round(done/checks.length*100);
    return {name,readiness,checks};
  }
  function buildAnalysis(snap){
    if(!snap||!snap.quote||!Array.isArray(snap.bars)||snap.bars.length<25)return {ok:false,reason:'ข้อมูลแท่งยังไม่พอสำหรับวิเคราะห์สถานการณ์'};
    const bars=snap.bars.filter(b=>finite(b.open)&&finite(b.high)&&finite(b.low)&&finite(b.close)).slice(-180);
    const price=Number(snap.quote.price),a=atr(bars),closes=bars.map(b=>Number(b.close)),e8=ema(closes,8),e21=ema(closes,21),ema8=e8.at(-1),ema21=e21.at(-1);
    if(!(a>0)&&!finite(ema8))return {ok:false,reason:'ATR / EMA ยังไม่พร้อม'};
    const levels=nearestLevels(snap,bars,price),structure=structureRead(bars,levels.pv),fib=fibRead(bars,price),rv=relVolume(bars);
    const last20=bars.slice(-20),rHi=Math.max(...last20.map(b=>b.high)),rLo=Math.min(...last20.map(b=>b.low)),rangePosition=clip((price-rLo)/Math.max(rHi-rLo,a*.1),0,1);
    const trendScore=clip(((ema8-ema21)/Math.max(a,1e-9))/.75,-1,1);
    const slopeScore=e8.length>4?clip(((e8.at(-1)-e8.at(-5))/4)/Math.max(a,1e-9)*4,-1,1):0;
    const mom3=closes.length>4?(price-closes.at(-4))/Math.max(a,1e-9):0,mom10=closes.length>11?(price-closes.at(-11))/Math.max(a,1e-9):0;
    const momentumScore=clip(mom3*.35+mom10*.12,-1,1);
    const structureScore=structure.bias;
    const candleScore=snap.candle?.available?(snap.candle.direction==='HIGH'?1:snap.candle.direction==='LOW'?-1:0)*clip((Number(snap.candle.confidence)||50)/100,0,1):candleFlowScore(bars,a);
    const flowScore=clip(Number(snap.flow?.composite)||0,-1,1);
    const bookScore=snap.book?.usable?clip(Number(snap.book.composite)||0,-1,1):0;
    const recent3=bars.slice(-3),volDir=recent3.length?clip(recent3.reduce((s,b)=>s+Math.sign(b.close-b.open)*(Number(b.volume)||0),0)/Math.max(recent3.reduce((s,b)=>s+(Number(b.volume)||0),0),1),-1,1):0;
    const volumeScore=clip(volDir*Math.min(rv,2)/2,-1,1);
    const score=clip(trendScore*.22+slopeScore*.12+momentumScore*.17+structureScore*.12+candleScore*.14+flowScore*.13+bookScore*.04+volumeScore*.06,-1,1);
    const high=Math.round(clip(50+score*32,18,82)),low=100-high;
    const state=marketState({bars,price,a,ema8,ema21,score,relVol:rv,rangePosition});
    const confidence=Math.round(clip(Math.abs(score)*100,0,100));
    const direction=Math.abs(score)<.12?'BALANCED':score>0?'HIGH':'LOW';
    const components=[
      ['เทรนด์',trendScore,.22],['ความชัน EMA',slopeScore,.12],['แรงส่ง',momentumScore,.17],['โครงสร้าง',structureScore,.12],
      ['แท่งเทียน',candleScore,.14],['แรงซื้อขาย',flowScore,.13],['สมุดคำสั่ง',bookScore,.04],['ปริมาณซื้อขาย',volumeScore,.06]
    ].map(([name,value,weight])=>({name,value,weight,contribution:value*weight}));
    const d=direction==='BALANCED'?(score>=0?1:-1):(direction==='HIGH'?1:-1);
    const context={snap,bars,price,a,ema8,ema21,score,direction,high,low,confidence,state,rangePosition,relVol:rv,levels,structure,fib,candleScore,flowScore,bookScore,momentumScore,structureScore,components};
    const playbook=playbookRead(context);
    const trendStrength=Math.abs(score),ext=Math.abs(state.extension),contra=Math.max(0,-d*candleScore)+Math.max(0,-d*flowScore);
    let cont=.34+trendStrength*.28+state.efficiency*.13+(state.key==='BREAKOUT'?.09:0)-(ext>1.8?.12:0);
    let pull=.33+Math.min(ext,2.5)*.075+(state.key==='TREND'?.06:0)+(state.key==='EXHAUSTION'?.05:0);
    let fail=.33+(1-trendStrength)*.12+contra*.14+(state.key==='SIDEWAY'?.08:0);
    if(direction==='BALANCED'){cont=.31+Math.max(0,score)*.15;pull=.38+(state.key==='SIDEWAY'||state.key==='COMPRESSION'?.1:0);fail=.31+Math.max(0,-score)*.15;}
    const sum=Math.max(cont+pull+fail,.01),wA=Math.round(cont/sum*100),wB=Math.round(pull/sum*100),wC=100-wA-wB;
    const projected=Math.max(a*1.6,a*Math.sqrt(10)*.62);
    const nearestForward=d>0?levels.resistance:levels.support,nearestBack=d>0?levels.support:levels.resistance;
    const contTarget=nearestForward?.price??price+d*projected;
    const pullA=price-d*a*.35,pullB=price-d*a*.75;
    const invalid=nearestBack?.price??price-d*a*1.05;
    const failTarget=d>0?(levels.support2?.price??price-a*projected):(levels.resistance2?.price??price+a*projected);
    const side=d>0?'ขึ้น':'ลง',opp=d>0?'ลง':'ขึ้น';
    let scenarios;
    if(direction==='BALANCED'){
      scenarios=[
        {key:'A',weight:wA,title:'เลือกทางขึ้น',text:'ถ้าราคายืนเหนือกรอบบนพร้อมปริมาณและแรงซื้อ มีโอกาสเปลี่ยนจากสมดุลเป็นฝั่งสูงกว่า',target:levels.resistance?.price??price+a*1.2},
        {key:'B',weight:wB,title:'แกว่งสะสมต่อ',text:'หลักฐานยังสูสี มีโอกาสใช้เวลาในกรอบและสลับแท่งขึ้นลงก่อนเลือกทาง',target:null},
        {key:'C',weight:wC,title:'เลือกทางลง',text:'ถ้าหลุดกรอบล่างและปิดต่ำพร้อมแรงขาย มีโอกาสเปลี่ยนจากสมดุลเป็นฝั่งต่ำกว่า',target:levels.support?.price??price-a*1.2}
      ];
    }else{
      scenarios=[
        {key:'A',weight:wA,title:'ไปต่อฝั่ง'+side,text:'โครงสร้างหลักยังเอียง'+side+' ถ้ารักษาแรงส่งและผ่านแนวข้างหน้าได้',target:contTarget},
        {key:'B',weight:wB,title:'ย่อก่อนแล้วไปต่อ',text:'ราคาอาจถอยประมาณ 0.35–0.75 ATR เพื่อสร้างฐานก่อนกลับตามมุมมองหลัก',zone:[Math.min(pullA,pullB),Math.max(pullA,pullB)]},
        {key:'C',weight:wC,title:'โครงสร้างเสีย / สวน'+opp,text:'ถ้าหลุดจุดยกเลิกพร้อมแรงซื้อขายและแท่งปิดสวน ภาพหลักจะอ่อนลงและต้องประเมินใหม่',trigger:invalid,target:failTarget}
      ];
    }
    const watch=[];
    if(levels.resistance)watch.push('ปิดเหนือ '+money(levels.resistance.price)+' พร้อมปริมาณซื้อขายเพิ่ม → น้ำหนักฝั่งขึ้นแข็งขึ้น');
    if(levels.support)watch.push('ปิดต่ำกว่า '+money(levels.support.price)+' พร้อมแรงขาย → น้ำหนักฝั่งลงแข็งขึ้น');
    watch.push((d>0?'ถ้าลำตัวแท่งเขียว':'ถ้าลำตัวแท่งแดง')+' ขยายต่อและไส้ฝั่งตรงข้ามสั้นลง → โอกาสไปต่อดีขึ้น');
    if(Math.abs(flowScore)<.12)watch.push('แรงซื้อขายยังเกือบกลาง ถ้าเริ่มเกิน ±0.12 ต่อเนื่อง จะเป็นข้อมูลเลือกทิศที่สำคัญ');
    if(rv<.9)watch.push('ปริมาณซื้อขายยังต่ำกว่าฐาน การทะลุกรอบตอนนี้ต้องระวังหลอกมากกว่าปกติ');
    const supportTxt=levels.support?money(levels.support.price):'ยังไม่มีแนวใกล้',resistTxt=levels.resistance?money(levels.resistance.price):'ยังไม่มีแนวใกล้';
    const summary=direction==='BALANCED'
      ?'ตอนนี้หลักฐานสองฝั่งยังใกล้กัน ตลาดยังไม่ได้ให้ความได้เปรียบชัด จุดสำคัญคือรอดูว่าราคาจะออกจากกรอบพร้อมปริมาณและแรงซื้อขายจริงหรือไม่ ก่อนให้น้ำหนักกับทิศใดทิศหนึ่งมากขึ้น'
      :'ตอนนี้ภาพรวมเอียง'+side+'จาก '+state.label+' โดยน้ำหนักหลักฐานสูงกว่า/ต่ำกว่าอยู่ที่ '+high+'/'+low+' แต่ค่านี้เป็นน้ำหนักจากข้อมูลปัจจุบัน ไม่ใช่อัตราชนะ จุดที่ต้องจับตาคือแนวรับ '+supportTxt+' และแนวต้าน '+resistTxt+'; ถ้าโครงสร้างหลุดฝั่งตรงข้ามควรยกเลิกมุมมองเดิมและประเมินใหม่';
    return {...context,ok:true,playbook,scenarios,watch,summary,projected,v3:snap.v3||null};
  }

  function horizonText(ms){
    const min=Math.round(ms/60000);
    if(min<60)return min+' นาที';
    if(min<1440)return (min/60).toFixed(min%60?1:0)+' ชั่วโมง';
    if(min<10080)return (min/1440).toFixed(min%1440?1:0)+' วัน';
    return (min/10080).toFixed(1)+' สัปดาห์';
  }
  function freshnessText(snap){
    if(!snap)return 'ไม่มีข้อมูล';
    if(!snap.fresh)return snap.health?.label||'ข้อมูลยังไม่สด';
    return 'ข้อมูลสด · '+(snap.source||'Futures');
  }
  function sideClass(v){return v>0?'up':v<0?'down':'neutral';}
  function sideWord(v){return v>.08?'หนุนฝั่งสูงกว่า':v<-.08?'หนุนฝั่งต่ำกว่า':'กลาง';}
  function componentRows(rows){
    return rows.map(x=>'<div class="sit-metric-row"><span>'+esc(x.name)+'</span><b class="'+sideClass(x.value)+'">'+esc(sideWord(x.value))+'</b><small>'+num(x.value,2)+'</small></div>').join('');
  }
  function ensureStyles(){
    if($('situation-analysis-style'))return;
    const s=document.createElement('style');s.id='situation-analysis-style';s.textContent=`
      .situation-analysis-open{height:36px!important;min-height:36px!important;max-height:36px!important;width:96px;flex:0 0 96px;padding:0 8px;border:1px solid #355b58!important;border-radius:10px!important;background:#122522!important;color:#a9e0d5!important;font:600 8.5px 'Segoe UI',sans-serif;white-space:nowrap}
      .situation-analysis-open:hover{border-color:#4d867f!important;background:#19332f!important;color:#d5fff6!important}
      .market-symbol-control{height:36px;min-height:36px;max-height:36px;width:112px;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:3px 4px 3px 8px;border:1px solid #3a4e69;border-radius:10px;background:#101a28;color:#7f92aa;white-space:nowrap;flex:0 0 112px;box-sizing:border-box}
      .market-symbol-control span{font:600 7px 'Segoe UI',sans-serif;letter-spacing:.35px;color:#72869f}
      .market-symbol-control select{height:28px;min-height:28px;width:76px;padding:0 20px 0 7px;border:0;border-radius:7px;background:#172334;color:#dce6f2;font:650 9px 'Segoe UI',sans-serif;outline:none;cursor:pointer}
      .market-symbol-control select:focus{box-shadow:0 0 0 1px #4d867f}
      @media(max-width:700px){.situation-analysis-open{width:72px;flex-basis:72px;padding:0 4px;font-size:7.5px}.market-symbol-control{width:78px;flex-basis:78px;padding-left:4px}.market-symbol-control span{display:none}.market-symbol-control select{width:68px;min-width:68px;padding-left:5px;padding-right:16px;font-size:8px}}
      @media(max-width:430px){.situation-analysis-open{width:44px;flex-basis:44px;padding:0 2px;font-size:6.3px}.market-symbol-control{width:54px;flex-basis:54px;padding:2px}.market-symbol-control select{width:48px;min-width:48px;padding-left:3px;padding-right:13px;font-size:6.8px}}
      #situation-analysis-dialog{width:min(1020px,calc(100vw - 18px));max-height:92vh;padding:0;border:1px solid #33465b;border-radius:14px;background:#0a121c;color:#d8e3ef;box-shadow:0 24px 80px #000b}
      #situation-analysis-dialog::backdrop{background:#02060bc8;backdrop-filter:blur(3px)}
      .sit-shell{display:grid;grid-template-rows:auto 1fr;max-height:92vh}.sit-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:15px 17px;border-bottom:1px solid #263649;background:#0e1824}
      .sit-head h2{margin:2px 0 3px;font:600 18px 'Segoe UI',sans-serif}.sit-kicker{font-size:7px;letter-spacing:.8px;color:#65b4a8;font-weight:700}.sit-head-meta{font-size:8px;color:#7f92aa}
      .sit-head-actions{display:flex;gap:7px}.sit-refresh,.sit-close{min-height:30px;border-radius:7px;border:1px solid #33465b;background:#111e2b;color:#b5c4d6;font-size:8px}.sit-refresh{padding:0 11px;border-color:#416e68;color:#b8e8df}.sit-close{width:30px;padding:0;font-size:16px}
      .sit-body{overflow:auto;padding:14px 16px 20px;display:grid;gap:10px}.sit-alert{padding:10px 12px;border:1px solid #6b4e2f;border-radius:9px;background:#211a12;color:#e7c694;font-size:8px}
      .sit-hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(220px,.65fr);gap:10px}.sit-card{border:1px solid #223347;border-radius:12px;background:#0d1722;padding:13px;min-width:0}
      .sit-card h3{margin:0 0 9px;font-size:11px;font-weight:600;color:#dbe5f0}.sit-bias-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.sit-bias-word{font-size:30px;font-weight:650;letter-spacing:-.8px}.sit-bias-word.high,.up{color:#78d2bf}.sit-bias-word.low,.down{color:#e38aa0}.sit-bias-word.balanced,.neutral{color:#9aacc1}
      .sit-state{text-align:right}.sit-state b{display:block;font-size:12px}.sit-state small{font-size:7px;color:#7e91a8}.sit-prob{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.sit-prob div{padding:9px;border-radius:9px;background:#101d29;border:1px solid #24364a}.sit-prob span{display:block;font-size:7px;color:#8093aa}.sit-prob b{font-size:18px}
      .sit-track{height:6px;margin-top:9px;border-radius:99px;background:#311d27;overflow:hidden}.sit-track i{display:block;height:100%;background:#397c72}.sit-note{margin-top:7px;font-size:7px;color:#71859c}.sit-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.sit-kpi{padding:9px;border:1px solid #24354a;border-radius:9px;background:#0b141e}.sit-kpi span{font-size:7px;color:#7c8fa6;display:block}.sit-kpi b{font-size:11px;display:block;margin-top:3px}
      .sit-scenarios{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sit-scenario{border:1px solid #24354a;border-radius:10px;padding:11px;background:#0b151f}.sit-scenario-head{display:flex;justify-content:space-between;gap:8px}.sit-scenario-head span{font-size:7px;color:#71859b}.sit-scenario-head b{font-size:16px}.sit-scenario h4{margin:7px 0 5px;font-size:10px}.sit-scenario p{margin:0;color:#8da0b6;font-size:8px;line-height:1.5}.sit-scenario small{display:block;margin-top:7px;color:#b7c4d3;font-size:7px}
      .sit-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sit-list{display:grid;gap:6px}.sit-line{display:flex;justify-content:space-between;gap:10px;padding-bottom:6px;border-bottom:1px solid #1d2b3b;font-size:8px}.sit-line:last-child{border-bottom:0;padding-bottom:0}.sit-line span{color:#8093aa}.sit-line b{text-align:right;font-weight:550}
      .sit-metric-row{display:grid;grid-template-columns:1fr 92px 44px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #1d2b3b;font-size:8px}.sit-metric-row:last-child{border-bottom:0}.sit-metric-row small{text-align:right;color:#75889e}
      .sit-playbook-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.sit-playbook-top b{font-size:12px}.sit-ready{font-size:18px;color:#b6c6d9}.sit-checks{margin-top:9px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.sit-check{padding:7px 8px;border-radius:8px;background:#0b141e;border:1px solid #223246;font-size:8px;color:#8799ae}.sit-check.ok{border-color:#2f5d56;color:#a9dcd2}
      .sit-watch{margin:0;padding-left:18px;color:#a9b8ca;font-size:8px;line-height:1.65}.sit-summary{padding:13px;border:1px solid #31534f;border-radius:11px;background:#10201f}.sit-summary h3{margin:0 0 6px;font-size:10px;color:#b7e4dc}.sit-summary p{margin:0;font-size:9px;line-height:1.65;color:#c4d1df}
      .sit-details{border-top:1px solid #1f3041;padding-top:9px}.sit-details summary{cursor:pointer;color:#788da5;font-size:8px}.sit-raw{margin-top:9px;display:grid;gap:10px}.sit-raw pre{margin:0;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;padding:10px;border-radius:8px;background:#081019;color:#8297af;font:7px/1.45 Consolas,monospace}
      @media(max-width:760px){.sit-hero,.sit-grid-2{grid-template-columns:1fr}.sit-scenarios{grid-template-columns:1fr}.sit-checks{grid-template-columns:1fr}.sit-body{padding:10px}.sit-head{padding:12px}.sit-bias-word{font-size:25px}}
    `;document.head.append(s);
  }
  function ensureDialog(){
    if($('situation-analysis-dialog'))return $('situation-analysis-dialog');
    const d=document.createElement('dialog');d.id='situation-analysis-dialog';
    d.innerHTML='<div class="sit-shell"><header class="sit-head"><div><span class="sit-kicker">LIVE SITUATION</span><h2>วิเคราะห์ตอนนี้</h2><div class="sit-head-meta" id="sit-head-meta">รอข้อมูล</div></div><div class="sit-head-actions"><button class="sit-refresh" id="sit-refresh" type="button">วิเคราะห์ใหม่</button><button class="sit-close" id="sit-close" type="button">×</button></div></header><div class="sit-body" id="sit-body"></div></div>';
    document.body.append(d);$('sit-close').addEventListener('click',()=>d.close());$('sit-refresh').addEventListener('click',renderNow);d.addEventListener('click',e=>{if(e.target===d)d.close();});return d;
  }
  function ensureMarketSelector(anchor){
    let wrap=$('market-symbol-control');if(wrap)return wrap;
    if(!anchor)return null;
    const STORE='aris-active-symbol-v1',markets=[
      ['BTCUSDT','BTC'],['XAUUSDT','XAU'],['SKHYUSDT','SKHY'],['AMDUSDT','AMD'],['INTCUSDT','INTEL'],['NVDAUSDT','NVDA'],['OPENAIUSDT','OPENAI']
    ];
    wrap=document.createElement('label');wrap.id='market-symbol-control';wrap.className='market-symbol-control';wrap.title='เปลี่ยนกราฟและตลาดที่ระบบวิเคราะห์';
    const cap=document.createElement('span');cap.textContent='กราฟ';
    const select=document.createElement('select');select.id='market-symbol-select';select.setAttribute('aria-label','เลือกตลาด USDT Futures');
    let active='BTCUSDT';try{active=localStorage.getItem(STORE)||'BTCUSDT';}catch{}
    for(const [value,label] of markets){const o=document.createElement('option');o.value=value;o.textContent=label;o.selected=value===active;select.append(o);}
    select.addEventListener('change',()=>{
      const next=select.value;
      if(!markets.some(([v])=>v===next))return;
      select.disabled=true;
      try{localStorage.setItem(STORE,next);}catch{}
      location.reload();
    });
    wrap.append(cap,select);anchor.insertAdjacentElement('afterend',wrap);return wrap;
  }
  function ensureButton(){
    const toolbar=$('chart-toolbar'),indicator=$('indicator-toggle'),drawing=$('drawing-tools');
    if(!toolbar)return null;
    let b=$('situation-analysis-open');
    if(!b){
      b=document.createElement('button');b.id='situation-analysis-open';b.className='situation-analysis-open';b.type='button';b.textContent='วิเคราะห์ตอนนี้';b.title='วิเคราะห์สถานการณ์กราฟปัจจุบัน 10 แท่งข้างหน้า';
      b.addEventListener('click',()=>{const d=ensureDialog();renderNow();if(!d.open)d.showModal();});
    }
    const anchor=indicator||toolbar.querySelector('.analysis-tf-control:last-of-type');
    if(anchor)anchor.insertAdjacentElement('afterend',b);else if(drawing)toolbar.insertBefore(b,drawing);else toolbar.append(b);
    const selector=ensureMarketSelector(b);
    if(selector&&selector.parentElement!==toolbar)b.insertAdjacentElement('afterend',selector);
    return b;
  }
  function renderError(reason,snap){
    $('sit-head-meta').textContent=snap?(snap.symbol+' · '+snap.tf+' · 10 แท่ง'):'รอข้อมูล';
    $('sit-body').innerHTML='<div class="sit-alert">'+esc(reason)+'</div>';
  }
  function renderNow(){
    const snap=globalThis.LiveAnalysisBridgeV1?.snapshot?.();
    const a=buildAnalysis(snap);
    if(!a.ok){renderError(a.reason,snap);return;}
    const captured=new Date(snap.capturedAt).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    $('sit-head-meta').textContent=snap.symbol+' · '+snap.tf+' · 10 แท่ง ≈ '+horizonText(snap.horizonMs)+' · '+captured;
    const biasCls=a.direction==='HIGH'?'high':a.direction==='LOW'?'low':'balanced';
    const stateMeta='ประสิทธิภาพการเดินราคา '+num(a.state.efficiency,2)+' · ความกว้างกรอบ '+num(a.state.rangeWidth,1)+' ATR';
    const scenarios=a.scenarios.map(s=>'<article class="sit-scenario"><div class="sit-scenario-head"><span>สถานการณ์ '+s.key+'</span><b>'+s.weight+'%</b></div><h4>'+esc(s.title)+'</h4><p>'+esc(s.text)+'</p>'+(s.zone?'<small>โซน '+money(s.zone[0])+' – '+money(s.zone[1])+'</small>':s.trigger?'<small>จุดยกเลิก '+money(s.trigger)+(s.target?' · เป้าถัดไป '+money(s.target):'')+'</small>':s.target?'<small>โซนทดสอบ '+money(s.target)+'</small>':'')+'</article>').join('');
    const fib=a.fib;
    const fibHtml=fib?'<div class="sit-list"><div class="sit-line"><span>Leg</span><b>'+fib.direction+' · '+money(fib.low)+' → '+money(fib.high)+'</b></div><div class="sit-line"><span>ระยะย่อปัจจุบัน</span><b>'+num(fib.retrace*100,1)+'%</b></div><div class="sit-line"><span>38.2 / 50 / 61.8</span><b>'+money(fib.levels['0.382'])+' / '+money(fib.levels['0.5'])+' / '+money(fib.levels['0.618'])+'</b></div><div class="sit-line"><span>เป้าขยาย 1.272 / 1.618</span><b>'+money(fib.ext1272)+' / '+money(fib.ext1618)+'</b></div></div>':'<div class="sit-note">ยังไม่มีขาสวิงที่เหมาะสมพอสำหรับฟิโบนัชชี</div>';
    const candle=snap.candle;
    const candleHtml='<div class="sit-list"><div class="sit-line"><span>ทิศแท่ง</span><b>'+esc(candle?.available?(candle.direction+' · '+(candle.confidence||0)+'%'):'ยังไม่พร้อม')+'</b></div><div class="sit-line"><span>ความหมาย</span><b>'+esc(candle?.plainMeaning||'อ่านจากลำตัวแท่ง ไส้เทียน และตำแหน่งปิดต่อเนื่อง')+'</b></div><div class="sit-line"><span>แพตเทิร์น</span><b>'+esc((candle?.patterns||[]).map(x=>x.name).slice(0,3).join(' · ')||'ยังไม่มีชื่อแพตเทิร์นเด่น')+'</b></div><div class="sit-line"><span>เงื่อนไขเปลี่ยน</span><b>'+esc(candle?.changeTrigger||'รอแท่งใหม่ยืนยัน')+'</b></div></div>';
    const checks=a.playbook.checks.map(x=>'<div class="sit-check '+(x[1]?'ok':'')+'">'+(x[1]?'✓ ':'○ ')+esc(x[0])+'</div>').join('');
    const health=!snap.fresh?'<div class="sit-alert">'+esc(freshnessText(snap))+' — รายงานยังแสดงโครงสร้างล่าสุดได้ แต่ไม่ควรใช้ส่วนแรงซื้อขายระยะสั้นเป็นข้อมูลสด</div>':'';
    const bookTxt=snap.book?.usable?sideWord(snap.book.composite)+' · '+num(snap.book.composite,2):'ยังใช้ไม่ได้';
    const liq=snap.liquidation||{};
    const v3=a.v3;
    const v3Html=v3&&snap.engineVersion==='ARIS-3.0.0'
      ?'<section class="sit-card"><h3>มุมมองจาก ARIS 3.0</h3><div class="sit-list">'+
       '<div class="sit-line"><span>สถานะตลาด</span><b>'+esc(v3.stateLabel||v3.state||'—')+'</b></div>'+
       '<div class="sit-line"><span>แผนปัจจุบัน</span><b>'+esc(v3.playbookLabel||'เฝ้าดูตลาด')+'</b></div>'+
       '<div class="sit-line"><span>ทิศของเครื่องยนต์</span><b>'+esc(dirThai(v3.direction))+' · '+esc(String(v3.highEvidence??'—'))+'/'+esc(String(v3.lowEvidence??'—'))+'</b></div>'+
       '<div class="sit-line"><span>เหตุการณ์ตลาด</span><b>'+esc(episodeThai(v3.episodeFamily))+(v3.shockLabel?' · '+esc(v3.shockLabel):'')+'</b></div>'+
       '</div><p class="sit-note">'+esc(v3.stateDescription||v3.episodeDescription||'')+'</p>'+
       '<div class="sit-checks">'+Object.entries(v3.gates||{}).map(([k,g])=>'<div class="sit-check '+(g?.state==='PASS'?'ok':'')+'">'+esc(({structure:'โครงสร้าง',location:'ตำแหน่งราคา',behavior:'พฤติกรรมราคา',micro:'แรงซื้อขายระยะสั้น'})[k]||k)+' · '+esc(gateThai(g?.state))+(g?.reason?' · '+esc(g.reason):'')+'</div>').join('')+'</div>'+
       '<div class="sit-list" style="margin-top:8px"><div class="sit-line"><span>มุมมอง</span><b>'+esc(v3.thesis?.why||'—')+'</b></div><div class="sit-line"><span>รอเงื่อนไข</span><b>'+esc(v3.trigger||v3.thesis?.trigger||'—')+'</b></div><div class="sit-line"><span>ยกเลิกเมื่อ</span><b>'+esc(v3.invalidation||v3.thesis?.invalidation||'—')+'</b></div><div class="sit-line"><span>แผนต่อไป</span><b>'+esc(v3.nextPlan||v3.thesis?.nextPlan||'—')+'</b></div></div></section>'
      :'';
    $('sit-body').innerHTML=health+
      '<section class="sit-hero"><div class="sit-card"><div class="sit-bias-top"><div><div class="sit-bias-word '+biasCls+'">'+a.direction+'</div><div class="sit-note">ความชัดของหลักฐาน '+a.confidence+' / 100</div></div><div class="sit-state"><b>'+esc(a.state.label)+'</b><small>'+esc(stateMeta)+'</small></div></div><div class="sit-prob"><div><span>น้ำหนัก HIGH</span><b class="up">'+a.high+'%</b></div><div><span>น้ำหนัก LOW</span><b class="down">'+a.low+'%</b></div></div><div class="sit-track"><i style="width:'+a.high+'%"></i></div><div class="sit-note">เป็นน้ำหนักหลักฐานจากสถานการณ์ปัจจุบัน ไม่ใช่อัตราชนะหรือความน่าจะเป็นที่ผ่านการปรับเทียบ</div></div>'+
      '<div class="sit-card"><h3>ภาพเร็ว</h3><div class="sit-kpis"><div class="sit-kpi"><span>ราคา</span><b>'+money(a.price)+'</b></div><div class="sit-kpi"><span>ATR</span><b>'+money(a.a)+'</b></div><div class="sit-kpi"><span>ตำแหน่งในกรอบ</span><b>'+Math.round(a.rangePosition*100)+'%</b></div><div class="sit-kpi"><span>ปริมาณซื้อขาย</span><b>'+num(a.relVol,2)+'×</b></div><div class="sit-kpi"><span>โครงสร้าง</span><b>'+a.structure.text+'</b></div><div class="sit-kpi"><span>ข้อมูล</span><b>'+esc(snap.fresh?'สด':'ไม่สด')+'</b></div></div></div></section>'+v3Html+
      '<section class="sit-card"><h3>อีก 10 แท่ง · '+esc(horizonText(snap.horizonMs))+'</h3><div class="sit-scenarios">'+scenarios+'</div><div class="sit-note">เปอร์เซ็นต์สถานการณ์เป็นสัดส่วนน้ำหนักเชิงสถานการณ์ของโมเดลนี้ และจะเปลี่ยนเมื่อโครงสร้าง แท่งเทียน หรือแรงซื้อขายเปลี่ยน</div></section>'+
      '<div class="sit-grid-2"><section class="sit-card"><h3>โครงสร้างราคา</h3><div class="sit-list"><div class="sit-line"><span>โครงสร้างจุดสวิง</span><b>'+a.structure.text+'</b></div><div class="sit-line"><span>แนวรับใกล้สุด</span><b>'+money(a.levels.support?.price)+'</b></div><div class="sit-line"><span>แนวต้านใกล้สุด</span><b>'+money(a.levels.resistance?.price)+'</b></div><div class="sit-line"><span>EMA 8 / 21</span><b>'+money(a.ema8)+' / '+money(a.ema21)+'</b></div><div class="sit-line"><span>ระยะยืดจาก EMA21</span><b>'+num(a.state.extension,2)+' ATR</b></div><div class="sit-line"><span>ประสิทธิภาพการเดินราคา</span><b>'+num(a.state.efficiency,2)+'</b></div></div></section><section class="sit-card"><h3>แท่งเทียน</h3>'+candleHtml+'</section></div>'+
      '<div class="sit-grid-2"><section class="sit-card"><h3>แรงส่ง / ปริมาณ / แรงซื้อขาย</h3>'+componentRows(a.components)+'<div class="sit-list" style="margin-top:8px"><div class="sit-line"><span>แรงซื้อขาย 15 / 60 วินาที</span><b>'+num(snap.flow?.['15s'],2)+' / '+num(snap.flow?.['60s'],2)+'</b></div><div class="sit-line"><span>สมุดคำสั่ง</span><b>'+esc(bookTxt)+'</b></div><div class="sit-line"><span>ส่วนต่างราคา</span><b>'+num(snap.book?.spreadBps,2)+' bps</b></div><div class="sit-line"><span>การล้างสถานะ 60 / 180 วินาที</span><b>'+num(liq.signed60s,0)+' / '+num(liq.signed180s,0)+'</b></div></div></section><section class="sit-card"><h3>ฟิโบนัชชี</h3>'+fibHtml+'</section></div>'+
      '<section class="sit-card"><div class="sit-playbook-top"><div><h3 style="margin-bottom:3px">แผนตอนนี้</h3><b>'+esc(a.playbook.name)+'</b></div><div class="sit-ready">'+a.playbook.readiness+'%</div></div><div class="sit-note">ความพร้อม = จำนวนเงื่อนไขของรูปแบบปัจจุบันที่ผ่าน ไม่ใช่อัตราชนะ</div><div class="sit-checks">'+checks+'</div></section>'+
      '<section class="sit-card"><h3>สิ่งที่ต้องเฝ้าดูในแท่งถัดไป</h3><ul class="sit-watch">'+a.watch.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></section>'+
      '<section class="sit-summary"><h3>บทสรุป</h3><p>'+esc(a.summary)+'</p></section>'+
      '<details class="sit-details"><summary>ดูข้อมูลทั้งหมด / ค่าดิบ</summary><div class="sit-raw"><div class="sit-grid-2"><section class="sit-card"><h3>บริบทเครื่องยนต์ปัจจุบัน</h3><div class="sit-list"><div class="sit-line"><span>เครื่องยนต์</span><b>'+esc(snap.engineVersion)+'</b></div><div class="sit-line"><span>ช่วงตลาดของเครื่องยนต์</span><b>'+esc(snap.phase?.phase||'—')+'</b></div><div class="sit-line"><span>โหมดตลาดของเครื่องยนต์</span><b>'+esc(snap.regime?.mode||'—')+'</b></div><div class="sit-line"><span>บริบททิศทางสด</span><b>'+esc(snap.direction?.available?(snap.direction.direction+' · '+snap.direction.high+'/'+snap.direction.low):'—')+'</b></div><div class="sit-line"><span>จังหวะจากเครื่องยนต์</span><b>'+esc(snap.setup?.event?.type||snap.setup?.watch?.label||snap.setup?.status||'—')+'</b></div></div></section><section class="sit-card"><h3>คุณภาพข้อมูล</h3><div class="sit-list"><div class="sit-line"><span>แหล่งข้อมูล</span><b>'+esc(snap.source)+'</b></div><div class="sit-line"><span>สด / ต่อเนื่อง</span><b>'+String(!!snap.fresh)+' / '+String(!!snap.continuous)+'</b></div><div class="sit-line"><span>ช่วงเวลาที่มีข้อมูลแรงซื้อขาย</span><b>'+num(snap.flow?.coverageSeconds,0)+'s</b></div><div class="sit-line"><span>อายุข้อมูลสมุดคำสั่ง</span><b>'+num(snap.book?.ageSeconds,2)+'s</b></div></div></section></div><pre>'+esc(JSON.stringify({features:snap.features,phase:snap.phase,regime:snap.regime,direction:snap.direction,candle:snap.candle,setup:snap.setup,flow:snap.flow,book:snap.book,liquidation:snap.liquidation},null,2))+'</pre></div></details>';
  }
  function init(){
    if(!globalThis.LiveAnalysisBridgeV1){console.warn('Situation Analysis: LiveAnalysisBridgeV1 missing');return;}
    ensureStyles();ensureDialog();
    const b=ensureButton();
    if(!b){
      let tries=0;const timer=setInterval(()=>{tries++;if(ensureButton()||tries>20)clearInterval(timer);},250);
    }
  }
  globalThis.SituationAnalysisV1={schema:'situation-analysis-v1',init,analyze:()=>buildAnalysis(globalThis.LiveAnalysisBridgeV1?.snapshot?.()),render:renderNow};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();