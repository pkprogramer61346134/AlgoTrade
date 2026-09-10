const fs = require('fs');

async function parseCurrentExpiries() {
    console.log("Analyzing Dhan Scrip Master for NIFTY options...");
    const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv');
    const text = await res.text();
    const lines = text.split('\n');
    
    // Filter NIFTY OPTIDX lines
    const niftyOptLines = lines.filter(l => l.includes('NSE,D,') && l.includes('OPTIDX') && l.includes('NIFTY'));
    
    // Extract unique expiries
    const expiries = new Set();
    const records = [];

    for (const line of niftyOptLines) {
        const parts = line.split(',');
        if (parts.length >= 12) {
            const secId = parts[2];
            const symbol = parts[5];
            const customSymbol = parts[7];
            const expiryDate = parts[8];
            const strike = parseFloat(parts[9]);
            const optionType = parts[10];

            if (expiryDate) {
                const dateOnly = expiryDate.split(' ')[0];
                expiries.add(dateOnly);
                records.push({ secId, symbol, customSymbol, expiryDate: dateOnly, strike, optionType });
            }
        }
    }

    const sortedExpiries = Array.from(expiries).sort();
    console.log("Available NIFTY Option Expiries in Dhan Master:", sortedExpiries);

    // Pick nearest expiry
    const nearestExpiry = sortedExpiries[0];
    console.log(`\nNearest Expiry: ${nearestExpiry}`);

    // Find strikes near 23450 for nearest expiry
    const nearStrikes = records.filter(r => r.expiryDate === nearestExpiry && Math.abs(r.strike - 23450) <= 500);
    console.log(`Found ${nearStrikes.length} strikes near 23450 for ${nearestExpiry}:`);
    nearStrikes.forEach(r => console.log(`Strike ${r.strike} ${r.optionType} | SecID: ${r.secId} | Symbol: ${r.symbol} | ${r.customSymbol}`));
}

parseCurrentExpiries();
