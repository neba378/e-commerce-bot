function limitWords(text, maxWords = 15) {
  const words = text.split(/\s+/);
  return words.length > maxWords
    ? words.slice(0, maxWords).join(" ") + "..."
    : text;
}

module.exports = { limitWords };
