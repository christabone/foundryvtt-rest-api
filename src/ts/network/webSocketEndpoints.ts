import { moduleId } from "../constants";
import { FoundryRestApi } from "../types";
import { ModuleLogger } from "../utils/logger";
import { WebSocketManager } from "./webSocketManager";
import { registerAllHandlers } from "./handlers";

export function initializeWebSocket() {
    // Get settings
    const wsRelayUrl = (game as Game).settings.get(moduleId, "wsRelayUrl") as string;
    const apiKey = (game as Game).settings.get(moduleId, "apiKey") as string;
    const module = (game as Game).modules.get(moduleId) as FoundryRestApi;
    
    if (!wsRelayUrl) {
      ModuleLogger.error(`Local relay server URL is empty. Please configure it in module settings.`);
      return;
    }
    
    ModuleLogger.info(`Initializing WebSocket connection to local relay server: ${wsRelayUrl}`);
    
    try {
        // Create and connect the WebSocket manager - only if it doesn't exist already
        if (!module.socketManager) {
            module.socketManager = WebSocketManager.getInstance(wsRelayUrl, apiKey);
            // Only attempt to connect if we got a valid instance (meaning this GM is the primary GM)
            if (module.socketManager) {
                module.socketManager.connect();
            }
        } else {
            ModuleLogger.info(`WebSocket manager already exists, not creating a new one`);
        }
        
        // If we don't have a valid socket manager, exit early
        if (!module.socketManager) {
            ModuleLogger.warn(`No WebSocket manager available, skipping message handler setup`);
            return;
        }
        
        // Register message handlers
        const socketManager = module.socketManager; // Store reference to prevent null checks on every line
        
        // Register all handlers
        registerAllHandlers(socketManager);
  
    } catch (error) {
      ModuleLogger.error(`Error initializing WebSocket:`, error);
    }
}
