const fs = require('fs');
const path = require('path');

const JOURNAL_FILE_PATH = path.join(__dirname, 'paper_journal.json');

/**
 * PAPER JOURNAL MANAGER
 * 
 * Class responsible for:
 * 1. Loading persisted paper trading data from paper_journal.json.
 * 2. Saving virtual balance, daily trade summary, and closed trade history records.
 * 3. Providing persistence across restarts for Paper Trading Engine.
 */
class PaperJournal {
    /**
     * @param {string} [filePath=JOURNAL_FILE_PATH] - Path to paper_journal.json file
     */
    constructor(filePath = JOURNAL_FILE_PATH) {
        this.filePath = filePath;
    }

    /**
     * Loads paper trading state from JSON file or returns default initial state
     * 
     * @param {number} [defaultBalance=10000.0] - Default virtual balance if file missing
     * @returns {Object} { virtualBalance, todaySummary, tradeHistory, lastUpdated }
     */
    loadJournal(defaultBalance = 10000.0) {
        try {
            if (fs.existsSync(this.filePath)) {
                const rawData = fs.readFileSync(this.filePath, 'utf8');
                const data = JSON.parse(rawData);
                console.log(`📖 [PAPER JOURNAL] Loaded Journal History: Balance ₹${data.virtualBalance || defaultBalance} | Trades Today: ${data.tradeHistory?.length || 0}`);
                return {
                    virtualBalance: Number(data.virtualBalance !== undefined ? data.virtualBalance : defaultBalance),
                    todaySummary: data.todaySummary || { totalTrades: 0, wins: 0, losses: 0, realizedPnl: 0.0 },
                    tradeHistory: Array.isArray(data.tradeHistory) ? data.tradeHistory : [],
                    lastUpdated: data.lastUpdated || new Date().toISOString()
                };
            }
        } catch (err) {
            console.warn(`⚠️ [PAPER JOURNAL] Failed to load journal file (${err.message}). Using default initial state.`);
        }

        return {
            virtualBalance: defaultBalance,
            todaySummary: { totalTrades: 0, wins: 0, losses: 0, realizedPnl: 0.0 },
            tradeHistory: [],
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Persists paper trading state to JSON file
     * 
     * @param {number} virtualBalance - Current virtual balance
     * @param {Object} todaySummary - Summary object { totalTrades, wins, losses, realizedPnl }
     * @param {Array} tradeHistory - Array of closed trade objects
     */
    saveJournal(virtualBalance, todaySummary, tradeHistory) {
        try {
            const journalData = {
                virtualBalance: Number(virtualBalance.toFixed(2)),
                todaySummary: {
                    totalTrades: Number(todaySummary.totalTrades || 0),
                    wins: Number(todaySummary.wins || 0),
                    losses: Number(todaySummary.losses || 0),
                    realizedPnl: Number((todaySummary.realizedPnl || 0).toFixed(2))
                },
                tradeHistory: Array.isArray(tradeHistory) ? tradeHistory : [],
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(this.filePath, JSON.stringify(journalData, null, 2), 'utf8');
            console.log(`💾 [PAPER JOURNAL] Journal saved successfully! Balance: ₹${journalData.virtualBalance} | Total Saved Trades: ${journalData.tradeHistory.length}`);
            return journalData;
        } catch (err) {
            console.error(`❌ [PAPER JOURNAL ERROR] Failed to save journal: ${err.message}`);
            return null;
        }
    }

    /**
     * Appends closed trade record and auto-saves to JSON file
     * 
     * @param {Object} closedRecord - Closed trade details
     * @param {number} virtualBalance - Updated virtual balance
     * @param {Object} todaySummary - Updated summary
     * @param {Array} tradeHistory - Trade history array
     */
    addClosedTrade(closedRecord, virtualBalance, todaySummary, tradeHistory) {
        if (closedRecord && !tradeHistory.includes(closedRecord)) {
            tradeHistory.push(closedRecord);
        }
        return this.saveJournal(virtualBalance, todaySummary, tradeHistory);
    }
}

module.exports = PaperJournal;
