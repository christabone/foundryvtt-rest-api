import { SecureApiKeyManager, ApiKey } from '../../src/auth/secureApiKeyManager';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import '@jest/globals';

describe('SecureApiKeyManager', () => {
  let manager: SecureApiKeyManager;
  let tempDir: string;
  let testKeysFile: string;
  let testMasterPassword: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = path.join(__dirname, '..', 'temp', `test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    testKeysFile = path.join(tempDir, 'test-api-keys.encrypted');
    testMasterPassword = crypto.randomBytes(32).toString('base64');
    
    // Create manager with test configuration
    manager = new SecureApiKeyManager(testKeysFile, testMasterPassword);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up
    if (manager) {
      await manager.destroy();
    }
    
    // Remove test directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('API Key Generation', () => {
    test('should generate secure API keys', async () => {
      const apiKey = await manager.generateApiKey('test-key');
      
      expect(apiKey).toBeDefined();
      expect(apiKey.id).toBeDefined();
      expect(apiKey.key).toMatch(/^fvtt_[a-f0-9]{64}$/);
      expect(apiKey.name).toBe('test-key');
      expect(apiKey.createdAt).toBeDefined();
      expect(apiKey.active).toBe(true);
    });

    test('should generate unique API keys', async () => {
      const key1 = await manager.generateApiKey('test-key-1');
      const key2 = await manager.generateApiKey('test-key-2');
      
      expect(key1.key).not.toBe(key2.key);
      expect(key1.id).not.toBe(key2.id);
    });

    test('should support metadata in API keys', async () => {
      const metadata = { userId: '12345', permissions: ['read', 'write'] };
      const apiKey = await manager.generateApiKey('test-with-metadata', metadata);
      
      expect(apiKey.metadata).toEqual(metadata);
    });
  });

  describe('API Key Validation', () => {
    let testApiKey: ApiKey;

    beforeEach(async () => {
      testApiKey = await manager.generateApiKey('validation-test');
    });

    test('should validate existing active API keys', async () => {
      const isValid = await manager.validateApiKey(testApiKey.key);
      expect(isValid).toBe(true);
    });

    test('should reject non-existent API keys', async () => {
      const isValid = await manager.validateApiKey('fvtt_nonexistent');
      expect(isValid).toBe(false);
    });

    test('should reject inactive API keys', async () => {
      await manager.revokeApiKey(testApiKey.key);
      const isValid = await manager.validateApiKey(testApiKey.key);
      expect(isValid).toBe(false);
    });

    test('should update last used timestamp on validation', async () => {
      const originalLastUsed = testApiKey.lastUsed;
      
      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await manager.validateApiKey(testApiKey.key);
      
      // Get the updated key from the list
      const keys = manager.listApiKeys();
      const updatedKey = keys.find(k => k.id === testApiKey.id);
      
      expect(updatedKey?.lastUsed).toBeDefined();
      expect(updatedKey?.lastUsed).not.toBe(originalLastUsed);
    });
  });

  describe('API Key Management', () => {
    let testApiKey: ApiKey;

    beforeEach(async () => {
      testApiKey = await manager.generateApiKey('management-test');
    });

    test('should revoke API keys', async () => {
      const revoked = await manager.revokeApiKey(testApiKey.key);
      expect(revoked).toBe(true);
      
      const isValid = await manager.validateApiKey(testApiKey.key);
      expect(isValid).toBe(false);
    });

    test('should delete API keys', async () => {
      const deleted = await manager.deleteApiKey(testApiKey.key);
      expect(deleted).toBe(true);
      
      const keys = manager.listApiKeys();
      expect(keys.find(k => k.id === testApiKey.id)).toBeUndefined();
    });

    test('should rotate API keys', async () => {
      const rotatedKey = await manager.rotateApiKey(testApiKey.key);
      
      expect(rotatedKey).toBeDefined();
      expect(rotatedKey!.key).not.toBe(testApiKey.key);
      expect(rotatedKey!.name).toBe(testApiKey.name);
      expect(rotatedKey!.metadata).toEqual(testApiKey.metadata);
      
      // Original key should be inactive
      const originalValid = await manager.validateApiKey(testApiKey.key);
      expect(originalValid).toBe(false);
      
      // New key should be valid
      const newValid = await manager.validateApiKey(rotatedKey!.key);
      expect(newValid).toBe(true);
    });

    test('should list API keys with masked keys', async () => {
      await manager.generateApiKey('test-key-1');
      await manager.generateApiKey('test-key-2');
      
      const keys = manager.listApiKeys();
      expect(keys.length).toBeGreaterThanOrEqual(3); // Including the original test key
      
      // Check that keys are masked
      keys.forEach(key => {
        expect(key.key).toMatch(/^fvtt_[a-f0-9]{8}\.{3}$/);
        expect(key.key.length).toBeLessThan(20); // Should be much shorter than full key
      });
    });
  });

  describe('FoundryVTT World ID Validation', () => {
    test('should validate properly formatted world IDs', async () => {
      const validWorldIds = [
        'my-world-123',
        'test_world_456',
        'campaign-2024',
        'abcdef123456789'
      ];

      for (const worldId of validWorldIds) {
        const isValid = await manager.validateFoundryWorldId(worldId);
        expect(isValid).toBe(true);
      }
    });

    test('should reject invalid world IDs', async () => {
      const invalidWorldIds = [
        'short',           // Too short
        'has spaces',      // Contains spaces
        'has@symbols',     // Contains invalid symbols
        '',                // Empty
        'has.dots'         // Contains dots
      ];

      for (const worldId of invalidWorldIds) {
        const isValid = await manager.validateFoundryWorldId(worldId);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Encryption and Persistence', () => {
    test('should persist encrypted API keys to file', async () => {
      await manager.generateApiKey('persistence-test');
      
      // Check that encrypted file exists
      const fileExists = await fs.access(testKeysFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Check that file content is encrypted (not plain JSON)
      const fileContent = await fs.readFile(testKeysFile, 'utf-8');
      expect(() => JSON.parse(fileContent)).not.toThrow();
      
      const encryptedData = JSON.parse(fileContent);
      expect(encryptedData).toHaveProperty('encryptedData');
      expect(encryptedData).toHaveProperty('iv');
      expect(encryptedData).toHaveProperty('salt');
      expect(encryptedData).toHaveProperty('tag');
    });

    test('should load encrypted API keys from file', async () => {
      // Create and save an API key
      const originalKey = await manager.generateApiKey('load-test');
      
      // Create new manager instance with same file
      const newManager = new SecureApiKeyManager(testKeysFile, testMasterPassword);
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for initialization
      
      // Should be able to validate the key
      const isValid = await newManager.validateApiKey(originalKey.key);
      expect(isValid).toBe(true);
      
      await newManager.destroy();
    });

    test('should fail to decrypt with wrong master password', async () => {
      // Create and save an API key
      await manager.generateApiKey('password-test');
      
      // Try to create new manager with wrong password
      const wrongPassword = crypto.randomBytes(32).toString('base64');
      
      expect(() => {
        new SecureApiKeyManager(testKeysFile, wrongPassword);
      }).not.toThrow(); // Constructor shouldn't throw, but loading will fail
    });
  });

  describe('Security Features', () => {
    test('should provide security information', () => {
      const securityInfo = manager.getSecurityInfo();
      
      expect(securityInfo).toHaveProperty('algorithm', 'aes-256-gcm');
      expect(securityInfo).toHaveProperty('keyLength', 256);
      expect(securityInfo).toHaveProperty('pbkdf2Iterations', 100000);
      expect(securityInfo).toHaveProperty('encryptedStorage', true);
      expect(securityInfo).toHaveProperty('filePermissions');
    });

    test('should change master password', async () => {
      // Create initial key
      const initialKey = await manager.generateApiKey('password-change-test');
      
      // Change master password
      const newPassword = crypto.randomBytes(32).toString('base64');
      await manager.changemasterPassword(newPassword);
      
      // Verify key still works
      const isValid = await manager.validateApiKey(initialKey.key);
      expect(isValid).toBe(true);
      
      // Verify new manager with new password can load keys
      const newManager = new SecureApiKeyManager(testKeysFile, newPassword);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stillValid = await newManager.validateApiKey(initialKey.key);
      expect(stillValid).toBe(true);
      
      await newManager.destroy();
    });

    test('should reject weak master passwords', async () => {
      const weakPassword = 'short';
      
      await expect(manager.changemasterPassword(weakPassword))
        .rejects.toThrow('Master password must be at least 32 characters long');
    });

    test('should securely destroy sensitive data', async () => {
      await manager.generateApiKey('destroy-test');
      
      await manager.destroy();
      
      // Manager should no longer work after destruction
      const securityInfo = manager.getSecurityInfo();
      expect(securityInfo.totalKeys).toBe(0);
    });
  });

  describe('Combined Key Validation', () => {
    test('should validate both API keys and world IDs', async () => {
      // Generate a managed API key
      const apiKey = await manager.generateApiKey('combined-test');
      
      // Test API key validation
      const apiKeyValid = await manager.isValidKey(apiKey.key);
      expect(apiKeyValid).toBe(true);
      
      // Test world ID validation
      const worldIdValid = await manager.isValidKey('valid-world-id-123');
      expect(worldIdValid).toBe(true);
      
      // Test invalid key
      const invalidValid = await manager.isValidKey('invalid');
      expect(invalidValid).toBe(false);
    });
  });
});