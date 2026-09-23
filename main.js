const path = require('path');
const { exec, fork } = require('child_process');
const { ensureValidDhanToken } = require('./dhanAPI/autoTokenRefresh');

function openTerminalWindow(title, scriptPath) {
    const fullPath = path.resolve(__dirname, scriptPath);
    console.log(`⏳ Launching Service: [${title}] (${scriptPath})...`);
    
    if (process.platform === 'win32') {
        const cmd = `start "${title}" cmd /k "title ${title} && node "${fullPath}""`;
        exec(cmd, { cwd: __dirname });
    } else {
        try {
            const child = fork(fullPath, [], { cwd: __dirname, stdio: 'inherit' });
            child.on('error', (err) => console.error(`❌ [${title}] Fork Error:`, err.message));
        } catch (e) {
            console.error(`❌ [${title}] Failed to fork service:`, e.message);
        }
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
    // STEP 4A: PAPER ORDER MANAGER
    // ---------------------------------------------------------------------------------
    openTerminalWindow('📝 4A. Paper Order Manager', 'papermanager/paperOrderManager.js');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 4B: REAL MONEY ORDER MANAGER (DHAN API)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🔴 4B. Real Money Manager', 'ordermanager/smartOrderManager.js');
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
