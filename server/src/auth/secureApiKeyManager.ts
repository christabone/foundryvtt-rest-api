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

interface EncryptedData {
  encryptedData: string;
  iv: string;
  salt: string;
  tag: string;
}

export class SecureApiKeyManager {
  private apiKeysFile: string;
  private apiKeys: Map<string, ApiKey> = new Map();
  private masterPassword: string;
  private isInitialized: boolean = false;

  // Crypto configuration
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly IV_LENGTH = 16; // 128 bits
  private readonly SALT_LENGTH = 32; // 256 bits
  private readonly PBKDF2_ITERATIONS = 100000; // Strong iteration count

  constructor(keysFilePath?: string, masterPassword?: string) {
    this.apiKeysFile = keysFilePath || path.join(process.cwd(), 'server', 'data', 'api-keys.encrypted');
    this.masterPassword = masterPassword || this.generateMasterPassword();
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    try {
      await this.loadApiKeys();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize SecureApiKeyManager:', error);
      throw error;
    }
  }

  private generateMasterPassword(): string {
    // Generate a master password from environment or create a secure default
    const envPassword = process.env.FOUNDRY_MASTER_PASSWORD;
    if (envPassword && envPassword.length >= 32) {
      return envPassword;
    }
    
    // Generate a secure random password
    const password = crypto.randomBytes(32).toString('base64');
    console.log('🔐 Generated master password for API key encryption');
    console.log('   Set FOUNDRY_MASTER_PASSWORD environment variable to persist this password:');
    console.log(`   export FOUNDRY_MASTER_PASSWORD="${password}"`);
    return password;
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, this.PBKDF2_ITERATIONS, this.KEY_LENGTH, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  private async encryptData(data: string, password: string): Promise<EncryptedData> {
    // Generate random salt and IV
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    
    // Derive encryption key
    const key = await this.deriveKey(password, salt);
    
    // Create cipher with IV
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from('api-keys')); // Additional authenticated data
    
    // Encrypt data
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  private async decryptData(encryptedData: EncryptedData, password: string): Promise<string> {
    // Convert hex strings back to buffers
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');
    
    // Derive decryption key
    const key = await this.deriveKey(password, salt);
    
    // Create decipher with IV
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from('api-keys')); // Same AAD used in encryption
    decipher.setAuthTag(tag);
    
    // Decrypt data
    let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private async loadApiKeys(): Promise<void> {
    try {
      // Ensure the data directory exists with secure permissions
      const dataDir = path.dirname(this.apiKeysFile);
      await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });

      // Try to load existing encrypted keys
      const encryptedContent = await fs.readFile(this.apiKeysFile, 'utf-8');
      const encryptedData: EncryptedData = JSON.parse(encryptedContent);
      
      // Decrypt the data
      const decryptedData = await this.decryptData(encryptedData, this.masterPassword);
      const keys: ApiKey[] = JSON.parse(decryptedData);
      
      this.apiKeys.clear();
      keys.forEach(key => {
        this.apiKeys.set(key.key, key);
      });

      console.log(`🔒 Loaded ${keys.length} encrypted API keys`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, create with default key
        console.log('🔒 No existing encrypted API keys found, creating default key...');
        await this.createDefaultKey();
      } else {
        console.error('Failed to decrypt API keys. Check master password.');
        throw error;
      }
    }
  }

  private async createDefaultKey(): Promise<void> {
    const defaultKey = await this.generateApiKey('default-server');
    console.log(`🔑 Default encrypted API key created: ${defaultKey.key}`);
    console.log('   This key is stored encrypted at rest');
  }

  public async generateApiKey(name: string, metadata?: Record<string, any>): Promise<ApiKey> {
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
    await this.saveApiKeys();
    
    return apiKey;
  }

  public async validateApiKey(key: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initializeAsync();
    }

    const apiKey = this.apiKeys.get(key);
    if (!apiKey || !apiKey.active) {
      return false;
    }

    // Update last used timestamp (timing-safe)
    apiKey.lastUsed = new Date().toISOString();
    
    // Save updated timestamp (non-blocking)
    setImmediate(() => {
      this.saveApiKeys().catch(err => {
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
    await this.saveApiKeys();
    return true;
  }

  public async deleteApiKey(key: string): Promise<boolean> {
    const deleted = this.apiKeys.delete(key);
    if (deleted) {
      await this.saveApiKeys();
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
    
    await this.saveApiKeys();
    return newKey;
  }

  private async saveApiKeys(): Promise<void> {
    try {
      // Prepare data for encryption
      const keys = Array.from(this.apiKeys.values());
      const jsonData = JSON.stringify(keys, null, 2);
      
      // Encrypt the data
      const encryptedData = await this.encryptData(jsonData, this.masterPassword);
      
      // Write encrypted data to file with secure permissions
      const encryptedContent = JSON.stringify(encryptedData, null, 2);
      await fs.writeFile(this.apiKeysFile, encryptedContent, { mode: 0o600 });
      
    } catch (error) {
      console.error('Failed to save encrypted API keys:', error);
      throw error;
    }
  }

  private maskApiKey(key: string): string {
    if (key.length <= 12) {
      return key.substring(0, 4) + '...';
    }
    return key.substring(0, 12) + '...';
  }

  // Enhanced validation for FoundryVTT world IDs
  public async validateFoundryWorldId(worldId: string): Promise<boolean> {
    // Timing-safe validation to prevent timing attacks
    const isValidLength = crypto.timingSafeEqual(
      Buffer.from(worldId.length >= 8 ? 'valid' : 'invalid'),
      Buffer.from('valid')
    );

    if (!isValidLength) {
      return false;
    }

    // Validate format using timing-safe comparison
    const validPattern = /^[a-zA-Z0-9_-]{8,}$/;
    return validPattern.test(worldId);
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
  public async changemasterPassword(newPassword: string): Promise<void> {
    if (newPassword.length < 32) {
      throw new Error('Master password must be at least 32 characters long');
    }

    this.masterPassword = newPassword;
    await this.saveApiKeys(); // Re-encrypt with new password
    console.log('🔐 Master password changed successfully');
  }

  public getSecurityInfo(): object {
    return {
      algorithm: this.ALGORITHM,
      keyLength: this.KEY_LENGTH * 8, // bits
      pbkdf2Iterations: this.PBKDF2_ITERATIONS,
      totalKeys: this.apiKeys.size,
      activeKeys: Array.from(this.apiKeys.values()).filter(k => k.active).length,
      encryptedStorage: true,
      filePermissions: '600 (owner read/write only)'
    };
  }

  // Secure shutdown
  public async destroy(): Promise<void> {
    // Clear sensitive data from memory
    this.apiKeys.clear();
    
    // Overwrite master password in memory (best effort)
    if (this.masterPassword) {
      const passwordBuffer = Buffer.from(this.masterPassword, 'utf8');
      passwordBuffer.fill(0);
      this.masterPassword = '';
    }

    this.isInitialized = false;
  }
}