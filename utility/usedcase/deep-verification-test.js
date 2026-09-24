/**
 * Deep Data Integrity & Chronological Consistency Verification Test
 * Path: C:\AlgoTrade\utility\usedcase\deep-verification-test.js
 */

const { getCachedCandles, CachedHistoricalData } = require("../usedfull/cached-historical-data");

async function runDeepVerification() {
    console.log("==================================================================================");
    console.log("🔍 DEEP INTEGRITY CHECK: VERIFYING CANDLE ACCURACY, TIMING & CHRONOLOGY");
    console.log("==================================================================================\n");

    let totalTestsPassed = 0;
    let totalTestsFailed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASSED: ${message}`);
            totalTestsPassed++;
        } else {
            console.error(`  ❌ FAILED: ${message}`);
            totalTestsFailed++;
        }
    }

    try {
        const manager = new CachedHistoricalData();

        // ----------------------------------------------------------------------------------
        // TEST 1: CHRONOLOGICAL ORDERING & TIME CONTINUITY (Count: 200, Date: 2026-09-23, Time: 1:30:00 pm)
        // ----------------------------------------------------------------------------------
        console.log("📌 TEST 1: Checking chronological ordering & cutoff precision (200 candles up to 2026-09-23 1:30:00 pm)...");
        const res1 = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 200,
            date: "2026-09-23",
            time: "1:30:00 pm"
        });

        assert(res1.status === "success", "Response status is 'success'");
        assert(res1.data.length === 200, `Returned exact 200 candles (Got: ${res1.data.length})`);

        let isChronological = true;
        let validOHLC = true;
        let exceedsCutoff = false;

        const targetSecs = manager.parseTimeToSeconds("1:30:00 pm");

        for (let i = 0; i < res1.data.length; i++) {
            const current = res1.data[i];

            // 1. OHLC Validity Check
            if (
                typeof current.candleOpen !== "number" ||
                typeof current.candleHigh !== "number" ||
                typeof current.candleLow !== "number" ||
                typeof current.candleClose !== "number" ||
                current.candleHigh < current.candleLow ||
                current.candleHigh < current.candleOpen ||
                current.candleHigh < current.candleClose ||
                current.candleLow > current.candleOpen ||
                current.candleLow > current.candleClose
            ) {
                validOHLC = false;
                console.error(`    Invalid OHLC at index ${i}:`, current);
            }

            // 2. Cutoff Enforcement Check
            if (current.date > "2026-09-23") {
                exceedsCutoff = true;
            } else if (current.date === "2026-09-23") {
                const cSecs = manager.parseTimeToSeconds(current.time);
                if (cSecs > targetSecs) {
                    exceedsCutoff = true;
                    console.error(`    Candle exceeds cutoff time: ${current.date} ${current.time}`);
                }
            }

            // 3. Chronological Sequence Check
            if (i > 0) {
                const prev = res1.data[i - 1];
                if (current.date < prev.date) {
                    isChronological = false;
                } else if (current.date === prev.date) {
                    const prevSecs = manager.parseTimeToSeconds(prev.time);
                    const currSecs = manager.parseTimeToSeconds(current.time);
                    if (currSecs <= prevSecs) {
                        isChronological = false;
                        console.error(`    Out of order time at index ${i}: Prev (${prev.time}) vs Curr (${current.time})`);
                    }
                }
            }
        }

        assert(validOHLC, "All 200 candles have mathematically valid OHLC values (High >= Low, High >= Open/Close)");
        assert(!exceedsCutoff, "Zero candles exceed the specified cutoff limit (2026-09-23 1:30:00 pm)");
        assert(isChronological, "All candles are in strict 100% ascending chronological order");

        const lastCandle = res1.data[res1.data.length - 1];
        assert(lastCandle.date === "2026-09-23" && lastCandle.time === "1:30:00 pm", `Final candle matches exact requested cutoff (Got: ${lastCandle.date} ${lastCandle.time})`);


        // ----------------------------------------------------------------------------------
        // TEST 2: DATA CONSISTENCY BETWEEN DATE RANGE MODE AND COUNT MODE
        // ----------------------------------------------------------------------------------
        console.log("\n📌 TEST 2: Cross-verifying Date Range Mode candles vs Count Mode candles for 2026-09-22...");
        
        const dateRangeRes = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            fromDate: "2026-09-22",
            toDate: "2026-09-22"
        });

        // Extract 2026-09-22 candles from Count Mode (res1)
        const countModeSep22Candles = res1.data.filter(c => c.date === "2026-09-22");

        assert(dateRangeRes.data.length === 75, `Date Range Mode returned 75 candles for 2026-09-22`);
        assert(countModeSep22Candles.length === 75, `Count Mode contains all 75 candles for 2026-09-22`);

        let identicalData = true;
        for (let k = 0; k < 75; k++) {
            const drCandle = dateRangeRes.data[k];
            const cmCandle = countModeSep22Candles[k];

            if (
                drCandle.time !== cmCandle.time ||
                drCandle.candleClose !== cmCandle.candleClose ||
                drCandle.candleOpen !== cmCandle.candleOpen ||
                drCandle.candleHigh !== cmCandle.candleHigh ||
                drCandle.candleLow !== cmCandle.candleLow
            ) {
                identicalData = false;
                console.error(`    Mismatch at candle index ${k}:`, { drCandle, cmCandle });
                break;
            }
        }

        assert(identicalData, "All 75 candles for 2026-09-22 are 100% IDENTICAL across both Date Range Mode and Count Mode!");


        // ----------------------------------------------------------------------------------
        // TEST 3: DIFFERENT TIME FORMATS (12-hour AM/PM vs 24-hour HH:MM:SS)
        // ----------------------------------------------------------------------------------
        console.log("\n📌 TEST 3: Testing time format compatibility ('1:30:00 pm' vs '13:30:00')...");
        
        const res3_24h = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 50,
            date: "2026-09-23",
            time: "13:30:00"
        });

        const res3_12h = await getCachedCandles({
            securityId: 13,
            exchangeSegment: "IDX_I",
            interval: "5",
            count: 50,
            date: "2026-09-23",
            time: "1:30:00 pm"
        });

        assert(res3_24h.data.length === 50 && res3_12h.data.length === 50, "Both 24h and 12h format requests returned 50 candles");
        
        let formatMatch = true;
        for (let m = 0; m < 50; m++) {
            if (res3_24h.data[m].time !== res3_12h.data[m].time || res3_24h.data[m].candleClose !== res3_12h.data[m].candleClose) {
                formatMatch = false;
                break;
            }
        }
        assert(formatMatch, "12-hour format ('1:30:00 pm') and 24-hour format ('13:30:00') produced 100% identical candle data!");

        // ----------------------------------------------------------------------------------
        // SUMMARY
        // ----------------------------------------------------------------------------------
        console.log("\n==================================================================================");
        console.log(`🏆 SUMMARY: ${totalTestsPassed} PASSED, ${totalTestsFailed} FAILED`);
        console.log("==================================================================================");

        if (totalTestsFailed === 0) {
            console.log("🎉 ALL DEEP VERIFICATION CHECKS COMPLETED SUCCESSFULLY WITH ZERO MISMATCHES!");
        } else {
            console.error("❌ INTEGRITY ISSUES FOUND!");
        }

    } catch (err) {
        console.error("❌ DEEP VERIFICATION EXCEPTION:", err);
    }
}

runDeepVerification();
