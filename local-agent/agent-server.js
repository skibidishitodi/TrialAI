const fs = require('fs');
const path = require('path');
const os = require('os');

class AgentServer {
    constructor(wss) {
        this.wss = wss;
        this.syncedFolders = new Set();
        this.watchers = new Map();
        this.webClients = new Set();
        this.agentClient = null;

        wss.on('connection', (ws) => this.handleConnection(ws));
        console.log('[Agent] WebSocket server ready');
    }

    handleConnection(ws) {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this.handleMessage(ws, msg);
            } catch (e) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            }
        });

        ws.on('close', () => {
            if (ws === this.agentClient) {
                console.log('[Agent] Agent disconnected');
                this.agentClient = null;
            }
            this.webClients.delete(ws);
            this.notifyWebClients({ type: 'agent_status', connected: false });
        });
    }

    handleMessage(ws, msg) {
        switch (msg.type) {
            case 'register_agent':
                this.agentClient = ws;
                console.log('[Agent] Agent registered');
                ws.send(JSON.stringify({ type: 'registered', success: true }));
                this.notifyWebClients({ type: 'agent_status', connected: true });
                break;

            case 'register_web':
                this.webClients.add(ws);
                console.log('[Agent] Web client registered, total:', this.webClients.size);
                ws.send(JSON.stringify({ type: 'registered', success: true, agentConnected: !!this.agentClient }));
                if (this.agentClient) {
                    ws.send(JSON.stringify({ type: 'agent_status', connected: true }));
                    ws.send(JSON.stringify({ type: 'synced_folders', folders: Array.from(this.syncedFolders) }));
                }
                break;

            case 'list_dir':
            case 'read_file':
            case 'write_file':
            case 'delete_file':
            case 'create_dir':
            case 'rename':
            case 'search':
            case 'file_info':
            case 'get_home':
                if (this.agentClient && this.agentClient.readyState === 1) {
                    msg.requestId = msg.requestId || Math.random().toString(36).slice(2);
                    this.agentClient.send(JSON.stringify(msg));
                    this.agentClient._pendingRequests = this.agentClient._pendingRequests || {};
                    this.agentClient._pendingRequests[msg.requestId] = ws;
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Agent not connected', requestId: msg.requestId }));
                }
                break;

            case 'response':
            case 'error':
                if (msg.requestId) {
                    const pending = this.agentClient?._pendingRequests?.[msg.requestId];
                    if (pending) {
                        pending.send(JSON.stringify(msg));
                        delete this.agentClient._pendingRequests[msg.requestId];
                    }
                }
                break;

            case 'sync_folder':
                const folder = path.resolve(msg.path);
                this.syncedFolders.add(folder);
                this.startWatching(folder);
                console.log('[Agent] Syncing folder:', folder);
                this.notifyWebClients({ type: 'synced_folders', folders: Array.from(this.syncedFolders) });
                ws.send(JSON.stringify({ type: 'sync_ok', path: folder }));
                break;

            case 'unsync_folder':
                const unpath = path.resolve(msg.path);
                this.syncedFolders.delete(unpath);
                this.stopWatching(unpath);
                this.notifyWebClients({ type: 'synced_folders', folders: Array.from(this.syncedFolders) });
                ws.send(JSON.stringify({ type: 'unsync_ok', path: unpath }));
                break;

            case 'file_changed':
            case 'file_created':
            case 'file_deleted':
            case 'folder_created':
                this.notifyWebClients(msg);
                break;
        }
    }

    notifyWebClients(msg) {
        const data = JSON.stringify(msg);
        for (const client of this.webClients) {
            if (client.readyState === 1) {
                client.send(data);
            }
        }
    }

    startWatching(folder) {
        if (this.watchers.has(folder)) return;

        try {
            const chokidar = require('chokidar');
            const watcher = chokidar.watch(folder, {
                ignored: /(^|[\/\\])\.(?!hg|git)|node_modules/,
                persistent: true,
                ignoreInitial: true,
                depth: 10
            });

            watcher.on('change', (fp) => {
                this.notifyWebClients({ type: 'file_changed', path: fp });
            });
            watcher.on('add', (fp) => {
                this.notifyWebClients({ type: 'file_created', path: fp });
            });
            watcher.on('unlink', (fp) => {
                this.notifyWebClients({ type: 'file_deleted', path: fp });
            });
            watcher.on('addDir', (fp) => {
                this.notifyWebClients({ type: 'folder_created', path: fp });
            });

            this.watchers.set(folder, watcher);
            console.log('[Agent] Watching:', folder);
        } catch (e) {
            console.log('[Agent] chokidar not available, file watching disabled');
        }
    }

    stopWatching(folder) {
        const watcher = this.watchers.get(folder);
        if (watcher) {
            watcher.close();
            this.watchers.delete(folder);
        }
    }
}

module.exports = AgentServer;
