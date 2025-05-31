export interface ApiKey {
    id: string;
    key: string;
    name: string;
    createdAt: string;
    lastUsed?: string;
    active: boolean;
}
export declare class ApiKeyManager {
    private apiKeysFile;
    private apiKeys;
    constructor(keysFilePath?: string);
    private loadApiKeys;
    private createDefaultKey;
    generateApiKey(name: string): Promise<ApiKey>;
    validateApiKey(key: string): Promise<boolean>;
    revokeApiKey(key: string): Promise<boolean>;
    listApiKeys(): ApiKey[];
    private saveApiKeys;
    validateFoundryWorldId(worldId: string): Promise<boolean>;
    isValidKey(key: string): Promise<boolean>;
}
//# sourceMappingURL=apiKeyManager.d.ts.map