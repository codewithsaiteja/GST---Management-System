const express = require('express');
const router = express.Router();
const { auth, requireNotMuted, requireAdmin } = require('../middleware/auth');
const { User, Conversation, Message, ChatAuditLog } = require('../utils/db');
const { generateGstResponse, isGroqAvailable, getGroqStatus } = require('../utils/ai');
const { logChatAction, getClientIP } = require('../utils/chatAudit');
const mongoose = require('mongoose');

// GET /api/chat/ai-status - Check AI system status
router.get('/ai-status', auth, async (req, res) => {
  try {
    const status = getGroqStatus();
    res.json({ 
      success: true, 
      data: {
        ...status,
        fallbackEnabled: true,
        message: status.available ? 'AI chat is fully operational' : 'AI chat is using fallback responses'
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/chat/ai-test - Test AI response
router.post('/ai-test', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Test message is required' });
    }

    const response = await generateGstResponse(message, []);
    res.json({ 
      success: true, 
      data: {
        userMessage: message,
        aiResponse: response.message,
        resolved: response.resolved,
        usingAI: isGroqAvailable()
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/chat/send - Send a message
router.post('/send', auth, requireNotMuted, async (req, res) => {
  try {
    const { text, conversationId } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const userId = String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';

    let conversation;

    if (conversationId) {
      // Existing conversation
      conversation = await Conversation.findOne({ _id: conversationId, isDeleted: false });
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }
      
      // Security check
      if (!isAdmin && conversation.userId !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      // Create new conversation (user only)
      if (isAdmin) {
        return res.status(400).json({ success: false, message: 'Admin must specify conversationId' });
      }

      conversation = await Conversation.findOne({ userId, isDeleted: false });
      
      if (!conversation) {
        conversation = await Conversation.create({
          userId,
          userName: req.user.name || req.user.email || 'User',
          userEmail: req.user.email || '',
          lastMessage: text.substring(0, 100),
          lastMessageTime: new Date(),
          unreadCount: 0
        });
      }
    }

    // Create message
    const message = await Message.create({
      conversationId: conversation._id,
      senderId: userId,
      senderName: req.user.name || req.user.email || 'User',
      senderRole: isAdmin ? 'admin' : 'user',
      text: text.trim().substring(0, 2000),
      read: false
    });

    // Log the message send action
    await logChatAction({
      action: 'sent',
      messageId: message._id,
      conversationId: conversation._id,
      senderId: userId,
      senderName: req.user.name || req.user.email || 'User',
      senderRole: isAdmin ? 'admin' : 'user',
      messageText: text.trim().substring(0, 100),
      performedBy: userId,
      performedByRole: isAdmin ? 'admin' : 'user',
      ipAddress: getClientIP(req),
      userAgent: req.get('User-Agent')
    });

    // Update conversation
    conversation.lastMessage = text.substring(0, 100);
    conversation.lastMessageTime = new Date();
    
    if (!isAdmin) {
      // User sent message, increment unread for admin
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    } else {
      // Admin replied, reset unread
      conversation.unreadCount = 0;
      conversation.adminId = userId;
    }
    
    await conversation.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const room = `conversation_${conversation._id}`;
      io.to(room).emit('newMessage', {
        _id: message._id,
        conversationId: conversation._id,
        senderId: message.senderId,
        senderName: message.senderName,
        senderRole: message.senderRole,
        text: message.text,
        createdAt: message.createdAt,
        isDeleted: false
      });

      // Notify admin of new user message
      if (!isAdmin) {
        io.to('admin_watch').emit('conversationUpdate', {
          _id: conversation._id,
          userId: conversation.userId,
          userName: conversation.userName,
          lastMessage: conversation.lastMessage,
          lastMessageTime: conversation.lastMessageTime,
          unreadCount: conversation.unreadCount
        });
      }
    }

    res.json({ 
      success: true, 
      data: {
        message,
        conversationId: conversation._id
      }
    });
  } catch (e) {
    console.error('Send message error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/chat/conversations - Get all conversations (admin) or user's conversation
router.get('/conversations', auth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';

    let conversations;

    if (isAdmin) {
      // Admin sees all non-deleted conversations
      conversations = await Conversation.find({ status: 'active', isDeleted: false })
        .sort({ lastMessageTime: -1 })
        .limit(100)
        .lean();
    } else {
      // User sees only their non-deleted conversation
      conversations = await Conversation.find({ userId, isDeleted: false })
        .sort({ lastMessageTime: -1 })
        .limit(1)
        .lean();
    }

    res.json({ success: true, data: conversations });
  } catch (e) {
    console.error('Get conversations error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/chat/messages/:conversationId - Get messages for a conversation
router.get('/messages/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';

    const conversation = await Conversation.findOne({ _id: conversationId, isDeleted: false });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Security check
    if (!isAdmin && conversation.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = await Message.find({ conversationId, isDeleted: false })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    // Add ownership info for delete permissions
    const messagesWithPermissions = messages.map(msg => ({
      ...msg,
      canDelete: isAdmin || msg.senderId === userId
    }));

    // Mark messages as read if admin is viewing
    if (isAdmin && conversation.unreadCount > 0) {
      await Message.updateMany(
        { conversationId, senderRole: 'user', read: false },
        { read: true }
      );
      conversation.unreadCount = 0;
      await conversation.save();
    }

    res.json({ success: true, data: messagesWithPermissions });
  } catch (e) {
    console.error('Get messages error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/chat/conversation - Get or create user's conversation
router.get('/conversation', auth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    
    if (req.user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin should use /conversations' });
    }

    let conversation = await Conversation.findOne({ userId, isDeleted: false });

    if (!conversation) {
      conversation = await Conversation.create({
        userId,
        userName: req.user.name || req.user.email || 'User',
        userEmail: req.user.email || '',
        lastMessage: '',
        lastMessageTime: new Date(),
        unreadCount: 0
      });
    }

    res.json({ success: true, data: conversation });
  } catch (e) {
    console.error('Get conversation error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/chat/message/:id - Delete a message (Admin or message owner)
router.delete('/message/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }

    const message = await Message.findOne({ _id: id, isDeleted: false });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Permission check: Admin can delete any message, users can only delete their own
    if (!isAdmin && message.senderId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
    }

    // Soft delete the message
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId;
    message.deletedByRole = req.user.role;
    await message.save();

    // Log the deletion
    await logChatAction({
      action: 'deleted',
      messageId: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderRole: message.senderRole,
      messageText: message.text,
      performedBy: userId,
      performedByRole: req.user.role,
      ipAddress: getClientIP(req),
      userAgent: req.get('User-Agent')
    });

    // Emit socket event to remove message from all clients
    const io = req.app.get('io');
    if (io) {
      const room = `conversation_${message.conversationId}`;
      io.to(room).emit('messageDeleted', {
        messageId: message._id,
        conversationId: message.conversationId,
        deletedBy: userId,
        deletedByRole: req.user.role
      });
    }

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (e) {
    console.error('Delete message error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/chat/conversation/:id - Delete a conversation (Admin or conversation owner)
router.delete('/conversation/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findOne({ _id: id, isDeleted: false });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Permission check: Admin can delete any conversation, users can only delete their own
    if (!isAdmin && conversation.userId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own conversations' });
    }

    // Soft delete the conversation and all its messages
    conversation.isDeleted = true;
    conversation.deletedAt = new Date();
    conversation.deletedBy = userId;
    conversation.deletedByRole = req.user.role;
    await conversation.save();

    // Soft delete all messages in the conversation
    await Message.updateMany(
      { conversationId: id, isDeleted: false },
      { 
        isDeleted: true, 
        deletedAt: new Date(), 
        deletedBy: userId, 
        deletedByRole: req.user.role 
      }
    );

    // Log the conversation deletion
    await logChatAction({
      action: 'conversation_deleted',
      conversationId: conversation._id,
      senderId: conversation.userId,
      senderName: conversation.userName,
      senderRole: 'user',
      performedBy: userId,
      performedByRole: req.user.role,
      ipAddress: getClientIP(req),
      userAgent: req.get('User-Agent'),
      metadata: { conversationId: id }
    });

    // Emit socket event to notify clients
    const io = req.app.get('io');
    if (io) {
      const room = `conversation_${id}`;
      io.to(room).emit('conversationDeleted', {
        conversationId: id,
        deletedBy: userId,
        deletedByRole: req.user.role
      });
    }

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (e) {
    console.error('Delete conversation error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/chat/user/:id/block - Block/unblock a user (Admin only)
router.put('/user/:id/block', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked, reason } = req.body;
    const adminId = String(req.user._id || req.user.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot block admin users' });
    }

    // Update user block status
    user.isBlocked = Boolean(isBlocked);
    if (isBlocked) {
      user.blockedAt = new Date();
      user.blockedBy = adminId;
      user.blockReason = reason || 'No reason provided';
    } else {
      user.blockedAt = null;
      user.blockedBy = null;
      user.blockReason = null;
    }
    await user.save();

    // Log the action
    await logChatAction({
      action: 'user_blocked',
      senderId: id,
      senderName: user.name,
      senderRole: user.role,
      performedBy: adminId,
      performedByRole: 'admin',
      ipAddress: getClientIP(req),
      userAgent: req.get('User-Agent'),
      metadata: { 
        isBlocked: Boolean(isBlocked), 
        reason: reason || 'No reason provided' 
      }
    });

    // Emit socket event to disconnect blocked user
    const io = req.app.get('io');
    if (io && isBlocked) {
      io.emit('userBlocked', { userId: id });
    }

    res.json({ 
      success: true, 
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      data: {
        userId: id,
        isBlocked: Boolean(isBlocked),
        blockedAt: user.blockedAt,
        blockReason: user.blockReason
      }
    });
  } catch (e) {
    console.error('Block user error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/chat/user/:id/mute - Mute/unmute a user (Admin only)
router.put('/user/:id/mute', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isMuted, reason } = req.body;
    const adminId = String(req.user._id || req.user.id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot mute admin users' });
    }

    // Update user mute status
    user.isMuted = Boolean(isMuted);
    await user.save();

    // Log the action
    await logChatAction({
      action: 'user_muted',
      senderId: id,
      senderName: user.name,
      senderRole: user.role,
      performedBy: adminId,
      performedByRole: 'admin',
      ipAddress: getClientIP(req),
      userAgent: req.get('User-Agent'),
      metadata: { 
        isMuted: Boolean(isMuted), 
        reason: reason || 'No reason provided' 
      }
    });

    res.json({ 
      success: true, 
      message: `User ${isMuted ? 'muted' : 'unmuted'} successfully`,
      data: {
        userId: id,
        isMuted: Boolean(isMuted)
      }
    });
  } catch (e) {
    console.error('Mute user error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/chat/logs - Get chat audit logs (Admin only)
router.get('/logs', auth, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      action, 
      userId, 
      startDate, 
      endDate,
      search 
    } = req.query;

    const filter = {};
    
    if (action) filter.action = action;
    if (userId) filter.senderId = userId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { senderName: { $regex: search, $options: 'i' } },
        { messageText: { $regex: search, $options: 'i' } },
        { performedBy: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await ChatAuditLog.countDocuments(filter);
    const logs = await ChatAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({ 
      success: true, 
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e) {
    console.error('Get chat logs error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/chat/search - Search messages (Admin only)
router.get('/search', auth, requireAdmin, async (req, res) => {
  try {
    const { 
      q, 
      userId, 
      conversationId,
      startDate, 
      endDate,
      page = 1, 
      limit = 20 
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
    }

    const filter = { 
      isDeleted: false,
      text: { $regex: q.trim(), $options: 'i' }
    };
    
    if (userId) filter.senderId = userId;
    if (conversationId) filter.conversationId = conversationId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await Message.countDocuments(filter);
    const messages = await Message.find(filter)
      .populate('conversationId', 'userName userEmail')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({ 
      success: true, 
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e) {
    console.error('Search messages error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
