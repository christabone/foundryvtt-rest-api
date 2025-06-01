import { WebSocketManager } from "../webSocketManager";

/**
 * Common error handling wrapper for WebSocket message handlers
 */
export function handleError(socketManager: WebSocketManager, requestId: string, messageType: string, error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    socketManager.send({
        type: `${messageType}-result`,
        requestId: requestId,
        error: errorMessage
    });
}

/**
 * Resolve entity by UUID or get selected entities
 */
export async function resolveEntity(entityUuid?: string) {
    if (entityUuid) {
        return fromUuid(entityUuid);
    } else {
        const controlled = canvas?.tokens?.controlled;
        if (!controlled || controlled.length === 0) {
            throw new Error("No entity UUID provided and no tokens selected");
        }
        return controlled[0].document.actor;
    }
}

/**
 * Get combat by ID or return active combat
 */
export function resolveCombat(combatId?: string) {
    if (combatId) {
        return (game as Game).combats?.get(combatId);
    } else {
        return (game as Game).combat;
    }
}

/**
 * Standard response sender utility
 */
export function sendResponse(socketManager: WebSocketManager, messageType: string, requestId: string, data: any) {
    socketManager.send({
        type: `${messageType}-result`,
        requestId: requestId,
        ...data
    });
}