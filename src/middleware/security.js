// NOTE: For production, this in-memory store should be replaced with Redis
// to share state across multiple load balancer instances.
const requestCounts = {};
const BANNED_PATTERNS = [
    /<script>/i,
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i, // Basic SQL Injection
    /(\.\.\/)/i // Directory Traversal
];
const RATE_LIMIT_THRESHOLD = 200; // requests
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in ms

function runSecurityChecks(clientSocket, initialData) {
    const clientIp = clientSocket.remoteAddress;

    // 1. Rate Limiting Check
    const now = Date.now();
    const userHistory = requestCounts[clientIp] || { count: 0, startTime: now };

    if (now - userHistory.startTime > RATE_LIMIT_WINDOW) {
        // Reset window
        userHistory.startTime = now;
        userHistory.count = 1;
    } else {
        userHistory.count++;
    }

    requestCounts[clientIp] = userHistory;

    if (userHistory.count > RATE_LIMIT_THRESHOLD) {
        console.warn(`[SECURITY] Rate limit exceeded for IP: ${clientIp}`);
        clientSocket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        return true; // Block request
    }

    // 2. Malicious Pattern Check
    const requestString = initialData.toString();
    for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(requestString)) {
            console.warn(`[SECURITY] Malicious pattern detected from IP: ${clientIp}`);
            clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return true; // Block request
        }
    }

    return false; // Request is clean
}

module.exports = { runSecurityChecks };