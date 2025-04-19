// handlers/helpHandler.js
const helpCommand = (bot, msg) => {
  const chatId = msg.chat.id;

  const helpMessage = `
✨ *E-commerce-App* ✨

📝 *About*: Welcome to E-commerce-App! Your one-stop Telegram bot for buying and selling products easily.

📋 *Description*: 
This bot allows you to:
• Add products with images and details
• Browse available items
• Connect with sellers directly
Stay tuned for more exciting features!

📚 *Commands*:
/start - Start using the bot
/addproduct - List a new product (requires channel subscription)
/help - Show this help message
/myproducts - show your products on sell!

💡 *Tip*: Subscribe to our channel to unlock all features!
Contact @zensof for assistance.
  `;

  bot.sendMessage(chatId, helpMessage, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Join Channel",
            url: `t.me/${process.env.CHANNEL_ID.replace("@", "")}`,
          },
          { text: "Contact Support", url: "https://t.me/zensof" },
        ],
      ],
    },
  });
};

module.exports = { helpCommand };
