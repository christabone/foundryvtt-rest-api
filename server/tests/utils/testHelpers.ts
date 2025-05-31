import { FoundryRelayServer } from '../../src/server';
import { WebSocket } from 'ws';
import net from 'net';

export class TestHelper {
  private server: FoundryRelayServer | null = null;
  private testClients: WebSocket[] = [];

  async createTestServer(): Promise<FoundryRelayServer> {
    this.server = new FoundryRelayServer();
    await this.server.start();
    return this.server;
  }

  async stopTestServer(): Promise<void> {
    // Close all test WebSocket clients
    for (const client of this.testClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    this.testClients = [];

    // Stop the server
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  createTestWebSocketClient(port: number = 3001, clientId: string = 'test-client', token: string = 'test-token'): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws?id=${clientId}&token=${token}`);
      
      ws.on('open', () => {
        this.testClients.push(ws);
        resolve(ws);
      });

      ws.on('error', (error) => {
        reject(error);
      });

      // Add timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  sendWebSocketMessage(ws: WebSocket, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message);
      
      // Set up response listener
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          ws.off('message', responseHandler);
          resolve(response);
        } catch (error) {
          ws.off('message', responseHandler);
          reject(error);
        }
      };

      ws.on('message', responseHandler);
      
      // Send the message
      ws.send(messageStr);

      // Add timeout
      setTimeout(() => {
        ws.off('message', responseHandler);
        reject(new Error('WebSocket response timeout'));
      }, 5000);
    });
  }

  generateTestApiKey(): string {
    return 'test_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once('close', () => {
          resolve(false); // Port is free
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(true); // Port is in use
      });
    });
  }
}

export const testHelper = new TestHelper();