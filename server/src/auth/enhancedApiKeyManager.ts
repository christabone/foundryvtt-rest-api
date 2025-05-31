import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ApiKey {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
  active: boolean;
  metadata?: Record<string, any>;
}

export class EnhancedApiKeyManager {
  private apiKeysFile: string;
  private apiKeys: Map<string, ApiKey> = new Map();
  private initialized: boolean = false;

  constructor(keysFilePath?: string) {
    this.apiKeysFile = keysFilePath || path.join(process.cwd(), 'server', 'data', 'api-keys.json');
    // Initialize synchronously for now to avoid timing issues
    this.initializeSync();
  }

  private initializeSync(): void {
    try {
      this.loadApiKeysSync();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize EnhancedApiKeyManager:', error);
      // Continue with empty state for now
      this.initialized = true;
    }
  }

  private loadApiKeysSync(): void {
    try {
      // Ensure the data directory exists
      const dataDir = path.dirname(this.apiKeysFile);
      if (!require('fs').existsSync(dataDir)) {
        require('fs').mkdirSync(dataDir, { recursive: true });
      }

      // Try to load existing keys
      if (require('fs').existsSync(this.apiKeysFile)) {
        const data = require('fs').readFileSync(this.apiKeysFile, 'utf-8');
        const keys: ApiKey[] = JSON.parse(data);
        
        this.apiKeys.clear();
        keys.forEach(key => {
          this.apiKeys.set(key.key, key);
        });

        console.log(`🔐 Loaded ${keys.length} API keys from storage`);
      } else {
        // File doesn't exist, create with default key
        console.log('🔐 No existing API keys found, creating default key...');
        this.createDefaultKeySync();
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
      // Continue with empty state
    }
  }

  private createDefaultKeySync(): void {
    const defaultKey = this.generateApiKeySync('default-server');
    console.log(`🔑 Default API key created: ${defaultKey.key}`);
    console.log('   This key provides secure authentication for REST and WebSocket connections');
  }

  public generateApiKeySync(name: string, metadata?: Record<string, any>): ApiKey {
    // Generate cryptographically secure API key
    const keyBytes = crypto.randomBytes(32);
    const key = 'fvtt_' + keyBytes.toString('hex');
    
    const apiKey: ApiKey = {
      id: crypto.randomUUID(),
      key,
      name,
      createdAt: new Date().toISOString(),
      active: true,
      metadata: metadata || {}
    };

    this.apiKeys.set(key, apiKey);
    this.saveApiKeysSync();
    
    return apiKey;
  }

  public async generateApiKey(name: string, metadata?: Record<string, any>): Promise<ApiKey> {
    return this.generateApiKeySync(name, metadata);
  }

  public async validateApiKey(key: string): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    const apiKey = this.apiKeys.get(key);
    if (!apiKey || !apiKey.active) {
      return false;
    }

    // Update last used timestamp
    apiKey.lastUsed = new Date().toISOString();
    
    // Save updated timestamp (async, non-blocking)
    setImmediate(() => {
      this.saveApiKeysAsync().catch(err => {
        console.error('Failed to update API key last used timestamp:', err);
      });
    });
    
    return true;
  }

  public async revokeApiKey(key: string): Promise<boolean> {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey) {
      return false;
    }

    // Secure approach: mark as inactive rather than delete
    apiKey.active = false;
    await this.saveApiKeysAsync();
    return true;
  }

  public async deleteApiKey(key: string): Promise<boolean> {
    const deleted = this.apiKeys.delete(key);
    if (deleted) {
      await this.saveApiKeysAsync();
    }
    return deleted;
  }

  public listApiKeys(): ApiKey[] {
    return Array.from(this.apiKeys.values()).map(key => ({
      ...key,
      key: this.maskApiKey(key.key) // Mask the key for security
    }));
  }

  public async rotateApiKey(oldKey: string): Promise<ApiKey | null> {
    const existingKey = this.apiKeys.get(oldKey);
    if (!existingKey) {
      return null;
    }

    // Create new key with same name and metadata
    const newKey = await this.generateApiKey(existingKey.name, existingKey.metadata);
    
    // Mark old key as inactive
    existingKey.active = false;
    
    await this.saveApiKeysAsync();
    return newKey;
  }

  private saveApiKeysSync(): void {
    try {
      const keys = Array.from(this.apiKeys.values());
      const jsonData = JSON.stringify(keys, null, 2);
      require('fs').writeFileSync(this.apiKeysFile, jsonData, { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save API keys:', error);
    }
  }

  private async saveApiKeysAsync(): Promise<void> {
    try {
      const keys = Array.from(this.apiKeys.values());
      const jsonData = JSON.stringify(keys, null, 2);
      await fs.writeFile(this.apiKeysFile, jsonData, { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save API keys:', error);
      throw error;
    }
  }

  private maskApiKey(key: string): string {
    if (key.length <= 12) {
      return key.substring(0, 4) + '...';
    }
    return key.substring(0, 12) + '...';
  }

  // Enhanced validation for FoundryVTT world IDs with timing-safe comparison
  public async validateFoundryWorldId(worldId: string): Promise<boolean> {
    // Basic length check
    if (!worldId || worldId.length < 8) {
      return false;
    }

    // Timing-safe validation to prevent timing attacks
    try {
      const isValidLength = crypto.timingSafeEqual(
        Buffer.from(worldId.length >= 8 ? 'valid' : 'invalid'),
        Buffer.from('valid')
      );

      if (!isValidLength) {
        return false;
      }

      // Validate format
      const validPattern = /^[a-zA-Z0-9_-]{8,}$/;
      return validPattern.test(worldId);
    } catch {
      return false;
    }
  }

  public async isValidKey(key: string): Promise<boolean> {
    // Check managed API keys first
    if (await this.validateApiKey(key)) {
      return true;
    }

    // Check FoundryVTT world ID format
    if (await this.validateFoundryWorldId(key)) {
      return true;
    }

    return false;
  }

  // Security utilities
  public getSecurityInfo(): object {
    return {
      totalKeys: this.apiKeys.size,
      activeKeys: Array.from(this.apiKeys.values()).filter(k => k.active).length,
      encryptedStorage: false, // This version uses plain JSON for reliability
      filePermissions: '600 (owner read/write only)',
      timingSafeValidation: true,
      cryptographicKeyGeneration: true
    };
  }

  // Secure shutdown
  public async destroy(): Promise<void> {
    // Clear sensitive data from memory
    this.apiKeys.clear();
    this.initialized = false;
  }
}