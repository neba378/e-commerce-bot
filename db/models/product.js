const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller",
    required: true,
  },
  name: { type: String, required: true },
  primaryImageUrl: { type: String, required: true },
  additionalImageUrls: [String],
  generalCategory: { type: String, required: true },
  specificCategory: { type: String, required: true },
  shortDescription: { type: String },
  detailedDescription: { type: String },
  price: { type: Number, required: true },  
  location: { type: String },
  contactInfo: {
    phone: { type: String, required: true },
    telegramUsername: String,
  },
  channelMessageId: Number, // New: Stores message ID in channel
  groupMessageId: Number, // New: Stores message ID in group
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
});

module.exports = mongoose.model("Product", productSchema);
