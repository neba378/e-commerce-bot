require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const listProductsHandler = require("./bot/handler/products/listProducts");
const addProductHandler = require("./bot/handler/products/addProduct");
const userHandler = require("./bot/handler/user");
const { checkSubscription } = require("./middleware/checkSub");
const { helpCommand } = require("./bot/handler/helpHandler");
const Product = require("./db/models/product");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Connect to DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// Register handlers
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const payload = match[1]; // could be undefined
  userHandler.start(bot, msg, payload);
});

bot.on("message", (msg) => {
  console.log("Received message from:", msg);
});

bot.onText(/\/addproduct/, (msg) => {
  checkSubscription(bot, msg, () => {
    addProductHandler.addProduct(bot, msg);
  });
});

// list my products
bot.onText(/\/myproducts/, (msg) => {
  listProductsHandler.listMyProducts(bot, msg);
});

bot.onText(/\/help/, (msg) => {
  helpCommand(bot, msg);
});
