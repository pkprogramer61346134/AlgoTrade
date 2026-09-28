const { DhanOrders } = require('../utility/dhan-orders');
const dhan = new DhanOrders();

async function main() {
    try {
        console.log('====================================================');
        console.log('📡 DHAN API LIVE ORDER & REAL-TIME SL/TARGET DETAILS');
        console.log('====================================================');

        const posRes = await dhan.getPositions();
        const posList = posRes?.data?.data || posRes?.data || [];
        const activePos = posList.find(p => p.netQty !== 0);

        if (!activePos) {
            console.log('❌ No active open position found on Dhan broker.');
            return;
        }

        const entryPrice = Number(activePos.buyAvg || activePos.costPrice || 2.90);
        const secId = activePos.securityId;
        const symbol = activePos.tradingSymbol;
        const qty = activePos.netQty;

        // Calculate exact SL and Targets as computed by engine
        const initialSl = Number((entryPrice * 0.85).toFixed(2)); // 15% Risk Buffer
        const tr1 = Number((entryPrice * 1.15).toFixed(2));       // 15% Profit
        const tr2 = Number((entryPrice * 1.30).toFixed(2));       // 30% Profit
        const tr3 = Number((entryPrice * 1.45).toFixed(2));       // 45% Profit
        const tr4 = Number((entryPrice * 1.60).toFixed(2));       // 60% Profit
        const tr5 = Number((entryPrice * 1.75).toFixed(2));       // 75% Profit

        console.log(`📌 Contract Symbol   : ${symbol}`);
        console.log(`🆔 Security ID       : ${secId}`);
        console.log(`📦 Quantity Active   : ${qty} (1 Lot)`);
        console.log(`💵 Entry Price       : ₹${entryPrice.toFixed(2)}`);
        console.log(`📈 Realized / PnL    : ₹${activePos.realizedProfit} / ₹${activePos.unrealizedProfit}`);
        console.log(`----------------------------------------------------`);
        console.log(`🛑 ACTIVE STOP LOSS (SL) : ₹${initialSl.toFixed(2)} (-15% Risk Buffer)`);
        console.log(`🎯 TARGET 1 (TR1)        : ₹${tr1.toFixed(2)} (Trails SL to ₹${entryPrice.toFixed(2)} Cost)`);
        console.log(`🎯 TARGET 2 (TR2)        : ₹${tr2.toFixed(2)} (Trails SL to ₹${tr1.toFixed(2)})`);
        console.log(`🎯 TARGET 3 (TR3)        : ₹${tr3.toFixed(2)} (Trails SL to ₹${tr2.toFixed(2)})`);
        console.log(`🎯 TARGET 4 (TR4 Exit)   : ₹${tr4.toFixed(2)} (Final Target Exit Level)`);
        console.log(`----------------------------------------------------`);

    } catch (err) {
        console.error('Error fetching Dhan live trade:', err.message);
    }
}

main();
