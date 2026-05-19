const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId:               { type: String, required: true },
  bookingId:            { type: String, required: true, unique: true },
  cabFare:              { type: Number, required: true },
  cabMultiplier:        { type: Number, required: true },
  daytimeMultiplier:    { type: Number, required: true },
  passengersMultiplier: { type: Number, required: true },
  discountMultiplier:   { type: Number, default: 1 },
  totalPrice:           { type: Number, required: true },
  status:               { type: String, enum: ['pending', 'paid', 'failed'], default: 'paid' }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
