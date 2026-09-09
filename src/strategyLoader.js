const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'strategies_config');

/**
 * Dynamically scans strategies_config directory and loads all .json strategy files
 */
function loadAllStrategiesFromJSON(configDir = CONFIG_DIR) {
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        return [];
    }

    const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
    const strategies = [];

    for (const file of files) {
        const filePath = path.join(configDir, file);
        try {
            const rawContent = fs.readFileSync(filePath, 'utf-8');
            const config = JSON.parse(rawContent);

            if (config && config.enabled !== false) {
                config.configFile = file;
                strategies.push(config);
            }
        } catch (e) {
            console.warn(`⚠️ Error reading strategy JSON [${file}]: ${e.message}`);
        }
    }

    return strategies;
}

module.exports = {
    loadAllStrategiesFromJSON,
    CONFIG_DIR
};
