'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {clustersFromSnapshots,LOOKBACK_MS}=require('../liquidation-heatmap.js');
const now=Date.now();
const testEvents=[
 {ts:now-1000,price:100000,notional:2000,side:'SHORT'},
 {ts:now-2000,price:100010,notional:3000,side:'SHORT'},
 {ts:now-3000,price:100000,notional:7000,side:'LONG'},
 {ts:now-LOOKBACK_MS-1,price:100000,notional:99999,side:'LONG'},
 {ts:now+6000,price:100000,notional:99999,side:'LONG'},
 {ts:now-2000,price:NaN,notional:100,side:'LONG'}
];
const clusters=clustersFromSnapshots(testEvents,now,100000);
assert.equal(clusters.length,2);
assert.equal(clusters[0].side,'LONG');
assert.equal(clusters[0].notional,7000);
assert.equal(clusters[1].side,'SHORT');
assert.equal(clusters[1].notional,5000);
assert.equal(clusters[1].count,2);
assert.deepEqual(clustersFromSnapshots([],now,100000),[]);
assert.deepEqual(clustersFromSnapshots(testEvents,now,0),[]);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const token of ['liquidation-heatmap.js?v=20261120-r1',
 'id="liq-heatmap-canvas"','id="liq-heatmap-toggle"',
 'state.heatmap?.add(','state.heatmap?.render();','window.ArisLiquidationHeatmap.create(']){
 assert.ok(html.includes(token),'Missing graph connection: '+token);
}
console.log('Observed liquidation heatmap: clustering, freshness, side, and graph wiring OK');
