(function(root){
'use strict';
const $=id=>document.getElementById(id),number=x=>Number.isFinite(x)?x.toLocaleString(undefined,{maximumFractionDigits:3}):'—';
let degree='Working',visible=true,last=null,initialized=false;
try{degree=localStorage.getItem('aris-elliott-degree')||'Working';}catch{}
if(!['Micro','Working','Structural'].includes(degree))degree='Working';
const direction=d=>d>0?'ขึ้น':d<0?'ลง':'ยังไม่ชัด';
const patterns={IMPULSE:'Impulse',DIAGONAL_CANDIDATE:'Diagonal Candidate',ZIGZAG:'Zigzag',FLAT:'Flat',TRIANGLE:'Triangle'};
function render(out,version){
 const panel=$('elliott-panel');if(!panel)return;
 panel.hidden=version!=='ARIS-3.3.0';if(panel.hidden)return;
 if(!initialized){
  initialized=true;$('elliott-degree').value=degree;
  $('elliott-degree').addEventListener('change',e=>{degree=e.target.value;try{localStorage.setItem('aris-elliott-degree',degree);}catch{}render(last,'ARIS-3.3.0');document.dispatchEvent(new Event('elliott-redraw'));});
  $('elliott-export').addEventListener('click',()=>document.dispatchEvent(new Event('elliott-export')));
 }
 last=out;$('elliott-degree-title').textContent=degree.toUpperCase();
 const selection=out?.degrees?.[degree],c=selection?.preferred,alt=selection?.alternate,unknown=selection?.unknown||out?.unknown;
 const state=root.ArisV33?.STATE_TH||{},unknownText=root.ArisV33?.UNKNOWN_TH||{};
 if(!c){$('elliott-current').textContent=unknownText[unknown]||'กำลังรวบรวมโครงสร้างคลื่น';for(const id of ['elliott-next','elliott-target','elliott-risk'])$(id).textContent='';$('elliott-detail').textContent=out?.error?'ส่วนวิเคราะห์คลื่นมีข้อผิดพลาด · จุดเข้าเดิมยังทำงาน':'ข้อมูลยังไม่พอสำหรับนับคลื่น';return;}
 const frozen=degree==='Working'&&out?.box?.candidateKey===c.key&&out.box.currentState===c.state?out.box:null;
 const n=frozen||c.next,confirmed=c.state==='CONFIRMED_COMPLETE'&&!unknown;
 $('elliott-current').textContent=(confirmed?'ยืนยันแล้ว ':'สมมติฐาน ')+'Wave '+c.currentWave+(confirmed?' ':'? ')+direction(c.currentDirection)+' · '+(state[c.state]||c.state)+(unknown?' · '+(unknownText[unknown]||'ยังไม่ชัด'):'');
 $('elliott-next').textContent=(confirmed?'ถัดไป ':'ถ้าสมมติฐานนี้ถูก → ')+'Wave '+n.wave+' '+direction(n.direction)+' · Wave Score '+c.score+'/100';
 $('elliott-target').textContent=n.projectionReady
  ?(confirmed?'โซน ':'โซนสมมติฐาน ')+number(n.targetLow)+'–'+number(n.targetHigh)+' · '+n.fromBars+'–'+n.toBars+' แท่ง'+(out?.seconds?' ('+(n.fromBars*out.seconds/60)+'–'+(n.toBars*out.seconds/60)+' นาที)':'')+(frozen?' · เวลานับจากสร้างกล่อง':'')
  :'เป้าหมายยังไม่ยืนยัน · Wave Fib '+number(n.fibOnlyTarget?.low)+'–'+number(n.fibOnlyTarget?.high)+' รอ confluence เพิ่ม';
 $('elliott-risk').textContent=(confirmed?'Trigger ':'ระดับอ้างอิงสมมติฐาน · Trigger ')+(n.trigger.direction>0?'ยืนเหนือ ':'ยืนใต้ ')+number(n.trigger.price)+' · ยกเลิกเมื่อ'+(n.invalidationDirection>0?'ต่ำกว่า ':'สูงกว่า ')+number(n.invalidation);
 const detail=$('elliott-detail');detail.replaceChildren();
 const rows=['สถานะการนับ: '+(confirmed?'ยืนยันแล้วจากโครงสร้างย่อย':'ยังเป็นสมมติฐาน · ห้ามอ่านเหมือน Wave ที่ยืนยันแล้ว'),'ประเภท: '+(c.category==='MOTIVE'?'Motive':'Corrective'),'Pattern: '+(patterns[c.pattern]||c.pattern)+(c.variant?' · '+c.variant:''),'ลักษณะ: '+(c.personality?.notes?.join(' · ')||'รอตรวจแรงและโครงสร้างย่อย'),
 'คลื่นย่อย: ผ่าน '+c.subwaves.validLegs+'/'+c.subwaves.totalLegs+' ขา · '+(c.subwaves.state==='VALID'?'ตรวจ subdivision ผ่าน':'ยังยืนยัน pattern ไม่ครบ'),
 'Parent: '+(c.parentWave?c.parentWave.degree+' Wave '+c.parentWave.wave:'ยังเชื่อมโครงสร้างใหญ่ไม่ได้'),
 'Alternate: '+(alt?(patterns[alt.pattern]||alt.pattern)+' '+alt.currentWave+' → '+alt.next.wave+' '+direction(alt.next.direction)+' · '+alt.score+'/100':'ยังไม่มี count สำรองที่ผ่านกฎ'),
 'Wave Fib: '+n.waveFib.sourceWave+' → '+n.waveFib.targetWave+' · ฐาน '+number(n.waveFib.projectionBase),
 'แหล่งเป้า: '+(n.primary?.sources?.join(' + ')||'ยังไม่มี independent confluence · ไม่เปิด Prediction Box'),
 'กล่อง: '+(out?.box?.state||'ยังไม่เปิด prediction เพราะ count ไม่ชัด'),
 'ประวัติ '+(out?.historyBars||0)+' แท่ง · Audit '+(out?.auditCount||0)+' · EXPERIMENTAL: คะแนนไม่ใช่โอกาสชนะ'];
 if(c.correctionGeometry){const g=c.correctionGeometry;rows.push('ABC geometry: B retrace '+number(g.bRetrace*100)+'%'+(Number.isFinite(g.cLengthRatio)?' · C/A '+number(g.cLengthRatio*100)+'%':'')+(g.variant?' · '+g.variant:''));}
 if(unknown==='MULTIPLE_COUNTS_CLOSE'&&selection?.consensus?.count>=2&&selection.consensus.agreement===1)rows.push('Count ยังไม่ชัด แต่ '+selection.consensus.count+' สมมติฐานที่ยืนยันเห็นทิศถัดไป'+direction(selection.consensus.direction)+'เหมือนกัน');
 if(c.extension)rows.push('พบ Wave 3 ยืด · ตรวจคลื่นย่อยก่อนถือว่าคลื่นใหญ่จบ');if(c.truncated)rows.push('Wave 5 ไม่ทำ extreme ใหม่ · '+(c.subwaves.legs[4]?.state==='VALID'?'คลื่นย่อยผ่าน':'ยังเป็น truncation candidate'));
 for(const text of rows){const el=document.createElement('p');el.textContent=text;detail.append(el);}
}
function overlay(svg,make,w,h,out,chart,series){
 if(!visible||!out?.degrees)return;
 const selection=out.degrees[degree],c=selection?.preferred;if(!c)return;
 const confirmed=c.state==='CONFIRMED_COMPLETE'&&!selection?.unknown;
 const scale=chart.timeScale(),spacing=scale.options().barSpacing||6,anchor=[...c.pivots].reverse().find(p=>!p.provisional&&Number.isFinite(scale.timeToCoordinate(p.time)));
 if(!anchor)return;const ax=scale.timeToCoordinate(anchor.time),seconds=out.seconds||60;
 const xy=p=>{const xx=scale.timeToCoordinate(p.time);return {x:Number.isFinite(xx)?xx:ax+(p.time-anchor.time)/seconds*spacing,y:series.priceToCoordinate(p.price)};};
 const points=c.pivots.map(xy),g=make('g',{'class':'elliott-overlay','pointer-events':'none'});
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(![a.x,a.y,b.x,b.y].every(Number.isFinite))continue;
  const provisional=!!c.pivots[i].provisional,speculative=!confirmed||provisional;
  g.append(make('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:provisional?'#d4fc78':confirmed?'#72cbe1':'#8392a6','stroke-width':provisional?1.35:confirmed?1.1:.8,opacity:provisional?.72:confirmed?.72:.34,'stroke-dasharray':speculative?(provisional?'4 3':'3 4'):'none'}));
  if(b.x>=0&&b.x<w-35&&b.y>=0&&b.y<h){const t=make('text',{x:b.x+3,y:Math.max(30,Math.min(h-8,b.y+(c.pivots[i].type==='H'?-8:15))),fill:confirmed?'#dcfca1':'#96a5b8','font-size':confirmed?11:9,'paint-order':'stroke',stroke:'#10202c','stroke-width':3,opacity:confirmed?1:.72});t.textContent=c.pivots[i].label+(speculative?'?':'');g.append(t);}
 }
 const n=c.next,inv=series.priceToCoordinate(n.invalidation);if(Number.isFinite(inv)&&inv>0&&inv<h){g.append(make('line',{x1:Math.max(0,points[0].x),y1:inv,x2:w-55,y2:inv,stroke:'#ff839d','stroke-dasharray':'3 5',opacity:confirmed?.7:.28}));}
 const box=degree==='Working'?out.box:null;
 if(confirmed&&box&&['ACTIVE','EXTENDED'].includes(box.state)&&box.candidateKey===c.key){
  const a=xy({time:box.startTime,price:box.targetHigh}),b=xy({time:box.endTime,price:box.targetLow});
  if([a.x,a.y,b.x,b.y].every(Number.isFinite)){
   const left=Math.max(0,a.x),right=Math.min(w-55,b.x),top=Math.max(24,Math.min(a.y,b.y)),bottom=Math.min(h-8,Math.max(a.y,b.y));
   if(right>left&&bottom>top){
    // Prediction Box is a destination zone only: price target × expected arrival window.
    g.append(make('rect',{x:left,y:top,width:right-left,height:bottom-top,rx:4,fill:'#b9ee6130',stroke:'#d3f77d','stroke-width':1.2,'stroke-dasharray':'5 3'}));
    const mid=(top+bottom)/2;g.append(make('line',{x1:left,y1:mid,x2:right,y2:mid,stroke:'#e6ffb3','stroke-width':.7,opacity:.45,'stroke-dasharray':'2 4'}));
    const t=make('text',{x:left+4,y:top+12,fill:'#e6ffb3','font-size':9});t.textContent='เป้า Wave '+box.wave+' · '+number(box.targetLow)+'–'+number(box.targetHigh)+' · '+box.fromBars+'–'+box.toBars+' แท่ง';g.append(t);
   }
  }
 }
 svg.append(g);
}
root.ArisV33UI={render,overlay};
})(globalThis);
