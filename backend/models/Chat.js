const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  room:      { type: String, required: true, index: true },
  sender:    { type: String, required: true },
  senderName:{ type: String, default: '' },
  role:      { type: String, enum: ['user', 'admin'], default: 'user' },
  userId:    { type: String, default: '' },
  message:   { type: String, required: true },
  read:      { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

chatSchema.index({ room: 1, created_at: 1 });

module.exports = mongoose.model('Chat', chatSchema);
