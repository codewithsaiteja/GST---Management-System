const mongoose = require('mongoose');

// Auto-incrementing ticket number counter
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.model('Counter', counterSchema);

const ticketMessageSchema = new mongoose.Schema({
  sender:     { type: String, required: true },   // 'user' | 'admin'
  senderName: { type: String, default: '' },
  message:    { type: String, required: true },
  createdAt:  { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  ticketId:    { type: String, unique: true },   // e.g. TKT-2024-0001
  userId:      { type: String, required: true },
  userName:    { type: String, default: '' },
  userEmail:   { type: String, default: '' },
  subject:     { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 4000 },
  status:      { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  priority:    { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  chatRoom:    { type: String, default: '' },     // link back to the user's chat room
  replies:     [ticketMessageSchema],
}, { timestamps: true });

// Generate a unique readable ticket ID before saving
ticketSchema.pre('save', async function () {
  if (this.isNew) {
    try {
      const year = new Date().getFullYear();
      const counter = await Counter.findByIdAndUpdate(
        `ticket_${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.ticketId = `TKT-${year}-${String(counter.seq).padStart(4, '0')}`;
    } catch (e) {
      // fallback
      this.ticketId = `TKT-${Date.now()}`;
    }
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
