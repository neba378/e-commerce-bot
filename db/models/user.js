const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  preferences: {
    generalCategories: [String],   // For retargeting
    specificCategories: [String],
  },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
