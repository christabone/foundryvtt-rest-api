import { WebSocket } from 'ws';

export class MockFoundryClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: any) => any> = new Map();

  async connect(port: number = 3001, clientId: string = 'foundry-test-gm', token: string = 'test-world-id'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${port}/ws?id=${clientId}&token=${token}`);
      
      this.ws.on('open', () => {
        console.log('Mock FoundryVTT client connected');
        this.setupDefaultHandlers();
        resolve();
      });

      this.ws.on('error', reject);
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  private setupDefaultHandlers(): void {
    // Default handlers for common message types
    this.addMessageHandler('ping', () => ({ type: 'pong' }));
    
    this.addMessageHandler('perform-search', (data) => ({
      type: 'search-results',
      requestId: data.requestId,
      query: data.query,
      results: [
        {
          name: 'Test Actor',
          type: 'Actor',
          uuid: 'Actor.test123',
          pack: null
        },
        {
          name: 'Test Item',
          type: 'Item', 
          uuid: 'Item.test456',
          pack: 'test-pack'
        }
      ]
    }));

    this.addMessageHandler('get-entity', (data) => ({
      type: 'entity-data',
      requestId: data.requestId,
      uuid: data.uuid,
      data: {
        name: 'Test Entity',
        type: 'Actor',
        system: {
          attributes: {
            hp: { value: 100, max: 100 }
          }
        }
      }
    }));

    this.addMessageHandler('get-rolls', (data) => ({
      type: 'rolls-data',
      requestId: data.requestId,
      rolls: [
        {
          id: 'roll1',
          user: { name: 'Test User' },
          total: 15,
          formula: '1d20+5',
          timestamp: Date.now()
        }
      ]
    }));

    this.addMessageHandler('get-structure', (data) => ({
      type: 'structure-data',
      requestId: data.requestId,
      structure: {
        folders: [
          { name: 'Actors', type: 'Actor', children: [] },
          { name: 'Items', type: 'Item', children: [] }
        ],
        compendiums: [
          { name: 'test-pack', label: 'Test Pack', type: 'Actor' }
        ]
      }
    }));

    this.addMessageHandler('perform-roll', (data) => ({
      type: 'roll-result',
      requestId: data.requestId,
      result: {
        total: 18,
        formula: data.formula,
        dice: [{ faces: 20, results: [{ result: 13, active: true }] }],
        isCritical: false,
        isFumble: false
      }
    }));
  }

  addMessageHandler(messageType: string, handler: (data: any) => any): void {
    this.messageHandlers.set(messageType, handler);
  }

  private handleMessage(message: any): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      const response = handler(message);
      if (response && this.ws) {
        this.ws.send(JSON.stringify(response));
      }
    } else {
      console.log(`No handler for message type: ${message.type}`);
      // Send generic error response
      if (message.requestId && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'error-response',
          requestId: message.requestId,
          error: `No handler for message type: ${message.type}`
        }));
      }
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}