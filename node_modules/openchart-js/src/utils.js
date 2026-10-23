const moment = require('moment');

function processHistoricalData(data, interval) {
    const df = data.map(row => ({
        Timestamp: moment.unix(row[1]).toDate(),
        Open: parseFloat(row[2]),
        High: parseFloat(row[3]),
        Low: parseFloat(row[4]),
        Close: parseFloat(row[5]),
        Volume: parseInt(row[6])
    }));

    const intradayIntervals = ['1m', '3m', '5m', '10m', '15m', '30m', '1h'];
    if (intradayIntervals.includes(interval)) {
        const cutoffTime = moment().set({ hour: 15, minute: 29, second: 59 }).toDate();
        return df.filter(row => row.Timestamp <= cutoffTime);
    }

    return df;
}

module.exports = {
    processHistoricalData
};