const User = require("../../db/models/user");
const Product = require("../../db/models/product");
const axios = require("axios");
const { sanitizeMarkdownV2 } = require("../../utils/helper");
// Function to sanitize MarkdownV2 input
const start = async (bot, msg, payload) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    let user = await User.findOne({ telegramId: userId });
    if (!user) {
      user = new User({
        telegramId: msg.from.id,
        username: msg.from.username,
        firstName: msg.from.first_name,
      });
      await user.save();
      console.log("✅ New user saved to database");
    }

    if (payload) {
      const productId = payload.trim();
      const product = await Product.findById(productId).populate("sellerId");
      if (!product) {
        await bot.sendMessage(chatId, "❌ Product not found!");
        return;
      }

      if (!user.preferences) {
        user.preferences = {
          generalCategories: [],
          specificCategories: [],
        };
      }

      if (
        !user.preferences.generalCategories.includes(product.generalCategory)
      ) {
        user.preferences.generalCategories.push(product.generalCategory);
      }

      if (
        !user.preferences.specificCategories.includes(product.specificCategory)
      ) {
        user.preferences.specificCategories.push(product.specificCategory);
      }

      await user.save();

      const caption =
        `🛒 \\#${sanitizeMarkdownV2(
          product.generalCategory.split(" ")[1]
        )} \\>\\> ${sanitizeMarkdownV2(product.specificCategory)}\n` +
        `*${sanitizeMarkdownV2(product.name)}*\n\n` +
        `📝_${sanitizeMarkdownV2(`Description:`)}_\n_${sanitizeMarkdownV2(
          product.shortDescription
        )}_\n\n` +
        `\\.  \\.  \\.  \\.  \\.  \\.  \\.  \\.  \\.\n` +
        `📍 Location: *${sanitizeMarkdownV2(product.location)}*\n` +
        `💰 Price: *${sanitizeMarkdownV2(String(product.price))}*`;

      // Compile all images into a media group
      const allImageUrls = [
        product.primaryImageUrl,
        ...product.additionalImageUrls,
      ];
      const media = allImageUrls.map((imageUrl, index) => ({
        type: "photo",
        media: imageUrl,
        caption: index === 0 ? caption : undefined,
        parse_mode: "MarkdownV2",
      }));

      // Send images together
      if (media.length > 0) {
        await bot.sendMediaGroup(chatId, media);
      } else {
        await bot.sendMessage(
          chatId,
          `📷 No images available for *${sanitizeMarkdownV2(product.name)}*\\.`,
          { parse_mode: "MarkdownV2" }
        );
      }

      // Send seller info
      const sellerInfo =
        `📞 *Seller Contact for product _${sanitizeMarkdownV2(
          product.name
        )}_:*\n\n` +
        `Name: *${sanitizeMarkdownV2(product.sellerId.firstName)}*\n` +
        `Username: *\\@${sanitizeMarkdownV2(
          product.sellerId.username || "N/A"
        )}*\n` +
        `Phone: *${sanitizeMarkdownV2(product.contactInfo.phone)}*`;
      await bot.sendMessage(userId, sellerInfo, { parse_mode: "MarkdownV2" });
    } else {
      await bot.sendMessage(
        chatId,
        `👋 Welcome${
          user.firstName ? `, ${sanitizeMarkdownV2(user.firstName)}` : ""
        }\\!\nUse /addproduct to post a new product\\.`,
        { parse_mode: "MarkdownV2" }
      );
    }
  } catch (error) {
    console.error("❌ Error in /start handler:", error);
    await bot.sendMessage(chatId, "An error occurred. Please try again later.");
  }
};

module.exports = { start };
