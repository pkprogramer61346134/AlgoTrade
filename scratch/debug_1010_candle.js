const fs = require('fs');
const path = require('path');
const { prepareJSONStrategyData } = require('../src/dynamicStrategyEngine');
const { evaluateConsensusEngine } = require('../src/consensusEngine');

const candles = JSON.parse(fs.readFileSync(path.join(__dirname, '../candle_data/NIFTY_50_5_2026-09-22_2026-09-22.json'), 'utf8'));
const stratPath = path.join(__dirname, '../strategies_config/consensus_master_head.json');
const strategyConfig = JSON.parse(fs.readFileSync(stratPath, 'utf8'));

console.log("Strategy Config:", strategyConfig);

for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.time >= "09:50" && c.time <= "10:35") {
        const sliced = candles.slice(0, i + 1);
        const data = prepareJSONStrategyData(sliced, strategyConfig);
        const result = evaluateConsensusEngine(sliced, i, strategyConfig, data, {});
        
        console.log(`\n================ Candle ${c.time} (O: ${c.open}, H: ${c.high}, L: ${c.low}, C: ${c.close}, Vol: ${c.volume}) ================`);
        console.log(`Signal: ${result.type} | Buy Votes: ${result.buyVotes} | Sell Votes: ${result.sellVotes}`);
        console.log(`Reasoning: ${result.reasoning}`);
        if (result.engineVotes) {
            console.log("Engine Breakdown:");
            result.engineVotes.forEach(e => {
                console.log(`  Engine ${e.id} (${e.name}): ${e.vote} [${e.signal}] => ${e.reason}`);
            });
        }
    }
}
