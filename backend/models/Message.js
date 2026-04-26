const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation',
    required: true,
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
  text: { 
    type: String, 
    required: true,
    maxlength: 2000 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  type: {
    type: String,
    enum: ['text', 'ticket_prompt'],
    default: 'text'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: String,
  deletedByRole: String
}, { 
  timestamps: true 
});

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Message', messageSchema);
