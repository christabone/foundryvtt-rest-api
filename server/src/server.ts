import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { EnhancedApiKeyManager } from './auth/enhancedApiKeyManager';
import { WebSocketHandler } from './websocket/webSocketHandler';
import { RestApiRouter } from './routes/restApiRouter';

const PORT = process.env.PORT || 3001;
// const WS_PORT = process.env.WS_PORT || 3001; // Unused for now

export class FoundryRelayServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer | undefined;
  private apiKeyManager: EnhancedApiKeyManager;
  private webSocketHandler: WebSocketHandler;
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.apiKeyManager = new EnhancedApiKeyManager();
    this.webSocketHandler = new WebSocketHandler(this.apiKeyManager);
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Enable CORS for all routes
    this.app.use(cors({
      origin: true, // Allow all origins for development
      credentials: true
    }));

    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
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
    const restRouter = new RestApiRouter(this.webSocketHandler, this.apiKeyManager);
    this.app.use('/api', restRouter.getRouter());

    // 404 handler
    this.app.use('*', (_req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  public async start(): Promise<void> {
    try {
      // Create HTTP server
      this.server = createServer(this.app);

      // Set up WebSocket server
      this.wss = new WebSocketServer({ 
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
      await new Promise<void>((resolve, reject) => {
        this.server.listen(PORT, (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🚀 FoundryVTT Local Relay Server started on port ${PORT}`);
            console.log(`📡 WebSocket server available at ws://localhost:${PORT}/ws`);
            console.log(`🌐 REST API available at http://localhost:${PORT}/api`);
            console.log(`❤️ Health check at http://localhost:${PORT}/health`);
            console.log(`🔧 Periodic cleanup enabled (30s intervals)`);
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          console.log('🛑 Server stopped');
          resolve();
        });
      });
    }
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getWebSocketServer(): WebSocketServer | undefined {
    return this.wss;
  }
}

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