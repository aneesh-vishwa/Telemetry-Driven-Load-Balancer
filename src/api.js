const express = require('express');
const path = require('path');
const serverPool = require('./serverPool');
const configManager = require('./configManager');

function startApiServer(port) {
    const app = express();
    app.use(express.json());

    const staticPath = path.join(__dirname, '..', 'public');
    app.use(express.static(staticPath));

    app.get('/', (req, res) => {
        res.sendFile(path.join(staticPath, 'dashboard.html'));
    });

    app.get('/traffic', (req, res) => {
        res.sendFile(path.join(staticPath, 'traffic-dashboard.html'));
    });

    // --- NEW ENDPOINT TO GET THE LIVE CONFIGURATION ---
    app.get('/api/config', (req, res) => {
        res.json(configManager.getConfig());
    });

    // --- NEW ENDPOINT TO UPDATE ROUTING RULES ---
    app.put('/api/routing-rules', (req, res) => {
        const { path, pools } = req.body;
        if (!path || !Array.isArray(pools)) {
            return res.status(400).send('Invalid request body. Requires "path" and "pools" array.');
        }
        const isValid = pools.every(p => typeof p.name === 'string' && typeof p.weight === 'number');
        if (!isValid) {
            return res.status(400).send('Each pool in the array must have a "name" (string) and "weight" (number).');
        }
        const success = configManager.updateRoutingRule(path, pools);
        if (success) {
            res.status(200).send(`Routing rule for ${path} updated successfully.`);
        } else {
            res.status(404).send(`Routing rule for path ${path} not found.`);
        }
    });

    app.get('/metrics', (req, res) => {
        res.json(serverPool.getMetrics());
    });

    app.get('/servers/metrics', (req, res) => {
        res.json(serverPool.getServerMetrics());
    });

    app.get('/pools', (req, res) => {
        res.json(serverPool.getPools());
    });

    app.post('/pools/:poolName/servers', (req, res) => {
        const { poolName } = req.params;
        const { serverUrl } = req.body;
        if (!serverUrl || typeof serverUrl !== 'string' || serverUrl.trim() === '') {
            return res.status(400).send('Invalid or missing serverUrl in request body');
        }
        try {
            const url = new URL(serverUrl);
            if (!url.hostname) { throw new Error('Hostname cannot be empty.'); }
        } catch (error) {
            return res.status(400).send(`Invalid URL format: ${error.message}`);
        }
        const success = serverPool.addServer(poolName, serverUrl);
        if (success) {
            res.status(201).send(`Server ${serverUrl} added to pool ${poolName}`);
        } else {
            res.status(404).send(`Pool not found or server already exists.`);
        }
    });

    app.delete('/pools/:poolName/servers/:serverId', (req, res) => {
        const { poolName, serverId } = req.params;
        const decodedServerId = Buffer.from(serverId, 'base64').toString('ascii');
        const success = serverPool.removeServer(poolName, decodedServerId);
        if (success) {
            res.status(200).send(`Server ${decodedServerId} removed from pool ${poolName}`);
        } else {
            res.status(404).send(`Pool ${poolName} or server ${decodedServerId} not found.`);
        }
    });

    app.listen(port, () => {
        console.log(` Control Plane API & Dashboard running on http://localhost:${port}`);
    });
}

module.exports = { startApiServer };