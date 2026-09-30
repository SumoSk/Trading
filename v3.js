/* ARIS 3.0 — Episode-Gated Structure Engine
   Separate plugin. ARIS 2.0 remains untouched. */
(function(root){
'use strict';
const core=root.EventSignalV6;
if(!core||!core.Engine||!core.CFG||core.CFG.version!=='ARIS-3.0.0')return;

const BaseEngine=core.Engine,{CFG,features,zones,marketPhase}=core;
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const sign=(v,dead=0)=>v>dead?1:v<-dead?-1:0;
const dirLabel=d=>d>0?'HIGH':d<0?'LOW':'BALANCED';

function ema(a,n){let x=a[0]||0;return a.map(v=>(x+=2/(n+1)*(v-x)));}
function compactBars(bars,n=20){return (bars||[]).filter(q=>q.closed).slice(-n).map(q=>[q.time,q.open,q.high,q.low,q.close,q.volume]);}
function compactCandles(bars,a,n=8){return (bars||[]).slice(-n).map(q=>{const r=Math.max(q.high-q.low,1e-9),body=q.close-q.open;return {time:q.time,open:q.open,high:q.high,low:q.low,close:q.close,volume:q.volume,closed:!!q.closed,direction:body>0?'GREEN':body<0?'RED':'DOJI',bodyAtr:Math.abs(body)/a,rangeAtr:r/a,closeLocation:clip((q.close-q.low)/r,0,1),upperWickAtr:(q.high-Math.max(q.open,q.close))/a,lowerWickAtr:(Math.min(q.open,q.close)-q.low)/a};});}
function nearestZone(z,p,kind,a){
 const q=(z||[]).filter(v=>v.kind===kind).map(v=>({...v,distanceAtr:Math.abs(v.price-p)/Math.max(a,1e-9)})).sort((u,v)=>u.distanceAtr-v.distanceAtr)[0];
 return q?{price:q.price,distanceAtr:q.distanceAtr,touches:q.touches||0,confirmedAt:q.confirmedAt||null}:null;
}
function roomAtr(z,p,d,a){
 const q=(z||[]).filter(v=>d*(v.price-p)>0).map(v=>d*(v.price-p)/Math.max(a,1e-9)).filter(Number.isFinite).sort((u,v)=>u-v);
 return q.length?q[0]:Infinity;
}
function barMetric(q,a,p){
 const h=Math.max(q?.high??p,p),l=Math.min(q?.low??p,p),o=q?.open??p,c=p,r=Math.max(h-l,1e-9),body=c-o;
 return {d:Math.sign(body),bodyAtr:Math.abs(body)/Math.max(a,1e-9),rangeAtr:r/Math.max(a,1e-9),closeLoc:clip((c-l)/r,0,1),upper:(h-Math.max(o,c))/r,lower:(Math.min(o,c)-l)/r};
}
function higherRead(bars){
 const b=(bars||[]).filter(q=>q.closed).slice(-45);if(b.length<12)return {available:false,dir:0,eff:0,sep:0};
 const c=b.map(q=>q.close),e8=ema(c,8),e21=ema(c,21),path=c.slice(-11).slice(1).reduce((s,x,i)=>s+Math.abs(x-c.slice(-11)[i]),0),eff=path?Math.abs(c.at(-1)-c.at(-11))/path:0;
 let tr=0,n=0;for(let i=Math.max(1,b.length-14);i<b.length;i++){const q=b[i],p=b[i-1].close;tr+=Math.max(q.high-q.low,Math.abs(q.high-p),Math.abs(q.low-p));n++;}
 const a=Math.max(tr/Math.max(n,1),c.at(-1)*.00008,1e-9),sep=(e8.at(-1)-e21.at(-1))/a,dir=sign(sep,.10);
 return {available:true,dir,eff,sep};
}
function fibContext(f,p){
 const b=f.b.slice(-60);if(b.length<12)return {valid:false};
 let hi=-Infinity,lo=Infinity,hiI=-1,loI=-1;
 b.forEach((q,i)=>{if(q.high>hi){hi=q.high;hiI=i;}if(q.low<lo){lo=q.low;loI=i;}});
 const move=hi-lo;if(!(move>f.atr*.7))return {valid:false};
 const d=loI<hiI?1:-1,retr=d>0?(hi-p)/move:(p-lo)/move,ext=d>0?(p-lo)/move:(hi-p)/move;
 return {valid:true,d,high:hi,low:lo,moveAtr:move/f.atr,retracement:retr,extension:ext,healthy:retr>=.236&&retr<=.618,deep:retr>.618&&retr<=.786};
}
function swingKey(f,d){
 const b=f.b.slice(-35);let lastH=null,lastL=null;
 for(let i=2;i<b.length-2;i++){
  const q=b[i];
  if(q.high>=b[i-1].high&&q.high>=b[i-2].high&&q.high>=b[i+1].high&&q.high>=b[i+2].high)lastH={time:q.time,price:q.high};
  if(q.low<=b[i-1].low&&q.low<=b[i-2].low&&q.low<=b[i+1].low&&q.low<=b[i+2].low)lastL={time:q.time,price:q.low};
 }
 return d>0?'UP:'+(lastL?.time||0)+':'+(lastH?.time||0):'DN:'+(lastH?.time||0)+':'+(lastL?.time||0);
}
function contextBias(f,x,phase){
 const live=barMetric(x.current||x.bars?.at(-1)||f.b.at(-1),f.atr,x.price);
 const trend=clip((f.trend||0)/.8,-1,1),slope=clip((f.emaSlopeAtr||0)/.8,-1,1),mom=clip((f.mom||0)/1.2,-1,1),acc=clip((f.momAccel||0)/.8,-1,1),flow=clip(x.flow||0,-1,1),candle=clip(live.d*(live.bodyAtr*.55+Math.abs(live.closeLoc-.5)*.55),-1,1);
 const raw=clip(trend*.25+slope*.16+mom*.19+acc*.10+flow*.16+candle*.14,-1,1);
 const d=sign(raw,.08),high=Math.round(clip(50+raw*34,16,84)),low=100-high;
 return {raw,d,high,low,parts:{trend,slope,momentum:mom,acceleration:acc,flow,candle},live};
}
function stateRead(f,x,phase,bias){
 const d=bias.d||sign(f.trend,.08)||sign(f.mom,.12),a=Math.max(f.atr,1e-9),live=bias.live,pace=Math.max(f.relVolume||0,f.volume3Ratio||0,phase?.liveVolumePace||0);
 const shock=(live.bodyAtr>=.55||live.rangeAtr>=.8)&&pace>=1.35;
 const ext=d?d*(x.price-f.ema21)/a:Math.abs((x.price-f.ema21)/a);
 const prior=f.b.slice(-13,-1),hi=prior.length?Math.max(...prior.map(q=>q.high)):f.high,lo=prior.length?Math.min(...prior.map(q=>q.low)):f.low;
 const breakUp=x.price>=hi+a*(CFG.v3BreakBuffer||.06),breakDown=x.price<=lo-a*(CFG.v3BreakBuffer||.06);
 const breakout=breakUp?1:breakDown?-1:0;
 let state='TRANSITION';
 if(shock)state='SHOCK_UNRESOLVED';
 else if(breakout)state='BREAKOUT';
 else if(phase?.phase==='EXHAUSTION'||Math.abs((x.price-f.ema21)/a)>=CFG.v3ExhaustionExtension)state='REVERSAL_WATCH';
 else if(f.eff<=CFG.v3ChopEffMax&&f.sideCrosses>=1)state='CHOP';
 else if(f.eff>=CFG.v3TrendEffMin&&Math.abs(f.trend)>=.14)state='TREND';
 else if(f.rangePosition<=.28||f.rangePosition>=.72)state='RANGE_EDGE';
 return {state,d,pace,shock,ext,hi,lo,breakout};
}
function shockResolution(ep,f,x,bias){
 const s=ep?.shock;if(!s)return {state:'NONE',d:0};
 const a=Math.max(f.atr,1e-9),flow=s.d*(x.flow||0),same=s.d*(x.price-s.mid)/a,age=x.ts-s.startedAt;
 const micro=f.b.slice(-3),level=s.d>0?Math.max(...micro.map(q=>q.high)):Math.min(...micro.map(q=>q.low)),microBreak=s.d*(x.price-level)/a>=.015;
 if(age<CFG.v3ShockResolveMinMs)return {state:'UNRESOLVED',d:s.d};
 if(same>=.05&&flow>=CFG.v3MinFlow&&bias.live.d===s.d)return {state:'HOLD',d:s.d,microBreak};
 if(same<=-.08&&flow<=-CFG.v3ReverseFlow){
  const rd=-s.d,rlevel=rd>0?Math.max(...micro.map(q=>q.high)):Math.min(...micro.map(q=>q.low)),rbreak=rd*(x.price-rlevel)/a>=.015;
  if(rbreak)return {state:'FAIL',d:rd,microBreak:true};
 }
 if(Math.abs(same)<.10)return {state:'RETEST',d:s.d};
 return {state:'UNRESOLVED',d:s.d};
}
function episodeSeed(f,x,phase,state,bias){
 let d=state.breakout||bias.d||sign(f.trend,.10)||sign(f.mom,.12),family='TRANSITION';
 if(state.shock){family='SHOCK';d=bias.live.d||d;}
 else if(state.state==='BREAKOUT')family='BREAKOUT';
 else if(state.state==='TREND')family='TREND';
 else if(state.state==='REVERSAL_WATCH')family='REVERSAL';
 else if(['CHOP','RANGE_EDGE'].includes(state.state))family='RANGE';
 const key=swingKey(f,d||1);
 return {family,d,key};
}
function newEpisode(engine,seed,f,x,bias,state){
 const live=x.current||x.bars?.at(-1)||f.b.at(-1),a=Math.max(f.atr,1e-9);
 const shock=state.shock?{d:seed.d||bias.live.d||1,startedAt:x.ts,barTime:live?.time||0,high:live?.high??x.price,low:live?.low??x.price,mid:((live?.high??x.price)+(live?.low??x.price))/2,price:x.price,rangeAtr:bias.live.rangeAtr,pace:state.pace}:null;
 const ep={id:'V3E:'+engine.session+':'+x.ts+':'+seed.family+':'+(seed.d||0),family:seed.family,d:seed.d||0,legKey:seed.key,startedAt:x.ts,lastSeen:x.ts,anchorPrice:x.price,anchorAtr:a,extreme:x.price,pullbackSeen:false,issuedLegKeys:[],lastEntryAt:0,shock,state:state.state};
 engine.log('v3_episode_started',x.ts,{episodeId:ep.id,family:ep.family,direction:dirLabel(ep.d),legKey:ep.legKey,price:x.price});
 return ep;
}
function updateEpisode(engine,seed,f,x,bias,state,structureBreak){
 let ep=engine.v3Episode;
 if(!ep){ep=engine.v3Episode=newEpisode(engine,seed,f,x,bias,state);return ep;}
 const a=Math.max(f.atr,1e-9);ep.lastSeen=x.ts;ep.extreme=ep.d>0?Math.max(ep.extreme,x.price):ep.d<0?Math.min(ep.extreme,x.price):x.price;ep.state=state.state;
 if(ep.d&&ep.d*(ep.extreme-x.price)/a>=CFG.v3NewLegPullbackAtr)ep.pullbackSeen=true;
 const stale=x.ts-ep.startedAt>CFG.v3EpisodeMaxAgeMs&&x.ts-ep.lastEntryAt>60000;
 const directionalReset=seed.d&&ep.d&&seed.d!==ep.d&&structureBreak;
 const rangeToMove=ep.family==='RANGE'&&['BREAKOUT','SHOCK','TREND'].includes(seed.family);
 const newLeg=seed.d===ep.d&&seed.key!==ep.legKey&&ep.pullbackSeen&&Math.abs(x.price-ep.anchorPrice)/a>=CFG.v3NewLegMinMoveAtr;
 if(stale||directionalReset||rangeToMove||newLeg){
  engine.log('v3_episode_closed',x.ts,{episodeId:ep.id,reason:stale?'stale':directionalReset?'direction_reversal':rangeToMove?'range_to_direction':'new_structural_leg'});
  ep=engine.v3Episode=newEpisode(engine,seed,f,x,bias,state);return ep;
 }
 if(state.shock&&(!ep.shock||ep.shock.barTime!==(x.current||x.bars?.at(-1)||f.b.at(-1))?.time)){
  const live=x.current||x.bars?.at(-1)||f.b.at(-1);ep.family='SHOCK';ep.shock={d:bias.live.d||seed.d||ep.d||1,startedAt:x.ts,barTime:live?.time||0,high:live?.high??x.price,low:live?.low??x.price,mid:((live?.high??x.price)+(live?.low??x.price))/2,price:x.price,rangeAtr:bias.live.rangeAtr,pace:state.pace};
 }
 return ep;
}
function structureInfo(f,x,d,state,shock){
 const a=Math.max(f.atr,1e-9),micro=f.b.slice(-3),microLevel=d>0?Math.max(...micro.map(q=>q.high)):Math.min(...micro.map(q=>q.low)),microBreak=d*(x.price-microLevel)/a>=CFG.v3MicroBreakAtr;
 const trendAligned=d*(f.trend||0)>=.12,directionalEff=f.eff>=CFG.v3StructureEffMin;
 const breakoutAligned=state.breakout===d&&d*(x.price-(d>0?state.hi:state.lo))/a>=CFG.v3BreakBuffer;
 const shockHold=shock?.state==='HOLD'&&shock.d===d,shockFail=shock?.state==='FAIL'&&shock.d===d;
 const boss=(directionalEff&&trendAligned)||(breakoutAligned&&f.eff>=CFG.v3BreakoutEffMin)||shockHold||shockFail;
 return {pass:boss,microBreak,trendAligned,directionalEff,breakoutAligned,shockHold,shockFail,eff:f.eff,trend:f.trend,reason:boss?'โครงสร้างรองรับทิศ':'Structure boss gate ยังไม่ผ่าน'};
}
function locationInfo(f,x,z,d,playbook,higher,fib){
 const a=Math.max(f.atr,1e-9),room=roomAtr(z,x.price,d,a),ext=d*(x.price-f.ema21)/a,rangePos=f.rangePosition;
 const htfConflict=[higher.m5,higher.m15].filter(q=>q.available&&q.dir&&q.dir===-d&&q.eff>=.35).length;
 let pass=room>=CFG.v3MinRoomAtr&&ext<=CFG.v3HardExtension&&htfConflict<2;
 if(playbook==='confirmed_reversal')pass=(Math.abs((x.price-f.ema21)/a)>=CFG.v3ReversalMinExtension||fib?.deep||fib?.extension>=1.272)&&htfConflict<2;
 return {pass,room:Number.isFinite(room)?room:null,extension:ext,rangePosition:rangePos,htfConflict,fib,reason:pass?'ตำแหน่งราคาใช้ได้':room<CFG.v3MinRoomAtr?'พื้นที่ข้างหน้าแคบ':ext>CFG.v3HardExtension?'ราคายืดเกินเขตตาม':'Higher TF ขวางแรง'};
}
function behaviorInfo(f,x,d,playbook,state,shock){
 const live=barMetric(x.current||x.bars?.at(-1)||f.b.at(-1),f.atr,x.price),alignedClose=d>0?live.closeLoc:1-live.closeLoc;
 const recent=f.b.slice(-3),rejection=d>0?live.lower>=.30:live.upper>=.30;
 const pullbackSeen=recent.some(q=>d>0?q.low<=f.ema8+f.atr*.12:q.high>=f.ema8-f.atr*.12);
 const reclaim=d*(x.price-f.ema8)/f.atr>=-.02&&live.d===d;
 const breakoutAccept=state.breakout===d&&alignedClose>=CFG.v3BreakCloseMin&&(live.bodyAtr>=.18||live.rangeAtr>=.40);
 const shockOK=shock?.state==='HOLD'&&shock.d===d;
 const reversalOK=shock?.state==='FAIL'&&shock.d===d||(rejection&&live.d===d&&alignedClose>=.58);
 let pass=false;
 if(playbook==='breakout_continuation')pass=breakoutAccept;
 else if(playbook==='shock_resolution')pass=shockOK;
 else if(playbook==='pullback_reclaim')pass=pullbackSeen&&reclaim&&alignedClose>=.55;
 else if(playbook==='confirmed_reversal')pass=reversalOK;
 return {pass,live,pullbackSeen,reclaim,breakoutAccept,shockOK,reversalOK,reason:pass?'พฤติกรรมราคายืนยัน':'Behavior ยังไม่ยืนยัน'};
}
function microInfo(x,d){
 const flow=d*(x.flow||0),book=x.bookValid?d*(x.book||0):null,coverage=x.coverage||0;
 const flowPass=coverage>=CFG.v3FlowCoverageSec&&flow>=CFG.v3MinFlow;
 const strongFlow=coverage>=CFG.v3FlowCoverageSec&&flow>=CFG.v3StrongFlow;
 const bookAssist=x.bookValid&&book>=CFG.v3BookAssist;
 const pass=strongFlow||(flowPass&&(bookAssist||!x.bookValid||book>=-CFG.v3BookAgainstMax));
 return {pass,flow,book,coverage,flowPass,strongFlow,bookAssist,reason:pass?'Micro confirmation ผ่าน':coverage<CFG.v3FlowCoverageSec?'Flow coverage ยังไม่ครบ':'Flow/Book ยังไม่ยืนยัน'};
}
function choosePlaybook(f,x,state,ep,shock,bias){
 const d=shock?.state==='FAIL'?shock.d:state.breakout||ep?.d||bias.d;
 if(!d)return {playbook:null,d:0};
 if(shock?.state==='HOLD')return {playbook:'shock_resolution',d};
 if(shock?.state==='FAIL')return {playbook:'confirmed_reversal',d};
 if(state.breakout===d)return {playbook:'breakout_continuation',d};
 const recent=f.b.slice(-3),pullback=recent.some(q=>d>0?q.low<=f.ema8+f.atr*.12:q.high>=f.ema8-f.atr*.12)&&d*(x.price-f.ema8)/f.atr>=-.02;
 if(f.eff>=CFG.v3StructureEffMin&&d*(f.trend||0)>=.12&&pullback)return {playbook:'pullback_reclaim',d};
 const reversalDir=-(sign(f.trend,.12)||sign(f.emaSlopeAtr,.12));
 if(state.state==='REVERSAL_WATCH'&&reversalDir)return {playbook:'confirmed_reversal',d:reversalDir};
 return {playbook:null,d};
}
function playbookLabel(p){return ({breakout_continuation:'Breakout Continuation',shock_resolution:'Shock Resolution',pullback_reclaim:'Pullback / Reclaim',confirmed_reversal:'Confirmed Reversal'})[p]||'Observe only';}
function typeFor(p){return ({breakout_continuation:'v3_breakout_continuation',shock_resolution:'v3_shock_resolution',pullback_reclaim:'v3_pullback_reclaim',confirmed_reversal:'v3_confirmed_reversal'})[p]||'v3_observer';}
function gateBundle(f,x,z,playbook,d,state,shock){
 const higher={m5:higherRead(x.five),m15:higherRead(x.fifteen)},fib=fibContext(f,x.price);
 const structure=structureInfo(f,x,d,state,shock),location=locationInfo(f,x,z,d,playbook,higher,fib),behavior=behaviorInfo(f,x,d,playbook,state,shock),micro=microInfo(x,d);
 const gates={structure,location,behavior,micro};
 const pass=structure.pass&&location.pass&&behavior.pass&&micro.pass;
 const quality=Math.round(([structure.pass,location.pass,behavior.pass,micro.pass].filter(Boolean).length/4)*100);
 return {pass,quality,gates,higher,fib};
}
function shouldIssueInEpisode(ep,legKey){
 if(!ep)return false;
 return !(ep.issuedLegKeys||[]).includes(legKey);
}
function v3Story(f,x,phase,state,bias,ep,playbook,d,bundle,shock){
 const high=bias.high,low=bias.low,blocked=[];
 if(!playbook)blocked.push('ยังไม่มี playbook ที่อนุญาตเข้า');
 if(bundle&&!bundle.gates.structure.pass)blocked.push(bundle.gates.structure.reason);
 if(bundle&&!bundle.gates.location.pass)blocked.push(bundle.gates.location.reason);
 if(bundle&&!bundle.gates.behavior.pass)blocked.push(bundle.gates.behavior.reason);
 if(bundle&&!bundle.gates.micro.pass)blocked.push(bundle.gates.micro.reason);
 return {schema:'aris-v3-story-v1',state:state.state,stateLabel:state.state.replaceAll('_',' '),episodeId:ep?.id||null,episodeFamily:ep?.family||null,structuralLegKey:ep?.legKey||null,direction:dirLabel(d||bias.d),highEvidence:high,lowEvidence:low,playbook,playbookLabel:playbookLabel(playbook),shockState:shock?.state||null,quality:bundle?.quality||0,gates:bundle?.gates||null,higher:bundle?.higher||null,fib:bundle?.fib||null,blocked,summary:(ep?ep.family+' episode · ':'')+(playbook?playbookLabel(playbook):'Observe')+(blocked.length?' · รอ '+blocked[0]:' · gates ผ่านครบ')};
}

class V3Engine extends BaseEngine{
 constructor(saved={}){
  super(saved);
  const mem=saved.v3Memory&&typeof saved.v3Memory==='object'?saved.v3Memory:{};
  this.v3Episode=mem.episode||null;
  this.v3Candidate=null;
  this.v3LastSignal=null;
 }
 serialize(){
  const base=super.serialize();
  return {...base,v3Memory:{episode:this.v3Episode?JSON.parse(JSON.stringify(this.v3Episode)):null}};
 }
 reset(reason,time){
  this.v3Episode=null;this.v3Candidate=null;this.v3LastSignal=null;
  return super.reset(reason,time);
 }
 finalizeReview(sig){
  super.finalizeReview(sig);
  if(sig.version!=='ARIS-3.0.0'||!sig.dataset?.entry||!sig.dataset?.review)return;
  const e=sig.dataset.entry,obs=sig.dataset.v3Followup||[];
  const broken=obs.some(q=>q.structureBroken===true),flowFlip=obs.some(q=>q.flowFlipped===true);
  sig.dataset.review.v3={revision:e.arisRevision,episodeId:e.v3EpisodeId,playbook:e.v3Playbook,gates:e.v3Gates,observations:obs.length,structureBroken:broken,flowFlipped:flowFlip,causality:'post_entry_labels_only'};
  sig.dataset.review.summary+=' · V3 '+(e.v3Playbook||sig.type)+' · '+(broken?'พบ structure break หลังเข้า':'ไม่พบ structure break ในจุดที่บันทึก')+' · เป็น label หลังเข้า ไม่ใช้ย้อนกลับเป็น predictor';
 }
 step(x){
  const f=features(x.bars,x.price,x.horizonBars||10);
  if(!f)return {status:'warmup',reason:'ARIS V3 · รอแท่งสมบูรณ์อย่างน้อย 35 แท่ง',signal:null};
  if(!x.fresh||!Number.isFinite(x.price)||!Number.isFinite(x.ts)||x.price<=0){this.previous=null;this.v3Candidate=null;return this.lastView={f,status:'offline',signal:null,event:null,reason:'ARIS V3 · พักจน Futures สดและต่อเนื่อง'};}
  if(x.id===this.lastId)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  if(this.previous&&x.ts<=this.previous.ts)return {...(this.lastView||{}),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  const prev=this.previous;this.lastId=x.id;this.previous={price:x.price,ts:x.ts};
  const z=zones(x.bars||[],f.atr),regime=this.trackRegime(f,x.price),phase=marketPhase(f,x,regime);x.phase=phase;
  const bias=contextBias(f,x,phase),state=stateRead(f,x,phase,bias);
  const preSeed=episodeSeed(f,x,phase,state,bias),oldEp=this.v3Episode;
  const oldDir=oldEp?.d||preSeed.d||bias.d,oldMicro=f.b.slice(-3),oldLevel=oldDir>0?Math.min(...oldMicro.map(q=>q.low)):Math.max(...oldMicro.map(q=>q.high));
  const structureBreak=oldDir?oldDir*(x.price-oldLevel)/Math.max(f.atr,1e-9)<-CFG.v3EpisodeFlipAtr:false;
  const ep=updateEpisode(this,preSeed,f,x,bias,state,structureBreak),shock=shockResolution(ep,f,x,bias);
  if(shock?.state==='FAIL'&&shock.d&&ep.d!==shock.d){ep.d=shock.d;ep.family='REVERSAL';ep.legKey=swingKey(f,shock.d);ep.pullbackSeen=false;}
  const choice=choosePlaybook(f,x,state,ep,shock,bias),playbook=choice.playbook,d=choice.d;
  const bundle=playbook&&d?gateBundle(f,x,z,playbook,d,state,shock):null,story=v3Story(f,x,phase,state,bias,ep,playbook,d,bundle,shock);
  const viewPhase={...phase,v3View:{high:story.highEvidence,low:story.lowEvidence,direction:story.direction,risk:bundle&&!bundle.pass?'กลาง':'ต่ำตามเกณฑ์',reason:story.summary,story}};
  const base={f,z,regime:{...regime,v3State:story.state},phase:viewPhase,v3Story:story,signal:null,event:null,continuation:0,reversal:0};

  for(const sig of this.signals){
   if(sig.version!=='ARIS-3.0.0'||sig.result!=='pending'||!sig.dataset||x.ts>=sig.expiresAt)continue;
   const e=sig.dataset.entry||{},sd=sig.direction==='HIGH'?1:-1,rows=sig.dataset.v3Followup||(sig.dataset.v3Followup=[]),inv=e.v3InvalidationPrice;
   const structureBroken=Number.isFinite(inv)?sd*(x.price-inv)/Math.max(e.atr,1e-9)<-.08:null,flowFlipped=sd*(x.flow||0)<-CFG.v3ReverseFlow;
   const snap={ts:x.ts,price:x.price,episodeId:ep.id,state:story.state,playbook:story.playbook,structureBroken,flowFlipped};
   const last=rows.at(-1),changed=!last||last.state!==snap.state||last.playbook!==snap.playbook||last.structureBroken!==snap.structureBroken||last.flowFlipped!==snap.flowFlipped;
   if(changed&&(!last||x.ts-last.ts>=1000)){rows.push(snap);if(rows.length>120)rows.splice(1,1);}
  }

  if(!prev||x.ts-prev.ts>5000)return this.lastView={...base,status:'warming',reason:'ARIS V3 · กำลังสร้าง Episode จากข้อมูลสด'};
  const watchDir=d||ep.d||bias.d,watch={direction:watchDir?dirLabel(watchDir):null,d:watchDir,score:bundle?.quality||Math.round(Math.abs(bias.raw)*100),state:bundle?.pass?'READY':'WATCH',reasons:[story.stateLabel,story.playbookLabel,...story.blocked.slice(0,2)],reason:story.summary};
  base.watch=watch;

  if(!playbook||!d||!bundle){
   this.v3Candidate=null;
   return this.lastView={...base,status:'watch',reason:'ARIS V3 · '+story.summary,gate:{state:'WATCH',direction:watch.direction,code:'v3_observe',blocker:story.blocked[0]||'รอ episode ให้ชัด',waitingFor:story.blocked.length?story.blocked:['รอ Structure → Location → Behavior → Micro'],metrics:{episodeId:ep.id,quality:story.quality}}};
  }

  const invalidLevel=d>0?Math.min(...f.b.slice(-4).map(q=>q.low)):Math.max(...f.b.slice(-4).map(q=>q.high)),legKey=ep.legKey;
  if(!shouldIssueInEpisode(ep,legKey)){
   this.v3Candidate=null;
   return this.lastView={...base,status:'issued',reason:'ARIS V3 · Same Episode / Same Leg · ไม่ออกซ้ำจากเรื่องเดิม',gate:{state:'WAIT',direction:dirLabel(d),code:'v3_same_episode',blocker:'Episode นี้ออกไม้ใน structural leg นี้แล้ว',waitingFor:['รอ pullback/base และ structural leg ใหม่ หรือ episode ใหม่'],metrics:{episodeId:ep.id,legKey}}};
  }

  if(!bundle.pass){
   this.v3Candidate=null;
   return this.lastView={...base,status:story.quality>=75?'confirming':'tracking',reason:'ARIS V3 · '+story.summary,gate:{state:story.quality>=75?'READY':'WATCH',direction:dirLabel(d),code:'v3_independent_gates',blocker:story.blocked[0]||'Gate ยังไม่ครบ',waitingFor:story.blocked,metrics:{episodeId:ep.id,quality:story.quality,flow:bundle.gates.micro.flow,room:bundle.gates.location.room,extensionAtr:bundle.gates.location.extension,structurePassed:bundle.gates.structure.pass,locationPassed:bundle.gates.location.pass,behaviorPassed:bundle.gates.behavior.pass,microPassed:bundle.gates.micro.pass}}};
  }

  let cand=this.v3Candidate;
  const candidateKey=ep.id+':'+legKey+':'+playbook+':'+d;
  if(!cand||cand.key!==candidateKey){cand=this.v3Candidate={id:'V3C:'+this.session+':'+x.ts,key:candidateKey,episodeId:ep.id,legKey,playbook,d,startedAt:x.ts,evidenceSince:x.ts,ticks:1,logged:false,invalidationLevel:invalidLevel,stage:'CONFIRMING'};}
  else{cand.ticks++;if(!cand.evidenceSince)cand.evidenceSince=x.ts;cand.invalidationLevel=invalidLevel;}
  if(!cand.logged){cand.logged=true;this.log('detected',x.ts,{id:cand.id,candidateId:cand.id,episodeId:ep.id,legKey,setupType:typeFor(playbook),detectedAt:x.ts,direction:dirLabel(d),price:x.price,candidate:{schema:'aris-v3-candidate-v1',episodeId:ep.id,legKey,playbook,gates:bundle.gates}});}
  const confirmMs=x.expedite?250:CFG.v3ConfirmMs;
  if(cand.ticks<CFG.v3ConfirmTicks||x.ts-cand.evidenceSince<confirmMs)return this.lastView={...base,event:{...cand,type:typeFor(playbook)},status:'confirming',reason:'ARIS V3 · Gates ผ่าน · กำลังยืนยันข้อมูลสด',gate:{state:'READY',direction:dirLabel(d),code:'v3_live_confirm',blocker:'รอ live confirmation',waitingFor:['อย่างน้อย '+CFG.v3ConfirmTicks+' ครั้ง และ '+confirmMs+' ms'],metrics:{episodeId:ep.id,quality:100,flow:bundle.gates.micro.flow,room:bundle.gates.location.room,extensionAtr:bundle.gates.location.extension,structurePassed:true,locationPassed:true,behaviorPassed:true,microPassed:true}}};

  const out=dirLabel(d),id='ARIS3:'+this.session+':'+x.ts+':'+ep.id+':'+legKey,a=Math.max(f.atr,1e-9),entryLow=d>0?x.price-a*.10:x.price-a*.35,entryHigh=d>0?x.price+a*.35:x.price+a*.10;
  const signal={id,version:CFG.version,type:typeFor(playbook),direction:out,modelDirection:out,decisionPolicy:'aris_v3_episode_gate_entry',entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,result:'pending',lastObserved:x.ts,event:{...cand,type:typeFor(playbook)},
   features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,rangePosition:f.rangePosition,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,extensionAtr:d*(x.price-f.ema21)/a,v3State:story.state,v3Playbook:playbook,v3GateQuality:story.quality,v3EpisodeFamily:ep.family},
   dataset:{schema:'btc-t10-training-v2',episodeId:ep.id,episodeSequence:(ep.issuedLegKeys||[]).length+1,path1m:[],context1m:[],entry:{
    capturedAt:x.ts,price:x.price,outputDirection:out,modelDirection:out,decisionPolicy:'aris_v3_episode_gate_entry',decisionReason:story.summary,strategyVersion:CFG.version,setupType:typeFor(playbook),setupReason:story.summary,
    level:x.price,entryLow,entryHigh,atr:f.atr,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,
    rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,
    regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,phaseDir:phase.dir,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,closeLocation:f.closeLocation,
    liveVolumePace:phase.liveVolumePace,flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,progress:d*(x.price-(d>0?state.hi:state.lo))/a,
    zones:{nearestSupport:nearestZone(z,x.price,'support',a),nearestResistance:nearestZone(z,x.price,'resistance',a)},candleSequence:compactCandles(x.bars,a,8),prior1m:compactBars(x.bars,20),
    arisRevision:CFG.arisRevision,v3EpisodeId:ep.id,v3EpisodeFamily:ep.family,v3StructuralLegKey:legKey,v3Playbook:playbook,v3Gates:bundle.gates,v3GateQuality:story.quality,
    v3BossStructurePassed:true,v3Higher:bundle.higher,v3Fib:bundle.fib,v3ShockState:story.shockState,v3InvalidationPrice:invalidLevel,v3Trigger:playbookLabel(playbook)+' gates ผ่านครบ',v3ReasonNewEntry:(ep.issuedLegKeys||[]).length?'new structural leg':'first entry in episode'
   }},
   reason:'ARIS V3 · '+ep.family+' · '+playbookLabel(playbook)+' · Structure/Location/Behavior/Micro ผ่านครบ'};
  this.signals.push(signal);if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(q=>q.result!=='pending');if(i>=0)this.signals.splice(i,1);}
  ep.issuedLegKeys=[...(ep.issuedLegKeys||[]),legKey].slice(-8);ep.lastEntryAt=x.ts;ep.pullbackSeen=false;
  this.v3Candidate=null;this.v3LastSignal=signal;
  this.log('issued',x.ts,{id,episodeId:ep.id,legKey,revision:CFG.arisRevision,setupType:typeFor(playbook),direction:out,price:x.price,v3Playbook:playbook,v3GateQuality:100});
  return this.lastView={...base,event:{...cand,type:typeFor(playbook),issued:true},watch,status:'new',reason:signal.reason,signal,gate:{state:'ENTER',direction:out,code:'v3_enter',blocker:'ARIS V3 · Independent Gates ผ่านครบ',waitingFor:[],metrics:{episodeId:ep.id,legKey,quality:100,flow:bundle.gates.micro.flow,room:bundle.gates.location.room,extensionAtr:bundle.gates.location.extension,structurePassed:true,locationPassed:true,behaviorPassed:true,microPassed:true}}};
 }
}

core.Engine=V3Engine;

const priorAssess=root.ContinuousDirection?.assess;
if(root.ContinuousDirection){
 root.ContinuousDirection.assess=function(x){
  if(CFG.version!=='ARIS-3.0.0')return priorAssess?priorAssess(x):{available:false,reason:'Direction engine unavailable'};
  const q=x.phase?.v3View,f=x.features;if(!x.fresh||!q||!f)return {available:false,reason:x.reason||'ARIS V3 · กำลังสร้าง Market Episode'};
  const high=Math.round(q.high),low=Math.round(q.low),direction=Math.abs(high-low)<8?'BALANCED':high>low?'HIGH':'LOW',d=direction==='HIGH'?1:direction==='LOW'?-1:0;
  const room=d?roomAtr(x.zones||[],x.price,d,f.atr):null,extension=d?d*(x.price-f.ema21)/Math.max(f.atr,1e-9):0,risk=q.risk||'กลาง';
  return {available:true,high,low,direction,risk,riskScore:risk==='สูง'?4:risk==='กลาง'?2:0,referencePrice:x.price,referenceTime:x.ts,targetTime:x.ts+CFG.horizonMs,reason:'ARIS V3 · '+q.reason,parts:{episode:q.story?.episodeFamily,state:q.story?.state,playbook:q.story?.playbook,flow:x.flow||0},weights:null,regime:x.regime?.v3State||x.regime?.mode||'TRANSITION',coverage:x.coverage||0,room:Number.isFinite(room)?room:null,extension,retreat:0,v3Story:q.story};
 };
}

root.ArisV3Engine={version:'ARIS-3.0.0',revision:CFG.arisRevision,contextBias,stateRead,episodeSeed,gateBundle,shockResolution,choosePlaybook};
})(typeof globalThis!=='undefined'?globalThis:window);
