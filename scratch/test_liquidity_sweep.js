/**
 * LIQUIDITY SWEEP & STOP-HUNT REVERSAL TEST SCRIPT
 * 
 * Verifies detection of Liquidity Sweeps on 17th September 2026 candles.
 */

const { CentralCandleDataHub } = require('../src/candleDataHub');
const LiquiditySweepStrategy = require('../src/liquiditySweepStrategy');

async function testLiquiditySweep() {
    console.log("===================================================================================");
    console.log("🔍 TESTING INSTITUTIONAL LIQUIDITY SWEEP DETECTOR ON 17TH SEPTEMBER 2026");
    console.log("===================================================================================\n");

    const hub = new CentralCandleDataHub();
    const dateStr = "2026-09-17";
    const candles = await hub.getCandlesWithWarmup(dateStr, dateStr, 300);

    let sweepCount = 0;

    for (let i = 300; i < candles.length; i++) {
        const c = candles[i];
        if (c.date !== dateStr) continue;

        const sweepRes = LiquiditySweepStrategy.detectLiquiditySweep(candles, i);
        if (sweepRes.isSweep) {
            sweepCount++;
            const icon = sweepRes.type === "BUY" ? "🟢 BULLISH SWEEP" : "🔴 BEARISH SWEEP";
            console.log(`[Sweep #${sweepCount}] 🕒 ${c.time || '09:15'} IST | ${icon}`);
            console.log(`   - Spot Price       : ₹${c.close} (High: ₹${c.high}, Low: ₹${c.low})`);
            console.log(`   - Swept Level      : ₹${sweepRes.sweptLevel}`);
            console.log(`   - Rejection Wick % : ${sweepRes.wickPct}%`);
            console.log(`   - Calculated SL    : ₹${sweepRes.stopLoss} | Target (1:2): ₹${sweepRes.targetPrice}`);
            console.log(`   - Details          : ${sweepRes.details}`);
            console.log("-----------------------------------------------------------------------------------");
        }
    }

    console.log(`\n===================================================================================`);
    console.log(`TOTAL LIQUIDITY SWEEPS DETECTED ON 17-SEP-2026: ${sweepCount}`);
    console.log(`===================================================================================`);
}

testLiquiditySweep().catch(console.error);
