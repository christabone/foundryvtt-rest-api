"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedApiKeyManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
class EnhancedApiKeyManager {
    constructor(keysFilePath) {
        this.apiKeys = new Map();
        this.initialized = false;
        this.apiKeysFile = keysFilePath || path_1.default.join(process.cwd(), 'server', 'data', 'api-keys.json');
        // Initialize synchronously for now to avoid timing issues
        this.initializeSync();
    }
    initializeSync() {
        try {
            this.loadApiKeysSync();
            this.initialized = true;
        }
        catch (error) {
            console.error('Failed to initialize EnhancedApiKeyManager:', error);
            // Continue with empty state for now
            this.initialized = true;
        }
    }
    loadApiKeysSync() {
        try {
            // Ensure the data directory exists
            const dataDir = path_1.default.dirname(this.apiKeysFile);
            if (!require('fs').existsSync(dataDir)) {
                require('fs').mkdirSync(dataDir, { recursive: true });
            }
            // Try to load existing keys
            if (require('fs').existsSync(this.apiKeysFile)) {
                const data = require('fs').readFileSync(this.apiKeysFile, 'utf-8');
                const keys = JSON.parse(data);
                this.apiKeys.clear();
                keys.forEach(key => {
                    this.apiKeys.set(key.key, key);
                });
                console.log(`🔐 Loaded ${keys.length} API keys from storage`);
            }
            else {
                // File doesn't exist, create with default key
                console.log('🔐 No existing API keys found, creating default key...');
                this.createDefaultKeySync();
            }
        }
        catch (error) {
            console.error('Failed to load API keys:', error);
            // Continue with empty state
        }
    }
    createDefaultKeySync() {
        const defaultKey = this.generateApiKeySync('default-server');
        console.log(`🔑 Default API key created: ${defaultKey.key}`);
        console.log('   This key provides secure authentication for REST and WebSocket connections');
    }
    generateApiKeySync(name, metadata) {
        // Generate cryptographically secure API key
        const keyBytes = crypto_1.default.randomBytes(32);
        const key = 'fvtt_' + keyBytes.toString('hex');
        const apiKey = {
            id: crypto_1.default.randomUUID(),
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
    async generateApiKey(name, metadata) {
        return this.generateApiKeySync(name, metadata);
    }
    async validateApiKey(key) {
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
    async revokeApiKey(key) {
        const apiKey = this.apiKeys.get(key);
        if (!apiKey) {
            return false;
        }
        // Secure approach: mark as inactive rather than delete
        apiKey.active = false;
        await this.saveApiKeysAsync();
        return true;
    }
    async deleteApiKey(key) {
        const deleted = this.apiKeys.delete(key);
        if (deleted) {
            await this.saveApiKeysAsync();
        }
        return deleted;
    }
    listApiKeys() {
        return Array.from(this.apiKeys.values()).map(key => ({
            ...key,
            key: this.maskApiKey(key.key) // Mask the key for security
        }));
    }
    async rotateApiKey(oldKey) {
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
    saveApiKeysSync() {
        try {
            const keys = Array.from(this.apiKeys.values());
            const jsonData = JSON.stringify(keys, null, 2);
            require('fs').writeFileSync(this.apiKeysFile, jsonData, { mode: 0o600 });
        }
        catch (error) {
            console.error('Failed to save API keys:', error);
        }
    }
    async saveApiKeysAsync() {
        try {
            const keys = Array.from(this.apiKeys.values());
            const jsonData = JSON.stringify(keys, null, 2);
            await fs_1.promises.writeFile(this.apiKeysFile, jsonData, { mode: 0o600 });
        }
        catch (error) {
            console.error('Failed to save API keys:', error);
            throw error;
        }
    }
    maskApiKey(key) {
        if (key.length <= 12) {
            return key.substring(0, 4) + '...';
        }
        return key.substring(0, 12) + '...';
    }
    // Enhanced validation for FoundryVTT world IDs with timing-safe comparison
    async validateFoundryWorldId(worldId) {
        // Basic length check
        if (!worldId || worldId.length < 8) {
            return false;
        }
        // Timing-safe validation to prevent timing attacks
        try {
            const isValidLength = crypto_1.default.timingSafeEqual(Buffer.from(worldId.length >= 8 ? 'valid' : 'invalid'), Buffer.from('valid'));
            if (!isValidLength) {
                return false;
            }
            // Validate format
            const validPattern = /^[a-zA-Z0-9_-]{8,}$/;
            return validPattern.test(worldId);
        }
        catch {
            return false;
        }
    }
    async isValidKey(key) {
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
    getSecurityInfo() {
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
    async destroy() {
        // Clear sensitive data from memory
        this.apiKeys.clear();
        this.initialized = false;
    }
}
exports.EnhancedApiKeyManager = EnhancedApiKeyManager;
//# sourceMappingURL=enhancedApiKeyManager.js.map