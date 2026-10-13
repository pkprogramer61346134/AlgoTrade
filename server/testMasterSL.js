/**
 * Test MasterSL Signal -> Order Flow
 * Location: C:\AlgoTrade\server\testMasterSL.js
 *
 * ये पूरा MasterSL.processSignal() flow चलाती है:
 *   STEP 1: Position check
 *   STEP 2: Balance
 *   STEP 3: Strike + Delta
 *   STEP 3.5: Delta conversion
 *   STEP 4: Super Order
 *   STEP 5: lastTrade
 *
 * ⚠️ ध्यान: असली order place होगा। अगर नहीं चाहते हो, तो चलाने से पहले
 *    main_config.json में "realTradeEnabled": false कर दो — पर तब Super Order भी
 *    नहीं जाएगा (क्योंकि main.js में check है, यहाँ direct processSignal call है तो
 *    वो skip होगा)।
 *
 * चलाओ: node C:\AlgoTrade\server\testMasterSL.js
 */

const masterSL = require('./masterSL');
const mainConfig = require('./config_manager');

async function testMasterSL() {
    console.log('==========================================================');
    console.log('🧪 MasterSL Signal Test');
    console.log('==========================================================\n');

    // Config verify
    const cfg = mainConfig.getConfig();
    console.log('📋 Current Config:');
    console.log('   realTradeEnabled :', cfg.realTradeEnabled);
    console.log('   targetPoints     :', cfg.targetPoints, '(NIFTY pts)');
    console.log('   stopLossPoints   :', cfg.stopLossPoints, '(NIFTY pts)');
    console.log('   trailingJumpPoints:', cfg.trailingJumpPoints);
    console.log('   maxTradesPerRun  :', cfg.maxTradesPerRun);
    console.log('   orderExchangeSegment:', cfg.orderExchangeSegment);
    console.log('');

    if (!cfg.realTradeEnabled) {
        console.log('⚠️  realTradeEnabled = false — Super Order असल में place होगा ही नहीं।');
        console.log('    Test करने के लिए main_config.json में true कर दो।\n');
    }

    // Test signal — जैसा consensusEngine produce करता है
    const testSignal = {
        consensus: "BUY",           // या "SELL" — change करके दोनों test कर सकते हो
        type: "BUY",
        entry: 22721,               // NIFTY spot price (informational)
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

    console.log('📤 Sending Test Signal:');
    console.log('   Consensus :', testSignal.consensus);
    console.log('   Entry     :', testSignal.entry);
    console.log('   Scrip     :', testScrip.symbol, `(${testScrip.securityId})`);
    console.log('');

    try {
        const result = await masterSL.processSignal(testSignal, testScrip);

        console.log('==========================================================');
        console.log('📥 MasterSL Result:');
        console.log(JSON.stringify(result, null, 2));
        console.log('==========================================================');

        if (result.status === 'success') {
            console.log('\n✅ SUCCESS — Order placed');
            console.log('   Order ID  :', result.order.orderId);
            console.log('   Strike    :', result.strike.symbol);
            console.log('   Delta     :', result.strike.delta, `[${result.strike.deltaSource}]`);
        } else if (result.status === 'ignored') {
            console.log('\n⏭️  IGNORED — Reason:', result.reason);
        } else if (result.status === 'error') {
            console.log('\n❌ ERROR —', result.message);
        }
    } catch (err) {
        console.error('\n💥 UNCAUGHT ERROR:', err.message);
        console.error(err.stack);
    }

    console.log('\n==========================================================');
    console.log('📊 MasterSL Status After Test:');
    const status = masterSL.getStatus();
    console.log('   isProcessing  :', status.isProcessing);
    console.log('   maxtread      :', status.maxtread);
    console.log('   lastEvent     :', JSON.stringify(status.lastEvent));
    console.log('   lastTrade     :', status.activePosition ? JSON.stringify(status.activePosition, null, 2) : 'null');
    console.log('==========================================================');
}

testMasterSL().catch(err => {
    console.error('Test failed:', err.message);
    process.exitCode = 1;
});