import express from 'express';
import { WebSocketServer } from 'ws';
export declare class FoundryRelayServer {
    private app;
    private server;
    private wss;
    private apiKeyManager;
    private webSocketHandler;
    private cleanupInterval;
    constructor();
    private setupMiddleware;
    private setupRoutes;
    start(): Promise<void>;
    stop(): Promise<void>;
    getApp(): express.Application;
    getWebSocketServer(): WebSocketServer | undefined;
}
//# sourceMappingURL=server.d.ts.map