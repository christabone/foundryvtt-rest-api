export interface ApiKey {
    id: string;
    key: string;
    name: string;
    createdAt: string;
    lastUsed?: string;
    active: boolean;
    metadata?: Record<string, any>;
}
export declare class EnhancedApiKeyManager {
    private apiKeysFile;
    private apiKeys;
    private initialized;
    constructor(keysFilePath?: string);
    private initializeSync;
    private loadApiKeysSync;
    private createDefaultKeySync;
    generateApiKeySync(name: string, metadata?: Record<string, any>): ApiKey;
    generateApiKey(name: string, metadata?: Record<string, any>): Promise<ApiKey>;
    validateApiKey(key: string): Promise<boolean>;
    revokeApiKey(key: string): Promise<boolean>;
    deleteApiKey(key: string): Promise<boolean>;
    listApiKeys(): ApiKey[];
    rotateApiKey(oldKey: string): Promise<ApiKey | null>;
    private saveApiKeysSync;
    private saveApiKeysAsync;
    private maskApiKey;
    validateFoundryWorldId(worldId: string): Promise<boolean>;
    isValidKey(key: string): Promise<boolean>;
    getSecurityInfo(): object;
    destroy(): Promise<void>;
}
//# sourceMappingURL=enhancedApiKeyManager.d.ts.map