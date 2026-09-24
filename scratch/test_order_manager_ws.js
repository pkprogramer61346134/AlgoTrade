const OrderManagerWS = require('../ordermanager/ordermanagerws');

function testOrderManagerWS() {
    console.log("🚀 Testing OrderManagerWS Class...\n");

    const wsManager = new OrderManagerWS({
        serverUrl: 'ws://localhost:8080',
        clientId: 'orderManagerTest',
        monitorClientTarget: 'monitorClient'
    });

    console.log("Configured Options:");
    console.log(`- Server URL: ${wsManager.serverUrl}`);
    console.log(`- Client ID: ${wsManager.clientId}`);
    console.log(`- Monitor Target: ${wsManager.monitorClientTarget}`);
    console.log(`- Is Connected: ${wsManager.isConnected()}`);
    console.log("\n✅ OrderManagerWS Class Initialized Successfully!");
}

testOrderManagerWS();
