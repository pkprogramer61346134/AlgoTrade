const NSEData = require('openchart-js');
const moment = require('moment');

async function main() {
    const nse = new NSEData();

    // Download master data for NSE and NFO
    await nse.download();

    // Define the start and end dates (last 30 days)
    const endDate = moment();
    const startDate = moment().subtract(30, 'days');

    // Fetch 5-minute historical data for RELIANCE
    const data = await nse.historical(
        'RELIANCE',
        'NSE',
        startDate.toDate(),
        endDate.toDate(),
        '5m'
    );

    // Display the fetched data
    if (data.length > 0) {
        console.log("5-minute historical data for RELIANCE (Last 30 days):");
        console.log(data);
    } else {
        console.log("No data available for RELIANCE for the specified time period.");
    }
}

main().catch(console.error);