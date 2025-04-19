const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  phone: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Seller', sellerSchema);