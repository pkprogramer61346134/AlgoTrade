const { DhanSDK } = require('../dhanAPI/index');

async function verifyClosedPosition() {
    const dhan = new DhanSDK();
    const posRes = await dhan.portfolio.getPositions();
    console.log("📋 Verified Live Positions from Dhan:");
    console.log(JSON.stringify(posRes?.data, null, 2));
}

verifyClosedPosition();
