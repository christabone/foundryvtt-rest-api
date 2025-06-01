import { describe, it, expect, beforeEach } from '@jest/globals';
import { WebSocketHandler } from '../../src/websocket/webSocketHandler';
import { EnhancedApiKeyManager } from '../../src/auth/enhancedApiKeyManager';

describe('WebSocketHandler', () => {
  let webSocketHandler: WebSocketHandler;
  let apiKeyManager: EnhancedApiKeyManager;

  beforeEach(() => {
    apiKeyManager = new EnhancedApiKeyManager();
    webSocketHandler = new WebSocketHandler(apiKeyManager);
  });

  describe('Initialization', () => {
    it('should initialize with empty client list', () => {
      const clients = webSocketHandler.getConnectedClients();
      expect(clients).toEqual([]);
    });

    it('should report no connected clients initially', () => {
      const isConnected = webSocketHandler.isClientConnected('test-client');
      expect(isConnected).toBe(false);
    });
  });

  describe('Request Management', () => {
    it('should clean up expired requests', () => {
      // This tests the cleanup functionality exists
      expect(() => {
        webSocketHandler.cleanupExpiredRequests(1000);
      }).not.toThrow();
    });

    it('should reject messages when no clients connected', async () => {
      const message = {
        type: 'test-message',
        data: 'test'
      };

      await expect(
        webSocketHandler.sendMessageToFoundry(message)
      ).rejects.toThrow('No FoundryVTT clients connected');
    });
  });

  describe('Message Broadcasting', () => {
    it('should handle broadcast to empty client list', () => {
      expect(() => {
        webSocketHandler.broadcastMessage({ type: 'test' });
      }).not.toThrow();
    });

    it('should handle broadcast with exclusion', () => {
      expect(() => {
        webSocketHandler.broadcastMessage({ type: 'test' }, 'exclude-client');
      }).not.toThrow();
    });
  });
});