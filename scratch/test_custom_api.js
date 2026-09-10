const http = require('http');

function testApi(strategyId, startDate, endDate) {
    return new Promise((resolve) => {
        console.log(`\n==================================================`);
        console.log(`🧪 TESTING NEW STRATEGY (${strategyId}): ${startDate} to ${endDate}`);
        console.log(`==================================================`);

        const postData = JSON.stringify({
            strategyId: strategyId,
            startDate: startDate,
            endDate: endDate,
            initialCapital: 2660,
            riskRewardRatio: 1.5,
            capitalUsagePct: 100
        });

        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/custom-backtest',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    console.log(`Response Payload:`, data);
                } catch (e) {
                    console.error('Parse error:', e.message, body);
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Request error: ${e.message}`);
            resolve();
        });

        req.write(postData);
        req.end();
    });
}

async function run() {
    await testApi('orb_intraday_active', '09/01/2026', '09/09/2026');
}

run();
