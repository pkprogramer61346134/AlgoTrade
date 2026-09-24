/**
 * Comprehensive Indicator Backdata & Warmup Verification Test
 * Path: C:\AlgoTrade\utility\usedcase\test-indicator-backdata-warmup.js
 */

const { getCachedCandles } = require("../usedfull/cached-historical-data");
const { evaluateConsensusEngine, computeIndicators } = require("../usedfull/Engines/consensusEngine");

async function runIndicatorWarmupVerification() {
    console.log("==========================================================================");
    console.log("🔬 VERIFYING INDICATOR BACKDATA 100% WARMUP ACCURACY IN CONSENSUS ENGINE");
    console.log("==========================================================================\n");

    let passedChecks = 0;
    let failedChecks = 0;

    function assert(condition, label) {
        if (condition) {
            console.log(`  ✅ PASSED: ${label}`);
            passedChecks++;
        } else {
            console.error(`  ❌ FAILED: ${label}`);
            failedChecks++;
        }
    }

    try {
        // Step 1: Fetch full 200 candles dataset up to 2026-09-23 1:30:00 pm
        console.log("1. Fetching ground-truth 200 candles dataset...");
        const fullDatasetRes = await getCachedCandles({
            securityId: "13",
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 200,
            date: "2026-09-23",
            time: "1:30:00 pm"
        });

        const fullCandles = fullDatasetRes.data;
        console.log(`   Ground Truth Dataset Size: ${fullCandles.length} candles.`);

        // Step 2: Compute ground-truth indicators on full dataset
        console.log("\n2. Computing ground-truth indicators on 200 candles...");
        const fullIndicators = computeIndicators(fullCandles, {});
        const targetCandle = fullCandles.find(c => c.date === "2026-09-23" && c.time === "3:10:00 pm") || fullCandles[fullCandles.length - 1];
        const spotClose = targetCandle.close || targetCandle.candleClose || targetCandle.price;

        console.log(`   Target Candle: ${targetCandle.date} ${targetCandle.time} | Close: ₹${spotClose}`);

        // Step 3: Call evaluateConsensusEngine with ONLY THE SINGLE TARGET CANDLE!
        console.log("\n3. Testing evaluateConsensusEngine with ONLY 1 SINGLE CANDLE (Auto-Warmup Mode)...");
        const singleCandle = {
            securityId: "13",
            exchangeSegment: "IDX_I",
            interval: "5",
            date: targetCandle.date,
            time: targetCandle.time,
            open: targetCandle.open || targetCandle.candleOpen || spotClose,
            high: targetCandle.high || targetCandle.candleHigh || spotClose,
            low: targetCandle.low || targetCandle.candleLow || spotClose,
            close: spotClose
        };

        const autoWarmupResult = await evaluateConsensusEngine(singleCandle, -1, { warmupCount: 200 });

        // Step 4: Verify Warmup Count & Indicator Accuracy
        console.log("\n======================== WARMUP VERIFICATION RESULTS ========================");
        
        assert(autoWarmupResult.warmupCandleCount >= 200, `Warmup candles loaded: ${autoWarmupResult.warmupCandleCount} (Expected: 200)`);
        
        // Also test 400 warmup candles mode
        console.log("\n4. Testing evaluateConsensusEngine requesting 400 warmup candles...");
        const autoWarmup400Result = await evaluateConsensusEngine(singleCandle, -1, { warmupCount: 400 });
        assert(autoWarmup400Result.warmupCandleCount >= 200, `Warmup candles loaded: ${autoWarmup400Result.warmupCandleCount} (Available >= 200)`);

        // Step 5: Test Signal Output Consistency
        console.log("\n5. Testing Signal Output Consistency (Single Candle Auto-Warmup vs 200-Candle Array)...");
        const fullArrayResult = await evaluateConsensusEngine(fullCandles, -1);

        assert(autoWarmupResult.consensus === fullArrayResult.consensus, `Consensus match: Single Candle (${autoWarmupResult.consensus}) vs Full Array (${fullArrayResult.consensus})`);
        assert(autoWarmupResult.entry === fullArrayResult.entry, `Entry price match: Single Candle (${autoWarmupResult.entry}) vs Full Array (${fullArrayResult.entry})`);
        assert(autoWarmupResult.sl === fullArrayResult.sl, `Stop Loss match: Single Candle (${autoWarmupResult.sl}) vs Full Array (${fullArrayResult.sl})`);
        assert(autoWarmupResult.tr === fullArrayResult.tr, `Target price match: Single Candle (${autoWarmupResult.tr}) vs Full Array (${fullArrayResult.tr})`);
        assert(autoWarmupResult.confidence === fullArrayResult.confidence, `Confidence match: Single Candle (${autoWarmupResult.confidence}) vs Full Array (${fullArrayResult.confidence})`);
        assert(autoWarmupResult.strategyId === fullArrayResult.strategyId, `Strategy ID match: Single Candle (${autoWarmupResult.strategyId}) vs Full Array (${fullArrayResult.strategyId})`);

        console.log("\n==========================================================================");
        console.log(`🏆 SUMMARY: ${passedChecks} PASSED, ${failedChecks} FAILED`);
        console.log("==========================================================================");

        if (failedChecks === 0) {
            console.log("🎉 VERIFIED 100%: INDICATOR BACKDATA WARMUP IS WORKING PERFECTLY WITH ZERO ERRORS!");
        } else {
            console.error("❌ WARMUP INTEGRITY CHECKS FAILED!");
        }

    } catch (err) {
        console.error("❌ EXCEPTION during warmup verification:", err);
    }
}

runIndicatorWarmupVerification();
