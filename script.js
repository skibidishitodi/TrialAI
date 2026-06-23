const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = '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';
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant. When sharing code, use markdown code blocks. When the user asks you to create files or a project with multiple scripts, put the filename as the first line after the opening ``` (e.g. ```main.py\\nprint("hello")```). This lets the user download all files as a ZIP. Format responses nicely with paragraphs, lists, and headers when appropriate.';

const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const newChatBtn = document.getElementById('newChatBtn');
const chatHistory = document.getElementById('chatHistory');
const chatTitle = document.getElementById('chatTitle');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const systemPromptInput = document.getElementById('systemPrompt');
const saveSettings = document.getElementById('saveSettings');
const resetPrompt = document.getElementById('resetPrompt');
const exportBtn = document.getElementById('exportBtn');
const deleteChatBtn = document.getElementById('deleteChatBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');

let chats = JSON.parse(localStorage.getItem('ai_chats') || '{}');
let activeChatId = null;
let conversationHistory = [];
let systemPrompt = localStorage.getItem('ai_system_prompt') || DEFAULT_SYSTEM_PROMPT;
let isStreaming = false;

// --- Chat Management ---

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateTitle(text) {
    const cleaned = text.replace(/```[\s\S]*?```/g, '').trim();
    const firstLine = cleaned.split('\n')[0].replace(/[#*_`>]/g, '').trim();
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine || 'New chat';
}

function saveChats() {
    localStorage.setItem('ai_chats', JSON.stringify(chats));
}

function saveActiveChat() {
    if (!activeChatId) return;
    chats[activeChatId].history = conversationHistory;
    chats[activeChatId].model = modelSelect.value;
    saveChats();
}

function loadChat(id) {
    if (isStreaming) return;
    activeChatId = id;
    const chat = chats[id];
    conversationHistory = [...chat.history];
    modelSelect.value = chat.model || 'llama-3.3-70b-versatile';
    chatTitle.textContent = chat.title;

    chatMessages.innerHTML = '';
    for (const msg of conversationHistory) {
        const role = msg.role === 'user' ? 'user' : 'bot';
        const content = role === 'bot' ? renderContent(msg.content) : '<p>' + escapeHtml(msg.content) + '</p>';
        appendMessageEl(role, content);
    }

    renderChatHistory();
    chatMessages.scrollTop = chatMessages.scrollHeight;
    closeSidebar();
}

function deleteChat(id) {
    showConfirm('Delete chat?', 'This action cannot be undone.', () => {
        delete chats[id];
        saveChats();
        if (activeChatId === id) {
            activeChatId = null;
            conversationHistory = [];
            newChat();
        }
        renderChatHistory();
    });
}

function newChat() {
    if (isStreaming) return;
    activeChatId = null;
    conversationHistory = [];
    chatTitle.textContent = 'New chat';
    showWelcome();
    renderChatHistory();
    closeSidebar();
}

function showWelcome() {
    chatMessages.innerHTML = `
        <div class="welcome-screen" id="welcomeScreen">
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                </svg>
            </div>
            <h1>How can I help you today?</h1>
            <p>I can help with coding, writing, analysis, and more.</p>
            <div class="suggestion-chips">
                <button class="chip" onclick="sendSuggestion('Write a Python script that scrapes a website and saves data to CSV')">Scrape a website</button>
                <button class="chip" onclick="sendSuggestion('Create a full React app with a todo list, dark mode, and local storage')">Build a React app</button>
                <button class="chip" onclick="sendSuggestion('Explain how async/await works in JavaScript with examples')">Explain async/await</button>
                <button class="chip" onclick="sendSuggestion('Write a bash script to automate daily backups of a directory')">Bash backup script</button>
            </div>
        </div>
    `;
}

// --- Sidebar ---

function renderChatHistory() {
    const sorted = Object.entries(chats).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    chatHistory.innerHTML = '';

    for (const [id, chat] of sorted) {
        const div = document.createElement('div');
        div.className = 'chat-item' + (id === activeChatId ? ' active' : '');
        div.innerHTML = `
            <span class="chat-item-text">${escapeHtml(chat.title)}</span>
            <button class="chat-item-delete" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.chat-item-delete')) return;
            loadChat(id);
        });
        div.querySelector('.chat-item-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(id);
        });
        chatHistory.appendChild(div);
    }
}

// --- Rendering ---

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderInlineMarkdown(text) {
    let result = escapeHtml(text);
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    result = result.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    result = result.replace(/^- (.+)$/gm, '<li>$1</li>');
    result = result.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    return result;
}

function guessFileName(lang, code, textBefore) {
    if (lang.includes('.') || lang.includes('/') || lang.includes('\\')) return lang;

    const commentPatterns = [
        /^--\s*(.+\.\w+)\s*$/m, /^#\s*(.+\.\w+)\s*$/m,
        /^\/\/\s*(.+\.\w+)\s*$/m, /^;\s*(.+\.\w+)\s*$/m,
        /^\/\*\s*(.+\.\w+)\s*\*\//m, /^--\[\[\s*(.+\.\w+)\s*\]\]/m,
    ];
    for (const p of commentPatterns) {
        const m = code.match(p);
        if (m) return m[1].trim();
    }

    if (textBefore) {
        const namePatterns = [
            /(?:file|called|named|create|save)\s+['"`]([^'"`]+\.\w+)['"`]/i,
            /(?:file|called|named|create|save)\s+(\S+\.\w+)/i,
        ];
        for (const p of namePatterns) {
            const m = textBefore.match(p);
            if (m) return m[1].trim();
        }
    }

    return null;
}

function parseCodeBlocks(text) {
    const regex = /```([^\s\n]*)\n([\s\S]*?)```/g;
    const files = [];
    let lastIndex = 0;
    let html = '';
    let match;
    let codeIndex = 0;

    while ((match = regex.exec(text)) !== null) {
        const textBefore = text.slice(Math.max(0, match.index - 200), match.index).trim();
        if (match.index > lastIndex) {
            const before = text.slice(lastIndex, match.index).trim();
            if (before) html += renderMarkdownBlock(before);
        }

        const lang = match[1] || 'code';
        const code = match[2].replace(/\n$/, '');
        const id = 'code-' + Math.random().toString(36).slice(2, 9);

        let fileName = guessFileName(lang, code, textBefore);
        if (!fileName) {
            const ext = lang !== 'code' ? lang : 'txt';
            fileName = `file${codeIndex + 1}.${ext}`;
        }
        files.push({ name: fileName, content: code });

        html += `<div class="code-block" data-file="${escapeHtml(fileName)}">
            <div class="code-header">
                <span>${escapeHtml(fileName)}</span>
                <button class="copy-btn" onclick="copyCode('${id}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                </button>
            </div>
            <pre><code id="${id}" class="language-${escapeHtml(fileName.split('.').pop())}">${escapeHtml(code)}</code></pre>
        </div>`;
        codeIndex++;
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex).trim();
        if (remaining) html += renderMarkdownBlock(remaining);
    }

    return { html: html || '<p>' + renderInlineMarkdown(text) + '</p>', files };
}

function renderContent(text) {
    const { html, files } = parseCodeBlocks(text);
    let downloadBtn = '';
    if (files.length > 1) {
        const zipId = 'zip-' + Math.random().toString(36).slice(2, 9);
        downloadBtn = `<div class="download-zip-wrapper">
            <button class="download-zip-btn" onclick="downloadZip('${zipId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download all as ZIP (${files.length} files)
            </button>
        </div>`;
        window['files_' + zipId] = files;
    }
    return downloadBtn + html;
}

function renderMarkdownBlock(text) {
    let html = '';
    for (const p of text.split(/\n\n+/)) {
        const trimmed = p.trim();
        if (trimmed) html += '<p>' + renderInlineMarkdown(trimmed.replace(/\n/g, '<br>')) + '</p>';
    }
    return html;
}

function appendMessageEl(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="avatar">${role === 'bot' ? 'AI' : 'You'}</div>
        <div class="content">${content}</div>
    `;
    chatMessages.appendChild(div);
    if (role === 'bot') {
        div.querySelectorAll('pre code').forEach(block => {
            if (typeof hljs !== 'undefined') hljs.highlightElement(block);
        });
    }
}

function addMessage(role, content) {
    appendMessageEl(role, content);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addThinkingMessage() {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.id = 'thinkingMessage';
    div.innerHTML = `<div class="avatar">AI</div><div class="content"><div class="thinking-dots"><span></span><span></span><span></span></div></div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinkingMessage() {
    const el = document.getElementById('thinkingMessage');
    if (el) el.remove();
}

// --- Actions ---

function copyCode(id) {
    const code = document.getElementById(id).textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector(`[onclick="copyCode('${id}')"]`);
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
            btn.classList.remove('copied');
        }, 2000);
    });
}

async function downloadZip(zipId) {
    const files = window['files_' + zipId];
    if (!files) return;
    const zip = new JSZip();
    const folder = zip.folder('project');
    for (const file of files) folder.file(file.name, file.content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportChat() {
    if (!activeChatId || conversationHistory.length === 0) return;
    let md = `# ${chats[activeChatId].title}\n\n`;
    for (const msg of conversationHistory) {
        const role = msg.role === 'user' ? 'You' : 'AI';
        md += `## ${role}\n\n${msg.content}\n\n---\n\n`;
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (chats[activeChatId].title || 'chat') + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Confirm Modal ---

let confirmCallback = null;

function showConfirm(title, message, onOk) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = onOk;
    confirmModal.classList.add('active');
}

confirmOk.addEventListener('click', () => {
    confirmModal.classList.remove('active');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
});

confirmCancel.addEventListener('click', () => {
    confirmModal.classList.remove('active');
    confirmCallback = null;
});

// --- Settings ---

settingsBtn.addEventListener('click', () => {
    systemPromptInput.value = systemPrompt;
    settingsModal.classList.add('active');
});

closeSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

saveSettings.addEventListener('click', () => {
    systemPrompt = systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
    localStorage.setItem('ai_system_prompt', systemPrompt);
    settingsModal.classList.remove('active');
});

resetPrompt.addEventListener('click', () => {
    systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
});

confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        confirmModal.classList.remove('active');
        confirmCallback = null;
    }
});

// --- Mobile ---

menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
function closeSidebar() { sidebar.classList.remove('open'); }

// --- Input ---

userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        newChat();
    }
});

// --- Send ---

window.sendSuggestion = function(text) {
    userInput.value = text;
    sendMessage();
};

newChatBtn.addEventListener('click', newChat);
sendBtn.addEventListener('click', sendMessage);
exportBtn.addEventListener('click', exportChat);
deleteChatBtn.addEventListener('click', () => {
    if (activeChatId) deleteChat(activeChatId);
});

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || isStreaming) return;

    const welcomeEl = document.getElementById('welcomeScreen');
    if (welcomeEl) welcomeEl.remove();

    // Create chat if new
    if (!activeChatId) {
        activeChatId = generateId();
        chats[activeChatId] = {
            title: generateTitle(message),
            history: [],
            model: modelSelect.value,
            updatedAt: Date.now()
        };
        chatTitle.textContent = chats[activeChatId].title;
    }

    addMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });
    chats[activeChatId].history = conversationHistory;
    chats[activeChatId].updatedAt = Date.now();
    saveChats();
    renderChatHistory();

    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    isStreaming = true;

    addThinkingMessage();

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: modelSelect.value,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory
                ],
                temperature: 0.7,
                max_tokens: 4096,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        removeThinkingMessage();

        // Streaming
        const botDiv = document.createElement('div');
        botDiv.className = 'message bot';
        botDiv.innerHTML = `<div class="avatar">AI</div><div class="content streaming-cursor"></div>`;
        chatMessages.appendChild(botDiv);
        const contentEl = botDiv.querySelector('.content');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    const token = json.choices?.[0]?.delta?.content;
                    if (token) {
                        fullReply += token;
                        contentEl.innerHTML = renderContent(fullReply);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } catch (e) {}
            }
        }

        contentEl.classList.remove('streaming-cursor');
        contentEl.querySelectorAll('pre code').forEach(block => {
            if (typeof hljs !== 'undefined') hljs.highlightElement(block);
        });

        conversationHistory.push({ role: 'assistant', content: fullReply });
        chats[activeChatId].history = conversationHistory;
        chats[activeChatId].updatedAt = Date.now();

        // Update title from first exchange
        if (conversationHistory.length <= 2) {
            chats[activeChatId].title = generateTitle(message);
            chatTitle.textContent = chats[activeChatId].title;
            renderChatHistory();
        }

        saveChats();

    } catch (error) {
        removeThinkingMessage();
        addMessage('bot', `<p class="error-text">Error: ${escapeHtml(error.message)}</p>`);
    } finally {
        sendBtn.disabled = false;
        isStreaming = false;
        userInput.focus();
    }
}

// --- Init ---

systemPromptInput.value = systemPrompt;
renderChatHistory();
