const fs = require('fs');

let config = null;

function loadConfig() {
    if (!config) {
        // Load the initial config from the file
        config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        console.log('Initial configuration loaded.');
    }
    return config;
}

function getConfig() {
    return config;
}

function updateRoutingRule(path, newPools) {
    if (!config) return false;

    const rule = config.routingRules.find(r => r.path === path);
    if (rule) {
        rule.pools = newPools;
        console.log(`Updated routing rule for path '${path}' to:`, newPools);
        return true;
    }
    return false;
}

module.exports = {
    loadConfig,
    getConfig,
    updateRoutingRule,
};