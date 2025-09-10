const redis = require('redis');

let client = null;

function createRedisClient() {
    if (client) {
        return client;
    }

    client = redis.createClient({
        url: process.env.REDIS_URL
    });

    client.on('connect', () => console.log('Connected to Redis successfully!'));
    client.on('error', (err) => console.error('Redis Client Error', err));

    return client;
}

module.exports = { createRedisClient };