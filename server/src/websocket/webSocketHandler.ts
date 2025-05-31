import { WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
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

export class WebSocketHandler {
  private clients: Map<string, WebSocketClient> = new Map();
  private apiKeyManager: EnhancedApiKeyManager;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    timestamp: number;
  }> = new Map();

  constructor(apiKeyManager: EnhancedApiKeyManager) {
    this.apiKeyManager = apiKeyManager;
  }

  public async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const clientId = url.searchParams.get('id');
    const token = url.searchParams.get('token');

    console.log(`🔌 WebSocket connection attempt from client: ${clientId}`);

    if (!clientId || !token) {
      console.log('❌ Connection rejected: Missing client ID or token');
      ws.close(4001, 'Missing client ID or token');
      return;
    }

    // Validate the token
    const isValidToken = await this.apiKeyManager.isValidKey(token);
    if (!isValidToken) {
      console.log(`❌ Connection rejected: Invalid token for client ${clientId}`);
      ws.close(4002, 'Invalid authentication token');
      return;
    }

    // Create client record
    const client: WebSocketClient = {
      id: clientId,
      socket: ws,
      authenticated: true,
      token,
      lastPing: new Date()
    };

    // Check for duplicate connections
    if (this.clients.has(clientId)) {
      console.log(`⚠️ Duplicate connection for client ${clientId}, closing previous connection`);
      const existingClient = this.clients.get(clientId);
      if (existingClient && existingClient.socket.readyState === WebSocket.OPEN) {
        existingClient.socket.close(4004, 'Duplicate connection');
      }
    }

    this.clients.set(clientId, client);
    console.log(`✅ Client ${clientId} connected successfully`);

    // Set up message handlers
    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 Client ${clientId} disconnected: ${code} - ${reason}`);
      this.clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for client ${clientId}:`, error);
      this.clients.delete(clientId);
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      message: 'Successfully connected to FoundryVTT Local Relay Server',
      timestamp: new Date().toISOString()
    });
  }

  private async handleMessage(client: WebSocketClient, data: RawData): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      console.log(`📨 Received from ${client.id}:`, message.type);

      // Handle ping/pong for connection health
      if (message.type === 'ping') {
        client.lastPing = new Date();
        this.sendToClient(client.id, { type: 'pong' });
        return;
      }

      // Handle pong responses
      if (message.type === 'pong') {
        console.log(`💓 Received pong from ${client.id}`);
        return;
      }

      // Check if this is a response to a pending request
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const pendingRequest = this.pendingRequests.get(message.requestId)!;
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(message.requestId);
        
        console.log(`✅ Received response for request ${message.requestId}`);
        
        // Check if the response indicates an error
        if (message.error || message.status === 'error') {
          pendingRequest.reject(new Error(message.error || 'Unknown error from FoundryVTT'));
        } else {
          pendingRequest.resolve(message);
        }
        return;
      }

      // Handle unsolicited messages (like roll-data events)
      console.log(`📋 Handling unsolicited message type: ${message.type}`);
      
      // For unsolicited messages, just log them for now
      // TODO: Implement broadcast or event handling for unsolicited messages

    } catch (error) {
      console.error(`❌ Error processing message from ${client.id}:`, error);
      this.sendToClient(client.id, {
        type: 'error',
        error: 'Invalid message format'
      });
    }
  }

  public sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      console.log(`⚠️ Cannot send to client ${clientId}: not connected`);
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`❌ Error sending to client ${clientId}:`, error);
      return false;
    }
  }

  public broadcastMessage(message: WebSocketMessage, excludeClient?: string): void {
    for (const [clientId] of this.clients) {
      if (excludeClient && clientId === excludeClient) {
        continue;
      }
      this.sendToClient(clientId, message);
    }
  }

  public getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  public isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client ? client.socket.readyState === WebSocket.OPEN : false;
  }

  // Method for REST API to send messages to WebSocket clients
  public async sendMessageToFoundry(message: WebSocketMessage, timeoutMs: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.clients.size === 0) {
        reject(new Error('No FoundryVTT clients connected'));
        return;
      }

      // Ensure message has a requestId for correlation
      if (!message.requestId) {
        message.requestId = this.generateRequestId();
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.requestId!);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store the pending request
      this.pendingRequests.set(message.requestId, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now()
      });

      // Send to first connected client (primary GM)
      const firstClientId = Array.from(this.clients.keys())[0];
      const success = this.sendToClient(firstClientId, message);
      
      if (!success) {
        clearTimeout(timeout);
        this.pendingRequests.delete(message.requestId);
        reject(new Error('Failed to send message to FoundryVTT'));
      }
    });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Clean up expired requests (called periodically)
  public cleanupExpiredRequests(maxAgeMs: number = 60000): void {
    const now = Date.now();
    for (const [requestId, request] of this.pendingRequests) {
      if (now - request.timestamp > maxAgeMs) {
        clearTimeout(request.timeout);
        this.pendingRequests.delete(requestId);
        request.reject(new Error('Request expired during cleanup'));
      }
    }
  }
}