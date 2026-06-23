const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = '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';

const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelSelect = document.getElementById('modelSelect');
const newChatBtn = document.querySelector('.new-chat-btn');

newChatBtn.addEventListener('click', () => {
    chatMessages.innerHTML = `
        <div class="message bot">
            <div class="avatar">AI</div>
            <div class="content">Hello! How can I help you today?</div>
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

function renderContent(text) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    let html = '';
    for (const part of parts) {
        if (part.startsWith('```')) {
            const match = part.match(/```(?:\w+)?\n?([\s\S]*?)```/);
            if (match) {
                const code = match[1].replace(/\n$/, '');
                const lang = part.split('\n')[0].replace('```', '').trim() || 'code';
                const id = 'code-' + Math.random().toString(36).slice(2, 7);
                html += `<div class="code-block">
                    <div class="code-header">
                        <span>${escapeHtml(lang)}</span>
                        <button class="copy-btn" onclick="copyCode('${id}')">Copy code</button>
                    </div>
                    <pre><code id="${id}">${escapeHtml(code)}</code></pre>
                </div>`;
            }
        } else {
            const paragraphs = part.split(/\n\n+/);
            for (const p of paragraphs) {
                const trimmed = p.trim();
                if (trimmed) {
                    html += `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
                }
            }
        }
    }
    return html;
}

function copyCode(id) {
    const code = document.getElementById(id).textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector(`[onclick="copyCode('${id}')"]`);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copy code';
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
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    addMessage('user', message);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.innerHTML = `
        <div class="avatar">AI</div>
        <div class="content"><p>Thinking...</p></div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

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
                    { role: 'system', content: 'You are a helpful AI assistant. When sharing code, always use markdown code blocks with the language specified.' },
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;

        loadingDiv.remove();
        addMessage('bot', renderContent(reply));

    } catch (error) {
        loadingDiv.remove();
        addMessage('bot', `<p>Error: ${escapeHtml(error.message)}</p>`);
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}
