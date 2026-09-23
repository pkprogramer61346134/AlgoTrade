const { WebSocket } = require('ws');
const AlgoTradeWSClient = require('../server/wsClient');
const { candleDataHub } = require('../Candlehub/candleDataHub');

/**
 * BACKTEST ENGINE CLIENT
 * 
 * 1. Connects to WebSocket Server as "backtestClient".
 * 2. Fetches historical candle dataset from candleDataHub.
 * 3. Streams bar-by-bar historical windows to consensusEngine.js over WebSocket.
 * 4. Backtest Active Order Guard: Ignores incoming signals if a backtest trade is active.
 * 5. Identical Paper Trading Engine: ATM Option Strike selection, ±0.50 pts slippage, 1R breathing room trailing SL (1:1.5 -> 1:5+).
 * 6. 3:15 PM Intraday Auto-Cut on historical daily boundaries.
 * 7. Live Backtest Telemetry Stream: Broadcasts progress %, winrate, PnL, active position, and live console logs to "monitorClient".
 */
class BacktestClient {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'ws://localhost:8080';
        this.clientId = options.clientId || 'backtestClient';
        this.monitorClientTarget = options.monitorClientTarget || 'monitorClient';
        this.slippagePoints = options.slippagePoints !== undefined ? options.slippagePoints : 0.50; // ±0.50 pts realistic slippage

        this.wsClient = null;

        // Backtest Position State
        this.activePosition = null;
        this.isOrderActive = false;

        // Virtual Funds & Backtest Metrics
        this.initialCapital = 100000.0;
        this.virtualBalance = 100000.0;
        this.virtualMarginUsed = 0.0;
        this.tradeHistory = [];
        this.todaySummary = {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            realizedPnl: 0.0,
            winratePercent: '0.0%'
        };

        // Trailing SL Steps (1R Breathing Room)
        this.trailingRatioSteps = [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        
        this.pendingSignalResolver = null;
    }

    async init() {
        console.log('===========================================================');
        console.log('📊 [BACKTEST ENGINE CLIENT] Initializing Backtest System...');
        console.log('===========================================================');

        // Connect to WebSocket Server
        this.wsClient = new AlgoTradeWSClient(this.clientId, this.serverUrl);
        await this.wsClient.connect();

        // Listen for Consensus Signal Responses & Web UI Commands
        this.wsClient.onMessage((msg) => {
            if (msg.type === 'FORWARD_MESSAGE') {
                const payload = msg.payload || {};
                
                // Handle Consensus Signal Response
                if (msg.senderId === 'consensusEngine') {
                    if (payload.action === 'CONSENSUS_SIGNAL_RESPONSE' || payload.singleSignal) {
                        if (this.pendingSignalResolver) {
                            const signal = payload.singleSignal || payload;
                            this.pendingSignalResolver(signal);
                            this.pendingSignalResolver = null;
                        }
                    }
                }

                // Handle START_BACKTEST request from Web UI / monitorClient
                if (payload.action === 'START_BACKTEST') {
                    const { startDate, endDate, symbol, interval, lots } = payload;
                    console.log(`\n🚀 [BACKTEST CLIENT] Received Web UI Command: Start Backtest (${startDate} to ${endDate}, ${symbol}, ${interval}m, Lots: ${lots || 1})`);
                    this.runBacktest(startDate || '2026-09-01', endDate || '2026-09-05', symbol || 'NIFTY_50', interval || '5', lots || 1);
                }
            }
        });

        console.log(`✅ [BACKTEST CLIENT] Connected to WebSocket Server. Target Monitor: "${this.monitorClientTarget}"`);
    }

    /**
     * Main Backtest Execution Function
     */
    async runBacktest(startDate, endDate, symbol = 'NIFTY_50', interval = '5', lots = 1) {
        this.selectedLots = Number(lots) || 1;
        this.sendLogEvent(`⏳ Loading historical dataset from candleDataHub (${startDate} to ${endDate}) [Lots: ${this.selectedLots}]...`);

        // Fetch historical candles from candleDataHub
        const allCandles = await candleDataHub.getCandles(startDate, endDate, symbol, interval);

        if (!allCandles || allCandles.length === 0) {
            this.sendLogEvent(`❌ No historical candles found for ${startDate} to ${endDate}!`);
            return null;
        }

        this.sendLogEvent(`📊 Dataset Loaded: ${allCandles.length} candles. Starting bar-by-bar backtest...`);

        this.virtualBalance = this.initialCapital;
        this.tradeHistory = [];
        this.todaySummary = { totalTrades: 0, wins: 0, losses: 0, realizedPnl: 0.0, winratePercent: '0.0%' };

        const totalBars = allCandles.length;

        for (let i = 50; i < totalBars; i++) {
            const currentBar = allCandles[i];
            const candlesSlice = allCandles.slice(0, i + 1);

            // 1. Process active backtest trade with current bar prices
            if (this.isOrderActive && this.activePosition) {
                this.onBacktestBarTick(currentBar);
            }

            // 2. Intraday 3:15 PM Auto-Cut Check
            if (currentBar.time >= '15:15' && this.isOrderActive) {
                this.sendLogEvent(`⏰ 3:15 PM Auto-Cut Triggered on ${currentBar.date} ${currentBar.time}`);
                this.closeBacktestPosition('BACKTEST_AUTO_CUT_315_PM', this.activePosition ? this.activePosition.currentLtp : currentBar.close);
            }

            // 3. If no trade is active, send bar window to consensusEngine over WebSocket (Prime Trading Hours: 09:30 to 14:45)
            if (!this.isOrderActive && currentBar.time >= '09:30' && currentBar.time <= '14:45') {
                const signal = await this.evaluateBarWithConsensus(candlesSlice);
                if (signal && signal.consensus && signal.consensus !== 'NO_SIGNAL' && signal.consensus !== 'NONE') {
                    this.sendLogEvent(`🧠 Consensus Signal Triggered: [${signal.consensus}] via Strategy: ${signal.strategyName || 'Consensus'}`);
                    await this.executeBacktestOrderEntry(signal.consensus, signal, currentBar);
                }
            }

            // 4. Send Telemetry Progress Update to Web UI Dashboard
            this.broadcastBacktestProgress(i, totalBars, currentBar);

            // Small delay so progress updates smoothly on Web UI
            await new Promise((r) => setTimeout(r, 15));
        }

        // Close any remaining active position at end of backtest
        if (this.isOrderActive && this.activePosition) {
            this.closeBacktestPosition('BACKTEST_END_OF_DATA', this.activePosition.currentLtp);
        }

        // Generate Final Backtest Summary
        const winrate = this.todaySummary.totalTrades > 0 ? ((this.todaySummary.wins / this.todaySummary.totalTrades) * 100).toFixed(1) : 0;
        this.todaySummary.winratePercent = `${winrate}%`;

        const report = {
            status: 'COMPLETED',
            symbol,
            startDate,
            endDate,
            lots: this.selectedLots,
            totalCandles: totalBars,
            initialCapital: this.initialCapital,
            finalBalance: this.virtualBalance,
            totalNetPnl: Number((this.virtualBalance - this.initialCapital).toFixed(2)),
            returnPercent: `${(((this.virtualBalance - this.initialCapital) / this.initialCapital) * 100).toFixed(2)}%`,
            summary: this.todaySummary,
            trades: this.tradeHistory
        };

        this.sendLogEvent(`🏁 Backtest Completed! Period: ${startDate} to ${endDate} | Total Trades: ${this.todaySummary.totalTrades} | Winrate: ${this.todaySummary.winratePercent} | Net PnL: ₹${report.totalNetPnl}`);
        this.broadcastBacktestTelemetry('BACKTEST_COMPLETED', report);
        return report;
    }

    /**
     * Sends bar slice to consensusEngine over WebSocket & awaits signal response
     */
    evaluateBarWithConsensus(candlesSlice) {
        return new Promise((resolve) => {
            if (!this.wsClient || !this.wsClient.connected) {
                return resolve(null);
            }

            this.pendingSignalResolver = resolve;

            // Timeout safety (500ms)
            setTimeout(() => {
                if (this.pendingSignalResolver) {
                    this.pendingSignalResolver(null);
                    this.pendingSignalResolver = null;
                }
            }, 500);

            this.wsClient.sendMessage({
                action: 'EVALUATE_CONSENSUS',
                mode: 'PAPER',
                targetRecipient: 'backtestClient',
                candles: candlesSlice
            }, 'consensusEngine');
        });
    }

    /**
     * Order Entry with Realistic Slippage
     */
    async executeBacktestOrderEntry(signalType, signal, bar) {
        const spotPrice = bar.close;
        const optionType = (signalType === 'BUY') ? 'CE' : 'PE';
        const strikePrice = Math.round(spotPrice / 50) * 50;
        const symbol = `NIFTY_${strikePrice}_${optionType}`;

        // Dynamic ATM Option Premium Estimation (~0.55% of spot price)
        const basePremium = Number((spotPrice * 0.0055).toFixed(2));
        const entryPremium = Number((basePremium + this.slippagePoints).toFixed(2));
        const lotCount = this.selectedLots || 1;
        const qty = 65 * lotCount; // 1 Lot Nifty = 65 Qty (NSE Official Lot Size)
        const requiredMargin = entryPremium * qty;

        if (this.virtualBalance < requiredMargin) {
            this.sendLogEvent(`❌ Insufficient funds for trade! Required: ₹${requiredMargin}`);
            return;
        }

        const riskPoints = 15.0;
        const rrRatio = (signal && signal.riskRewardRatio) ? signal.riskRewardRatio : 2.2;
        const initialSL = Number((entryPremium - riskPoints).toFixed(2));
        const targetProfit = Number((entryPremium + (riskPoints * rrRatio)).toFixed(2));

        this.activePosition = {
            orderId: `BT_ORD_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            mode: 'BACKTEST',
            symbol,
            optionType,
            strikePrice,
            spotEntryPrice: spotPrice,
            lots: lotCount,
            qty,
            entryPrice: entryPremium,
            currentLtp: entryPremium,
            initialSL,
            currentTrailingSL: initialSL,
            targetProfit,
            highestPriceSeen: entryPremium,
            riskPoints,
            currentMilestoneIndex: -1,
            currentRatioText: '1:0',
            unrealizedPnl: 0.0,
            openedAt: `${bar.date} ${bar.time}`
        };

        this.isOrderActive = true;
        this.virtualMarginUsed = requiredMargin;

        this.sendLogEvent(`🟢 [ENTRY] ${bar.date} ${bar.time} | Executed ${symbol} @ ₹${entryPremium} (SL: ₹${initialSL})`);
        this.broadcastBacktestTelemetry('BACKTEST_POSITION_OPENED', this.activePosition);
    }

    /**
     * Historical Bar Price Tick Processing & Stepless Trailing SL Engine
     */
    onBacktestBarTick(bar) {
        if (!this.isOrderActive || !this.activePosition) return;

        const pos = this.activePosition;

        const spotHigh = bar.high;
        const spotLow = bar.low;
        const spotClose = bar.close;

        const spotDiffHigh = spotHigh - pos.spotEntryPrice;
        const spotDiffLow = spotLow - pos.spotEntryPrice;
        const spotDiffClose = spotClose - pos.spotEntryPrice;

        const estOptionHigh = pos.optionType === 'CE' ? pos.entryPrice + (spotDiffHigh * 0.50) : pos.entryPrice - (spotDiffLow * 0.50);
        const estOptionLow = pos.optionType === 'CE' ? pos.entryPrice + (spotDiffLow * 0.50) : pos.entryPrice - (spotDiffHigh * 0.50);
        const estOptionClose = pos.optionType === 'CE' ? pos.entryPrice + (spotDiffClose * 0.50) : pos.entryPrice - (spotDiffClose * 0.50);

        pos.currentLtp = Number(Math.max(1, estOptionClose).toFixed(2));
        const pnlPerShare = pos.currentLtp - pos.entryPrice;
        pos.unrealizedPnl = Number((pnlPerShare * pos.qty).toFixed(2));

        // Update Peak Price
        if (estOptionHigh > pos.highestPriceSeen) {
            pos.highestPriceSeen = Number(estOptionHigh.toFixed(2));
        }

        // Check Trailing SL Hit
        if (estOptionLow <= pos.currentTrailingSL) {
            this.sendLogEvent(`🚨 [EXIT] ${bar.date} ${bar.time} | Trailing SL HIT! Low: ₹${estOptionLow.toFixed(2)} <= SL: ₹${pos.currentTrailingSL}`);
            this.closeBacktestPosition('BACKTEST_TRAILING_SL_HIT', pos.currentTrailingSL);
            return;
        }

        // Evaluate Trailing SL Progression
        const gainedPoints = pos.highestPriceSeen - pos.entryPrice;
        const currentRRRatio = gainedPoints / pos.riskPoints;

        for (let i = this.trailingRatioSteps.length - 1; i >= 0; i--) {
            const milestoneRatio = this.trailingRatioSteps[i];
            if (currentRRRatio >= milestoneRatio && i > pos.currentMilestoneIndex) {
                pos.currentMilestoneIndex = i;
                pos.currentRatioText = `1:${milestoneRatio}`;

                const lockedRRatio = Math.max(0, milestoneRatio - 1.0);
                const newTrailingSL = Number((pos.entryPrice + (lockedRRatio * pos.riskPoints)).toFixed(2));

                if (newTrailingSL > pos.currentTrailingSL) {
                    const oldSL = pos.currentTrailingSL;
                    pos.currentTrailingSL = newTrailingSL;
                    this.sendLogEvent(`📈 [TRAIL] ${bar.date} ${bar.time} | Milestone ${pos.currentRatioText} Hit! Peak: ₹${pos.highestPriceSeen} | SL moved: ₹${oldSL} ➔ ₹${newTrailingSL}`);
                }
                break;
            }
        }
    }

    /**
     * Close Backtest Position & Record PnL
     */
    closeBacktestPosition(reason, rawExitPrice) {
        if (!this.isOrderActive || !this.activePosition) return;

        const pos = this.activePosition;
        let targetPrice = (rawExitPrice !== undefined && rawExitPrice !== null) ? rawExitPrice : pos.currentLtp;
        
        // Safety Guard: If rawExitPrice is Nifty Spot Index (>2000), use pos.currentLtp instead!
        if (targetPrice > 2000) {
            targetPrice = pos.currentLtp;
        }

        const exitPrice = Number(Math.max(1, targetPrice - this.slippagePoints).toFixed(2));
        const pnlPerShare = exitPrice - pos.entryPrice;
        const netPnl = Number((pnlPerShare * pos.qty).toFixed(2));

        this.todaySummary.totalTrades += 1;
        if (netPnl >= 0) {
            this.todaySummary.wins += 1;
        } else {
            this.todaySummary.losses += 1;
        }
        this.todaySummary.realizedPnl = Number((this.todaySummary.realizedPnl + netPnl).toFixed(2));
        this.virtualBalance = Number((this.virtualBalance + netPnl).toFixed(2));
        this.virtualMarginUsed = 0.0;

        const closedRecord = {
            ...pos,
            exitPrice,
            slippageApplied: this.slippagePoints,
            netPnl,
            reason
        };

        this.tradeHistory.push(closedRecord);

        this.sendLogEvent(`🏁 [CLOSED] ${pos.symbol} Exit: ₹${exitPrice} | Net PnL: ${netPnl >= 0 ? '+' : ''}₹${netPnl} | Reason: ${reason}`);
        this.broadcastBacktestTelemetry('BACKTEST_POSITION_CLOSED', closedRecord);

        this.activePosition = null;
        this.isOrderActive = false;
    }

    sendLogEvent(logText) {
        console.log(`[BACKTEST LOG] ${logText}`);
        this.broadcastBacktestTelemetry('BACKTEST_LOG_EVENT', { text: logText, timestamp: Date.now() });
    }

    broadcastBacktestProgress(currentBarIndex, totalBars, currentBar) {
        const progressPercent = Number(((currentBarIndex / totalBars) * 100).toFixed(1));
        const winrate = this.todaySummary.totalTrades > 0 ? ((this.todaySummary.wins / this.todaySummary.totalTrades) * 100).toFixed(1) : 0;
        this.todaySummary.winratePercent = `${winrate}%`;

        const telemetryData = {
            mode: 'BACKTEST',
            progressPercent: `${progressPercent}%`,
            currentBarIndex: currentBarIndex + 1,
            totalBars,
            currentDate: currentBar ? `${currentBar.date} ${currentBar.time}` : '',
            virtualBalance: this.virtualBalance,
            activePosition: this.activePosition ? {
                symbol: this.activePosition.symbol,
                optionType: this.activePosition.optionType,
                entryPrice: this.activePosition.entryPrice,
                currentLtp: this.activePosition.currentLtp,
                initialSL: this.activePosition.initialSL,
                highestPriceSeen: this.activePosition.highestPriceSeen,
                unrealizedPnl: this.activePosition.unrealizedPnl,
                currentTrailingSL: this.activePosition.currentTrailingSL,
                currentRatioText: this.activePosition.currentRatioText
            } : null,
            summary: this.todaySummary
        };

        this.broadcastBacktestTelemetry('BACKTEST_PROGRESS_UPDATE', telemetryData);
    }

    broadcastBacktestTelemetry(event, data) {
        if (!this.wsClient || !this.wsClient.connected) return;

        this.wsClient.sendMessage({
            type: 'BACKTEST_MONITOR_UPDATE',
            data: {
                event,
                timestamp: Date.now(),
                data
            }
        }, this.monitorClientTarget);
    }
}

// Standalone runner
if (require.main === module) {
    async function startBacktestListener() {
        const backtestClient = new BacktestClient();
        await backtestClient.init();
        console.log('⏳ [BACKTEST CLIENT] Service Idle & Ready. Waiting for Web UI trigger ("Run Backtest")...\n');
    }

    startBacktestListener();
}

module.exports = BacktestClient;
