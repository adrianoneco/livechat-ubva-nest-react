(function() {
  // Get widget ID from script tag
  const scriptTag = document.currentScript || document.querySelector('script[data-widget-id]');
  if (!scriptTag) {
    console.error('Widget: Script tag not found');
    return;
  }
  
  const WIDGET_ID = scriptTag.dataset.widgetId;
  const API_URL = scriptTag.dataset.apiUrl || 'https://livechat.app/functions/v1/widget-api';
  
  if (!WIDGET_ID) {
    console.error('Widget: data-widget-id attribute required');
    return;
  }

  // Prevent duplicate initialization
  if (window.__livechatWidgetInitialized) return;
  window.__livechatWidgetInitialized = true;

  let config = null;
  let conversationId = null;
  let visitorToken = localStorage.getItem('widget_token_' + WIDGET_ID);
  let isOpen = false;
  let messages = [];
  let pollingInterval = null;

  // Create styles
  const styles = document.createElement('style');
  styles.textContent = `
    #livechat-widget-root * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }

    #livechat-widget-root {
      --lc-primary: #10B981;
      --lc-primary-dark: #059669;
      --lc-bg: #ffffff;
      --lc-bg-secondary: #f3f4f6;
      --lc-text: #1f2937;
      --lc-text-secondary: #6b7280;
      --lc-border: #e5e7eb;
    }

    .lc-widget-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--lc-primary);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: 2147483647;
    }

    .lc-widget-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .lc-widget-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    .lc-widget-button.small { width: 48px; height: 48px; }
    .lc-widget-button.small svg { width: 22px; height: 22px; }
    .lc-widget-button.large { width: 72px; height: 72px; }
    .lc-widget-button.large svg { width: 32px; height: 32px; }

    .lc-widget-button.bottom-left {
      right: auto;
      left: 20px;
    }

    .lc-widget-container {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 520px;
      max-height: calc(100vh - 120px);
      background: var(--lc-bg);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483646;
    }

    .lc-widget-container.open {
      display: flex;
      animation: lc-slideUp 0.3s ease;
    }

    .lc-widget-container.bottom-left {
      right: auto;
      left: 20px;
    }

    @keyframes lc-slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .lc-widget-header {
      background: var(--lc-primary);
      color: white;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .lc-widget-header-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lc-widget-header-avatar svg {
      width: 24px;
      height: 24px;
      fill: white;
    }

    .lc-widget-header-info h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 2px;
    }

    .lc-widget-header-info p {
      font-size: 13px;
      opacity: 0.9;
    }

    .lc-widget-close {
      margin-left: auto;
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      transition: background 0.2s;
    }

    .lc-widget-close:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .lc-widget-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--lc-bg-secondary);
    }

    .lc-widget-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
    }

    .lc-widget-message.visitor {
      align-self: flex-end;
      background: var(--lc-primary);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .lc-widget-message.agent {
      align-self: flex-start;
      background: var(--lc-bg);
      color: var(--lc-text);
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .lc-widget-message-time {
      font-size: 11px;
      opacity: 0.7;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: flex-end;
    }

    .lc-widget-message-status {
      display: inline-flex;
    }

    .lc-widget-message-status svg {
      width: 14px;
      height: 14px;
    }

    .lc-widget-message.visitor .lc-widget-message-status svg {
      fill: rgba(255, 255, 255, 0.7);
    }

    .lc-widget-message.visitor .lc-widget-message-status.read svg {
      fill: #60a5fa;
    }

    .lc-widget-welcome {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 24px;
      background: var(--lc-bg-secondary);
    }

    .lc-widget-welcome h3 {
      font-size: 24px;
      margin-bottom: 8px;
      color: var(--lc-text);
    }

    .lc-widget-welcome p {
      color: var(--lc-text-secondary);
      margin-bottom: 24px;
    }

    .lc-widget-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .lc-widget-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--lc-border);
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
      background: var(--lc-bg);
      color: var(--lc-text);
    }

    .lc-widget-input:focus {
      border-color: var(--lc-primary);
    }

    .lc-widget-submit {
      background: var(--lc-primary);
      color: white;
      border: none;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .lc-widget-submit:hover {
      background: var(--lc-primary-dark);
    }

    .lc-widget-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .lc-widget-input-area {
      padding: 16px;
      background: var(--lc-bg);
      border-top: 1px solid var(--lc-border);
      display: flex;
      gap: 8px;
    }

    .lc-widget-input-area input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid var(--lc-border);
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      background: var(--lc-bg);
      color: var(--lc-text);
    }

    .lc-widget-input-area input:focus {
      border-color: var(--lc-primary);
    }

    .lc-widget-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--lc-primary);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .lc-widget-send:hover {
      background: var(--lc-primary-dark);
    }

    .lc-widget-send svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .lc-widget-offline {
      background: #fef3c7;
      color: #92400e;
      padding: 12px 16px;
      font-size: 13px;
      text-align: center;
    }

    .lc-widget-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      flex: 1;
    }

    .lc-widget-loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--lc-border);
      border-top-color: var(--lc-primary);
      border-radius: 50%;
      animation: lc-spin 0.8s linear infinite;
    }

    @keyframes lc-spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 420px) {
      .lc-widget-container {
        width: calc(100vw - 24px);
        right: 12px;
        left: 12px;
        bottom: 80px;
        height: calc(100vh - 100px);
        max-height: none;
      }

      .lc-widget-container.bottom-left {
        right: 12px;
      }

      .lc-widget-button {
        bottom: 12px;
        right: 12px;
      }

      .lc-widget-button.bottom-left {
        left: 12px;
      }
    }
  `;
  document.head.appendChild(styles);

  // Create widget HTML
  const root = document.createElement('div');
  root.id = 'livechat-widget-root';
  root.innerHTML = `
    <button class="lc-widget-button" id="lcWidgetButton">
      <svg id="lcChatIcon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      <svg id="lcCloseIcon" style="display:none" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </button>
    <div class="lc-widget-container" id="lcWidgetContainer">
      <div class="lc-widget-header">
        <div class="lc-widget-header-avatar">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        </div>
        <div class="lc-widget-header-info">
          <h3 id="lcWidgetTitle">Olá! 👋</h3>
          <p id="lcWidgetSubtitle">Estamos online</p>
        </div>
        <button class="lc-widget-close" id="lcWidgetClose">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div id="lcWidgetContent">
        <div class="lc-widget-loading">
          <div class="lc-widget-loading-spinner"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // Get elements
  const widgetButton = document.getElementById('lcWidgetButton');
  const widgetContainer = document.getElementById('lcWidgetContainer');
  const widgetClose = document.getElementById('lcWidgetClose');
  const chatIcon = document.getElementById('lcChatIcon');
  const closeIcon = document.getElementById('lcCloseIcon');
  const widgetTitle = document.getElementById('lcWidgetTitle');
  const widgetSubtitle = document.getElementById('lcWidgetSubtitle');
  const widgetContent = document.getElementById('lcWidgetContent');

  // Event listeners
  widgetButton.addEventListener('click', toggleWidget);
  widgetClose.addEventListener('click', toggleWidget);

  // Initialize
  async function init() {
    try {
      const res = await fetch(`${API_URL}/config?id=${WIDGET_ID}`);
      if (!res.ok) throw new Error('Failed to load widget');
      
      config = await res.json();
      applyConfig();
      
      if (visitorToken) {
        await loadMessages();
      }
    } catch (err) {
      console.error('Widget init error:', err);
      widgetContent.innerHTML = '<div style="padding: 24px; text-align: center; color: #6b7280;">Widget não disponível</div>';
    }
  }

  function applyConfig() {
    if (!config) return;

    root.style.setProperty('--lc-primary', config.primary_color);
    root.style.setProperty('--lc-primary-dark', adjustColor(config.primary_color, -20));

    if (config.position === 'bottom-left') {
      widgetButton.classList.add('bottom-left');
      widgetContainer.classList.add('bottom-left');
    }

    if (config.button_size === 'small') widgetButton.classList.add('small');
    if (config.button_size === 'large') widgetButton.classList.add('large');

    widgetTitle.textContent = config.welcome_title;
    widgetSubtitle.textContent = config.is_online ? 'Estamos online' : 'Fora do horário';

    renderContent();
  }

  function renderContent() {
    if (!config.is_online) {
      widgetContent.innerHTML = `
        <div class="lc-widget-offline">${escapeHtml(config.offline_message)}</div>
        ${visitorToken ? renderChat() : renderWelcome()}
      `;
    } else if (!visitorToken) {
      widgetContent.innerHTML = renderWelcome();
    } else {
      widgetContent.innerHTML = renderChat();
      scrollToBottom();
      startPolling();
    }

    // Bind form events
    const form = widgetContent.querySelector('.lc-widget-form');
    if (form) {
      form.addEventListener('submit', startConversation);
    }

    // Bind message input events
    const messageInput = document.getElementById('lcMessageInput');
    const sendButton = document.getElementById('lcSendButton');
    if (messageInput) {
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
      });
    }
    if (sendButton) {
      sendButton.addEventListener('click', sendMessage);
    }
  }

  function renderWelcome() {
    let fields = '';
    if (config.require_name) {
      fields += `<input type="text" class="lc-widget-input" id="lcVisitorName" placeholder="Seu nome" required>`;
    }
    if (config.require_email) {
      fields += `<input type="email" class="lc-widget-input" id="lcVisitorEmail" placeholder="Seu e-mail">`;
    }
    if (config.require_phone) {
      fields += `<input type="tel" class="lc-widget-input" id="lcVisitorPhone" placeholder="Seu telefone (WhatsApp)" required>`;
    }
    
    return `
      <div class="lc-widget-welcome">
        <h3>${escapeHtml(config.welcome_title)}</h3>
        <p>${escapeHtml(config.welcome_message)}</p>
        <form class="lc-widget-form">
          ${fields}
          <button type="submit" class="lc-widget-submit">Iniciar conversa</button>
        </form>
      </div>
    `;
  }

  function renderChat() {
    return `
      <div class="lc-widget-messages" id="lcWidgetMessages">
        ${messages.map(m => `
          <div class="lc-widget-message ${m.is_from_visitor ? 'visitor' : 'agent'}">
            ${escapeHtml(m.content)}
            <div class="lc-widget-message-time">
              ${formatTime(m.created_at)}
              ${m.is_from_visitor ? renderStatusIcon(m.status) : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="lc-widget-input-area">
        <input type="text" id="lcMessageInput" placeholder="Digite sua mensagem...">
        <button class="lc-widget-send" id="lcSendButton">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
  }

  function renderStatusIcon(status) {
    const icons = {
      sending: '<span class="lc-widget-message-status"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/></svg></span>',
      sent: '<span class="lc-widget-message-status"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>',
      delivered: '<span class="lc-widget-message-status"><svg viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg></span>',
      read: '<span class="lc-widget-message-status read"><svg viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg></span>',
      failed: '<span class="lc-widget-message-status"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#ef4444"/></svg></span>'
    };
    return icons[status] || icons.sent;
  }

  async function startConversation(e) {
    e.preventDefault();
    
    const name = document.getElementById('lcVisitorName')?.value;
    const email = document.getElementById('lcVisitorEmail')?.value;
    const phone = document.getElementById('lcVisitorPhone')?.value;

    const submitBtn = widgetContent.querySelector('.lc-widget-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widget_id: WIDGET_ID,
          visitor_name: name,
          visitor_email: email,
          visitor_phone: phone,
          user_agent: navigator.userAgent,
          referrer_url: document.referrer,
          page_url: window.location.href
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erro ao iniciar conversa');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const data = await res.json();
      conversationId = data.conversation_id;
      visitorToken = data.token;
      localStorage.setItem('widget_token_' + WIDGET_ID, visitorToken);
      
      renderContent();
    } catch (err) {
      console.error('Error starting conversation:', err);
      alert('Erro ao iniciar conversa. Tente novamente.');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function sendMessage() {
    const input = document.getElementById('lcMessageInput');
    const content = input?.value?.trim();
    if (!content) return;

    input.value = '';

    const tempMsg = {
      content,
      is_from_visitor: true,
      status: 'sending',
      created_at: new Date().toISOString()
    };
    messages.push(tempMsg);
    updateMessages();

    try {
      const res = await fetch(`${API_URL}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Token': visitorToken
        },
        body: JSON.stringify({ content })
      });
      
      if (res.ok) {
        tempMsg.status = 'sent';
      } else {
        tempMsg.status = 'failed';
      }
      updateMessages();
    } catch (err) {
      console.error('Error sending message:', err);
      tempMsg.status = 'failed';
      updateMessages();
    }
  }

  async function loadMessages() {
    try {
      const res = await fetch(`${API_URL}/messages`, {
        headers: { 'X-Widget-Token': visitorToken }
      });
      
      if (res.ok) {
        const data = await res.json();
        messages = data.messages || [];
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  function updateMessages() {
    const container = document.getElementById('lcWidgetMessages');
    if (!container) return;

    container.innerHTML = messages.map(m => `
      <div class="lc-widget-message ${m.is_from_visitor ? 'visitor' : 'agent'}">
        ${escapeHtml(m.content)}
        <div class="lc-widget-message-time">
          ${formatTime(m.created_at)}
          ${m.is_from_visitor ? renderStatusIcon(m.status) : ''}
        </div>
      </div>
    `).join('');

    scrollToBottom();
  }

  function scrollToBottom() {
    const container = document.getElementById('lcWidgetMessages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
      if (!isOpen) return;
      await loadMessages();
      updateMessages();
    }, 3000);
  }

  function toggleWidget() {
    isOpen = !isOpen;
    
    if (isOpen) {
      widgetContainer.classList.add('open');
      chatIcon.style.display = 'none';
      closeIcon.style.display = 'block';
      if (visitorToken) {
        startPolling();
        markMessagesAsRead();
      }
    } else {
      widgetContainer.classList.remove('open');
      chatIcon.style.display = 'block';
      closeIcon.style.display = 'none';
      if (pollingInterval) clearInterval(pollingInterval);
    }
  }

  async function markMessagesAsRead() {
    if (!visitorToken) return;
    try {
      await fetch(`${API_URL}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Token': visitorToken
        }
      });
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }

  function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Start
  init();
})();
