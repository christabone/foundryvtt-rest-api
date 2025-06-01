import { WebSocketManager } from "../webSocketManager";
import { ModuleLogger } from "../../utils/logger";

export function registerConnectionHandlers(socketManager: WebSocketManager) {
    socketManager.onMessageType("ping", () => {
        ModuleLogger.info(`Received ping, sending pong`);
        socketManager.send({ type: "pong" });
    });

    socketManager.onMessageType("pong", () => {
        ModuleLogger.info(`Received pong`);
    });

    socketManager.onMessageType("connected", () => {
        ModuleLogger.info(`WebSocket connection confirmed by relay server`);
    });
}