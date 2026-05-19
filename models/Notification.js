const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:  { type: String, required: true },
  type:    { type: String, enum: ['cab_ready', 'discount', 'general'], default: 'general' },
  message: { type: String, required: true },
  data:    { type: mongoose.Schema.Types.Mixed, default: {} },
  read:    { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
