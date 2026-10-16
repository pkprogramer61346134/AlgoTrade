/**
 * AlgoTrade Backtesting Engine
 * Location: C:\AlgoTrade\server\backtesting\backtesting.js
 *
 * Flow — बिल्कुल main.js जैसा:
 *   1. getCachedCandles() से fromDate..toDate की सारी 15-min candles लाओ (एक बार)
 *   2. हर candle पर step-by-step:
 *        a. Active position हो → trailing SL update करो, फिर target/SL/EOD check करो
 *        b. उस candle के (date, time) engine को भेजो
 *        c. Engine के output से नया position खोलो (अगर signal आया)
 *   3. End में stats + daily breakdown + trades
 *
 * कोई fallback / dummy / fake data नहीं।
 * Engine अगर error throw करे → backtest fail, error upar फेंको।
 */

const fs = require('fs');
const path = require('path');
const { getCachedCandles } = require('../../utility/usedfull/cached-historical-data');
const { evaluateConsensusEngine } = require('../../utility/usedfull/Engines/consensusEngine');

const REPORT_FILE = path.join(__dirname, 'backtest_report.json');

const SECURITY_ID = "13";
const EXCHANGE_SEGMENT = "IDX_I";
const DEFAULT_INTERVAL = "15";
const DEFAULT_MAX_TRADES_PER_DAY = 3;
const EOD_CUTOFF_SECS = 15 * 3600 + 15 * 60;   // 15:15 IST
const ENTRY_CUTOFF_SECS = 15 * 3600;            // 15:00 IST
const EXIT_COOLDOWN_SECS = 900;                 // 15 min

function toSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;
    const clean = timeStr.trim().toLowerCase();
    const isPM = clean.includes("pm");
    const isAM = clean.includes("am");
    const t = clean.replace(/(am|pm)/gi, "").trim();
    const parts = t.split(":");
    let h = parseInt(parts[0] || "0", 10);
    let m = parseInt(parts[1] || "0", 10);
    let s = parseInt(parts[2] || "0", 10);
    if (isPM && h < 12) h += 12;
    else if (isAM && h === 12) h = 0;
    return h * 3600 + m * 60 + s;
}

class BacktestEngine {
    constructor() {
        this.report = null;
    }

    /**
     * Stream historical candles step-by-step, calling consensus engine
     * with ONLY (securityId, exchangeSegment, interval, date, time).
     */
    async streamHistoricalCandles(params = {}, onCandleTick = null) {
        const fromDate = params.fromDate;
        const toDate = params.toDate || fromDate;
        if (!fromDate) {
            throw new Error("[BACKTEST] fromDate is required (YYYY-MM-DD).");
        }

        const interval = String(params.interval || DEFAULT_INTERVAL);
        const maxTradesPerDay = Number(params.maxTradesPerDay || DEFAULT_MAX_TRADES_PER_DAY);
        const fromTime = params.fromTime || null;
        const toTime = params.toTime || null;

        const slPointsInput = (params.slPoints !== undefined && !isNaN(Number(params.slPoints)) && Number(params.slPoints) > 0)
            ? Number(params.slPoints) : null;
        const targetPointsInput = (params.targetPoints !== undefined && !isNaN(Number(params.targetPoints)) && Number(params.targetPoints) > 0)
            ? Number(params.targetPoints) : null;

        // ⬇️ NEW: Trailing Jump points (0 = trailing disabled)
        const trailingJumpPoints = (params.trailingJumpPoints !== undefined && !isNaN(Number(params.trailingJumpPoints)) && Number(params.trailingJumpPoints) > 0)
            ? Number(params.trailingJumpPoints) : 0;

        console.log("==========================================================================");
        console.log(`🧪 [BACKTEST] Range: ${fromDate} → ${toDate} | Interval: ${interval}m`);
        console.log(` Config: maxTradesPerDay=${maxTradesPerDay}` +
            (fromTime ? ` | fromTime=${fromTime}` : "") +
            (toTime ? ` | toTime=${toTime}` : ""));
        console.log(` Risk: SL=${slPointsInput ?? "engine"}pts | Target=${targetPointsInput ?? "engine"}pts | TrailingJump=${trailingJumpPoints}pts${trailingJumpPoints > 0 ? " ✅" : " (off)"}`);
        console.log(" Engine call shape: { securityId, exchangeSegment, interval, date, time }");
        console.log("==========================================================================\n");

        // 1. Load full candle range ONCE
        const candleRes = await getCachedCandles({
            securityId: SECURITY_ID,
            exchangeSegment: EXCHANGE_SEGMENT,
            instrument: "INDEX",
            fromDate: fromDate,
            toDate: toDate,
            interval: interval
        });

        if (!candleRes || !Array.isArray(candleRes.data) || candleRes.data.length === 0) {
            throw new Error(`[BACKTEST] No candles returned for ${fromDate} → ${toDate}`);
        }

        // Apply time-of-day filter if given
        const fromSecs = fromTime ? toSeconds(fromTime) : null;
        const toSecs = toTime ? toSeconds(toTime) : null;

        const candles = candleRes.data.filter(c => {
            const s = toSeconds(c.time);
            if (fromSecs !== null && s < fromSecs) return false;
            if (toSecs !== null && s > toSecs) return false;
            return true;
        });

        if (candles.length === 0) {
            throw new Error(`[BACKTEST] No candles after time filter (${fromTime}–${toTime}).`);
        }

        console.log(`✅ [BACKTEST] Loaded ${candles.length} candles. Stepping through each (${interval}m)...\n`);

        let activePosition = null;
        const tradesHistory = [];
        const dailyTradeCountMap = {};
        const lastTradeExitSecsMap = {};

        for (let i = 0; i < candles.length; i++) {
            const tick = candles[i];
            const candleClose = Number(tick.close || tick.candleClose || tick.price || 0);
            const candleHigh = Number(tick.high || tick.candleHigh || candleClose);
            const candleLow = Number(tick.low || tick.candleLow || candleClose);
            const tickSecs = toSeconds(tick.time);
            const dayKey = tick.date || "DEFAULT";

            const isLastCandleOfDay = (
                tickSecs >= EOD_CUTOFF_SECS ||
                i === candles.length - 1 ||
                (i < candles.length - 1 && candles[i + 1].date !== tick.date)
            );

            let closedTradeThisTick = null;
            let consensusResult = null;

            // ============================================================
            // 1. Active position हो तो पहले TRAILING SL update करो
            //    फिर target/SL/EOD exit check करो — उसी candle की high/low से
            // ============================================================
            if (activePosition) {
                const isBUY = activePosition.type === "BUY";

                // ---------- TRAILING SL UPDATE (NEW) ----------
                if (activePosition.trailingJump > 0) {
                    const jump = activePosition.trailingJump;
                    const entry = activePosition.entryPrice;

                    if (isBUY) {
                        // candleHigh ने entry से कितना favourable move किया?
                        const maxFavorable = candleHigh - entry;
                        if (maxFavorable >= jump) {
                            const candidate = entry + (maxFavorable - jump);
                            if (candidate > activePosition.slPrice) {
                                activePosition.slPrice = Number(candidate.toFixed(2));
                                activePosition.trailingActivated = true;
                            }
                        }
                    } else {
                        const maxFavorable = entry - candleLow;
                        if (maxFavorable >= jump) {
                            const candidate = entry - (maxFavorable - jump);
                            if (candidate < activePosition.slPrice) {
                                activePosition.slPrice = Number(candidate.toFixed(2));
                                activePosition.trailingActivated = true;
                            }
                        }
                    }
                }

                // ---------- EXIT CHECK ----------
                let isTargetHit = false;
                let isSLHit = false;
                let isEODSquareOff = false;

                if (isBUY) {
                    // Target पहले check करो (अगर same candle में दोनों hit हुए तो optimistic)
                    if (candleHigh >= activePosition.targetPrice) isTargetHit = true;
                    else if (candleLow <= activePosition.slPrice) isSLHit = true;
                    else if (isLastCandleOfDay) isEODSquareOff = true;
                } else {
                    if (candleLow <= activePosition.targetPrice) isTargetHit = true;
                    else if (candleHigh >= activePosition.slPrice) isSLHit = true;
                    else if (isLastCandleOfDay) isEODSquareOff = true;
                }

                if (isTargetHit || isSLHit || isEODSquareOff) {
                    const exitPrice = isTargetHit
                        ? activePosition.targetPrice
                        : (isSLHit ? activePosition.slPrice : candleClose);

                    // Exit reason — अगर SL hit हुआ और trailing active था → TRAILING_SL_HIT
                    let exitReason;
                    if (isTargetHit) exitReason = "TARGET_HIT";
                    else if (isSLHit) {
                        exitReason = activePosition.trailingActivated
                            ? "TRAILING_SL_HIT"
                            : "INITIAL_SL_HIT";
                    } else {
                        exitReason = "EOD_SQUARE_OFF";
                    }

                    const pts = isBUY
                        ? (exitPrice - activePosition.entryPrice)
                        : (activePosition.entryPrice - exitPrice);

                    lastTradeExitSecsMap[dayKey] = tickSecs;

                    closedTradeThisTick = {
                        tradeId: activePosition.tradeId,
                        strategyId: activePosition.strategyId,
                        strategyName: activePosition.strategyName,
                        type: activePosition.type,
                        optionType: activePosition.type === "BUY" ? "CE" : "PE",
                        entryDate: activePosition.entryDate,
                        entryTime: activePosition.entryTime,
                        entryPrice: activePosition.entryPrice,
                        initialSl: activePosition.initialSl,
                        exitSl: activePosition.slPrice,
                        sl: activePosition.slPrice,
                        tr: activePosition.targetPrice,
                        targetPrice: activePosition.targetPrice,
                        trailingJump: activePosition.trailingJump,
                        trailingActivated: !!activePosition.trailingActivated,
                        exitDate: tick.date,
                        exitTime: tick.time,
                        exitPrice: Number(exitPrice.toFixed(2)),
                        exitReason,
                        points: Number(pts.toFixed(2)),
                        result: pts >= 0 ? "PASS" : "LOSS"
                    };
                    tradesHistory.push(closedTradeThisTick);
                    activePosition = null;
                }
            }

            // 2. Engine call — सिर्फ़ options object, कोई candle array नहीं
            consensusResult = await evaluateConsensusEngine({
                securityId: SECURITY_ID,
                exchangeSegment: EXCHANGE_SEGMENT,
                interval: interval,
                date: tick.date,
                time: tick.time
            });

            if (!consensusResult) {
                throw new Error(`[BACKTEST] Engine returned no result at ${tick.date} ${tick.time}`);
            }

            // 3. नया position खोलो — अगर signal BUY/SELL है, cutoff और cooldown pass हैं
            const currentDayTrades = dailyTradeCountMap[dayKey] || 0;
            const lastExitSecs = lastTradeExitSecsMap[dayKey];
            const cooldownSatisfied = (lastExitSecs === undefined || lastExitSecs === null)
                || ((tickSecs - lastExitSecs) >= EXIT_COOLDOWN_SECS);

            if (
                !activePosition &&
                cooldownSatisfied &&
                !isLastCandleOfDay &&
                tickSecs <= ENTRY_CUTOFF_SECS &&
                currentDayTrades < maxTradesPerDay &&
                (consensusResult.consensus === "BUY" || consensusResult.consensus === "SELL")
            ) {
                dailyTradeCountMap[dayKey] = currentDayTrades + 1;

                const type = consensusResult.consensus;

                // ---- Entry price: engine से, कोई fallback नहीं ----
                if (consensusResult.entry === null || consensusResult.entry === undefined) {
                    throw new Error(`[BACKTEST] Engine gave no entry at ${tick.date} ${tick.time}`);
                }
                const entryPrice = Number(Number(consensusResult.entry).toFixed(2));

                // ---- SL: override > engine > error ----
                let slPrice;
                if (slPointsInput !== null) {
                    slPrice = type === "BUY" ? entryPrice - slPointsInput : entryPrice + slPointsInput;
                } else if (consensusResult.sl !== null && consensusResult.sl !== undefined) {
                    slPrice = Number(consensusResult.sl);
                } else {
                    throw new Error(`[BACKTEST] Engine gave no SL and no slPoints override at ${tick.date} ${tick.time}`);
                }

                // ---- Target: override > engine > error ----
                let targetPrice;
                if (targetPointsInput !== null) {
                    targetPrice = type === "BUY" ? entryPrice + targetPointsInput : entryPrice - targetPointsInput;
                } else if (consensusResult.tr !== null && consensusResult.tr !== undefined) {
                    targetPrice = Number(consensusResult.tr);
                } else {
                    throw new Error(`[BACKTEST] Engine gave no TR and no targetPoints override at ${tick.date} ${tick.time}`);
                }

                activePosition = {
                    tradeId: `BT_${i}_${Date.now()}`,
                    strategyId: consensusResult.strategyId || null,
                    strategyName: consensusResult.strategyName || null,
                    type,
                    entryDate: tick.date,
                    entryTime: tick.time,
                    entryPrice,
                    initialSl: slPrice,
                    slPrice,
                    targetPrice,
                    trailingJump: trailingJumpPoints,        // ⬅️ NEW
                    trailingActivated: false                 // ⬅️ NEW
                };
            }

            // 4. Progress callback
            if (typeof onCandleTick === 'function') {
                await onCandleTick({
                    index: i + 1,
                    total: candles.length,
                    percent: Math.round(((i + 1) / candles.length) * 100),
                    tick: {
                        date: tick.date,
                        time: tick.time,
                        close: candleClose,
                        high: candleHigh,
                        low: candleLow
                    },
                    consensusResult: {
                        consensus: consensusResult.consensus,
                        strategyName: consensusResult.strategyName || null,
                        entry: consensusResult.entry,
                        sl: consensusResult.sl,
                        tr: consensusResult.tr
                    },
                    activePosition,
                    tradeCount: tradesHistory.length,
                    latestClosedTrade: closedTradeThisTick
                });
            }
        }

        // ---- Stats ----
        let totalPoints = 0;
        let grossWinPoints = 0;
        let grossLossPoints = 0;
        let trHitsCount = 0;
        let slHitsCount = 0;
        let trailingSlHitsCount = 0;   // ⬅️ NEW
        let eodCount = 0;

        const formattedTrades = tradesHistory.map(t => {
            const isWin = t.points >= 0;
            if (t.exitReason === "TARGET_HIT") trHitsCount++;
            else if (t.exitReason === "INITIAL_SL_HIT") slHitsCount++;
            else if (t.exitReason === "TRAILING_SL_HIT") trailingSlHitsCount++;   // ⬅️ NEW
            else if (t.exitReason === "EOD_SQUARE_OFF") eodCount++;

            if (isWin) grossWinPoints += t.points;
            else grossLossPoints += Math.abs(t.points);
            totalPoints += t.points;

            return t;
        });

        const totalTrades = formattedTrades.length;
        const winningTradesCount = formattedTrades.filter(t => t.points >= 0).length;
        const losingTradesCount = formattedTrades.filter(t => t.points < 0).length;

        const winrateNum = totalTrades > 0 ? ((winningTradesCount / totalTrades) * 100) : 0;
        const winrateStr = `${winrateNum.toFixed(1)}%`;
        const netPointsFormatted = Number(totalPoints.toFixed(2));
        const avgTradePointsFormatted = totalTrades > 0 ? Number((totalPoints / totalTrades).toFixed(2)) : 0;
        const profitFactorStr = grossLossPoints > 0
            ? (grossWinPoints / grossLossPoints).toFixed(2)
            : (grossWinPoints > 0 ? "99.00" : "0.00");

        const dailyMap = {};
        formattedTrades.forEach(t => {
            const key = t.exitDate || t.entryDate || "Unknown";
            if (!dailyMap[key]) {
                dailyMap[key] = {
                    date: key, totalTrades: 0, winningTrades: 0, losingTrades: 0,
                    trHits: 0, slHits: 0, trailingSlHits: 0, netPoints: 0
                };
            }
            const d = dailyMap[key];
            d.totalTrades += 1;
            d.netPoints = Number((d.netPoints + t.points).toFixed(2));
            if (t.points >= 0) d.winningTrades += 1; else d.losingTrades += 1;
            if (t.exitReason === "TARGET_HIT") d.trHits += 1;
            if (t.exitReason === "INITIAL_SL_HIT") d.slHits += 1;
            if (t.exitReason === "TRAILING_SL_HIT") d.trailingSlHits += 1;
        });

        const dailyBreakdown = Object.values(dailyMap).map(d => ({
            ...d,
            winrate: d.totalTrades > 0
                ? `${((d.winningTrades / d.totalTrades) * 100).toFixed(0)}%`
                : "0%"
        }));

        const completeReport = {
            status: "success",
            symbol: "NIFTY",
            fromDate,
            toDate,
            fromTime: fromTime || null,
            toTime: toTime || null,
            interval: `${interval}m`,
            totalCandles: candles.length,
            stats: {
                totalTrades,
                winningTrades: winningTradesCount,
                losingTrades: losingTradesCount,
                trHits: trHitsCount,
                slHits: slHitsCount,
                trailingSlHits: trailingSlHitsCount,     // ⬅️ NEW
                eodExits: eodCount,
                winrate: winrateStr,
                netPoints: netPointsFormatted,
                avgTradePoints: avgTradePointsFormatted,
                profitFactor: profitFactorStr,
                maxTradesPerDay,
                slPoints: slPointsInput,
                targetPoints: targetPointsInput,
                trailingJumpPoints                                // ⬅️ NEW
            },
            dailyBreakdown,
            trades: formattedTrades
        };

        this.report = completeReport;
        this.saveReport(completeReport);

        console.log("\n==========================================================================");
        console.log(`🎉 BACKTEST COMPLETE: Trades ${totalTrades} | W ${winningTradesCount} | L ${losingTradesCount} | TR ${trHitsCount} | SL ${slHitsCount} | TrailSL ${trailingSlHitsCount} | WR ${winrateStr} | Net ${netPointsFormatted >= 0 ? '+' : ''}${netPointsFormatted}`);
        console.log("==========================================================================\n");

        return { candles, report: completeReport };
    }

    saveReport(report) {
        try {
            fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8');
            return true;
        } catch (err) {
            console.error("❌ Error saving backtest report:", err.message);
            return false;
        }
    }

    getReport() {
        if (this.report) return this.report;
        try {
            if (fs.existsSync(REPORT_FILE)) {
                this.report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
                return this.report;
            }
        } catch (err) {
            console.error("❌ Error reading cached backtest report:", err.message);
        }
        return null;
    }

    async runBacktest(params = {}) {
        const result = await this.streamHistoricalCandles(params);
        return result.report;
    }
}

module.exports = new BacktestEngine();