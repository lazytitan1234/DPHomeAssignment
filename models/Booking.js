const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId:        { type: String, required: true },
  startLocation: { type: String, required: true },
  endLocation:   { type: String, required: true },
  dateTime:      { type: Date, required: true },
  passengers:    { type: Number, required: true, min: 1, max: 8 },
  cabType:       { type: String, enum: ['Economic', 'Premium', 'Executive'], required: true },
  estimatedFare: { type: Number, default: 0 },
  status:        { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'confirmed' }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
