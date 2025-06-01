import { ModuleLogger } from "../../utils/logger";
import { WebSocketManager } from "../webSocketManager";
import { deepSerializeEntity } from "../../utils/serialization";

/**
 * Register all entity-related message handlers
 */
export function registerEntityHandlers(socketManager: WebSocketManager) {
    // Handle entity requests
    socketManager.onMessageType("get-entity", async (data) => {
        ModuleLogger.info(`Received entity request:`, data);
        
        try {
            let entity;
            let entityData = [];
            let entityUUID = data.uuid;
            if (data.selected) {
                const controlledTokens = canvas?.tokens?.controlled;
                if (controlledTokens) {
                    for (let token of controlledTokens) {
                        if (data.actor) {
                            entity = token.actor;
                        } else {
                            entity = token.document;
                        }
                        if (entity) {
                            entityUUID = entity.uuid;
                            // Use custom deep serialization
                            entityData.push(deepSerializeEntity(entity));
                        }
                    }
                }
            } else {
                entity = await fromUuid(data.uuid);
                // Use custom deep serialization
                entityData = entity ? deepSerializeEntity(entity) : null;
            }
            
            if (!entityData) {
                ModuleLogger.error(`Entity not found: ${data.uuid}`);
                socketManager.send({
                type: "entity-data",
                requestId: data.requestId,
                uuid: data.uuid,
                error: "Entity not found",
                data: null
                });
                return;
            }
            
            ModuleLogger.info(`Sending entity data for: ${data.uuid}`, entityData);
            
            socketManager.send({
                type: "entity-data",
                requestId: data.requestId,
                uuid: entityUUID,
                data: entityData
            });
        } catch (error) {
            ModuleLogger.error(`Error getting entity:`, error);
            socketManager.send({
                type: "entity-data",
                requestId: data.requestId,
                uuid: data.uuid,
                error: (error as Error).message,
                data: null
        });
        }
    });

    
    // Handle entity creation
    socketManager.onMessageType("create-entity", async (data) => {
        ModuleLogger.info(`Received create entity request for type: ${data.entityType}`);
        
        try {
        // Get the document class for the entity type
        const DocumentClass = getDocumentClass(data.entityType);
        if (!DocumentClass) {
            throw new Error(`Invalid entity type: ${data.entityType}`);
        }
        
        // Prepare creation data
        const createData = {
            ...data.data,
            folder: data.folder || null
        };
        
        // Create the entity
        const entity = await DocumentClass.create(createData);
        
        if (!entity) {
            throw new Error("Failed to create entity");
        }
        
        socketManager.send({
            type: "entity-created",
            requestId: data.requestId,
            uuid: entity.uuid,
            entity: entity.toObject()
        });
        } catch (error) {
        ModuleLogger.error(`Error creating entity:`, error);
        socketManager.send({
            type: "entity-created",
            requestId: data.requestId,
            error: (error as Error).message,
            message: "Failed to create entity"
        });
        }
    });
    
    // Handle entity update
    socketManager.onMessageType("update-entity", async (data) => {
        ModuleLogger.info(`Received update entity request for UUID: ${data.uuid}`);
        
        try {
        // Get the entities
        let entities = [];
        if (data.uuid) {
            entities.push(await fromUuid(data.uuid));
        } else if (data.selected) {
            const controlledTokens = canvas?.tokens?.controlled;
            if (controlledTokens) {
                for (let token of controlledTokens) {
                    if (data.actor) {
                        entities.push(token.actor);
                    } else {
                        entities.push(token.document);
                    }
                }
            }
        }
        
        if (entities.length === 0) {
            throw new Error(`Entity not found: ${data.uuid}`);
        }
        
        // Update the entities
        for (let entity of entities) {
            await entity?.update(data.updateData);
        }
        
        // Get the updated entities
        let updatedEntities = [];
        for (let entity of entities) {
            updatedEntities.push(await fromUuid((entity as any).uuid));
        }
        
        socketManager.send({
            type: "entity-updated",
            requestId: data.requestId,
            uuid: data.uuid,
            entity: updatedEntities.map(e => e?.toObject())
        });
        } catch (error) {
        ModuleLogger.error(`Error updating entity:`, error);
        socketManager.send({
            type: "entity-updated",
            requestId: data.requestId,
            uuid: data.uuid,
            error: (error as Error).message,
            message: "Failed to update entity"
        });
        }
    });
    
    // Handle entity deletion
    socketManager.onMessageType("delete-entity", async (data) => {
        ModuleLogger.info(`Received delete entity request for UUID: ${data.uuid}`);
        
        try {
        // Get the entities
        let entities = [];
        if (data.uuid) {
            entities.push(await fromUuid(data.uuid));
        } else if (data.selected) {
            const controlledTokens = canvas?.tokens?.controlled;
            if (controlledTokens) {
                for (let token of controlledTokens) {
                    if (data.actor) {
                        entities.push(token.actor);
                    } else {
                        entities.push(token.document);
                    }
                }
            }
        }
        
        if (!entities || entities.length === 0) {
            throw new Error(`Entity not found: ${data.uuid}`);
        }
        
        // Delete the entities
        for (let entity of entities) {
            await entity?.delete();
        }
        
        socketManager.send({
            type: "entity-deleted",
            requestId: data.requestId,
            uuid: data.uuid,
            success: true
        });
        } catch (error) {
        ModuleLogger.error(`Error deleting entity:`, error);
        socketManager.send({
            type: "entity-deleted",
            requestId: data.requestId,
            uuid: data.uuid,
            error: (error as Error).message,
            message: "Failed to delete entity"
        });
        }
    });
}