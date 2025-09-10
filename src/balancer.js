const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const serverPool = require('./serverPool');
const configManager = require('./configManager');
const { runSecurityChecks } = require('./middleware/security.js');

function getSessionId(requestData) {
    const headers = requestData.toString().split('\r\n');
    const cookieHeader = headers.find(h => h.startsWith('Cookie:'));
    if (cookieHeader) {
        const match = cookieHeader.match(/session=([^\s;]+)/);
        return match ? match[1] : null;
    }
    return null;
}

function getRuleForRequest(requestData) {
    const config = configManager.getConfig(); // Get latest config on every request
    const firstLine = requestData.toString().split('\r\n')[0];
    const path = firstLine.split(' ')[1] || '/';

    const rule = config.routingRules.find(r => path.startsWith(r.path));
    if (!rule) {
        return { pool: config.defaultPool };
    }
    return rule;
}

function startBalancer(initialConfig, tlsOptions, redisClient) {
    const server = tls.createServer(tlsOptions, clientSocket => {
        clientSocket.once('data', async (initialData) => {
            if (runSecurityChecks(clientSocket, initialData)) {
                return;
            }

            let backendServer;
            let isNewSession = false;
            const sessionId = getSessionId(initialData);
            const rule = getRuleForRequest(initialData);

            if (sessionId) {
                try {
                    const serverId = await redisClient.get(`session:${sessionId}`);
                    if (serverId) {
                        backendServer = serverPool.getServerById(serverId);
                    }
                } catch (err) {
                    console.error("Redis error getting session:", err);
                }
            }

            if (!backendServer) {
                backendServer = serverPool.getNextServer(rule);
                isNewSession = true;
            }

            if (!backendServer) {
                console.error(`[CRITICAL] No healthy backend servers available for rule matching path.`);
                clientSocket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
                return;
            }

            const poolName = Object.keys(serverPool.getPools()).find(pName => 
                serverPool.getPools()[pName].servers.some(s => s.id === backendServer.id)
            );

            if (poolName) {
                serverPool.incrementRequestCount(poolName);
            }
            serverPool.incrementServerRequestCount(backendServer.id);

            const backendSocket = net.connect({
                port: backendServer.url.port,
                host: backendServer.url.hostname,
            });

            serverPool.incrementConnections(backendServer.url);

            if (isNewSession) {
                const newSessionId = crypto.randomBytes(16).toString('hex');
                try {
                    await redisClient.set(`session:${newSessionId}`, backendServer.id, { EX: 3600 });
                    let firstChunk = true;
                    backendSocket.on('data', responseData => {
                        if (firstChunk) {
                            let responseStr = responseData.toString();
                            const cookieHeader = `Set-Cookie: session=${newSessionId}; HttpOnly; Path=/; Secure`;
                            responseStr = responseStr.replace(/(\r\n\r\n)/, `\r\n${cookieHeader}\r\n\r\n`);
                            clientSocket.write(responseStr);
                            firstChunk = false;
                        } else {
                            clientSocket.write(responseData);
                        }
                    });
                } catch (err) {
                     console.error("Redis error setting session:", err);
                     backendSocket.pipe(clientSocket);
                }
            } else {
                backendSocket.pipe(clientSocket);
            }

            backendSocket.write(initialData);
            clientSocket.pipe(backendSocket);

            const onSocketEnd = () => serverPool.decrementConnections(backendServer.url);
            clientSocket.on('close', onSocketEnd);
            backendSocket.on('close', onSocketEnd);
            clientSocket.on('error', (err) => { console.error('Client socket error:', err.message); });
            backendSocket.on('error', (err) => {
                console.error(`Error connecting to backend ${backendServer.url.href}:`, err.message);
                serverPool.setServerHealth(backendServer.url, false);
                clientSocket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            });
        });
    });

    server.listen(initialConfig.port, () => {
        console.log(`L7 Secure Load Balancer (w/ Weighted Routing) listening on port ${initialConfig.port}`);
    });

    return server;
}

module.exports = startBalancer;