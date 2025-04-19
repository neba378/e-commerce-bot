require("dotenv").config();
const Product = require("../../../db/models/product");
const Seller = require("../../../db/models/seller");

const deleteProduct = async (bot, msg, productId) => {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    const seller = await Seller.findOne({ telegramId: tgId });
    const product = await Product.findOne({
      _id: productId,
      sellerId: seller._id,
    });
    if (!product) {
      bot.sendMessage(chatId, "❌ Product not found or you don’t own it.");
      return;
    }

    await Product.updateOne({ _id: productId }, { isActive: false });

    const soldOutCaption = `🛍 *${product.name}* (Sold Out)\n💰 ${product.price}\n📍 ${product.generalCategory} > ${product.specificCategory}\n📝 ${product.shortDescription}\n⚠️ This product is no longer available.`;

    await bot.editMessageMedia(
      {
        type: "photo",
        media: product.primaryImageUrl,
        caption: soldOutCaption,
        // parse_mode: "Markdown",
      },
      {
        chat_id: process.env.CHANNEL_ID,
        message_id: product.channelMessageId,
        reply_markup: { inline_keyboard: [] }, // Remove inline button
      }
    );

    await bot.editMessageMedia(
      {
        type: "photo",
        media: product.primaryImageUrl,
        caption: soldOutCaption,
        parse_mode: "Markdown",
      },
      {
        chat_id: process.env.GROUP_ID,
        message_id: product.groupMessageId,
        reply_markup: { inline_keyboard: [] },
      }
    );

    bot.sendMessage(chatId, "✅ Product marked as Sold Out.");
  } catch (error) {
    console.error("❌ Error deleting product:", error.message);
    bot.sendMessage(chatId, "❌ Failed to delete product. Please try again.");
  }
};

module.exports = { deleteProduct };
