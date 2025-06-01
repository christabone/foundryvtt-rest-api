import { ModuleLogger } from "../../utils/logger";
import { WebSocketManager } from "../webSocketManager";

/**
 * Register script execution handlers
 */
export function registerScriptHandlers(socketManager: WebSocketManager) {
    // Execute JavaScript code handler
    socketManager.onMessageType("execute-js", async (data) => {
        ModuleLogger.info(`Received execute-js request:`, data);
    
        try {
            const { script, requestId } = data;
    
            if (!script || typeof script !== "string") {
                throw new Error("Invalid script provided");
            }
    
            // Use an IIFE to safely execute the script
            let result;
            try {
                result = await (async () => {
                    return eval(`(async () => { ${script} })()`);
                })();
            } catch (executionError) {
                const errorMessage = executionError instanceof Error ? executionError.message : String(executionError);
                throw new Error(`Error executing script: ${errorMessage}`);
            }
    
            // Send the result back
            socketManager.send({
                type: "execute-js-result",
                requestId,
                success: true,
                result
            });
        } catch (error) {
            ModuleLogger.error(`Error in execute-js handler:`, error);
            socketManager.send({
                type: "execute-js-result",
                requestId: data.requestId,
                success: false,
                error: (error as Error).message
            });
        }
    });
}