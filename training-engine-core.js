/* Training-only engine snapshot. Isolated in a same-origin iframe by training-engine-registry.js.
   Generated from the production engine source so historical replay can choose a version without changing Live. */
/* Event Engine — selectable V7.1.0 / V7.1.1 / V7.2.0 / ARIS V1 / V1.1 / V1.2 / V2, +10 minute horizon first, causal, 1m-first.
   Market Phase routes each setup: RANGE, TREND, IMPULSE, MATURE_IMPULSE, EXHAUSTION, REVERSAL.
   RSI/MACD are chart-only and never enter signal decisions. */
(function(root){
'use strict';
const ACTIVE_VERSION_STORE='btc-active-engine-version-aris-v2';
let SELECTED_ENGINE_VERSION='ARIS-2.0.0';
try{
 const savedVersion=localStorage.getItem(ACTIVE_VERSION_STORE);
 const visibleVersionMap={
  '6.5.0':'6.6.0',
  '7.0.0':'7.2.0','7.0.1':'7.2.0','7.1.0':'7.2.0','7.1.1':'7.2.0',
  'ARIS-1.0.0':'ARIS-1.2.0','ARIS-1.1.0':'ARIS-1.2.0'
 };
 const resolvedVersion=visibleVersionMap[savedVersion]||savedVersion;
 if(['6.6.0','7.2.0','ARIS-1.2.0','ARIS-2.0.0','ARIS-3.0.0','ARIS-4.0.0'].includes(resolvedVersion))SELECTED_ENGINE_VERSION=resolvedVersion;
}catch{}
if(root.__TRAINING_VERSION)SELECTED_ENGINE_VERSION=String(root.__TRAINING_VERSION);
const V710_CONFIG=Object.freeze({
 version:'7.1.0',horizonMs:600000,settlementToleranceMs:5000,
 rangeBars:12,atrBars:14,breakBuffer:.06,maxBreakEntry:.65,maxFailureEntry:.65,maxRangeEntry:.42,maxTrendEntry:.55,
 maxDrift:.42,maxAgeMs:50000,minEvidenceMs:550,minEvidenceTicks:2,
 minFlow:.04,flowWarmupSec:12,roomAtr:.24,maxRetreat:.34,pullbackMin:.24,pullbackMax:1.20,
 rangeEdge:.26,rangeEntryLimit:.40,rangeMinSamples:3,rangeMinWinRate:.58,rangeMinScore:5,breakoutMinScore:5,
 phaseTrendMin:.24,impulseBodyAtr:.55,impulseRangeAtr:.80,impulseRelVol:1.45,impulseVolume3:1.25,
 matureExtensionAtr:1.45,climaxExtensionAtr:2.25,climaxRelVol:2.40,exhaustionScoreMin:2,
 rangeEdgeFollowPosition:.10,rangeEdgeBreakAtr:.10,rangeEdgeAcceptedCloseAtr:.04,
 rangeCounterTrendMin:.10,
 episodeWindowMs:480000,episodeAtrDistance:3,maxSameDirectionPerEpisode:2,minSameDirectionGapMs:90000,
 antiMountainGuard:false,antiMountainExtensionAtr:6.0,antiMountainRelVol:2.40,
 maxHistory:1500,maxAudit:2500
});
const V711_CONFIG=Object.freeze({...V710_CONFIG,
 version:'7.1.1',
 antiMountainGuard:true,
 antiMountainExtensionAtr:6.0,
 antiMountainRelVol:2.40
});
const V720_CONFIG=Object.freeze({...V711_CONFIG,
 version:'7.2.0',
 watchMinScore:4,
 watchReadyScore:6,
 watchCooldownMs:180000,
 earlyTransitionScore:7,
 earlyTransitionProgress:.12,
 earlyTransitionBodyAtr:.22,
 earlyTransitionFlow:.12,
 earlyTransitionRetreat:.18,
 lateExtensionAtr:2.75,
 hardLateExtensionAtr:4.25,
 rangeMinScore:6,
 rangeEntryLimit:.32,
 breakoutMinScore:6
});
const ARIS_V1_CONFIG=Object.freeze({...V720_CONFIG,
 version:'ARIS-1.0.0',arisRevision:'live-opportunity-r2',
 watchMinScore:18,watchReadyScore:25,watchCooldownMs:180000,
 arisBiasWatch:.18,arisBiasReady:.25,arisBiasEnter:.32,
 arisTimingReady:54,arisTimingEnter:64,arisFlowCoverageSec:6,
 arisEarlyImpulseMaxExtension:1.35,
 arisEarlyImpulseFlow:.06,arisEarlyImpulseMinProgress:.05,arisEarlyImpulseMaxProgress:.25,
 arisPullbackMin:.18,arisPullbackMax:.85,arisPullbackMaxExtension:1.40,
 arisAllowLiveReclaim:false,arisPullbackReclaimMinProgress:.01,arisPullbackReclaimMaxProgress:.30,
 arisRangeEdge:.20,arisRangeRoom:.45,
 arisLiveOpportunityFlow:.035,arisLiveOpportunityRoom:.32,arisLiveOpportunityMaxExtension:1.45,
 arisLiveOpportunityMinProgress:-.08,arisLiveOpportunityMaxProgress:.30,
 arisSoftLateExtension:1.85,arisHardLateExtension:2.40,arisMaxTriggerProgress:.46,
 arisSoftHeat:1.95,arisSoftRoom:.30,arisSoftRetreat:.24,
 arisCandidateMaxAgeMs:15000,
 arisAllowAddOn:true,
 minEvidenceMs:400,minEvidenceTicks:2
});
const ARIS_V11_CONFIG=Object.freeze({...ARIS_V1_CONFIG,
 version:'ARIS-1.1.0',arisRevision:'faster-opportunity-r1',
 arisBiasReady:.22,arisBiasEnter:.29,
 arisTimingReady:50,arisTimingEnter:59,
 arisEarlyImpulseFlow:.04,arisEarlyImpulseMinProgress:.03,arisEarlyImpulseMaxProgress:.35,
 arisAllowLiveReclaim:true,arisPullbackReclaimMinProgress:.01,arisPullbackReclaimMaxProgress:.30,
 arisLiveOpportunityFlow:.025,arisLiveOpportunityRoom:.24,arisLiveOpportunityMaxExtension:1.60,
 arisLiveOpportunityMinProgress:-.08,arisLiveOpportunityMaxProgress:.45,
 arisCandidateMaxAgeMs:30000
});
const ARIS_V12_CONFIG=Object.freeze({...ARIS_V11_CONFIG,
 version:'ARIS-1.2.0',arisRevision:'breakout-recovery-r1',
 arisBreakoutFollow:true,
 arisBreakoutBuffer:.05,
 arisBreakoutMaxProgress:.34,
 arisBreakoutMinFlow:.04,
 arisBreakoutMinBias:.06,
 arisBreakoutMinRoom:.18,
 arisBreakoutMinVotes:2,
 arisBreakoutMinClose:.68,
 arisBreakoutMinRangeAtr:.45,
 arisBreakoutMinVolumePace:1.25,
 arisPostLatePlan:true,
 arisLatePlanMaxAgeMs:180000,
 arisLatePullbackMin:.12,
 arisLatePullbackMax:.85,
 arisLateReclaimMinProgress:.03,
 arisLateReclaimMaxProgress:.30,
 arisLateReclaimMinFlow:.025,
 arisLateFollowMinBias:.10,
 arisLateReversalMinFlow:.05,
 arisLateReversalMinRetreat:.18,
 arisLateReversalStructureAtr:.05,
 arisLateReversalMaxAgainstBias:.12,
 arisMacroHardExtension:3.60
});
const ARIS_V2_CONFIG=Object.freeze({...ARIS_V12_CONFIG,
 version:'ARIS-2.0.0',arisRevision:'market-observer-v2-r6',
 v2RangeLookback:40,v2RangeEdgeAtr:.14,v2RangeBalancedEff:.38,v2CompressionRatio:.72,
 v2BreakBuffer:.04,v2BreakAccepted:.08,v2BreakMaxChaseAtr:.36,v2FakeBreakBuffer:.05,
 v2BreakoutMemoryMs:180000,v2BreakFailAtr:.08,v2RetestBelowAtr:.04,v2RetestMaxAtr:.16,v2FakeBreakMemoryBars:4,
 v2FibZoneAtr:.15,v2ZoneNearAtr:.25,
 v2StateMemoryMs:3600000,v2SnapshotMemory:240,v2StoryLogCooldownMs:10000,
 v2CandidateMaxAgeMs:90000,v2AnchorDriftAtr:.60,v2InvalidationAtr:.08,v2SwitchConfirmMs:800,v2LostContextMs:2500,v2IssuedDisplayMs:8000,
 v2RangeWindowBars:12,v2FibMaxAgeBars:25,v2FlowCoverageSec:12,v2ReverseFlow:.04,v2MinRoomAtr:.12,v2MicroBreakAtr:.02,
 v2EntryReady:58,v2EntryEnter:66,
 v2ConfirmTicks:2,v2ConfirmMs:350,v2MinFlow:.02,v2StrongFlow:.04,
 v2MaxFollowExtension:1.75,v2HardExtension:3.25,v2ReversalEvidence:3
});
const ARIS_V3_CONFIG=Object.freeze({...ARIS_V2_CONFIG,
 version:'ARIS-3.0.0',arisRevision:'blueprint-v3-r2',
 v3StructureEffMin:.34,v3TrendEffMin:.42,v3ChopEffMax:.20,
 v3BreakBuffer:.06,v3BreakCloseMin:.62,
 v3MinRoomAtr:.22,v3HardExtension:2.40,v3ExhaustionExtension:1.80,
 v3FlowCoverageSec:12,v3MinFlow:.03,v3StrongFlow:.055,v3ReverseFlow:.045,
 v3BookAssist:.08,v3BookAgainstMax:.10,
 v3ConfirmTicks:2,v3ConfirmMs:500,v3ShockResolveMinMs:700,
 v3EpisodeMaxAgeMs:720000,v3NewLegMinMoveAtr:.65,
 v3ReversalMinExtension:1.40,
 v3FibZoneAtr:.15,v3FibMaxAgeBars:25,
 v3SwingBreakAtr:.08,v3BaseReclaimAtr:.03,v3NewLegReclaimAtr:.18,v3PullbackNearAtr:.55,
 v3BreakoutBaseEffMax:.35,
 v3ReplayMinFlow:.025,v3ShockExhaustExtension:2.10,v3AbsorbProgressAtr:.12,
 v3ShockMaxResolveMs:15000,v3ShockReleaseMs:30000,
 v3HtfObstacleAtr:.45,v3BreakoutMaxChaseAtr:.75
});
const ARIS_V4_CONFIG=Object.freeze({...ARIS_V3_CONFIG,
 version:'ARIS-4.0.0',arisRevision:'sideway-v4-r1',
 v4RangeLookback:36,v4TouchBandAtr:.22,
 v4CompressionAtrRatio:.68,v4CompressionWidthAtr:3.0,
 v4EffGood:.16,v4EffBad:.44,v4SepGood:.10,v4SepBad:.42,v4SlopeGood:.08,v4SlopeBad:.34,
 v4CrossTarget:3,v4TouchTarget:2,v4MinWidthAtr:1.80,v4MaxWidthAtr:8.0,
 v4TrendThreat:.45,v4SlopeThreat:.34,v4TrendEffThreat:.40,
 v4RangePass:70,v4RangeDevelop:58,
 v4EdgeInsideAtr:.48,v4EdgeOutsideAtr:.32,v4MiddleLow:.35,v4MiddleHigh:.65,
 v4ReclaimAtr:.03,v4ExcursionAtr:.05,v4WickMin:.26,v4CloseMin:.56,v4MaxOpposingFlow:.075,
 v4AcceptedCloseAtr:.08,v4LiveBreakAtr:.18,v4BreakBodyAtr:.55,v4BreakRangeAtr:.80,v4BreakFlow:.05,
 v4BreakAtrExpansion:1.25,v4BreakRiskPass:42,v4BreakRiskBlock:65,
 v4ConfirmTicks:2,v4ConfirmMs:450
});
const V650_SELECT_CONFIG=Object.freeze({
 version:'6.5.0',horizonMs:600000,settlementToleranceMs:5000,
 rangeBars:12,atrBars:14,breakBuffer:.06,maxBreakEntry:.65,maxFailureEntry:.65,maxRangeEntry:.42,maxTrendEntry:.55,
 maxDrift:.42,maxAgeMs:50000,minEvidenceMs:550,minEvidenceTicks:2,
 minFlow:.04,flowWarmupSec:12,roomAtr:.24,maxRetreat:.34,pullbackMin:.24,pullbackMax:1.20,
 rangeEdge:.26,rangeEntryLimit:.40,rangeMinSamples:3,rangeMinWinRate:.58,rangeMinScore:5,breakoutMinScore:5,
 statsTrendMin:.10,failedBreakTrendMin:.15,
 phaseTrendMin:.24,impulseBodyAtr:.55,impulseRangeAtr:.80,impulseRelVol:1.45,impulseVolume3:1.25,
 matureExtensionAtr:1.45,climaxExtensionAtr:2.25,climaxRelVol:2.40,exhaustionScoreMin:2,
 rangeEdgeFollowPosition:.10,rangeEdgeBreakAtr:.10,rangeEdgeAcceptedCloseAtr:.04,rangeCounterTrendMin:.10,
 episodeWindowMs:480000,episodeAtrDistance:3,maxSameDirectionPerEpisode:2,minSameDirectionGapMs:90000,
 antiMountainGuard:false,antiMountainExtensionAtr:6.0,antiMountainRelVol:2.40,
 maxHistory:1500,maxAudit:2500
});
const V660_SELECT_CONFIG=Object.freeze({...V650_SELECT_CONFIG,version:'6.6.0'});
const V700_SELECT_CONFIG=Object.freeze({
 version:'7.0.0',horizonMs:600000,settlementToleranceMs:5000,
 rangeBars:12,atrBars:14,breakBuffer:.06,maxBreakEntry:.65,maxFailureEntry:.65,maxRangeEntry:.42,maxTrendEntry:.55,
 maxDrift:.42,maxAgeMs:50000,minEvidenceMs:550,minEvidenceTicks:2,
 minFlow:.04,flowWarmupSec:12,roomAtr:.24,maxRetreat:.34,pullbackMin:.24,pullbackMax:1.20,
 rangeEdge:.26,rangeEntryLimit:.40,rangeMinSamples:3,rangeMinWinRate:.58,rangeMinScore:5,breakoutMinScore:5,
 phaseTrendMin:.24,impulseBodyAtr:.55,impulseRangeAtr:.80,impulseRelVol:1.45,impulseVolume3:1.25,
 matureExtensionAtr:1.45,climaxExtensionAtr:2.25,climaxRelVol:2.40,exhaustionScoreMin:2,
 episodeWindowMs:480000,episodeAtrDistance:3,maxSameDirectionPerEpisode:2,minSameDirectionGapMs:90000,
 antiMountainGuard:false,antiMountainExtensionAtr:6.0,antiMountainRelVol:2.40,
 rangeCounterTrendMin:0,
 rangeEdgeFollowPosition:.10,rangeEdgeBreakAtr:.10,rangeEdgeAcceptedCloseAtr:.04,
 maxHistory:1500,maxAudit:2500
});
const V701_SELECT_CONFIG=Object.freeze({...V700_SELECT_CONFIG,version:'7.0.1'});
const CFG=SELECTED_ENGINE_VERSION==='6.5.0'?V650_SELECT_CONFIG:SELECTED_ENGINE_VERSION==='6.6.0'?V660_SELECT_CONFIG:SELECTED_ENGINE_VERSION==='7.0.0'?V700_SELECT_CONFIG:SELECTED_ENGINE_VERSION==='7.0.1'?V701_SELECT_CONFIG:SELECTED_ENGINE_VERSION==='7.1.0'?V710_CONFIG:SELECTED_ENGINE_VERSION==='7.1.1'?V711_CONFIG:SELECTED_ENGINE_VERSION==='7.2.0'?V720_CONFIG:SELECTED_ENGINE_VERSION==='ARIS-4.0.0'?ARIS_V4_CONFIG:SELECTED_ENGINE_VERSION==='ARIS-3.0.0'?ARIS_V3_CONFIG:SELECTED_ENGINE_VERSION==='ARIS-2.0.0'?ARIS_V2_CONFIG:SELECTED_ENGINE_VERSION==='ARIS-1.2.0'?ARIS_V12_CONFIG:SELECTED_ENGINE_VERSION==='ARIS-1.1.0'?ARIS_V11_CONFIG:ARIS_V1_CONFIG;
const V70_PROFILE=Object.freeze({
 name:'V7.0 Market Phase + Volume/Impulse',
 basis:'V6.6 out-of-sample T+10 dataset + observed impulse failure cluster',
 source:Object.freeze({version:'6.6.0',completedSignals:18,wins:11,winRate:.611111,pendingSignals:2}),
 observed:Object.freeze({
  breakout:Object.freeze({n:5,wins:2,winRate:.40}),
  pullback:Object.freeze({n:7,wins:4,winRate:.571429}),
  range_reversal:Object.freeze({n:4,wins:4,winRate:1}),
  failed_break:Object.freeze({n:2,wins:1,winRate:.50}),
  side:Object.freeze({HIGH:{n:10,wins:9,winRate:.90},LOW:{n:8,wins:2,winRate:.25}})
 }),
 lessons:Object.freeze([
  'inverse breakout/pullback จาก V6.5 ไม่คงผลใน V6.6',
  'ช่วง impulse เดียว V6.6 ยิง LOW ซ้ำ 6 ไม้และผิดครบ 6',
  'ต้องแยก early/mid impulse ออกจาก climax ก่อนอนุญาตให้สวน',
  'volume และ candle expansion ต้องเป็น feature ตัดสินใจ ไม่ใช่แค่แสดงผล',
  'trend continuation ต้องกลับมาเป็นจุดเข้าจริงเมื่อ phase สนับสนุน'
 ])
});
const V701_PROFILE=Object.freeze({
 name:'V7.0.1 Range Edge Confirmation',
 basis:'V7.0.0 first live failure: mature impulse followed into a RANGE edge before the edge was actually accepted',
 source:Object.freeze({version:'7.0.0',failureCase:Object.freeze({direction:'LOW',entryPrice:83811.60,exitPrice:83925.00,directionalMoveAtr:-2.06,rangePosition:0})}),
 change:Object.freeze({
  scope:'only trend/impulse follow while stable regime is RANGE and price is at the outer 10%',
  rule:'wait until range edge is broken by 0.10 ATR, or a closed-bar acceptance >=0.04 ATR is supported by live flow + volume pace',
  goal:'avoid following directly into an intact range edge without suppressing ordinary trend/impulse entries'
 })
});
const V710_PROFILE=Object.freeze({
 name:'V7.1.0 · สูตรเดิม',
 basis:'V7.0.1 recorded-entry audit; exploratory in-sample analysis, not a replay or forward validation',
 source:Object.freeze({version:'7.0.1',completedSignals:35,wins:17,missingSignals:1,pendingSignals:1}),
 change:Object.freeze({
  range:'RANGE reversals must oppose the 1m trend with strength >=0.10 (existing V6.6 threshold); never blindly invert a setup',
  transition:'TRANSITION breakout requires existing closed-bar acceptance; live score/volume alone cannot confirm it',
  confirmation:'Reset the short evidence timer when phase, direction or policy changes; no fixed opposite-side cooldown',
  risk:'Phase bias cannot downgrade an existing risk label; flag extended impulse without a hard ATR entry cutoff'
 }),
 validation:Object.freeze({kind:'recorded_entry_filter_only',retainedSignals:25,retainedWins:16,removedSignals:10,removedWins:1,
  warning:'These are selected historical entries, not V7.1 live results. Delayed/new entries and changed episode guards require forward data.'})
});

const V711_PROFILE=Object.freeze({
 name:'V7.1.1 · กันไล่ปลายขา',
 basis:'ต่อยอดจาก V7.1.0 โดยเพิ่มตัวกันเฉพาะจังหวะตามแรงที่วิ่งห่างฐานมากและเริ่มเสี่ยงเป็นปลายขา',
 source:Object.freeze({version:'7.1.0',observation:'ไม้แพ้ล่าสุดมีรูปแบบตาม MATURE_IMPULSE ช่วงราคายืดไกลและโดนสวนเร็วซ้ำ'}),
 change:Object.freeze({
  scope:'เฉพาะการตามทิศตลาดใน MATURE_IMPULSE ที่ยืดจากฐานอย่างน้อย 6 ATR',
  rule:'ถ้าราคายืดมากและมี Volume ร้อนหรือเป็นไม้ซ้ำในคลื่นเดียวกัน ให้รอย่อหรือยืนยันใหม่ แทนการไล่เข้าทันที',
  goal:'ลดไม้ภูเขาโดยไม่ลดความถี่ของจังหวะปกติ'
 })
});
const V720_PROFILE=Object.freeze({
 name:'V7.2.0 · Early Watch + Entry Timing',
 basis:'ต่อยอดจาก V7.1.1 live dataset: สัญญาณออกช้า, candidate ถูกบล็อกจนราคาพ้นเขตเข้า และมีไม้ที่โดนสวนเร็วหลังเข้า',
 source:Object.freeze({version:'7.1.1',observation:'แยกปัญหาเป็น 2 ชั้น: มองทิศทาง/จับตาให้เร็ว และอนุญาตเข้าเฉพาะเมื่อ timing ผ่าน'}),
 change:Object.freeze({
  separation:'Direction / WATCH ทำงานอิสระจาก Entry Gate เพื่อไม่ให้เงียบทั้งที่ตลาดเริ่มมีทิศ',
  timing:'สถานะใหม่ WATCH → READY → ENTER → TOO LATE พร้อมเหตุผลว่ากำลังรอเงื่อนไขใด',
  transition:'TRANSITION ยังชอบแท่งปิดยืนยัน แต่อนุญาต live acceptance ได้เมื่อ displacement + body + flow + evidence แข็งแรงพร้อมกันและยังไม่ยืดเกินไป',
  late:'กันการออกจุดเข้าปลายขาด้วย extension + room + live heat แทนการรอถึง 6 ATR อย่างเดียว',
  learning:'บันทึก WATCH +10 นาที และ snapshot แท่งเทียนตอน WATCH/ตอนเข้า แยก input ออกจาก future outcome เพื่อใช้เทรนรอบถัดไป'
 })
});
const ARIS_V1_PROFILE=Object.freeze({
 name:'ARIS V1 · T+10 Edge Engine',
 basis:'สูตรใหม่แยกจาก V7.2: Direction → Setup → Timing; ลดกฎซ้ำและไม่เรียก market bias ว่า calibrated win probability',
 source:Object.freeze({version:'independent-v1',observation:'V7.2 forward sample ราว 40 ไม้อยู่ใกล้ 50%; หลังเริ่มใช้ ARIS V1 พบ live behavior ว่า WATCH มาช้าแล้วชน late guard จึงปรับ threshold ภายใน V1 ให้จับต้นขาเร็วขึ้น โดยคง Direction→Setup→Timing เดิม'}),
 change:Object.freeze({
  direction:'Bias 5 ตัว: EMA trend 30% + EMA21 slope 20% + momentum 20% + acceleration 15% + live flow 15%; order book เป็น tie-breaker ไม่เกิน 4%',
  setup:'5 setup: Early Impulse, Pullback Reclaim, Range Rejection, Confirmed Reversal และ Live Opportunity เพื่อไม่พลาดเมื่อไม่ได้จับ exact cross tick',
  timing:'Timing 0–100 = Fresh 30 + Room 20 + Flow 20 + Retreat 15 + Candle 15; ปรับ V1 ให้จับเร็วขึ้น: READY ≥54, ENTER ≥64',
  late:'แก้ WATCH → TOO LATE เร็วเกิน: soft late เริ่ม 1.85 ATR, hard late 2.40 ATR หรือพ้น trigger 0.46 ATR',
  learning:'เก็บ Bias/Timing/components/WATCH/entry/outcome + setup type + revision เพื่อแยกผล Live Opportunity ออกจากจุดเข้าแบบ trigger เดิม',
  addOn:'ไม่จำกัด 1 ไม้ต่อทิศ ถ้าเกิด setup/trigger ใหม่จริงและผ่าน Bias + Timing + Entry Gate เต็มอีกครั้ง สามารถเติมได้'
 })
});
const ARIS_V11_PROFILE=Object.freeze({
 name:'ARIS V1.1 · Faster Entry',
 basis:'ต่อยอดจาก ARIS V1.0 เพื่อเพิ่มโอกาสได้จุดเข้าเร็วขึ้น โดยคลาย Setup + Timing ที่ซ้อนกันเกินไป แต่คง late guard และ live confirmation เดิม',
 source:Object.freeze({version:'ARIS-1.0.0',observation:'V1.0 เห็นทิศได้ แต่แทบไม่ออกออเดอร์ เพราะ Bias/Setup/Timing/Flow gate ซ้อนกัน และบาง setup พลาดเมื่อไม่ได้จับ exact cross tick'}),
 change:Object.freeze({
  bias:'READY |Bias| ≥ 0.22 · ENTER |Bias| ≥ 0.29',
  timing:'READY ≥ 50/100 · ENTER ≥ 59/100',
  liveOpportunity:'flow ≥ 0.025 · room ≥ 0.24 ATR · extension ≤ 1.60 ATR · progress -0.08 ถึง 0.45 ATR',
  earlyImpulse:'flow ≥ 0.04 · progress 0.03 ถึง 0.35 ATR',
  pullback:'อนุญาต live reclaim หลังพลาด exact cross เมื่อ progress 0.01 ถึง 0.30 ATR',
  candidate:'ยืดอายุ candidate จาก 15 เป็น 30 วินาที',
  safety:'คง soft/hard late guard และยืนยันข้อมูลสด 2 ticks / 400 ms'
 })
});
const ARIS_V12_PROFILE=Object.freeze({
 name:'ARIS V1.2 · Breakout + Recovery',
 basis:'ต่อยอด V1.1 โดยแก้ช่องว่างหลังพลาดจังหวะแรก: follow breakout ที่ยังสด และมีแผนต่อหลัง TOO LATE แทนการค้างคำว่าไม่ไล่',
 source:Object.freeze({version:'ARIS-1.1.0',observation:'V1.1 เข้าไวขึ้นแต่เมื่อ breakout วิ่งเร็ว ระบบยังพลาดจังหวะแรกได้ และ late guard เดิมไม่มี recovery state ที่กลับมาหาจุดเข้าใหม่อย่างเป็นระบบ'}),
 change:Object.freeze({
  breakout:'เพิ่ม Breakout Follow: ทะลุกรอบจริง + flow + แท่งสด/volume/phase สนับสนุน + ยังไม่ยืดเกิน สามารถ follow ได้ก่อนรอ confirmation หนักแบบเดิม',
  recovery:'หลัง TOO LATE เก็บ Late Plan 3 นาที: รอย่อแล้ว reclaim ตามขาเดิม หรือถ้า exhaustion + flow พลิก + structure break จึงค่อยจับ reversal',
  timing:'จุด recovery วัด freshness จาก pivot/reclaim ใหม่ ไม่บังคับวัดจาก EMA21 อย่างเดียว แต่ยังมี macro hard guard 3.60 ATR กันไล่ขาที่สุดโต่ง',
  safety:'ไม่ใช้กฎ ช้าแล้วสวน; reversal ต้องมีหลักฐาน phase/ exhaustion + flow + micro structure และยังยืนยันสด 2 ticks / 400 ms เหมือนเดิม'
 })
});
const ARIS_V2_PROFILE=Object.freeze({name:'ARIS V2 · Market Observer',basis:'เครื่องยนต์ใหม่: Observe → Memory → State → Story → Hypothesis → Playbook → Entry → Re-plan → Learning',change:Object.freeze({observer:'เฝ้าพฤติกรรมตลาดต่อเนื่อง ไม่รอ setup อย่างเดียว',sideway:'แยก Fresh/Balance/Compression/Edge pressure/Fake break/Range failure',candle:'อ่าน candle sequence, shock, rejection, compression, failed expansion',fib:'ใช้ Fibonacci 23.6/38.2/50/61.8/78.6 และ extension เป็น confluence',zones:'เฝ้าแนวรับแนวต้านและ trend-change risk',planning:'ทุกบริบทมี Trigger + Invalidation + Next plan',ui:'ใช้ Block 1/2/3 เดิมผ่าน adapter'})});
const ARIS_V3_PROFILE=Object.freeze({name:'ARIS V3 · Episode-Gated Structure',basis:'ต่อยอดบทเรียนจาก ARIS V2 โดยแยก Market Episode และบังคับ Structure → Location → Behavior → Micro เป็น independent gates',source:Object.freeze({version:'ARIS-2.0.0',kind:'recorded_entry_research',warning:'ผลย้อนหลังเป็น exploratory/in-sample ต้อง replay + validation + forward shadow'}),change:Object.freeze({episode:'หนึ่งเรื่องตลาดไม่ควรสร้างไม้ใหม่ทุกครั้งที่ Volume/Playbook เปลี่ยน',structure:'Structure เป็น boss gate และคะแนนอื่นชดเชยไม่ได้',volume:'Volume เป็น Event Detector ไม่ใช่ Trigger',playbooks:'เริ่มด้วย Breakout Continuation / Shock Resolution / Pullback-Reclaim / Confirmed Reversal',reentry:'ปกติหนึ่ง entry ต่อ structural leg; ต้องเกิดฐาน/leg ใหม่จึงออกเพิ่ม',micro:'Flow/Book ใช้ confirm หลังมี thesis แล้ว',causality:'ใช้เฉพาะ entry-time data เป็น predictor; follow-up/outcome เป็น labels เท่านั้น'})});
const V65_PROFILE=Object.freeze({
 name:'V6.5 Inverse All',
 basis:'legacy V6.5 engine',
 change:Object.freeze({direction:'กลับทิศ output ของ setup ทุกประเภท',entry:'ใช้ regime + setup trigger แบบ V6 เดิม',zones:'1m support/resistance'})
});
const V66_PROFILE=Object.freeze({
 name:'V6.6 Statistical Entry',
 basis:'V6.5 observed T+10 dataset',
 source:Object.freeze({version:'6.5.0',completedSignals:52,wins:30,winRate:.576923,detailedSignals:20}),
 change:Object.freeze({
  breakout:'inverse setup',
  pullback:'inverse setup',
  range_reversal:'สวน Trend 1m เมื่อ strength ผ่าน',
  failed_break:'สวน Trend 1m เมื่อ strength ผ่าน',
  trend_continuation:'candidate only'
 })
});
const VERSION_PROFILE=SELECTED_ENGINE_VERSION==='6.5.0'?V65_PROFILE:SELECTED_ENGINE_VERSION==='6.6.0'?V66_PROFILE:SELECTED_ENGINE_VERSION==='7.0.0'?V70_PROFILE:SELECTED_ENGINE_VERSION==='7.0.1'?V701_PROFILE:SELECTED_ENGINE_VERSION==='7.1.0'?V710_PROFILE:SELECTED_ENGINE_VERSION==='7.1.1'?V711_PROFILE:SELECTED_ENGINE_VERSION==='7.2.0'?V720_PROFILE:SELECTED_ENGINE_VERSION==='ARIS-3.0.0'?ARIS_V3_PROFILE:SELECTED_ENGINE_VERSION==='ARIS-2.0.0'?ARIS_V2_PROFILE:SELECTED_ENGINE_VERSION==='ARIS-1.2.0'?ARIS_V12_PROFILE:SELECTED_ENGINE_VERSION==='ARIS-1.1.0'?ARIS_V11_PROFILE:ARIS_V1_PROFILE;
const V65_CONFIG=Object.freeze({
 horizonMs:600000,settlementToleranceMs:5000,rangeBars:12,atrBars:14,breakBuffer:.06,maxBreakEntry:.65,maxFailureEntry:.65,maxRangeEntry:.42,maxTrendEntry:.55,
 maxDrift:.42,maxAgeMs:50000,minEvidenceMs:550,minEvidenceTicks:2,minFlow:.04,flowWarmupSec:12,roomAtr:.24,maxRetreat:.34,pullbackMin:.24,pullbackMax:1.20,
 rangeEdge:.26,rangeEntryLimit:.40,rangeMinSamples:3,rangeMinWinRate:.58,rangeMinScore:5,breakoutMinScore:5,maxHistory:1500,maxAudit:2500
});
const V66_CONFIG=Object.freeze({...V65_CONFIG,version:'6.6.0',statsTrendMin:.10,failedBreakTrendMin:.15});
const V70_CONFIG=Object.freeze({
 version:'7.0.0',horizonMs:600000,settlementToleranceMs:5000,
 rangeBars:12,atrBars:14,breakBuffer:.06,maxBreakEntry:.65,maxFailureEntry:.65,maxRangeEntry:.42,maxTrendEntry:.55,
 maxDrift:.42,maxAgeMs:50000,minEvidenceMs:550,minEvidenceTicks:2,
 minFlow:.04,flowWarmupSec:12,roomAtr:.24,maxRetreat:.34,pullbackMin:.24,pullbackMax:1.20,
 rangeEdge:.26,rangeEntryLimit:.40,rangeMinSamples:3,rangeMinWinRate:.58,rangeMinScore:5,breakoutMinScore:5,
 phaseTrendMin:.24,impulseBodyAtr:.55,impulseRangeAtr:.80,impulseRelVol:1.45,impulseVolume3:1.25,
 matureExtensionAtr:1.45,climaxExtensionAtr:2.25,climaxRelVol:2.40,exhaustionScoreMin:2,
 episodeWindowMs:480000,episodeAtrDistance:3,maxSameDirectionPerEpisode:2,minSameDirectionGapMs:90000,
 maxHistory:1500,maxAudit:2500
});
const V701_CONFIG=Object.freeze({...V70_CONFIG,version:'7.0.1',rangeEdgeFollowPosition:.10,rangeEdgeBreakAtr:.10,rangeEdgeAcceptedCloseAtr:.04});
const VERSION_SETTINGS_SEED=Object.freeze({
 '6.5.0':Object.freeze({name:'V6.5 Inverse All',config:V65_CONFIG,strategy:Object.freeze({direction:'inverse_all_setup_directions',zones:'1m_support_resistance',trendlines:false})}),
 '6.6.0':Object.freeze({name:'V6.6 Statistical Entry',config:V66_CONFIG,strategy:Object.freeze({direction:'setup_specific_inverse_or_countertrend',basis:'V6.5 observed dataset',zones:'1m_support_resistance',trendlines:false})}),
 '7.0.0':Object.freeze({name:'V7.0 Market Phase + Volume/Impulse',config:V70_CONFIG,strategy:V70_PROFILE}),
 '7.0.1':Object.freeze({name:'V7.0.1 Range Edge Confirmation',config:V701_CONFIG,strategy:V701_PROFILE}),
 '7.1.0':Object.freeze({name:V710_PROFILE.name,config:V710_CONFIG,strategy:V710_PROFILE}),
 '7.1.1':Object.freeze({name:V711_PROFILE.name,config:V711_CONFIG,strategy:V711_PROFILE}),
 '7.2.0':Object.freeze({name:V720_PROFILE.name,config:V720_CONFIG,strategy:V720_PROFILE}),
 'ARIS-1.0.0':Object.freeze({name:ARIS_V1_PROFILE.name,config:ARIS_V1_CONFIG,strategy:ARIS_V1_PROFILE}),
 'ARIS-1.1.0':Object.freeze({name:ARIS_V11_PROFILE.name,config:ARIS_V11_CONFIG,strategy:ARIS_V11_PROFILE}),
 'ARIS-1.2.0':Object.freeze({name:ARIS_V12_PROFILE.name,config:ARIS_V12_CONFIG,strategy:ARIS_V12_PROFILE}),
 'ARIS-2.0.0':Object.freeze({name:ARIS_V2_PROFILE.name,config:ARIS_V2_CONFIG,strategy:ARIS_V2_PROFILE}),
 'ARIS-3.0.0':Object.freeze({name:ARIS_V3_PROFILE.name,config:ARIS_V3_CONFIG,strategy:ARIS_V3_PROFILE})
});
// Permanent code-resident lineage. This is intentionally NOT stored in localStorage:
 // opening the app from another computer/device must still preserve why each engine existed.
const VERSION_LINEAGE_ARCHIVE=Object.freeze({
 '6.5.0':Object.freeze({
  parent:null,status:'legacy_hidden',
  story:'จุดเริ่มยุคทดลองกลับฝั่งของ setup เพื่อทดสอบว่าจุดเข้าตามภาพตรงหน้าถูกสวนในกรอบ +10 นาทีบ่อยหรือไม่',
  lesson:'การตาม setup ตรง ๆ ไม่ได้ดีกว่าเสมอ แต่การกลับทุก setup ก็สุดโต่งเกินไป',
  ledTo:'6.6.0'
 }),
 '6.6.0':Object.freeze({
  parent:'6.5.0',status:'visible_reference',
  story:'เอาผลจริงจาก 6.5 มาช่วยตัดสินเป็นราย setup แทนการกลับทุกอย่างแบบเดียวกัน',
  lesson:'สถิติของ setup ช่วยได้ แต่ถ้าไม่รู้ว่ากำลังอยู่ต้นขา กลางขา หรือปลายขา ก็ยังยิงซ้ำผิดใน impulse เดียวได้',
  ledTo:'7.0.0'
 }),
 '7.0.0':Object.freeze({
  parent:'6.6.0',status:'legacy_hidden',
  story:'เพิ่ม Market Phase, Volume และ Impulse เพื่อให้รู้ว่าตลาดกำลังอยู่ช่วงไหนของการเคลื่อนที่ ไม่ใช่รู้แค่ทิศ',
  lesson:'ต้องแยก early/mid impulse ออกจาก climax และต้องระวังการตามแรงเข้าขอบ range ที่ยังไม่แตก',
  ledTo:'7.0.1'
 }),
 '7.0.1':Object.freeze({
  parent:'7.0.0',status:'legacy_hidden',
  story:'เพิ่มการยืนยันขอบกรอบก่อนตาม trend/impulse เพื่อไม่ให้วิ่งตามแรงตรงเข้ากำแพง range',
  lesson:'บริบทขอบกรอบต้องเป็น gate จริง ไม่ใช่แค่ข้อมูลประกอบ',
  ledTo:'7.1.0'
 }),
 '7.1.0':Object.freeze({
  parent:'7.0.1',status:'legacy_hidden',
  story:'จัดกฎ phase, transition และ confirmation ให้เป็นเหตุเป็นผลขึ้นจากการ audit ไม้ที่บันทึกไว้',
  lesson:'ตัวกรองช่วยลดไม้เสียได้ แต่ถ้าซ้อนมากเกินไปอาจทำให้จุดเข้าช้า',
  ledTo:'7.1.1'
 }),
 '7.1.1':Object.freeze({
  parent:'7.1.0',status:'legacy_hidden',
  story:'เพิ่มตัวกันไล่ปลายขาเฉพาะ Mature Impulse หลังพบรูปแบบตามแรงไกลแล้วโดนสวนเร็ว',
  lesson:'รู้ทิศถูกยังไม่พอ ต้องรู้ว่าราคาแพงเกินจะตามหรือยัง',
  ledTo:'7.2.0'
 }),
 '7.2.0':Object.freeze({
  parent:'7.1.1',status:'visible_reference',
  story:'แยกการมองทิศ/WATCH ออกจาก Entry Gate และเพิ่ม WATCH → READY → ENTER → TOO LATE เพื่อจับตลาดให้เร็วขึ้นโดยยังคุม timing',
  lesson:'การเพิ่ม gate อย่างเดียวทำให้ปลอดภัยขึ้นแต่พลาดต้นขาได้ จึงต้องแยกการมองเห็นออกจากการอนุญาตเข้า',
  ledTo:'ARIS-1.0.0'
 }),
 'ARIS-1.0.0':Object.freeze({
  parent:'7.2.0',status:'legacy_hidden',
  story:'เริ่มเครื่องยนต์ใหม่แบบ Direction → Setup → Timing ลดกฎซ้ำและแยกน้ำหนักทิศออกจากความน่าจะชนะ',
  lesson:'โครงสร้างชัดขึ้น แต่ gate ซ้อนกันยังทำให้ WATCH มาช้าและออกไม้น้อย',
  ledTo:'ARIS-1.1.0'
 }),
 'ARIS-1.1.0':Object.freeze({
  parent:'ARIS-1.0.0',status:'legacy_hidden',
  story:'คลาย threshold และยืดอายุ candidate เพื่อให้เข้าเร็วขึ้น พร้อมยอมรับ live reclaim แม้พลาด exact cross tick',
  lesson:'เข้าไวขึ้น แต่ breakout ที่วิ่งเร็วยังพลาดจังหวะแรก และ TOO LATE ยังไม่มีแผนต่อ',
  ledTo:'ARIS-1.2.0'
 }),
 'ARIS-1.2.0':Object.freeze({
  parent:'ARIS-1.1.0',status:'visible_reference',
  story:'เพิ่ม Breakout Follow และ Late Recovery Plan ให้หลังมาช้าแล้วยังรอย่อตามขาเดิม หรือค่อยสวนเมื่อ reversal มีหลักฐานจริง',
  lesson:'การหาไม้เร็วและ recovery ดีขึ้น แต่ยังมองตลาดเป็นชุด setup มากกว่าการเล่าเรื่องพฤติกรรมทั้งตลาด',
  ledTo:'ARIS-2.0.0'
 }),
 'ARIS-2.0.0':Object.freeze({
  parent:'ARIS-1.2.0',status:'visible_current',
  story:'เปลี่ยนเป็น Observe → Memory → State → Story → Hypothesis → Playbook → Entry → Re-plan → Learning เพื่ออ่านพฤติกรรมต่อเนื่องทั้งตลาด',
  lesson:'ตัวปัจจุบันต้องพิสูจน์ต่อด้วย forward data ว่าการเข้าใจบริบทมากขึ้นช่วยเพิ่มความแม่นโดยไม่ทำให้ช้าเกินไป',
  ledTo:null
 })
});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function ema(a,n){let x=a[0]||0;return a.map(v=>(x+=2/(n+1)*(v-x)));}
function atrOf(b,n=14){
 if(b.length<2)return 0;
 const tr=b.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-b[i].close),Math.abs(x.low-b[i].close)));
 return avg(tr.slice(-n));
}
function horizon10Stats(b,ahead=10){
 const start=Math.max(28,b.length-110),upper={n:0,wins:0,moves:[]},lower={n:0,wins:0,moves:[]};
 for(let i=start;i+ahead<b.length;i++){
  const prior=b.slice(i-14,i);if(prior.length<14)continue;
  const recent=prior.slice(-12),cl=prior.map(x=>x.close),path=cl.slice(-11).slice(1).reduce((s,x,j)=>s+Math.abs(x-cl.slice(-11)[j]),0);
  const eff=path?Math.abs(cl.at(-1)-cl.at(-11))/path:0;
  if(eff>.42)continue;
  const atr=Math.max(atrOf(prior,14),b[i].close*.00008,1e-9);
  const hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low)),width=hi-lo;
  if(width<atr*.9||width>atr*5)continue;
  const pos=(b[i].close-lo)/width;
  if(b[i].close>hi+atr*.08||b[i].close<lo-atr*.08)continue;
  const move=(b[i+ahead].close-b[i].close)/atr;
  if(pos>=.76){upper.n++;upper.moves.push(move);if(move<0)upper.wins++;}
  else if(pos<=.24){lower.n++;lower.moves.push(move);if(move>0)lower.wins++;}
 }
 for(const s of [upper,lower]){
  s.winRate=s.n?s.wins/s.n:.5;
  s.medianMove=s.moves.length?median(s.moves):0;
  delete s.moves;
 }
 return {upper,lower};
}
function features(bars,p,horizonBars=10){
 const b=bars.filter(x=>x.closed).slice(-160);if(b.length<35)return null;
 const c=b.map(x=>x.close),e8=ema(c,8),e21=ema(c,21);
 const atr=Math.max(atrOf(b.slice(-20),14),p*.00008,1e-9),r=b.slice(-CFG.rangeBars);
 const trend=clamp((e8.at(-1)-e21.at(-1))/atr,-1,1),mom=(c.at(-1)-c.at(-4))/atr;
 const momPrev=(c.at(-4)-c.at(-7))/atr,momAccel=mom-momPrev;
 const path=c.slice(-11).slice(1).reduce((s,x,i)=>s+Math.abs(x-c.slice(-11)[i]),0);
 const eff=path?Math.abs(c.at(-1)-c.at(-11))/path:0;
 const high=Math.max(...r.map(x=>x.high)),low=Math.min(...r.map(x=>x.low)),width=Math.max(high-low,atr*.1);
 const fair=median(r.map(x=>x.close));
 const emaSepAtr=Math.abs(e8.at(-1)-e21.at(-1))/atr,emaSlopeAtr=(e21.at(-1)-e21.at(-6))/atr;
 const last=b.at(-1),priorVol=b.slice(-24,-1).map(x=>x.volume).filter(v=>v>0);
 const volumeMedian=Math.max(median(priorVol)||1,1e-9),relVolume=(last?.volume||0)/volumeMedian;
 const volume3Ratio=avg(b.slice(-3).map(x=>x.volume))/volumeMedian;
 const candleRange=Math.max((last?.high||p)-(last?.low||p),1e-9);
 const bodyAtr=Math.abs((last?.close||p)-(last?.open||p))/atr,rangeAtr=candleRange/atr;
 const closeLocation=clamp(((last?.close||p)-(last?.low||p))/candleRange,0,1);
 const upperWickRatio=clamp(((last?.high||p)-Math.max(last?.open||p,last?.close||p))/candleRange,0,1);
 const lowerWickRatio=clamp((Math.min(last?.open||p,last?.close||p)-(last?.low||p))/candleRange,0,1);
 const extensionEma21Atr=(p-e21.at(-1))/atr;
 let impulseSeq=0,lastDir=Math.sign((last?.close||p)-(last?.open||p));
 if(lastDir)for(let i=b.length-1;i>=Math.max(0,b.length-6);i--){const q=b[i],d=Math.sign(q.close-q.open),body=Math.abs(q.close-q.open)/atr;if(d===lastDir&&body>=.20)impulseSeq++;else break;}
 let sideCrosses=0,prevSide=0;
 const start=Math.max(0,c.length-12);
 for(let i=start;i<c.length;i++){
  const delta=c[i]-e21[i],side=Math.abs(delta)<atr*.03?0:(delta>0?1:-1);
  if(side&&prevSide&&side!==prevSide)sideCrosses++;
  if(side)prevSide=side;
 }
 let upperRejects=0,lowerRejects=0;
 for(let i=Math.max(8,b.length-24);i<b.length-1;i++){
  const prior=b.slice(i-8,i);if(prior.length<8)continue;
  const ph=Math.max(...prior.map(x=>x.high)),pl=Math.min(...prior.map(x=>x.low)),cur=b[i],next=b[i+1];
  if(cur.high>ph+atr*.05&&(cur.close<=ph||next.close<=ph))upperRejects++;
  if(cur.low<pl-atr*.05&&(cur.close>=pl||next.close>=pl))lowerRejects++;
 }
 const h10=horizon10Stats(b,horizonBars);
 return {b,atr,high,low,fair,ema8:e8.at(-1),ema21:e21.at(-1),trend,mom,momPrev,momAccel,eff,
  emaSepAtr,emaSlopeAtr,sideCrosses,falseBreaks:upperRejects+lowerRejects,upperRejects,lowerRejects,
  rangeWidthAtr:(high-low)/atr,rangePosition:clamp((p-low)/width,0,1),h10,
  volumeMedian,relVolume,volume3Ratio,bodyAtr,rangeAtr,closeLocation,upperWickRatio,lowerWickRatio,extensionEma21Atr,impulseSeq};
}
const DATASET_SCHEMA='btc-t10-training-v2';
const WATCH_SCHEMA='btc-t10-watch-v1';
function compactBars(bars,n=20){return (bars||[]).filter(x=>x.closed).slice(-n).map(x=>[x.time,x.open,x.high,x.low,x.close,x.volume]);}
function candleLearningSnapshot(bars,atr,n=8){
 const a=Math.max(Number(atr)||0,1e-9);
 return (bars||[]).slice(-n).map(b=>{
  const range=Math.max(b.high-b.low,1e-9),body=b.close-b.open;
  return {time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,closed:!!b.closed,
   direction:body>0?'GREEN':body<0?'RED':'DOJI',bodyAtr:Math.abs(body)/a,rangeAtr:range/a,
   closeLocation:clamp((b.close-b.low)/range,0,1),upperWickAtr:(b.high-Math.max(b.open,b.close))/a,lowerWickAtr:(Math.min(b.open,b.close)-b.low)/a};
 });
}
function candidateFeatures(f,x,type,d,level){const ph=x.phase||null;return {schema:DATASET_SCHEMA,type,modelDirection:d>0?'HIGH':'LOW',detectedPrice:x.price,level,atr:f.atr,flow:Number.isFinite(x.flow)?x.flow:null,book:Number.isFinite(x.book)?x.book:null,coverage:x.coverage||0,bookValid:!!x.bookValid,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,closeLocation:f.closeLocation,impulseSeq:f.impulseSeq,marketPhase:ph?.phase||null,phaseDir:ph?.dir||0,phaseScore:ph?.score||0,liveVolumePace:ph?.liveVolumePace??null,liveBodyAtr:ph?.liveBodyAtr??null,extensionAtr:ph?.extensionAtr??null,exhaustionScore:ph?.exhaustionScore??null,candles:candleLearningSnapshot(x.bars,f.atr,8)};}
function selectOutputDecision(type,modelD,f,phase){
 const modelDirection=modelD>0?'HIGH':'LOW',p=phase||{phase:'TRANSITION',dir:0},setupDir=modelD;
 if(CFG.version==='6.5.0'){
  const inverseDirection=modelD>0?'LOW':'HIGH';
  return {direction:inverseDirection,modelDirection,policy:'v65_inverse_all',strength:Math.abs(f?.trend||0),reason:'V6.5 · กลับฝั่งจาก setup ทุกประเภท'};
 }
 if(CFG.version==='6.6.0'){
  const inverseDirection=modelD>0?'LOW':'HIGH',trend=f?.trend||0,strength=Math.abs(trend);
  if(type==='trend_continuation')return {direction:null,modelDirection,policy:'candidate_only',strength,reason:'V6.6 · Trend continuation เก็บเป็น candidate ก่อน'};
  if(type==='range_reversal'){
   if(strength<CFG.statsTrendMin)return {direction:null,modelDirection,policy:'wait_weak_trend',strength,reason:`V6.6 · Range reversal |Trend| ${strength.toFixed(2)} ยังต่ำกว่า ${CFG.statsTrendMin.toFixed(2)}`};
   return {direction:trend>0?'LOW':'HIGH',modelDirection,policy:'counter_1m_trend',strength,reason:'V6.6 · Range reversal สวน Trend 1m'};
  }
  if(type==='failed_break'){
   if(strength<CFG.failedBreakTrendMin)return {direction:null,modelDirection,policy:'wait_weak_trend',strength,reason:`V6.6 · Failed break |Trend| ${strength.toFixed(2)} ยังต่ำกว่า ${CFG.failedBreakTrendMin.toFixed(2)}`};
   return {direction:trend>0?'LOW':'HIGH',modelDirection,policy:'counter_1m_trend_low_sample',strength,reason:'V6.6 · Failed break สวน Trend 1m'};
  }
  if(type==='breakout')return {direction:inverseDirection,modelDirection,policy:'inverse_breakout',strength,reason:'V6.6 · Breakout ใช้ฝั่งตรงข้าม setup'};
  if(type==='pullback')return {direction:inverseDirection,modelDirection,policy:'inverse_pullback',strength,reason:'V6.6 · Pullback ใช้ฝั่งตรงข้าม setup'};
  return {direction:inverseDirection,modelDirection,policy:'inverse_fallback',strength,reason:'V6.6 · fallback กลับฝั่ง setup'};
 }
 if(['7.0.0','7.0.1'].includes(CFG.version)){
  const follow=()=>({direction:modelDirection,modelDirection,policy:'follow_market_phase',strength:Math.abs(f?.trend||0),reason:'ตาม '+p.phase+' '+(p.dir>0?'ขึ้น':'ลง')+' · setup ไปทิศเดียวกับ phase'});
  if(['IMPULSE','MATURE_IMPULSE','TREND'].includes(p.phase)){
   if(p.dir&&setupDir!==p.dir)return {direction:null,modelDirection,policy:'block_counter_impulse',strength:Math.abs(f?.trend||0),reason:p.phase+' ยังเดินแรง · ห้ามสวน '+(p.dir>0?'ขาขึ้น':'ขาลง')};
   return follow();
  }
  if(p.phase==='EXHAUSTION'){
   if(['range_reversal','failed_break','exhaustion_reversal'].includes(type)&&p.dir&&setupDir===-p.dir)return {direction:modelDirection,modelDirection,policy:'exhaustion_reversal',strength:p.exhaustionScore||0,reason:'ปลายขา + มี exhaustion ยืนยัน · อนุญาตสวน'};
   return {direction:null,modelDirection,policy:'wait_exhaustion_confirmation',strength:p.exhaustionScore||0,reason:'EXHAUSTION · ยังไม่ไล่ตามและยังไม่สวนจนมี reversal trigger'};
  }
  if(p.phase==='REVERSAL'){
   if(!p.dir||setupDir===p.dir)return {direction:modelDirection,modelDirection,policy:'follow_confirmed_reversal',strength:p.exhaustionScore||0,reason:'REVERSAL ยืนยัน · ตามทิศกลับตัว'};
   return {direction:null,modelDirection,policy:'block_against_reversal',strength:p.exhaustionScore||0,reason:'REVERSAL ยืนยันแล้ว · setup สวนทิศกลับตัว'};
  }
  if(p.phase==='RANGE'){
   if(['range_reversal','failed_break'].includes(type))return {direction:modelDirection,modelDirection,policy:'range_edge_reversal',strength:Math.abs(f?.trend||0),reason:'RANGE · ใช้จุดกลับจากขอบตาม setup'};
   if(type==='breakout')return {direction:null,modelDirection,policy:'wait_breakout_acceptance',strength:0,reason:'RANGE · รอ breakout เปลี่ยน phase/ยืนยัน acceptance ก่อน'};
   return {direction:null,modelDirection,policy:'range_blocks_trend_setup',strength:0,reason:'RANGE · ไม่ใช้ trend-follow setup'};
  }
  if(type==='breakout'||type==='failed_break')return {direction:modelDirection,modelDirection,policy:'transition_structure',strength:Math.abs(f?.trend||0),reason:'TRANSITION · ใช้ทิศ setup หลังหลักฐานโครงสร้างผ่าน'};
  if((type==='pullback'||type==='trend_continuation')&&Math.abs(f?.trend||0)>=CFG.phaseTrendMin&&Math.sign(f.trend)===setupDir)return follow();
  if(type==='range_reversal')return {direction:modelDirection,modelDirection,policy:'transition_edge_reversal',strength:Math.abs(f?.trend||0),reason:'TRANSITION · edge reversal ผ่านหลักฐาน'};
  return {direction:null,modelDirection,policy:'wait_transition',strength:Math.abs(f?.trend||0),reason:'TRANSITION · ยังไม่มี phase edge ชัด'};
 }
 if(CFG.version==='ARIS-3.0.0')return {direction:modelDirection,modelDirection,policy:'aris_v3_episode_gate_entry',strength:Math.abs(f?.trend||0),reason:'ARIS V3 · Episode + independent gates ผ่าน'};
 if(CFG.version==='ARIS-2.0.0')return {direction:modelDirection,modelDirection,policy:'aris_v2_story_playbook_entry',strength:Math.abs(f?.trend||0),reason:'ARIS V2 · Market Story + Playbook + Entry ตรงกัน'};
 if(CFG.version.startsWith('ARIS-')&&['early_impulse','pullback_reclaim','range_rejection','confirmed_reversal','live_opportunity','breakout_follow','post_late_reclaim','post_late_reversal'].includes(type))return {direction:modelDirection,modelDirection,policy:'aris_v1_direction_setup_timing',strength:Math.abs(f?.trend||0),reason:'ARIS V1 · Direction + Setup + Timing ตรงกัน'};
 const follow=()=>({direction:modelDirection,modelDirection,policy:'follow_market_phase',strength:Math.abs(f?.trend||0),reason:'ตาม '+p.phase+' '+(p.dir>0?'ขึ้น':'ลง')+' · setup ไปทิศเดียวกับ phase'});
 if(['IMPULSE','MATURE_IMPULSE','TREND'].includes(p.phase)){
  if(p.dir&&setupDir!==p.dir)return {direction:null,modelDirection,policy:'block_counter_impulse',strength:Math.abs(f?.trend||0),reason:p.phase+' ยังเดินแรง · ห้ามสวน '+(p.dir>0?'ขาขึ้น':'ขาลง')};
  return follow();
 }
 if(p.phase==='EXHAUSTION'){
  if(['range_reversal','failed_break','exhaustion_reversal'].includes(type)&&p.dir&&setupDir===-p.dir)return {direction:modelDirection,modelDirection,policy:'exhaustion_reversal',strength:p.exhaustionScore||0,reason:'ปลายขา + มี exhaustion ยืนยัน · อนุญาตสวน'};
  return {direction:null,modelDirection,policy:'wait_exhaustion_confirmation',strength:p.exhaustionScore||0,reason:'EXHAUSTION · ยังไม่ไล่ตามและยังไม่สวนจนมี reversal trigger'};
 }
 if(p.phase==='REVERSAL'){
  if(!p.dir||setupDir===p.dir)return {direction:modelDirection,modelDirection,policy:'follow_confirmed_reversal',strength:p.exhaustionScore||0,reason:'REVERSAL ยืนยัน · ตามทิศกลับตัว'};
  return {direction:null,modelDirection,policy:'block_against_reversal',strength:p.exhaustionScore||0,reason:'REVERSAL ยืนยันแล้ว · setup สวนทิศกลับตัว'};
 }
 if(p.phase==='RANGE'){
  if(['range_reversal','failed_break'].includes(type)){
   const trend=f?.trend,strength=Number.isFinite(trend)?Math.abs(trend):0;
   if(!Number.isFinite(trend)||strength<CFG.rangeCounterTrendMin)return {direction:null,modelDirection,policy:'wait_range_trend',strength,reason:'RANGE · เทรนด์ 1 นาทีอ่อนเกินกว่าจะยืนยันฝั่งสวน'};
   if(setupDir*Math.sign(trend)!==-1)return {direction:null,modelDirection,policy:'block_range_trend_conflict',strength,reason:'RANGE · ทิศกลับจากขอบไม่ตรงกับทิศสวนเทรนด์ 1 นาที'};
   return {direction:modelDirection,modelDirection,policy:'range_counter_trend',strength,reason:'RANGE · ขอบกรอบและทิศสวนเทรนด์ 1 นาทีสอดคล้องกัน'};
  }
  if(type==='breakout')return {direction:null,modelDirection,policy:'wait_breakout_acceptance',strength:0,reason:'RANGE · รอ breakout เปลี่ยน phase/ยืนยัน acceptance ก่อน'};
  return {direction:null,modelDirection,policy:'range_blocks_trend_setup',strength:0,reason:'RANGE · ไม่ใช้ trend-follow setup'};
 }
 if(type==='breakout'||type==='failed_break')return {direction:modelDirection,modelDirection,policy:'transition_structure',strength:Math.abs(f?.trend||0),reason:'TRANSITION · ใช้ทิศ setup หลังหลักฐานโครงสร้างผ่าน'};
 if((type==='pullback'||type==='trend_continuation')&&Math.abs(f?.trend||0)>=CFG.phaseTrendMin&&Math.sign(f.trend)===setupDir)return follow();
 if(type==='range_reversal')return {direction:modelDirection,modelDirection,policy:'transition_edge_reversal',strength:Math.abs(f?.trend||0),reason:'TRANSITION · edge reversal ผ่านหลักฐาน'};
 return {direction:null,modelDirection,policy:'wait_transition',strength:Math.abs(f?.trend||0),reason:'TRANSITION · ยังไม่มี phase edge ชัด'};
}
function rangeEdgeFollowGate(f,x,regime,phase,outputDirection){
 if(CFG.version==='7.0.0')return {applies:false,blocked:false,accepted:true};
 const d=outputDirection==='HIGH'?1:outputDirection==='LOW'?-1:0;
 const followPhase=['TREND','IMPULSE','MATURE_IMPULSE'].includes(phase?.phase)&&phase?.dir===d;
 if(!d||!followPhase||regime?.stableMode!=='RANGE')return {applies:false,blocked:false,accepted:true};
 const atOuterEdge=d>0?f.rangePosition>=1-CFG.rangeEdgeFollowPosition:f.rangePosition<=CFG.rangeEdgeFollowPosition;
 if(!atOuterEdge)return {applies:false,blocked:false,accepted:true};
 const prior=f.b.slice(-(CFG.rangeBars+1),-1);
 if(prior.length<Math.min(8,CFG.rangeBars))return {applies:true,blocked:false,accepted:true,reason:'prior_range_not_ready'};
 const edge=d>0?Math.max(...prior.map(b=>b.high)):Math.min(...prior.map(b=>b.low)),atr=Math.max(f.atr,1e-9);
 const beyondAtr=d>0?(x.price-edge)/atr:(edge-x.price)/atr,closed=f.b.at(-1);
 const closedBeyondAtr=closed?(d>0?(closed.close-edge)/atr:(edge-closed.close)/atr):-Infinity;
 const alignedFlow=d*(x.flow||0),livePace=phase?.liveVolumePace||0;
 const hardBreak=beyondAtr>=CFG.rangeEdgeBreakAtr;
 const acceptedClose=closedBeyondAtr>=CFG.rangeEdgeAcceptedCloseAtr&&alignedFlow>=CFG.minFlow&&livePace>=CFG.impulseRelVol;
 const accepted=hardBreak||acceptedClose;
 return {applies:true,blocked:!accepted,accepted,edge,beyondAtr,closedBeyondAtr,alignedFlow,livePace,hardBreak,acceptedClose};
}
function classifyRegime(f,p){
 let rangeScore=0,trendScore=0;
 if(f.eff<.28)rangeScore+=2;else if(f.eff<.38)rangeScore++;else if(f.eff>.52)trendScore+=2;else if(f.eff>.42)trendScore++;
 if(f.emaSepAtr<.20)rangeScore++;else if(f.emaSepAtr>.38)trendScore++;
 const slope=Math.abs(f.emaSlopeAtr);
 if(slope<.16)rangeScore++;else if(slope>.32)trendScore++;
 if(f.sideCrosses>=3)rangeScore+=2;else if(f.sideCrosses<=1)trendScore++;
 if(f.falseBreaks>=2)rangeScore+=2;else if(f.falseBreaks===1)rangeScore++;
 if(f.rangeWidthAtr<2.2)rangeScore++;
 const upperBreak=p>f.high+f.atr*CFG.breakBuffer,lowerBreak=p<f.low-f.atr*CFG.breakBuffer;
 const breakoutDir=upperBreak?1:lowerBreak?-1:0;
 const last=f.b.at(-1),prior=f.b.slice(-13,-1);let acceptedDir=0;
 if(last&&prior.length>=10){
  const ph=Math.max(...prior.map(x=>x.high)),pl=Math.min(...prior.map(x=>x.low));
  if(last.close>ph+f.atr*.06&&last.low>ph-f.atr*.10)acceptedDir=1;
  else if(last.close<pl-f.atr*.06&&last.high<pl+f.atr*.10)acceptedDir=-1;
 }
 if(acceptedDir)trendScore+=2;
 let raw=rangeScore>=5&&rangeScore>=trendScore+2?'RANGE':trendScore>=4&&trendScore>=rangeScore+1?'TREND':'TRANSITION';
 if(breakoutDir)raw='TRANSITION';else if(acceptedDir)raw='TREND';
 return {raw,mode:raw,rangeScore,trendScore,breakoutCandidate:!!breakoutDir,breakoutDir,acceptedDir,
  position:f.rangePosition,eff:f.eff,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,sideCrosses:f.sideCrosses,
  falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects};
}
function marketPhase(f,x,regime){
 const live=x.current||x.bars?.at(-1)||f.b.at(-1),atr=Math.max(f.atr,1e-9),p=x.price;
 const elapsed=live&&Number.isFinite(x.ts)?clamp(x.ts/1000-live.time,8,60):60,frac=clamp(elapsed/60,.25,1);
 const liveVolumePace=live?clamp((live.volume/frac)/Math.max(f.volumeMedian,1e-9),0,10):f.relVolume;
 const liveHigh=Math.max(live?.high??p,p),liveLow=Math.min(live?.low??p,p),liveRange=Math.max(liveHigh-liveLow,1e-9);
 const liveBodyAtr=live?Math.abs(p-live.open)/atr:0,liveRangeAtr=liveRange/atr,liveDir=live?Math.sign(p-live.open):0;
 const liveCloseLocation=clamp((p-liveLow)/liveRange,0,1);
 const trendDir=Math.abs(f.trend)>=.18?Math.sign(f.trend):(Math.abs(f.mom)>=.25?Math.sign(f.mom):liveDir);
 const dir=trendDir||liveDir||0,flowAligned=dir*(x.flow||0),bookAligned=dir*(x.bookValid?x.book||0:0);
 const extensionAtr=dir?dir*(p-f.ema21)/atr:0,alignedClose=dir>0?liveCloseLocation:dir<0?1-liveCloseLocation:.5;
 const oppositeWick=dir>0?(liveHigh-p)/liveRange:dir<0?(p-liveLow)/liveRange:0;
 const relVol=Math.max(f.relVolume||0,f.volume3Ratio||0,liveVolumePace||0);
 const priceExpansion=Math.max(f.bodyAtr||0,f.rangeAtr||0,liveBodyAtr,liveRangeAtr);
 let score=0;
 if(dir&&dir*f.trend>=.30)score++;
 if(dir&&dir*f.mom>=.30)score++;
 if(priceExpansion>=CFG.impulseBodyAtr||liveRangeAtr>=CFG.impulseRangeAtr)score++;
 if(relVol>=CFG.impulseRelVol||f.volume3Ratio>=CFG.impulseVolume3)score++;
 if(flowAligned>=.08)score++;
 if(alignedClose>=.66)score++;
 if(dir&&dir*f.emaSlopeAtr>=.16)score++;
 const impulse=!!dir&&score>=4&&(priceExpansion>=CFG.impulseBodyAtr||liveRangeAtr>=CFG.impulseRangeAtr)&&(relVol>=CFG.impulseRelVol||f.volume3Ratio>=CFG.impulseVolume3);
 let exhaustionScore=0;
 const climaxBase=!!dir&&extensionAtr>=CFG.climaxExtensionAtr&&relVol>=CFG.climaxRelVol;
 if(climaxBase){
  if(oppositeWick>=.22)exhaustionScore++;
  if(dir*f.momAccel<=-.18)exhaustionScore++;
  if(flowAligned<=-.05)exhaustionScore++;
  if(bookAligned<=-.12&&x.bookValid)exhaustionScore++;
  if(liveDir===-dir&&liveBodyAtr>=.18)exhaustionScore++;
 }
 const reversal=climaxBase&&exhaustionScore>=3&&liveDir===-dir&&flowAligned<-.06&&dir*(p-f.ema8)<-.08;
 let phase='TRANSITION',phaseDir=dir;
 if(reversal){phase='REVERSAL';phaseDir=-dir;}
 else if(climaxBase&&exhaustionScore>=CFG.exhaustionScoreMin)phase='EXHAUSTION';
 else if(impulse&&(extensionAtr>=CFG.matureExtensionAtr||f.impulseSeq>=3))phase='MATURE_IMPULSE';
 else if(impulse)phase='IMPULSE';
 else if(regime?.mode==='RANGE')phase='RANGE';
 else if(regime?.mode==='TREND'&&dir)phase='TREND';
 return {phase,dir:phaseDir||0,priorDir:dir||0,score,exhaustionScore,extensionAtr,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,liveVolumePace,liveBodyAtr,liveRangeAtr,liveCloseLocation,oppositeWick,flowAligned,bookAligned,impulseSeq:f.impulseSeq,climaxBase};
}
// 1m swing points only: two closed candles on either side are required.
function confirmedSwings(bars,atr,limit=150){
 const b=bars.filter(x=>x.closed).slice(-limit),highs=[],lows=[];
 for(let i=2;i<b.length-2;i++){
  const p=b[i],left=b.slice(i-2,i),right=b.slice(i+1,i+3);
  const highPivot=left.every(x=>p.high>x.high)&&right.every(x=>p.high>=x.high);
  const lowPivot=left.every(x=>p.low<x.low)&&right.every(x=>p.low<=x.low);
  const highProminence=p.high-Math.max(Math.min(...left.map(x=>x.low)),Math.min(...right.map(x=>x.low)));
  const lowProminence=Math.min(Math.max(...left.map(x=>x.high)),Math.max(...right.map(x=>x.high)))-p.low;
  if(highPivot&&highProminence>=atr*.45)highs.push({time:p.time,price:p.high,confirmedAt:b[i+2].time,prominence:highProminence});
  if(lowPivot&&lowProminence>=atr*.45)lows.push({time:p.time,price:p.low,confirmedAt:b[i+2].time,prominence:lowProminence});
 }
 return {highs,lows,lastClosed:b.at(-1)?.time||0};
}
// Horizontal 1m support/resistance zones; merge repeated tests to avoid clutter.
function zones(bars,atr){
 const b=bars.filter(x=>x.closed).slice(-100);if(!b.length)return [];
 const swings=confirmedSwings(b,atr,100),out=[
  ...swings.highs.map(p=>({...p,kind:'resistance',touches:1})),
  ...swings.lows.map(p=>({...p,kind:'support',touches:1}))
 ].sort((a,b)=>a.time-b.time),merged=[];
 for(const z of out){
  const hit=merged.find(x=>x.kind===z.kind&&Math.abs(x.price-z.price)<=atr*.28);
  if(hit){hit.price=(hit.price*hit.touches+z.price)/(hit.touches+1);hit.touches++;
   hit.confirmedAt=Math.max(hit.confirmedAt,z.confirmedAt);
   hit.prominence=Math.max(hit.prominence,z.prominence);}
  else merged.push({...z});
 }
 // In a one-way move no confirmed pivot may exist; show the last 30 closed-bar extreme as a range boundary.
 const recent=b.slice(-30);
 if(!merged.some(x=>x.kind==='support'))merged.push({price:Math.min(...recent.map(x=>x.low)),confirmedAt:b.at(-1).time,kind:'support',touches:0,source:'range'});
 if(!merged.some(x=>x.kind==='resistance'))merged.push({price:Math.max(...recent.map(x=>x.high)),confirmedAt:b.at(-1).time,kind:'resistance',touches:0,source:'range'});
 return merged;
}

function legacyV6Step(x){
  const f=features(x.bars,x.price,x.horizonBars||10);if(!f)return {status:'warmup',reason:'รอแท่ง 1 นาทีที่สมบูรณ์',signal:null};
  const z=zones(x.bars||[],f.atr),regime=this.trackRegime(f,x.price),base={f,z,regime,phase:null,watch:null,signal:null,event:null,continuation:0,reversal:0};
  if(!x.fresh){this.reset('ข้อมูลไม่พร้อม',x.ts);return {...base,status:'offline',reason:'พักสัญญาณจนข้อมูลสดและต่อเนื่อง'};}
  if(x.id===this.lastId)return {...(this.lastView||base),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  this.lastId=x.id;
  const prev=this.previous;this.previous={price:x.price,ts:x.ts};
  if(!prev||x.ts-prev.ts>5000){this.active=null;return this.lastView={...base,status:'warming',reason:'ตั้งต้นราคาสด รอเหตุการณ์ใหม่'};}

  if(!this.active){
   const crossedUp=prev.price<=f.high+f.atr*CFG.breakBuffer&&x.price>f.high+f.atr*CFG.breakBuffer;
   const crossedDown=prev.price>=f.low-f.atr*CFG.breakBuffer&&x.price<f.low-f.atr*CFG.breakBuffer;
   if(crossedUp)this.start('breakout',1,f.high,x,f,`B+:${f.high.toFixed(2)}`,{fromRange:regime.stableMode==='RANGE'});
   else if(crossedDown)this.start('breakout',-1,f.low,x,f,`B-:${f.low.toFixed(2)}`,{fromRange:regime.stableMode==='RANGE'});
   else if(regime.mode==='RANGE'){
    const pos=regime.position,d=pos<=CFG.rangeEntryLimit?1:pos>=1-CFG.rangeEntryLimit?-1:0;
    if(d){
     const level=d>0?f.low:f.high,live=x.bars.at(-1),inward=d*(x.price-prev.price)>0;
     const rejectMove=live?(d>0?x.price-live.low:live.high-x.price)/f.atr:0;
     const ev=this.rangeEvidence(f,d,x,rejectMove,0);
     if(inward&&rejectMove>=.045&&ev.score>=3)this.start('range_reversal',d,level,x,f,`R${d}:${level.toFixed(2)}:${live.time}`,{
      h10N:ev.stat.n,h10WinRate:ev.stat.winRate,h10MedianMove:ev.stat.medianMove,edgeRejects:ev.rejects,evidenceScore:ev.score,evidenceWhy:ev.why
     });
    }
   }else if(regime.mode==='TREND'){
    const b=f.b,last=b.at(-1),before=b.slice(-7,-1),d=f.trend>.12?1:f.trend<-.12?-1:0;
    if(d&&last&&before.length){
     const peak=d>0?Math.max(...before.map(y=>y.high)):Math.min(...before.map(y=>y.low));
     const trough=d>0?last.low:last.high,depth=d*(peak-trough)/f.atr,level=d>0?last.high:last.low;
     const structure=d*(last.close-f.ema21)>-.35*f.atr;
     if(depth>=CFG.pullbackMin&&depth<=CFG.pullbackMax&&structure&&d*(prev.price-level)<=0&&d*(x.price-level)>0)this.start('pullback',d,level,x,f,`P${d}:${last.time}`);
     else{
      const contLevel=d>0?last.high:last.low,continuation=d*f.trend>=.24&&d*f.mom>=.16&&d*(last.close-f.ema21)>0&&d*(prev.price-contLevel)<=0&&d*(x.price-contLevel)>0;
      if(continuation)this.start('trend_continuation',d,contLevel,x,f,`C${d}:${last.time}`);
     }
    }
   }
  }

  let e=this.active;
  if(!e){
   const reason=regime.mode==='RANGE'?(regime.position<=CFG.rangeEntryLimit||regime.position>=1-CFG.rangeEntryLimit?'SIDEWAY · อยู่ขอบ แต่ rejection ยังไม่พอ':'SIDEWAY · อยู่กลางกรอบ'):regime.mode==='TREND'?'TREND · โครงสร้างมี แต่ยังไม่มี trigger':'TRANSITION · กราฟยังไม่ชัด';
   return this.lastView={...base,status:'watch',reason,gate:{state:'WATCH',direction:null,blocker:reason,waitingFor:[reason],metrics:null}};
  }

  if(!e.issued&&regime.stableMode==='RANGE'&&e.type==='pullback'){
   this.log('cancelled',x.ts,{id:e.id,reason:'ตลาดเปลี่ยนเป็น sideway'});this.active=null;
   return this.lastView={...base,status:'watch',reason:'SIDEWAY · ยกเลิก setup เทรนด์ก่อนออกสัญญาณ'};
  }

  if(e.type==='breakout'&&e.d*(x.price-e.level)<-.08*e.atr){
   this.log('failed_break',x.ts,{id:e.id,issued:e.issued});
   if(e.issued){const prior=this.signals.find(s=>s.id===e.id);if(prior){prior.setupStatus='invalidated';prior.invalidatedAt=x.ts;}}
   const old=e;this.active=null;
   if(old.fromRange||regime.stableMode==='RANGE'){
    const d=-old.d,ev=this.rangeEvidence(f,d,x,.10,0);
    if(ev.edgeOK&&ev.score>=3){
     this.start('range_reversal',d,old.level,x,f,`RF:${old.id}`,{h10N:ev.stat.n,h10WinRate:ev.stat.winRate,h10MedianMove:ev.stat.medianMove,edgeRejects:ev.rejects,evidenceScore:ev.score,evidenceWhy:ev.why,fromFailedBreak:true});e=this.active;
    }else return this.lastView={...base,status:'watch',reason:'SIDEWAY · เบรกไม่ผ่าน แต่จุดกลับยังไม่มี edge พอ'};
   }else{this.start('failed_break',-old.d,old.level,x,f,`F:${old.id}`);e=this.active;}
  }
  if(!e)return {...base,status:'watch',reason:'รอเหตุการณ์ใหม่'};

  e.extreme=e.d>0?Math.max(e.extreme,x.price):Math.min(e.extreme,x.price);
  const progress=e.d*(x.price-e.level)/e.atr,drift=e.d*(x.price-e.startPrice)/e.atr,retreat=e.d*(e.extreme-x.price)/e.atr,flow=e.d*(x.flow||0),book=x.bookValid?e.d*(x.book||0):0;
  const room=z.filter(y=>e.d*(y.price-x.price)>0).map(y=>e.d*(y.price-x.price)/e.atr).sort((a,b)=>a-b)[0]??Infinity;
  const continuation=Math.round(clamp(35+flow*45+book*10+Math.min(.3,Math.max(0,progress))*35-retreat*50,0,100));
  const reversal=Math.round(clamp(20-flow*35+retreat*65+Math.max(0,progress-.6)*25,0,100));
  const view={...base,event:{...e},continuation,reversal,room};

  if(e.issued){
   if(progress<-.18){this.log('invalidated',x.ts,{id:e.id});const prior=this.signals.find(s=>s.id===e.id);if(prior){prior.setupStatus='invalidated';prior.invalidatedAt=x.ts;}this.active=null;return this.lastView={...view,status:'invalidated',reason:'สัญญาณออกไปแล้ว · เงื่อนไขหลังเข้าเสีย'};}
   if(x.ts-e.startedAt>60000)this.active=null;
   return this.lastView={...view,status:'issued',reason:'จุดเข้าออกแล้ว · ล็อกสัญญาณเดิมจนตัดสิน +10 นาที'};
  }

  let invalid='';
  if(x.ts-e.startedAt>CFG.maxAgeMs)invalid='จังหวะหมดอายุ';
  else if(progress>e.maxEntry||drift>CFG.maxDrift)invalid='ราคาวิ่งพ้นเขตเข้าก่อนออกสัญญาณ';
  else if(progress<-.18)invalid='เสียโครงสร้างก่อนออกสัญญาณ';
  if(e.type==='range_reversal'){
   const inside=e.d>0?f.rangePosition<=CFG.rangeEntryLimit:f.rangePosition>=1-CFG.rangeEntryLimit;
   if(!inside)invalid='ราคาเข้ากลางกรอบแล้ว จุดเข้า SIDEWAY ช้าเกินไป';
  }
  if(invalid){this.log('cancelled',x.ts,{id:e.id,reason:invalid,progress,drift});this.active=null;return this.lastView={...view,status:'expired',reason:invalid};}

  let blocker='';
  const outputDecision=selectOutputDecision(e.type,e.d,f,null);
  if(!outputDecision.direction)blocker=(CFG.version==='6.6.0'?'STAT V6.6 · ':'V6.5 · ')+outputDecision.reason;
  if(e.type==='breakout'&&e.fromRange){
   const ev=this.breakoutEvidence(f,e,x,progress,retreat,flow,book);e.evidenceScore=ev.score;e.evidenceWhy=ev.why;e.accepted=ev.accepted;e.acceptedClosed=ev.acceptedClosed;
   if(!ev.accepted)blocker=`BREAKOUT WATCH · หลักฐาน ${ev.score}/${CFG.breakoutMinScore}`;
  }
  if(e.type==='range_reversal'){
   const ev=this.rangeEvidence(f,e.d,x,progress,retreat);e.evidenceScore=ev.score;e.evidenceWhy=ev.why;
   if(!blocker&&!ev.edgeOK)blocker='SIDEWAY · ราคาเข้ากลางกรอบแล้ว ไม่ไล่';
   else if(!blocker&&ev.score<CFG.rangeMinScore)blocker=`SIDEWAY · หลักฐาน ${ev.score}/${CFG.rangeMinScore}`;
   else if(!blocker&&(x.coverage||0)<CFG.flowWarmupSec)blocker='SIDEWAY · รอข้อมูลซื้อขายสดให้พอ';
  }else{
   if(!blocker&&(x.coverage||0)<CFG.flowWarmupSec)blocker='setup มีแล้ว · รอข้อมูลซื้อขายสด';
   else if(!blocker&&flow<CFG.minFlow)blocker='setup มีแล้ว · flow ยังไม่หนุน';
   else if(!blocker&&progress<.03)blocker='setup มีแล้ว · ราคายังไม่เดินพ้น trigger';
   else if(!blocker&&retreat>CFG.maxRetreat)blocker='setup เสียคุณภาพ · ราคาถอยมาก';
   else if(!blocker&&room<CFG.roomAtr)blocker='โซน 1 นาทีข้างหน้าใกล้เกิน';
  }
  if(blocker){e.evidenceSince=0;e.ticks=0;return this.lastView={...view,status:'tracking',reason:blocker,gate:{state:'WAIT',direction:outputDecision.direction||null,blocker,waitingFor:[blocker],metrics:{flow,progress,retreat,room:Number.isFinite(room)?room:null,evidenceScore:e.evidenceScore??null}}};}
  if(!e.evidenceSince)e.evidenceSince=x.ts;e.ticks++;
  if(e.ticks<CFG.minEvidenceTicks||x.ts-e.evidenceSince<CFG.minEvidenceMs)return this.lastView={...view,status:'confirming',reason:'พบจังหวะ · กำลังยืนยันข้อมูลสด',gate:{state:'READY',direction:outputDecision.direction,blocker:'เงื่อนไขผ่านแล้ว',waitingFor:['ยืนยันข้อมูลสดสั้น ๆ'],metrics:{flow,progress,retreat,room:Number.isFinite(room)?room:null}}};

  e.issued=true;
  const stat=e.type==='range_reversal'?this.rangeStat(f,e.d):null,modelDirection=e.d>0?'HIGH':'LOW',outputDirection=outputDecision.direction;
  const episodeId=`V6:${CFG.version}:${this.session}:${Math.floor(x.ts/60000)}`;
  const signal={id:e.id,version:CFG.version,type:e.type,direction:outputDirection,modelDirection,decisionPolicy:outputDecision.policy,entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,
   result:'pending',lastObserved:x.ts,event:{...e},features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,room:Number.isFinite(room)?room:null,progress,drift,retreat,regime:regime.mode,stableMode:regime.stableMode,eff:f.eff,emaSepAtr:f.emaSepAtr,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,rangePosition:f.rangePosition,h10:stat?{n:stat.n,winRate:stat.winRate,medianMove:stat.medianMove}:null},
   dataset:{schema:DATASET_SCHEMA,episodeId,episodeSequence:1,path1m:[],context1m:[],entry:{capturedAt:x.ts,price:x.price,outputDirection,modelDirection,decisionPolicy:outputDecision.policy,decisionReason:outputDecision.reason,strategyVersion:CFG.version,setupType:e.type,level:e.level,entryLow:e.entryLow,entryHigh:e.entryHigh,atr:f.atr,trend:f.trend,momentum:f.mom,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,regime:regime.mode,stableMode:regime.stableMode,flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,room:Number.isFinite(room)?room:null,progress,drift,retreat,h10History:stat?{n:stat.n,winRate:stat.winRate,medianMove:stat.medianMove}:null,prior1m:compactBars(x.bars,20)}},
   reason:`V${CFG.version} · ${outputDecision.reason} · setup ${modelDirection} → ออก ${outputDirection}`};
  this.signals.push(signal);
  if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(s=>s.result!=='pending');if(i>=0)this.signals.splice(i,1);}
  this.log('issued',x.ts,{id:e.id,type:e.type,direction:signal.direction,modelDirection:signal.modelDirection,price:x.price});
  return this.lastView={...view,status:'new',reason:signal.reason,signal,gate:{state:'ENTER',direction:outputDirection,blocker:'ผ่านเงื่อนไข V6 แล้ว',waitingFor:[],metrics:{flow,progress,retreat,room:Number.isFinite(room)?room:null,evidenceScore:e.evidenceScore??null}}};
}

class Engine{
 constructor(saved={}){
  this.signals=Array.isArray(saved.signals)?saved.signals.filter(s=>s&&Number.isFinite(s.entryTime)&&Number.isFinite(s.entryPrice)&&['HIGH','LOW'].includes(s.direction)).slice(-CFG.maxHistory):[];
  this.audit=Array.isArray(saved.audit)?saved.audit.slice(-CFG.maxAudit):[];
  this.watchSamples=Array.isArray(saved.watchSamples)?saved.watchSamples.filter(s=>s&&Number.isFinite(s.entryTime)&&Number.isFinite(s.entryPrice)&&['HIGH','LOW'].includes(s.direction)).slice(-900):[];
  this.active=null;this.previous=null;this.lastId=null;this.session=0;this.consumed=new Map();this.lastView=null;
  this.watchState=null;this.lastWatchRecorded={HIGH:0,LOW:0};
  this.regimeMode='TRANSITION';this.regimeCandidate=null;this.regimeCandidateCount=0;this.regimeBarTime=0;
  this.v2Memory=saved.v2Memory&&typeof saved.v2Memory==='object'?saved.v2Memory:null;
 }
 serialize(){return {version:CFG.version,datasetSchema:DATASET_SCHEMA,watchSchema:WATCH_SCHEMA,signals:this.signals,watchSamples:this.watchSamples,audit:this.audit,v2Memory:this.v2Memory};}
 log(type,time,detail={}){const row={...detail};if(Object.prototype.hasOwnProperty.call(row,'type')){row.setupType=row.type;delete row.type;}this.audit.push({type,time,version:CFG.version,...row});if(this.audit.length>CFG.maxAudit)this.audit.shift();}
 reset(reason,time){if(this.active&&!this.active.issued)this.log('cancelled',time,{id:this.active.id,reason});this.active=null;this.previous=null;this.lastId=null;this.watchState=null;this.session++;}
 captureTrade(t){
  for(const s of this.signals){if(s.result!=='pending'||!s.dataset)continue;const elapsed=t.ts-s.entryTime;if(elapsed<0||elapsed>=CFG.horizonMs)continue;
   const idx=Math.min(9,Math.floor(elapsed/60000)),minute=idx+1,arr=s.dataset.path1m||(s.dataset.path1m=[]);let b=arr.find(x=>x.minute===minute);
   if(!b){b={minute,startMs:s.entryTime+idx*60000,endMs:s.entryTime+(idx+1)*60000,open:t.price,high:t.price,low:t.price,close:t.price,lastTs:t.ts};arr.push(b);}
   else{b.high=Math.max(b.high,t.price);b.low=Math.min(b.low,t.price);b.close=t.price;b.lastTs=t.ts;}
  }
  for(const w of this.watchSamples){if(w.result!=='pending')continue;const elapsed=t.ts-w.entryTime;if(elapsed<0||elapsed>=CFG.horizonMs)continue;
   const idx=Math.min(9,Math.floor(elapsed/60000)),minute=idx+1,arr=w.path1m||(w.path1m=[]);let b=arr.find(x=>x.minute===minute);
   if(!b){b={minute,startMs:w.entryTime+idx*60000,endMs:w.entryTime+(idx+1)*60000,open:t.price,high:t.price,low:t.price,close:t.price,lastTs:t.ts};arr.push(b);}
   else{b.high=Math.max(b.high,t.price);b.low=Math.min(b.low,t.price);b.close=t.price;b.lastTs=t.ts;}
  }
 }
 observeContext(t){
  for(const s of this.signals){if(s.result!=='pending'||!s.dataset)continue;const elapsed=t.ts-s.entryTime;if(elapsed<0||elapsed>=CFG.horizonMs)continue;
   const minute=Math.min(10,Math.floor(elapsed/60000)+1),arr=s.dataset.context1m||(s.dataset.context1m=[]),snap={minute,ts:t.ts,price:t.price,flow:t.flow,book:t.book,bookValid:!!t.bookValid,coverage:t.coverage||0,regime:t.regime||null,phase:t.phase||null,trend:t.trend,momentum:t.momentum,rangePosition:t.rangePosition,room:t.room};
   const row=arr.find(x=>x.minute===minute);if(row)Object.assign(row,snap);else arr.push(snap);
  }
 }
 finalizeReview(s){
  if(!s.dataset)return;const d=s.direction==='HIGH'?1:-1,entry=s.entryPrice,atr=Math.max(s.dataset.entry?.atr||0,1e-9),path=s.dataset.path1m||[];
  let mfe=0,mae=0,mfeAt=null,maeAt=null;
  for(const b of path){const favorable=d>0?b.high-entry:entry-b.low,adverse=d>0?entry-b.low:b.high-entry;if(favorable>mfe){mfe=favorable;mfeAt=b.minute;}if(adverse>mae){mae=adverse;maeAt=b.minute;}}
  const finalPoints=Number.isFinite(s.exitPrice)?d*(s.exitPrice-entry):null,finalRaw=Number.isFinite(s.exitPrice)?s.exitPrice-entry:null,tags=[],e=s.dataset.entry||{};
  const oppDist=s.direction==='HIGH'?e.zones?.nearestResistance?.distanceAtr:e.zones?.nearestSupport?.distanceAtr,first2=path.filter(x=>x.minute<=2),fastAdverse=first2.some(b=>(d>0?entry-b.low:b.high-entry)>=atr*.18);
  const candleSeq=e.candleSequence||[],entryCandle=candleSeq.at(-1),alignedCandles=candleSeq.slice(-3).filter(c=>(s.direction==='HIGH'?c.direction==='GREEN':c.direction==='RED')).length;
  if(e.expediteFive?.requested)tags.push('expedite_five_entry');if(e.expediteFive?.issueMode==='counter')tags.push('expedite_counter_entry');
  if(entryCandle){
   if((s.direction==='HIGH'&&entryCandle.direction==='GREEN')||(s.direction==='LOW'&&entryCandle.direction==='RED'))tags.push('entry_candle_aligned_with_signal');
   if(entryCandle.bodyAtr>=.55)tags.push('entry_large_body_candle');
   if(entryCandle.upperWickAtr>=.35)tags.push('entry_long_upper_wick');
   if(entryCandle.lowerWickAtr>=.35)tags.push('entry_long_lower_wick');
   if(alignedCandles>=3)tags.push('three_candles_aligned_at_entry');
  }
  if(s.result==='incorrect'){
   if(mfe<atr*.12)tags.push('no_follow_through');if(mfe>=atr*.30&&finalPoints<0)tags.push('gave_back_favorable_move');if(fastAdverse)tags.push('fast_reversal_0_2m');
   if(Number.isFinite(oppDist)&&oppDist<.30)tags.push('entered_near_opposing_1m_zone');if(Math.abs(e.drift||0)>=.32||Math.abs(e.progress||0)>=.45)tags.push('late_or_extended_entry');
   if((s.dataset.episodeSequence||1)>1)tags.push('repeated_signal_same_episode');if(s.type==='breakout')tags.push('breakout_setup_failed_at_t10');if(['trend_continuation','pullback','early_impulse','pullback_reclaim'].includes(s.type))tags.push('trend_follow_through_failed_at_t10');if(['range_reversal','range_rejection'].includes(s.type))tags.push('range_reversal_failed_at_t10');if(['IMPULSE','MATURE_IMPULSE'].includes(e.marketPhase))tags.push('impulse_follow_failed_at_t10');if(['exhaustion_reversal','confirmed_reversal'].includes(s.type))tags.push('exhaustion_reversal_failed_at_t10');if((e.relativeVolume||0)>=1.45)tags.push('high_relative_volume_entry');
  }else if(s.result==='correct'){
   if(finalPoints>=atr*.30)tags.push('clean_t10_follow_through');if(mfe>=atr*.50)tags.push('strong_favorable_excursion');if(Number.isFinite(oppDist)&&oppDist>.60)tags.push('good_room_from_opposing_1m_zone');
   if(['range_reversal','range_rejection'].includes(s.type))tags.push('range_reversal_worked');if(s.type==='breakout')tags.push('breakout_context_worked_for_output_side');if(['IMPULSE','MATURE_IMPULSE'].includes(e.marketPhase)||['early_impulse','pullback_reclaim'].includes(s.type))tags.push('impulse_follow_worked');if(['exhaustion_reversal','confirmed_reversal'].includes(s.type))tags.push('exhaustion_reversal_worked');if((e.relativeVolume||0)>=1.45)tags.push('high_relative_volume_entry');
  }
  s.dataset.outcome={result:s.result,exitPrice:Number.isFinite(s.exitPrice)?s.exitPrice:null,exitTime:s.exitTime||null,rawMovePoints:finalRaw,directionalMovePoints:finalPoints,directionalMoveAtr:Number.isFinite(finalPoints)?finalPoints/atr:null,movePct:Number.isFinite(s.exitPrice)?(s.exitPrice-entry)/entry*100:null,mfePoints:mfe,maePoints:mae,mfeAtr:mfe/atr,maeAtr:mae/atr,mfeAtMinute:mfeAt,maeAtMinute:maeAt,checkpoints:Object.fromEntries([1,2,3,5,10].map(m=>[String(m),m===10?(Number.isFinite(s.exitPrice)?s.exitPrice:null):(path.find(x=>x.minute===m)?.close??null)]))};
  s.dataset.review={tags,summary:s.result==='incorrect'?(tags.length?'แพ้ที่ T+10 โดยพบ '+tags.join(', '):'แพ้ที่ T+10 แต่ยังไม่มีรูปแบบสาเหตุเด่นตามกฎที่เก็บ'):s.result==='correct'?(tags.length?'ชนะที่ T+10 โดยพบ '+tags.join(', '):'ชนะที่ T+10'):'ยังสรุปสาเหตุไม่ได้',generatedBy:'deterministic-rules-v2-phase-observations'};
 }
 settle(t){
  this.captureTrade(t);let changed=false;
  for(const s of this.signals){if(s.result!=='pending')continue;if(t.ts<s.expiresAt){s.lastObserved=t.ts;continue;}
   if(t.ts-s.expiresAt<=CFG.settlementToleranceMs&&s.lastObserved>=s.expiresAt-CFG.settlementToleranceMs){s.exitPrice=t.price;s.exitTime=t.ts;s.result=t.price===s.entryPrice?'equal':((t.price>s.entryPrice)===(s.direction==='HIGH')?'correct':'incorrect');this.finalizeReview(s);}
   else{s.result='missing';s.reason='ไม่มีข้อมูลต่อเนื่องตรงเวลาครบ 10 นาที';this.finalizeReview(s);}changed=true;
  }
  for(const w of this.watchSamples){if(w.result!=='pending')continue;if(t.ts<w.expiresAt){w.lastObserved=t.ts;continue;}
   if(t.ts-w.expiresAt<=CFG.settlementToleranceMs&&w.lastObserved>=w.expiresAt-CFG.settlementToleranceMs){
    w.exitPrice=t.price;w.exitTime=t.ts;w.result=t.price===w.entryPrice?'equal':((t.price>w.entryPrice)===(w.direction==='HIGH')?'correct':'incorrect');
    const d=w.direction==='HIGH'?1:-1,atr=Math.max(w.input?.atr||0,1e-9),move=d*(t.price-w.entryPrice);
    w.outcome={result:w.result,exitPrice:t.price,exitTime:t.ts,directionalMovePoints:move,directionalMoveAtr:move/atr,
     checkpoints:Object.fromEntries([1,2,3,5,10].map(m=>[String(m),m===10?t.price:(w.path1m?.find(x=>x.minute===m)?.close??null)]))};
   }else{w.result='missing';w.reason='WATCH ไม่มีข้อมูลต่อเนื่องตรงเวลาครบ 10 นาที';}
   changed=true;
  }
  return changed;
 }
 expire(time){let changed=false;for(const s of this.signals)if(s.result==='pending'&&time>s.expiresAt+CFG.settlementToleranceMs){s.result='missing';s.reason='ไม่มีราคาตัดสินภายใน 5 วินาที';this.finalizeReview(s);changed=true;}
  for(const w of this.watchSamples)if(w.result==='pending'&&time>w.expiresAt+CFG.settlementToleranceMs){w.result='missing';w.reason='WATCH ไม่มีราคาตัดสินภายใน 5 วินาที';changed=true;}
  return changed;}
 trackRegime(f,p){
  const r=classifyRegime(f,p),barTime=f.b.at(-1)?.time||0;
  if(barTime&&barTime!==this.regimeBarTime){
   this.regimeBarTime=barTime;
   if(r.raw==='RANGE'||r.raw==='TREND'){
    if(this.regimeCandidate===r.raw)this.regimeCandidateCount++;else{this.regimeCandidate=r.raw;this.regimeCandidateCount=1;}
    const needed=this.regimeMode==='TRANSITION'?1:2;
    if(this.regimeCandidateCount>=needed){this.regimeMode=r.raw;this.regimeCandidate=null;this.regimeCandidateCount=0;}
   }else{this.regimeCandidate=null;this.regimeCandidateCount=0;}
  }
  return {...r,stableMode:this.regimeMode,mode:r.breakoutCandidate?'TRANSITION':this.regimeMode};
 }
 earlyWatch(f,x,regime,phase,z){
  if(CFG.version!=='7.2.0')return null;
  const live=x.current||x.bars?.at(-1)||f.b.at(-1),liveDir=live?Math.sign(x.price-live.open):0;
  const accelDir=Math.abs(f.momAccel||0)>=.12&&liveDir&&Math.sign(f.momAccel)===liveDir&&liveDir*(x.flow||0)>=.02?liveDir:0;
  let d=0;
  if(phase.phase==='RANGE'){
   if(regime.position<=.28&&liveDir>=0&&(x.flow||0)>=.015)d=1;
   else if(regime.position>=.72&&liveDir<=0&&(x.flow||0)<=-.015)d=-1;
  }else d=accelDir||phase.dir||((Math.abs(f.mom||0)>=.08)?Math.sign(f.mom):0)||((Math.abs(f.trend||0)>=.08)?Math.sign(f.trend):0)||liveDir;
  if(!d)return null;
  let score=0;const reasons=[];
  const add=(ok,pts,msg)=>{if(ok){score+=pts;reasons.push(msg);}};
  add(liveDir===d,1,'แท่งปัจจุบันเดินฝั่งเดียวกัน');
  add(d*(f.mom||0)>=.08,1,'momentum เริ่มหนุน');
  add(d*(f.momAccel||0)>=.08,1,'momentum กำลังเร่ง');
  add(d*(x.flow||0)>=.02,1,'แรงซื้อขายสดเริ่มหนุน');
  add(x.bookValid&&d*(x.book||0)>=.06,1,'order book เริ่มหนุน');
  add(d*(f.trend||0)>=.08,1,'แนวโน้มสั้นเริ่มเอียงทางเดียวกัน');
  add(phase.dir===d&&['TREND','IMPULSE','MATURE_IMPULSE','REVERSAL'].includes(phase.phase),1,'โครงสร้างตลาดหนุนทิศเดียวกัน');
  const room=(z||[]).filter(y=>d*(y.price-x.price)>0).map(y=>d*(y.price-x.price)/f.atr).sort((a,b)=>a-b)[0]??Infinity;
  add(room>=CFG.roomAtr,1,'ยังมีระยะถึงแนวสำคัญข้างหน้า');
  if(score<CFG.watchMinScore)return null;
  const direction=d>0?'HIGH':'LOW',extension=d*(x.price-f.ema21)/f.atr;
  const tooLate=extension>=CFG.hardLateExtensionAtr||(extension>=CFG.lateExtensionAtr&&room<CFG.roomAtr);
  const state=tooLate?'TOO_LATE':score>=CFG.watchReadyScore?'READY':'WATCH';
  return {direction,d,score,state,reasons,room:Number.isFinite(room)?room:null,extension,phase:phase.phase,
   reason:tooLate?direction+' ยังเด่น แต่ราคายืดไกล/พื้นที่ข้างหน้าแคบแล้ว ไม่ไล่ราคา':
    state==='READY'?direction+' เริ่มพร้อม · โครงสร้างและแรงสดหลายส่วนตรงกัน รอ trigger จุดเข้า':
    'จับตา '+direction+' · ตลาดเริ่มเอนทางเดียวกัน แต่หลักฐานจุดเข้ายังไม่ครบ'};
 }
 recordWatch(watch,x,f,regime,phase,z){
  if(CFG.version!=='7.2.0')return null;
  if(!watch){this.watchState=null;return null;}
  const last=this.lastWatchRecorded[watch.direction]||0;
  const same=this.watchState?.direction===watch.direction;
  this.watchState={direction:watch.direction,lastSeen:x.ts,score:watch.score};
  if(same||x.ts-last<CFG.watchCooldownMs)return null;
  this.lastWatchRecorded[watch.direction]=x.ts;
  const id='W:'+CFG.version+':'+watch.direction+':'+x.ts;
  const row={id,schema:WATCH_SCHEMA,version:CFG.version,direction:watch.direction,entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,
   result:'pending',lastObserved:x.ts,watchState:watch.state,watchScore:watch.score,watchReasons:[...watch.reasons],path1m:[],
   input:{...candidateFeatures(f,x,'early_watch',watch.d,x.price),watchState:watch.state,watchScore:watch.score,watchReasons:[...watch.reasons],
    regime:regime.mode,stableMode:regime.stableMode,watchRoomAtr:watch.room,watchExtensionAtr:watch.extension,prior1m:compactBars(x.bars,20)}};
  this.watchSamples.push(row);if(this.watchSamples.length>900)this.watchSamples.shift();
  this.log('watch_detected',x.ts,{id,direction:watch.direction,score:watch.score,state:watch.state,price:x.price,input:row.input});
  return row;
 }
 start(type,d,level,x,f,key,extra={}){
  if(this.consumed.has(key))return;
  this.consumed.set(key,x.ts);for(const [k,v] of this.consumed)if(x.ts-v>3600000)this.consumed.delete(k);
  const maxEntry=type==='range_reversal'?CFG.maxRangeEntry:type==='trend_continuation'?CFG.maxTrendEntry:type==='breakout'?CFG.maxBreakEntry:CFG.maxFailureEntry;
  this.active={id:`${this.session}:${x.ts}:${key}`,key,type,d,level,atr:f.atr,maxEntry,startedAt:x.ts,startPrice:x.price,extreme:x.price,evidenceSince:0,ticks:0,issued:false,...extra,
   entryLow:d>0?level-f.atr*.05:level-f.atr*maxEntry,
   entryHigh:d>0?level+f.atr*maxEntry:level+f.atr*.05};
  this.log('detected',x.ts,{id:this.active.id,key,type,detectedAt:x.ts,direction:d>0?'HIGH':'LOW',price:x.price,level,candidate:candidateFeatures(f,x,type,d,level)});
 }
 rangeStat(f,d){return d>0?f.h10.lower:f.h10.upper;}
 rangeEvidence(f,d,x,progress=0,retreat=0){
  const stat=this.rangeStat(f,d),pos=f.rangePosition,flow=d*(x.flow||0),rejects=d>0?f.lowerRejects:f.upperRejects;
  const fairRoom=d*(f.fair-x.price)/f.atr;
  let score=0;const why=[];
  const edgeOK=d>0?pos<=CFG.rangeEntryLimit:pos>=1-CFG.rangeEntryLimit;
  const deepEdge=d>0?pos<=CFG.rangeEdge:pos>=1-CFG.rangeEdge;
  if(edgeOK){score+=deepEdge?2:1;why.push(deepEdge?'อยู่ขอบกรอบ':'ยังอยู่โซนขอบ');}else why.push('เข้าใกล้กลางกรอบ');
  if(stat.n>=5&&stat.winRate>=.60){score+=2;why.push('+10m เคยกลับดี');}
  else if(stat.n>=3&&stat.winRate>=.55){score+=1;why.push('+10m พอสนับสนุน');}
  else if(stat.n>=3&&stat.winRate<.45){score-=1;why.push('+10m ย้อนหลังไม่สนับสนุน');}
  if(flow>=.12){score+=2;why.push('flow กลับชัด');}
  else if(flow>=.03){score+=1;why.push('flow เริ่มกลับ');}
  else if(flow<=-.10){score-=1;why.push('flow ยังสวน');}
  if(rejects>=2){score+=2;why.push('ขอบนี้ reject ซ้ำ');}
  else if(rejects===1){score+=1;why.push('มี reject เดิม');}
  if(fairRoom>=.45){score+=1;why.push('มีระยะกลับหา fair value');}
  if(progress>=.08){score+=1;why.push('rejection เดินแล้ว');}
  if(retreat>.28){score-=1;why.push('เด้งแล้วถอย');}
  return {score,stat,edgeOK,deepEdge,flow,rejects,fairRoom,why};
 }
 breakoutEvidence(f,e,x,progress,retreat,flow,book){
  const live=x.bars.at(-1),closed=f.b.at(-1),body=live?e.d*(x.price-live.open)/e.atr:0;
  const acceptedClosed=closed&&(e.d>0
   ? closed.close>e.level+e.atr*.06&&closed.low>e.level-e.atr*.10
   : closed.close<e.level-e.atr*.06&&closed.high<e.level+e.atr*.10);
  const rejects=e.d>0?f.upperRejects:f.lowerRejects;
  let score=acceptedClosed?4:0;const why=[];
  if(acceptedClosed)why.push('แท่งปิดยอมรับนอกกรอบ');
  if(progress>=.22){score+=2;why.push('displacement ชัด');}
  else if(progress>=.10){score+=1;why.push('พ้นกรอบแล้ว');}
  if(body>=.35){score+=2;why.push('body ส่งต่อ');}
  else if(body>=.18){score+=1;why.push('body พอใช้');}
  if(flow>=.12){score+=2;why.push('flow หนุนแรง');}
  else if(flow>=.04){score+=1;why.push('flow หนุน');}
  else if(flow<=-.08){score-=1;why.push('flow สวน');}
  if(retreat<=.18){score+=1;why.push('retreat ต่ำ');}
  else if(retreat>.32){score-=1;why.push('ถูกดึงกลับ');}
  if(book>=.12){score+=1;why.push('book หนุน');}
  else if(book<=-.18){score-=1;why.push('book สวน');}
  if(rejects>=2){score-=2;why.push('ขอบนี้เคยเบรกหลอกซ้ำ');}
  else if(rejects===1){score-=1;why.push('มี false break เดิม');}
  const structureAccepted=!!acceptedClosed||(progress>=.10&&score>=CFG.breakoutMinScore);
  const requiresClosedAcceptance=x.phase?.phase==='TRANSITION';
  const earlyAccepted=CFG.version==='7.2.0'&&requiresClosedAcceptance&&!acceptedClosed&&progress>=CFG.earlyTransitionProgress&&
   score>=CFG.earlyTransitionScore&&body>=CFG.earlyTransitionBodyAtr&&flow>=CFG.earlyTransitionFlow&&retreat<=CFG.earlyTransitionRetreat&&
   (x.coverage||0)>=Math.min(8,CFG.flowWarmupSec);
  const accepted=structureAccepted&&(!requiresClosedAcceptance||!!acceptedClosed||earlyAccepted);
  if(earlyAccepted)why.unshift('V7.2 live acceptance แข็งแรงพอ ไม่ต้องรอแท่งปิด');
  else if(requiresClosedAcceptance&&!acceptedClosed)why.unshift('TRANSITION รอแท่งปิด หรือ live evidence ที่แข็งแรงพอ');
  return {score,accepted,acceptedClosed:!!acceptedClosed,earlyAccepted,structureAccepted,requiresClosedAcceptance,body,rejects,why};
 }
 step(x){
  if(CFG.version==='6.5.0'||CFG.version==='6.6.0')return legacyV6Step.call(this,x);
  const f=features(x.bars,x.price,x.horizonBars||10);if(!f)return {status:'warmup',reason:'รอแท่ง 1 นาทีที่สมบูรณ์',signal:null};
  const z=zones(x.bars||[],f.atr),regime=this.trackRegime(f,x.price),phase=marketPhase(f,x,regime);x.phase=phase;
  const watch=this.earlyWatch(f,x,regime,phase,z);if(watch)this.recordWatch(watch,x,f,regime,phase,z);else this.recordWatch(null,x,f,regime,phase,z);
  const base={f,z,regime,phase,watch,signal:null,event:null,continuation:0,reversal:0};
  if(!x.fresh){this.reset('ข้อมูลไม่พร้อม',x.ts);return {...base,status:'offline',reason:'พักสัญญาณจนข้อมูลสดและต่อเนื่อง'};}
  if(x.id===this.lastId)return {...(this.lastView||base),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  this.lastId=x.id;
  const prev=this.previous;this.previous={price:x.price,ts:x.ts};
  if(!prev||x.ts-prev.ts>5000){this.active=null;return this.lastView={...base,status:'warming',reason:'ตั้งต้นราคาสด รอเหตุการณ์ใหม่'};}

  if(!this.active){
   const crossedUp=prev.price<=f.high+f.atr*CFG.breakBuffer&&x.price>f.high+f.atr*CFG.breakBuffer;
   const crossedDown=prev.price>=f.low-f.atr*CFG.breakBuffer&&x.price<f.low-f.atr*CFG.breakBuffer;

   // V7: market phase is the parent decision. Counter-trend is allowed only after exhaustion/reversal evidence.
   if(['EXHAUSTION','REVERSAL'].includes(phase.phase)&&phase.priorDir){
    const d=phase.phase==='REVERSAL'?phase.dir:-phase.priorDir,moving=d*(x.price-prev.price)>0,flowBack=d*(x.flow||0)>=.04;
    if(moving&&flowBack&&phase.exhaustionScore>=CFG.exhaustionScoreMin){
     this.start('exhaustion_reversal',d,x.price,x,f,`X${d}:${Math.floor(x.ts/60000)}`,{phaseAtStart:phase.phase,exhaustionScore:phase.exhaustionScore});
    }
   }

   if(!this.active&&crossedUp)this.start('breakout',1,f.high,x,f,`B+:${f.high.toFixed(2)}`,{fromRange:regime.stableMode==='RANGE'});
   else if(!this.active&&crossedDown)this.start('breakout',-1,f.low,x,f,`B-:${f.low.toFixed(2)}`,{fromRange:regime.stableMode==='RANGE'});
   else if(!this.active&&phase.phase==='RANGE'){
    const pos=regime.position,d=pos<=CFG.rangeEntryLimit?1:pos>=1-CFG.rangeEntryLimit?-1:0;
    if(d){
     const level=d>0?f.low:f.high,live=x.bars.at(-1),inward=d*(x.price-prev.price)>0;
     const rejectMove=live?(d>0?x.price-live.low:live.high-x.price)/f.atr:0;
     const ev=this.rangeEvidence(f,d,x,rejectMove,0);
     if(inward&&rejectMove>=.045&&ev.score>=3){
      this.start('range_reversal',d,level,x,f,`R${d}:${level.toFixed(2)}:${live.time}`,{
       h10N:ev.stat.n,h10WinRate:ev.stat.winRate,h10MedianMove:ev.stat.medianMove,edgeRejects:ev.rejects,
       evidenceScore:ev.score,evidenceWhy:ev.why
      });
     }
    }
   }else if(!this.active&&['TREND','IMPULSE','MATURE_IMPULSE','REVERSAL'].includes(phase.phase)){
    const b=f.b,last=b.at(-1),before=b.slice(-7,-1),d=phase.dir||Math.sign(f.trend);
    if(d){
     const peak=d>0?Math.max(...before.map(y=>y.high)):Math.min(...before.map(y=>y.low));
     const trough=d>0?last.low:last.high,depth=d*(peak-trough)/f.atr,level=d>0?last.high:last.low;
     const structure=d*(last.close-f.ema21)>-.35*f.atr;
     if(phase.phase==='TREND'&&depth>=CFG.pullbackMin&&depth<=CFG.pullbackMax&&structure&&d*(prev.price-level)<=0&&d*(x.price-level)>0){
      this.start('pullback',d,level,x,f,`P${d}:${last.time}`,{phaseAtStart:phase.phase});
     }else{
      const contLevel=d>0?last.high:last.low;
      const continuation=d*f.trend>=CFG.phaseTrendMin&&d*f.mom>=.16&&d*(last.close-f.ema21)>0&&d*(prev.price-contLevel)<=0&&d*(x.price-contLevel)>0;
      if(continuation)this.start('trend_continuation',d,contLevel,x,f,`C${d}:${last.time}`,{phaseAtStart:phase.phase});
     }
    }
   }
  }
  let e=this.active;
  if(!e){
   const baseReason=phase.phase==='RANGE'
    ?(regime.position<=CFG.rangeEntryLimit||regime.position>=1-CFG.rangeEntryLimit?'RANGE · อยู่ขอบ แต่ rejection ยังไม่พอ':'RANGE · อยู่กลางกรอบ รอ edge')
    :phase.phase==='IMPULSE'?`IMPULSE ${phase.dir>0?'UP':'DOWN'} · รอ follow trigger ห้ามสวน`
    :phase.phase==='MATURE_IMPULSE'?`MATURE IMPULSE ${phase.dir>0?'UP':'DOWN'} · รอ follow trigger ไม่ไล่ปลายแท่ง`
    :phase.phase==='EXHAUSTION'?'EXHAUSTION · รอยืนยัน reversal ก่อนสวน'
    :phase.phase==='REVERSAL'?`REVERSAL ${phase.dir>0?'UP':'DOWN'} · รอ follow trigger`
    :phase.phase==='TREND'?'TREND · โครงสร้างมี แต่ยังไม่มี trigger':'TRANSITION · ยังไม่มี phase edge ชัด';
   const reason=watch?.reason||baseReason;
   const waitingFor=watch?[
    'ยังไม่มี trigger จุดเข้าที่ผ่านกฎของ setup',
    watch.score<CFG.watchReadyScore?`คะแนน WATCH ${watch.score}/${CFG.watchReadyScore} · ต้องการหลักฐานเพิ่ม`:'WATCH แข็งแรงแล้ว · รอราคาผ่าน trigger โดยไม่ไล่',
    Number.isFinite(watch.room)&&watch.room<CFG.roomAtr?`พื้นที่ถึงแนวสำคัญเหลือ ${watch.room.toFixed(2)} ATR · แคบกว่าขั้นต่ำ ${CFG.roomAtr.toFixed(2)}`:'พื้นที่ข้างหน้ายังไม่ใช่ตัวบล็อก'
   ]:[baseReason];
   return this.lastView={...base,status:'watch',reason,gate:{state:watch?.state||'WAIT',direction:watch?.direction||null,blocker:reason,waitingFor,
    metrics:watch?{watchScore:watch.score,room:watch.room,extension:watch.extension}:null}};
  }

  if(!e.issued&&phase.phase==='RANGE'&&['pullback','trend_continuation'].includes(e.type)){
   this.log('cancelled',x.ts,{id:e.id,reason:'ตลาดเปลี่ยนเป็น sideway'});this.active=null;
   return this.lastView={...base,status:'watch',reason:'SIDEWAY · ยกเลิก setup เทรนด์ก่อนออกสัญญาณ'};
  }

  if(e.type==='breakout'&&e.d*(x.price-e.level)<-.08*e.atr){
   this.log('failed_break',x.ts,{id:e.id,issued:e.issued});
   if(e.issued){const prior=this.signals.find(s=>s.id===e.id);if(prior){prior.setupStatus='invalidated';prior.invalidatedAt=x.ts;}}
   const old=e;this.active=null;
   if(old.fromRange||regime.stableMode==='RANGE'){
    const d=-old.d,ev=this.rangeEvidence(f,d,x,.10,0);
    if(ev.edgeOK&&ev.score>=3){
     this.start('range_reversal',d,old.level,x,f,`RF:${old.id}`,{
      h10N:ev.stat.n,h10WinRate:ev.stat.winRate,h10MedianMove:ev.stat.medianMove,edgeRejects:ev.rejects,
      evidenceScore:ev.score,evidenceWhy:ev.why,fromFailedBreak:true
     });
     e=this.active;
    }else return this.lastView={...base,status:'watch',reason:'SIDEWAY · เบรกไม่ผ่าน แต่จุดกลับยังไม่มี edge +10m พอ'};
   }else{
    this.start('failed_break',-old.d,old.level,x,f,`F:${old.id}`);e=this.active;
   }
  }
  if(!e)return {...base,status:'watch',reason:'รอเหตุการณ์ใหม่'};

  e.extreme=e.d>0?Math.max(e.extreme,x.price):Math.min(e.extreme,x.price);
  const progress=e.d*(x.price-e.level)/e.atr,drift=e.d*(x.price-e.startPrice)/e.atr;
  const retreat=e.d*(e.extreme-x.price)/e.atr,flow=e.d*x.flow,book=x.bookValid?e.d*x.book:0;
  const room=z.filter(y=>e.d*(y.price-x.price)>0).map(y=>e.d*(y.price-x.price)/e.atr).sort((a,b)=>a-b)[0]??Infinity;
  const continuation=Math.round(clamp(35+flow*45+book*10+Math.min(.3,Math.max(0,progress))*35-retreat*50,0,100));
  const reversal=Math.round(clamp(20-flow*35+retreat*65+Math.max(0,progress-.6)*25,0,100));
  const view={...base,event:{...e},continuation,reversal,room};

  if(e.issued){
   if(progress<-.18){this.log('invalidated',x.ts,{id:e.id});const prior=this.signals.find(s=>s.id===e.id);if(prior){prior.setupStatus='invalidated';prior.invalidatedAt=x.ts;}this.active=null;return this.lastView={...view,status:'invalidated',reason:'สัญญาณออกไปแล้วและยังคงล็อกไว้ · เงื่อนไขหลังเข้าเสีย'};}
   if(x.ts-e.startedAt>60000)this.active=null;
   return this.lastView={...view,status:'issued',reason:'จุดเข้าออกแล้ว · ล็อกสัญญาณเดิมจนตัดสินผล +10 นาที'};
  }

  let invalid='';
  if(x.ts-e.startedAt>CFG.maxAgeMs)invalid='จังหวะหมดอายุ';
  else if(progress>e.maxEntry||drift>CFG.maxDrift)invalid='ราคาวิ่งพ้นเขตเข้าก่อนออกสัญญาณ';
  else if(progress<-.18)invalid='เสียโครงสร้างก่อนออกสัญญาณ';
  if(e.type==='range_reversal'){
   const inside=e.d>0?f.rangePosition<=CFG.rangeEntryLimit:f.rangePosition>=1-CFG.rangeEntryLimit;
   if(!inside)invalid='ราคาเข้ากลางกรอบแล้ว จุดเข้า SIDEWAY ช้าเกินไป';
  }
  if(invalid){this.log('cancelled',x.ts,{id:e.id,reason:invalid,progress,drift});this.active=null;return this.lastView={...view,status:'expired',reason:invalid};}

  let blocker='',episodeInfo=null,rangeEdgeGate=null;
  const outputDecision=selectOutputDecision(e.type,e.d,f,phase);
  if(!outputDecision.direction)blocker='V7 PHASE · '+outputDecision.reason;
  if(outputDecision.direction){
   rangeEdgeGate=rangeEdgeFollowGate(f,x,regime,phase,outputDecision.direction);
   if(rangeEdgeGate.blocked)blocker=`RANGE EDGE · ${outputDecision.direction} กำลังตาม impulse เข้าขอบกรอบ · รอหลุดยืนยันอีก ${Math.max(0,CFG.rangeEdgeBreakAtr-(rangeEdgeGate.beyondAtr||0)).toFixed(2)} ATR`;
  }
  if(outputDecision.direction){
   const anchor=[...this.signals].reverse().find(s=>s.version===CFG.version&&s.dataset&&x.ts-s.entryTime<=CFG.episodeWindowMs&&Math.abs(s.entryPrice-x.price)<=f.atr*CFG.episodeAtrDistance);
   const episodeId=anchor?.dataset?.episodeId||`EP:${this.session}:${Math.floor(x.ts/60000)}`,episodeSequence=anchor?.dataset?.episodeId===episodeId?(anchor.dataset.episodeSequence||1)+1:1;
   const same=this.signals.filter(s=>s.version===CFG.version&&s.dataset?.episodeId===episodeId&&s.direction===outputDecision.direction&&x.ts-s.entryTime<=CFG.episodeWindowMs);
   const lastSame=same.at(-1),gap=lastSame?x.ts-lastSame.entryTime:Infinity;
   episodeInfo={episodeId,episodeSequence,sameDirectionCount:same.length,lastSameGapMs:Number.isFinite(gap)?gap:null};
   if(!blocker&&same.length>=CFG.maxSameDirectionPerEpisode)blocker=`EPISODE GUARD · ${outputDecision.direction} ครบ ${CFG.maxSameDirectionPerEpisode} ไม้ใน movement เดียวแล้ว`;
   else if(!blocker&&gap<CFG.minSameDirectionGapMs)blocker=`EPISODE GUARD · รอ ${Math.ceil((CFG.minSameDirectionGapMs-gap)/1000)} วิ ก่อนยิง ${outputDecision.direction} ซ้ำ`;
  }
  if(!blocker&&CFG.version==='7.2.0'&&outputDecision.direction){
   const od=outputDecision.direction==='HIGH'?1:-1,extension=od*(x.price-f.ema21)/f.atr;
   const heat=Math.max(f.relVolume||0,f.volume3Ratio||0,phase.liveVolumePace||0);
   if(extension>=CFG.hardLateExtensionAtr)blocker=`ช้าแล้ว · ${outputDecision.direction} ยังเด่นแต่ราคายืด ${extension.toFixed(2)} ATR จากฐาน · ไม่ไล่ราคา`;
   else if(extension>=CFG.lateExtensionAtr&&(room<CFG.roomAtr*1.35||heat>=2.0||progress>=.45))
    blocker=`จังหวะเริ่มปลายขา · ยืด ${extension.toFixed(2)} ATR · room ${Number.isFinite(room)?room.toFixed(2):'∞'} ATR · รอย่อหรือ trigger ใหม่`;
  }
  if(!blocker&&CFG.antiMountainGuard&&outputDecision.direction&&outputDecision.policy==='follow_market_phase'&&phase.phase==='MATURE_IMPULSE'){
   const extension=Number.isFinite(phase.extensionAtr)?phase.extensionAtr:0;
   const hotVolume=Math.max(f.relVolume||0,f.volume3Ratio||0,phase.liveVolumePace||0);
   const repeated=(episodeInfo?.sameDirectionCount||0)>=1;
   const overheated=hotVolume>=CFG.antiMountainRelVol;
   if(extension>=CFG.antiMountainExtensionAtr&&(repeated||overheated)){
    const why=[`วิ่งจากฐาน ${extension.toFixed(2)} ATR`,repeated?'เป็นไม้ซ้ำในคลื่นเดียวกัน':'',overheated?`Volume ${hotVolume.toFixed(2)}x`:''].filter(Boolean).join(' · ');
    blocker=`กันไล่ปลายขา · ${why} · รอย่อหรือยืนยันใหม่ก่อน`;
   }
  }
  if(e.type==='breakout'){
   const ev=this.breakoutEvidence(f,e,x,progress,retreat,flow,book);
   e.evidenceScore=ev.score;e.evidenceWhy=ev.why;e.accepted=ev.accepted;e.acceptedClosed=ev.acceptedClosed;e.earlyAccepted=!!ev.earlyAccepted;e.requiresClosedAcceptance=ev.requiresClosedAcceptance;
   if(!blocker&&ev.requiresClosedAcceptance&&!ev.acceptedClosed&&!ev.earlyAccepted)blocker='TRANSITION · รอแท่ง 1 นาทีปิดยืนยัน หรือ live acceptance ที่ displacement + body + flow แข็งแรงพร้อมกัน';
   if(!blocker&&!ev.accepted)blocker=`BREAKOUT WATCH · หลักฐาน ${ev.score}/${CFG.breakoutMinScore} · ${ev.why.slice(0,2).join(' + ')||'ยังไม่มี follow-through'}`;
  }
  if(e.type==='range_reversal'){
   const ev=this.rangeEvidence(f,e.d,x,progress,retreat);
   e.evidenceScore=ev.score;e.evidenceWhy=ev.why;
   if(!blocker&&!ev.edgeOK)blocker='SIDEWAY · ราคาเข้ากลางกรอบแล้ว ไม่ไล่ราคา';
   else if(!blocker&&ev.score<CFG.rangeMinScore)blocker=`SIDEWAY · หลักฐาน ${ev.score}/${CFG.rangeMinScore} · ${ev.why.slice(0,2).join(' + ')}`;
   else if(!blocker&&x.coverage<CFG.flowWarmupSec)blocker='SIDEWAY · setup ผ่าน แต่รอข้อมูลซื้อขายสดให้พอ';
  }else{
   if(!blocker&&x.coverage<CFG.flowWarmupSec)blocker='setup มีแล้ว · รอข้อมูลซื้อขายสดให้พอ';
   else if(!blocker&&flow<CFG.minFlow)blocker='setup มีแล้ว · flow ยังไม่หนุนพอ';
   else if(!blocker&&progress<.03)blocker='setup มีแล้ว · ราคายังไม่เดินพ้น trigger';
   else if(!blocker&&retreat>CFG.maxRetreat)blocker='setup เสียคุณภาพ · ราคาถอยจากปลายขามาก';
   else if(!blocker&&room<CFG.roomAtr)blocker='กราฟไม่สวยสำหรับ +10m · โซน 1 นาทีข้างหน้าใกล้เกิน';
  }
  // The view must carry the current acceptance, not the previous tick's copy.
  view.event={...e};
  const evidenceKey=[phase.phase,phase.dir,outputDecision.policy,outputDecision.direction].join(':');
  if(e.evidenceKey!==evidenceKey){e.evidenceSince=0;e.ticks=0;e.evidenceKey=evidenceKey;}
  if(blocker){
   const gateCode=blocker.startsWith('กันไล่ปลายขา')?'anti_mountain_guard':
    blocker.startsWith('ช้าแล้ว')||blocker.startsWith('จังหวะเริ่มปลายขา')?'late_timing_guard':
    blocker.startsWith('RANGE EDGE')?'range_edge':
    blocker.startsWith('EPISODE GUARD')?'episode_guard':
    blocker.startsWith('BREAKOUT WATCH')?'breakout_evidence':
    blocker.startsWith('SIDEWAY')?'range_evidence':
    blocker.includes('ข้อมูลซื้อขายสด')?'flow_warmup':
    blocker.includes('flow ยังไม่หนุน')?'flow_not_aligned':
    blocker.includes('ยังไม่เดินพ้น trigger')?'trigger_not_crossed':
    blocker.includes('ถอยจากปลายขา')?'retreat_too_large':
    blocker.includes('โซน 1 นาทีข้างหน้าใกล้')?'opposing_zone_too_close':
    !outputDecision.direction?outputDecision.policy:
    e.type==='breakout'&&e.requiresClosedAcceptance&&!e.acceptedClosed&&!e.earlyAccepted?'transition_closed_acceptance':'entry_gate';
   if(e.lastGateCode!==gateCode){this.log('entry_gate_blocked',x.ts,{id:e.id,gate:gateCode,reason:blocker,input:candidateFeatures(f,x,e.type,e.d,e.level)});e.lastGateCode=gateCode;}
   const waitingFor=[blocker];
   if(e.type==='breakout')waitingFor.push(`Breakout evidence ${Number.isFinite(e.evidenceScore)?e.evidenceScore:'—'}/${CFG.breakoutMinScore}`);
   if(x.coverage<CFG.flowWarmupSec)waitingFor.push(`ข้อมูล flow ${Number(x.coverage||0).toFixed(1)}/${CFG.flowWarmupSec} วินาที`);
   if(flow<CFG.minFlow)waitingFor.push(`flow ตามฝั่ง setup ${flow.toFixed(2)} · ต้องอย่างน้อย ${CFG.minFlow.toFixed(2)}`);
   if(progress<.03)waitingFor.push(`ราคาเดินจาก trigger ${progress.toFixed(2)} ATR · ต้องอย่างน้อย 0.03 ATR`);
   if(Number.isFinite(room)&&room<CFG.roomAtr)waitingFor.push(`room เหลือ ${room.toFixed(2)} ATR · ขั้นต่ำ ${CFG.roomAtr.toFixed(2)} ATR`);
   e.evidenceSince=0;e.ticks=0;return this.lastView={...view,status:'tracking',reason:blocker,gate:{state:gateCode==='late_timing_guard'?'TOO_LATE':'WAIT',
    direction:outputDecision.direction||null,code:gateCode,blocker,waitingFor,metrics:{flow,progress,retreat,room:Number.isFinite(room)?room:null,evidenceScore:e.evidenceScore??null,acceptedClosed:!!e.acceptedClosed,earlyAccepted:!!e.earlyAccepted,extensionAtr:phase.extensionAtr}}};
  }
  e.lastGateCode=null;
  if(!e.evidenceSince)e.evidenceSince=x.ts;e.ticks++;
  if(e.ticks<CFG.minEvidenceTicks||x.ts-e.evidenceSince<CFG.minEvidenceMs)return this.lastView={...view,status:'confirming',reason:'READY · เงื่อนไขหลักผ่านแล้ว กำลังยืนยันข้อมูลสดสั้น ๆ ก่อนล็อกจุดเข้า',
   gate:{state:'READY',direction:outputDecision.direction,blocker:'เงื่อนไขหลักผ่านแล้ว',waitingFor:[
    `ยืนยันข้อมูลสด ${Math.min(e.ticks,CFG.minEvidenceTicks)}/${CFG.minEvidenceTicks} ครั้ง`,
    `คงทิศ/phase/policy เดิมอย่างน้อย ${CFG.minEvidenceMs} ms`
   ],metrics:{flow,progress,retreat,room:Number.isFinite(room)?room:null,evidenceScore:e.evidenceScore??null,acceptedClosed:!!e.acceptedClosed,earlyAccepted:!!e.earlyAccepted}}};

  e.issued=true;
  const stat=e.type==='range_reversal'?this.rangeStat(f,e.d):null;
  const modelDirection=e.d>0?'HIGH':'LOW',outputDirection=outputDecision.direction,decisionPolicy=outputDecision.policy;
  const setupReason=e.type==='range_reversal'?'RANGE · หลักฐานรวมผ่านสำหรับจุดกลับ +10 นาที':e.type==='exhaustion_reversal'?'EXHAUSTION · reversal trigger ผ่าน':e.type==='trend_continuation'?'TREND/IMPULSE · continuation ผ่านสำหรับ +10 นาที':e.type==='breakout'?'BREAKOUT · หลักฐานรวมยืนยันการออกจากกรอบ':'ราคาอยู่ในเขตเข้าและแรงซื้อขายสดสนับสนุน';
  const nearest=(kind)=>{const rows=z.filter(y=>y.kind===kind).map(y=>({...y,distanceAtr:Math.abs(y.price-x.price)/f.atr})).sort((a,b)=>a.distanceAtr-b.distanceAtr);return rows[0]?{price:rows[0].price,distanceAtr:rows[0].distanceAtr,touches:rows[0].touches,confirmedAt:rows[0].confirmedAt}:null;};
  const episodeId=episodeInfo?.episodeId||`EP:${this.session}:${Math.floor(x.ts/60000)}`,episodeSequence=episodeInfo?.episodeSequence||1;
  const signal={id:e.id,version:CFG.version,type:e.type,direction:outputDirection,modelDirection,decisionPolicy,entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,
   result:'pending',lastObserved:x.ts,event:{...e},features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,room:Number.isFinite(room)?room:null,progress,drift,retreat,
    regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,phaseDir:phase.dir,phaseScore:phase.score,eff:f.eff,emaSepAtr:f.emaSepAtr,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,rangePosition:f.rangePosition,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,liveVolumePace:phase.liveVolumePace,extensionAtr:phase.extensionAtr,exhaustionScore:phase.exhaustionScore,h10:stat?{n:stat.n,winRate:stat.winRate,medianMove:stat.medianMove}:null},
   dataset:{schema:DATASET_SCHEMA,episodeId,episodeSequence,path1m:[],context1m:[],entry:{capturedAt:x.ts,price:x.price,outputDirection,modelDirection,decisionPolicy,decisionReason:outputDecision.reason,decisionTrendStrength:outputDecision.strength,strategyVersion:CFG.version,marketPhase:phase.phase,phaseDir:phase.dir,phaseScore:phase.score,phasePriorDir:phase.priorDir,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,closeLocation:f.closeLocation,impulseSeq:f.impulseSeq,liveVolumePace:phase.liveVolumePace,liveBodyAtr:phase.liveBodyAtr,liveRangeAtr:phase.liveRangeAtr,phaseExtensionAtr:phase.extensionAtr,exhaustionScore:phase.exhaustionScore,episodeSameDirectionBefore:episodeInfo?.sameDirectionCount||0,entryGatePolicy:{rangeCounterTrendMin:phase.phase==='RANGE'?CFG.rangeCounterTrendMin:null,transitionClosedRequired:!!e.requiresClosedAcceptance,acceptedClosed:e.type==='breakout'?!!e.acceptedClosed:null,earlyAccepted:e.type==='breakout'?!!e.earlyAccepted:null,evidenceKey:e.evidenceKey},rangeEdgeGate:rangeEdgeGate?{applies:!!rangeEdgeGate.applies,accepted:!!rangeEdgeGate.accepted,edge:Number.isFinite(rangeEdgeGate.edge)?rangeEdgeGate.edge:null,beyondAtr:Number.isFinite(rangeEdgeGate.beyondAtr)?rangeEdgeGate.beyondAtr:null,closedBeyondAtr:Number.isFinite(rangeEdgeGate.closedBeyondAtr)?rangeEdgeGate.closedBeyondAtr:null,hardBreak:!!rangeEdgeGate.hardBreak,acceptedClose:!!rangeEdgeGate.acceptedClose}:null,setupType:e.type,setupReason,evidenceScore:Number.isFinite(e.evidenceScore)?e.evidenceScore:null,evidenceWhy:Array.isArray(e.evidenceWhy)?[...e.evidenceWhy]:[],fromRange:!!e.fromRange,fromFailedBreak:!!e.fromFailedBreak,level:e.level,entryLow:e.entryLow,entryHigh:e.entryHigh,atr:f.atr,trend:f.trend,momentum:f.mom,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,regime:regime.mode,stableMode:regime.stableMode,flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,room:Number.isFinite(room)?room:null,progress,drift,retreat,outputExtensionAtr:(outputDirection==='HIGH'?1:-1)*(x.price-f.ema8)/f.atr,modelExtensionAtr:(modelDirection==='HIGH'?1:-1)*(x.price-f.ema8)/f.atr,h10History:stat?{n:stat.n,winRate:stat.winRate,medianMove:stat.medianMove}:null,zones:{nearestSupport:nearest('support'),nearestResistance:nearest('resistance')},liveBar:x.bars.at(-1)?{time:x.bars.at(-1).time,open:x.bars.at(-1).open,high:x.bars.at(-1).high,low:x.bars.at(-1).low,close:x.bars.at(-1).close,volume:x.bars.at(-1).volume,closed:!!x.bars.at(-1).closed}:null,candleSequence:candleLearningSnapshot(x.bars,f.atr,8),prior1m:compactBars(x.bars,20)}},
   reason:`V${CFG.version} · ${phase.phase} · ${outputDecision.reason} · setup ${modelDirection} → ออก ${outputDirection} · ${setupReason}`};
  this.signals.push(signal);
  if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(s=>s.result!=='pending');if(i>=0)this.signals.splice(i,1);}
  this.log('issued',x.ts,{id:e.id,type:e.type,direction:signal.direction,modelDirection:signal.modelDirection,price:x.price,episodeId:signal.dataset?.episodeId,episodeSequence:signal.dataset?.episodeSequence});
  return this.lastView={...view,status:'new',reason:signal.reason,signal,gate:{state:'ENTER',direction:outputDirection,blocker:'ผ่านเงื่อนไขจุดเข้าแล้ว',waitingFor:[],
   metrics:{flow,progress,retreat,room:Number.isFinite(room)?room:null,evidenceScore:e.evidenceScore??null,acceptedClosed:!!e.acceptedClosed,earlyAccepted:!!e.earlyAccepted}}};
 }
}
root.EventSignalV6={Engine,CFG,DATASET_SCHEMA,VERSION_PROFILE,VERSION_SETTINGS_SEED,selectOutputDecision,rangeEdgeFollowGate,features,zones,classifyRegime,marketPhase};
if(typeof module!=='undefined')module.exports=root.EventSignalV6;
})(typeof globalThis!=='undefined'?globalThis:window);

(function arisPlugin(root){
'use strict';
const core=root.EventSignalV6;
if(!core||!core.Engine||!core.CFG||!core.CFG.version.startsWith('ARIS-')||['ARIS-2.0.0','ARIS-3.0.0','ARIS-4.0.0'].includes(core.CFG.version))return;
const {Engine,CFG,features,zones,marketPhase}=core;
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const sign=(v,dead=0)=>v>dead?1:v<-dead?-1:0;
const BIAS_WEIGHTS=Object.freeze({trend:.30,slope:.20,momentum:.20,acceleration:.15,flow:.15});

function arisBias(f,x){
  const atr=Math.max(f.atr,1e-9);
  const trend=clip(((f.ema8-f.ema21)/atr)/.80,-1,1);
  const slope=clip((f.emaSlopeAtr||0)/.80,-1,1);
  const momentum=clip((f.mom||0)/1.20,-1,1);
  const acceleration=clip((f.momAccel||0)/.80,-1,1);
  const flow=clip(x.flow||0,-1,1);
  const base=trend*BIAS_WEIGHTS.trend+slope*BIAS_WEIGHTS.slope+momentum*BIAS_WEIGHTS.momentum+acceleration*BIAS_WEIGHTS.acceleration+flow*BIAS_WEIGHTS.flow;
  const book=x.bookValid?clip(x.book||0,-1,1):0;
  const bd=sign(base,.02);
  const bookSupport=bd?clip(bd*book,0,1):0;
  const bookAdj=bd?bd*Math.min(.04,bookSupport*.04):0;
  const bias=clip(base+bookAdj,-1,1);
  return {bias,base,bookAdj,parts:{trend,slope,momentum,acceleration,flow,book},weights:BIAS_WEIGHTS};
}
function arisRegimeRaw(f){
  const dir=sign((f.trend||0)*.40+(f.emaSlopeAtr||0)*.30+(f.mom||0)*.30,.03);
  const aligned=[f.trend,f.emaSlopeAtr,f.mom].filter(v=>dir&&sign(v,.04)===dir).length;
  const trend=f.eff>=.42&&f.emaSepAtr>=.22&&aligned>=2;
  const noisy=f.sideCrosses>=2||f.falseBreaks>=2;
  const range=f.eff<=.32&&f.emaSepAtr<.25&&noisy;
  return {raw:trend?'TREND':range?'RANGE':'TRANSITION',dir,aligned,eff:f.eff,emaSepAtr:f.emaSepAtr,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,position:f.rangePosition};
}
function arisRegime(engine,f){
  const r=arisRegimeRaw(f),barTime=f.b.at(-1)?.time||0;
  if(!engine.arisRegimeMode)engine.arisRegimeMode='TRANSITION';
  if(barTime&&barTime!==engine.arisRegimeBarTime){
    engine.arisRegimeBarTime=barTime;
    if(r.raw==='TRANSITION'){
      engine.arisRegimeCandidate=null;engine.arisRegimeCandidateCount=0;engine.arisRegimeMode='TRANSITION';
    }else{
      if(engine.arisRegimeCandidate===r.raw)engine.arisRegimeCandidateCount=(engine.arisRegimeCandidateCount||0)+1;
      else{engine.arisRegimeCandidate=r.raw;engine.arisRegimeCandidateCount=1;}
      const needed=engine.arisRegimeMode==='TRANSITION'?1:2;
      if(engine.arisRegimeCandidateCount>=needed){engine.arisRegimeMode=r.raw;engine.arisRegimeCandidate=null;engine.arisRegimeCandidateCount=0;}
    }
  }
  return {...r,mode:r.raw==='TRANSITION'?'TRANSITION':engine.arisRegimeMode,stableMode:engine.arisRegimeMode,rangeScore:r.raw==='RANGE'?1:0,trendScore:r.raw==='TREND'?1:0,breakoutCandidate:false,acceptedDir:0,breakoutDir:0};
}
function roomAtr(z,p,d,atr){
  const rows=(z||[]).filter(v=>d*(v.price-p)>0).map(v=>d*(v.price-p)/Math.max(atr,1e-9)).filter(Number.isFinite).sort((a,b)=>a-b);
  return rows.length?rows[0]:Infinity;
}
function liveMetrics(f,x,d){
  const live=x.current||x.bars?.at(-1)||f.b.at(-1),atr=Math.max(f.atr,1e-9),p=x.price;
  const high=Math.max(live?.high??p,p),low=Math.min(live?.low??p,p),range=Math.max(high-low,1e-9),open=live?.open??p;
  const closeLocation=clip((p-low)/range,0,1),body=d*(p-open)/atr;
  const adverseWick=d>0?(high-Math.max(open,p))/range:(Math.min(open,p)-low)/range;
  const supportiveWick=d>0?(Math.min(open,p)-low)/range:(high-Math.max(open,p))/range;
  const alignedClose=d>0?closeLocation:1-closeLocation;
  return {live,body,closeLocation,alignedClose,adverseWick,supportiveWick,rangeAtr:range/atr,liveDir:sign(p-open,0)};
}
function candleTimingScore(f,x,d){
  const m=liveMetrics(f,x,d);
  const body=clip((m.body+.12)/.47,0,1);
  const close=clip(m.alignedClose,0,1);
  const wick=clip(1-m.adverseWick,0,1);
  const last3=f.b.slice(-3),aligned=last3.filter(b=>sign(b.close-b.open,0)===d).length/Math.max(1,last3.length);
  return clip(body*.40+close*.30+wick*.20+aligned*.10,0,1);
}
function freshScore(extension){
  const e=Math.max(0,extension);
  if(e<=.80)return 1;
  if(e<=1.60)return 1-.50*((e-.80)/.80);
  if(e<=2.20)return .50*(1-(e-1.60)/.60);
  return 0;
}
function timingScore(f,x,d,z,candidate,setup){
  const atr=Math.max(f.atr,1e-9),macroExtension=d*(x.price-f.ema21)/atr;
  const localTiming=!!setup?.localTiming&&Number.isFinite(setup?.timingBase);
  const extension=localTiming?d*(x.price-setup.timingBase)/atr:macroExtension;
  const room=roomAtr(z,x.price,d,atr),flow=d*(x.flow||0);
  const extreme=candidate?.extreme??x.price,retreat=d*(extreme-x.price)/atr;
  const fresh=freshScore(extension),roomScore=Number.isFinite(room)?clip(room/.60,0,1):1,flowScore=clip((flow-.02)/.18,0,1),retreatScore=1-clip(Math.max(0,retreat)/.35,0,1),candle=candleTimingScore(f,x,d);
  const total=Math.round(30*fresh+20*roomScore+20*flowScore+15*retreatScore+15*candle);
  const heat=Math.max(f.relVolume||0,f.volume3Ratio||0,x.phase?.liveVolumePace||0);
  const progress=Number.isFinite(setup?.progress)?setup.progress:d*(x.price-(setup?.level??x.price))/atr;
  const macroHard=!!CFG.arisPostLatePlan&&localTiming&&macroExtension>=CFG.arisMacroHardExtension;
  const hardLate=extension>=CFG.arisHardLateExtension||progress>=CFG.arisMaxTriggerProgress||macroHard;
  const softLate=!hardLate&&extension>=CFG.arisSoftLateExtension&&(heat>CFG.arisSoftHeat||room<CFG.arisSoftRoom||retreat>CFG.arisSoftRetreat);
  return {total,extension,macroExtension,localTiming,room,flow,retreat,heat,progress,hardLate,softLate,macroHard,parts:{fresh,room:roomScore,flow:flowScore,retreat:retreatScore,candle}};
}
function setupKey(type,d,level,barTime){return [type,d,Number(level).toFixed(1),barTime||0].join(':');}
function detectSetup(f,x,regime,phase,z,bias,prev){
  if(!prev)return null;
  const atr=Math.max(f.atr,1e-9),p=x.price,closed=f.b,last=closed.at(-1),before=closed.slice(-7,-1),barTime=last?.time||0;

  /* V1.2 breakout follow: catch a real expansion while it is still near the broken edge.
     It may start before the slower EMA-heavy Bias reaches the ordinary ENTER threshold,
     but it cannot fight a clearly opposite Bias. */
  if(CFG.arisBreakoutFollow){
    const upProgress=(p-f.high)/atr,downProgress=(f.low-p)/atr;
    const breakD=upProgress>=CFG.arisBreakoutBuffer?1:downProgress>=CFG.arisBreakoutBuffer?-1:0;
    if(breakD){
      const progress=breakD>0?upProgress:downProgress,level=breakD>0?f.high:f.low;
      const live=liveMetrics(f,x,breakD),flow=breakD*(x.flow||0),biasAligned=breakD*bias.bias;
      const room=roomAtr(z,p,breakD,atr);
      const votes=[
        (phase?.score||0)>=4,
        live.rangeAtr>=CFG.arisBreakoutMinRangeAtr,
        (phase?.liveVolumePace||0)>=CFG.arisBreakoutMinVolumePace,
        breakD*(f.momAccel||0)>=.08
      ].filter(Boolean).length;
      const phaseAgainst=phase?.phase==='REVERSAL'&&phase?.dir&&phase.dir!==breakD;
      const roomOK=!Number.isFinite(room)||room>=CFG.arisBreakoutMinRoom;
      if(progress<=CFG.arisBreakoutMaxProgress&&flow>=CFG.arisBreakoutMinFlow&&biasAligned>=CFG.arisBreakoutMinBias&&
         live.liveDir===breakD&&live.alignedClose>=CFG.arisBreakoutMinClose&&votes>=CFG.arisBreakoutMinVotes&&roomOK&&!phaseAgainst){
        return {type:'breakout_follow',d:breakD,level,progress,barTime,key:setupKey('breakout_follow',breakD,level,barTime),
          entryBiasMin:CFG.arisBreakoutMinBias,entryBiasReady:Math.min(CFG.arisBreakoutMinBias,.04),timingBase:level,localTiming:false,
          breakoutVotes:votes,reason:'Breakout Follow · พ้นขอบกรอบพร้อม flow + expansion และยังอยู่ใกล้จุดเบรก'};
      }
    }
  }

  const d=sign(bias.bias,CFG.arisBiasWatch),abs=Math.abs(bias.bias);
  if(!d||abs<CFG.arisBiasReady)return null;
  const flow=d*(x.flow||0),extension=d*(p-f.ema21)/atr,live=liveMetrics(f,x,d);
  if(phase?.phase==='REVERSAL'&&phase.dir===d&&abs>=CFG.arisBiasEnter&&flow>=.05&&before.length>=3){
    const recent=before.slice(-3),level=d>0?Math.max(...recent.map(b=>b.high)):Math.min(...recent.map(b=>b.low)),progress=d*(p-level)/atr;
    if(progress>=.03&&progress<=.25&&d*(f.momAccel||0)>=.05)return {type:'confirmed_reversal',d,level,progress,barTime,key:setupKey('confirmed_reversal',d,level,barTime),reason:'กลับทิศยืนยัน + micro structure แตก + flow หนุน'};
  }
  if(regime.mode==='TREND'&&last&&before.length>=5&&abs>=CFG.arisBiasEnter){
    const anchor=d>0?Math.max(...before.map(b=>b.high)):Math.min(...before.map(b=>b.low)),trough=d>0?last.low:last.high,depth=d*(anchor-trough)/atr,level=d>0?last.high:last.low;
    const structure=d*(last.close-f.ema21)>-.25*atr,crossed=d*(prev.price-level)<=0&&d*(p-level)>0,progress=d*(p-level)/atr;
    const liveReclaim=!!CFG.arisAllowLiveReclaim&&progress>=CFG.arisPullbackReclaimMinProgress&&progress<=CFG.arisPullbackReclaimMaxProgress;
    if(depth>=CFG.arisPullbackMin&&depth<=CFG.arisPullbackMax&&structure&&(crossed||liveReclaim)&&flow>=.05&&extension<=CFG.arisPullbackMaxExtension)return {type:'pullback_reclaim',d,level,progress,depth,barTime,key:setupKey('pullback_reclaim',d,level,barTime),reason:liveReclaim&&!crossed?'เทรนด์ย่อแล้ว reclaim ยังสด · ยอมรับแม้พลาด exact cross tick':'เทรนด์ย่อในขนาดพอดี แล้ว reclaim พร้อม flow'};
  }
  if(regime.mode==='RANGE'){
    const edgeD=f.rangePosition<=CFG.arisRangeEdge?1:f.rangePosition>=1-CFG.arisRangeEdge?-1:0;
    if(edgeD&&edgeD===d){
      const rejects=d>0?f.lowerRejects:f.upperRejects,edge=d>0?f.low:f.high,progress=d*(p-edge)/atr,inward=d*(p-prev.price)>0,room=roomAtr(z,p,d,atr);
      const rejection=rejects>=1||live.supportiveWick>=.20||progress>=.08;
      if(inward&&rejection&&flow>=.03&&room>=CFG.arisRangeRoom)return {type:'range_rejection',d,level:edge,progress,barTime,key:setupKey('range_rejection',d,edge,barTime),reason:'ขอบกรอบ + rejection + flow กลับเข้ากรอบ'};
    }
  }
  if(regime.mode!=='RANGE'&&abs>=CFG.arisBiasEnter&&d*(f.momAccel||0)>=.10&&flow>=CFG.arisEarlyImpulseFlow&&live.liveDir===d&&extension<=CFG.arisEarlyImpulseMaxExtension&&before.length>=5){
    const level=d>0?Math.max(...before.slice(-5).map(b=>b.high)):Math.min(...before.slice(-5).map(b=>b.low)),progress=d*(p-level)/atr;
    if(progress>=CFG.arisEarlyImpulseMinProgress&&progress<=CFG.arisEarlyImpulseMaxProgress)return {type:'early_impulse',d,level,progress,barTime,key:setupKey('early_impulse',d,level,barTime),reason:'Bias + acceleration + flow เริ่มเร่ง และเพิ่งพ้นโครงสร้างต้นขา'};
  }

  /* Live Opportunity: do not require catching the exact cross tick. */
  if(regime.mode!=='RANGE'&&abs>=CFG.arisBiasEnter&&before.length>=5){
    const trendAligned=d*(f.trend||0)>=.12, slopeAligned=d*(f.emaSlopeAtr||0)>=.08, momAligned=d*(f.mom||0)>=.12;
    const structureVotes=[trendAligned,slopeAligned,momAligned].filter(Boolean).length;
    const phaseAgainst=['EXHAUSTION'].includes(phase?.phase)||(phase?.phase==='REVERSAL'&&phase?.dir&&phase.dir!==d);
    const flowOK=flow>=CFG.arisLiveOpportunityFlow, liveOK=live.liveDir===d||d*(f.momAccel||0)>=.04;
    const room=roomAtr(z,p,d,atr), roomOK=!Number.isFinite(room)||room>=CFG.arisLiveOpportunityRoom;
    const level=last?.close??p,progress=d*(p-level)/atr;
    const notChasing=extension<=CFG.arisLiveOpportunityMaxExtension&&progress>=CFG.arisLiveOpportunityMinProgress&&progress<=CFG.arisLiveOpportunityMaxProgress;
    if(structureVotes>=2&&flowOK&&liveOK&&roomOK&&!phaseAgainst&&notChasing){
      return {type:'live_opportunity',d,level,progress,barTime,key:setupKey('live_opportunity',d,level,barTime),
       reason:'Live Opportunity · โครงสร้าง/โมเมนตัมยังหนุน + flow ไปทางเดียวกัน + ยังมี room โดยไม่ต้องรอ cross ใหม่'};
    }
  }
  return null;
}

function detectPostLateSetup(engine,f,x,regime,phase,z,bias,prev){
  if(!CFG.arisPostLatePlan||!engine.arisLatePlan||!prev)return null;
  const plan=engine.arisLatePlan,atr=Math.max(f.atr,1e-9),p=x.price;
  if(x.ts-plan.startedAt>CFG.arisLatePlanMaxAgeMs){engine.arisLatePlan=null;return null;}
  const oldD=plan.d,revD=-oldD;

  // A new extreme means the old move extended again; restart pullback measurement from that extreme.
  const extended=oldD>0?p>plan.extreme:p<plan.extreme;
  if(extended){
    plan.extreme=p;plan.recoveryPivot=p;plan.maxRetreat=0;plan.lastSeen=x.ts;
  }else{
    const retreat=oldD*(plan.extreme-p)/atr;
    if(retreat>plan.maxRetreat){plan.maxRetreat=retreat;plan.recoveryPivot=p;}
    plan.lastSeen=x.ts;
  }

  // Reversal is allowed only after the late move actually shows exhaustion/reversal evidence.
  const revLive=liveMetrics(f,x,revD),revFlow=revD*(x.flow||0);
  const revStructure=revD*(p-f.ema8)/atr;
  const phaseConfirmed=phase?.phase==='REVERSAL'&&phase?.dir===revD;
  const exhaustionConfirmed=phase?.phase==='EXHAUSTION'&&(phase?.exhaustionScore||0)>=2&&
    plan.maxRetreat>=CFG.arisLateReversalMinRetreat&&revLive.liveDir===revD&&
    revFlow>=CFG.arisLateReversalMinFlow&&revStructure>=CFG.arisLateReversalStructureAtr;
  if(phaseConfirmed||exhaustionConfirmed){
    const level=f.ema8,progress=Math.max(0,revD*(p-level)/atr);
    return {type:'post_late_reversal',d:revD,level,progress,barTime:f.b.at(-1)?.time||0,
      key:setupKey('post_late_reversal',revD,level,f.b.at(-1)?.time||0),
      entryBiasMin:-CFG.arisLateReversalMaxAgainstBias,entryBiasReady:-CFG.arisLateReversalMaxAgainstBias,
      timingBase:level,localTiming:true,latePlan:true,lateTrendDir:oldD,
      reason:'Post-Late Reversal · ขาเดิมเริ่มหมดแรง + flow พลิก + micro structure แตก'};
  }

  // Preferred recovery: wait for a real pullback, then follow the original trend from a fresh pivot.
  const rebound=oldD*(p-plan.recoveryPivot)/atr,followLive=liveMetrics(f,x,oldD),followFlow=oldD*(x.flow||0);
  const biasAligned=oldD*bias.bias,macroExtension=oldD*(p-f.ema21)/atr;
  const phaseAgainst=phase?.phase==='REVERSAL'&&phase?.dir===revD;
  if(plan.maxRetreat>=CFG.arisLatePullbackMin&&plan.maxRetreat<=CFG.arisLatePullbackMax&&
     rebound>=CFG.arisLateReclaimMinProgress&&rebound<=CFG.arisLateReclaimMaxProgress&&
     oldD*(p-prev.price)>0&&followLive.liveDir===oldD&&followFlow>=CFG.arisLateReclaimMinFlow&&
     biasAligned>=CFG.arisLateFollowMinBias&&!phaseAgainst&&macroExtension<CFG.arisMacroHardExtension){
    const level=plan.recoveryPivot;
    return {type:'post_late_reclaim',d:oldD,level,progress:rebound,barTime:f.b.at(-1)?.time||0,
      key:setupKey('post_late_reclaim',oldD,level,f.b.at(-1)?.time||0),
      entryBiasMin:CFG.arisLateFollowMinBias,entryBiasReady:Math.min(CFG.arisLateFollowMinBias,.06),
      timingBase:level,localTiming:true,latePlan:true,lateTrendDir:oldD,
      reason:'Post-Late Reclaim · พลาดขาแรกแล้ว รอย่อจริงก่อนกลับมาตามจาก pivot ใหม่'};
  }
  return null;
}

function candleSnapshot(bars,atr,n=8){
  const a=Math.max(atr,1e-9);
  return (bars||[]).slice(-n).map(b=>{const r=Math.max(b.high-b.low,1e-9),body=b.close-b.open;return {time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,closed:!!b.closed,direction:body>0?'GREEN':body<0?'RED':'DOJI',bodyAtr:Math.abs(body)/a,rangeAtr:r/a,closeLocation:clip((b.close-b.low)/r,0,1),upperWickAtr:(b.high-Math.max(b.open,b.close))/a,lowerWickAtr:(Math.min(b.open,b.close)-b.low)/a};});
}
function compactBars(bars,n=20){return (bars||[]).filter(b=>b.closed).slice(-n).map(b=>[b.time,b.open,b.high,b.low,b.close,b.volume]);}
function nearestZone(z,p,kind,atr){
  const rows=(z||[]).filter(v=>v.kind===kind).map(v=>({...v,distanceAtr:Math.abs(v.price-p)/Math.max(atr,1e-9)})).sort((a,b)=>a.distanceAtr-b.distanceAtr);
  const r=rows[0];return r?{price:r.price,distanceAtr:r.distanceAtr,touches:r.touches||0,confirmedAt:r.confirmedAt||null}:null;
}
function arisInput(f,x,regime,phase,bias,setup,timing){
  return {schema:'btc-t10-training-v2',arisRevision:CFG.arisRevision||'base',type:setup?.type||'aris_watch',modelDirection:bias.bias>=0?'HIGH':'LOW',detectedPrice:x.price,level:setup?.level??x.price,atr:f.atr,flow:Number.isFinite(x.flow)?x.flow:null,book:Number.isFinite(x.book)?x.book:null,coverage:x.coverage||0,bookValid:!!x.bookValid,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,closeLocation:f.closeLocation,impulseSeq:f.impulseSeq,marketPhase:phase?.phase||null,phaseDir:phase?.dir||0,phaseScore:phase?.score||0,liveVolumePace:phase?.liveVolumePace??null,liveBodyAtr:phase?.liveBodyAtr??null,extensionAtr:timing?.extension??(bias.bias>=0?1:-1)*(x.price-f.ema21)/Math.max(f.atr,1e-9),arisBias:bias.bias,arisBiasBase:bias.base,arisBiasParts:bias.parts,arisTiming:timing?.total??null,arisTimingParts:timing?.parts??null,arisRegime:regime.mode,watchRoomAtr:timing?.room??null,candles:candleSnapshot(x.bars,f.atr,8),prior1m:compactBars(x.bars,20)};
}
function watchReasons(bias,timing,setup){
  const p=bias.parts,d=bias.bias>=0?1:-1,rows=[];
  if(d*p.trend>.20)rows.push('Trend หนุน');
  if(d*p.slope>.20)rows.push('EMA slope หนุน');
  if(d*p.momentum>.16)rows.push('Momentum หนุน');
  if(d*p.acceleration>.12)rows.push('Momentum กำลังเร่ง');
  if(d*p.flow>.04)rows.push('Flow สดหนุน');
  if(setup)rows.push('พบ '+setup.type);
  if(timing&&Number.isFinite(timing.room)&&timing.room>=.35)rows.push('ยังมี room ข้างหน้า');
  return rows.slice(0,6);
}
function recordArisWatch(engine,watch,x,f,regime,phase,bias,timing){
  if(!watch){engine.arisWatchDirection=null;return;}
  const same=engine.arisWatchDirection===watch.direction,last=engine.lastWatchRecorded?.[watch.direction]||0;
  engine.arisWatchDirection=watch.direction;
  if(same||x.ts-last<CFG.watchCooldownMs)return;
  if(!engine.lastWatchRecorded)engine.lastWatchRecorded={HIGH:0,LOW:0};
  engine.lastWatchRecorded[watch.direction]=x.ts;
  const id='W:'+CFG.version+':'+watch.direction+':'+x.ts;
  const row={id,schema:'btc-t10-watch-v1',version:CFG.version,direction:watch.direction,entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,result:'pending',lastObserved:x.ts,watchState:watch.state,watchScore:watch.score,watchReasons:[...watch.reasons],path1m:[],input:{...arisInput(f,x,regime,phase,bias,null,timing),watchState:watch.state,watchScore:watch.score,watchReasons:[...watch.reasons]}};
  engine.watchSamples.push(row);if(engine.watchSamples.length>900)engine.watchSamples.shift();
  engine.log('watch_detected',x.ts,{id,direction:watch.direction,score:watch.score,state:watch.state,price:x.price,input:row.input});
}
function arisEpisodeInfo(engine,x,d,f,setup){
  const direction=d>0?'HIGH':'LOW';
  const recent=[...engine.signals].reverse().filter(s=>s.version===CFG.version&&s.direction===direction&&
    x.ts-s.entryTime<=CFG.episodeWindowMs&&Math.abs(s.entryPrice-x.price)<=f.atr*CFG.episodeAtrDistance);
  const prior=recent[0]||null;
  const sameSetupKey=prior?.dataset?.entry?.arisSetupKey&&setup?.key&&prior.dataset.entry.arisSetupKey===setup.key;
  const episodeId=prior?.dataset?.episodeId||`ARIS:${engine.session}:${Math.floor(x.ts/60000)}`;
  const sequence=prior?.dataset?.episodeId===episodeId?(prior.dataset.episodeSequence||1)+1:1;
  return {prior,episodeId,sequence,isAddOn:!!prior,sameSetupKey:!!sameSetupKey};
}
function arisStep(x){
  const f=features(x.bars,x.price,x.horizonBars||10);if(!f)return {status:'warmup',reason:'ARIS V1 · รอแท่งที่สมบูรณ์อย่างน้อย 35 แท่ง',signal:null};
  const z=zones(x.bars||[],f.atr),regime=arisRegime(this,f),phase=marketPhase(f,x,regime);x.phase=phase;
  const bias=arisBias(f,x),absBias=Math.abs(bias.bias),biasD=sign(bias.bias,CFG.arisBiasWatch),biasDirection=biasD>0?'HIGH':biasD<0?'LOW':null;
  const label=CFG.version==='ARIS-1.2.0'?'ARIS V1.2':'ARIS V1';
  const base={f,z,regime,phase,signal:null,event:null,continuation:0,reversal:0,arisBias:bias.bias};
  if(!x.fresh){this.arisCandidate=null;return this.lastView={...base,status:'offline',reason:label+' · พักสัญญาณจนข้อมูล Futures สดและต่อเนื่อง'};}
  if(x.id===this.lastId)return {...(this.lastView||base),status:this.lastView?.status==='new'?'issued':this.lastView?.status,signal:null};
  this.lastId=x.id;
  const prev=this.previous;this.previous={price:x.price,ts:x.ts};
  if(!prev||x.ts-prev.ts>5000){this.arisCandidate=null;return this.lastView={...base,status:'warming',reason:label+' · ตั้งต้นราคาสด รอข้อมูลต่อเนื่อง'};}

  let setup=detectPostLateSetup(this,f,x,regime,phase,z,bias,prev)||detectSetup(f,x,regime,phase,z,bias,prev),candidate=this.arisCandidate;
  if(setup&&(!candidate||candidate.key!==setup.key)){
    if(candidate&&!candidate.issued)this.log('cancelled',x.ts,{id:candidate.id||candidate.key,reason:label+' · setup เปลี่ยนก่อนเข้า'});
    candidate=this.arisCandidate={...setup,id:'ARIS-C:'+this.session+':'+x.ts+':'+setup.key,startedAt:x.ts,startPrice:x.price,extreme:x.price,evidenceSince:0,ticks:0,issued:false,logged:false};
  }
  if(candidate&&!setup&&x.ts-candidate.startedAt>CFG.arisCandidateMaxAgeMs){
    if(!candidate.issued)this.log('cancelled',x.ts,{id:candidate.id||candidate.key,reason:label+' · setup หมดอายุก่อนเข้า'});
    this.arisCandidate=null;candidate=null;
  }
  if(candidate){candidate.extreme=candidate.d>0?Math.max(candidate.extreme,x.price):Math.min(candidate.extreme,x.price);setup=setup||candidate;}

  const activeD=setup?.d||candidate?.d||biasD,activeDirection=activeD>0?'HIGH':activeD<0?'LOW':null;
  const rawRoom=activeD?roomAtr(z,x.price,activeD,f.atr):null,rawExtension=activeD?activeD*(x.price-f.ema21)/Math.max(f.atr,1e-9):0;
  const timing=activeD?timingScore(f,x,activeD,z,candidate,setup):null;
  const alignedBias=activeD?activeD*bias.bias:0;
  const enterBiasMin=Number.isFinite(candidate?.entryBiasMin)?candidate.entryBiasMin:CFG.arisBiasEnter;
  const readyBiasMin=Number.isFinite(candidate?.entryBiasReady)?candidate.entryBiasReady:Math.min(CFG.arisBiasReady,enterBiasMin);

  if(candidate&&!candidate.logged&&timing){
    candidate.logged=true;
    this.log('detected',x.ts,{id:candidate.id,key:candidate.key,type:candidate.type,detectedAt:x.ts,direction:activeDirection,price:x.price,level:candidate.level,candidate:arisInput(f,x,regime,phase,bias,candidate,timing)});
  }
  const tooLate=!!timing&&(timing.hardLate||timing.softLate);
  const biasReady=activeD&&alignedBias>=readyBiasMin;
  const watchState=tooLate?'TOO_LATE':setup&&biasReady&&timing?.total>=CFG.arisTimingReady?'READY':'WATCH';
  const watch=activeDirection?{direction:activeDirection,d:activeD,score:Math.round(Math.max(0,Math.abs(bias.bias))*100),state:watchState,reasons:watchReasons(bias,timing,setup),room:timing?.room??rawRoom,extension:timing?.extension??rawExtension,
    reason:tooLate?activeDirection+' ยังเด่น แต่ timing ช้าแล้ว · ไม่ไล่ราคา':watchState==='READY'?activeDirection+' เริ่มพร้อม · รอคะแนนเข้าให้ครบ':'จับตา '+activeDirection+' · มีแผนอยู่ แต่ยังไม่อนุญาตเข้า'}:null;
  if(watch&&watch.score>=CFG.watchMinScore)recordArisWatch(this,watch,x,f,regime,phase,bias,timing);else recordArisWatch(this,null,x,f,regime,phase,bias,timing);

  if(candidate?.issued){
    const progress=candidate.d*(x.price-candidate.level)/Math.max(f.atr,1e-9),signal=this.signals.find(s=>s.id===candidate.signalId);
    if(progress<-.18&&signal){signal.setupStatus='invalidated';signal.invalidatedAt=x.ts;this.arisCandidate=null;return this.lastView={...base,event:{...candidate},status:'invalidated',reason:label+' · สัญญาณล็อกแล้ว แต่โครงสร้างหลังเข้าเสีย'};}
    if(x.ts-candidate.issuedAt>60000)this.arisCandidate=null;
    return this.lastView={...base,event:{...candidate},status:'issued',reason:label+' · จุดเข้าออกแล้ว · ล็อกผลถึง T+10'};
  }

  if(!activeDirection||(!candidate&&absBias<CFG.arisBiasWatch)){
    this.arisCandidate=null;
    return this.lastView={...base,status:'watch',reason:label+` · Bias ยังต่ำกว่า ${CFG.arisBiasWatch.toFixed(2)} · ไม่มี edge พอให้เลือกฝั่ง`,gate:{state:'WAIT',direction:null,blocker:'Bias ยังไม่ถึงเกณฑ์ WATCH',waitingFor:[`รอ |Bias| ≥ ${CFG.arisBiasWatch.toFixed(2)}`],metrics:{bias:bias.bias}}};
  }

  if(tooLate){
    if(candidate){candidate.evidenceSince=0;candidate.ticks=0;}
    if(CFG.arisPostLatePlan&&activeD){
      const expired=!this.arisLatePlan||this.arisLatePlan.d!==activeD||x.ts-this.arisLatePlan.startedAt>CFG.arisLatePlanMaxAgeMs;
      if(expired){
        const level=candidate?.level??setup?.level??x.price;
        this.arisLatePlan={d:activeD,direction:activeDirection,startedAt:x.ts,lastSeen:x.ts,triggerLevel:level,extreme:x.price,recoveryPivot:x.price,maxRetreat:0,sourceType:candidate?.type||setup?.type||null};
      }else{
        this.arisLatePlan.lastSeen=x.ts;
        if(activeD>0)this.arisLatePlan.extreme=Math.max(this.arisLatePlan.extreme,x.price);
        else this.arisLatePlan.extreme=Math.min(this.arisLatePlan.extreme,x.price);
      }
    }
    const opposite=activeD>0?'LOW':'HIGH';
    const planWaiting=CFG.arisPostLatePlan?[
      `Plan A · รอย่อ ${CFG.arisLatePullbackMin.toFixed(2)}–${CFG.arisLatePullbackMax.toFixed(2)} ATR แล้ว reclaim ตาม ${activeDirection}`,
      `Plan B · ถ้า exhaustion + flow พลิก + micro structure แตก → WATCH ${opposite}`,
      'Plan C · ถ้าเกิด breakout ใหม่ที่ยังสด ให้ประเมิน Breakout Follow ใหม่'
    ]:[`Extension ${timing.extension.toFixed(2)} ATR`,`Trigger progress ${timing.progress.toFixed(2)} ATR`,`Timing ${timing.total}/100`];
    return this.lastView={...base,event:candidate?{...candidate}:null,watch,status:'tracking',
      reason:timing.hardLate?label+' · TOO LATE · ไม่ไล่ แต่เปิดแผนต่อแล้ว':label+' · ปลายขา · ไม่ไล่ และกำลังรอย่อ/กลับตัวตามหลักฐาน',
      gate:{state:'TOO_LATE',direction:activeDirection,code:'aris_too_late',blocker:'ไม่ไล่ราคา · กำลังตามแผนถัดไป',waitingFor:planWaiting,
      metrics:{bias:bias.bias,alignedBias,timing:timing.total,flow:timing.flow,progress:timing.progress,retreat:timing.retreat,room:Number.isFinite(timing.room)?timing.room:null,extensionAtr:timing.extension,macroExtensionAtr:timing.macroExtension}}};
  }

  if(!setup||!candidate){
    const waiting=CFG.arisBreakoutFollow?['Breakout Follow','Early Impulse','Pullback Reclaim','Range Rejection','Confirmed Reversal','Live Opportunity']:['Early Impulse','Pullback Reclaim','Range Rejection','Confirmed Reversal','Live Opportunity'];
    return this.lastView={...base,watch,status:'watch',reason:watch?.reason||label+' · กำลังจับตา',gate:{state:'WATCH',direction:activeDirection||biasDirection,code:'aris_watch',blocker:'Direction เริ่มชัด แต่ยังไม่มี setup ที่ผ่าน',waitingFor:waiting,metrics:{bias:bias.bias,room:Number.isFinite(rawRoom)?rawRoom:null,extensionAtr:rawExtension}}};
  }

  const episodeInfo=arisEpisodeInfo(this,x,activeD,f,setup);
  if(episodeInfo.sameSetupKey){
    candidate.evidenceSince=0;candidate.ticks=0;
    return this.lastView={...base,event:{...candidate},watch,status:'tracking',reason:label+' · trigger เดิมถูกใช้แล้ว · รอ setup ใหม่จริงก่อนเติม',gate:{state:'WAIT',direction:activeDirection,code:'aris_same_trigger_guard',blocker:'ไม่ยิงซ้ำ trigger เดิม',waitingFor:['รอ level / bar / reclaim / rejection ใหม่ แล้วประเมินใหม่เต็มชุด'],metrics:{bias:bias.bias,alignedBias,timing:timing.total,flow:timing.flow,progress:timing.progress,retreat:timing.retreat,room:Number.isFinite(timing.room)?timing.room:null,extensionAtr:timing.extension}}};
  }

  const coverageOK=(x.coverage||0)>=CFG.arisFlowCoverageSec,flowOK=timing.flow>=.02;
  const ready=alignedBias>=readyBiasMin&&timing.total>=CFG.arisTimingReady&&coverageOK;
  const enter=alignedBias>=enterBiasMin&&timing.total>=CFG.arisTimingEnter&&coverageOK&&flowOK;
  if(!enter){
    candidate.evidenceSince=0;candidate.ticks=0;
    const waiting=[];
    if(alignedBias<enterBiasMin)waiting.push(`Aligned Bias ${alignedBias.toFixed(2)} / ${enterBiasMin.toFixed(2)}`);
    if(timing.total<CFG.arisTimingEnter)waiting.push(`Timing ${timing.total}/${CFG.arisTimingEnter}`);
    if(!coverageOK)waiting.push(`Flow coverage ${Number(x.coverage||0).toFixed(1)}/${CFG.arisFlowCoverageSec} วินาที`);
    if(!flowOK)waiting.push(`Aligned flow ${timing.flow.toFixed(2)} · ต้องเป็นบวกอย่างน้อย 0.02`);
    return this.lastView={...base,event:{...candidate},watch,status:ready?'confirming':'tracking',reason:ready?label+' · READY · setup ผ่าน แต่ยังรอคะแนน ENTER':label+' · WATCH · setup มาแล้ว แต่ timing/direction evidence ยังไม่ถึง ENTER',gate:{state:ready?'READY':'WATCH',direction:activeDirection,code:'aris_entry_score',blocker:ready?'ใกล้เข้าแล้ว':'คะแนนเข้าไม่ครบ',waitingFor:waiting.length?waiting:['รอ trigger คงคุณภาพต่อ'],metrics:{bias:bias.bias,alignedBias,timing:timing.total,flow:timing.flow,progress:timing.progress,retreat:timing.retreat,room:Number.isFinite(timing.room)?timing.room:null,extensionAtr:timing.extension,macroExtensionAtr:timing.macroExtension}}};
  }

  if(!candidate.evidenceSince)candidate.evidenceSince=x.ts;candidate.ticks=(candidate.ticks||0)+1;
  if(candidate.ticks<CFG.minEvidenceTicks||x.ts-candidate.evidenceSince<CFG.minEvidenceMs){
    return this.lastView={...base,event:{...candidate},watch,status:'confirming',reason:label+' · READY · ยืนยันข้อมูลสดสั้น ๆ ก่อนล็อกจุดเข้า',gate:{state:'READY',direction:activeDirection,code:'aris_confirmation',blocker:'เงื่อนไขผ่านแล้ว',waitingFor:[`ยืนยัน ${Math.min(candidate.ticks,CFG.minEvidenceTicks)}/${CFG.minEvidenceTicks} ครั้ง`,`คงเงื่อนไขอย่างน้อย ${CFG.minEvidenceMs} ms`],metrics:{bias:bias.bias,alignedBias,timing:timing.total,flow:timing.flow,progress:timing.progress,retreat:timing.retreat,room:Number.isFinite(timing.room)?timing.room:null,extensionAtr:timing.extension,macroExtensionAtr:timing.macroExtension}}};
  }

  const outputDirection=activeDirection,episodeId=episodeInfo.episodeId,episodeSequence=episodeInfo.sequence,isAddOn=episodeInfo.isAddOn,id=`ARIS:${this.session}:${x.ts}:${setup.key}`;
  const entryLow=activeD>0?setup.level-f.atr*.03:setup.level-f.atr*.40,entryHigh=activeD>0?setup.level+f.atr*.40:setup.level+f.atr*.03;
  const signal={
    id,version:CFG.version,type:setup.type,direction:outputDirection,modelDirection:outputDirection,decisionPolicy:'aris_v1_direction_setup_timing',
    entryTime:x.ts,entryPrice:x.price,expiresAt:x.ts+CFG.horizonMs,result:'pending',lastObserved:x.ts,event:{...candidate},
    features:{atr:f.atr,trend:f.trend,flow:x.flow,book:x.book,room:Number.isFinite(timing.room)?timing.room:null,progress:timing.progress,drift:activeD*(x.price-candidate.startPrice)/Math.max(f.atr,1e-9),retreat:timing.retreat,regime:regime.mode,stableMode:regime.stableMode,marketPhase:phase.phase,phaseDir:phase.dir,phaseScore:phase.score,eff:f.eff,emaSepAtr:f.emaSepAtr,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,rangePosition:f.rangePosition,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,liveVolumePace:phase.liveVolumePace,extensionAtr:timing.extension,macroExtensionAtr:timing.macroExtension,exhaustionScore:phase.exhaustionScore,arisBias:bias.bias,arisAlignedBias:alignedBias,arisTiming:timing.total},
    dataset:{schema:'btc-t10-training-v2',episodeId,episodeSequence,path1m:[],context1m:[],entry:{
      capturedAt:x.ts,price:x.price,outputDirection,modelDirection:outputDirection,decisionPolicy:'aris_v1_direction_setup_timing',decisionReason:setup.reason,strategyVersion:CFG.version,setupType:setup.type,setupReason:setup.reason,
      marketPhase:phase.phase,phaseDir:phase.dir,phaseScore:phase.score,relativeVolume:f.relVolume,volume3Ratio:f.volume3Ratio,bodyAtr:f.bodyAtr,rangeAtr:f.rangeAtr,closeLocation:f.closeLocation,liveVolumePace:phase.liveVolumePace,phaseExtensionAtr:phase.extensionAtr,exhaustionScore:phase.exhaustionScore,
      level:setup.level,entryLow,entryHigh,atr:f.atr,trend:f.trend,momentum:f.mom,momentumAccel:f.momAccel,eff:f.eff,ema8:f.ema8,ema21:f.ema21,emaSepAtr:f.emaSepAtr,emaSlopeAtr:f.emaSlopeAtr,rangeHigh:f.high,rangeLow:f.low,fair:f.fair,rangeWidthAtr:f.rangeWidthAtr,rangePosition:f.rangePosition,sideCrosses:f.sideCrosses,falseBreaks:f.falseBreaks,upperRejects:f.upperRejects,lowerRejects:f.lowerRejects,regime:regime.mode,stableMode:regime.stableMode,
      flow:x.flow,coverage:x.coverage||0,book:x.book,bookValid:!!x.bookValid,room:Number.isFinite(timing.room)?timing.room:null,progress:timing.progress,retreat:timing.retreat,
      arisRevision:CFG.arisRevision||'base',arisBias:bias.bias,arisAlignedBias:alignedBias,arisRequiredBias:enterBiasMin,arisBiasBase:bias.base,arisBiasParts:bias.parts,arisTiming:timing.total,arisTimingParts:timing.parts,arisHeat:timing.heat,arisExtensionAtr:timing.extension,arisMacroExtensionAtr:timing.macroExtension,arisLocalTiming:!!timing.localTiming,arisSetupProgressAtr:timing.progress,
      arisSetupKey:setup.key,arisIsAddOn:isAddOn,arisAddOnSequence:episodeSequence,arisPriorSignalId:episodeInfo.prior?.id||null,arisLatePlan:!!setup.latePlan,arisBreakoutVotes:setup.breakoutVotes??null,
      outputExtensionAtr:activeD*(x.price-f.ema8)/Math.max(f.atr,1e-9),modelExtensionAtr:activeD*(x.price-f.ema8)/Math.max(f.atr,1e-9),
      zones:{nearestSupport:nearestZone(z,x.price,'support',f.atr),nearestResistance:nearestZone(z,x.price,'resistance',f.atr)},
      liveBar:x.bars.at(-1)?{time:x.bars.at(-1).time,open:x.bars.at(-1).open,high:x.bars.at(-1).high,low:x.bars.at(-1).low,close:x.bars.at(-1).close,volume:x.bars.at(-1).volume,closed:!!x.bars.at(-1).closed}:null,
      candleSequence:candleSnapshot(x.bars,f.atr,8),prior1m:compactBars(x.bars,20)
    }},
    reason:`${label} · ${setup.type}${isAddOn?' · ADD-ON #'+episodeSequence:''} · Bias ${bias.bias.toFixed(2)} · Timing ${timing.total}/100 · ${setup.reason}`
  };
  this.signals.push(signal);if(this.signals.length>CFG.maxHistory){const i=this.signals.findIndex(s=>s.result!=='pending');if(i>=0)this.signals.splice(i,1);}
  candidate.issued=true;candidate.issuedAt=x.ts;candidate.signalId=id;candidate.entryLow=entryLow;candidate.entryHigh=entryHigh;
  if(setup.latePlan)this.arisLatePlan=null;
  this.log('issued',x.ts,{id,type:setup.type,direction:outputDirection,modelDirection:outputDirection,price:x.price,episodeId,episodeSequence,isAddOn,priorSignalId:episodeInfo.prior?.id||null,arisBias:bias.bias,arisAlignedBias:alignedBias,arisTiming:timing.total});
  return this.lastView={...base,event:{...candidate},watch,status:'new',reason:signal.reason,signal,gate:{state:'ENTER',direction:outputDirection,code:'aris_enter',blocker:isAddOn?label+' · จุดเติมใหม่ผ่านแผน + Timing':label+' · แผน + Timing ผ่าน',waitingFor:[],metrics:{bias:bias.bias,alignedBias,timing:timing.total,flow:timing.flow,progress:timing.progress,retreat:timing.retreat,room:Number.isFinite(timing.room)?timing.room:null,extensionAtr:timing.extension,macroExtensionAtr:timing.macroExtension,isAddOn,addOnSequence:episodeSequence}}};
}
const originalStep=Engine.prototype.step;
Engine.prototype.step=function(x){return CFG.version.startsWith('ARIS-')?arisStep.call(this,x):originalStep.call(this,x);};

const previousAssess=root.ContinuousDirection?.assess;
if(root.ContinuousDirection){
  root.ContinuousDirection.assess=function(x){
    if(!CFG.version.startsWith('ARIS-'))return previousAssess?previousAssess(x):{available:false,reason:'Direction engine unavailable'};
    const f=x.features;if(!x.fresh||!f||!(x.price>0)||!Number.isFinite(x.ts))return {available:false,reason:x.reason||'ข้อมูลสดไม่ครบ — พักการประเมิน'};
    const bias=arisBias(f,x),b=bias.bias,abs=Math.abs(b),d=sign(b,CFG.arisBiasWatch),direction=abs<.24?'BALANCED':d>0?'HIGH':'LOW',high=Math.round(clip(50+40*b,10,90)),low=100-high;
    const z=x.zones||[],room=d?roomAtr(z,x.price,d,f.atr):null,extension=d?d*(x.price-f.ema21)/Math.max(f.atr,1e-9):0,live=liveMetrics(f,x,d||1);
    const favorableExtreme=d>0?Math.max(live.live?.high??x.price,x.price):d<0?Math.min(live.live?.low??x.price,x.price):x.price;
    const retreat=d?Math.max(0,d*(favorableExtreme-x.price)/Math.max(f.atr,1e-9)):0;
    let risk=0;const reasons=[];
    if(abs<CFG.arisBiasEnter){risk+=2;reasons.push('Bias ยังไม่ถึงระดับ ENTER');}
    if(extension>=CFG.arisHardLateExtension){risk+=4;reasons.push('ราคายืดเกิน hard late');}
    else if(extension>=CFG.arisSoftLateExtension){risk+=2;reasons.push('ราคาเริ่มห่างฐาน');}
    if(Number.isFinite(room)&&room<CFG.arisSoftRoom){risk+=2;reasons.push('room ข้างหน้าแคบ');}
    if((x.coverage||0)<CFG.arisFlowCoverageSec){risk+=1;reasons.push('Flow ยังสะสมไม่ครบ');}
    const alignedFlow=d?d*(x.flow||0):0;if(d&&alignedFlow<.02){risk+=1;reasons.push('Flow ยังไม่หนุนฝั่ง Bias');}
    const riskLabel=risk>=4?'สูง':risk>=2?'กลาง':'ต่ำตามเกณฑ์';
    return {available:true,high,low,direction,risk:riskLabel,riskScore:risk,referencePrice:x.price,referenceTime:x.ts,targetTime:x.ts+CFG.horizonMs,reason:`ARIS V1 · Market Bias ${b>=0?'+':''}${b.toFixed(2)}${reasons.length?' · '+reasons.slice(0,2).join(' · '):' · Direction/Flow สอดคล้องกัน'}`,parts:bias.parts,weights:BIAS_WEIGHTS,regime:x.regime?.mode||'TRANSITION',coverage:x.coverage||0,room:Number.isFinite(room)?room:null,extension,retreat,bias:b};
  };
}
root.ArisV1Engine={version:CFG.version,BIAS_WEIGHTS,arisBias,arisRegimeRaw,timingScore,detectSetup};
})(typeof globalThis!=='undefined'?globalThis:window);

globalThis.__TRAINING_ENGINE_READY__={
  version:globalThis.EventSignalV6?.CFG?.version||null,
  schema:globalThis.EventSignalV6?.DATASET_SCHEMA||null
};
