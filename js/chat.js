/**
 * chat.js — Production Real-Time Chat System
 * WhatsApp-style user widget + Admin live dashboard
 * Socket.IO with JWT auth, rooms, typing, read receipts, history
 * Features: Smart Bot, Ticket Escalation, Admin Ticket Panel
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════════════════════ */
  let socket       = null;
  let currentRoom  = null;
  let isAdmin      = false;
  let myName       = '';
  let myId         = '';
  let myRole       = 'user';
  let fabUnread    = 0;
  let chatOpen     = false;
  let typingTimer  = null;
  let isTyping     = false;
  let initialized  = false;

  // Admin state
  let conversations   = {};   // room → { name, preview, time, unread, online }
  let activeAdminRoom = null;
  let adminView       = 'chats'; // 'chats' | 'tickets'
  let tickets         = [];      // array of ticket objects
  let ticketUnread    = 0;

  // User ticket state
  let ticketFormOpen  = false;
  let raisingTicket   = false;

  /* ═══════════════════════════════════════════════════════════
     INIT — called by App.showApp(user)
  ═══════════════════════════════════════════════════════════ */
  function init(user) {
    if (initialized || !user) return;
    initialized = true;

    myName = user.name || user.email || 'User';
    myId   = String(user._id || user.id || '');
    myRole = user.role || 'user';
    isAdmin = (myRole === 'admin');

    buildDOM();
    connectSocket();
  }

  /* ═══════════════════════════════════════════════════════════
     DOM BUILD
  ═══════════════════════════════════════════════════════════ */
  function buildDOM() {
    document.getElementById('chat-fab')?.remove();
    document.getElementById('chat-window')?.remove();
    document.getElementById('chat-admin-panel')?.remove();

    if (isAdmin) {
      buildAdminDOM();
    } else {
      buildUserDOM();
    }
  }

  /* ─── User Widget ─────────────────────────────────────────── */
  function buildUserDOM() {
    document.body.insertAdjacentHTML('beforeend', `
      <button id="chat-fab" title="Support Chat" aria-label="Open support chat">
        <svg viewBox="0 0 24 24" fill="white" width="26" height="26">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        </svg>
        <span id="chat-unread-fab" class="hidden">0</span>
      </button>

      <div id="chat-window" class="chat-hidden">
        <div class="chat-header">
          <div class="chat-header-avatar">🧑‍💼</div>
          <div class="chat-header-info">
            <div class="chat-header-name">GST Support</div>
            <div class="chat-header-sub">
              <span class="chat-status-dot offline" id="user-status-dot"></span>
              <span id="user-status-text">Connecting…</span>
            </div>
          </div>
          <button class="chat-close-btn" id="chat-close-btn" title="Close">✕</button>
        </div>

        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty-state" id="chat-empty">
            <div class="chat-empty-icon">💬</div>
            <div class="chat-empty-title">We're here to help!</div>
            <div class="chat-empty-sub">Send us a message and our support team will reply shortly.</div>
          </div>
        </div>

        <div class="chat-typing-bar hidden" id="chat-typing">
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span id="chat-typing-label">Support is typing…</span>
        </div>

        <!-- Ticket form (hidden by default, shown inside chat window) -->
        <div id="chat-ticket-form" class="chat-ticket-form hidden">
          <div class="chat-ticket-form-header">
            <span>🎫 Raise a Support Ticket</span>
            <button class="chat-ticket-close-btn" id="chat-ticket-close" title="Cancel">✕</button>
          </div>
          <div class="chat-ticket-form-body">
            <input id="ticket-subject" type="text" placeholder="Subject (e.g. Invoice not generating)" maxlength="200" class="chat-ticket-input">
            <textarea id="ticket-description" placeholder="Describe your issue in detail…" maxlength="4000" rows="4" class="chat-ticket-textarea"></textarea>
            <div class="chat-ticket-priority-row">
              <label class="chat-ticket-label">Priority:</label>
              <select id="ticket-priority" class="chat-ticket-select">
                <option value="low">🟢 Low</option>
                <option value="medium" selected>🟡 Medium</option>
                <option value="high">🔴 High</option>
              </select>
            </div>
            <button id="ticket-submit-btn" class="chat-ticket-submit-btn">
              <span id="ticket-submit-text">Submit Ticket 🎫</span>
            </button>
          </div>
        </div>

        <div class="chat-input-bar">
          <div class="chat-input-wrap">
            <input id="chat-input" type="text" placeholder="Type a message…" autocomplete="off" maxlength="2000">
          </div>
          <button class="chat-send-btn" id="chat-send-btn" title="Send">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    `);

    document.getElementById('chat-fab').addEventListener('click', toggle);
    document.getElementById('chat-close-btn').addEventListener('click', toggle);
    document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keydown', onInputKeydown);
    document.getElementById('chat-input').addEventListener('input', onInputChange);
    document.getElementById('chat-ticket-close').addEventListener('click', closeTicketForm);
    document.getElementById('ticket-submit-btn').addEventListener('click', submitTicket);
  }

  /* ─── Admin Dashboard Panel ───────────────────────────────── */
  function buildAdminDOM() {
    document.body.insertAdjacentHTML('beforeend', `
      <button id="chat-fab" title="Support Dashboard" aria-label="Open support dashboard">
        <svg viewBox="0 0 24 24" fill="white" width="26" height="26">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        </svg>
        <span id="chat-unread-fab" class="hidden">0</span>
      </button>

      <div id="chat-admin-panel" class="chat-hidden">
        <div class="chat-header">
          <div class="chat-header-avatar">🛡️</div>
          <div class="chat-header-info">
            <div class="chat-header-name">Support Dashboard</div>
            <div class="chat-header-sub">
              <span class="chat-status-dot online"></span>
              <span id="admin-online-count">0 active users</span>
            </div>
          </div>
          <span class="chat-header-badge">ADMIN</span>
          <button class="chat-close-btn" id="chat-close-btn" title="Close">✕</button>
        </div>

        <!-- Tabs -->
        <div class="chat-admin-tabs">
          <button class="chat-admin-tab active" id="tab-chats" onclick="ChatModule._adminTab('chats')">
            💬 Chats
          </button>
          <button class="chat-admin-tab" id="tab-tickets" onclick="ChatModule._adminTab('tickets')">
            🎫 Tickets
            <span id="ticket-tab-badge" class="ticket-tab-badge hidden">0</span>
          </button>
        </div>

        <div class="chat-admin-body">
          <!-- ── CHATS VIEW ── -->
          <div id="admin-chats-view" class="chat-admin-view">
            <!-- Left: conversations -->
            <div class="chat-sidebar">
              <div class="chat-sidebar-title">Conversations</div>
              <div class="chat-sidebar-list" id="admin-conv-list">
                <div class="chat-no-convs">
                  <div class="chat-no-convs-icon">💬</div>
                  <div>No active chats yet</div>
                </div>
              </div>
            </div>

            <!-- Right: messages -->
            <div class="chat-main" id="admin-chat-main">
              <div class="chat-select-placeholder" id="admin-placeholder">
                <div class="chat-select-placeholder-icon">👈</div>
                <div>Select a conversation</div>
              </div>

              <div class="chat-messages chat-hidden" id="admin-messages"></div>

              <div class="chat-typing-bar hidden" id="admin-typing">
                <div class="typing-dots"><span></span><span></span><span></span></div>
                <span id="admin-typing-label">User is typing…</span>
              </div>

              <div class="chat-input-bar chat-hidden" id="admin-input-bar">
                <div class="chat-input-wrap">
                  <input id="admin-chat-input" type="text" placeholder="Reply to user…" autocomplete="off" maxlength="2000">
                </div>
                <button class="chat-send-btn" id="admin-send-btn" title="Send">
                  <svg viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- ── TICKETS VIEW ── -->
          <div id="admin-tickets-view" class="chat-admin-view hidden">
            <div class="chat-sidebar">
              <div class="chat-sidebar-title">Support Tickets</div>
              <div class="chat-ticket-filters">
                <select id="ticket-filter-status" class="chat-ticket-filter-select" onchange="ChatModule._filterTickets()">
                  <option value="">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div class="chat-sidebar-list" id="admin-ticket-list">
                <div class="chat-no-convs">
                  <div class="chat-no-convs-icon">🎫</div>
                  <div>No tickets yet</div>
                </div>
              </div>
            </div>

            <!-- Ticket detail view -->
            <div class="chat-main" id="admin-ticket-detail-area">
              <div class="chat-select-placeholder" id="admin-ticket-placeholder">
                <div class="chat-select-placeholder-icon">🎫</div>
                <div>Select a ticket to view details</div>
              </div>
              <div id="admin-ticket-detail" class="chat-ticket-detail hidden"></div>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('chat-fab').addEventListener('click', toggle);
    document.getElementById('chat-close-btn').addEventListener('click', toggle);
    document.getElementById('admin-send-btn').addEventListener('click', adminSendMessage);
    document.getElementById('admin-chat-input').addEventListener('keydown', onAdminInputKeydown);
    document.getElementById('admin-chat-input').addEventListener('input', onAdminInputChange);
  }

  /* ═══════════════════════════════════════════════════════════
     TOGGLE
  ═══════════════════════════════════════════════════════════ */
  function toggle() {
    chatOpen = !chatOpen;
    const panel = document.getElementById(isAdmin ? 'chat-admin-panel' : 'chat-window');
    if (!panel) return;
    panel.classList.toggle('chat-hidden', !chatOpen);

    if (chatOpen) {
      fabUnread = 0;
      updateFabBadge();
      if (!isAdmin) {
        setTimeout(() => document.getElementById('chat-input')?.focus(), 150);
        scrollBottom('chat-messages');
      } else if (adminView === 'tickets') {
        loadAdminTickets();
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ADMIN TAB SWITCHER
  ═══════════════════════════════════════════════════════════ */
  function adminSwitchTab(tab) {
    adminView = tab;
    document.querySelectorAll('.chat-admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');

    document.getElementById('admin-chats-view').classList.toggle('hidden', tab !== 'chats');
    document.getElementById('admin-tickets-view').classList.toggle('hidden', tab !== 'tickets');

    if (tab === 'tickets') {
      ticketUnread = 0;
      updateTicketBadge();
      loadAdminTickets();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     SOCKET.IO
  ═══════════════════════════════════════════════════════════ */
  function connectSocket() {
    socket = io(window.location.origin.includes('localhost') ? window.location.origin : 'https://gst-management-system.onrender.com', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('✅ Chat socket connected:', socket.id);
      socket.emit('authenticate', {
        token:    localStorage.getItem('gst_token'),
        userId:   myId,
        userName: myName,
        role:     myRole,
      });
    });

    socket.on('authenticated', (data) => {
      if (!data.ok) { console.warn('Chat auth failed:', data.error); return; }
      console.log('✅ Chat authenticated as', data.role);

      if (!isAdmin) {
        currentRoom = data.room || `chat_${myId}`;
        socket.emit('joinRoom', currentRoom);
        setUserStatus(true);
        loadHistory(currentRoom, 'chat-messages');
      } else {
        console.log('👮 Admin authenticated, listening for user messages...');
      }
    });

    socket.on('receiveMessage', onReceiveMessage);
    socket.on('typing',         onRemoteTyping);
    socket.on('stopTyping',     onRemoteStopTyping);

    /* Admin-specific events */
    socket.on('roomList',       onRoomList);
    socket.on('newUserMessage', onNewUserMessage);
    socket.on('onlineUsers',    onOnlineUsers);
    socket.on('ticketCreated',  onTicketCreated);

    socket.on('disconnect', () => {
      console.warn('❌ Chat disconnected');
      if (!isAdmin) setUserStatus(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Chat connect error:', err.message);
    });
  }

  /* ── Set user status indicator ─────────────────────────────── */
  function setUserStatus(online) {
    const dot  = document.getElementById('user-status-dot');
    const text = document.getElementById('user-status-text');
    if (dot)  { dot.className = `chat-status-dot ${online ? 'online' : 'offline'}`; }
    if (text) { text.textContent = online ? 'Support Online' : 'Reconnecting…'; }
  }

  /* ═══════════════════════════════════════════════════════════
     MESSAGE — USER SIDE
  ═══════════════════════════════════════════════════════════ */
  function sendMessage() {
    if (!socket?.connected || !currentRoom) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    stopTyping();

    socket.emit('sendMessage', {
      room:       currentRoom,
      message:    text,
      sender:     myId,
      senderName: myName,
      role:       'user',
      userId:     myId,
    });
  }

  function onInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function onInputChange() {
    if (!socket?.connected || !currentRoom) return;
    if (!isTyping) {
      isTyping = true;
      socket.emit('typing', { room: currentRoom, sender: myName });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 2200);
  }

  function stopTyping() {
    if (!isTyping) return;
    isTyping = false;
    clearTimeout(typingTimer);
    if (socket?.connected && currentRoom) {
      socket.emit('stopTyping', { room: currentRoom });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TICKET FORM — USER SIDE
  ═══════════════════════════════════════════════════════════ */
  function openTicketForm() {
    if (ticketFormOpen) return;
    ticketFormOpen = true;
    const form = document.getElementById('chat-ticket-form');
    if (form) {
      form.classList.remove('hidden');
      document.getElementById('ticket-subject')?.focus();
    }
  }

  function closeTicketForm() {
    ticketFormOpen = false;
    const form = document.getElementById('chat-ticket-form');
    if (form) form.classList.add('hidden');
  }

  async function submitTicket() {
    if (raisingTicket) return;
    const subject     = document.getElementById('ticket-subject')?.value.trim();
    const description = document.getElementById('ticket-description')?.value.trim();
    const priority    = document.getElementById('ticket-priority')?.value || 'medium';

    if (!subject) {
      document.getElementById('ticket-subject')?.focus();
      showTicketError('Please enter a subject for your ticket.');
      return;
    }
    if (!description) {
      document.getElementById('ticket-description')?.focus();
      showTicketError('Please describe your issue.');
      return;
    }

    raisingTicket = true;
    const btn  = document.getElementById('ticket-submit-btn');
    const text = document.getElementById('ticket-submit-text');
    if (btn)  btn.disabled = true;
    if (text) text.textContent = 'Submitting…';

    try {
      const token = localStorage.getItem('gst_token');
      const res   = await fetch(API_BASE + '/tickets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ subject, description, priority, chatRoom: currentRoom }),
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.message || 'Failed to create ticket');

      const ticketId = json.data.ticketId;
      closeTicketForm();
      appendTicketSuccessCard(ticketId, subject);

    } catch (e) {
      showTicketError(e.message || 'Failed to raise ticket. Please try again.');
    } finally {
      raisingTicket = false;
      const btn2  = document.getElementById('ticket-submit-btn');
      const text2 = document.getElementById('ticket-submit-text');
      if (btn2)  btn2.disabled = false;
      if (text2) text2.textContent = 'Submit Ticket 🎫';
    }
  }

  function showTicketError(msg) {
    const existing = document.getElementById('ticket-error-msg');
    if (existing) existing.remove();
    const err = document.createElement('div');
    err.id = 'ticket-error-msg';
    err.className = 'chat-ticket-error';
    err.textContent = msg;
    document.getElementById('chat-ticket-form')?.querySelector('.chat-ticket-form-body')?.prepend(err);
    setTimeout(() => err.remove(), 4000);
  }

  function appendTicketSuccessCard(ticketId, subject) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    removeEmpty('chat-messages');

    const card = document.createElement('div');
    card.className = 'chat-ticket-success-card';
    card.innerHTML = `
      <div class="chat-ticket-success-icon">✅</div>
      <div class="chat-ticket-success-title">Ticket Raised Successfully!</div>
      <div class="chat-ticket-success-id">Ticket ID: <strong>${escHtml(ticketId)}</strong></div>
      <div class="chat-ticket-success-subject">${escHtml(subject)}</div>
      <div class="chat-ticket-success-note">An admin will review your ticket and get back to you soon. You can reference your Ticket ID for follow-up.</div>
    `;
    container.appendChild(card);
    scrollBottom('chat-messages');
  }

  /* ═══════════════════════════════════════════════════════════
     MESSAGE — ADMIN SIDE
  ═══════════════════════════════════════════════════════════ */
  function adminSendMessage() {
    if (!socket?.connected || !activeAdminRoom) return;
    const input = document.getElementById('admin-chat-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    onAdminStopTyping();

    socket.emit('sendMessage', {
      room:       activeAdminRoom,
      message:    text,
      sender:     myId,
      senderName: myName,
      role:       'admin',
      userId:     myId,
    });
  }

  function onAdminInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adminSendMessage(); }
  }

  function onAdminInputChange() {
    if (!socket?.connected || !activeAdminRoom) return;
    if (!isTyping) {
      isTyping = true;
      socket.emit('typing', { room: activeAdminRoom, sender: myName });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(onAdminStopTyping, 2200);
  }

  function onAdminStopTyping() {
    if (!isTyping) return;
    isTyping = false;
    clearTimeout(typingTimer);
    if (socket?.connected && activeAdminRoom) {
      socket.emit('stopTyping', { room: activeAdminRoom });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     RECEIVE MESSAGE
  ═══════════════════════════════════════════════════════════ */
  function onReceiveMessage(data) {
    if (!isAdmin) {
      if (data.room !== currentRoom) return;
      removeEmpty('chat-messages');

      // Check if it's a ticket_prompt
      if (data.type === 'ticket_prompt') {
        appendTicketPromptBubble(data);
      } else {
        appendBubble(data, 'chat-messages', false);
      }
      scrollBottom('chat-messages');

      if (!chatOpen) { fabUnread++; updateFabBadge(); }

    } else {
      const conv = conversations[data.room] || {};
      conversations[data.room] = {
        ...conv,
        name:    conv.name || data.senderName || ('User …' + data.room.slice(-6)),
        preview: data.message,
        time:    data.created_at || new Date().toISOString(),
        unread:  (data.room !== activeAdminRoom || !chatOpen)
                   ? ((conv.unread || 0) + (data.role === 'user' ? 1 : 0))
                   : 0,
      };
      renderConvList();

      if (data.room === activeAdminRoom) {
        removeEmpty('admin-messages');
        appendBubble(data, 'admin-messages', false);
        scrollBottom('admin-messages');
        if (socket?.connected) socket.emit('markRead', data.room);
      } else {
        if (!chatOpen) { fabUnread++; updateFabBadge(); }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TICKET PROMPT BUBBLE (user side)
  ═══════════════════════════════════════════════════════════ */
  function appendTicketPromptBubble(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = 'chat-msg recv';
    wrap.innerHTML = `
      <div class="chat-ticket-prompt-card">
        <div class="chat-ticket-prompt-icon">🤖</div>
        <div class="chat-ticket-prompt-sender">GST Support Bot</div>
        <div class="chat-ticket-prompt-msg">${escHtml(msg.message)}</div>
        <button class="chat-ticket-prompt-btn" onclick="ChatModule._openTicketForm()">
          🎫 Raise a Support Ticket
        </button>
        <div class="chat-ticket-prompt-time">${formatTime(msg.created_at)}</div>
      </div>
    `;
    container.appendChild(wrap);
  }

  /* ═══════════════════════════════════════════════════════════
     TYPING EVENTS
  ═══════════════════════════════════════════════════════════ */
  function onRemoteTyping(data) {
    if (!isAdmin) {
      if (data.room !== currentRoom) return;
      const el = document.getElementById('chat-typing');
      const lb = document.getElementById('chat-typing-label');
      if (el) el.classList.remove('hidden');
      if (lb) lb.textContent = `${data.sender} is typing…`;
    } else {
      if (data.room !== activeAdminRoom) return;
      const el = document.getElementById('admin-typing');
      const lb = document.getElementById('admin-typing-label');
      if (el) el.classList.remove('hidden');
      if (lb) lb.textContent = `${data.sender} is typing…`;
    }
  }

  function onRemoteStopTyping(data) {
    if (!isAdmin) {
      const el = document.getElementById('chat-typing');
      if (el) el.classList.add('hidden');
    } else {
      if (data.room !== activeAdminRoom) return;
      const el = document.getElementById('admin-typing');
      if (el) el.classList.add('hidden');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ADMIN: ROOM LIST + LIVE UPDATES
  ═══════════════════════════════════════════════════════════ */
  function onRoomList(rooms) {
    rooms.forEach(r => {
      conversations[r._id] = {
        name:    r.senderName || ('User …' + r._id.slice(-6)),
        preview: r.lastMessage || '',
        time:    r.lastTime    || new Date().toISOString(),
        unread:  r.unread      || 0,
      };
    });
    renderConvList();
  }

  function onNewUserMessage(data) {
    console.log('📨 Admin received newUserMessage:', data);
    const conv = conversations[data.room] || {};
    conversations[data.room] = {
      name:    data.senderName || conv.name || ('User …' + data.room.slice(-6)),
      preview: data.lastMessage,
      time:    data.lastTime,
      unread:  data.room !== activeAdminRoom
                 ? ((conv.unread || 0) + 1)
                 : 0,
    };
    if (!chatOpen) { fabUnread++; updateFabBadge(); }
    console.log('✅ Rendering conversation list with', Object.keys(conversations).length, 'conversations');
    renderConvList();
  }

  function onOnlineUsers(users) {
    const countEl = document.getElementById('admin-online-count');
    if (countEl) countEl.textContent = `${users.length} active user${users.length !== 1 ? 's' : ''}`;

    document.querySelectorAll('.chat-conv-online-dot').forEach(d => d.remove());
    users.forEach(u => {
      const item = document.querySelector(`.chat-conv-item[data-room="chat_${u.userId}"]`);
      if (item) {
        const dot = document.createElement('span');
        dot.className = 'chat-conv-online-dot';
        item.querySelector('.chat-conv-avatar')?.appendChild(dot);
      }
    });
  }

  /* ── Admin: ticket created via socket ─────────────────────── */
  function onTicketCreated(ticket) {
    // Prepend to local tickets array
    const exists = tickets.find(t => t.ticketId === ticket.ticketId);
    if (!exists) tickets.unshift(ticket);

    ticketUnread++;
    updateTicketBadge();

    // If ticket tab is open, re-render the list
    if (adminView === 'tickets') {
      renderAdminTicketList(tickets);
    }

    // FAB badge
    if (!chatOpen) { fabUnread++; updateFabBadge(); }
  }

  /* ── Render conversation list ─────────────────────────────── */
  function renderConvList() {
    const list = document.getElementById('admin-conv-list');
    if (!list) {
      console.warn('⚠️ admin-conv-list element not found');
      return;
    }

    const entries = Object.entries(conversations);
    console.log('🔄 Rendering conversation list:', entries.length, 'conversations');
    
    if (entries.length === 0) {
      list.innerHTML = `
        <div class="chat-no-convs">
          <div class="chat-no-convs-icon">💬</div>
          <div>No active chats yet</div>
        </div>`;
      return;
    }

    entries.sort((a, b) => new Date(b[1].time) - new Date(a[1].time));

    const totalUnread = entries.reduce((s, [, v]) => s + (v.unread || 0), 0);
    if (totalUnread > 0 && !chatOpen) updateFabBadge(totalUnread);

    list.innerHTML = entries.map(([room, conv]) => {
      const initials = (conv.name || '?').charAt(0).toUpperCase();
      const isActive = room === activeAdminRoom;
      const unread   = conv.unread || 0;
      return `
        <div class="chat-conv-item ${isActive ? 'active' : ''}"
             data-room="${escAttr(room)}"
             onclick="ChatModule._adminSelectRoom('${escAttr(room)}')">
          <div class="chat-conv-avatar">${escHtml(initials)}</div>
          <div class="chat-conv-info">
            <div class="chat-conv-name">${escHtml(conv.name)}</div>
            <div class="chat-conv-preview">${escHtml(conv.preview || 'No messages yet')}</div>
          </div>
          <div class="chat-conv-meta">
            <div class="chat-conv-time">${formatTime(conv.time)}</div>
            <div class="chat-conv-unread ${unread === 0 ? 'hidden' : ''}">${unread > 99 ? '99+' : unread}</div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Admin select / switch room ───────────────────────────── */
  function adminSelectRoom(room) {
    if (activeAdminRoom === room) return;

    if (activeAdminRoom) socket.emit('leaveRoom', activeAdminRoom);

    activeAdminRoom = room;
    socket.emit('joinRoom', room);

    document.getElementById('admin-placeholder')?.classList.add('chat-hidden');
    document.getElementById('admin-messages')?.classList.remove('chat-hidden');
    document.getElementById('admin-input-bar')?.classList.remove('chat-hidden');

    if (conversations[room]) conversations[room].unread = 0;
    renderConvList();

    const msgEl = document.getElementById('admin-messages');
    if (msgEl) msgEl.innerHTML = '';
    loadHistory(room, 'admin-messages');

    if (socket?.connected) socket.emit('markRead', room);

    setTimeout(() => document.getElementById('admin-chat-input')?.focus(), 100);
  }

  /* ═══════════════════════════════════════════════════════════
     ADMIN: TICKETS
  ═══════════════════════════════════════════════════════════ */
  async function loadAdminTickets() {
    try {
      const token  = localStorage.getItem('gst_token');
      const status = document.getElementById('ticket-filter-status')?.value || '';
      const url    = API_BASE + `/tickets${status ? `?status=${status}` : ''}`;
      const res    = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const json   = await res.json();
      if (!json.success) return;
      tickets = json.data;
      renderAdminTicketList(tickets);
    } catch (e) {
      console.warn('Load tickets error:', e.message);
    }
  }

  function renderAdminTicketList(list) {
    const el = document.getElementById('admin-ticket-list');
    if (!el) return;

    if (!list || list.length === 0) {
      el.innerHTML = `<div class="chat-no-convs"><div class="chat-no-convs-icon">🎫</div><div>No tickets yet</div></div>`;
      return;
    }

    const statusColors = { open: 'ticket-open', in_progress: 'ticket-progress', resolved: 'ticket-resolved', closed: 'ticket-closed' };
    const priorityColors = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };

    el.innerHTML = list.map(t => `
      <div class="chat-conv-item ${statusColors[t.status] || ''}"
           data-ticket="${escAttr(t.ticketId)}"
           onclick="ChatModule._adminViewTicket('${escAttr(t.ticketId)}')">
        <div class="chat-conv-avatar ticket-avatar">🎫</div>
        <div class="chat-conv-info">
          <div class="chat-conv-name">${escHtml(t.userName || 'Unknown User')}</div>
          <div class="chat-conv-preview">${escHtml(t.subject)}</div>
        </div>
        <div class="chat-conv-meta">
          <div class="ticket-status-badge ${statusColors[t.status] || ''}">${escHtml(t.status.replace('_', ' '))}</div>
          <div class="ticket-priority-dot ${priorityColors[t.priority] || ''}"></div>
        </div>
      </div>
    `).join('');
  }

  function adminViewTicket(ticketId) {
    const ticket = tickets.find(t => t.ticketId === ticketId);
    if (!ticket) return;

    // Highlight active in list
    document.querySelectorAll('#admin-ticket-list .chat-conv-item').forEach(el => {
      el.classList.toggle('active', el.dataset.ticket === ticketId);
    });

    const placeholder = document.getElementById('admin-ticket-placeholder');
    const detail      = document.getElementById('admin-ticket-detail');
    if (placeholder) placeholder.classList.add('hidden');
    if (detail)      detail.classList.remove('hidden');

    const statusOptions = ['open', 'in_progress', 'resolved', 'closed']
      .map(s => `<option value="${s}" ${ticket.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`)
      .join('');
    const priorityOptions = ['low', 'medium', 'high']
      .map(p => `<option value="${p}" ${ticket.priority === p ? 'selected' : ''}>${p}</option>`)
      .join('');

    const repliesHtml = (ticket.replies || []).map(r => `
      <div class="ticket-reply-item">
        <div class="ticket-reply-sender">${escHtml(r.senderName || r.sender)} <span class="ticket-reply-time">${formatTime(r.createdAt)}</span></div>
        <div class="ticket-reply-msg">${escHtml(r.message)}</div>
      </div>
    `).join('') || '<div class="ticket-no-replies">No replies yet.</div>';

    detail.innerHTML = `
      <div class="ticket-detail-scroll">
        <div class="ticket-detail-header">
          <div class="ticket-detail-id">${escHtml(ticket.ticketId)}</div>
          <div class="ticket-detail-subject">${escHtml(ticket.subject)}</div>
          <div class="ticket-detail-meta">
            <span>👤 ${escHtml(ticket.userName)}</span>
            <span>📧 ${escHtml(ticket.userEmail || '—')}</span>
            <span>🕐 ${new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div class="ticket-detail-desc">
          <div class="ticket-detail-label">Issue Description</div>
          <div class="ticket-detail-desc-text">${escHtml(ticket.description)}</div>
        </div>

        <div class="ticket-detail-controls">
          <div class="ticket-control-group">
            <label class="ticket-control-label">Status</label>
            <select id="admin-ticket-status" class="chat-ticket-select" onchange="ChatModule._updateTicketStatus('${escAttr(ticketId)}')">
              ${statusOptions}
            </select>
          </div>
          <div class="ticket-control-group">
            <label class="ticket-control-label">Priority</label>
            <select id="admin-ticket-priority" class="chat-ticket-select" onchange="ChatModule._updateTicketStatus('${escAttr(ticketId)}')">
              ${priorityOptions}
            </select>
          </div>
          <button class="ticket-view-chat-btn" onclick="ChatModule._adminTab('chats');ChatModule._adminSelectRoom('${escAttr(ticket.chatRoom)}')">
            💬 View Chat
          </button>
        </div>

        <div class="ticket-detail-replies">
          <div class="ticket-detail-label">Admin Replies (${(ticket.replies || []).length})</div>
          ${repliesHtml}
        </div>

        <div class="ticket-reply-form">
          <textarea id="admin-ticket-reply-input" class="chat-ticket-textarea" placeholder="Type a reply to the user…" rows="3"></textarea>
          <button class="chat-ticket-submit-btn" onclick="ChatModule._sendTicketReply('${escAttr(ticketId)}')">
            Send Reply 📨
          </button>
        </div>
      </div>
    `;
  }

  async function updateTicketStatus(ticketId) {
    try {
      const token    = localStorage.getItem('gst_token');
      const status   = document.getElementById('admin-ticket-status')?.value;
      const priority = document.getElementById('admin-ticket-priority')?.value;

      await fetch(API_BASE + `/tickets/${ticketId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ status, priority }),
      });

      // Update local tickets array
      const t = tickets.find(t => t.ticketId === ticketId);
      if (t) { t.status = status; t.priority = priority; }
      renderAdminTicketList(tickets);
    } catch (e) {
      console.warn('Update ticket status error:', e.message);
    }
  }

  async function sendTicketReply(ticketId) {
    const input = document.getElementById('admin-ticket-reply-input');
    const msg   = input?.value.trim();
    if (!msg) return;

    try {
      const token = localStorage.getItem('gst_token');
      const res   = await fetch(API_BASE + `/tickets/${ticketId}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ message: msg }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      // Update local data and re-render detail
      const t = tickets.find(t => t.ticketId === ticketId);
      if (t) { t.replies = json.data.replies; t.status = json.data.status; }
      if (input) input.value = '';
      adminViewTicket(ticketId);
    } catch (e) {
      console.warn('Send reply error:', e.message);
    }
  }

  function updateTicketBadge() {
    const badge = document.getElementById('ticket-tab-badge');
    if (!badge) return;
    if (ticketUnread > 0) {
      badge.textContent = ticketUnread > 99 ? '99+' : String(ticketUnread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     LOAD HISTORY FROM REST API
  ═══════════════════════════════════════════════════════════ */
  async function loadHistory(room, containerId) {
    try {
      const token = localStorage.getItem('gst_token');
      const res   = await fetch(API_BASE + `/chat/${encodeURIComponent(room)}`, {
        headers: { Authorization: 'Bearer ' + token }
      });
      const json = await res.json();
      if (!json.success || !json.data.length) return;

      removeEmpty(containerId);

      let lastDate   = '';
      let lastSender = '';
      json.data.forEach(msg => {
        const d = formatDate(msg.created_at);
        if (d !== lastDate) { appendDateDiv(d, containerId); lastDate = d; }
        const grouped = lastSender === msg.sender;
        lastSender = msg.sender;

        if (msg.type === 'ticket_prompt' && !isAdmin) {
          appendTicketPromptBubble(msg);
        } else {
          appendBubble(msg, containerId, grouped);
        }
      });
      scrollBottom(containerId);
    } catch (e) {
      console.warn('Chat history error:', e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DOM HELPERS
  ═══════════════════════════════════════════════════════════ */
  function appendBubble(msg, containerId, grouped) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let isSent;
    if (isAdmin) {
      isSent = (msg.role === 'admin');
    } else {
      isSent = (msg.role === 'user');
    }

    const wrap = document.createElement('div');
    wrap.className = `chat-msg ${isSent ? 'sent' : 'recv'}${grouped ? ' same-sender' : ''}`;
    wrap.style.maxWidth = '78%';

    const senderLabel = (!isSent && !grouped && msg.senderName)
      ? `<div class="chat-msg-sender">${escHtml(msg.senderName)}</div>`
      : '';

    wrap.innerHTML = `
      ${senderLabel}
      <div class="chat-bubble">
        ${escHtml(msg.message)}
        <div class="chat-bubble-meta">
          <span class="chat-bubble-time">${formatTime(msg.created_at)}</span>
          ${isSent ? '<span class="chat-tick">✓✓</span>' : ''}
        </div>
      </div>
    `;

    container.appendChild(wrap);
  }

  function appendDateDiv(label, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const d = document.createElement('div');
    d.className = 'chat-date-divider';
    d.innerHTML = `<span>${escHtml(label)}</span>`;
    container.appendChild(d);
  }

  function removeEmpty(containerId) {
    document.getElementById(containerId)
      ?.querySelector('.chat-empty-state')
      ?.remove();
  }

  function scrollBottom(containerId) {
    const el = document.getElementById(containerId);
    if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 60);
  }

  function updateFabBadge(count) {
    if (count !== undefined) fabUnread = count;
    const badge = document.getElementById('chat-unread-fab');
    if (!badge) return;
    if (fabUnread > 0) {
      badge.textContent = fabUnread > 99 ? '99+' : String(fabUnread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     UTILITIES
  ═══════════════════════════════════════════════════════════ */
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  function formatDate(iso) {
    if (!iso) return 'Today';
    try {
      const d = new Date(iso);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return 'Today';
      const yest = new Date(); yest.setDate(today.getDate() - 1);
      if (d.toDateString() === yest.toDateString()) return 'Yesterday';
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return 'Today'; }
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════ */
  window.ChatModule = {
    init,
    toggle,
    _adminSelectRoom: adminSelectRoom,
    _adminTab:        adminSwitchTab,
    _filterTickets:   loadAdminTickets,
    _adminViewTicket: adminViewTicket,
    _updateTicketStatus: updateTicketStatus,
    _sendTicketReply: sendTicketReply,
    _openTicketForm:  openTicketForm,
  };

})();
