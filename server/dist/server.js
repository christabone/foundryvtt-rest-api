"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FoundryRelayServer = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const http_1 = require("http");
const enhancedApiKeyManager_1 = require("./auth/enhancedApiKeyManager");
const webSocketHandler_1 = require("./websocket/webSocketHandler");
const restApiRouter_1 = require("./routes/restApiRouter");
const PORT = process.env.PORT || 3001;
// const WS_PORT = process.env.WS_PORT || 3001; // Unused for now
class FoundryRelayServer {
    constructor() {
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.apiKeyManager = new enhancedApiKeyManager_1.EnhancedApiKeyManager();
        this.webSocketHandler = new webSocketHandler_1.WebSocketHandler(this.apiKeyManager);
        this.setupRoutes();
    }
    setupMiddleware() {
        // Enable CORS for all routes
        this.app.use((0, cors_1.default)({
            origin: true, // Allow all origins for development
            credentials: true
        }));
        // Parse JSON bodies
        this.app.use(express_1.default.json({ limit: '10mb' }));
        // Parse URL-encoded bodies
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        // Request logging middleware
        this.app.use((req, _res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
            next();
        });
    }
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (_req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                websocket: this.wss ? 'connected' : 'disconnected'
            });
        });
        // API documentation endpoint
        this.app.get('/api/docs', (_req, res) => {
            res.json({
                message: 'FoundryVTT Local Relay Server API',
                version: '1.0.0',
                endpoints: [
                    { path: '/health', description: 'Server health check' },
                    { path: '/api/docs', description: 'API documentation' },
                    { path: '/api/search', description: 'Search FoundryVTT entities' },
                    { path: '/api/entity/:uuid', description: 'Get entity by UUID' },
                    { path: '/api/roll', description: 'Perform dice rolls' },
                    { path: '/ws', description: 'WebSocket connection endpoint' }
                ]
            });
        });
        // Set up REST API routes
        const restRouter = new restApiRouter_1.RestApiRouter(this.webSocketHandler, this.apiKeyManager);
        this.app.use('/api', restRouter.getRouter());
        // 404 handler
        this.app.use('*', (_req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
        // Error handler
        this.app.use((err, _req, res, _next) => {
            console.error('Server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }
    async start() {
        try {
            // Create HTTP server
            this.server = (0, http_1.createServer)(this.app);
            // Set up WebSocket server
            this.wss = new ws_1.WebSocketServer({
                server: this.server,
                path: '/ws'
            });
            // Handle WebSocket connections
            this.wss.on('connection', (ws, request) => {
                this.webSocketHandler.handleConnection(ws, request);
            });
            // Set up periodic cleanup of expired requests
            this.cleanupInterval = setInterval(() => {
                this.webSocketHandler.cleanupExpiredRequests();
            }, 30000); // Clean up every 30 seconds
            // Start server
            await new Promise((resolve, reject) => {
                this.server.listen(PORT, (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        console.log(`🚀 FoundryVTT Local Relay Server started on port ${PORT}`);
                        console.log(`📡 WebSocket server available at ws://localhost:${PORT}/ws`);
                        console.log(`🌐 REST API available at http://localhost:${PORT}/api`);
                        console.log(`❤️ Health check at http://localhost:${PORT}/health`);
                        console.log(`🔧 Periodic cleanup enabled (30s intervals)`);
                        resolve();
                    }
                });
            });
        }
        catch (error) {
            console.error('Failed to start server:', error);
            throw error;
        }
    }
    async stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        if (this.wss) {
            this.wss.close();
        }
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => {
                    console.log('🛑 Server stopped');
                    resolve();
                });
            });
        }
    }
    getApp() {
        return this.app;
    }
    getWebSocketServer() {
        return this.wss;
    }
}
exports.FoundryRelayServer = FoundryRelayServer;
// Start server if this file is run directly
if (require.main === module) {
    const server = new FoundryRelayServer();
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        await server.stop();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully...');
        await server.stop();
        process.exit(0);
    });
    server.start().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map