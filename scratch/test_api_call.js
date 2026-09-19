async function testApi() {
    const res = await fetch('http://localhost:3000/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            startDate: '2026-08-01',
            endDate: '0001-08-31', // Testing auto-correction of corrupt year 0001
            initialCapital: 100000
        })
    });
    const json = await res.json();
    console.log("API CALL SUCCESS:", json.success);
    console.log("Auto-Corrected Date Report Summary:", {
        startDate: json.report.startDate,
        endDate: json.report.endDate,
        netPnL: json.report.netPnL,
        winRate: json.report.winRate,
        totalTrades: json.report.totalTrades,
        finalCapital: json.report.finalCapital
    });
}

testApi().catch(console.error);
