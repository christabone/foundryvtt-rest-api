import { ModuleLogger } from "../../utils/logger";
import { WebSocketManager } from "../webSocketManager";
import { parseFilterString, matchesAllFilters } from "../../utils/search";

/**
 * Register all search-related WebSocket message handlers
 */
export function registerSearchHandlers(socketManager: WebSocketManager) {
    // Handle search requests
    socketManager.onMessageType("perform-search", async (data) => {
        ModuleLogger.info(`Received search request:`, data);
        
        try {
        if (!window.QuickInsert) {
            ModuleLogger.error(`QuickInsert not available`);
            socketManager.send({
            type: "search-results",
            requestId: data.requestId,
            query: data.query,
            error: "QuickInsert not available",
            results: []
            });
            return;
        }
        
        if (!window.QuickInsert.hasIndex) {
            ModuleLogger.info(`QuickInsert index not ready, forcing index creation`);
            try {
            window.QuickInsert.forceIndex();
            await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
            ModuleLogger.error(`Failed to force QuickInsert index:`, error);
            socketManager.send({
                type: "search-results",
                requestId: data.requestId,
                query: data.query,
                error: "QuickInsert index not ready",
                results: []
            });
            return;
            }
        }

        let filterFunc = null;
        if (data.filter) {
            const filters = typeof data.filter === 'string' ? 
            parseFilterString(data.filter) : data.filter;

            filterFunc = (result: any) => {
            return matchesAllFilters(result, filters);
            };
        }
        
        const filteredResults = await window.QuickInsert.search(data.query, filterFunc, 200);
        ModuleLogger.info(`Search returned ${filteredResults.length} results`);
        
        socketManager.send({
            type: "search-results",
            requestId: data.requestId,
            query: data.query,
            filter: data.filter,
            results: filteredResults.map(result => {
            const item = result.item;
            
            return {
                documentType: item.documentType,
                folder: item.folder,
                id: item.id,
                name: item.name,
                package: item.package,
                packageName: item.packageName,
                subType: item.subType,
                uuid: item.uuid,
                icon: item.icon,
                journalLink: item.journalLink,
                tagline: item.tagline || "",
                formattedMatch: result.formattedMatch || "",
                resultType: item.constructor?.name
            };
            })
        });
        } catch (error) {
        ModuleLogger.error(`Error performing search:`, error);
        socketManager.send({
            type: "search-results",
            requestId: data.requestId,
            query: data.query,
            error: (error as Error).message,
            results: []
        });
        }
    });

    // Handle structure request
    socketManager.onMessageType("get-structure", async (data) => {
        ModuleLogger.info(`Received structure request`);
        
        try {
        // Get all folders
        const folders = Object.entries((game as Game).folders?.contents || []).map(([_, folder]) => {
            return {
            id: folder.id,
            name: folder.name,
            type: folder.type,
            parent: folder.parent?.id,
            path: folder.uuid,
            sorting: (folder as any).sort,
            sortingMode: (folder as any).sortingMode
            };
        });
        
        // Get all compendiums
        const compendiums = (game as Game).packs.contents.map(pack => {
            return {
            id: pack.collection,
            name: pack.metadata.label,
            path: `Compendium.${pack.collection}`,
            entity: pack.documentName,
            package: pack.metadata.package,
            packageType: pack.metadata.type,
            system: pack.metadata.system
            };
        });
        
        socketManager.send({
            type: "structure-data",
            requestId: data.requestId,
            folders,
            compendiums
        });
        } catch (error) {
        ModuleLogger.error(`Error getting structure:`, error);
        socketManager.send({
            type: "structure-data",
            requestId: data.requestId,
            error: (error as Error).message,
            folders: [],
            compendiums: []
        });
        }
    });

    // Handle contents request
    socketManager.onMessageType("get-contents", async (data) => {
        ModuleLogger.info(`Received contents request for path: ${data.path}`);
        
        try {
        let contents = [];
        
        if (data.path.startsWith("Compendium.")) {
            // Handle compendium path
            const pack = (game as Game).packs.get(data.path.replace("Compendium.", ""));
            if (!pack) {
            throw new Error(`Compendium not found: ${data.path}`);
            }
            
            // Get the index if not already loaded
            const index = await pack.getIndex();
            
            // Return entries from the index
            contents = index.contents.map(entry => {
            return {
                uuid: `${pack.collection}.${entry._id}`,
                id: entry._id,
                name: entry.name,
                img: 'img' in entry ? entry.img : null,
                type: 'type' in entry ? entry.type : null
            };
            });
        } else {
            // Handle folder path
            // Extract folder ID from path like "Folder.abcdef12345"
            const folderMatch = data.path.match(/Folder\.([a-zA-Z0-9]+)/);
            if (!folderMatch) {
            throw new Error(`Invalid folder path: ${data.path}`);
            }
            
            const folderId = folderMatch[1];
            const folder = (game as Game).folders?.get(folderId);
            
            if (!folder) {
            throw new Error(`Folder not found: ${data.path}`);
            }
            
            // Get entities in folder
            contents = folder.contents.map(entity => {
            return {
                uuid: entity.uuid,
                id: entity.id,
                name: entity.name,
                img: 'img' in entity ? entity.img : null,
                type: entity.documentName
            };
            });
        }
        
        socketManager.send({
            type: "contents-data",
            requestId: data.requestId,
            path: data.path,
            entities: contents
        });
        } catch (error) {
        ModuleLogger.error(`Error getting contents:`, error);
        socketManager.send({
            type: "contents-data",
            requestId: data.requestId,
            path: data.path,
            error: (error as Error).message,
            entities: []
        });
        }
    });
}