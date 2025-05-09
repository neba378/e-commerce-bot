require("dotenv").config();
const axios = require("axios");
const Product = require("../../../db/models/product");
const Seller = require("../../../db/models/seller");
const categories = require("../../../data/categories.json");
const { limitWords, sanitizeMarkdownV2 } = require("../../../utils/helper");

const getCategories = () => Object.keys(categories);
const getSubCategories = (category) => categories[category] || [];

// Function to sanitize MarkdownV2 input

const addProduct = async (bot, msg) => {
  const sessions = {};
  const tgId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    // Initialize session if not exists
    sessions[tgId] = sessions[tgId] || {
      additionalImageUrls: [],
      step: "primaryImage",
      history: [],
    };

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

    const sendInlineMessage = (message, inlineKeyboard) => {
      return bot.sendMessage(chatId, message, {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
    };

    // Validation functions
    const validatePrice = (priceText) => {
      if (!priceText || priceText.trim() === "") {
        return "Price not set";
      }
      const isNumeric = /^[0-9]+(\.[0-9]+)?$/.test(priceText);
      if (isNumeric) {
        const price = parseFloat(priceText);
        return price > 0 ? price : false;
      }
      // Allow non-numeric values like "Negotiable"
      return priceText.trim().length > 0 ? priceText.trim() : false;
    };

    const validateDescription = (desc) => {
      const words = desc.trim().split(/\s+/);
      return words.length <= 50 && desc.length > 0;
    };

    const validateText = (text) => text && text.trim().length > 0;

    // Reset session and notify user
    const resetSession = () => {
      delete sessions[tgId];
      bot.sendMessage(chatId, "✅ Product listing canceled.");
    };

    // Check for cancel command or button
    const checkCancel = (msgText, callback) => {
      if (
        msgText &&
        (msgText.toLowerCase() === "/cancel" || msgText === "Cancel")
      ) {
        resetSession();
        return true;
      }
      callback();
      return false;
    };

    // Step handlers
    const steps = {
      primaryImage: () => {
        sendMessageWithKeyboard("📸 Upload 1 main image only.");
        bot.once("message", async (photoMsg) => {
          if (checkCancel(photoMsg.text, () => {})) return;
          let fileId;
          try {
            if (photoMsg.photo) {
              fileId = photoMsg.photo.pop().file_id;
            } else if (
              photoMsg.document &&
              photoMsg.document.mime_type.startsWith("image/")
            ) {
              if (!process.env.TEMP_CHANNEL_ID) {
                throw new Error("TEMP_CHANNEL_ID is not set in .env");
              }
              const file = await bot.getFile(photoMsg.document.file_id);
              if (!file.file_path) {
                throw new Error("Failed to retrieve file path from Telegram");
              }
              const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
              let response;
              try {
                response = await axios.get(fileUrl, {
                  responseType: "arraybuffer",
                  timeout: 10000,
                });
              } catch (axiosError) {
                throw new Error(
                  `Failed to download file: ${axiosError.message}`
                );
              }
              try {
                const photoMessage = await bot.sendPhoto(
                  process.env.TEMP_CHANNEL_ID,
                  Buffer.from(response.data)
                );
                fileId = photoMessage.photo?.pop()?.file_id;
                if (!fileId) {
                  throw new Error("No photo file ID returned from Telegram");
                }
              } catch (telegramError) {
                throw new Error(
                  `Failed to send photo to TEMP_CHANNEL_ID: ${telegramError.message}`
                );
              }
            } else {
              bot.sendMessage(
                chatId,
                "❌ Please upload a photo or an image file:"
              );
              steps.primaryImage();
              return;
            }
            sessions[tgId].primaryImageUrl = fileId;
            sessions[tgId].history.push("primaryImage");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "additionalImages";
              steps.additionalImages();
            }
          } catch (error) {
            console.error(
              "❌ Error in primaryImage step:",
              error.message,
              error.stack
            );
            bot.sendMessage(
              chatId,
              "❌ Failed to process image. Please try again:"
            );
            steps.primaryImage();
          }
        });
      },

      additionalImages: () => {
        // Clear additionalImageUrls when editing
        if (sessions[tgId].fromEdit) {
          sessions[tgId].additionalImageUrls = [];
        }
        sendMessageWithKeyboard(
          "📸 Send up to 3 additional images. \nType 'done' when finished.",
          [],
          true
        );
        const collectImage = () => {
          bot.once("message", async (imgMsg) => {
            if (checkCancel(imgMsg.text, () => {})) return;
            if (imgMsg.text && imgMsg.text.toLowerCase() === "back") {
              sessions[tgId].additionalImageUrls = [];
              sessions[tgId].step = sessions[tgId].history.pop();
              steps[sessions[tgId].step]();
              return;
            }
            if (imgMsg.text && imgMsg.text.toLowerCase() === "done") {
              sessions[tgId].history.push("additionalImages");
              if (sessions[tgId].fromEdit) {
                sessions[tgId].fromEdit = false;
                sessions[tgId].step = "preview";
                steps.preview();
              } else {
                sessions[tgId].step = "category";
                steps.category();
              }
            } else if (
              imgMsg.photo ||
              (imgMsg.document &&
                imgMsg.document.mime_type.startsWith("image/"))
            ) {
              let fileId;
              try {
                if (imgMsg.photo) {
                  fileId = imgMsg.photo.pop().file_id;
                } else {
                  if (!process.env.TEMP_CHANNEL_ID) {
                    throw new Error("TEMP_CHANNEL_ID is not set in .env");
                  }
                  const file = await bot.getFile(imgMsg.document.file_id);
                  if (!file.file_path) {
                    throw new Error(
                      "Failed to retrieve file path from Telegram"
                    );
                  }
                  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
                  const response = await axios.get(fileUrl, {
                    responseType: "arraybuffer",
                    timeout: 10000,
                  });
                  const photoMessage = await bot.sendPhoto(
                    process.env.TEMP_CHANNEL_ID,
                    Buffer.from(response.data)
                  );
                  fileId = photoMessage.photo?.pop()?.file_id;
                  if (!fileId) {
                    throw new Error("No photo file ID returned from Telegram");
                  }
                }
                sessions[tgId].additionalImageUrls.push(fileId);
                if (sessions[tgId].additionalImageUrls.length < 3) {
                  collectImage();
                } else {
                  sessions[tgId].history.push("additionalImages");
                  if (sessions[tgId].fromEdit) {
                    sessions[tgId].fromEdit = false;
                    sessions[tgId].step = "preview";
                    steps.preview();
                  } else {
                    sessions[tgId].step = "category";
                    steps.category();
                  }
                }
              } catch (error) {
                console.error(
                  "❌ Error in additionalImages step:",
                  error.message,
                  error.stack
                );
                bot.sendMessage(
                  chatId,
                  "❌ Failed to process image. Please try again:"
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
            sessions[tgId].step = sessions[tgId].history.pop();
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
            sessions[tgId].history.push("category");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "subCategory";
              steps.subCategory();
            }
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
            sessions[tgId].step = sessions[tgId].history.pop();
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
            const fullText = subCatMsg.text;
            const hashtag = fullText.split(" ").pop();
            sessions[tgId].specificCategory = hashtag;
            sessions[tgId].history.push("subCategory");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "name";
              steps.name();
            }
          }
        });
      },

      name: () => {
        sendMessageWithKeyboard("🛍 Enter product name:", [], true);
        bot.once("message", (nameMsg) => {
          if (checkCancel(nameMsg.text, () => {})) return;
          if (nameMsg.text && nameMsg.text.toLowerCase() === "back") {
            sessions[tgId].name = null;
            sessions[tgId].step = sessions[tgId].history.pop();
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
            sessions[tgId].history.push("name");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "location";
              steps.location();
            }
          }
        });
      },

      location: () => {
        sendMessageWithKeyboard("📍 Enter location:", [], true);
        bot.once("message", (locMsg) => {
          if (checkCancel(locMsg.text, () => {})) return;
          if (locMsg.text && locMsg.text.toLowerCase() === "back") {
            sessions[tgId].location = null;
            sessions[tgId].step = sessions[tgId].history.pop();
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
            sessions[tgId].history.push("location");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "price";
              steps.price();
            }
          }
        });
      },

      price: () => {
        sendMessageWithKeyboard("💰 Enter price:", [], true);
        bot.once("message", (priceMsg) => {
          if (checkCancel(priceMsg.text, () => {})) return;
          if (priceMsg.text && priceMsg.text.toLowerCase() === "back") {
            sessions[tgId].price = null;
            sessions[tgId].step = sessions[tgId].history.pop();
            steps[sessions[tgId].step]();
            return;
          }
          if (!validatePrice(priceMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Invalid price. Please enter a valid number greater than 0 or valid string!"
            );
            steps.price();
          } else {
            // sessions[tgId].price = parseFloat(priceMsg.text);
            sessions[tgId].price = priceMsg.text;
            sessions[tgId].history.push("price");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "description";
              steps.description();
            }
          }
        });
      },

      description: () => {
        sendMessageWithKeyboard("📝 Description (50 words max):", [], true);
        bot.once("message", (descMsg) => {
          if (checkCancel(descMsg.text, () => {})) return;
          if (descMsg.text && descMsg.text.toLowerCase() === "back") {
            sessions[tgId].shortDescription = null;
            sessions[tgId].step = sessions[tgId].history.pop();
            steps[sessions[tgId].step]();
            return;
          }
          if (!validateDescription(descMsg.text)) {
            bot.sendMessage(
              chatId,
              "❌ Description must be 1-50 words. Please try again:"
            );
            steps.description();
          } else {
            sessions[tgId].shortDescription = descMsg.text;
            sessions[tgId].history.push("description");
            if (sessions[tgId].fromEdit) {
              sessions[tgId].fromEdit = false;
              sessions[tgId].step = "preview";
              steps.preview();
            } else {
              sessions[tgId].step = "phone";
              steps.phone();
            }
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
            sessions[tgId].step = sessions[tgId].history.pop();
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
              sessions[tgId].history.push("phone");
              if (sessions[tgId].fromEdit) {
                sessions[tgId].fromEdit = false;
              }
              sessions[tgId].step = "preview";
              steps.preview();
            } catch (error) {
              console.error(
                "❌ Error processing phone:",
                error.message,
                error.stack
              );
              bot.sendMessage(
                chatId,
                "❌ Failed to save phone. Please try again:"
              );
              steps.phone();
            }
          });
        });
      },

      preview: () => {
        const sessionData = sessions[tgId];
        const caption =
          `🛒 \\#${sanitizeMarkdownV2(
            sessionData.generalCategory.split(" ")[1]
          )} \\>\\> ${sanitizeMarkdownV2(sessionData.specificCategory)}\n` +
          `*${sanitizeMarkdownV2(sessionData.name)}*\n\n` +
          `📝_${sanitizeMarkdownV2(`Description:`)}_\n_${sanitizeMarkdownV2(
            limitWords(sessionData.shortDescription)
          )}_\n\n` +
          `\\.  \\.  \\.  \\.  \\.  \\.  \\.  \\.  \\.\n` +
          `📍 Location: *${sanitizeMarkdownV2(sessionData.location)}*\n` +
          `💰 Price: *${sanitizeMarkdownV2(String(sessionData.price))}*`;

        // Log caption for debugging
        console.log("Preview caption:", caption);

        const allImageUrls = [
          sessionData.primaryImageUrl,
          ...(sessionData.additionalImageUrls || []),
        ];
        const media = allImageUrls.map((imageUrl, index) => ({
          type: "photo",
          media: imageUrl,
          caption: index === 0 ? caption : undefined,
          parse_mode: "MarkdownV2",
        }));

        bot
          .sendMediaGroup(chatId, media)
          .then(() => {
            const inlineKeyboard = [
              [
                { text: "Confirm and Post", callback_data: "confirm_post" },
                { text: "Edit", callback_data: "edit_product" },
              ],
              [{ text: "Cancel", callback_data: "cancel_product" }],
            ];
            sendInlineMessage("Choose an action:", inlineKeyboard);
          })
          .catch((error) => {
            console.error(
              "❌ Error sending preview media group:",
              error.message,
              error.stack
            );
            bot.sendMessage(
              chatId,
              "❌ Failed to show preview. Please try again:"
            );
            steps.preview();
          });

        bot.once("callback_query", async (query) => {
          const action = query.data;
          bot.answerCallbackQuery(query.id);

          if (action === "confirm_post") {
            try {
              const product = new Product({
                ...sessions[tgId],
                sellerId: sessions[tgId].sellerId,
              });
              await product.save();

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

              const channelMessage = await bot.sendPhoto(
                process.env.CHANNEL_ID,
                product.primaryImageUrl,
                {
                  caption: postCaption,
                  ...opts,
                }
              );

              const groupMessage = await bot.sendPhoto(
                process.env.GROUP_ID,
                product.primaryImageUrl,
                {
                  caption: postCaption,
                  ...opts,
                }
              );

              await Product.updateOne(
                { _id: product._id },
                {
                  channelMessageId: channelMessage.message_id,
                  groupMessageId: groupMessage.message_id,
                }
              );

              bot.sendMessage(chatId, "✅ Product posted successfully!");
              delete sessions[tgId];
            } catch (error) {
              console.error(
                "❌ Error posting product:",
                error.message,
                error.stack
              );
              bot.sendMessage(
                chatId,
                "❌ Failed to post product. Please try again:"
              );
              steps.preview();
            }
          } else if (action === "edit_product") {
            const editKeyboard = [
              [
                {
                  text: "Edit Primary Image",
                  callback_data: "edit_primaryImage",
                },
                {
                  text: "Edit Additional Images",
                  callback_data: "edit_additionalImages",
                },
              ],
              [
                { text: "Edit Category", callback_data: "edit_category" },
                {
                  text: "Edit Sub-Category",
                  callback_data: "edit_subCategory",
                },
              ],
              [
                { text: "Edit Name", callback_data: "edit_name" },
                { text: "Edit Location", callback_data: "edit_location" },
              ],
              [
                { text: "Edit Price", callback_data: "edit_price" },
                { text: "Edit Description", callback_data: "edit_description" },
              ],
              [{ text: "Edit Phone", callback_data: "edit_phone" }],
              [{ text: "Back to Preview", callback_data: "back_preview" }],
            ];
            sendInlineMessage("Select a field to edit:", editKeyboard);

            bot.once("callback_query", (editQuery) => {
              const editAction = editQuery.data;
              bot.answerCallbackQuery(editQuery.id);

              if (editAction === "back_preview") {
                sessions[tgId].fromEdit = false;
                steps.preview();
              } else {
                const step = editAction.replace("edit_", "");
                sessions[tgId].step = step;
                sessions[tgId].history.push("preview");
                sessions[tgId].fromEdit = true;
                steps[step]();
              }
            });
          } else if (action === "cancel_product") {
            resetSession();
          }
        });
      },
    };

    bot.onText(/\/cancel/, (msg) => {
      const tgId = msg.from.id;
      const chatId = msg.chat.id;
      if (sessions[tgId]) {
        resetSession();
      } else {
        bot.sendMessage(chatId, "ℹ️ No active product listing to cancel.");
      }
    });

    // Start from the current step
    steps[sessions[tgId].step]();
  } catch (error) {
    console.error("❌ Fatal error in addProduct:", error.message, error.stack);
    bot.sendMessage(
      chatId,
      "❌ An unexpected error occurred. Please try again later."
    );
    delete sessions[tgId];
  }
};

module.exports = { addProduct, sanitizeMarkdownV2 };
