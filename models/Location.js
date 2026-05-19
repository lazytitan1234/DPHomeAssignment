const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  userId:  { type: String, required: true },
  name:    { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Location', locationSchema);
