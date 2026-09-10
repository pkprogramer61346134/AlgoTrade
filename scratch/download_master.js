const fs = require('fs');

async function downloadDhanMaster() {
    console.log("Fetching Dhan Scrip Master...");
    try {
        const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv');
        const text = await res.text();
        const lines = text.split('\n');
        console.log("Total lines in Dhan Master:", lines.length);
        console.log("Header:", lines[0]);
        
        // Find NIFTY index & options
        const niftyLines = lines.filter(l => l.includes('NIFTY') && (l.includes('23400') || l.includes('23500') || l.includes('23600')));
        console.log(`Found ${niftyLines.length} NIFTY strikes around 23400-23600`);
        console.log("Sample lines:");
        niftyLines.slice(0, 10).forEach(l => console.log(l));
    } catch (e) {
        console.error("Error downloading master:", e.message);
    }
}

downloadDhanMaster();
