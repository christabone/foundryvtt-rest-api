import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ApiKeyManager } from '../../src/auth/apiKeyManager';
import { promises as fs } from 'fs';
import path from 'path';

describe('ApiKeyManager', () => {
  let apiKeyManager: ApiKeyManager;
  let testKeysFile: string;

  beforeEach(() => {
    // Use a temporary file for testing
    testKeysFile = path.join(__dirname, '../temp', 'test-api-keys.json');
    apiKeyManager = new ApiKeyManager(testKeysFile);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testKeysFile);
    } catch (error) {
      // File might not exist, ignore
    }
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', async () => {
      const apiKey = await apiKeyManager.generateApiKey('test-key');
      
      expect(apiKey).toBeDefined();
      expect(apiKey.key).toMatch(/^fvtt_[a-f0-9]{64}$/);
      expect(apiKey.name).toBe('test-key');
      expect(apiKey.active).toBe(true);
      expect(apiKey.createdAt).toBeDefined();
    });

    it('should generate unique API keys', async () => {
      const key1 = await apiKeyManager.generateApiKey('test-key-1');
      const key2 = await apiKeyManager.generateApiKey('test-key-2');
      
      expect(key1.key).not.toBe(key2.key);
      expect(key1.id).not.toBe(key2.id);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid API key', async () => {
      const apiKey = await apiKeyManager.generateApiKey('test-key');
      const isValid = await apiKeyManager.validateApiKey(apiKey.key);
      
      expect(isValid).toBe(true);
    });

    it('should reject an invalid API key', async () => {
      const isValid = await apiKeyManager.validateApiKey('invalid-key');
      
      expect(isValid).toBe(false);
    });

    it('should reject an inactive API key', async () => {
      const apiKey = await apiKeyManager.generateApiKey('test-key');
      await apiKeyManager.revokeApiKey(apiKey.key);
      
      const isValid = await apiKeyManager.validateApiKey(apiKey.key);
      
      expect(isValid).toBe(false);
    });
  });

  describe('validateFoundryWorldId', () => {
    it('should validate a valid world ID', async () => {
      const isValid = await apiKeyManager.validateFoundryWorldId('test-world-123');
      
      expect(isValid).toBe(true);
    });

    it('should reject a short world ID', async () => {
      const isValid = await apiKeyManager.validateFoundryWorldId('short');
      
      expect(isValid).toBe(false);
    });

    it('should reject an empty world ID', async () => {
      const isValid = await apiKeyManager.validateFoundryWorldId('');
      
      expect(isValid).toBe(false);
    });

    it('should reject world ID with invalid characters', async () => {
      const isValid = await apiKeyManager.validateFoundryWorldId('test world!@#');
      
      expect(isValid).toBe(false);
    });
  });

  describe('isValidKey', () => {
    it('should validate a managed API key', async () => {
      const apiKey = await apiKeyManager.generateApiKey('test-key');
      const isValid = await apiKeyManager.isValidKey(apiKey.key);
      
      expect(isValid).toBe(true);
    });

    it('should validate a FoundryVTT world ID', async () => {
      const isValid = await apiKeyManager.isValidKey('test-world-123');
      
      expect(isValid).toBe(true);
    });

    it('should reject an invalid key', async () => {
      const isValid = await apiKeyManager.isValidKey('invalid');
      
      expect(isValid).toBe(false);
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an existing API key', async () => {
      const apiKey = await apiKeyManager.generateApiKey('test-key');
      const revoked = await apiKeyManager.revokeApiKey(apiKey.key);
      
      expect(revoked).toBe(true);
      
      const isValid = await apiKeyManager.validateApiKey(apiKey.key);
      expect(isValid).toBe(false);
    });

    it('should return false for non-existent API key', async () => {
      const revoked = await apiKeyManager.revokeApiKey('non-existent-key');
      
      expect(revoked).toBe(false);
    });
  });
});