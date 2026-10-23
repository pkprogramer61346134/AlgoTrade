const axios = require('axios');
const moment = require('moment');

class NSEData {
    constructor() {
        this.session = axios.create({
            headers: {
                'Connection': 'keep-alive',
                'Cache-Control': 'max-age=0',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Content-Type': 'application/json',
                'Sec-Fetch-User': '?1',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Mode': 'navigate'
            }
        });
        this.nseUrl = "https://charting.nseindia.com/Charts/GetEQMasters";
        this.nfoUrl = "https://charting.nseindia.com/Charts/GetFOMasters";
        this.historicalUrl = "https://charting.nseindia.com//Charts/symbolhistoricaldata/";
        this.nseData = null;
        this.nfoData = null;
    }

    async download() {
        try {
            this.nseData = await this._fetchMasterData(this.nseUrl);
            this.nfoData = await this._fetchMasterData(this.nfoUrl);
            console.log(`NSE data shape: ${this.nseData.length}`);
            console.log(`NFO data shape: ${this.nfoData.length}`);
            console.log("NSE and NFO data downloaded successfully.");
        } catch (error) {
            console.error("Failed to download data:", error);
        }
    }

    async _fetchMasterData(url) {
        try {
            const response = await this.session.get(url);
            const data = response.data.split('\n');
            const columns = ['ScripCode', 'Symbol', 'Name', 'Type'];
            return data.map(line => {
                const values = line.split('|');
                return columns.reduce((obj, key, index) => {
                    obj[key] = values[index];
                    return obj;
                }, {});
            });
        } catch (error) {
            console.error(`Failed to download data from ${url}:`, error);
            return [];
        }
    }

    symbolsearch(symbol, exchange) {
        const df = exchange.toUpperCase() === 'NSE' ? this.nseData : this.nfoData;
        if (!df) {
            console.log(`Data for ${exchange} not downloaded. Please run download() first.`);
            return null;
        }
        const result = df.find(row => row.Symbol.toLowerCase().includes(symbol.toLowerCase()));
        if (!result) {
            console.log(`No matching result found for symbol '${symbol}' in ${exchange}.`);
            return null;
        }
        return result;
    }

    search(symbol, exchange, exactMatch = false) {
        exchange = exchange.toUpperCase();
        const df = exchange === 'NSE' ? this.nseData : (exchange === 'NFO' ? this.nfoData : null);

        if (!df) {
            console.log(`Invalid exchange '${exchange}' or data not downloaded. Please choose 'NSE' or 'NFO' and run download() first.`);
            return [];
        }

        let result;
        if (exactMatch) {
            result = df.filter(row => row.Symbol.toUpperCase() === symbol.toUpperCase());
        } else {
            result = df.filter(row => row.Symbol.toLowerCase().includes(symbol.toLowerCase()));
        }

        if (result.length === 0) {
            console.log(`No matching result found for symbol '${symbol}' in ${exchange}.`);
        }

        return result;
    }

    async historical(symbol = "Nifty 50", exchange = "NSE", start = null, end = null, interval = '1d') {
        const symbolInfo = this.symbolsearch(symbol, exchange);
        if (!symbolInfo) {
            return [];
        }

        const intervalMap = {
            '1m': ['1', 'I'], '3m': ['3', 'I'], '5m': ['5', 'I'], '10m': ['10', 'I'],
            '15m': ['15', 'I'], '30m': ['30', 'I'], '1h': ['60', 'I'],
            '1d': ['1', 'D'], '1w': ['1', 'W'], '1M': ['1', 'M']
        };

        const [timeInterval, chartPeriod] = intervalMap[interval] || ['1', 'D'];

        const payload = {
            exch: exchange.toUpperCase() === "NSE" ? "N" : "D",
            instrType: exchange.toUpperCase() === "NSE" ? "C" : "D",
            scripCode: parseInt(symbolInfo.ScripCode),
            ulToken: parseInt(symbolInfo.ScripCode),
            fromDate: start ? moment(start).unix() : 0,
            toDate: end ? moment(end).unix() : moment().unix(),
            timeInterval: timeInterval,
            chartPeriod: chartPeriod,
            chartStart: 0
        };

        try {
            await this.session.get("https://www.nseindia.com");
            const response = await this.session.post(this.historicalUrl, payload);
            const data = response.data;

            if (!data || data.length === 0) {
                console.log("No data received from the API.");
                return [];
            }

            return processHistoricalData(data, interval);
        } catch (error) {
            console.error("An error occurred while fetching historical data:", error);
            return [];
        }
    }

    timeframes() {
        return ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '1d', '1w', '1M'];
    }
}

module.exports = NSEData;