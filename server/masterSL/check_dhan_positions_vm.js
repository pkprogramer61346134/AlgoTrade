const masterSL = require('./masterSL');
const dhanEnv = require('../dhanEnvironmentHandler');

async function checkDhanPos() {
    console.log("=== CHECKING DHAN LIVE POSITIONS ===");
    try {
        const positions = await dhanEnv.getPositions();
        console.log("Dhan Net Positions:", JSON.stringify(positions, null, 2));
    } catch (e) {
        console.error("Error fetching Dhan positions:", e.message);
    }
}

checkDhanPos();
