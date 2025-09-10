const { URL } = require("url");

let pools = {};
let defaultPoolName = "";

// Helper function, defined at the top-level for broad access within the module.
function findServer(url) {
  for (const poolName in pools) {
    const server = pools[poolName].servers.find((s) => s.url.href === url.href);
    if (server) return server;
  }
  return null;
}

function initializePools(config) {
  defaultPoolName = config.defaultPool;
  config.serverPools.forEach((poolConfig) => {
    const servers = poolConfig.servers.map((s) => {
      const url = new URL(s);
      return {
        url,
        id: `${url.hostname}:${url.port}`,
        healthy: true,
        connections: 0,
        requests: 0,
      };
    });
    pools[poolConfig.name] = { servers, requests: 0 };
  });
}

function incrementRequestCount(poolName) {
  if (pools[poolName]) {
    pools[poolName].requests++;
  }
}

function incrementServerRequestCount(serverId) {
  for (const poolName in pools) {
    const server = pools[poolName].servers.find((s) => s.id === serverId);
    if (server) {
      server.requests++;
      return;
    }
  }
}

function getServerMetrics() {
  const serverMetrics = [];
  for (const poolName in pools) {
    pools[poolName].servers.forEach((server) => {
      serverMetrics.push({
        id: server.id,
        requests: server.requests,
        healthy: server.healthy,
      });
    });
  }
  return serverMetrics;
}

function setServerHealth(url, isHealthy) {
  const server = findServer(url);
  if (server) {
    const statusChanged = server.healthy !== isHealthy;
    server.healthy = isHealthy;
    if (statusChanged) {
      console.log(
        `Server ${url.href} is now ${isHealthy ? "healthy" : "unhealthy"}.`
      );
    }
  }
}

function incrementConnections(serverUrl) {
  const server = findServer(serverUrl);
  if (server) server.connections++;
}

function decrementConnections(serverUrl) {
  const server = findServer(serverUrl);
  if (server) server.connections = Math.max(0, server.connections - 1);
}

// Helper function to find the server with the minimum requests in a given list
function getLeastBusyServer(servers) {
    let bestServer = null;
    let minRequests = Infinity;

    servers.forEach((server) => {
        if (server.healthy && server.requests < minRequests) {
            minRequests = server.requests;
            bestServer = server;
        }
    });

    return bestServer;
}

// NEW weighted load balancing function
function getNextServer(rule) {
  // If the rule points to a single, simple pool name (for backward compatibility or default rule)
  if (rule.pool) {
    const pool = pools[rule.pool];
    if (!pool) return null;
    return getLeastBusyServer(pool.servers);
  }

  // New weighted logic
  if (rule.pools) {
    const totalWeight = rule.pools.reduce((sum, p) => sum + p.weight, 0);
    let randomNum = Math.random() * totalWeight;

    let chosenPoolName;
    for (const poolInfo of rule.pools) {
      // Find healthy servers in this pool before considering it
      const healthyServers = pools[poolInfo.name]?.servers.filter(s => s.healthy);
      if (!healthyServers || healthyServers.length === 0) {
        continue; // Skip this pool if it has no healthy servers
      }

      randomNum -= poolInfo.weight;
      if (randomNum <= 0) {
        chosenPoolName = poolInfo.name;
        break;
      }
    }
    
    // Fallback in case random selection fails (e.g., all pools in rule are unhealthy)
    if (!chosenPoolName) return null; 

    const chosenPool = pools[chosenPoolName];
    if (!chosenPool) return null;

    return getLeastBusyServer(chosenPool.servers);
  }

  return null;
}

module.exports = {
  initializePools,
  incrementRequestCount,
  getMetrics: () => {
    const metrics = {};
    for (const poolName in pools) {
      metrics[poolName] = pools[poolName].requests || 0;
    }
    return metrics;
  },
  incrementServerRequestCount,
  getServerMetrics,
  getServerById: (serverId) => {
    for (const poolName in pools) {
      const server = pools[poolName].servers.find((s) => s.id === serverId);
      if (server && server.healthy) return server;
    }
    return null;
  },
  getNextServer,
  addServer: (poolName, serverUrl) => {
    const pool = pools[poolName];
    if (!pool) return false;
    const url = new URL(serverUrl);
    const serverId = `${url.hostname}:${url.port}`;
    if (pool.servers.some((s) => s.id === serverId)) return false;
    pool.servers.push({
      url,
      id: serverId,
      healthy: true,
      connections: 0,
      requests: 0,
    });
    console.log(`Dynamically added server ${serverId} to pool ${poolName}`);
    return true;
  },
  removeServer: (poolName, serverId) => {
    const pool = pools[poolName];
    if (!pool) return false;
    const serverIndex = pool.servers.findIndex((s) => s.id === serverId);
    if (serverIndex === -1) return false;
    pool.servers.splice(serverIndex, 1);
    console.log(`Dynamically removed server ${serverId} from pool ${poolName}`);
    return true;
  },
  setServerHealth,
  getPools: () => pools,
  incrementConnections,
  decrementConnections,
};