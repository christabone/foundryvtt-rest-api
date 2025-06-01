import { ModuleLogger } from "../../utils/logger";
import { WebSocketManager } from "../webSocketManager";

export function registerCombatHandlers(socketManager: WebSocketManager) {
    // Handle get encounters request
    socketManager.onMessageType("get-encounters", async (data) => {
        ModuleLogger.info(`Received request for encounters`);
        
        try {
        // Get all combats (encounters) in the world
        const encounters = (game as Game).combats?.contents.map(combat => {
            return {
            id: combat.id,
            name: combat.name,
            round: combat.round,
            turn: combat.turn,
            current: combat.id === (game as Game).combat?.id,
            combatants: combat.combatants.contents.map(c => ({
                id: c.id,
                name: c.name,
                tokenUuid: c.token?.uuid,
                actorUuid: c.actor?.uuid,
                img: c.img,
                initiative: c.initiative,
                hidden: c.hidden,
                defeated: c.isDefeated
            }))
            };
        }) || [];

        socketManager.send({
            type: "encounters-list",
            requestId: data.requestId,
            encounters
        });
        } catch (error) {
        ModuleLogger.error(`Error getting encounters list:`, error);
        socketManager.send({
            type: "encounters-list",
            requestId: data.requestId,
            error: (error as Error).message,
            encounters: []
        });
        }
    });

    // Handle start encounter request
    socketManager.onMessageType("start-encounter", async (data) => {
        ModuleLogger.info(`Received request to start encounter with options:`, data);
        
        try {
        // Create a new combat encounter
        const combat = await Combat.create({ name: data.name || "New Encounter" });
        
        if (combat) {
            await combat.startCombat();
            // Add the specified tokens if any were provided
            if (data.tokenUuids && data.tokenUuids.length > 0) {
            const tokensData = [];
            
            for (const uuid of data.tokenUuids) {
                try {
                const token = await fromUuid(uuid);
                if (token) {
                    tokensData.push({
                    tokenId: token.id ?? '',
                    sceneId: token.parent.id
                    });
                }
                } catch (err) {
                ModuleLogger.warn(`Failed to add token ${uuid} to combat:`, err);
                }
            }
            
            if (tokensData.length > 0) {
                await combat.createEmbeddedDocuments("Combatant", tokensData);
            }
            }

            let addedTokenIds = new Set();

            // Add player combatants if specified
            if (data.startWithPlayers) {
            // Get the current viewed scene
            const currentScene = (game as Game).scenes?.viewed;
            
            if (currentScene) {
                // Get all tokens on the scene that have player actors
                const playerTokens = currentScene.tokens?.filter(token => {
                // Check if token has an actor and the actor is a player character
                return !!token.actor && token.actor.hasPlayerOwner;
                }) ?? [];
                
                // Create combatants from these tokens
                const tokenData = playerTokens.map(token => {
                addedTokenIds.add(token.id);
                return {
                tokenId: token.id,
                sceneId: currentScene.id
                };
                });
                
                if (tokenData.length > 0) {
                await combat.createEmbeddedDocuments("Combatant", tokenData);
                }
            }
            }

            // Add selected tokens if specified, but only if they weren't already added
            if (data.startWithSelected) {
            const selectedTokens = canvas?.tokens?.controlled
                .filter(token => !addedTokenIds.has(token.id))
                .map(token => {
                return {
                tokenId: token.id,
                sceneId: token.scene.id
                };
                }) ?? [];
            
            if (selectedTokens.length > 0) {
                await combat.createEmbeddedDocuments("Combatant", selectedTokens);
            }
            } 
            
            // Roll initiative for all npc combatants
            if (data.rollNPC) {
            await combat.rollNPC();
            }

            // Roll initiative for all combatants
            if (data.rollAll) {
            await combat.rollAll();
            }
            
            // Activate this combat
            await combat.activate();
            
            socketManager.send({
            type: "encounter-started",
            requestId: data.requestId,
            encounterId: combat.id,
            encounter: {
                id: combat.id,
                name: combat.name,
                round: combat.round,
                turn: combat.turn,
                combatants: combat.combatants.contents.map(c => ({
                id: c.id,
                name: c.name,
                tokenUuid: c.token?.uuid,
                actorUuid: c.actor?.uuid,
                img: c.img,
                initiative: c.initiative,
                hidden: c.hidden,
                defeated: c.isDefeated
                }))
            }
            });
        } else {
            throw new Error("Failed to create encounter");
        }
        } catch (error) {
        ModuleLogger.error(`Error starting encounter:`, error);
        socketManager.send({
            type: "encounter-started",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });

    // Handle next turn request
    socketManager.onMessageType("encounter-next-turn", async (data) => {
        ModuleLogger.info(`Received request for next turn in encounter: ${data.encounterId || 'active'}`);
        
        try {
        const combat = data.encounterId ? (game as Game).combats?.get(data.encounterId) : (game as Game).combat;
        
        if (!combat) {
            throw new Error(data.encounterId ? 
            `Encounter with ID ${data.encounterId} not found` : 
            "No active encounter");
        }
        
        await combat.nextTurn();
        
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            encounterId: combat.id,
            action: "nextTurn",
            currentTurn: combat.turn,
            currentRound: combat.round,
            actorTurn: combat.combatant?.actor?.uuid,
            tokenTurn: combat.combatant?.token?.uuid,
            encounter: {
            id: combat.id,
            name: combat.name,
            round: combat.round,
            turn: combat.turn
            }
        });
        } catch (error) {
        ModuleLogger.error(`Error advancing to next turn:`, error);
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });

    // Handle next round request
    socketManager.onMessageType("encounter-next-round", async (data) => {
        ModuleLogger.info(`Received request for next round in encounter: ${data.encounterId || 'active'}`);
        
        try {
        const combat = data.encounterId ? (game as Game).combats?.get(data.encounterId) : (game as Game).combat;
        
        if (!combat) {
            throw new Error(data.encounterId ? 
            `Encounter with ID ${data.encounterId} not found` : 
            "No active encounter");
        }
        
        await combat.nextRound();
        
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            encounterId: combat.id,
            action: "nextRound",
            currentTurn: combat.turn,
            currentRound: combat.round,
            actorTurn: combat.combatant?.actor?.uuid,
            tokenTurn: combat.combatant?.token?.uuid,
            encounter: {
            id: combat.id,
            name: combat.name,
            round: combat.round,
            turn: combat.turn
            }
        });
        } catch (error) {
        ModuleLogger.error(`Error advancing to next round:`, error);
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });

    // Handle previous turn request
    socketManager.onMessageType("encounter-previous-turn", async (data) => {
        ModuleLogger.info(`Received request for previous turn in encounter: ${data.encounterId || 'active'}`);
        
        try {
        const combat = data.encounterId ? (game as Game).combats?.get(data.encounterId) : (game as Game).combat;
        
        if (!combat) {
            throw new Error(data.encounterId ? 
            `Encounter with ID ${data.encounterId} not found` : 
            "No active encounter");
        }
        
        await combat.previousTurn();
        
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            encounterId: combat.id,
            action: "previousTurn",
            currentTurn: combat.turn,
            currentRound: combat.round,
            actorTurn: combat.combatant?.actor?.uuid,
            tokenTurn: combat.combatant?.token?.uuid,
            encounter: {
            id: combat.id,
            name: combat.name,
            round: combat.round,
            turn: combat.turn
            }
        });
        } catch (error) {
        ModuleLogger.error(`Error going back to previous turn:`, error);
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });

    // Handle previous round request
    socketManager.onMessageType("encounter-previous-round", async (data) => {
        ModuleLogger.info(`Received request for previous round in encounter: ${data.encounterId || 'active'}`);
        
        try {
        const combat = data.encounterId ? (game as Game).combats?.get(data.encounterId) : (game as Game).combat;
        
        if (!combat) {
            throw new Error(data.encounterId ? 
            `Encounter with ID ${data.encounterId} not found` : 
            "No active encounter");
        }
        
        await combat.previousRound();
        
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            encounterId: combat.id,
            action: "previousRound",
            currentTurn: combat.turn,
            currentRound: combat.round,
            actorTurn: combat.combatant?.actor?.uuid,
            tokenTurn: combat.combatant?.token?.uuid,
            encounter: {
            id: combat.id,
            name: combat.name,
            round: combat.round,
            turn: combat.turn
            }
        });
        } catch (error) {
        ModuleLogger.error(`Error going back to previous round:`, error);
        socketManager.send({
            type: "encounter-navigation",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });

    // Handle end encounter request
    socketManager.onMessageType("end-encounter", async (data) => {
        ModuleLogger.info(`Received request to end encounter: ${data.encounterId}`);
        
        try {
        let encounterId = data.encounterId;
        if (!encounterId) {
            encounterId = (game as Game).combat?.id;
        }
        
        const combat = (game as Game).combats?.get(encounterId);
        
        if (!combat) {
            throw new Error(`No encounter not found`);
        }
        
        await combat.delete();
        
        socketManager.send({
            type: "encounter-ended",
            requestId: data.requestId,
            encounterId: encounterId,
            message: "Encounter successfully ended"
        });
        } catch (error) {
        ModuleLogger.error(`Error ending encounter:`, error);
        socketManager.send({
            type: "encounter-ended",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });

    // Handle add-to-encounter request
    socketManager.onMessageType("add-to-encounter", async (data) => {
        ModuleLogger.info(`Received add-to-encounter request for encounter: ${data.encounterId}`);
        
        try {
        // Get the combat
        const combat = data.encounterId ? 
            (game as Game).combats?.get(data.encounterId) : 
            (game as Game).combat;
        
        if (!combat) {
            throw new Error(data.encounterId ? 
            `Encounter with ID ${data.encounterId} not found` : 
            "No active encounter");
        }
        
        const addedEntities: string[] = [];
        const failedEntities = [];
        
        // Process UUIDs to add
        if (data.uuids && Array.isArray(data.uuids)) {
            for (const uuid of data.uuids) {
            try {
                // Get the entity from UUID
                const entity = await fromUuid(uuid);
                
                if (!entity) {
                failedEntities.push({ uuid, reason: "Entity not found" });
                continue;
                }
                
                // Handle depending on entity type - token or actor
                if (entity.documentName === "Token") {
                const token = entity;
                const combatantData = {
                    tokenId: token.id,
                    sceneId: token.parent?.id
                };
                
                await combat.createEmbeddedDocuments("Combatant", [combatantData]);
                addedEntities.push(uuid);
                } else if (entity.documentName === "Actor") {
                // For actors, we need a token representation
                // Here we check if actor has a token on the current scene
                const scene = (game as Game).scenes?.viewed;
                if (scene) {
                    const tokenForActor = scene.tokens?.find(t => t.actor?.id === entity.id);
                    if (tokenForActor) {
                    const combatantData = {
                        tokenId: tokenForActor.id,
                        sceneId: scene.id
                    };
                    
                    await combat.createEmbeddedDocuments("Combatant", [combatantData]);
                    addedEntities.push(uuid);
                    } else {
                    failedEntities.push({ uuid, reason: "No token found for this actor in the current scene" });
                    }
                } else {
                    failedEntities.push({ uuid, reason: "No active scene" });
                }
                } else {
                failedEntities.push({ uuid, reason: "Entity must be a Token or Actor" });
                }
            } catch (err) {
                failedEntities.push({ uuid, reason: (err as Error).message });
            }
            }
        }
        
        // If selected is true, add selected tokens
        if (data.selected === true) {
            const selectedTokens = canvas?.tokens?.controlled || [];
            
            for (const token of selectedTokens) {
            try {
                if (!combat.combatants.find(c => c.token?.id === token.id && c.combat?.scene?.id === token.scene.id)) {
                    const combatantData = {
                    tokenId: token.id,
                    sceneId: token.scene.id
                    };
                    
                    await combat.createEmbeddedDocuments("Combatant", [combatantData]);
                    addedEntities.push(token.document.uuid);
                }
            } catch (err) {
                failedEntities.push({ uuid: token.document.uuid, reason: (err as Error).message });
            }
            }
        }
        
        // Roll initiative for new combatants if requested
        if (data.rollInitiative === true && addedEntities.length > 0) {
            combat.rollAll();
        }
        
        socketManager.send({
            type: "add-to-encounter-result",
            requestId: data.requestId,
            encounterId: combat.id,
            added: addedEntities,
            failed: failedEntities
        });
        } catch (error) {
        ModuleLogger.error(`Error adding to encounter:`, error);
        socketManager.send({
            type: "add-to-encounter-result",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });
    
    // Handle remove-from-encounter request
    socketManager.onMessageType("remove-from-encounter", async (data) => {
        ModuleLogger.info(`Received remove-from-encounter request for encounter: ${data.encounterId}`);
        
        try {
        // Get the combat
        const combat = data.encounterId ? 
            (game as Game).combats?.get(data.encounterId) : 
            (game as Game).combat;
        
        if (!combat) {
            throw new Error(data.encounterId ? 
            `Encounter with ID ${data.encounterId} not found` : 
            "No active encounter");
        }
        
        const removedEntities = [];
        const failedEntities = [];
        const combatantIdsToRemove = [];
        
        // Process UUIDs to remove
        if (data.uuids && Array.isArray(data.uuids)) {
            for (const uuid of data.uuids) {
            try {
                // Find combatant(s) related to this UUID
                const entity = await fromUuid(uuid);
                
                if (!entity) {
                failedEntities.push({ uuid, reason: "Entity not found" });
                continue;
                }
                
                let foundCombatant = false;
                
                if (entity.documentName === "Token") {
                // Find combatant by token ID
                const combatant = combat.combatants.find(c => 
                    c.token?.id === entity.id && c.combat?.scene?.id === entity.parent?.id
                );
                
                if (combatant) {
                    combatantIdsToRemove.push(combatant.id);
                    foundCombatant = true;
                }
                } else if (entity.documentName === "Actor") {
                // Find all combatants with this actor
                const combatants = combat.combatants.filter(c => c.actor?.id === entity.id);
                
                if (combatants.length > 0) {
                    combatantIdsToRemove.push(...combatants.map(c => c.id));
                    foundCombatant = true;
                }
                }
                
                if (foundCombatant) {
                removedEntities.push(uuid);
                } else {
                failedEntities.push({ uuid, reason: "No combatant found for this entity" });
                }
            } catch (err) {
                failedEntities.push({ uuid, reason: (err as Error).message });
            }
            }
        }
        
        // If selected is true, remove selected tokens
        if (data.selected === true) {
            const selectedTokens = canvas?.tokens?.controlled || [];
            
            for (const token of selectedTokens) {
            const combatant = combat.combatants.find(c => 
                (c as any).tokenId === token.id && (c as any).sceneId === token.scene.id
            );
            
            if (combatant) {
                combatantIdsToRemove.push(combatant.id);
                removedEntities.push(token.document.uuid);
            }
            }
        }
        
        // Remove the combatants, filtering out any null IDs
        if (combatantIdsToRemove.length > 0) {
            const validIds = combatantIdsToRemove.filter((id): id is string => id !== null);
            if (validIds.length > 0) {
                await combat.deleteEmbeddedDocuments("Combatant", validIds);
            }
        }
        
        socketManager.send({
            type: "remove-from-encounter-result",
            requestId: data.requestId,
            encounterId: combat.id,
            removed: removedEntities,
            failed: failedEntities
        });
        } catch (error) {
        ModuleLogger.error(`Error removing from encounter:`, error);
        socketManager.send({
            type: "remove-from-encounter-result",
            requestId: data.requestId,
            error: (error as Error).message
        });
        }
    });
}
