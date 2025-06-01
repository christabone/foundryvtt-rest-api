import { WebSocketManager } from "../webSocketManager";
import { registerConnectionHandlers } from "./connection-handlers";
import { registerFileHandlers } from "./file-handlers";
import { registerSearchHandlers } from "./search-handlers";
import { registerEntityHandlers } from "./entity-handlers";
import { registerRollHandlers } from "./roll-handlers";
import { registerUIHandlers } from "./ui-handlers";
import { registerCombatHandlers } from "./combat-handlers";
import { registerCharacterHandlers } from "./character-handlers";
import { registerScriptHandlers } from "./script-handlers";

export function registerAllHandlers(socketManager: WebSocketManager) {
    // Register connection handlers
    registerConnectionHandlers(socketManager);
    
    // Register file handlers (including our new browse-files handler)
    registerFileHandlers(socketManager);
    
    // Register search handlers
    registerSearchHandlers(socketManager);
    
    // Register entity handlers
    registerEntityHandlers(socketManager);
    
    // Register roll handlers
    registerRollHandlers(socketManager);
    
    // Register UI handlers
    registerUIHandlers(socketManager);
    
    // Register combat handlers
    registerCombatHandlers(socketManager);
    
    // Register character handlers
    registerCharacterHandlers(socketManager);
    
    // Register script handlers
    registerScriptHandlers(socketManager);
}