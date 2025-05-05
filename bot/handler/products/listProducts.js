const Product = require("../../../db/models/product");
const Seller = require("../../../db/models/seller");
const { sanitizeMarkdownV2 } = require("./addProduct");
const { deleteProduct } = require("./deleteProduct");
const { updateProduct } = require("./updateProduct");

const sessions = {};

const listMyProducts = async (bot, msg) => {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    // Step 1: Delete previous messages if they exist
    if (sessions[tgId]?.productMessages?.length) {
      for (const messageId of sessions[tgId].productMessages) {
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (err) {
          console.warn(`Could not delete message ${messageId}:`, err.message);
        }
      }
    }

    // Step 2: Clear previous messages array
    sessions[tgId] = { ...sessions[tgId], productMessages: [] };

    const seller = await Seller.findOne({ telegramId: tgId });
    const products = await Product.find({
      sellerId: seller._id,
      isActive: true,
    });

    if (!products || products.length === 0) {
      bot.sendMessage(chatId, "ℹ️ You have no active products.");
      return;
    }

    for (const product of products) {
      const caption = `🛍 *${sanitizeMarkdownV2(
        product.name
      )}*\n💰 ${sanitizeMarkdownV2(product.price)}\n📍 ${sanitizeMarkdownV2(
        product.generalCategory
      )} > ${sanitizeMarkdownV2(
        product.specificCategory
      )}\n📝 ${sanitizeMarkdownV2(product.shortDescription)}`;

      const inlineKeyboard = [
        [
          { text: "Update", callback_data: `update_${product._id}` },
          { text: "Delete", callback_data: `delete_${product._id}` },
        ],
      ];

      const sentMessage = await bot.sendPhoto(chatId, product.primaryImageUrl, {
        caption,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: inlineKeyboard },
      });

      // Step 3: Store the new message ID
      sessions[tgId].productMessages.push(sentMessage.message_id);
    }

    bot.once("callback_query", async (query) => {
      const [action, productId] = query.data.split("_");
      bot.answerCallbackQuery(query.id);

      if (action === "update") {
        await updateProduct(bot, msg, productId);
      } else if (action === "delete") {
        await deleteProduct(bot, msg, productId);
      }
    });
  } catch (error) {
    console.error("❌ Error listing products:", error.message);
    bot.sendMessage(chatId, "❌ Failed to list products. Please try again.");
  }
};

module.exports = { listMyProducts };
