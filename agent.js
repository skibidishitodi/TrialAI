const AGENT_WS_URL = 'ws://localhost:7890';

class AgentClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.currentPath = '';
        this.pendingRequests = {};
        this.toast = document.getElementById('agentToast');
        this.dot = document.getElementById('agentDot');
        this.statusText = document.getElementById('agentStatusText');
        this.fbList = document.getElementById('fbList');
        this.fbBreadcrumb = document.getElementById('fbBreadcrumb');
        this.fileBrowser = document.getElementById('fileBrowser');
        this.toggleBtn = document.getElementById('agentToggleBtn');

        this.initUI();
        this.autoDetect();
    }

    initUI() {
        document.getElementById('agentConnectBtn').addEventListener('click', () => this.connect());
        document.getElementById('agentDismissBtn').addEventListener('click', () => this.toast.classList.remove('show'));
        document.getElementById('fbCloseBtn').addEventListener('click', () => this.fileBrowser.classList.remove('open'));
        document.getElementById('fbUpBtn').addEventListener('click', () => this.goUp());
        document.getElementById('fbRefreshBtn').addEventListener('click', () => this.refresh());
        document.getElementById('fbSyncBtn').addEventListener('click', () => this.syncCurrentFolder());
        document.getElementById('fbNewFileBtn').addEventListener('click', () => this.createFile());
        document.getElementById('fbNewFolderBtn').addEventListener('click', () => this.createFolder());
        this.toggleBtn.addEventListener('click', () => this.toggleBrowser());

        document.getElementById('fbSearch').addEventListener('input', (e) => this.search(e.target.value));

        window.agentInsertFile = (path) => {
            const name = path.split(/[/\\]/).pop();
            userInput.value += (userInput.value ? '\n' : '') + '[File: ' + name + '] ' + path;
            userInput.focus();
        };
    }

    autoDetect() {
        this.detectAgent();
        setInterval(() => this.detectAgent(), 5000);
    }

    detectAgent() {
        if (this.connected) return;
        const test = new WebSocket(AGENT_WS_URL);
        test.onopen = () => {
            test.close();
            if (!this.connected) {
                this.toast.classList.add('show');
            }
        };
        test.onerror = () => {};
        setTimeout(() => { try { test.close(); } catch(e) {} }, 1500);
    }

    connect() {
        if (this.connected) return;
        this.toast.classList.remove('show');

        try {
            this.ws = new WebSocket(AGENT_WS_URL);

            this.ws.onopen = () => {
                this.connected = true;
                this.dot.classList.add('connected');
                this.statusText.textContent = 'Agent connected';
                this.toggleBtn.style.display = 'flex';
                this.ws.send(JSON.stringify({ type: 'register_web' }));
                this.currentPath = this.getHomePath();
                this.loadDir(this.currentPath);
                this.fileBrowser.classList.add('open');
            };

            this.ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    this.handleMessage(msg);
                } catch (err) {}
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.dot.classList.remove('connected');
                this.statusText.textContent = 'Agent offline';
                this.toggleBtn.style.display = 'none';
                this.fbList.innerHTML = '<div class="fb-empty">Agent disconnected</div>';
            };

            this.ws.onerror = () => {};
        } catch (e) {}
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'agent_status':
                if (msg.connected) {
                    this.dot.classList.add('connected');
                    this.statusText.textContent = 'Agent connected';
                } else {
                    this.dot.classList.remove('connected');
                    this.statusText.textContent = 'Agent offline';
                }
                break;

            case 'synced_folders':
                break;

            case 'response':
            case 'error':
                if (msg.requestId && this.pendingRequests[msg.requestId]) {
                    this.pendingRequests[msg.requestId](msg);
                    delete this.pendingRequests[msg.requestId];
                }
                break;

            case 'file_changed':
            case 'file_created':
            case 'file_deleted':
            case 'folder_created':
                this.refresh();
                break;
        }
    }

    send(msg) {
        return new Promise((resolve) => {
            if (!this.ws || this.ws.readyState !== 1) {
                resolve({ type: 'error', message: 'Not connected' });
                return;
            }
            const id = Math.random().toString(36).slice(2, 9);
            msg.requestId = id;
            this.pendingRequests[id] = resolve;
            this.ws.send(JSON.stringify(msg));
            setTimeout(() => {
                if (this.pendingRequests[id]) {
                    resolve({ type: 'error', message: 'Timeout' });
                    delete this.pendingRequests[id];
                }
            }, 10000);
        });
    }

    async loadDir(dirPath) {
        this.currentPath = dirPath;
        this.renderBreadcrumb(dirPath);
        this.fbList.innerHTML = '<div class="fb-empty">Loading...</div>';

        const res = await this.send({ type: 'list_dir', path: dirPath });
        if (res.type === 'error') {
            this.fbList.innerHTML = '<div class="fb-empty">' + (res.message || 'Error loading') + '</div>';
            return;
        }

        const items = res.data.items || [];
        this.fbList.innerHTML = '';

        if (items.length === 0) {
            this.fbList.innerHTML = '<div class="fb-empty">Empty folder</div>';
            return;
        }

        for (const item of items) {
            const div = document.createElement('div');
            div.className = 'fb-item';
            const icon = item.isDirectory
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            const iconClass = item.isDirectory ? 'folder' : 'file';
            const size = item.isDirectory ? '' : this.formatSize(item.size);

            div.innerHTML = '<span class="fb-item-icon ' + iconClass + '">' + icon + '</span>' +
                '<span class="fb-item-name">' + this.escapeHtml(item.name) + '</span>' +
                '<span class="fb-item-size">' + size + '</span>' +
                '<div class="fb-item-actions">' +
                '<button title="Insert path" onclick="agentInsertFile(\'' + this.escapeJs(item.path) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' +
                '<button class="danger" title="Delete" onclick="agentDeleteItem(\'' + this.escapeJs(item.path) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
                '</div>';

            if (item.isDirectory) {
                div.addEventListener('click', () => this.loadDir(item.path));
            } else {
                div.addEventListener('click', () => this.openFile(item.path));
            }

            this.fbList.appendChild(div);
        }

        window.agentDeleteItem = async (p) => {
            if (confirm('Delete ' + p.split(/[/\\]/).pop() + '?')) {
                await this.send({ type: 'delete_file', path: p });
                this.refresh();
            }
        };
    }

    async openFile(filePath) {
        const res = await this.send({ type: 'read_file', path: filePath });
        if (res.type === 'error') return;
        const content = res.data.content;
        const name = filePath.split(/[/\\]/).pop();
        userInput.value = 'Here is the file ' + name + ':\n\n```\n' + content + '\n```\n\nPlease help me understand or modify this code.';
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
        userInput.focus();
    }

    renderBreadcrumb(dirPath) {
        const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean);
        let html = '';
        let accumulated = '';

        if (dirPath.match(/^[A-Z]:\\/i)) {
            accumulated = parts[0];
            html += '<span onclick="agentBrowser.loadDir(\'' + this.escapeJs(accumulated) + '\')">' + this.escapeHtml(parts[0]) + '</span>';
            parts.shift();
        } else if (parts[0] === '') {
            accumulated = '/';
            html += '<span onclick="agentBrowser.loadDir(\'/\')\">/</span>';
            parts.shift();
        }

        for (const part of parts) {
            accumulated += (accumulated.endsWith('/') ? '' : '/') + part;
            html += '<span class="sep">/</span><span onclick="agentBrowser.loadDir(\'' + this.escapeJs(accumulated) + '\')">' + this.escapeHtml(part) + '</span>';
        }

        this.fbBreadcrumb.innerHTML = html;
    }

    goUp() {
        const parts = this.currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
        if (parts.length <= 1) return;
        parts.pop();
        let parent = parts.join('/');
        if (this.currentPath.match(/^[A-Z]:\\/i)) {
            parent = parts.slice(0, 1).join('/') + '/' + parts.slice(1).join('/');
        }
        this.loadDir(parent);
    }

    refresh() {
        this.loadDir(this.currentPath);
    }

    syncCurrentFolder() {
        if (!this.connected) return;
        this.ws.send(JSON.stringify({ type: 'sync_folder', path: this.currentPath }));
    }

    async createFile() {
        const name = prompt('File name:');
        if (!name) return;
        const filePath = this.currentPath + (this.currentPath.endsWith('/') || this.currentPath.endsWith('\\') ? '' : '/') + name;
        await this.send({ type: 'write_file', path: filePath, content: '' });
        this.refresh();
    }

    async createFolder() {
        const name = prompt('Folder name:');
        if (!name) return;
        const dirPath = this.currentPath + (this.currentPath.endsWith('/') || this.currentPath.endsWith('\\') ? '' : '/') + name;
        await this.send({ type: 'create_dir', path: dirPath });
        this.refresh();
    }

    async search(query) {
        if (!query.trim()) {
            this.loadDir(this.currentPath);
            return;
        }
        const res = await this.send({ type: 'search', path: this.currentPath, query });
        if (res.type === 'error') return;

        this.fbList.innerHTML = '';
        const results = res.data.results || [];
        if (results.length === 0) {
            this.fbList.innerHTML = '<div class="fb-empty">No results</div>';
            return;
        }

        for (const item of results) {
            const div = document.createElement('div');
            div.className = 'fb-item';
            const icon = item.isDirectory
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            const iconClass = item.isDirectory ? 'folder' : 'file';
            const relPath = item.path.replace(this.currentPath, '').replace(/^[\/\\]/, '');

            div.innerHTML = '<span class="fb-item-icon ' + iconClass + '">' + icon + '</span>' +
                '<span class="fb-item-name">' + this.escapeHtml(item.name) + '</span>' +
                '<span class="fb-item-size" style="font-size:0.65rem;color:var(--text-muted)">' + this.escapeHtml(relPath) + '</span>';

            if (item.isDirectory) {
                div.addEventListener('click', () => this.loadDir(item.path));
            } else {
                div.addEventListener('click', () => this.openFile(item.path));
            }

            this.fbList.appendChild(div);
        }
    }

    toggleBrowser() {
        this.fileBrowser.classList.toggle('open');
    }

    getHomePath() {
        return navigator.platform.includes('Win')
            ? (navigator.userProfile || 'C:\\Users\\' + (navigator.userAgent.match(/Windows.*?\/(.+?)\s/)?.[1] || 'User'))
            : (navigator.userProfile || '/home/' + (navigator.userAgent.match(/Linux.*?\/(.+?)\s/)?.[1] || 'user'));
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeJs(text) {
        return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
}

let agentBrowser;
document.addEventListener('DOMContentLoaded', () => {
    agentBrowser = new AgentClient();
});
