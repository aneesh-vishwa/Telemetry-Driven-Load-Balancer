const http = require('http');

// --- We copy the request handler from ecommerce-backend.js ---
const handleRequest = (req, res, port) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        if (req.url === '/' && req.method === 'GET') {
            console.log(`[Port ${port} - Web Server]: Serving homepage.`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Welcome! (Served by Web Server on port ${port})`);
            return;
        }
        if (req.url.startsWith('/api/search') && req.method === 'GET') {
            console.log(`[Port ${port} - API Server]: Handling product search.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ results: ['Product A', 'Product B'], server: port }));
            return;
        }
        if (req.url === '/api/cart' && req.method === 'POST') {
            console.log(`[Port ${port} - API Server]: Adding item to cart.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Item added by server on port ${port}` }));
            return;
        }
        res.writeHead(404);
        res.end('Not Found');
    });
};

// --- Get port from the command line argument ---
const port = process.argv[2];
if (!port) {
    console.error('Error: Please provide a port number. Usage: node single-server.js <PORT>');
    process.exit(1);
}

const server = http.createServer((req, res) => handleRequest(req, res, port));
server.listen(port, () => {
    console.log(` Single E-commerce Backend (API Server) running on http://localhost:${port}`);
});