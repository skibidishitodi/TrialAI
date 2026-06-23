const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = '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';

const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const newChatBtn = document.getElementById('newChatBtn');
const welcomeScreen = document.getElementById('welcomeScreen');

let conversationHistory = [];

newChatBtn.addEventListener('click', () => {
    conversationHistory = [];
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
        </div>
    `;
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
});

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

function parseCodeBlocks(text) {
    const regex = /```([^\s\n]*)\n([\s\S]*?)```/g;
    const files = [];
    let lastIndex = 0;
    let html = '';
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            const before = text.slice(lastIndex, match.index).trim();
            if (before) {
                html += renderMarkdownBlock(before);
            }
        }

        const lang = match[1] || 'code';
        const code = match[2].replace(/\n$/, '');
        const id = 'code-' + Math.random().toString(36).slice(2, 9);

        const looksLikeFile = lang.includes('.') || lang.includes('/') || lang.includes('\\');
        const fileName = looksLikeFile ? lang : null;

        if (fileName) {
            files.push({ name: fileName, content: code });
        }

        html += `<div class="code-block" data-file="${fileName ? escapeHtml(fileName) : ''}">
            <div class="code-header">
                <span>${escapeHtml(lang)}</span>
                <button class="copy-btn" onclick="copyCode('${id}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copy
                </button>
            </div>
            <pre><code id="${id}" class="language-${escapeHtml(fileName ? fileName.split('.').pop() : lang)}">${escapeHtml(code)}</code></pre>
        </div>`;

        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex).trim();
        if (remaining) {
            html += renderMarkdownBlock(remaining);
        }
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download all as ZIP (${files.length} files)
            </button>
        </div>`;
        window['files_' + zipId] = files;
    }

    return downloadBtn + html;
}

async function downloadZip(zipId) {
    const files = window['files_' + zipId];
    if (!files) return;

    const zip = new JSZip();
    const folder = zip.folder('project');

    for (const file of files) {
        folder.file(file.name, file.content);
    }

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

function renderMarkdownBlock(text) {
    const paragraphs = text.split(/\n\n+/);
    let html = '';
    for (const p of paragraphs) {
        const trimmed = p.trim();
        if (trimmed) {
            html += '<p>' + renderInlineMarkdown(trimmed.replace(/\n/g, '<br>')) + '</p>';
        }
    }
    return html;
}

function copyCode(id) {
    const code = document.getElementById(id).textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector(`[onclick="copyCode('${id}')"]`);
        btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copied!
        `;
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copy
            `;
            btn.classList.remove('copied');
        }, 2000);
    });
}

function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="avatar">${role === 'bot' ? 'AI' : 'You'}</div>
        <div class="content">${role === 'bot' ? content : '<p>' + escapeHtml(content) + '</p>'}</div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (role === 'bot') {
        div.querySelectorAll('pre code').forEach((block) => {
            if (typeof hljs !== 'undefined') {
                hljs.highlightElement(block);
            }
        });
    }
}

function addThinkingMessage() {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.id = 'thinkingMessage';
    div.innerHTML = `
        <div class="avatar">AI</div>
        <div class="content">
            <div class="thinking-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

function removeThinkingMessage() {
    const thinking = document.getElementById('thinkingMessage');
    if (thinking) thinking.remove();
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    const welcomeEl = document.getElementById('welcomeScreen');
    if (welcomeEl) welcomeEl.remove();

    addMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });

    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

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
                    { role: 'system', content: 'You are a helpful AI assistant. When sharing code, use markdown code blocks. When the user asks you to create files or a project with multiple scripts, put the filename as the first line after the opening ``` (e.g. ```main.py\\nprint("hello")```). This lets the user download all files as a ZIP. Format responses nicely with paragraphs, lists, and headers when appropriate.' },
                    ...conversationHistory
                ],
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: reply });

        removeThinkingMessage();
        addMessage('bot', renderContent(reply));

    } catch (error) {
        removeThinkingMessage();
        addMessage('bot', `<p class="error-text">Error: ${escapeHtml(error.message)}</p>`);
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}
