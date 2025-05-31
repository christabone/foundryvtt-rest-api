import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FoundryRelayServer } from '../../src/server';
import { testHelper } from '../utils/testHelpers';
import { WebSocket } from 'ws';

describe('WebSocket Integration Tests', () => {
  let server: FoundryRelayServer;

  beforeAll(async () => {
    server = await testHelper.createTestServer();
    await testHelper.wait(500); // Wait for server to be ready
  });

  afterAll(async () => {
    await testHelper.stopTestServer();
  });

  describe('WebSocket Connection', () => {
    it('should accept valid WebSocket connections', async () => {
      const ws = await testHelper.createTestWebSocketClient(3001, 'test-gm', 'test-world-123');
      
      expect(ws.readyState).toBe(WebSocket.OPEN);
      
      ws.close();
    });

    it('should reject connections without client ID', async () => {
      await expect(
        testHelper.createTestWebSocketClient(3001, '', 'test-token')
      ).rejects.toThrow();
    });

    it('should reject connections without token', async () => {
      await expect(
        testHelper.createTestWebSocketClient(3001, 'test-client', '')
      ).rejects.toThrow();
    });
  });

  describe('WebSocket Message Handling', () => {
    it('should handle ping messages', async () => {
      const ws = await testHelper.createTestWebSocketClient(3001, 'test-gm', 'test-world-123');
      
      const response = await testHelper.sendWebSocketMessage(ws, { type: 'ping' });
      
      expect(response.type).toBe('pong');
      
      ws.close();
    });

    it('should send welcome message on connection', async () => {
      return new Promise<void>((resolve) => {
        const ws = new WebSocket('ws://localhost:3001/ws?id=welcome-test&token=test-token');
        
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connected') {
            expect(message.message).toContain('Successfully connected');
            ws.close();
            resolve();
          }
        });
      });
    });
  });

  describe('Request/Response Correlation', () => {
    it('should handle requests without FoundryVTT connected', async () => {
      const ws = await testHelper.createTestWebSocketClient(3001, 'test-requester', 'test-token');
      
      // Try to send a message that would require FoundryVTT response
      ws.send(JSON.stringify({
        type: 'get-entity',
        requestId: 'test-123',
        uuid: 'Actor.test'
      }));
      
      // Should not crash the server
      await testHelper.wait(1000);
      
      expect(ws.readyState).toBe(WebSocket.OPEN);
      
      ws.close();
    });
  });
});