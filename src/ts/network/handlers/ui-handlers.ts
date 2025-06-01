import { ModuleLogger } from "../../utils/logger";
import { WebSocketManager } from "../webSocketManager";

/**
 * Register UI-related message handlers
 */
export function registerUIHandlers(socketManager: WebSocketManager): void {
    // Handle actor (or entity) sheet HTML request
    socketManager.onMessageType("get-sheet-html", async (data) => {
        ModuleLogger.info(`Received sheet HTML request for UUID: ${data.uuid}`);
        
        try {
        let actor: Actor | TokenDocument | null = null;
        if (data.uuid) {
            // Get the actor from its UUID
            actor = await fromUuid(data.uuid) as Actor;
        } else if (data.selected) {
            // Get the controlled tokens
            const controlledTokens = canvas?.tokens?.controlled;
            if (controlledTokens && controlledTokens.length > 0) {
                if (data.actor) {
                    actor = controlledTokens[0].actor;
                } else {
                    actor = controlledTokens[0].document;
                }
            }
        }
        if (!actor) {
            ModuleLogger.error(`Entity not found for UUID: ${data.uuid}`);
            socketManager.send({
            type: "actor-sheet-html-response",
            requestId: data.requestId,
            data: { error: "Entity not found", uuid: data.uuid }
            });
            return;
        }
        
        // Create a temporary sheet to render
        const sheet = actor.sheet?.render(true) as ActorSheet;
        
        // Wait for the sheet to render
        setTimeout(async () => {
            try {
            // Get the HTML content
            if (!sheet.element || !sheet.element[0]) {
                throw new Error("Failed to render actor sheet");
            }
            
            let html = sheet.element[0].outerHTML;
            
            // Get the associated CSS - much more comprehensive approach
            let css = '';
            
            // Get the sheet's appId for later comparisons
            const sheetAppId = String(sheet.appId);
            
            // 1. Get CSS from style elements with data-appid matching the sheet
            const appStyles = document.querySelectorAll('style[data-appid]');
            appStyles.forEach(style => {
                const styleAppId = (style as HTMLElement).dataset.appid;
                if (styleAppId === sheetAppId) {
                css += style.textContent + '\n';
                }
            });
            
            // 2. Get global system styles that might apply to this sheet
            const systemStyles = document.querySelectorAll(`style[id^="system-${(actor as any).type}"]`);
            systemStyles.forEach(style => {
                css += style.textContent + '\n';
            });
            
            // 3. Extract all classes and IDs from the HTML to capture all relevant styles
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Create sets to avoid duplicates
            const classNames = new Set<string>();
            const ids = new Set<string>();
            
            // Function to extract classes and IDs from an element and its children
            function extractClassesAndIds(element: Element) {
                // Get classes
                if (element.classList && element.classList.length) {
                element.classList.forEach(className => classNames.add(className));
                }
                
                // Get ID
                if (element.id) {
                ids.add(element.id);
                }
                
                // Process children recursively
                for (let i = 0; i < element.children.length; i++) {
                extractClassesAndIds(element.children[i]);
                }
            }
            
            // Extract classes and IDs from all elements
            extractClassesAndIds(tempDiv);
            
            // Convert sets to arrays
            const uniqueClassNames = Array.from(classNames);
            const uniqueIds = Array.from(ids);
            
            ModuleLogger.debug(`Extracted ${uniqueClassNames.length} unique classes and ${uniqueIds.length} unique IDs`);
            
            // 4. Collect all stylesheets in the document
            const allStyles = document.querySelectorAll('style');
            const allLinks = document.querySelectorAll('link[rel="stylesheet"]');
            
            // Process inline styles
            allStyles.forEach(style => {
                // Skip if we already added this style sheet (avoid duplicates)
                if (style.dataset.appid && style.dataset.appid === sheetAppId) {
                return; // Already added above
                }
                
                const styleContent = style.textContent || '';
                
                // Check if this style contains any of our classes or IDs
                const isRelevant = uniqueClassNames.some(className => 
                styleContent.includes(`.${className}`)) || 
                uniqueIds.some(id => styleContent.includes(`#${id}`)) ||
                // Common selectors that might apply
                styleContent.includes('.window-app') || 
                styleContent.includes('.sheet') || 
                styleContent.includes('.actor-sheet') ||
                styleContent.includes(`.${(actor as any).type}-sheet`);
                
                if (isRelevant) {
                ModuleLogger.debug(`Adding relevant inline style`);
                css += styleContent + '\n';
                }
            });
            
            // 5. Process external stylesheets
            const stylesheetPromises = Array.from(allLinks).map(async (link) => {
                try {
                const href = link.getAttribute('href');
                if (!href) return '';
                
                // Skip foundry-specific stylesheets that we'll handle separately
                if (href.includes('fonts.googleapis.com')) return '';
                
                ModuleLogger.debug(`Fetching external CSS from: ${href}`);
                const fullUrl = href.startsWith('http') ? href : 
                                href.startsWith('/') ? `${window.location.origin}${href}` : 
                                `${window.location.origin}/${href}`;
                
                const response = await fetch(fullUrl);
                if (!response.ok) {
                    ModuleLogger.warn(`Failed to fetch CSS: ${fullUrl}, status: ${response.status}`);
                    return '';
                }
                
                const styleContent = await response.text();
                return styleContent;
                } catch (e) {
                ModuleLogger.warn(`Failed to fetch external CSS: ${e}`);
                return '';
                }
            });
            
            // 6. Important: Add foundry core styles
            const baseUrl = window.location.origin;
            ModuleLogger.debug(`Base URL for fetching CSS: ${baseUrl}`);
            
            // Try different path patterns that might work with Foundry
            const coreStylesheets = [
                // Try various likely paths for foundry core styles
                `${baseUrl}/css/style.css`,
                `${baseUrl}/styles/style.css`,
                `${baseUrl}/styles/foundry.css`,
                `${baseUrl}/ui/sheets.css`,
                // Try with /game path prefix (common in some Foundry setups)
                `${baseUrl}/game/styles/foundry.css`,
                `${baseUrl}/game/ui/sheets.css`,
                // System-specific styles
                `${baseUrl}/systems/${(game as Game).system.id}/system.css`,
                `${baseUrl}/systems/${(game as Game).system.id}/styles/system.css`,
                // Try with /game path prefix for system styles
                `${baseUrl}/game/systems/${(game as Game).system.id}/system.css`,
                `${baseUrl}/game/systems/${(game as Game).system.id}/styles/system.css`
            ];
            
            // Add more debugging to identify the correct paths
            ModuleLogger.debug(`All stylesheet links in document:`, 
                Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .map(link => link.getAttribute('href'))
                .filter(Boolean)
            );
            
            // Extract potential stylesheet paths from existing links
            const existingCSSPaths = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .map(link => link.getAttribute('href'))
                .filter((href): href is string => 
                href !== null && 
                !href.includes('fonts.googleapis.com') && 
                !href.includes('//'));
            
            // Add these paths to our core stylesheets
            coreStylesheets.push(...existingCSSPaths);
            
            // Debug current document styles to see what's actually loaded
            ModuleLogger.debug(`All style elements in document:`, 
                document.querySelectorAll('style').length
            );
            
            const corePromises = coreStylesheets.map(async (path) => {
                try {
                ModuleLogger.debug(`Fetching core CSS from: ${path}`);
                const response = await fetch(path);
                if (!response.ok) {
                    ModuleLogger.warn(`Failed to fetch CSS: ${path}, status: ${response.status}`);
                    return '';
                }
                
                // If successful, log it clearly
                ModuleLogger.info(`Successfully loaded CSS from: ${path}`);
                return await response.text();
                } catch (e) {
                ModuleLogger.warn(`Failed to fetch core CSS: ${e}`);
                return '';
                }
            });
            
            // Wait for all external CSS to be fetched
            const allPromises = [...stylesheetPromises, ...corePromises];
            const externalStyles = await Promise.all(allPromises);
            externalStyles.forEach(style => {
                css += style + '\n';
            });
            
            // 7. Add fallback styles if needed
            if (css.length < 100) {
                ModuleLogger.warn(`CSS fetch failed or returned minimal content. Adding fallback styles.`);
                css += `
    /* Fallback styles for actor sheet */
    .window-app {
        font-family: "Signika", sans-serif;
        background: #f0f0e0;
        border-radius: 5px;
        box-shadow: 0 0 20px #000;
        color: #191813;
    }
    .window-content {
        background: rgba(255, 255, 240, 0.9);
        padding: 8px;
        overflow-y: auto;
        background: url(${window.location.origin}/ui/parchment.jpg) repeat;
    }
    input, select, textarea {
        border: 1px solid #7a7971;
        background: rgba(255, 255, 255, 0.8);
    }
    button {
        background: rgba(0, 0, 0, 0.1);
        border: 1px solid #7a7971;
        border-radius: 3px;
        cursor: pointer;
    }
    .profile-img {
        border: none;
        max-width: 100%;
        max-height: 220px;
    }
    `;
            }
            
            // Log the CSS collection results
            ModuleLogger.debug(`Collected CSS: ${css.length} bytes`);
            
            // Before sending the HTML, fix asset URLs
            html = html.replace(/src="([^"]+)"/g, (match, src) => {
                if (src.startsWith('http')) return match;
                if (src.startsWith('/')) return `src="${window.location.origin}${src}"`;
                return `src="${window.location.origin}/${src}"`;
            });

            // Also fix background images in styles
            css = css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, url) => {
                if (url.startsWith('http') || url.startsWith('data:')) return match;
                if (url.startsWith('/')) return `url('${window.location.origin}${url}')`;
                return `url('${window.location.origin}/${url}')`;
            });

            // Close the temporary sheet
            sheet.close();
            
            // Send the HTML and CSS back
            socketManager.send({
                type: "actor-sheet-html-response",
                requestId: data.requestId,
                data: { html, css, uuid: data.uuid }
            });

            // Add confirmation log
            ModuleLogger.debug(`Sent actor sheet HTML response with requestId: ${data.requestId}`);
            ModuleLogger.debug(`HTML length: ${html.length}, CSS length: ${css.length}`);
            } catch (renderError) {
            ModuleLogger.error(`Error capturing actor sheet HTML:`, renderError);
            socketManager.send({
                type: "actor-sheet-html-response",
                requestId: data.requestId,
                data: { error: "Failed to capture actor sheet HTML", uuid: data.uuid }
            });
            
            // Make sure to close the sheet if it was created
            if (sheet && typeof sheet.close === 'function') {
                sheet.close();
            }
            }
        }, 500); // Small delay to ensure rendering is complete
        
        } catch (error) {
        ModuleLogger.error(`Error rendering actor sheet:`, error);
        socketManager.send({
            type: "actor-sheet-html-response",
            requestId: data.requestId,
            data: { error: "Failed to render actor sheet", uuid: data.uuid }
        });
        }
    });

    // Handle get macros request
    socketManager.onMessageType("get-macros", async (data) => {
        ModuleLogger.info(`Received request for macros`);
        
        try {
        // Get all macros the current user has access to
        const macros = (game as Game).macros?.contents.map(macro => {
            return {
            uuid: macro.uuid,
            id: macro.id,
            name: macro.name,
            type: (macro as any).type || (macro as any).data?.type || "unknown",
            author: (macro as any).author?.name || "unknown",
            command: (macro as any).command || "",
            img: (macro as any).img,
            scope: (macro as any).scope,
            canExecute: (macro as any).canExecute
            };
        }) || [];

        socketManager.send({
            type: "macros-list",
            requestId: data.requestId,
            macros
        });
        } catch (error) {
        ModuleLogger.error(`Error getting macros list:`, error);
        socketManager.send({
            type: "macros-list",
            requestId: data.requestId,
            error: (error as Error).message,
            macros: []
        });
        }
    });

    // Handle get hotbar request
    socketManager.onMessageType("get-hotbar", async (data) => {
        ModuleLogger.info(`Received request for hotbar data:`, data);
        ModuleLogger.info(`data.page = ${data.page}, ui.hotbar.page = ${((ui as any).hotbar?.page)}`);
        
        try {
            // Use the official FoundryVTT API: User.getHotbarMacros()
            // Use requested page or current page
            const requestedPage = data.page || ((ui as any).hotbar?.page) || 1;
            const currentPage = requestedPage;
            const hotbarData: any[] = [];
            
            ModuleLogger.info(`Getting hotbar data for page ${currentPage}`);
            
            if ((game as Game)?.user && typeof ((game as Game).user as any).getHotbarMacros === 'function') {
                // Use the official API method
                const hotbarMacros = ((game as Game).user as any).getHotbarMacros(currentPage);
                ModuleLogger.info(`Found ${hotbarMacros.length} hotbar macros on page ${currentPage}`);
                
                // Create a map of slot number to macro for easy lookup
                const macrosBySlot = new Map();
                hotbarMacros.forEach((entry: any) => {
                    macrosBySlot.set(entry.slot, entry.macro);
                });
                
                // Build the full hotbar (10 slots per page)
                for (let slot = 1; slot <= 10; slot++) {
                    const macro = macrosBySlot.get(slot);
                    
                    if (macro) {
                        hotbarData.push({
                            slot: slot,
                            uuid: macro.uuid,
                            id: macro.id,
                            name: macro.name,
                            type: macro.type || "unknown",
                            img: macro.img,
                            command: macro.command || "",
                            canExecute: macro.canExecute,
                            author: macro.author?.name || "unknown"
                        });
                    } else {
                        hotbarData.push({
                            slot: slot,
                            empty: true
                        });
                    }
                }
            } else {
                ModuleLogger.warn("getHotbarMacros method not available on game.user");
                // Fallback: return empty slots
                for (let slot = 1; slot <= 10; slot++) {
                    hotbarData.push({
                        slot: slot,
                        empty: true,
                        error: "getHotbarMacros_not_available"
                    });
                }
            }
            
            socketManager.send({
                type: "hotbar-data",
                requestId: data.requestId,
                currentPage: currentPage,
                hotbar: hotbarData
            });
        } catch (error) {
            ModuleLogger.error(`Error getting hotbar data:`, error);
            socketManager.send({
                type: "hotbar-data",
                requestId: data.requestId,
                error: (error as Error).message,
                hotbar: []
            });
        }
    });

    // Handle execute macro request
    socketManager.onMessageType("execute-macro", async (data) => {
        ModuleLogger.info(`Received request to execute macro: ${data.uuid}`);
        
        try {
        if (!data.uuid) {
            throw new Error("Macro UUID is required");
        }
        
        // Get the macro by UUID
        const macro = await fromUuid(data.uuid) as Macro;
        if (!macro) {
            throw new Error(`Macro not found with UUID: ${data.uuid}`);
        }
        
        // Check if it's actually a macro
        if (!(macro instanceof CONFIG.Macro.documentClass)) {
            throw new Error(`Entity with UUID ${data.uuid} is not a macro`);
        }
        
        // Check if the macro can be executed
        if (!macro.canExecute) {
            throw new Error(`Macro '${macro.name}' cannot be executed by the current user`);
        }

        const args = data.args || {};
        
        // Execute the macro with args defined in the scope
        let result;
        if (typeof args === "object") {
            // Execute with args available as a variable
            result = await macro.execute({ args } as any);
        } else {
            // Fallback for non-object args
            result = await macro.execute();
        }
        
        // Return success
        socketManager.send({
            type: "macro-execution-result",
            requestId: data.requestId,
            uuid: data.uuid,
            success: true,
            result: typeof result === 'object' ? result : { value: result }
        });
        } catch (error) {
        ModuleLogger.error(`Error executing macro:`, error);
        socketManager.send({
            type: "macro-execution-result",
            requestId: data.requestId,
            uuid: data.uuid || "",
            success: false,
            error: (error as Error).message
        });
        }
    });
}