// middleware/checkSubscription.js
require("dotenv").config();

const checkSubscription = async (bot, msg, next) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    // Check if user is subscribed to the channel
    const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, userId);

    // Check if the user's status is 'member', 'administrator', or 'creator'
    const isSubscribed = ["member", "administrator", "creator"].includes(
      chatMember.status
    );

    if (!isSubscribed) {
      bot.sendMessage(
        chatId,
        `❌ You need to subscribe to our channel first!\nPlease join here: t.me/${process.env.CHANNEL_ID.replace(
          "@",
          ""
        )}`
      );
      return;
    }

    // If subscribed, proceed to next handler
    next();
  } catch (error) {
    if (error.response && error.response.body.error_code === 400) {
      bot.sendMessage(
        chatId,
        `❌ You need to subscribe to our channel first!\nPlease join here: t.me/${process.env.CHANNEL_ID.replace(
          "@",
          ""
        )}`
      );
    } else {
      console.error("Error checking subscription:", error);
      bot.sendMessage(chatId, "❌ An error occurred. Please try again later.");
    }
  }
};

module.exports = { checkSubscription };
