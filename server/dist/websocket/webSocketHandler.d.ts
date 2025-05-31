import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { EnhancedApiKeyManager } from '../auth/enhancedApiKeyManager';
export interface WebSocketClient {
    id: string;
    socket: WebSocket;
    authenticated: boolean;
    token?: string;
    lastPing?: Date;
}
export interface WebSocketMessage {
    type: string;
    requestId?: string;
    [key: string]: any;
}
export declare class WebSocketHandler {
    private clients;
    private apiKeyManager;
    private pendingRequests;
    constructor(apiKeyManager: EnhancedApiKeyManager);
    handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void>;
    private handleMessage;
    sendToClient(clientId: string, message: WebSocketMessage): boolean;
    broadcastMessage(message: WebSocketMessage, excludeClient?: string): void;
    getConnectedClients(): string[];
    isClientConnected(clientId: string): boolean;
    sendMessageToFoundry(message: WebSocketMessage, timeoutMs?: number): Promise<any>;
    private generateRequestId;
    cleanupExpiredRequests(maxAgeMs?: number): void;
}
//# sourceMappingURL=webSocketHandler.d.ts.map