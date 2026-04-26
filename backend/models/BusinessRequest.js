const mongoose = require('mongoose');

const businessRequestSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  user_email: { type: String, required: true },
  business_name: { type: String, required: true },
  gstin: { type: String, default: '' },
  message: { type: String, default: '' },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  admin_notes: { type: String, default: '' },
  processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processed_at: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Index for faster queries
businessRequestSchema.index({ user_id: 1, status: 1 });
businessRequestSchema.index({ status: 1, created_at: -1 });

// Update timestamp on save
businessRequestSchema.pre('save', function() {
  this.updated_at = new Date();
});

module.exports = mongoose.model('BusinessRequest', businessRequestSchema);
