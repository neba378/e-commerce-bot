require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const listProductsHandler = require("./bot/handler/products/listProducts");
const addProductHandler = require("./bot/handler/products/addProduct");
const userHandler = require("./bot/handler/user");
const { checkSubscription } = require("./middleware/checkSub");
const { helpCommand } = require("./bot/handler/helpHandler");
const Product = require("./db/models/product");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const bot = new TelegramBot(process.env.BOT_TOKEN);

// Webhook endpoint
const WEBHOOK_PATH = "/webhook";
const WEBHOOK_URL = `${process.env.WEBHOOK_BASE_URL}${WEBHOOK_PATH}`;

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// Set webhook
bot
  .setWebHook(WEBHOOK_URL)
  .then(() => {
    console.log(`✅ Webhook set to ${WEBHOOK_URL}`);
  })
  .catch((err) => {
    console.error("❌ Error setting webhook:", err);
  });

// Handle webhook POST requests
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body); // Process Telegram updates
  res.sendStatus(200); // Respond to Telegram
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Telegram bot is running");
});

// Command handlers
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const payload = match[1]; // could be undefined
  userHandler.start(bot, msg, payload);
});

bot.onText(/\/addproduct/, (msg) => {
  checkSubscription(bot, msg, () => {
    addProductHandler.addProduct(bot, msg);
  });
});

bot.onText(/\/myproducts/, (msg) => {
  listProductsHandler.listMyProducts(bot, msg);
});

bot.onText(/\/help/, (msg) => {
  helpCommand(bot, msg);
});

// Log incoming messages (optional)
bot.on("message", (msg) => {
  console.log("Received message from:", msg);
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
