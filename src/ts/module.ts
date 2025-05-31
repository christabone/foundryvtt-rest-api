// src/ts/module.ts
import "../styles/style.scss";
import { FoundryRestApi } from "./types";
import { moduleId, recentRolls, MAX_ROLLS_STORED } from "./constants";
import { ModuleLogger } from "./utils/logger";
import { initializeWebSocket } from "./network/webSocketEndpoints";

// Declare QuickInsert interface
declare global {
  interface Window {
    QuickInsert: {
      open: (context: any) => void;
      search: (text: string, filter?: ((item: any) => boolean) | null, max?: number) => Promise<any[]>;
      forceIndex: () => void;
      handleKeybind: (event: KeyboardEvent, context: any) => void;
      hasIndex: boolean;
    };
  }
}

Hooks.once("init", () => {
  console.log(`Initializing ${moduleId}`);
  
  // Register module settings for WebSocket configuration
  (game as Game).settings.register(moduleId, "wsRelayUrl", {
    name: "Local Relay Server URL",
    hint: "URL for the local FoundryVTT relay server (WebSocket connection)",
    scope: "world",
    config: true,
    type: String,
    default: "ws://localhost:3001/ws",
    requiresReload: true
  } as any);
  
  (game as Game).settings.register(moduleId, "apiKey", {
    name: "API Key",
    hint: "API Key for authentication with the local relay server (generated automatically)",
    scope: "world",
    config: true,
    type: String,
    default: (game as Game).world.id,
    requiresReload: true
  } as any);

  (game as Game).settings.register(moduleId, "logLevel", {
    name: "Log Level",
    hint: "Set the level of detail for module logging",
    scope: "world",
    config: true,
    type: Number,
    choices: {
      0: "debug",
      1: "info",
      2: "warn",
      3: "error"
    } as any,
    default: 2
  });

  // Add new settings for connection management
  (game as Game).settings.register(moduleId, "pingInterval", {
    name: "Ping Interval (seconds)",
    hint: "How often (in seconds) the module sends a ping to the local relay server to keep the connection alive.",
    scope: "world",
    config: true,
    type: Number,
    default: 30,
    range: {
      min: 5,
      max: 600,
      step: 1
    },
    requiresReload: true
  } as any);

  (game as Game).settings.register(moduleId, "reconnectMaxAttempts", {
    name: "Max Reconnect Attempts",
    hint: "Maximum number of times the module will try to reconnect after losing connection.",
    scope: "world",
    config: true,
    type: Number,
    default: 20,
    requiresReload: true
  } as any);

  (game as Game).settings.register(moduleId, "reconnectBaseDelay", {
    name: "Reconnect Base Delay (ms)",
    hint: "Initial delay (in milliseconds) before the first reconnect attempt. Subsequent attempts use exponential backoff.",
    scope: "world",
    config: true,
    type: Number,
    default: 1000,
    requiresReload: true
  } as any);

  // Create and expose module API
  const module = (game as Game).modules.get(moduleId) as FoundryRestApi;
  module.api = {
    getWebSocketManager: () => {
      if (!module.socketManager) {
        ModuleLogger.warn(`WebSocketManager requested but not initialized`);
        return null;
      }
      return module.socketManager;
    },
    search: async (query: string, filter?: string) => {
      if (!window.QuickInsert) {
        ModuleLogger.error(`QuickInsert not available`);
        return [];
      }
      
      if (!window.QuickInsert.hasIndex) {
        ModuleLogger.info(`QuickInsert index not ready, forcing index creation`);
        try {
          window.QuickInsert.forceIndex();
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          ModuleLogger.error(`Failed to force QuickInsert index:`, error);
        }
      }
      
      let filterFunc = null;
      if (filter) {
        filterFunc = (item: any) => item.documentType === filter;
      }
      
      return window.QuickInsert.search(query, filterFunc, 100);
    },
    getByUuid: async (uuid: string) => {
      try {
        return await fromUuid(uuid);
      } catch (error) {
        ModuleLogger.error(`Error getting entity by UUID:`, error);
        return null;
      }
    }
  };
});

// Replace the API key input field with a password field
Hooks.on("renderSettingsConfig", (_: SettingsConfig, html: JQuery) => {
  const apiKeyInput = html.find(`input[name="${moduleId}.apiKey"]`);
  if (apiKeyInput.length) {
    // Change the input type to password
    apiKeyInput.attr("type", "password");

    // Add an event listener to save the value when it changes
    apiKeyInput.on("change", (event) => {
      const newValue = (event.target as HTMLInputElement).value;
      (game as Game).settings.set(moduleId, "apiKey", newValue).then(() => {
        new Dialog({
          title: "Reload Required",
          content: "<p>The API Key has been updated. A reload is required for the changes to take effect. Would you like to reload now?</p>",
          buttons: {
            yes: {
              label: "Reload",
              callback: () => window.location.reload()
            },
            no: {
              label: "Later"
            }
          },
          default: "yes"
        }).render(true);
      });
    });
  }
});

Hooks.once("ready", () => {
  setTimeout(() => {
    initializeWebSocket();
  }, 1000);
});

Hooks.on("createChatMessage", (message: any) => {
  if (message.isRoll && message.rolls?.length > 0) {
    ModuleLogger.info(`Detected dice roll from ${message.user?.name || 'unknown'}`);
    
    // Generate a unique ID using the message ID to prevent duplicates
    const rollId = message.id;
    
    // Format roll data
    const rollData = {
      id: rollId,
      messageId: message.id,
      user: {
        id: message.user?.id,
        name: message.user?.name
      },
      speaker: message.speaker,
      flavor: message.flavor || "",
      rollTotal: message.rolls[0].total,
      formula: message.rolls[0].formula,
      isCritical: message.rolls[0].isCritical || false,
      isFumble: message.rolls[0].isFumble || false,
      dice: message.rolls[0].dice?.map((d: any) => ({
        faces: d.faces,
        results: d.results.map((r: any) => ({
          result: r.result,
          active: r.active
        }))
      })),
      timestamp: Date.now()
    };
    
    // Check if this roll ID already exists in recentRolls
    const existingIndex = recentRolls.findIndex(roll => roll.id === rollId);
    if (existingIndex !== -1) {
      // If it exists, update it instead of adding a new entry
      recentRolls[existingIndex] = rollData;
    } else {
      // Add to recent rolls
      recentRolls.unshift(rollData);
      
      // Trim the array if needed
      if (recentRolls.length > MAX_ROLLS_STORED) {
        recentRolls.length = MAX_ROLLS_STORED;
      }
    }
    
    // Send to local relay server if connected
    const module = (game as Game).modules.get(moduleId) as FoundryRestApi;
    if (module.socketManager?.isConnected()) {
      module.socketManager.send({
        type: "roll-data",
        data: rollData
      });
    }
  }
});
