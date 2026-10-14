/**
 * Test MasterSL Signal -> Order Flow (with pending limit price)
 * Location: C:\AlgoTrade\server\testMasterSL.js
 *
 * पूरा MasterSL जैसा flow चलेगा:
 *   STEP 1: Position check
 *   STEP 2: Balance
 *   STEP 3: Best strike
 *   STEP 4: Target/SL (सीधे option premium पर)
 *   STEP 5: Super Order — पर price = LTP − 50 (order pending रहेगा, fill नहीं होगा)
 *   STEP 6: lastTrade record
 *
 * उद्देश्य:
 *   - Confirm करना कि पूरा flow काम करता है
 *   - Dhan API order accept कर रही है
 *   - Order pending में चला जाता है
 *
 * चलाओ: node C:\AlgoTrade\server\testMasterSL.js
 */

const configManager = require('./config_manager');
const PositionChecker = require('./position/dhan-position');
const dhanBalance = require('./classoforder/founds/dhan-real-balance');
const strikeSelector = require('./classoforder/strickprice/strike-price-selector');
const orderManager = require('./classoforder/order/order-manager');

// अंतर: LTP से 50 रुपये नीचे limit price रखो (order pending रहे, fill न हो)
const PENDING_OFFSET_RUPEES = 10;

async function testMasterSL() {
    console.log('==========================================================');
    console.log('🧪 MasterSL Full Flow Test (Pending Limit Price)');
    console.log('==========================================================\n');

    // Config verify
    const cfg = configManager.getConfig();
    console.log('📋 Current Config:');
    console.log('   realTradeEnabled    :', cfg.realTradeEnabled);
    console.log('   targetPoints        :', cfg.targetPoints, '(option premium pts)');
    console.log('   stopLossPoints      :', cfg.stopLossPoints, '(option premium pts)');
    console.log('   trailingJumpPoints  :', cfg.trailingJumpPoints);
    console.log('   maxTradesPerRun     :', cfg.maxTradesPerRun);
    console.log('   orderExchangeSegment:', cfg.orderExchangeSegment);
    console.log('');
    console.log('⚙️  Test Config:');
    console.log('   Pending Offset      : LTP − ₹' + PENDING_OFFSET_RUPEES);
    console.log('   (Order price will be below market — order will remain PENDING, not filled)\n');

    // Test signal — जैसा consensusEngine produce करता है
    const testSignal = {
        consensus: "BUY",
        type: "BUY",
        entry: 22721,
        sl: null,
        tr: null,
        confidence: "70%",
        strategyId: "TEST_STRATEGY",
        strategyName: "Manual Test Signal"
    };

    const testScrip = {
        securityId: "13",
        exchangeSegment: "IDX_I",
        symbol: "NIFTY",
        instrument: "INDEX",
        interval: "15"
    };

    console.log('📤 Test Signal:');
    console.log('   Consensus :', testSignal.consensus);
    console.log('   Entry     :', testSignal.entry);
    console.log('   Scrip     :', testScrip.symbol, `(${testScrip.securityId})`);
    console.log('');

    // =========================================================
    // STEP 1: POSITION CHECK
    // =========================================================
    console.log('--- STEP 1: Position Check ---');
    const positionChecker = new PositionChecker();
    const hasPosition = await positionChecker.checkPosition();
    console.log('   Has position:', hasPosition);
    if (hasPosition) {
        console.log('   ⏭️ Position exists — test would be ignored. Exiting.');
        return;
    }

    // =========================================================
    // STEP 2: BALANCE
    // =========================================================
    console.log('\n--- STEP 2: Balance ---');
    const balance = await dhanBalance.getBalance();
    console.log('   Balance: ₹' + balance);

    // =========================================================
    // STEP 3: BEST STRIKE
    // =========================================================
    console.log('\n--- STEP 3: Best Strike ---');
    const optionType = "CE";
    const strike = await strikeSelector.getBestStrike(
        {
            securityId: testScrip.securityId,
            exchangeSegment: testScrip.exchangeSegment
        },
        balance,
        optionType,
        Number(testSignal.entry || 0)
    );

    const entry = Number(strike.liveLtp);
    const lots = strike.lots;
    const lotSize = Number(strike.lotSize);

    console.log('   Symbol     :', strike.symbol);
    console.log('   Security ID:', strike.securityId);
    console.log('   Strike     :', strike.selectedStrike, optionType);
    console.log('   Lots       :', lots);
    console.log('   Lot size   :', lotSize);
    console.log('   Entry LTP  : ₹' + entry);

    // =========================================================
    // STEP 4: TARGET / SL
    // =========================================================
    console.log('\n--- STEP 4: Target / SL ---');
    const targetPrice = Number((entry + cfg.targetPoints).toFixed(2));
    const stopLossPrice = Number((entry - cfg.stopLossPoints).toFixed(2));
    console.log(`   Target: ₹${entry} + ${cfg.targetPoints} = ₹${targetPrice}`);
    console.log(`   SL    : ₹${entry} − ${cfg.stopLossPoints} = ₹${stopLossPrice}`);

    // =========================================================
    // STEP 5: SUPER ORDER (with pending limit price)
    // =========================================================
    console.log('\n--- STEP 5: Super Order (Pending Limit Price) ---');
    const pendingPrice = Number((entry - PENDING_OFFSET_RUPEES).toFixed(2));
    console.log(`   Actual LTP       : ₹${entry}`);
    console.log(`   Pending Price    : ₹${pendingPrice} (LTP − ₹${PENDING_OFFSET_RUPEES})`);
    console.log(`   Target (absolute): ₹${targetPrice}`);
    console.log(`   SL (absolute)    : ₹${stopLossPrice}`);
    console.log(`   ⚠️ Order will remain PENDING (not filled)\n`);

    let order;
    try {
        order = await orderManager.placeSuperOrder({
            securityId: strike.securityId,
            exchangeSegment: cfg.orderExchangeSegment,
            transactionType: "BUY",
            lots,
            lotSize,
            price: pendingPrice,             // ← यहाँ 50 rupees कम
            targetPrice,
            stopLossPrice,
            trailingJump: cfg.trailingJumpPoints
        });
    } catch (err) {
        console.error('❌ Super Order failed:', err.message);
        console.error(err.stack);
        return;
    }

    // =========================================================
    // STEP 6: RECORD LAST TRADE
    // =========================================================
    console.log('\n--- STEP 6: Record Last Trade ---');
    const lastTrade = {
        symbol: strike.symbol,
        securityId: String(strike.securityId),
        optionType,
        orderId: order.orderId,
        qty: order.quantity,
        lots,
        entryPrice: entry,
        pendingPrice,
        targetPrice,
        currentSl: stopLossPrice,
        trailingJump: cfg.trailingJumpPoints,
        status: "PENDING_TEST"
    };
    console.log(JSON.stringify(lastTrade, null, 2));

    // =========================================================
    // RESULT
    // =========================================================
    console.log('\n==========================================================');
    console.log('📥 Test Result:');
    console.log('==========================================================');

    if (order && order.orderId) {
        console.log('\n✅ SUCCESS — Order PLACED (pending)');
        console.log('   Order ID   :', order.orderId);
        console.log('   Symbol     :', strike.symbol);
        console.log('   Pending at : ₹' + pendingPrice);
        console.log('   Target     : ₹' + targetPrice);
        console.log('   SL         : ₹' + stopLossPrice);
        console.log('');
        console.log('⏳ Order should stay PENDING. Check Dhan app to verify.');
        console.log('⚠️ Manually cancel the order from Dhan app after verification.');
    } else {
        console.log('\n❌ FAILED — order did not return an orderId');
        console.log(JSON.stringify(order, null, 2));
    }

    console.log('\n==========================================================');
    console.log('🧪 Test Complete');
    console.log('==========================================================');
}

testMasterSL().catch(err => {
    console.error('❌ Test threw uncaught error:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
});