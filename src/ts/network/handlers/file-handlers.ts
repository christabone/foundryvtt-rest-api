import { WebSocketManager } from "../webSocketManager";
import { ModuleLogger } from "../../utils/logger";

export function registerFileHandlers(socketManager: WebSocketManager) {
    
    // Browse files and directories using FilePicker
    socketManager.onMessageType("browse-files", async (data) => {
        ModuleLogger.info(`Received browse-files request:`, data);
        
        try {
            const { path, source = 'data' } = data;
            
            if (!path) {
                socketManager.send({
                    type: "browse-files-result",
                    requestId: data.requestId,
                    error: "Path parameter is required"
                });
                return;
            }

            // Use FoundryVTT's FilePicker.browse() method
            const result = await FilePicker.browse(source, path);
            
            socketManager.send({
                type: "browse-files-result", 
                requestId: data.requestId,
                path: path,
                source: source,
                directories: result.dirs || [],
                files: result.files || []
            });
            
        } catch (error) {
            ModuleLogger.error(`Failed to browse files:`, error);
            socketManager.send({
                type: "browse-files-result",
                requestId: data.requestId,
                error: `Failed to browse path: ${(error as Error).message}`,
                path: data.path || "",
                source: data.source || "data",
                directories: [],
                files: []
            });
        }
    });

    // Handle file system structure request
    socketManager.onMessageType("get-file-system", async (data) => {
        ModuleLogger.info(`Received get file system request:`, data);
        
        try {
            const path = data.path || "";
            const source = data.source || "data";
            const recursive = !!data.recursive;
            
            // Use FilePicker.browse() static method instead of creating a FilePicker instance
            // This avoids showing a dialog
            const result = await FilePicker.browse(source, path);
            
            // Build file structure response
            const dirs = Array.isArray(result.dirs) ? result.dirs.map((dir: string) => ({
                name: dir.split('/').pop() || dir,  // Use dir as fallback if pop returns undefined
                path: dir,
                type: 'directory'
            })) : [];
            
            const files = Array.isArray(result.files) ? result.files.map((file: string) => ({
                name: file.split('/').pop() || file,  // Use file as fallback if pop returns undefined
                path: file,
                type: 'file'
            })) : [];
            
            // If recursive, get subdirectories
            let subdirs: Array<{name: string, path: string, type: string}> = [];
            if (recursive && dirs.length > 0) {
                for (const dir of dirs) {
                    try {
                        // Use static method for subdirectories as well
                        const subResult = await FilePicker.browse(source, dir.path);
                        
                        // Process directories
                        const subDirs = Array.isArray(subResult.dirs) ? subResult.dirs.map((subdir: string) => ({
                            name: subdir.split('/').pop() || subdir,  // Add fallback
                            path: subdir,
                            type: 'directory'
                        })) : [];
                        
                        // Process files
                        const subFiles = Array.isArray(subResult.files) ? subResult.files.map((file: string) => ({
                            name: file.split('/').pop() || file,  // Add fallback
                            path: file,
                            type: 'file'
                        })) : [];
                        
                        // Add to subdirs collection
                        subdirs = subdirs.concat(subDirs, subFiles);
                        
                        // If deeply recursive, process subdirectories of subdirectories
                        if (recursive === true && subDirs.length > 0 && dir.path.split('/').length < 3) {
                            for (const subDir of subDirs) {
                                try {
                                    const deepResult = await FilePicker.browse(source, subDir.path);
                                    
                                    const deepDirs = Array.isArray(deepResult.dirs) ? deepResult.dirs.map((deepdir: string) => ({
                                        name: deepdir.split('/').pop() || deepdir,  // Add fallback
                                        path: deepdir,
                                        type: 'directory'
                                    })) : [];
                                    
                                    const deepFiles = Array.isArray(deepResult.files) ? deepResult.files.map((file: string) => ({
                                        name: file.split('/').pop() || file,  // Add fallback
                                        path: file,
                                        type: 'file'
                                    })) : [];
                                    
                                    subdirs = subdirs.concat(deepDirs, deepFiles);
                                } catch (deepError) {
                                    ModuleLogger.error(`Error processing deep subdirectory ${subDir.path}:`, deepError);
                                }
                            }
                        }
                    } catch (error) {
                        ModuleLogger.error(`Error processing subdirectory ${dir.path}:`, error);
                    }
                }
            }
            
            const results = [...dirs, ...files];
            if (recursive) {
                results.push(...subdirs);
            }
            
            socketManager.send({
                type: "file-system-result",
                requestId: data.requestId,
                success: true,
                path,
                source,
                results,
                recursive
            });
        } catch (error) {
            ModuleLogger.error(`Error getting file system:`, error);
            socketManager.send({
                type: "file-system-result",
                requestId: data.requestId,
                success: false,
                error: (error as Error).message
            });
        }
    });
    
    // Handle file upload request
    socketManager.onMessageType("upload-file", async (data) => {
        ModuleLogger.info(`Received upload file request:`, data);
        
        try {
            const { path, filename, source, fileData, mimeType, binaryData, overwrite } = data;
            
            if (!path || !filename) {
                throw new Error("Missing required parameters (path, filename)");
            }
            
            let file;
            
            // Handle binary data (new method)
            if (binaryData) {
                // Create a Uint8Array from the binary data
                const bytes = new Uint8Array(binaryData);
                const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
                file = new File([blob], filename, { type: mimeType || 'application/octet-stream' });
            } 
            // Handle base64 data (legacy method)
            else if (fileData) {
                // Convert base64 to blob
                const base64Data = fileData.split(',')[1]; // Remove the data URL prefix
                const binaryData = atob(base64Data);
                const bytes = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    bytes[i] = binaryData.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
                file = new File([blob], filename, { type: mimeType || 'application/octet-stream' });
            } else {
                throw new Error("Missing file data (either binaryData or fileData is required)");
            }
            
            // Use Foundry's upload method with proper type handling
            const uploadSource = source || "data";

            // Check if the path exists, and create it if it doesn't
            try {
                // Split the path into individual directories
                const directories = path.split('/');
                let currentPath = '';

                // Iterate through each directory and create it if it doesn't exist
                for (const directory of directories) {
                    currentPath = currentPath ? `${currentPath}/${directory}` : directory;
                    try {
                        await FilePicker.createDirectory(uploadSource, currentPath);
                    } catch (createDirError) {
                        // Ignore error if directory already exists
                        if (!(createDirError as any).message.includes("already exists")) {
                            ModuleLogger.error(`Error creating directory:`, createDirError);
                            throw new Error(`Could not create directory: ${(createDirError as Error).message}`);
                        }
                    }
                }
            } catch (createDirError) {
                ModuleLogger.error(`Error creating directory:`, createDirError);
                throw new Error(`Could not create directory: ${(createDirError as Error).message}`);
            }

            // Check if the file exists
            let existingFile = null;
            try {
                const filePath = path + '/' + filename;
                existingFile = await FilePicker.browse(uploadSource, filePath);
            } catch (e) {
                // File does not exist, which is fine
            }

            // If the file exists and overwrite is not true, throw an error
            if (existingFile && !overwrite) {
                throw new Error("File already exists. Set overwrite to true to replace it.");
            }

            const result = await FilePicker.upload(uploadSource, path, file);
            
            socketManager.send({
                type: "upload-file-result",
                requestId: data.requestId,
                success: true,
                path: result && typeof result === 'object' && 'path' in result ? result.path : path + '/' + filename
            });
        } catch (error) {
            ModuleLogger.error(`Error uploading file:`, error);
            socketManager.send({
                type: "upload-file-result",
                requestId: data.requestId,
                success: false,
                error: (error as Error).message
            });
        }
    });
    
    // Handle file download request
    socketManager.onMessageType("download-file", async (data) => {
        ModuleLogger.info(`Received download file request:`, data);
        
        try {
            const { path } = data;
            // We don't use source here as it's handled by the path
            
            if (!path) {
                throw new Error("Missing required parameter (path)");
            }
            
            // Fetch the file from the server
            const response = await fetch(path.startsWith('http') ? path : foundry.utils.getRoute(path));
            
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
            }
            
            // Convert to base64
            const blob = await response.blob();
            const reader = new FileReader();
            const fileData = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            
            socketManager.send({
                type: "download-file-result",
                requestId: data.requestId,
                success: true,
                path,
                fileData,
                filename: path.split('/').pop() || 'file',
                mimeType: blob.type
            });
        } catch (error) {
            ModuleLogger.error(`Error downloading file:`, error);
            socketManager.send({
                type: "download-file-result",
                requestId: data.requestId,
                success: false,
                error: (error as Error).message
            });
        }
    });
}