export interface ApiKey {
    id: string;
    key: string;
    name: string;
    createdAt: string;
    lastUsed?: string;
    active: boolean;
    metadata?: Record<string, any>;
}
export declare class SecureApiKeyManager {
    private apiKeysFile;
    private apiKeys;
    private masterPassword;
    private isInitialized;
    private readonly ALGORITHM;
    private readonly KEY_LENGTH;
    private readonly IV_LENGTH;
    private readonly SALT_LENGTH;
    private readonly PBKDF2_ITERATIONS;
    constructor(keysFilePath?: string, masterPassword?: string);
    private initializeAsync;
    private generateMasterPassword;
    private deriveKey;
    private encryptData;
    private decryptData;
    private loadApiKeys;
    private createDefaultKey;
    generateApiKey(name: string, metadata?: Record<string, any>): Promise<ApiKey>;
    validateApiKey(key: string): Promise<boolean>;
    revokeApiKey(key: string): Promise<boolean>;
    deleteApiKey(key: string): Promise<boolean>;
    listApiKeys(): ApiKey[];
    rotateApiKey(oldKey: string): Promise<ApiKey | null>;
    private saveApiKeys;
    private maskApiKey;
    validateFoundryWorldId(worldId: string): Promise<boolean>;
    isValidKey(key: string): Promise<boolean>;
    changemasterPassword(newPassword: string): Promise<void>;
    getSecurityInfo(): object;
    destroy(): Promise<void>;
}
//# sourceMappingURL=secureApiKeyManager.d.ts.map