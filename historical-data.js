(() => {
  'use strict';

  const DB_NAME='btc-training-lab-v1';
  const DB_VERSION=1;
  const MINUTE=60_000,DAY=86_400_000,WEEK=7*DAY;
  const INTERVAL_MS=Object.freeze({'1m':MINUTE,'5m':5*MINUTE,'10m':10*MINUTE,'15m':15*MINUTE,'1h':60*MINUTE,'4h':4*60*MINUTE,'1d':DAY,'1w':WEEK});
  const SUPPORTED_INTERVALS=Object.freeze(Object.keys(INTERVAL_MS));
  const intervalMs=interval=>INTERVAL_MS[interval]||null;
  const sourceInterval=interval=>interval==='10m'?'5m':interval;
  const sourceIntervalMs=interval=>intervalMs(sourceInterval(interval));
  const alignInterval=(ms,interval='1m')=>{
    const size=intervalMs(interval);if(!size)return NaN;
    if(interval==='1w'){const mondayOffset=4*DAY;return Math.floor((Number(ms)-mondayOffset)/size)*size+mondayOffset;}
    return Math.floor(Number(ms)/size)*size;
  };
  const BINANCE_FUTURES_KLINES='https://fapi.binance.com/fapi/v1/klines';
  const DEFAULT_LIMIT=1500;
  let dbPromise=null;

  const nowId=()=>{
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };
  const suffix=()=>globalThis.crypto?.randomUUID?.().slice(0,8)||Math.random().toString(36).slice(2,10);
  const alignMinute=ms=>alignInterval(ms,'1m');
  const lastClosedOpenTime=(interval='1m')=>{
    const size=intervalMs(interval);if(!size)return NaN;
    return alignInterval(Date.now(),interval)-size;
  };

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in globalThis)){reject(new Error('เบราว์เซอร์นี้ไม่มี IndexedDB'));return;}
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const ensure=(name,opts,indexes=[])=>{
          let store;
          if(!db.objectStoreNames.contains(name))store=db.createObjectStore(name,opts);
          else store=req.transaction.objectStore(name);
          for(const [idx,key,options] of indexes)if(!store.indexNames.contains(idx))store.createIndex(idx,key,options||{});
        };
        ensure('sessions',{keyPath:'id'},[['createdAt','createdAt'],['status','status']]);
        ensure('datasets',{keyPath:'id'},[['createdAt','createdAt'],['status','status']]);
        ensure('barChunks',{keyPath:'id'},[['datasetId','datasetId'],['startTime','startTime']]);
        ensure('signals',{keyPath:'id'},[['sessionId','sessionId']]);
        ensure('audit',{keyPath:'id'},[['sessionId','sessionId']]);
        ensure('reports',{keyPath:'id'},[['sessionId','sessionId']]);
        ensure('checkpoints',{keyPath:'id'},[['sessionId','sessionId']]);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('เปิด Training DB ไม่สำเร็จ'));
    });
    return dbPromise;
  }

  async function txPut(storeName,value){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error||new Error('บันทึก Training DB ไม่สำเร็จ'));
      tx.onabort=()=>reject(tx.error||new Error('Training DB transaction ถูกยกเลิก'));
    });
  }

  async function txGet(storeName,key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readonly'),req=tx.objectStore(storeName).get(key);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error||new Error('อ่าน Training DB ไม่สำเร็จ'));
    });
  }

  async function txDelete(storeName,key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('ลบ Training DB ไม่สำเร็จ'));
    });
  }

  async function listSessions(limit=10){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('sessions','readonly'),req=tx.objectStore('sessions').getAll();
      req.onsuccess=()=>{
        const rows=(req.result||[]).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,limit);
        resolve(rows);
      };
      req.onerror=()=>reject(req.error||new Error('อ่าน Training sessions ไม่สำเร็จ'));
    });
  }

  async function deleteChunksForDataset(datasetId){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('barChunks','readwrite'),idx=tx.objectStore('barChunks').index('datasetId');
      const req=idx.openCursor(IDBKeyRange.only(datasetId));
      req.onsuccess=()=>{
        const cursor=req.result;
        if(cursor){cursor.delete();cursor.continue();}
      };
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('ลบแท่งย้อนหลังไม่สำเร็จ'));
    });
  }

  async function deleteSession(sessionId){
    const session=await txGet('sessions',sessionId);
    if(session?.datasetId){
      await deleteChunksForDataset(session.datasetId);
      await txDelete('datasets',session.datasetId);
    }
    await clearReplayArtifacts(sessionId);
    await txDelete('sessions',sessionId);
    return true;
  }

  async function storageEstimate(){
    try{
      const e=await navigator.storage?.estimate?.();
      return {usage:Number(e?.usage)||0,quota:Number(e?.quota)||0};
    }catch{return {usage:0,quota:0};}
  }

  function normalizeKline(row){
    if(!Array.isArray(row)||row.length<6)return null;
    const bar={
      time:Number(row[0]),
      open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5]),
      closeTime:Number(row[6]),
      quoteVolume:Number(row[7]),
      trades:Number(row[8]),
      takerBuyBase:Number(row[9]),
      takerBuyQuote:Number(row[10])
    };
    if(!Number.isFinite(bar.time)||![bar.open,bar.high,bar.low,bar.close,bar.volume].every(Number.isFinite))return null;
    return bar;
  }

  async function fetchPage({symbol='BTCUSDT',interval='1m',startTime,endTime,limit=DEFAULT_LIMIT,signal}){
    const qs=new URLSearchParams({
      symbol,interval,
      startTime:String(Math.floor(startTime)),
      endTime:String(Math.floor(endTime)),
      limit:String(limit)
    });
    const res=await fetch(BINANCE_FUTURES_KLINES+'?'+qs.toString(),{cache:'no-store',signal});
    if(!res.ok)throw new Error('Binance historical HTTP '+res.status);
    const raw=await res.json();
    if(!Array.isArray(raw)){
      const msg=raw?.msg||'Binance ส่งข้อมูลย้อนหลังรูปแบบไม่ถูกต้อง';
      throw new Error(msg);
    }
    return raw.map(normalizeKline).filter(Boolean);
  }

  function featureAvailability(nativeCoverage=1,interval='1m'){
    return {
      ohlcv:{status:'native',label:'OHLCV Futures '+interval,coverage:1},
      quoteVolume:{status:'native',label:'Quote volume',coverage:nativeCoverage},
      tradeCount:{status:'native',label:'จำนวน trades ต่อ '+interval,coverage:nativeCoverage},
      takerBuyVolume:{status:'native',label:'Taker buy volume ต่อ '+interval,coverage:nativeCoverage},
      minuteFlowProxy:{status:'derived',label:'Flow proxy จาก Taker Buy/Sell '+interval,coverage:nativeCoverage},
      atrEmaFibStructure:{status:'derived',label:'ATR / EMA / Fib / Structure',coverage:1},
      orderBook:{status:'unavailable',label:'Historical order book ไม่มีในชุด Kline',coverage:0},
      liquidationStream:{status:'unavailable',label:'Historical liquidation stream ไม่มีในชุด Kline',coverage:0},
      tickFlow:{status:'unavailable',label:'Tick-by-tick flow ไม่มีในชุด Kline',coverage:0},
      subMinutePace:{status:'unavailable',label:'ไม่มีข้อมูล intrabar ที่ละเอียดกว่า '+interval+' ในชุดนี้',coverage:0}
    };
  }

  function qualityGrade({expectedBars,missing,duplicates,invalid,extendedCoverage}){
    const gapRate=expectedBars?missing/expectedBars:1;
    if(missing===0&&duplicates===0&&invalid===0&&extendedCoverage>=.995)return 'A';
    if(gapRate<=.001&&duplicates<=2&&invalid<=2&&extendedCoverage>=.98)return 'B';
    return 'C';
  }

  function sessionId(){return 'TRAIN-'+nowId()+'-'+suffix().slice(0,4).toUpperCase();}
  function datasetId(){return 'DATA-'+nowId()+'-'+suffix().slice(0,6).toUpperCase();}

  async function downloadDataset(options={}){
    const symbol=String(options.symbol||'BTCUSDT').toUpperCase(),interval=options.interval||'1m';
    const barMs=intervalMs(interval);
    if(!barMs||!SUPPORTED_INTERVALS.includes(interval))throw new Error('ไทม์เฟรม '+interval+' ยังไม่รองรับ');
    const fetchInterval=sourceInterval(interval),fetchMs=sourceIntervalMs(interval);
    if(!fetchMs)throw new Error('หา source interval สำหรับ '+interval+' ไม่ได้');

    const latestClosed=lastClosedOpenTime(interval);
    const analysisEnd=Math.min(alignInterval(options.endTime??latestClosed,interval),latestClosed);
    const analysisStart=alignInterval(options.startTime,interval);
    const warmupBars=Math.max(0,Math.min(5000,Math.floor(Number(options.warmupBars)||500)));
    if(!Number.isFinite(analysisStart)||analysisStart>=analysisEnd)throw new Error('ช่วงเวลาย้อนหลังไม่ถูกต้อง');

    const downloadStart=analysisStart-warmupBars*barMs;
    const downloadEnd=analysisEnd;
    const sourceEnd=downloadEnd+barMs-fetchMs;
    const expectedBars=Math.floor((downloadEnd-downloadStart)/barMs)+1;
    const requestedAnalysisBars=Math.floor((analysisEnd-analysisStart)/barMs)+1;

    const sid=sessionId(),did=datasetId(),createdAt=Date.now();
    const engineMeta=options.engineMeta||{};
    const baseSession={
      id:sid,datasetId:did,createdAt,updatedAt:createdAt,status:'downloading',phase:1,
      symbol,interval,sourceInterval:fetchInterval,barMs,analysisStart,analysisEnd,downloadStart,downloadEnd,warmupBars,
      requestedAnalysisBars,expectedBars,loadedBars:0,
      engineVersion:engineMeta.engineVersion||globalThis.EventSignalV6?.CFG?.version||null,
      engineBlobSha:engineMeta.engineBlobSha||null,
      auditSchema:Object.prototype.hasOwnProperty.call(engineMeta,'auditSchema')?engineMeta.auditSchema:(globalThis.AuditEngineV2?.schema||null),
      source:'binance_futures_rest',sourceEndpoint:BINANCE_FUTURES_KLINES,
      replayReady:false,gameReady:false
    };
    const dataset={
      id:did,sessionId:sid,createdAt,updatedAt:createdAt,status:'downloading',
      symbol,interval,sourceInterval:fetchInterval,barMs,analysisStart,analysisEnd,downloadStart,downloadEnd,warmupBars,
      expectedBars,loadedBars:0,chunkCount:0,quality:null,
      source:{provider:'Binance Futures',endpoint:BINANCE_FUTURES_KLINES,type:'kline',interval:fetchInterval,targetInterval:interval,aggregated:fetchInterval!==interval}
    };
    await txPut('sessions',baseSession);
    await txPut('datasets',dataset);

    let cursor=downloadStart,lastTime=null,loadedBars=0,chunkNo=0,duplicates=0,missing=0,invalid=0;
    let nativeExtended=0,finishedNaturally=false,aggregateCarry=null;
    const startedAt=Date.now();
    const ratio=Math.max(1,Math.round(barMs/fetchMs));

    const aggregatePage=(page,flush=false)=>{
      if(fetchInterval===interval)return page;
      const out=[];
      const emit=()=>{
        if(!aggregateCarry)return;
        if(aggregateCarry.count===ratio){
          const a=aggregateCarry;
          out.push({
            time:a.bucketStart,open:a.open,high:a.high,low:a.low,close:a.close,volume:a.volume,
            closeTime:a.bucketStart+barMs-1,quoteVolume:a.quoteVolume,trades:a.trades,
            takerBuyBase:a.takerBuyBase,takerBuyQuote:a.takerBuyQuote
          });
        }
        aggregateCarry=null;
      };
      for(const b of page){
        const bucketStart=alignInterval(b.time,interval);
        if(!aggregateCarry||aggregateCarry.bucketStart!==bucketStart){
          emit();
          aggregateCarry={bucketStart,count:0,open:b.open,high:b.high,low:b.low,close:b.close,volume:0,quoteVolume:0,trades:0,takerBuyBase:0,takerBuyQuote:0};
        }
        const a=aggregateCarry;
        a.count++;a.high=Math.max(a.high,b.high);a.low=Math.min(a.low,b.low);a.close=b.close;
        a.volume+=Number(b.volume)||0;a.quoteVolume+=Number(b.quoteVolume)||0;a.trades+=Number(b.trades)||0;
        a.takerBuyBase+=Number(b.takerBuyBase)||0;a.takerBuyQuote+=Number(b.takerBuyQuote)||0;
        if(b.time+fetchMs>=bucketStart+barMs)emit();
      }
      if(flush)emit();
      return out;
    };

    const acceptBars=async clean=>{
      if(!clean.length)return;
      const chunk={
        id:did+':'+String(chunkNo).padStart(4,'0'),datasetId:did,sessionId:sid,
        chunkNo,startTime:clean[0].time,endTime:clean.at(-1).time,count:clean.length,bars:clean
      };
      await txPut('barChunks',chunk);
      chunkNo++;loadedBars+=clean.length;
    };

    try{
      while(cursor<=sourceEnd){
        if(options.signal?.aborted)throw new DOMException('ยกเลิกการโหลด','AbortError');
        const page=await fetchPage({symbol,interval:fetchInterval,startTime:cursor,endTime:sourceEnd+fetchMs-1,limit:DEFAULT_LIMIT,signal:options.signal});
        if(!page.length)break;

        const targetBars=aggregatePage(page,false);
        const clean=[];
        for(const b of targetBars){
          if(b.time<downloadStart||b.time>downloadEnd)continue;
          if(lastTime===null&&b.time>downloadStart)missing+=Math.floor((b.time-downloadStart)/barMs);
          if(lastTime!==null){
            if(b.time<=lastTime){duplicates++;continue;}
            if(b.time>lastTime+barMs)missing+=Math.floor((b.time-lastTime)/barMs)-1;
          }
          if(b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.high<b.low){
            invalid++;continue;
          }
          clean.push(b);
          lastTime=b.time;
          if([b.quoteVolume,b.trades,b.takerBuyBase,b.takerBuyQuote].every(Number.isFinite))nativeExtended++;
        }
        await acceptBars(clean);

        const fetchedLast=page.at(-1)?.time;
        if(!Number.isFinite(fetchedLast))break;
        const next=fetchedLast+fetchMs;
        if(next<=cursor)throw new Error('Historical cursor ไม่เดินต่อ');
        cursor=next;

        const elapsed=Math.max(1,Date.now()-startedAt);
        options.onProgress?.({
          sessionId:sid,datasetId:did,loadedBars,expectedBars,
          progress:Math.min(1,loadedBars/expectedBars),chunkCount:chunkNo,
          requests:chunkNo,elapsedMs:elapsed,barsPerSecond:loadedBars/(elapsed/1000)
        });

        if(page.length<DEFAULT_LIMIT||cursor>sourceEnd){finishedNaturally=true;break;}
        await new Promise(r=>setTimeout(r,80));
      }

      if(fetchInterval!==interval&&aggregateCarry){
        const tail=aggregatePage([],true),clean=[];
        for(const b of tail){
          if(b.time<downloadStart||b.time>downloadEnd)continue;
          if(lastTime===null&&b.time>downloadStart)missing+=Math.floor((b.time-downloadStart)/barMs);
          if(lastTime!==null){
            if(b.time<=lastTime){duplicates++;continue;}
            if(b.time>lastTime+barMs)missing+=Math.floor((b.time-lastTime)/barMs)-1;
          }
          if(b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.high<b.low){invalid++;continue;}
          clean.push(b);lastTime=b.time;
          if([b.quoteVolume,b.trades,b.takerBuyBase,b.takerBuyQuote].every(Number.isFinite))nativeExtended++;
        }
        await acceptBars(clean);
      }

      if(lastTime!==null&&lastTime<downloadEnd)missing+=Math.floor((downloadEnd-lastTime)/barMs);
      if(lastTime===null)missing=expectedBars;

      const extendedCoverage=loadedBars?nativeExtended/loadedBars:0;
      const quality={
        grade:qualityGrade({expectedBars,missing,duplicates,invalid,extendedCoverage}),
        expectedBars,loadedBars,missing,duplicates,invalid,
        gapRate:expectedBars?missing/expectedBars:1,
        extendedCoverage,
        complete:loadedBars+missing>=expectedBars&&loadedBars>0,
        firstOpenTime:downloadStart,lastOpenTime:lastTime,
        features:featureAvailability(extendedCoverage,interval),
        note:'Quality ตรวจระดับแท่ง '+interval+(fetchInterval!==interval?' · รวมจาก '+fetchInterval:'')+'; ไม่สร้าง Order Book/Tick ที่ไม่มีจริง'
      };
      const ready=loadedBars>0&&quality.grade!=='C'&&missing===0;
      const replayReady=ready&&interval==='1m';
      const gameReady=loadedBars>=120;
      const completedAt=Date.now();

      await txPut('datasets',{
        ...dataset,updatedAt:completedAt,status:ready?'ready':'quality_warning',
        loadedBars,chunkCount:chunkNo,quality
      });
      await txPut('sessions',{
        ...baseSession,updatedAt:completedAt,completedAt,status:ready?'ready':'quality_warning',
        loadedBars,chunkCount:chunkNo,quality,replayReady,gameReady,
        durationMs:completedAt-startedAt,
        finishedNaturally
      });

      options.onProgress?.({
        sessionId:sid,datasetId:did,loadedBars,expectedBars,progress:1,chunkCount:chunkNo,
        requests:chunkNo,elapsedMs:completedAt-startedAt,barsPerSecond:loadedBars/Math.max(1,(completedAt-startedAt)/1000),
        complete:true,quality
      });
      return await txGet('sessions',sid);
    }catch(err){
      const aborted=err?.name==='AbortError';
      const updatedAt=Date.now();
      await txPut('datasets',{
        ...dataset,updatedAt,status:aborted?'cancelled':'error',
        loadedBars,chunkCount:chunkNo,error:String(err?.message||err)
      });
      await txPut('sessions',{
        ...baseSession,updatedAt,status:aborted?'cancelled':'error',
        loadedBars,chunkCount:chunkNo,replayReady:false,gameReady:false,error:String(err?.message||err)
      });
      throw err;
    }
  }


  async function putMany(storeName,values){
    const rows=(values||[]).filter(Boolean);
    if(!rows.length)return 0;
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName);
      for(const row of rows)store.put(row);
      tx.oncomplete=()=>resolve(rows.length);
      tx.onerror=()=>reject(tx.error||new Error('บันทึก Training records ไม่สำเร็จ'));
      tx.onabort=()=>reject(tx.error||new Error('Training records transaction ถูกยกเลิก'));
    });
  }

  async function getBySession(storeName,sessionId){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readonly'),store=tx.objectStore(storeName);
      if(!store.indexNames.contains('sessionId')){resolve([]);return;}
      const req=store.index('sessionId').getAll(IDBKeyRange.only(sessionId));
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error||new Error('อ่าน Training records ไม่สำเร็จ'));
    });
  }

  async function deleteBySession(storeName,sessionId){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName);
      if(!store.indexNames.contains('sessionId')){resolve(true);return;}
      const req=store.index('sessionId').openCursor(IDBKeyRange.only(sessionId));
      req.onsuccess=()=>{const c=req.result;if(c){c.delete();c.continue();}};
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('ลบ Training records ไม่สำเร็จ'));
    });
  }

  async function getDatasetBars(datasetIdValue){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('barChunks','readonly'),idx=tx.objectStore('barChunks').index('datasetId');
      const req=idx.getAll(IDBKeyRange.only(datasetIdValue));
      req.onsuccess=()=>{
        const chunks=(req.result||[]).sort((a,b)=>(a.chunkNo||0)-(b.chunkNo||0));
        const bars=chunks.flatMap(c=>Array.isArray(c.bars)?c.bars:[]).sort((a,b)=>a.time-b.time);
        resolve(bars);
      };
      req.onerror=()=>reject(req.error||new Error('อ่านแท่ง Training ไม่สำเร็จ'));
    });
  }

  async function saveSession(session){return txPut('sessions',session);}
  async function saveReport(sessionId,report){
    return txPut('reports',{id:sessionId+':phase2',sessionId,updatedAt:Date.now(),...report});
  }
  async function getReport(sessionId){
    return txGet('reports',sessionId+':phase2');
  }
  async function saveCheckpoint(sessionId,payload){
    return txPut('checkpoints',{id:sessionId+':latest',sessionId,updatedAt:Date.now(),...payload});
  }
  async function getCheckpoint(sessionId){return txGet('checkpoints',sessionId+':latest');}
  async function clearCheckpoint(sessionId){return txDelete('checkpoints',sessionId+':latest');}
  async function clearReplayArtifacts(sessionId){
    await deleteBySession('signals',sessionId);
    await deleteBySession('audit',sessionId);
    await deleteBySession('reports',sessionId);
    await deleteBySession('checkpoints',sessionId);
    return true;
  }

  async function getDatasetSummary(datasetIdValue){
    return txGet('datasets',datasetIdValue);
  }

  async function getSession(sessionIdValue){
    return txGet('sessions',sessionIdValue);
  }

  globalThis.HistoricalDataV1={
    schema:'historical-data-v1',
    dbName:DB_NAME,
    dbVersion:DB_VERSION,
    stores:['sessions','datasets','barChunks','signals','audit','reports','checkpoints'],
    endpoint:BINANCE_FUTURES_KLINES,
    supportedIntervals:SUPPORTED_INTERVALS,intervalMs,sourceInterval,sourceIntervalMs,alignInterval,alignMinute,lastClosedOpenTime,openDb,storageEstimate,listSessions,getSession,getDatasetSummary,getDatasetBars,
    saveSession,putMany,getBySession,deleteBySession,saveReport,getReport,saveCheckpoint,getCheckpoint,clearCheckpoint,clearReplayArtifacts,
    deleteSession,downloadDataset
  };
})();