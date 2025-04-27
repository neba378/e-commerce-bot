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

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const app = express();
const cors = require("cors");

// Enable CORS
app.use(cors());

app.get("/", (req, res) => {
  res.send("Telegram bot is running");
});

app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findById(id);
    if (!product || !product.isActive) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Fake server running on port ${PORT}`);
});
