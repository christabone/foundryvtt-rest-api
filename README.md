# FoundryVTT REST API - Local Integration

A FoundryVTT module that provides REST API endpoints for interacting with your Foundry world data through a local relay server.

## Installation

### Option 1: Manifest URL Installation (Recommended)

1. Open FoundryVTT and navigate to the **Add-on Modules** tab in the **Configuration and Setup** menu
2. Click **Install Module**
3. In the **Manifest URL** field, paste: 
   ```
   https://github.com/christabone/foundryvtt-rest-api/releases/latest/download/module.json
   ```
4. Click **Install**
5. Enable the module in your world's module settings

### Option 2: Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/christabone/foundryvtt-rest-api/releases/latest)
2. Extract the contents to your FoundryVTT `Data/modules/foundry-rest-api/` directory
3. Restart FoundryVTT and enable the module in your world's module settings

## Local Relay Server Setup

This module is designed to work with a local relay server instead of external services. You'll need to:

1. **Set up the local relay server** - Ensure your local relay server is running on `ws://localhost:3001/ws`
2. **Configure the module** - The module will automatically use the local relay server configuration
    

---

This FoundryVTT module provides REST API functionality by connecting to a local relay server, enabling external applications to interact with your Foundry world data.

## Getting Started

After installation and configuration, you can start using the REST API:

1. **Ensure Local Relay Server**: Make sure your local relay server is running
2. **Configure Module**: Set the correct local relay server URL in module settings
3. **API Authentication**: Use your API key for all requests via the "x-api-key" header
4. **Client ID**: Most endpoints require a clientId parameter that matches your connected world

## Configuration

After installing and enabling the module, configure it in your world settings:

1. Go to **Game Settings** → **Configure Settings** → **Module Settings**
2. Find **Foundry REST API** in the list
3. Configure the following settings:

### Module Settings

- **Local Relay Server URL**: URL for the local WebSocket relay server (default: `ws://localhost:3001/ws`)
- **API Key**: Authentication key for the local relay server (auto-generated based on your world ID)
- **Log Level**: Controls the verbosity of module logs (Debug, Info, Warn, Error)
- **Ping Interval (seconds)**: How often the module pings the local relay server (default: `30`)
- **Max Reconnect Attempts**: Maximum reconnection attempts if connection drops (default: `20`)
- **Reconnect Base Delay (ms)**: Initial delay before reconnection attempts with exponential backoff (default: `1000`)

### Prerequisites

Before using this module, ensure:

1. **Local Relay Server**: Your local relay server is running and accessible at `ws://localhost:3001/ws`
2. **Network Access**: FoundryVTT can reach the local relay server (same machine or local network)
3. **Module Activation**: The module is enabled in your world's module settings

## Usage

Once configured, the module will:

- Automatically connect to your local relay server when FoundryVTT starts
- Provide REST API endpoints for external applications to interact with your world
- Handle WebSocket communication between FoundryVTT and the local relay server
- Support game operations like dice rolls, combat management, and entity manipulation

## Troubleshooting

### Connection Issues

- **Module not connecting**: Verify the local relay server is running on the configured port
- **Connection drops**: Check network connectivity and firewall settings
- **Authentication errors**: Ensure the API key matches between the module and relay server

### Common Problems

- **Module not loading**: Check that the module is properly installed and enabled
- **WebSocket errors**: Verify the relay server URL format (should start with `ws://` for local connections)
- **API key issues**: Try regenerating the API key or using your world ID as the key
