import { ModuleLogger } from "../../utils/logger";
import { WebSocketManager } from "../webSocketManager";

export function registerCharacterHandlers(socketManager: WebSocketManager) {
    // Handle kill request (mark token/actor as defeated)
    socketManager.onMessageType("kill-entity", async (data) => {
        ModuleLogger.info(`Received kill request for UUID: ${data.uuid}`);
        
        try {
        const entities = [];

        if (data.uuid) {
            const entity = await fromUuid(data.uuid);
            if (entity) {
            entities.push(entity);
            } else {
            throw new Error(`Entity not found: ${data.uuid}`);
            }
        } else if (data.selected) {
            const controlledTokens = canvas?.tokens?.controlled || [];
            for (const token of controlledTokens) {
            if (token.document) {
                entities.push(token.document);
            }
            }
        }

        if (entities.length === 0) {
            throw new Error("No entities found to mark as defeated");
        }

        const results = [];

        for (const entity of entities) {
            let success = false;
            let message = "";

            // Handle different entity types
            if (entity.documentName === "Token") {
            const token = entity;
            const actor = (token as any).actor;

            if (!actor) {
                throw new Error("Token has no associated actor");
            }

            // 1. Mark as defeated in combat if in encounter
            const combat = (game as Game).combat;
            if (combat) {
                const combatant = combat.combatants.find(c => 
                c.token?.id === token.id && c.token?.parent?.id === token.parent?.id
                );
                
                if (combatant) {
                await combatant.update({ defeated: true });
                ModuleLogger.info(`Marked token as defeated in combat`);
                }
            }

            // 2. Reduce HP to 0 - try different possible HP paths for different systems
            try {
                if (hasProperty(actor, "system.attributes.hp")) {
                await actor.update({ "system.attributes.hp.value": 0 });
                } 
                else if (hasProperty(actor, "system.health")) {
                await actor.update({ "system.health.value": 0 });
                }
                else if (hasProperty(actor, "system.hp")) {
                await actor.update({ "system.hp.value": 0 });
                }
                else if (hasProperty(actor, "data.attributes.hp")) {
                await actor.update({ "data.attributes.hp.value": 0 });
                }
                ModuleLogger.info(`Set actor HP to 0`);
            } catch (err) {
                ModuleLogger.warn(`Could not set HP to 0: ${err}`);
            }

            // 3. Add dead status effect to token
            try {
                const deadEffect = CONFIG.statusEffects?.find(e => 
                e.id === "dead" || e.id === "unconscious" || e.id === "defeated"
                );
                
                if (deadEffect) {
                await (token as any).toggleActiveEffect(deadEffect);
                ModuleLogger.info(`Added ${deadEffect.id} status effect to token`);
                } else {
                ModuleLogger.warn(`No dead status effect found`);
                }
            } catch (err) {
                ModuleLogger.warn(`Could not apply status effect: ${err}`);
            }

            success = true;
            message = "Token marked as defeated, HP set to 0, and dead effect applied";
            } else if (entity.documentName === "Actor") {
            const actor = entity;
            let tokensUpdated = 0;

            // 1. Find all tokens for this actor across visible scenes and update them
            const scenes = (game as Game).scenes;
            if (scenes?.viewed) {
                const tokens = scenes.viewed.tokens.filter(t => t.actor?.id === actor.id);
                
                for (const token of tokens) {
                try {
                    const deadEffect = CONFIG.statusEffects?.find(e => 
                    e.id === "dead" || e.id === "unconscious" || e.id === "defeated"
                    );
                    
                    if (deadEffect) {
                    await (token as any).toggleActiveEffect(deadEffect);
                    tokensUpdated++;
                    }
                } catch (err) {
                    ModuleLogger.warn(`Could not apply status effect to token: ${err}`);
                }
                }
            }

            // 2. Mark all instances in combat as defeated
            const combat = (game as Game).combat;
            if (combat) {
                const combatants = combat.combatants.filter(c => c.actor?.id === actor.id);
                
                if (combatants.length > 0) {
                await Promise.all(combatants.map(c => c.update({ defeated: true })));
                ModuleLogger.info(`Marked ${combatants.length} combatants as defeated`);
                }
            }

            // 3. Reduce HP to 0 - try different possible HP paths for different systems
            try {
                if (hasProperty(actor, "system.attributes.hp")) {
                await actor.update({ "system.attributes.hp.value": 0 });
                } 
                else if (hasProperty(actor, "system.health")) {
                await actor.update({ "system.health.value": 0 });
                }
                else if (hasProperty(actor, "system.hp")) {
                await actor.update({ "system.hp.value": 0 });
                }
                else if (hasProperty(actor, "data.attributes.hp")) {
                await actor.update({ "data.attributes.hp.value": 0 });
                }
                ModuleLogger.info(`Set actor HP to 0`);
            } catch (err) {
                ModuleLogger.warn(`Could not set HP to 0: ${err}`);
            }

            success = true;
            message = `Actor marked as defeated, HP set to 0, and dead effect applied to ${tokensUpdated} tokens`;
            } else {
            throw new Error(`Cannot mark entity type ${entity.documentName} as defeated`);
            }

            results.push({
            uuid: (entity as any).uuid,
            success,
            message
            });
        }

        socketManager.send({
            type: "kill-entity-result",
            requestId: data.requestId,
            results
        });
        } catch (error) {
        ModuleLogger.error(`Error marking entities as defeated:`, error);
        socketManager.send({
            type: "kill-entity-result",
            requestId: data.requestId,
            success: false,
            error: (error as Error).message
        });
        }
    });
    
    // Handle decrease attribute request
    socketManager.onMessageType("decrease-attribute", async (data) => {
        ModuleLogger.info(`Received decrease attribute request for attribute: ${data.attribute}, amount: ${data.amount}`);
        
        try {
        if (!data.uuid && !data.selected) {
            throw new Error("UUID or selected is required");
        }
        if (!data.attribute) throw new Error("Attribute path is required");
        if (typeof data.amount !== 'number') throw new Error("Amount must be a number");
        
        const entities = [];
        if (data.selected) {
            const controlledTokens = canvas?.tokens?.controlled || [];
            for (const token of controlledTokens) {
            if (token.actor) {
                entities.push(token.actor);
            }
            }
        } else if (data.uuid) {
            const entity = await fromUuid(data.uuid);
            if (entity) {
            entities.push(entity);
            }
        }

        if (entities.length === 0) {
            throw new Error("No entities found to modify");
        }

        const results = [];
        for (const entity of entities) {
            // Get current value
            const currentValue = getProperty(entity, data.attribute);
            if (typeof currentValue !== 'number') {
            throw new Error(`Attribute ${data.attribute} is not a number, found: ${typeof currentValue}`);
            }

            // Calculate new value
            const newValue = currentValue - data.amount;

            // Prepare update data
            const updateData: { [key: string]: number } = {};
            updateData[data.attribute] = newValue;

            // Apply the update
            await entity.update(updateData);

            results.push({
            uuid: (entity as any).uuid,
            attribute: data.attribute,
            oldValue: currentValue,
            newValue: newValue
            });
        }

        socketManager.send({
            type: "modify-attribute-result",
            requestId: data.requestId,
            results,
            success: true
        });
        } catch (error) {
        ModuleLogger.error(`Error decreasing attribute:`, error);
        socketManager.send({
            type: "modify-attribute-result",
            requestId: data.requestId,
            success: false,
            error: (error as Error).message
        });
        }
    });
    
    // Handle increase attribute request
    socketManager.onMessageType("increase-attribute", async (data) => {
        ModuleLogger.info(`Received increase attribute request for attribute: ${data.attribute}, amount: ${data.amount}`);
        
        try {
        if (!data.uuid && !data.selected) {
            throw new Error("UUID or selected is required");
        }
        if (!data.attribute) throw new Error("Attribute path is required");
        if (typeof data.amount !== 'number') throw new Error("Amount must be a number");
        
        const entities = [];
        if (data.selected) {
            const controlledTokens = canvas?.tokens?.controlled || [];
            for (const token of controlledTokens) {
            if (token.actor) {
                entities.push(token.actor);
            }
            }
        } else if (data.uuid) {
            const entity = await fromUuid(data.uuid);
            if (entity) {
            entities.push(entity);
            }
        }

        if (entities.length === 0) {
            throw new Error("No entities found to modify");
        }

        const results = [];
        for (const entity of entities) {
            // Get current value
            const currentValue = getProperty(entity, data.attribute);
            if (typeof currentValue !== 'number') {
            throw new Error(`Attribute ${data.attribute} is not a number, found: ${typeof currentValue}`);
            }

            // Calculate new value
            const newValue = currentValue + data.amount;

            // Prepare update data
            const updateData: { [key: string]: unknown } = {};
            updateData[data.attribute] = newValue;

            // Apply the update
            await entity.update(updateData);

            results.push({
            uuid: (entity as any).uuid,
            attribute: data.attribute,
            oldValue: currentValue,
            newValue: newValue
            });
        }

        socketManager.send({
            type: "modify-attribute-result",
            requestId: data.requestId,
            results,
            success: true
        });
        } catch (error) {
        ModuleLogger.error(`Error increasing attribute:`, error);
        socketManager.send({
            type: "modify-attribute-result",
            requestId: data.requestId,
            success: false,
            error: (error as Error).message
        });
        }
    });
    
    // Handle give item request
    socketManager.onMessageType("give-item", async (data) => {
        ModuleLogger.info(`Received give item request from ${data.fromUuid} to ${data.toUuid}`);
        
        try {
        if (!data.toUuid && !data.selected) {
            throw new Error("Target UUID or selected is required");
        };
        if (!data.itemUuid) throw new Error("Item UUID is required");
        
        // Get the source actor
        let fromEntity: any | null = null;
        if (data.fromUuid) {
            fromEntity = await fromUuid(data.fromUuid);
            
            // Make sure it's an actor
            if (fromEntity?.documentName !== "Actor") {
                throw new Error(`Source entity must be an Actor, got ${fromEntity?.documentName}`);
            }
        }
        
        // Get the target actor
        if (data.selected) {
            data.toUuid = canvas?.tokens?.controlled[0]?.actor?.uuid;
        }
        const toEntity = await fromUuid(data.toUuid);
        if (!toEntity) throw new Error(`Target entity not found: ${data.toUuid}`);
        
        // Make sure it's an actor
        if (toEntity.documentName !== "Actor") {
            throw new Error(`Target entity must be an Actor, got ${toEntity.documentName}`);
        }
        
        // Get the item to transfer
        const itemEntity = await fromUuid(data.itemUuid);
        if (!itemEntity) throw new Error(`Item not found: ${data.itemUuid}`);
        
        // Make sure it's an item
        if (itemEntity.documentName !== "Item") {
            throw new Error(`Entity must be an Item, got ${itemEntity.documentName}`);
        }
        
        // Make sure the item belongs to the source actor
        if (data.fromUuid && itemEntity.parent?.id !== fromEntity.id) {
            throw new Error(`Item ${data.itemUuid} does not belong to source actor ${data.fromUuid}`);
        }
        
        // Create a new item on the target actor
        const itemData = itemEntity.toObject();
        delete itemData._id; // Remove the ID so a new one is created
        
        // Handle quantity if specified
        if (data.quantity && typeof data.quantity === 'number') {
            if (itemData.system && itemData.system.quantity) {
            const originalQuantity = itemData.system.quantity;
            itemData.system.quantity = data.quantity;
                if (data.fromUuid) {
                    // If transferring all, delete from source
                    if (data.quantity >= originalQuantity) {
                        await itemEntity.delete();
                    } else {
                        // Otherwise reduce quantity on source
                        await itemEntity.update({"system.quantity": originalQuantity - data.quantity});
                    }
                }
            }
        } else {
            if (data.fromUuid) {
                // Default behavior with no quantity - remove from source
                await itemEntity.delete();
            }
        }
        
        // Create on target
        const newItem = await toEntity.createEmbeddedDocuments("Item", [itemData]);
        
        socketManager.send({
            type: "give-item-result",
            requestId: data.requestId,
            fromUuid: data.fromUuid,
            selected: data.selected,
            toUuid: data.toUuid,
            quantity: data.quantity,
            itemUuid: data.itemUuid,
            newItemId: newItem[0].id,
            success: true
        });
        } catch (error) {
        ModuleLogger.error(`Error giving item:`, error);
        socketManager.send({
            type: "give-item-result",
            requestId: data.requestId,
            selected: data.selected,
            fromUuid: data.fromUuid || "",
            toUuid: data.toUuid || "",
            quantity: data.quantity,
            itemUuid: data.itemUuid || "",
            success: false,
            error: (error as Error).message
        });
    }
});

// Handle select entities request
socketManager.onMessageType("select-entities", async (data) => {
    ModuleLogger.info(`Received select entities request:`, data);
    
    try {
        const scene = (game as Game).scenes?.active;
        if (!scene) {
            throw new Error("No active scene found");
        }

        if (data.overwrite) {
            // Deselect all tokens if overwrite is true
            canvas?.tokens?.releaseAll();
        }

        let targets: TokenDocument[] = [];
        if (data.all) {
            // Select all tokens on the active scene
            targets = scene.tokens?.contents || [];
        }
        if (data.uuids && Array.isArray(data.uuids)) {
            const matchingTokens = scene.tokens?.filter(token => 
                data.uuids.includes(token.uuid)
            ) || [];
            targets = [...targets, ...matchingTokens];
        }
        if (data.name) {
            const matchingTokens = scene.tokens?.filter(token => 
                token.name?.toLowerCase() === data.name?.toLowerCase()
            ) || [];
            targets = [...targets, ...matchingTokens];
        }
        if (data.data) {
            const matchingTokens = scene.tokens?.filter(token => 
                Object.entries(data.data).every(([key, value]) => {
                    // Handle nested keys for actor data
                    if (key.startsWith("actor.") && token.actor) {
                        const actorKey = key.replace("actor.", "");
                        return getProperty(token.actor, actorKey) === value;
                    }
                    // Handle token-level properties
                    const tokenData = token.toObject();
                    return getProperty(tokenData, key) === value;
                })
            ) || [];
            targets = [...targets, ...matchingTokens];
        }

        if (targets.length === 0) {
            throw new Error("No matching entities found");
        }

        // Select each token
        for (const token of targets) {
            const t = token.id ? canvas?.tokens?.get(token.id) : null;
            if (t) {
                t.control({ releaseOthers: false });
            }
        }

        socketManager.send({
            type: "select-entities-result",
            requestId: data.requestId,
            success: true,
            count: targets.length,
            message: `${targets.length} entities selected`
        });
    } catch (error) {
        ModuleLogger.error(`Error selecting entities:`, error);
        socketManager.send({
            type: "select-entities-result",
            requestId: data.requestId,
            success: false,
            error: (error as Error).message
        });
    }
});

// Handle get selected entities request
socketManager.onMessageType("get-selected-entities", async (data) => {
    ModuleLogger.info(`Received get selected entities request:`, data);
    
    try {
        const scene = (game as Game).scenes?.active;
        if (!scene) {
            throw new Error("No active scene found");
        }

        const selectedTokens = canvas?.tokens?.controlled || [];
        const selectedUuids = selectedTokens.map(token => ({
            tokenUuid: token.document.uuid,
            actorUuid: token.actor?.uuid || null
        }));

        socketManager.send({
            type: "selected-entities-result",
            requestId: data.requestId,
            success: true,
            selected: selectedUuids
        });
    } catch (error) {
        ModuleLogger.error(`Error getting selected entities:`, error);
        socketManager.send({
            type: "selected-entities-result",
            requestId: data.requestId,
            success: false,
            error: (error as Error).message
        });
    }
});
}
