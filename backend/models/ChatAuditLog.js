const mongoose = require('mongoose');

const chatAuditLogSchema = new mongoose.Schema({
  messageId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message',
    index: true 
  },
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation',
    index: true 
  },
  senderId: { 
    type: String, 
    required: true 
  },
  senderName: { 
    type: String, 
    default: '' 
  },
  senderRole: { 
    type: String, 
    enum: ['user', 'admin'], 
    required: true 
  },
  action: { 
    type: String, 
    enum: ['sent', 'deleted', 'edited', 'conversation_deleted', 'user_blocked', 'user_muted'], 
    required: true 
  },
  messageText: String,
  performedBy: String,
  performedByRole: String,
  ipAddress: String,
  userAgent: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { 
  timestamps: true 
});

chatAuditLogSchema.index({ action: 1, createdAt: -1 });
chatAuditLogSchema.index({ senderId: 1, createdAt: -1 });
chatAuditLogSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model('ChatAuditLog', chatAuditLogSchema);