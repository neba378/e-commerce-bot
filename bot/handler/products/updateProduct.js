require("dotenv").config();
const axios = require("axios");
const Product = require("../../../db/models/product");
const Seller = require("../../../db/models/seller");
const categories = require("../../../data/categories.json");
const { sanitizeMarkdownV2 } = require("./addProduct");

const getCategories = () => Object.keys(categories);
const getSubCategories = (category) => categories[category] || [];

const sessions = {};

const updateProduct = async (bot, msg, productId) => {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;

  const sendMessageWithKeyboard = (
    message,
    keyboard = [],
    includeBack = false
  ) => {
    const cancelRow = [{ text: "Cancel" }];
    const backRow = includeBack ? [{ text: "Back" }] : [];
    const finalKeyboard = [
      ...(Array.isArray(keyboard) && keyboard.length > 0 ? keyboard : []),
      ...(backRow.length > 0 ? [backRow] : []),
      cancelRow,
    ].filter((row) => Array.isArray(row) && row.length > 0);
    return bot.sendMessage(chatId, message, {
      reply_markup: {
        keyboard: finalKeyboard,
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  };

  // Validation functions
  const validatePrice = (priceText) => {
    // This regex matches a number with optional decimal point, but no other characters
    const isValidFormat = /^[0-9]+(\.[0-9]+)?$/.test(priceText);
    if (!isValidFormat) return false;

    const price = parseFloat(priceText);
    return price > 0;
  };

  const validateDescription = (desc) => {
    const words = desc.trim().split(/\s+/);
    return words.length <= 50 && desc.length > 0;
  };

  const validateText = (text) => text && text.trim().length > 0;

  // Check for cancel command or button
  const checkCancel = (msgText, callback) => {
    if (
      msgText &&
      (msgText.toLowerCase() === "/cancel" || msgText === "Cancel")
    ) {
      delete sessions[tgId];
      // resetSession();
      return true;
    }
    callback();
    return false;
  };

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

    // Initialize session for editing
    sessions[tgId] = {
      productId,
      primaryImageUrl: product.primaryImageUrl,
      additionalImageUrls: product.additionalImageUrls || [],
      generalCategory: product.generalCategory,
      specificCategory: product.specificCategory,
      name: product.name,
      location: product.location,
      price: product.price,
      shortDescription: product.shortDescription,
      contactInfo: product.contactInfo,
      sellerId: product.sellerId,
      step: "editMenu",
      history: [],
      fromEdit: false,
    };

    const steps = {
      editMenu: () => {
        const editKeyboard = [
          [
            { text: "Edit Primary Image", callback_data: "edit_primaryImage" },
            {
              text: "Edit Additional Images",
              callback_data: "edit_additionalImages",
            },
          ],
          [
            { text: "Edit Category", callback_data: "edit_category" },
            { text: "Edit Sub-Category", callback_data: "edit_subCategory" },
          ],
          [
            { text: "Edit Name", callback_data: "edit_name" },
            { text: "Edit Location", callback_data: "edit_location" },
          ],
          [
            { text: "Edit Price", callback_data: "edit_price" },
            { text: "Edit Description", callback_data: "edit_description" },
          ],
          [
            { text: "Edit Phone", callback_data: "edit_phone" },
            { text: "Save Changes", callback_data: "save_product" },
          ],
          [{ text: "Cancel", callback_data: "cancel_edit" }],
        ];
        bot.sendMessage(chatId, "Select a field to edit:", {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: editKeyboard },
        });

        bot.once("callback_query", async (query) => {
          const action = query.data;
          bot.answerCallbackQuery(query.id);

          if (action === "save_product") {
            try {
              await Product.updateOne(
                { _id: productId },
                {
                  ...sessions[tgId],
                  channelMessageId: product.channelMessageId,
                  groupMessageId: product.groupMessageId,
                }
              );

              const postCaption =
                `🛒 \\#${sanitizeMarkdownV2(
                  product.generalCategory.split(" ")[1]
                )} \\>\\> ${sanitizeMarkdownV2(product.specificCategory)}\n` +
                `*${sanitizeMarkdownV2(product.name)}*\n\n` +
                `📝${sanitizeMarkdownV2(
                  `_Description:_\n`
                )}_${sanitizeMarkdownV2(
                  limitWords(product.shortDescription)
                )}_\n` +
                `\\.  \\.  \\.  \\.  \\.  \\.  \\.  \\.  \\.\n\n` +
                `📍 Location: *${sanitizeMarkdownV2(product.location)}*\n` +
                `💰 Price: *${sanitizeMarkdownV2(String(product.price))}*`;
              const opts = {
                parse_mode: "MarkdownV2",
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "SHOP/view",
                        url: `https://t.me/${
                          process.env.BOT_USERNAME
                        }?start=${product._id.toString()}`,
                      },
                    ],
                  ],
                },
              };

              await bot.editMessageMedia(
                {
                  type: "photo",
                  media: sessions[tgId].primaryImageUrl,
                  caption,
                  parse_mode: "Markdown",
                },
                {
                  chat_id: process.env.CHANNEL_ID,
                  message_id: product.channelMessageId,
                  ...opts,
                }
              );

              await bot.editMessageMedia(
                {
                  type: "photo",
                  media: sessions[tgId].primaryImageUrl,
                  caption,
                  parse_mode: "Markdown",
                },
                {
                  chat_id: process.env.GROUP_ID,
                  message_id: product.groupMessageId,
                  ...opts,
                }
              );

              bot.sendMessage(chatId, "✅ Product updated successfully!");
              delete sessions[tgId];
            } catch (error) {
              console.error("❌ Error updating product:", error.message);
              bot.sendMessage(
                chatId,
                "❌ Failed to update product. Please try again."
              );
              steps.editMenu();
            }
          } else if (action === "cancel_edit") {
            delete sessions[tgId];
            bot.sendMessage(chatId, "❌ Product update canceled.");
          } else {
            const step = action.replace("edit_", "");
            sessions[tgId].step = step;
            sessions[tgId].history.push("editMenu");
            sessions[tgId].fromEdit = true;
            steps[step]();
          }
        });
      },

      // Reuse existing step handlers from addProduct
      primaryImage: () => {
        sendMessageWithKeyboard("📸 Please upload the new primary image");
        bot.once("message", async (photoMsg) => {
          if (checkCancel(photoMsg.text, () => {})) return;
          if (photoMsg.text && photoMsg.text.toLowerCase() === "back") {
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          try {
            let fileId;
            if (photoMsg.photo) {
              fileId = photoMsg.photo.pop().file_id;
            } else if (
              photoMsg.document &&
              photoMsg.document.mime_type.startsWith("image/")
            ) {
              const file = await bot.getFile(photoMsg.document.file_id);
              const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
              const response = await axios.get(fileUrl, {
                responseType: "arraybuffer",
              });
              const photoMessage = await bot.sendPhoto(
                process.env.TEMP_CHANNEL_ID,
                Buffer.from(response.data)
              );
              fileId = photoMessage.photo?.pop()?.file_id;
            } else {
              bot.sendMessage(
                chatId,
                "❌ Please upload a photo or an image file:"
              );
              steps.primaryImage();
              return;
            }
            sessions[tgId].primaryImageUrl = fileId;
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          } catch (error) {
            bot.sendMessage(
              chatId,
              `❌ Failed to process image: ${error.message}. Try again:`
            );
            steps.primaryImage();
          }
        });
      },

      additionalImages: () => {
        sendMessageWithKeyboard(
          "📸 Send up to 3 new additional images, \nType 'done' when finished.",
          [],
          true
        );
        const collectImage = () => {
          bot.once("message", async (imgMsg) => {
            if (checkCancel(imgMsg.text, () => {})) return;
            if (imgMsg.text && imgMsg.text.toLowerCase() === "back") {
              sessions[tgId].additionalImageUrls = [];
              sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
              steps[sessions[tgId].step]();
              return;
            }
            if (imgMsg.text && imgMsg.text.toLowerCase() === "done") {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "editMenu";
              steps.editMenu();
            } else if (
              imgMsg.photo ||
              (imgMsg.document &&
                imgMsg.document.mime_type.startsWith("image/"))
            ) {
              try {
                let fileId;
                if (imgMsg.photo) {
                  fileId = imgMsg.photo.pop().file_id;
                } else {
                  const file = await bot.getFile(imgMsg.document.file_id);
                  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
                  const response = await axios.get(fileUrl, {
                    responseType: "arraybuffer",
                  });
                  const photoMessage = await bot.sendPhoto(
                    process.env.TEMP_CHANNEL_ID,
                    Buffer.from(response.data)
                  );
                  fileId = photoMessage.photo?.pop()?.file_id;
                }
                sessions[tgId].additionalImageUrls.push(fileId);
                if (sessions[tgId].additionalImageUrls.length < 3) {
                  collectImage();
                } else {
                  sessions[tgId].fromEdit = false;
                  sessions[tgId].step = "editMenu";
                  steps.editMenu();
                }
              } catch (error) {
                bot.sendMessage(
                  chatId,
                  `❌ Failed to process image: ${error.message}. Try again:`
                );
                collectImage();
              }
            } else {
              bot.sendMessage(
                chatId,
                "❌ Please send a photo, an image file, or type 'done':"
              );
              collectImage();
            }
          });
        };
        collectImage();
      },

      category: () => {
        const categoryButtons = [];
        const categoriesList = getCategories();
        for (let i = 0; i < categoriesList.length; i += 2) {
          categoryButtons.push([
            { text: categoriesList[i] },
            ...(i + 1 < categoriesList.length
              ? [{ text: categoriesList[i + 1] }]
              : []),
          ]);
        }
        sendMessageWithKeyboard(
          "📂 Select a general category:",
          categoryButtons,
          true
        );
        bot.once("message", (catMsg) => {
          if (checkCancel(catMsg.text, () => {})) return;
          if (catMsg.text && catMsg.text.toLowerCase() === "back") {
            sessions[tgId].generalCategory = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          if (!categories[catMsg.text]) {
            bot.sendMessage(
              chatId,
              "❌ Invalid category. Please select a valid category:"
            );
            steps.category();
          } else {
            sessions[tgId].generalCategory = catMsg.text;
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          }
        });
      },

      subCategory: () => {
        const subCategoriesList = getSubCategories(
          sessions[tgId].generalCategory
        );
        const subCategoryButtons = [];
        for (let i = 0; i < subCategoriesList.length; i += 2) {
          subCategoryButtons.push([
            { text: subCategoriesList[i] },
            ...(i + 1 < subCategoriesList.length
              ? [{ text: subCategoriesList[i + 1] }]
              : []),
          ]);
        }
        sendMessageWithKeyboard(
          `📁 Select a specific sub-category for ${sessions[tgId].generalCategory}:`,
          subCategoryButtons,
          true
        );
        bot.once("message", (subCatMsg) => {
          if (checkCancel(subCatMsg.text, () => {})) return;
          if (subCatMsg.text && subCatMsg.text.toLowerCase() === "back") {
            sessions[tgId].specificCategory = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          if (!subCategoriesList.includes(subCatMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Invalid sub-category. Please select a valid one:"
            );
            steps.subCategory();
          } else {
            const hashtag = subCatMsg.text.split(" ").pop();
            sessions[tgId].specificCategory = hashtag;
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          }
        });
      },

      name: () => {
        sendMessageWithKeyboard("🛍 Enter product name:", [], true);
        bot.once("message", (nameMsg) => {
          if (checkCancel(nameMsg.text, () => {})) return;
          if (nameMsg.text && nameMsg.text.toLowerCase() === "back") {
            sessions[tgId].name = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          if (!validateText(nameMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Name cannot be empty. Please enter a valid name:"
            );
            steps.name();
          } else {
            sessions[tgId].name = nameMsg.text;
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          }
        });
      },

      location: () => {
        sendMessageWithKeyboard("📍 Enter location:", [], true);
        bot.once("message", (locMsg) => {
          if (checkCancel(locMsg.text, () => {})) return;
          if (locMsg.text && locMsg.text.toLowerCase() === "back") {
            sessions[tgId].location = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          if (!validateText(locMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Location cannot be empty. Please enter a valid location:"
            );
            steps.location();
          } else {
            sessions[tgId].location = locMsg.text;
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          }
        });
      },

      price: () => {
        sendMessageWithKeyboard("💰 Enter price:", [], true);
        bot.once("message", (priceMsg) => {
          if (checkCancel(priceMsg.text, () => {})) return;
          if (priceMsg.text && priceMsg.text.toLowerCase() === "back") {
            sessions[tgId].price = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          if (!validatePrice(priceMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Invalid price. Please enter a valid number greater than 0:"
            );
            steps.price();
          } else {
            sessions[tgId].price = parseFloat(priceMsg.text);
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          }
        });
      },

      description: () => {
        sendMessageWithKeyboard(
          "📝 Short description (15 words max):",
          [],
          true
        );
        bot.once("message", (descMsg) => {
          if (checkCancel(descMsg.text, () => {})) return;
          if (descMsg.text && descMsg.text.toLowerCase() === "back") {
            sessions[tgId].shortDescription = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          if (!validateDescription(descMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Description must be 1-15 words. Please try again:"
            );
            steps.description();
          } else {
            sessions[tgId].shortDescription = descMsg.text;
            sessions[tgId].fromEdit = false;
            sessions[tgId].step = "editMenu";
            steps.editMenu();
          }
        });
      },

      phone: () => {
        sendMessageWithKeyboard(
          "📞 Please share your phone number:",
          [[{ text: "Share Phone Number", request_contact: true }]],
          true
        );
        bot.once("message", (msg) => {
          if (checkCancel(msg.text, () => {})) return;
          if (msg.text && msg.text.toLowerCase() === "back") {
            sessions[tgId].contactInfo = null;
            sessions[tgId].step = sessions[tgId].history.pop() || "editMenu";
            steps[sessions[tgId].step]();
            return;
          }
          bot.once("contact", async (contactMsg) => {
            const phone = contactMsg.contact.phone_number;
            try {
              let seller = await Seller.findOne({ telegramId: tgId });
              if (!seller) {
                seller = new Seller({
                  telegramId: tgId,
                  username: msg.from.username,
                  firstName: msg.from.first_name,
                  phone: phone,
                });
                await seller.save();
              } else if (seller.phone !== phone) {
                seller.phone = phone;
                await seller.save();
              }
              sessions[tgId].sellerId = seller._id;
              sessions[tgId].contactInfo = { phone };
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "editMenu";
              steps.editMenu();
            } catch (error) {
              bot.sendMessage(
                chatId,
                `❌ Error saving phone: ${error.message}. Try again:`
              );
              steps.phone();
            }
          });
        });
      },
    };

    steps.editMenu();
  } catch (error) {
    console.error("❌ Error starting update:", error.message);
    bot.sendMessage(chatId, "❌ Failed to start update. Please try again.");
  }
};

module.exports = { updateProduct };
