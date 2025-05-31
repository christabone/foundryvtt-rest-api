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
}

export class ApiKeyManager {
  private apiKeysFile: string;
  private apiKeys: Map<string, ApiKey> = new Map();

  constructor(keysFilePath?: string) {
    this.apiKeysFile = keysFilePath || path.join(process.cwd(), 'server', 'data', 'api-keys.json');
    this.loadApiKeys();
  }

  private async loadApiKeys(): Promise<void> {
    try {
      // Ensure the data directory exists
      const dataDir = path.dirname(this.apiKeysFile);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to load existing keys
      const data = await fs.readFile(this.apiKeysFile, 'utf-8');
      const keys: ApiKey[] = JSON.parse(data);
      
      this.apiKeys.clear();
      keys.forEach(key => {
        this.apiKeys.set(key.key, key);
      });

      console.log(`📋 Loaded ${keys.length} API keys`);
    } catch (error) {
      // File doesn't exist or is invalid, create with default key
      console.log('📋 No existing API keys found, creating default key...');
      await this.createDefaultKey();
    }
  }

  private async createDefaultKey(): Promise<void> {
    const defaultKey = await this.generateApiKey('default');
    console.log(`🔑 Default API key created: ${defaultKey.key}`);
    console.log('   Save this key - you\'ll need it to authenticate requests');
  }

  public async generateApiKey(name: string): Promise<ApiKey> {
    const key = 'fvtt_' + crypto.randomBytes(32).toString('hex');
    const apiKey: ApiKey = {
      id: crypto.randomUUID(),
      key,
      name,
      createdAt: new Date().toISOString(),
      active: true
    };

    this.apiKeys.set(key, apiKey);
    await this.saveApiKeys();
    
    return apiKey;
  }

  public async validateApiKey(key: string): Promise<boolean> {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey || !apiKey.active) {
      return false;
    }

    // Update last used timestamp
    apiKey.lastUsed = new Date().toISOString();
    await this.saveApiKeys();
    
    return true;
  }

  public async revokeApiKey(key: string): Promise<boolean> {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey) {
      return false;
    }

    apiKey.active = false;
    await this.saveApiKeys();
    return true;
  }

  public listApiKeys(): ApiKey[] {
    return Array.from(this.apiKeys.values()).map(key => ({
      ...key,
      key: key.key.substring(0, 12) + '...' // Mask the key for security
    }));
  }

  private async saveApiKeys(): Promise<void> {
    const keys = Array.from(this.apiKeys.values());
    await fs.writeFile(this.apiKeysFile, JSON.stringify(keys, null, 2));
  }

  // Allow FoundryVTT world IDs as valid API keys for compatibility
  public async validateFoundryWorldId(worldId: string): Promise<boolean> {
    // Basic validation - world IDs are typically alphanumeric
    if (!worldId || worldId.length < 8) {
      return false;
    }

    // For now, accept any reasonable world ID format
    // In production, you might want to register world IDs explicitly
    return /^[a-zA-Z0-9_-]{8,}$/.test(worldId);
  }

  public async isValidKey(key: string): Promise<boolean> {
    // Check if it's a managed API key
    if (await this.validateApiKey(key)) {
      return true;
    }

    // Check if it looks like a FoundryVTT world ID
    if (await this.validateFoundryWorldId(key)) {
      return true;
    }

    return false;
  }
}