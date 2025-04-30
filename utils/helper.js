function limitWords(text, maxWords = 15) {
  const words = text.split(" ");
  let count = 0;
  const result = [];

  for (let word of words) {
    if (word.trim() !== "") count++;

    result.push(word);
    if (count >= maxWords) {
      result.push("...");
      break;
    }
  }

  return result.join(" ");
}

const sanitizeMarkdownV2 = (text) => {
  if (!text) return "";
  return String(text).replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, "\\$1");
};

module.exports = { limitWords, sanitizeMarkdownV2 };
