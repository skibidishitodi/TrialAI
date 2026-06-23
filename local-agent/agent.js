#!/usr/bin/env node

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AgentServer = require('./agent-server');

const PORT = 7890;
const SERVER_URL = 'wss://echo.websocket.org';

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║     AI Chat - Local File Agent       ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');

// Start WebSocket server
const wss = new WebSocket.Server({ port: PORT });
const agent = new AgentServer(wss);

console.log(`[Agent] Listening on ws://localhost:${PORT}`);
console.log('[Agent] Open the AI Chat website to connect');
console.log('');

// File operation handlers
async function handleRequest(msg) {
    const { type, requestId } = msg;

    try {
        switch (type) {
            case 'list_dir': {
                const dirPath = path.resolve(msg.path || '.');
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                const items = entries.map(e => {
                    const fullPath = path.join(dirPath, e.name);
                    let stat = {};
                    try { stat = fs.statSync(fullPath); } catch (e) {}
                    return {
                        name: e.name,
                        isDirectory: e.isDirectory(),
                        isFile: e.isFile(),
                        size: stat.size || 0,
                        modified: stat.mtime || null,
                        path: fullPath
                    };
                });
                items.sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
                return { type: 'response', requestId, data: { path: dirPath, items } };
            }

            case 'read_file': {
                const filePath = path.resolve(msg.path);
                const content = fs.readFileSync(filePath, 'utf-8');
                return { type: 'response', requestId, data: { path: filePath, content, size: content.length } };
            }

            case 'write_file': {
                const filePath = path.resolve(msg.path);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, msg.content, 'utf-8');
                return { type: 'response', requestId, data: { path: filePath, success: true } };
            }

            case 'delete_file': {
                const target = path.resolve(msg.path);
                const stat = fs.statSync(target);
                if (stat.isDirectory()) {
                    fs.rmSync(target, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(target);
                }
                return { type: 'response', requestId, data: { path: target, success: true } };
            }

            case 'create_dir': {
                const dirPath = path.resolve(msg.path);
                fs.mkdirSync(dirPath, { recursive: true });
                return { type: 'response', requestId, data: { path: dirPath, success: true } };
            }

            case 'rename': {
                const oldPath = path.resolve(msg.oldPath);
                const newPath = path.resolve(msg.newPath);
                fs.renameSync(oldPath, newPath);
                return { type: 'response', requestId, data: { oldPath, newPath, success: true } };
            }

            case 'search': {
                const searchPath = path.resolve(msg.path || '.');
                const query = msg.query.toLowerCase();
                const results = [];
                function searchDir(dir, depth) {
                    if (depth > 8) return;
                    try {
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const e of entries) {
                            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
                            const full = path.join(dir, e.name);
                            if (e.name.toLowerCase().includes(query)) {
                                results.push({ name: e.name, path: full, isDirectory: e.isDirectory() });
                            }
                            if (e.isDirectory()) searchDir(full, depth + 1);
                        }
                    } catch (e) {}
                }
                searchDir(searchPath, 0);
                return { type: 'response', requestId, data: { results: results.slice(0, 50) } };
            }

            case 'file_info': {
                const filePath = path.resolve(msg.path);
                const stat = fs.statSync(filePath);
                return { type: 'response', requestId, data: {
                    path: filePath,
                    size: stat.size,
                    created: stat.birthtime,
                    modified: stat.mtime,
                    isDirectory: stat.isDirectory(),
                    isFile: stat.isFile()
                }};
            }

            default:
                return { type: 'error', requestId, message: 'Unknown command: ' + type };
        }
    } catch (e) {
        return { type: 'error', requestId, message: e.message };
    }
}

// Handle requests from web clients via agent
wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (['list_dir', 'read_file', 'write_file', 'delete_file', 'create_dir', 'rename', 'search', 'file_info'].includes(msg.type)) {
                const response = await handleRequest(msg);
                ws.send(JSON.stringify(response));
            }
        } catch (e) {}
    });
});

// Handle agent responses (forwarded by server)
wss.on('connection', (ws) => {
    const origOnMessage = ws.on.bind(ws, 'message');
    // Already handled above
});

// Keep alive
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Agent] Shutting down...');
    wss.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    wss.close();
    process.exit(0);
});
