/**
 * Chat System - User ↔ Admin Messaging
 * Clean implementation with REST API + Socket.IO for real-time updates
 */

(function () {
  'use strict';

  // State
  let socket = null;
  let currentUser = null;
  let isAdmin = false;
  let conversations = [];
  let currentConversationId = null;
  let messages = [];
  let typingTimeout = null;
  let isTyping = false;

  // Initialize chat system
  function init(user) {
    if (!user) return;
    
    currentUser = user;
    isAdmin = user.role === 'admin';
    
    buildUI();
    connectSocket();
    
    if (isAdmin) {
      loadConversations();
      startPolling(); // Poll for new conversations every 5 seconds
    } else {
      loadUserConversation();
    }
  }

  // Build UI
  function buildUI() {
    // Remove existing chat UI
    document.getElementById('chat-fab')?.remove();
    document.getElementById('chat-window')?.remove();
    document.getElementById('chat-admin-panel')?.remove();

    if (isAdmin) {
      buildAdminUI();
    } else {
      buildUserUI();
    }
  }

  // Build User Chat UI
  function buildUserUI() {
    document.body.insertAdjacentHTML('beforeend', `
      <button id="chat-fab" class="chat-fab" title="Support Chat">
        <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        </svg>
        <span id="chat-unread-badge" class="chat-badge hidden">0</span>
      </button>

      <div id="chat-window" class="chat-window hidden">
        <div class="chat-header">
          <div class="chat-header-title">
            <strong>Support Chat</strong>
            <span class="chat-status" id="chat-status">Online</span>
          </div>
          <button class="chat-close-btn" id="chat-close-btn">✕</button>
        </div>

        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty">
            <div class="chat-empty-text">Send a message to start chatting with support</div>
          </div>
        </div>

        <div class="chat-typing hidden" id="chat-typing">
          <span class="typing-dots"><span></span><span></span><span></span></span>
          <span>Admin is typing...</span>
        </div>

        <div class="chat-input-bar">
          <input 
            type="text" 
            id="chat-input" 
            placeholder="Type a message..." 
            maxlength="2000"
          />
          <button class="chat-send-btn" id="chat-send-btn">
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `);

    // Event listeners
    document.getElementById('chat-fab').addEventListener('click', toggleChat);
    document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
    document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.getElementById('chat-input').addEventListener('input', handleTyping);
  }

  // Build Admin UI
  function buildAdminUI() {
    document.body.insertAdjacentHTML('beforeend', `
      <button id="chat-fab" class="chat-fab" title="Support Dashboard">
        <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        </svg>
        <span id="chat-unread-badge" class="chat-badge hidden">0</span>
      </button>

      <div id="chat-admin-panel" class="chat-admin-panel hidden">
        <div class="chat-header">
          <div class="chat-header-title">
            <strong>Support Dashboard</strong>
            <span class="chat-status">Admin</span>
          </div>
          <button class="chat-close-btn" id="chat-close-btn">✕</button>
        </div>

        <div class="chat-admin-body">
          <!-- Conversation List -->
          <div class="chat-sidebar">
            <div class="chat-sidebar-header">Conversations</div>
            <div class="chat-conversation-list" id="conversation-list">
              <div class="chat-empty">
                <div class="chat-empty-text">No active conversations</div>
              </div>
            </div>
          </div>

          <!-- Messages Area -->
          <div class="chat-main">
            <div class="chat-placeholder" id="chat-placeholder">
              <div class="chat-placeholder-text">Select a conversation to view messages</div>
            </div>

            <div class="chat-conversation-view hidden" id="conversation-view">
              <div class="chat-messages" id="chat-messages"></div>

              <div class="chat-typing hidden" id="chat-typing">
                <span class="typing-dots"><span></span><span></span><span></span></span>
                <span>User is typing...</span>
              </div>

              <div class="chat-input-bar">
                <input 
                  type="text" 
                  id="chat-input" 
                  placeholder="Reply to user..." 
                  maxlength="2000"
                />
                <button class="chat-send-btn" id="chat-send-btn">
                  <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);

    // Event listeners
    document.getElementById('chat-fab').addEventListener('click', toggleChat);
    document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
    document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.getElementById('chat-input').addEventListener('input', handleTyping);
  }

  // Toggle chat window
  function toggleChat() {
    const window = document.getElementById(isAdmin ? 'chat-admin-panel' : 'chat-window');
    window.classList.toggle('hidden');
    
    if (!window.classList.contains('hidden')) {
      // Reset unread badge when opening
      updateUnreadBadge(0);
      
      // Mark messages as read if viewing a conversation
      if (currentConversationId) {
        markAsRead();
      }
    }
  }

  // Connect Socket.IO
  function connectSocket() {
    const token = localStorage.getItem('gst_token');
    if (!token) return;

    // Guard: socket.io client may not be loaded yet
    if (typeof io === 'undefined') {
      console.warn('Socket.IO not loaded, chat will be unavailable');
      return;
    }

    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    socket.on('connect', () => {
      console.log('✅ Chat connected');
      socket.emit('authenticate', {
        token,
        userName: currentUser.name,
        userEmail: currentUser.email
      });
    });

    socket.on('authenticated', (data) => {
      if (data.ok) {
        console.log('✅ Authenticated as', data.role);
        if (!isAdmin && data.conversationId) {
          currentConversationId = data.conversationId;
          loadMessages();
        }
      }
    });

    socket.on('newMessage', (data) => {
      if (data.conversationId === currentConversationId) {
        messages.push(data);
        renderMessages();
        scrollToBottom();
        
        // Mark as read if chat is open
        const chatWindow = document.getElementById(isAdmin ? 'chat-admin-panel' : 'chat-window');
        if (!chatWindow.classList.contains('hidden')) {
          markAsRead();
        } else {
          // Increment unread badge
          const badge = document.getElementById('chat-unread-badge');
          const current = parseInt(badge.textContent) || 0;
          updateUnreadBadge(current + 1);
        }
      }
      
      // Update conversation list for admin
      if (isAdmin) {
        loadConversations();
      }
    });

    socket.on('conversationUpdate', (data) => {
      if (isAdmin) {
        loadConversations();
      }
    });

    socket.on('typing', (data) => {
      if (data.conversationId === currentConversationId) {
        showTypingIndicator();
      }
    });

    socket.on('stopTyping', (data) => {
      if (data.conversationId === currentConversationId) {
        hideTypingIndicator();
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Chat disconnected');
    });
  }

  // Load conversations (admin only)
  async function loadConversations() {
    try {
      const token = localStorage.getItem('gst_token');
      const res = await fetch('/api/chat/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.success) {
        conversations = data.data;
        renderConversations();
        updateTotalUnread();
      }
    } catch (e) {
      console.error('Load conversations error:', e);
    }
  }

  // Load user conversation
  async function loadUserConversation() {
    try {
      const token = localStorage.getItem('gst_token');
      const res = await fetch('/api/chat/conversation', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.success) {
        currentConversationId = data.data._id;
        loadMessages();
      }
    } catch (e) {
      console.error('Load conversation error:', e);
    }
  }

  // Load messages
  async function loadMessages() {
    if (!currentConversationId) return;
    
    try {
      const token = localStorage.getItem('gst_token');
      const res = await fetch(`/api/chat/messages/${currentConversationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.success) {
        messages = data.data;
        renderMessages();
        scrollToBottom();
      }
    } catch (e) {
      console.error('Load messages error:', e);
    }
  }

  // Send message
  async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    input.value = '';
    stopTyping();
    
    try {
      const token = localStorage.getItem('gst_token');
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text,
          conversationId: currentConversationId
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        if (!currentConversationId) {
          currentConversationId = data.data.conversationId;
        }
        
        // Add message to local state
        messages.push(data.data.message);
        renderMessages();
        scrollToBottom();
        
        // Reload conversations for admin
        if (isAdmin) {
          loadConversations();
        }
      } else {
        alert('Failed to send message: ' + data.message);
      }
    } catch (e) {
      console.error('Send message error:', e);
      alert('Failed to send message. Please try again.');
    }
  }

  // Render conversations (admin)
  function renderConversations() {
    const list = document.getElementById('conversation-list');
    if (!list) return;
    
    if (conversations.length === 0) {
      list.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-text">No active conversations</div>
        </div>
      `;
      return;
    }
    
    list.innerHTML = conversations.map(conv => `
      <div 
        class="chat-conversation-item ${conv._id === currentConversationId ? 'active' : ''}" 
        onclick="ChatModule.selectConversation('${conv._id}')"
      >
        <div class="chat-conv-avatar">${conv.userName.charAt(0).toUpperCase()}</div>
        <div class="chat-conv-info">
          <div class="chat-conv-name">${escapeHtml(conv.userName)}</div>
          <div class="chat-conv-preview">${escapeHtml(conv.lastMessage || 'No messages yet')}</div>
        </div>
        <div class="chat-conv-meta">
          <div class="chat-conv-time">${formatTime(conv.lastMessageTime)}</div>
          ${conv.unreadCount > 0 ? `<div class="chat-conv-unread">${conv.unreadCount}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Select conversation (admin)
  function selectConversation(conversationId) {
    currentConversationId = conversationId;
    
    // Join socket room
    if (socket) {
      socket.emit('joinConversation', conversationId);
    }
    
    // Show conversation view
    document.getElementById('chat-placeholder').classList.add('hidden');
    document.getElementById('conversation-view').classList.remove('hidden');
    
    // Load messages
    loadMessages();
    
    // Update UI
    renderConversations();
  }

  // Render messages
  function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    if (messages.length === 0) {
      container.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-text">No messages yet. Start the conversation!</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = messages.map(msg => {
      const isMine = msg.senderId === currentUser.id || msg.senderId === currentUser._id;
      const isAdminMsg = msg.senderRole === 'admin';
      
      return `
        <div class="chat-message ${isMine ? 'sent' : 'received'}">
          <div class="chat-message-bubble">
            <div class="chat-message-sender">${isAdminMsg ? 'Admin' : msg.senderName}</div>
            <div class="chat-message-text">${escapeHtml(msg.text)}</div>
            <div class="chat-message-time">${formatTime(msg.createdAt)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Handle typing
  function handleTyping() {
    if (!socket || !currentConversationId) return;
    
    if (!isTyping) {
      isTyping = true;
      socket.emit('typing', { conversationId: currentConversationId });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2000);
  }

  // Stop typing
  function stopTyping() {
    if (!isTyping || !socket || !currentConversationId) return;
    
    isTyping = false;
    socket.emit('stopTyping', { conversationId: currentConversationId });
  }

  // Show/hide typing indicator
  function showTypingIndicator() {
    const indicator = document.getElementById('chat-typing');
    if (indicator) indicator.classList.remove('hidden');
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('chat-typing');
    if (indicator) indicator.classList.add('hidden');
  }

  // Mark messages as read
  function markAsRead() {
    // Messages are marked as read on the server when fetched
    // Just update local unread count
    if (isAdmin) {
      const conv = conversations.find(c => c._id === currentConversationId);
      if (conv) {
        conv.unreadCount = 0;
        renderConversations();
        updateTotalUnread();
      }
    }
  }

  // Update unread badge
  function updateUnreadBadge(count) {
    const badge = document.getElementById('chat-unread-badge');
    if (!badge) return;
    
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Update total unread (admin)
  function updateTotalUnread() {
    if (!isAdmin) return;
    
    const total = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
    updateUnreadBadge(total);
  }

  // Scroll to bottom
  function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }

  // Start polling for new conversations (admin)
  function startPolling() {
    if (!isAdmin) return;
    
    setInterval(() => {
      loadConversations();
    }, 5000); // Poll every 5 seconds
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) return 'Just now';
    
    // Less than 1 hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    
    // Today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    // This week
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }
    
    // Older
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Public API
  window.ChatModule = {
    init,
    selectConversation,
    open: function() {
      const window = document.getElementById(isAdmin ? 'chat-admin-panel' : 'chat-window');
      if (window && window.classList.contains('hidden')) {
        toggleChat();
      }
    },
    close: function() {
      const window = document.getElementById(isAdmin ? 'chat-admin-panel' : 'chat-window');
      if (window && !window.classList.contains('hidden')) {
        toggleChat();
      }
    }
  };

})();
