const http = require('http');

function postJSON(urlPath, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: urlPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function testSimAPI() {
    console.log("Testing /api/simulator endpoints...");
    const initData = await postJSON('/api/simulator/init', { date: '2026-09-04', initialCapital: 10000 });
    console.log("Init API response:", { success: initData.success, targetDate: initData.targetDate, candleCount: initData.dayCandles?.length });

    if (initData.success && initData.dayIndices?.length > 0) {
        const stepData = await postJSON('/api/simulator/step', {
            targetDate: '2026-09-04',
            globalIndex: initData.dayIndices[0],
            runningCapital: 10000,
            activeTrade: null,
            dailyTradeCount: 0
        });
        console.log("Step API response for candle 1:", {
            success: stepData.success,
            timeStr: stepData.timeStr,
            candle: stepData.candle,
            consensusType: stepData.consensusResult?.type,
            consensusVotes: stepData.consensusResult?.consensusVotes || stepData.consensusResult?.buyVotes
        });
    }
}

testSimAPI().catch(err => console.error(err));
