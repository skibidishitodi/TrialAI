const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

let apiKey = localStorage.getItem('groq_api_key') || '';

const apiKeyInput = document.getElementById('apiKey');
const setKeyBtn = document.getElementById('setKeyBtn');
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

if (apiKey) {
    apiKeyInput.value = apiKey;
}

setKeyBtn.addEventListener('click', () => {
    apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        localStorage.setItem('groq_api_key', apiKey);
        addMessage('bot', 'API key saved! You can now chat.');
    } else {
        addMessage('bot', 'Please enter a valid API key.');
    }
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="avatar">${role === 'bot' ? '🤖' : '👤'}</div>
        <div class="content">${content}</div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    if (!apiKey) {
        addMessage('bot', 'Please enter your Groq API key first.');
        return;
    }

    addMessage('user', message);
    userInput.value = '';
    sendBtn.disabled = true;

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="content thinking">Thinking...</div>
    `;
    chatMessages.appendChild(loadingDiv);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a helpful AI assistant.' },
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;

        loadingDiv.remove();
        addMessage('bot', reply);

    } catch (error) {
        loadingDiv.remove();
        addMessage('bot', `Error: ${error.message}`);
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}
