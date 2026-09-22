const path = require('path');
const { exec } = require('child_process');
const { ensureValidDhanToken } = require('./dhanAPI/autoTokenRefresh');

/**
 * ALGOTRADE MASTER SYSTEM LAUNCHER (VM MULTI-TERMINAL MODE)
 * 
 * Step 0: Dhan TOTP Token Verification & Auto-Refresh (TOP PRIORITY)
 * Step 1: Central WebSocket Server (server/main.js :8080) -> Separate Terminal
 * Step 2: Master Consensus Engine (head/consensusEngine.js) -> Separate Terminal
 * Step 3: Candle Data Hub (Candlehub/candleDataHub.js) -> Separate Terminal
 * Step 4: Paper Order Manager (papermanager/paperOrderManager.js) -> Separate Terminal
 * Step 5: Live Market Feed (live/liveTickClient.js) -> Separate Terminal
 * Step 6: Central Monitor Client & Web Dashboard (monitor/monitorClient.js :3000) -> Separate Terminal
 * Step 7: Backtest Engine Client (backtest/backtestClient.js) -> Separate Terminal
 */

function openTerminalWindow(title, scriptPath) {
    const fullPath = path.resolve(__dirname, scriptPath);
    console.log(`⏳ Opening Separate Terminal: [${title}] (${scriptPath})...`);
    
    if (process.platform === 'win32') {
        const cmd = `start "${title}" cmd /k "title ${title} && node "${fullPath}""`;
        exec(cmd, { cwd: __dirname });
    } else {
        const cmd = `xterm -T "${title}" -e "node ${fullPath}" &`;
        exec(cmd, { cwd: __dirname });
    }
}

async function orchestrateMultiTerminalSystem() {
    console.log('\n=================================================================================');
    console.log('🚀 ALGOTRADE MASTER SYSTEM (VM MULTI-TERMINAL LAUNCHER)');
    console.log('=================================================================================\n');

    // ---------------------------------------------------------------------------------
    // STEP 0: DHAN TOKEN VERIFICATION & AUTO-REFRESH (TOP PRIORITY)
    // ---------------------------------------------------------------------------------
    console.log('🔑 [STEP 0] Running Dhan TOTP Auth & Token Verification (TOP PRIORITY)...');
    try {
        const authResult = await ensureValidDhanToken();
        if (authResult.status === 'valid') {
            console.log('✅ [DHAN AUTH] Existing Access Token is VALID and active.\n');
        } else if (authResult.status === 'refreshed') {
            console.log('✨ [DHAN AUTH] Access Token was expired/missing. NEW Dhan Access Token generated and updated in config.js!\n');
        } else {
            console.warn(`⚠️ [DHAN AUTH] Auth Status: ${authResult.status}. Continuing startup...\n`);
        }
    } catch (authError) {
        console.error('❌ [DHAN AUTH] Error during Dhan token verification:', authError.message);
    }

    // ---------------------------------------------------------------------------------
    // STEP 1: CENTRAL WEBSOCKET SERVER (PORT 8080)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🌐 1. WS Server (Port 8080)', 'server/main.js');
    await new Promise((r) => setTimeout(r, 2000));

    // ---------------------------------------------------------------------------------
    // STEP 2: MASTER CONSENSUS ENGINE
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🧠 2. Master Consensus Engine', 'head/consensusEngine.js');
    await new Promise((r) => setTimeout(r, 1500));

    // ---------------------------------------------------------------------------------
    // STEP 3: CANDLE DATA HUB
    // ---------------------------------------------------------------------------------
    openTerminalWindow('📊 3. Candle Data Hub', 'Candlehub/candleDataHub.js');
    await new Promise((r) => setTimeout(r, 1500));

    // ---------------------------------------------------------------------------------
    // STEP 4: PAPER ORDER MANAGER
    // ---------------------------------------------------------------------------------
    openTerminalWindow('📝 4. Paper Order Manager', 'papermanager/paperOrderManager.js');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 5: LIVE MARKET TICK CLIENT
    // ---------------------------------------------------------------------------------
    openTerminalWindow('📈 5. Live Tick Client', 'live/liveTickClient.js');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 6: CENTRAL WEB MONITOR UI (PORT 3000)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🖥️ 6. Web Monitor UI (Port 3000)', 'monitor/monitorClient.js');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 7: BACKTEST CLIENT ENGINE (ON-DEMAND WEB UI READY)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🧪 7. Backtest Client', 'backtest/backtestClient.js');

    console.log('\n=================================================================================');
    console.log('✅ ALL 7 ALGOTRADE SERVICES LAUNCHED IN SEPARATE TERMINAL WINDOWS!');
    console.log('🌐 Web Dashboard: http://localhost:3000 (Or http://<VM_IP>:3000)');
    console.log('=================================================================================\n');
}

if (require.main === module) {
    orchestrateMultiTerminalSystem();
}

module.exports = { orchestrateMultiTerminalSystem };
