const fs = require('fs');

// --- NEW: Globally disable certificate validation for this script ---
// This is for local development only and should not be used in production.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// --- Configuration ---
const config = {
    userCount: 100,
    loadBalancerUrl: 'https://localhost:8443',
    logFile: 'simulation.log',
};

// --- Logger ---
fs.writeFileSync(config.logFile, `--- Live Simulation Log (Stable Load) ---\n`);
const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    fs.appendFileSync(config.logFile, logMessage);
    process.stdout.write(logMessage);
};

// --- User Actions (No 'agent' needed in fetch calls) ---
const actions = {
    async visitHomepage(userId) {
        log(`User-${userId}: Visiting homepage (/)`);
        await fetch(`${config.loadBalancerUrl}/`);
    },
    async searchProducts(userId) {
        log(`User-${userId}: Searching for products (/api/search)`);
        await fetch(`${config.loadBalancerUrl}/api/search?q=laptops`);
    },
    async addToCart(userId) {
        log(`User-${userId}: Adding item to cart (/api/cart)`);
        await fetch(`${config.loadBalancerUrl}/api/cart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: 'abc-456' }),
        });
    },
};

// --- The User Simulation ---
class User {
    constructor(id) {
        this.id = id;
        this.run();
    }

    async run() {
        while (true) {
            try {
                const randomAction = Math.random();
                if (randomAction < 0.5) {
                    await actions.visitHomepage(this.id);
                } else if (randomAction < 0.85) {
                    await actions.searchProducts(this.id);
                } else {
                    await actions.addToCart(this.id);
                }
            } catch (error) {
                // Now, the error will be more specific if it's not a cert issue
                log(`User-${this.id}: ERROR - ${error.message}`);
            }
            const randomDelay = 1000 + Math.random() * 2000;
            await new Promise(resolve => setTimeout(resolve, randomDelay));
        }
    }
}

// --- Main ---
log(`Starting STABLE simulation with ${config.userCount} concurrent users.`);
log(`All actions will be logged to ${config.logFile}`);
console.log("-------------------------------------------------");

for (let i = 1; i <= config.userCount; i++) {
    new User(i);
}