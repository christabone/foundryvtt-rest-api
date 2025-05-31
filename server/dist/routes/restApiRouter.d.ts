import { Router } from 'express';
import { WebSocketHandler } from '../websocket/webSocketHandler';
import { EnhancedApiKeyManager } from '../auth/enhancedApiKeyManager';
export declare class RestApiRouter {
    private router;
    private webSocketHandler;
    private apiKeyManager;
    constructor(webSocketHandler: WebSocketHandler, apiKeyManager: EnhancedApiKeyManager);
    private setupRoutes;
    private handleAsyncRoute;
    getRouter(): Router;
}
//# sourceMappingURL=restApiRouter.d.ts.map