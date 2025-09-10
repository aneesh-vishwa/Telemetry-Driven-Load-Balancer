const path = require('path');
// Load environment variables from .env file FIRST
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const fs = require('fs');
const configManager = require('./src/configManager');
const { createRedisClient } = require('./src/redisClient');
const startBalancer = require('./src/balancer');
const { startHealthChecks } = require('./src/healthCheck');
const { startApiServer } = require('./src/api');
const serverPool = require('./src/serverPool');
const connectDB = require('./src/database');

// --- Connect to Database ---
connectDB();


// --- Step 1: Initialize Redis Client ---
const redisClient = createRedisClient();
redisClient.connect().catch(console.error);

// --- Step 2: Load Configuration ---
const config = configManager.loadConfig();
config.port = process.env.PORT || 8443;
config.apiPort = process.env.API_PORT || 9000;

const tlsOptions = {
    key: fs.readFileSync(process.env.TLS_KEY_PATH),
    cert: fs.readFileSync(process.env.TLS_CERT_PATH)
};

// --- Step 3: Initialize Core State FIRST ---
serverPool.initializePools(config);
console.log('Server pools initialized.');

// --- Step 4: Start All Services ---
const server = startBalancer(config, tlsOptions, redisClient);
startHealthChecks();
startApiServer(config.apiPort);

// Graceful shutdown logic
async function gracefulShutdown() {
    console.log('\nSIGINT received. Shutting down gracefully...');
    await redisClient.quit();
    console.log('Redis client disconnected.');
    server.close(() => {
        console.log('All connections closed. Exiting.');
        process.exit(0);
    });
    // Optional: add a timeout to force exit if connections hang
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', gracefulShutdown);