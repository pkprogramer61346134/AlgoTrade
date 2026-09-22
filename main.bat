@echo off
title AlgoTrade Master VM Launcher
color 0A

echo =================================================================================
echo 🚀 ALGOTRADE MASTER SYSTEM LAUNCHER (VM MULTI-TERMINAL MODE)
echo =================================================================================
echo.

:: STEP 0: DHAN TOTP TOKEN VERIFICATION & AUTO-REFRESH (TOP PRIORITY)
echo 🔑 [STEP 0] Running Dhan TOTP Auth & Token Verification (TOP PRIORITY)...
node dhanAPI/autoTokenRefresh.js
echo.

:: STEP 1: CENTRAL WEBSOCKET SERVER (PORT 8080)
echo 🌐 [STEP 1] Opening Terminal: Central WebSocket Server (port 8080)...
start "1. WS Server (Port 8080)" cmd /k "title 🌐 WS Server (8080) && node server/main.js"
timeout /t 2 /nobreak >nul

:: STEP 2: MASTER CONSENSUS ENGINE
echo 🧠 [STEP 2] Opening Terminal: Master Consensus Signal Engine...
start "2. Consensus Engine" cmd /k "title 🧠 Consensus Engine && node head/consensusEngine.js"
timeout /t 2 /nobreak >nul

:: STEP 3: CANDLE DATA HUB
echo 📊 [STEP 3] Opening Terminal: Candle Data Hub...
start "3. Candle Data Hub" cmd /k "title 📊 Candle Data Hub && node Candlehub/candleDataHub.js"
timeout /t 2 /nobreak >nul

:: STEP 4: PAPER ORDER MANAGER (DEFAULT)
echo 📝 [STEP 4] Opening Terminal: Paper Order Manager (Virtual Account)...
start "4. Paper Order Manager" cmd /k "title 📝 Paper Order Manager && node papermanager/paperOrderManager.js"
timeout /t 1 /nobreak >nul

:: STEP 5: LIVE MARKET TICK CLIENT
echo 📈 [STEP 5] Opening Terminal: Live Market Tick Client...
start "5. Live Tick Client" cmd /k "title 📈 Live Tick Client && node live/liveTickClient.js"
timeout /t 1 /nobreak >nul

:: STEP 6: CENTRAL WEB MONITOR UI (PORT 3000)
echo 🖥️ [STEP 6] Opening Terminal: Central Web Monitor UI (http://localhost:3000)...
start "6. Web Monitor UI (Port 3000)" cmd /k "title 🖥️ Web Monitor UI && node monitor/monitorClient.js"
timeout /t 1 /nobreak >nul

:: STEP 7: BACKTEST CLIENT ENGINE (ON-DEMAND WEB UI READY)
echo 🧪 [STEP 7] Opening Terminal: Backtest Engine Client (On-Demand Web UI Listener)...
start "7. Backtest Client" cmd /k "title 🧪 Backtest Client && node backtest/backtestClient.js"

echo.
echo =================================================================================
echo ✅ ALL 7 ALGOTRADE SERVICES LAUNCHED IN SEPARATE TERMINAL WINDOWS!
echo 🌐 Web Dashboard: http://localhost:3000 (Or http://<VM_IP>:3000)
echo =================================================================================
echo.
pause
