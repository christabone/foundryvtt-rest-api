"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
class ApiKeyManager {
    constructor(keysFilePath) {
        this.apiKeys = new Map();
        this.apiKeysFile = keysFilePath || path_1.default.join(process.cwd(), 'server', 'data', 'api-keys.json');
        this.loadApiKeys();
    }
    async loadApiKeys() {
        try {
            // Ensure the data directory exists
            const dataDir = path_1.default.dirname(this.apiKeysFile);
            await fs_1.promises.mkdir(dataDir, { recursive: true });
            // Try to load existing keys
            const data = await fs_1.promises.readFile(this.apiKeysFile, 'utf-8');
            const keys = JSON.parse(data);
            this.apiKeys.clear();
            keys.forEach(key => {
                this.apiKeys.set(key.key, key);
            });
            console.log(`📋 Loaded ${keys.length} API keys`);
        }
        catch (error) {
            // File doesn't exist or is invalid, create with default key
            console.log('📋 No existing API keys found, creating default key...');
            await this.createDefaultKey();
        }
    }
    async createDefaultKey() {
        const defaultKey = await this.generateApiKey('default');
        console.log(`🔑 Default API key created: ${defaultKey.key}`);
        console.log('   Save this key - you\'ll need it to authenticate requests');
    }
    async generateApiKey(name) {
        const key = 'fvtt_' + crypto_1.default.randomBytes(32).toString('hex');
        const apiKey = {
            id: crypto_1.default.randomUUID(),
            key,
            name,
            createdAt: new Date().toISOString(),
            active: true
        };
        this.apiKeys.set(key, apiKey);
        await this.saveApiKeys();
        return apiKey;
    }
    async validateApiKey(key) {
        const apiKey = this.apiKeys.get(key);
        if (!apiKey || !apiKey.active) {
            return false;
        }
        // Update last used timestamp
        apiKey.lastUsed = new Date().toISOString();
        await this.saveApiKeys();
        return true;
    }
    async revokeApiKey(key) {
        const apiKey = this.apiKeys.get(key);
        if (!apiKey) {
            return false;
        }
        apiKey.active = false;
        await this.saveApiKeys();
        return true;
    }
    listApiKeys() {
        return Array.from(this.apiKeys.values()).map(key => ({
            ...key,
            key: key.key.substring(0, 12) + '...' // Mask the key for security
        }));
    }
    async saveApiKeys() {
        const keys = Array.from(this.apiKeys.values());
        await fs_1.promises.writeFile(this.apiKeysFile, JSON.stringify(keys, null, 2));
    }
    // Allow FoundryVTT world IDs as valid API keys for compatibility
    async validateFoundryWorldId(worldId) {
        // Basic validation - world IDs are typically alphanumeric
        if (!worldId || worldId.length < 8) {
            return false;
        }
        // For now, accept any reasonable world ID format
        // In production, you might want to register world IDs explicitly
        return /^[a-zA-Z0-9_-]{8,}$/.test(worldId);
    }
    async isValidKey(key) {
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
exports.ApiKeyManager = ApiKeyManager;
//# sourceMappingURL=apiKeyManager.js.map