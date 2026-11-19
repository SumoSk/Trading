'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildEstimate,normalizeInput,LEVERAGES,MAX_AGE_MS}=require('../estimated-liquidation.js');
const now=Date.now(),ms=300000,start=Math.floor(now/ms)*ms-60*ms;
const oi=[],candles=[];
for(let i=0;i<59;i++){
 const opening=start+i*ms;
 const close=100000+Math.sin(i/7)*160;
 oi.push({timestamp:opening+ms,sumOpenInterest:String(2000+i*12)});
 candles.push([opening,String(close),String(close+70),String(close-70),String(close),'12',opening+ms-1]);
}
const model=buildEstimate(oi,candles,now);
assert.equal(model.available,true,'available only on paired actual OI and candles');
assert.deepEqual(LEVERAGES,[10,20,50,100]);
assert.equal(model.points,59);
assert.equal(model.active,58);
assert.ok(model.bands.length>40);
assert.ok(model.bands.some(x=>x.side==='SHORT'&&x.price>model.referencePrice));
assert.ok(model.bands.some(x=>x.side==='LONG'&&x.price<model.referencePrice));
assert.ok(model.bands.every(x=>x.intensity<=1&&x.intensity>0&&Number.isFinite(x.price)));
assert.ok(model.top.length<=3);
assert.ok(model.bands.every(x=>!Object.hasOwn(x,'liquidationUsd')));
const old=oi.map(x=>({...x,timestamp:x.timestamp-7200000}));
assert.equal(buildEstimate(old,candles,now).available,false,'do not fake missing matching candles');
const stale=buildEstimate(oi,candles,now+MAX_AGE_MS+ms);
assert.equal(stale.available,false,'hide stale series');
const flat=oi.map(x=>({...x,sumOpenInterest:'1000'}));
assert.equal(buildEstimate(flat,candles,now).available,false,'no made-up clusters with no positive OI changes');
assert.deepEqual(normalizeInput([],[],now),[]);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const token of ['estimated-liquidation.js?v=20261120-r1','id="estimated-liq-canvas"',
 'id="estimated-liq-toggle"','state.estimatedHeatmap?.render();','window.ArisEstimatedLiq.create(',
 'id="liq-heatmap-toggle"','state.heatmap?.add(']){
 assert.ok(html.includes(token),'missing integration '+token);
}
console.log('Estimated liquidation scenarios: source pairing, staleness, no fabrication, side and chart integration OK');
