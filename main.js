const path = require('path');
const { exec, fork } = require('child_process');
const { ensureValidDhanToken } = require('./dhanAPI/autoTokenRefresh');

function openTerminalWindow(title, scriptPathWithArgs) {
    const parts = scriptPathWithArgs.trim().split(/\s+/);
    const scriptPath = parts[0];
    const args = parts.slice(1);
    const fullPath = path.resolve(__dirname, scriptPath);
    const argsStr = args.join(' ');
    console.log(`⏳ Launching Service: [${title}] (${scriptPathWithArgs})...`);
    
    if (process.platform === 'win32') {
        const cmd = `start "${title}" cmd /k "title ${title} && node "${fullPath}" ${argsStr}"`;
        exec(cmd, { cwd: __dirname });
    } else {
        try {
            const child = fork(fullPath, args, { cwd: __dirname, stdio: 'inherit' });
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
    // STEP 2B: DEDICATED MASTER HEAD WEB TERMINAL (PORT 3003)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🧠 2B. Head Web Terminal (Port 3003)', 'head/headServer.js --port=3003');
    await new Promise((r) => setTimeout(r, 1000));

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
    // STEP 4C: DEDICATED PAPER WEB TERMINAL (PORT 3001)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('📝 4C. Paper Web Terminal (Port 3001)', 'papermanager/paperServer.js --port=3001');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 4B: REAL MONEY ORDER MANAGER (DHAN API)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🔴 4B. Real Money Manager', 'ordermanager/smartOrderManager.js');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 4D: DEDICATED REAL MONEY WEB TERMINAL (PORT 3002)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🔴 4D. Real Web Terminal (Port 3002)', 'ordermanager/realServer.js --port=3002');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 5: LIVE MARKET TICK CLIENT
    // ---------------------------------------------------------------------------------
    openTerminalWindow('📈 5. Live Tick Client', 'live/liveTickClient.js');
    await new Promise((r) => setTimeout(r, 1000));

    // ---------------------------------------------------------------------------------
    // STEP 6: BACKTEST CLIENT ENGINE (ON-DEMAND WEB UI READY)
    // ---------------------------------------------------------------------------------
    openTerminalWindow('🧪 6. Backtest Client', 'backtest/backtestClient.js');

    console.log('\n=================================================================================');
    console.log('✅ ALL ALGOTRADE SERVICES LAUNCHED IN SEPARATE TERMINAL WINDOWS!');
    console.log('📝 Dedicated Paper Terminal: http://localhost:3001');
    console.log('🔴 Dedicated Real Money Terminal: http://localhost:3002');
    console.log('🧠 Dedicated Head Consensus Terminal: http://localhost:3003');
    console.log('=================================================================================\n');
}

if (require.main === module) {
    orchestrateMultiTerminalSystem();
}

module.exports = { orchestrateMultiTerminalSystem };
