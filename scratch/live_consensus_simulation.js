/**
 * Live Step-by-Step Simulation Tester (Complete Paper Lifecycle Simulation)
 * Feeds candles 1-by-1 to test Master Head Consensus Engine & Order Manager Handshake
 */

const fs = require('fs');
const path = require('path');

const OrderExecutionManager = require('../order_config/orderExecutionManager');

// Mock offline Dhan Option Contract Resolution for Paper Simulation
OrderExecutionManager.prototype.resolveOptionContractFromDhan = async function(spot, optionType) {
    const atmStrike = Math.round(spot / 50) * 50;
    const estPremium = Math.max(80, Math.min(250, spot * 0.005));
    return {
        strike: atmStrike,
        tradingSymbol: `NIFTY-2026-09-22-${atmStrike}-${optionType}`,
        securityId: optionType === "CE" ? "47291" : "47286",
        price: Number(estPremium.toFixed(2))
    };
};

// Force Paper Mode configuration
OrderExecutionManager.prototype.loadConfig = function() {
    return {
        id: "default_order_config",
        name: "Simulation Test Config",
        executionMode: "PAPER",
        paperTrading: { initialCapital: 100000, riskRewardRatio: 2.0, maxLossPerTrade: 1000 },
        capitalUsagePct: 100,
        productType: "INTRADAY",
        exchangeSegment: "NSE_FNO",
        defaultQuantity: 65,
        riskManagement: { maxOpenPositions: 1, maxTradesPerDay: 3, maxLossPerTrade: 1000, maxLossPerDay: 5000 },
        riskRewardRatio: 2.0,
        orderSwitchOn: true
    };
};

const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

async function runLiveSimulationTest() {
    console.log("==================================================================================");
    console.log("🚀 STARTING LIVE MARKET STEP-BY-STEP SIMULATION TESTER FOR CONSENSUS ENGINE & ORDER MANAGER");
    console.log("==================================================================================\n");

    // 1. Load Strategy Config
    const stratPath = path.join(__dirname, '..', 'strategies_config', 'consensus_master_head.json');
    let strategyConfig = { id: "consensus_master_head", name: "Master Head Consensus Engine", consensusThreshold: 6 };
    if (fs.existsSync(stratPath)) {
        strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));
    }

    // 2. Load 5-Min Candle Dataset
    const candleFilePath = path.join(__dirname, '..', 'candle_data', 'NIFTY_50_5_2026-09-22_2026-09-22.json');
    const fallbackFilePath = path.join(__dirname, '..', 'candle_data', 'NIFTY_50_5_2026-09-21_2026-09-21.json');
    let targetFile = fs.existsSync(candleFilePath) ? candleFilePath : fallbackFilePath;

    console.log(`📂 Loading Candle Dataset: ${path.basename(targetFile)}`);
    const dayCandles = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    console.log(`📊 Loaded ${dayCandles.length} 5-Minute Candles for Simulation.\n`);

    // 3. Initialize Order Execution Manager
    const orderManager = new OrderExecutionManager();
    console.log(`🔧 Order Manager Initialized in simulation mode: PAPER MONEY\n`);

    const accumulatedCandles = [];
    let dailyTradeCounts = {};

    console.log("----------------------------------------------------------------------------------");
    console.log("⏱️ SIMULATING LIVE CANDLE STREAM (TICK-BY-TICK FEED TO CONSENSUS ENGINE & ORDER MANAGER)");
    console.log("----------------------------------------------------------------------------------\n");

    for (let i = 0; i < dayCandles.length; i++) {
        const candle = dayCandles[i];
        accumulatedCandles.push(candle);

        // Prepare indicators up to current candle index
        const data = prepareJSONStrategyData(accumulatedCandles, strategyConfig);
        const currentIdx = accumulatedCandles.length - 1;

        // Evaluate Consensus Engine at current candle step
        const result = evaluateConsensusEngine(accumulatedCandles, currentIdx, strategyConfig, data, dailyTradeCounts);

        const timeStr = candle.time || `Candle #${i + 1}`;
        const spotPrice = candle.close;

        console.log(`\n⏰ [STEP ${i + 1}/${dayCandles.length}] TIME: ${timeStr} | NIFTY SPOT: ₹${spotPrice}`);
        console.log(`   ------------------------------------------------------------------`);

        // Display Voting Grid
        if (result.subEngineVotes && result.subEngineVotes.length > 0) {
            console.log(`   🗳️  TOP 10 SUB-ENGINE VOTING GRID:`);
            result.subEngineVotes.forEach(eng => {
                let badge = "⚪ NO VOTE";
                if (eng.type === "BUY" || eng.voteLabel?.includes("BUY") || eng.type === "CONFIRMED") badge = "🟢 YES (BUY)";
                else if (eng.type === "SELL" || eng.voteLabel?.includes("SELL")) badge = "🔴 YES (SELL)";
                console.log(`      Engine ${eng.id.toString().padStart(2)} [${eng.name.padEnd(21)}]: ${badge.padEnd(15)} | ${eng.detail}`);
            });
        }

        console.log(`   ------------------------------------------------------------------`);
        console.log(`   📊 SIGNAL TYPE  : ${result.type === "NONE" ? "🟡 FLAT (WAITING CONSENSUS)" : (result.type === "BUY" ? "🟢 BUY CE SIGNAL" : "🔴 BUY PE SIGNAL")}`);
        console.log(`   📈 RAW VOTES    : Buy Votes = ${result.buyVotes || 0} | Sell Votes = ${result.sellVotes || 0} (Required: ${strategyConfig.consensusThreshold || 6}/10)`);
        console.log(`   📝 REASONING    : ${result.reasoning}`);

        // Check if an Active Order is Open in Order Manager
        const activeOrder = orderManager.paperManager.activeOrder;

        if (activeOrder) {
            console.log(`   ------------------------------------------------------------------`);
            console.log(`   ⚡ ACTIVE POSITION MONITORING:`);
            console.log(`      Contract     : NIFTY ${activeOrder.optionType} @ Entry Premium ₹${activeOrder.optionPremiumPrice}`);
            console.log(`      Spot Entry   : ₹${activeOrder.spotEntryPrice} | Current Spot: ₹${spotPrice}`);
            console.log(`      Option SL    : ₹${activeOrder.currentSL} | Option Target: ₹${activeOrder.target}`);

            // Monitor position on new candle spot price
            const monitorRes = orderManager.monitorActivePosition(spotPrice);
            if (monitorRes && monitorRes.status === "closed") {
                console.log(`   🎯 POSITION CLOSED UPDATE: ${monitorRes.message} | Realized PnL: ₹${monitorRes.trade?.pnlRupees} (${monitorRes.trade?.pnlPoints} pts)`);
            } else {
                console.log(`   ⏳ POSITION STILL OPEN: Holding position...`);
            }
        } else if (result.type !== "NONE") {
            console.log(`   ------------------------------------------------------------------`);
            console.log(`   🚀 SIGNAL TRIGGERED! INITIATING HANDSHAKE WITH ORDER EXECUTION MANAGER...`);

            const optionType = result.type === "BUY" ? "CE" : "PE";
            const minimalSignal = {
                signalType: result.type === "BUY" ? "BUY_SIGNAL" : "SELL_SIGNAL",
                type: optionType,
                entryPrice: spotPrice,
                spotPrice: spotPrice,
                stopLoss: result.stopLoss,
                targetPrice: result.targetPrice,
                timestamp: Date.now()
            };

            console.log(`   📤 MINIMAL SIGNAL SENT TO ORDER MANAGER:`, JSON.stringify(minimalSignal, null, 2));

            const liveCapital = await orderManager.fetchLiveCapital();
            const execRes = await orderManager.executeOrder(minimalSignal, spotPrice, liveCapital);

            console.log(`   📥 ORDER MANAGER HANDSHAKE RESPONSE:`);
            console.log(`      Execution Status : ${execRes.status}`);
            console.log(`      Execution Mode   : ${execRes.mode}`);
            if (execRes.order) {
                console.log(`      Option Symbol    : ${execRes.order.optionSymbol}`);
                console.log(`      Entry Premium    : ₹${execRes.order.optionPremiumPrice}`);
                console.log(`      Option SL        : ₹${execRes.order.optionSL}`);
                console.log(`      Option Target    : ₹${execRes.order.target}`);
                console.log(`      Lots / Quantity  : ${execRes.order.numLots} Lot / ${execRes.order.quantity || execRes.order.qty} Qty`);
            } else {
                console.log(`      Message          : ${execRes.message || 'Order rejected / skipped'}`);
            }
        }

        // Small delay simulation effect
        await new Promise(r => setTimeout(r, 20));
    }

    console.log("\n==================================================================================");
    console.log("🏁 LIVE MARKET SIMULATION COMPLETE! MASTER HEAD & ORDER MANAGER TESTED CLEANLY.");
    console.log("==================================================================================");
}

runLiveSimulationTest().catch(err => {
    console.error("🚨 LIVE SIMULATION ERROR:", err);
});
