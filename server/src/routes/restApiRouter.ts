import { Router, Request, Response, NextFunction } from 'express';
import { WebSocketHandler } from '../websocket/webSocketHandler';
import { EnhancedApiKeyManager } from '../auth/enhancedApiKeyManager';

export class RestApiRouter {
  private router: Router;
  private webSocketHandler: WebSocketHandler;
  private apiKeyManager: EnhancedApiKeyManager;

  constructor(webSocketHandler: WebSocketHandler, apiKeyManager: EnhancedApiKeyManager) {
    this.router = Router();
    this.webSocketHandler = webSocketHandler;
    this.apiKeyManager = apiKeyManager;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Enhanced API Key authentication middleware
    this.router.use(async (req: Request, res: Response, next: NextFunction) => {
      // Skip auth for status endpoint
      if (req.path === '/status') {
        return next();
      }

      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        res.status(401).json({
          error: 'API key required',
          message: 'Include x-api-key header with your request'
        });
        return;
      }

      try {
        // Use secure API key manager for validation
        const isValid = await this.apiKeyManager.isValidKey(apiKey);
        if (!isValid) {
          res.status(401).json({
            error: 'Invalid API key',
            message: 'The provided API key is not valid or has been revoked'
          });
          return;
        }

        // Store validated API key in request for potential future use
        (req as any).validatedApiKey = apiKey;
        next();
      } catch (error) {
        console.error('API key validation error:', error);
        res.status(500).json({
          error: 'Authentication service error',
          message: 'Unable to validate API key at this time'
        });
        return;
      }
    });

    // Middleware to check WebSocket connection
    this.router.use((_req: Request, res: Response, next: NextFunction) => {
      const connectedClients = this.webSocketHandler.getConnectedClients();
      if (connectedClients.length === 0) {
        res.status(503).json({
          error: 'No FoundryVTT instances connected',
          message: 'Please ensure FoundryVTT is running and the module is connected to this relay server'
        });
        return;
      }
      next();
    });

    // Search endpoint
    this.router.post('/search', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { query, filter } = req.body;
        
        if (!query) {
          res.status(400).json({ error: 'Query parameter is required' });
          return;
        }

        const message = {
          type: 'perform-search',
          query,
          filter
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Get entity by UUID
    this.router.get('/entity/:uuid', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { uuid } = req.params;

        const message = {
          type: 'get-entity',
          uuid
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Create entity
    this.router.post('/entity', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { type, data } = req.body;

        if (!type || !data) {
          res.status(400).json({ error: 'Type and data parameters are required' });
          return;
        }

        const message = {
          type: 'create-entity',
          entityType: type,
          data
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Update entity
    this.router.put('/entity/:uuid', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { uuid } = req.params;
        const { data } = req.body;

        if (!data) {
          res.status(400).json({ error: 'Data parameter is required' });
          return;
        }

        const message = {
          type: 'update-entity',
          uuid,
          data
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Delete entity
    this.router.delete('/entity/:uuid', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { uuid } = req.params;

        const message = {
          type: 'delete-entity',
          uuid
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Perform dice roll
    this.router.post('/roll', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { formula, actor } = req.body;

        if (!formula) {
          res.status(400).json({ error: 'Formula parameter is required' });
          return;
        }

        const message = {
          type: 'perform-roll',
          formula,
          actor
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Get recent rolls
    this.router.get('/rolls', (_req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const message = {
          type: 'get-rolls'
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Execute macro
    this.router.post('/macro/:uuid', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { uuid } = req.params;
        const { args } = req.body;

        const message = {
          type: 'execute-macro',
          uuid,
          args
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Get world structure
    this.router.get('/structure', (_req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const message = {
          type: 'get-structure'
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Get game contents (folders/compendiums)
    this.router.get('/contents', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { path } = req.query;

        const message = {
          type: 'get-contents',
          path: path as string
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });


    // Get selected entities
    this.router.get('/selected', (_req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const message = {
          type: 'get-selected-entities'
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Select entities
    this.router.post('/select', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { criteria } = req.body;

        const message = {
          type: 'select-entities',
          criteria
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Execute JavaScript code
    this.router.post('/execute', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const { code } = req.body;

        if (!code) {
          res.status(400).json({ error: 'Code parameter is required' });
          return;
        }

        const message = {
          type: 'execute-js',
          script: code
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Get macros
    this.router.get('/macros', (_req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const message = {
          type: 'get-macros'
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Get hotbar
    this.router.get('/hotbar', (req: Request, res: Response) => {
      this.handleAsyncRoute(async () => {
        const page = req.query.page ? parseInt(req.query.page as string) : undefined;
        
        const message = {
          type: 'get-hotbar',
          ...(page && { page })
        };

        const result = await this.webSocketHandler.sendMessageToFoundry(message);
        res.json(result);
      }, res);
    });

    // Connected clients status (no auth required)
    this.router.get('/status', (_req: Request, res: Response) => {
      const clients = this.webSocketHandler.getConnectedClients();
      res.json({
        connectedClients: clients.length,
        clients: clients,
        status: clients.length > 0 ? 'connected' : 'no-clients',
        timestamp: new Date().toISOString()
      });
    });
  }

  private async handleAsyncRoute(handler: () => Promise<void>, res: Response): Promise<void> {
    try {
      await handler();
    } catch (error) {
      console.error('Route error:', error);
      res.status(500).json({ 
        error: 'Internal server error', 
        message: (error as Error).message 
      });
    }
  }


  public getRouter(): Router {
    return this.router;
  }
}