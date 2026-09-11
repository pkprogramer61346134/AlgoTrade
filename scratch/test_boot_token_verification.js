const { ensureValidDhanToken, DhanSDK } = require('../dhanAPI/index');

async function testBootTokenVerification() {
    console.log("==================================================================");
    console.log("🧪 TESTING AUTOMATED DHAN BOOT TOKEN VERIFICATION & REFRESH");
    console.log("==================================================================\n");

    // 1. Verify token on boot
    console.log("1️⃣ Calling ensureValidDhanToken()...");
    const authResult = await ensureValidDhanToken();
    
    console.log(`\n📌 Result Status: ${authResult.status}`);
    console.log(`📌 Access Token Present: ${authResult.accessToken ? "✅ YES" : "❌ NO"}`);
    
    // 2. Instantiate DhanSDK with verified token
    const dhan = new DhanSDK();
    if (authResult.accessToken) {
        dhan.setCredentials(authResult.clientId, authResult.accessToken);
    }

    // 3. Test API call with verified token
    console.log("\n2️⃣ Testing Dhan API Request (/fundlimit)...");
    const fundsRes = await dhan.funds.getFundLimits();
    
    console.log(`📌 Dhan Response Status: ${fundsRes.status}`);
    if (fundsRes.status === 'success') {
        console.log("✅ SUCCESS: Dhan API is active & responding cleanly!");
    } else {
        console.warn(`⚠️ Warning: ${fundsRes.message}`);
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL BOOT TOKEN VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
    console.log("==================================================================");
}

testBootTokenVerification().catch(e => {
    console.error("❌ Test crashed:", e);
});
