let conversationHistory = [];

module.exports = {
  getHistory: () => conversationHistory,

  addUserMessage: (text) => {
    conversationHistory.push({
      role: 'user',
      parts: [{ text }]
    });
  },

  addBotMessage: (text) => {
    conversationHistory.push({
      role: 'model',
      parts: [{ text }]
    });
  },

  trimTo: (count) => {
    conversationHistory = conversationHistory.slice(-count);
  },

  reset: () => {
    conversationHistory = [];
  }
};