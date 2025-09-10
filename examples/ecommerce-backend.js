const http = require('http');

// Define our realistic API endpoints and their logic
const handleRequest = (req, res, port) => {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        // Homepage Route
        if (req.url === '/' && req.method === 'GET') {
            console.log(`[Port ${port} - Web Server]: Serving homepage.`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Welcome! (Served by Web Server on port ${port})`);
            return;
        }

        // Search API Route
        if (req.url.startsWith('/api/search') && req.method === 'GET') {
            console.log(`[Port ${port} - API Server]: Handling product search.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                results: ['Product A', 'Product B'],
                server: port
            }));
            return;
        }
        
        // Cart API Route
        if (req.url === '/api/cart' && req.method === 'POST') {
            console.log(`[Port ${port} - API Server]: Adding item to cart.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: `Item added by server on port ${port}`
            }));
            return;
        }

        // Not Found
        console.log(`[Port ${port}]: 404 Not Found for ${req.method} ${req.url}`);
        res.writeHead(404);
        res.end('Not Found');
    });
};

// Start servers on the same ports as your config.json
const ports = [3001, 3002, 3003];
ports.forEach(port => {
    const server = http.createServer((req, res) => handleRequest(req, res, port));
    server.listen(port, () => {
        // Assign roles based on your config.json for clearer logging
        const serverType = (port === 3003) ? "Web Server" : "API Server";
        console.log(`E-commerce Backend (${serverType}) running on http://localhost:${port}`);
    });
});