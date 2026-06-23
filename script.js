const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const API_KEY = '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';
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant. When sharing code, use markdown code blocks. When the user asks you to create files or a project with multiple scripts, put the filename as the first line after the opening ``` (e.g. ```main.py\nprint("hello")```). This lets the user download all files as a ZIP. Format responses nicely with paragraphs, lists, and headers when appropriate.';

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
const ttsVoiceSelect = document.getElementById('ttsVoice');
const saveSettingsBtn = document.getElementById('saveSettings');
const resetPrompt = document.getElementById('resetPrompt');
const exportBtn = document.getElementById('exportBtn');
const deleteChatBtn = document.getElementById('deleteChatBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const voiceBtn = document.getElementById('voiceBtn');
const attachmentsBar = document.getElementById('attachmentsBar');
const dragOverlay = document.getElementById('dragOverlay');

let chats = JSON.parse(localStorage.getItem('ai_chats') || '{}');
let activeChatId = null;
let conversationHistory = [];
let systemPrompt = localStorage.getItem('ai_system_prompt') || DEFAULT_SYSTEM_PROMPT;
let ttsVoice = localStorage.getItem('ai_tts_voice') || 'canopylabs/orpheus-v1-english';
let isStreaming = false;
let pendingFiles = [];
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

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

function loadChat(id) {
    if (isStreaming) return;
    activeChatId = id;
    const chat = chats[id];
    conversationHistory = [...chat.history];
    modelSelect.value = chat.model || 'llama-3.3-70b-versatile';
    chatTitle.textContent = chat.title;
    clearAttachments();

    chatMessages.innerHTML = '';
    for (const msg of conversationHistory) {
        const role = msg.role === 'user' ? 'user' : 'bot';
        if (role === 'bot') {
            appendBotMessage(msg.content);
        } else {
            let userHtml = '<p>' + escapeHtml(msg.content) + '</p>';
            if (msg.files && msg.files.length > 0) {
                for (const f of msg.files) {
                    if (f.type && f.type.startsWith('image/')) {
                        userHtml = '<div class="attached-image"><img src="' + f.data + '" alt="' + escapeHtml(f.name) + '"></div>' + userHtml;
                    } else {
                        userHtml = '<div class="attached-file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + escapeHtml(f.name) + '</div>' + userHtml;
                    }
                }
            }
            appendMessageEl(role, userHtml);
        }
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
    clearAttachments();
    showWelcome();
    renderChatHistory();
    closeSidebar();
}

function showWelcome() {
    chatMessages.innerHTML = '<div class="welcome-screen" id="welcomeScreen">' +
        '<div class="welcome-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>' +
        '<h1>How can I help you today?</h1>' +
        '<p>I can help with coding, writing, analysis, and more.</p>' +
        '<div class="suggestion-chips">' +
        '<button class="chip" onclick="sendSuggestion(\'Write a Python script that scrapes a website and saves data to CSV\')">Scrape a website</button>' +
        '<button class="chip" onclick="sendSuggestion(\'Create a full React app with a todo list, dark mode, and local storage\')">Build a React app</button>' +
        '<button class="chip" onclick="sendSuggestion(\'Explain how async/await works in JavaScript with examples\')">Explain async/await</button>' +
        '<button class="chip" onclick="sendSuggestion(\'Write a bash script to automate daily backups of a directory\')">Bash backup script</button>' +
        '</div></div>';
}

// --- Sidebar ---

function renderChatHistory() {
    const sorted = Object.entries(chats).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    chatHistory.innerHTML = '';
    for (const [id, chat] of sorted) {
        const div = document.createElement('div');
        div.className = 'chat-item' + (id === activeChatId ? ' active' : '');
        div.innerHTML = '<span class="chat-item-text">' + escapeHtml(chat.title) + '</span>' +
            '<button class="chat-item-delete" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
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
            fileName = 'file' + (codeIndex + 1) + '.' + ext;
        }
        files.push({ name: fileName, content: code });
        html += '<div class="code-block" data-file="' + escapeHtml(fileName) + '">' +
            '<div class="code-header"><span>' + escapeHtml(fileName) + '</span>' +
            '<button class="copy-btn" onclick="copyCode(\'' + id + '\')">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</button></div>' +
            '<pre><code id="' + id + '" class="language-' + escapeHtml(fileName.split('.').pop()) + '">' + escapeHtml(code) + '</code></pre></div>';
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
        downloadBtn = '<div class="download-zip-wrapper"><button class="download-zip-btn" onclick="downloadZip(\'' + zipId + '\')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            ' Download all as ZIP (' + files.length + ' files)</button></div>';
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
    div.className = 'message ' + role;
    div.innerHTML = '<div class="avatar">' + (role === 'bot' ? 'AI' : 'You') + '</div>' +
        '<div class="content">' + content + '</div>';
    chatMessages.appendChild(div);
    if (role === 'bot') {
        div.querySelectorAll('pre code').forEach(block => {
            if (typeof hljs !== 'undefined') hljs.highlightElement(block);
        });
    }
}

function appendBotMessage(text) {
    const ttsId = 'tts-' + Math.random().toString(36).slice(2, 9);
    const contentHtml = renderContent(text);
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = '<div class="avatar">AI</div>' +
        '<div class="content">' + contentHtml +
        '<div class="message-actions">' +
        '<button class="msg-action-btn" onclick="textToSpeech(\'' + ttsId + '\', this)" title="Read aloud">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>' +
        '</button></div></div>';
    div.id = ttsId;
    div.dataset.rawText = text;
    chatMessages.appendChild(div);
    div.querySelectorAll('pre code').forEach(block => {
        if (typeof hljs !== 'undefined') hljs.highlightElement(block);
    });
}

function addMessage(role, content) {
    appendMessageEl(role, content);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addThinkingMessage() {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.id = 'thinkingMessage';
    div.innerHTML = '<div class="avatar">AI</div><div class="content"><div class="thinking-dots"><span></span><span></span><span></span></div></div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinkingMessage() {
    const el = document.getElementById('thinkingMessage');
    if (el) el.remove();
}

// --- File Upload ---

function clearAttachments() {
    pendingFiles = [];
    attachmentsBar.innerHTML = '';
    attachmentsBar.style.display = 'none';
}

function addFileToPending(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const fileData = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: reader.result
        };
        pendingFiles.push(fileData);
        renderAttachments();
    };
    if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
    } else {
        reader.readAsText(file);
    }
}

function renderAttachments() {
    attachmentsBar.innerHTML = '';
    if (pendingFiles.length === 0) {
        attachmentsBar.style.display = 'none';
        return;
    }
    attachmentsBar.style.display = 'flex';
    for (let i = 0; i < pendingFiles.length; i++) {
        const f = pendingFiles[i];
        const tag = document.createElement('div');
        tag.className = 'attachment-tag';
        if (f.type && f.type.startsWith('image/')) {
            tag.innerHTML = '<img src="' + f.data + '" class="attachment-thumb" alt="' + escapeHtml(f.name) + '">' +
                '<span>' + escapeHtml(f.name) + '</span>' +
                '<button onclick="removeAttachment(' + i + ')">&times;</button>';
        } else {
            tag.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                '<span>' + escapeHtml(f.name) + '</span>' +
                '<button onclick="removeAttachment(' + i + ')">&times;</button>';
        }
        attachmentsBar.appendChild(tag);
    }
}

window.removeAttachment = function(idx) {
    pendingFiles.splice(idx, 1);
    renderAttachments();
};

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    for (const file of fileInput.files) {
        addFileToPending(file);
    }
    fileInput.value = '';
});

// Drag & Drop
let dragCounter = 0;
document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dragOverlay.classList.add('active');
});
document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        dragOverlay.classList.remove('active');
    }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.remove('active');
    for (const file of e.dataTransfer.files) {
        addFileToPending(file);
    }
});

// --- Voice Input (Whisper STT) ---

voiceBtn.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            voiceBtn.classList.remove('recording');
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };
        mediaRecorder.start();
        isRecording = true;
        voiceBtn.classList.add('recording');
        userInput.placeholder = 'Listening...';
    } catch (err) {
        addMessage('bot', '<p class="error-text">Microphone access denied.</p>');
    }
});

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    userInput.placeholder = 'Message AI Chat...';
}

async function transcribeAudio(audioBlob) {
    const thinkingId = 'stt-thinking';
    const thinkDiv = document.createElement('div');
    thinkDiv.className = 'message bot';
    thinkDiv.id = thinkingId;
    thinkDiv.innerHTML = '<div class="avatar">AI</div><div class="content"><div class="thinking-dots"><span></span><span></span><span></span></div> <em>Transcribing audio...</em></div>';
    chatMessages.appendChild(thinkDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-large-v3-turbo');

        const response = await fetch(GROQ_STT_URL, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + API_KEY },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Transcription failed');
        }

        const data = await response.json();
        const text = data.text || '';
        userInput.value = text;
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
    } catch (err) {
        addMessage('bot', '<p class="error-text">Transcription error: ' + escapeHtml(err.message) + '</p>');
    } finally {
        const el = document.getElementById(thinkingId);
        if (el) el.remove();
    }
}

// --- Text-to-Speech ---

window.textToSpeech = async function(ttsId, btn) {
    const msgEl = document.getElementById(ttsId);
    if (!msgEl) return;
    const rawText = msgEl.dataset.rawText;
    if (!rawText) return;

    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/></svg>';

    try {
        const cleanText = rawText.replace(/```[\s\S]*?```/g, '').replace(/[#*_`>]/g, '').trim().slice(0, 5000);
        const response = await fetch(GROQ_TTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: ttsVoice,
                input: cleanText,
                voice: 'default'
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'TTS failed');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();

        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>';
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
    } catch (err) {
        addMessage('bot', '<p class="error-text">TTS error: ' + escapeHtml(err.message) + '</p>');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>';
    } finally {
        btn.disabled = false;
    }
};

// --- Actions ---

function copyCode(id) {
    const code = document.getElementById(id).textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('[onclick="copyCode(\'' + id + '\')"]');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy';
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
    let md = '# ' + chats[activeChatId].title + '\n\n';
    for (const msg of conversationHistory) {
        const role = msg.role === 'user' ? 'You' : 'AI';
        md += '## ' + role + '\n\n' + msg.content + '\n\n---\n\n';
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
    ttsVoiceSelect.value = ttsVoice;
    settingsModal.classList.add('active');
});

closeSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

saveSettingsBtn.addEventListener('click', () => {
    systemPrompt = systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
    ttsVoice = ttsVoiceSelect.value;
    localStorage.setItem('ai_system_prompt', systemPrompt);
    localStorage.setItem('ai_tts_voice', ttsVoice);
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

    // Build user message with files
    let userDisplayHtml = '<p>' + escapeHtml(message) + '</p>';
    const msgData = { role: 'user', content: message, files: [] };

    if (pendingFiles.length > 0) {
        msgData.files = pendingFiles.map(f => ({
            name: f.name,
            type: f.type,
            data: f.type.startsWith('image/') ? f.data : undefined
        }));

        for (const f of pendingFiles) {
            if (f.type && f.type.startsWith('image/')) {
                userDisplayHtml = '<div class="attached-image"><img src="' + f.data + '" alt="' + escapeHtml(f.name) + '"></div>' + userDisplayHtml;
            } else {
                userDisplayHtml = '<div class="attached-file"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' + escapeHtml(f.name) + '</div>' + userDisplayHtml;
            }
        }
        clearAttachments();
    }

    addMessage('user', userDisplayHtml);
    conversationHistory.push(msgData);
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
        // Build API messages with file context
        const apiMessages = [
            { role: 'system', content: systemPrompt }
        ];

        for (const msg of conversationHistory) {
            if (msg.role === 'user' && msg.files && msg.files.length > 0) {
                const content = [];
                for (const f of msg.files) {
                    if (f.type && f.type.startsWith('image/') && f.data) {
                        content.push({ type: 'image_url', image_url: { url: f.data } });
                    } else if (!f.type || !f.type.startsWith('image/')) {
                        content.push({ type: 'text', text: '[File: ' + f.name + ']\n' + (msg.content || '') });
                    }
                }
                if (content.length === 0) content.push({ type: 'text', text: msg.content });
                apiMessages.push({ role: 'user', content: content });
            } else {
                apiMessages.push({ role: msg.role, content: msg.content });
            }
        }

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: modelSelect.value,
                messages: apiMessages,
                temperature: 0.7,
                max_tokens: 4096,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'HTTP ' + response.status);
        }

        removeThinkingMessage();

        const botDiv = document.createElement('div');
        botDiv.className = 'message bot';
        botDiv.innerHTML = '<div class="avatar">AI</div><div class="content streaming-cursor"></div>';
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

        // Add TTS button inside content
        const ttsId = 'tts-' + Math.random().toString(36).slice(2, 9);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = '<button class="msg-action-btn" onclick="textToSpeech(\'' + ttsId + '\', this)" title="Read aloud">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg></button>';
        contentEl.appendChild(actionsDiv);
        botDiv.id = ttsId;
        botDiv.dataset.rawText = fullReply;

        contentEl.querySelectorAll('pre code').forEach(block => {
            if (typeof hljs !== 'undefined') hljs.highlightElement(block);
        });

        conversationHistory.push({ role: 'assistant', content: fullReply });
        chats[activeChatId].history = conversationHistory;
        chats[activeChatId].updatedAt = Date.now();

        if (conversationHistory.length <= 2) {
            chats[activeChatId].title = generateTitle(message);
            chatTitle.textContent = chats[activeChatId].title;
            renderChatHistory();
        }

        saveChats();

    } catch (error) {
        removeThinkingMessage();
        addMessage('bot', '<p class="error-text">Error: ' + escapeHtml(error.message) + '</p>');
    } finally {
        sendBtn.disabled = false;
        isStreaming = false;
        userInput.focus();
    }
}

// --- Init ---

window.onerror = function(msg, url, line) {
    console.error('JS Error:', msg, 'at', url, 'line', line);
};

systemPromptInput.value = systemPrompt;
ttsVoiceSelect.value = ttsVoice;
renderChatHistory();
