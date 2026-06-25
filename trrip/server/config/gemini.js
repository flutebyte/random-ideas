const { GoogleGenerativeAI } = require('@google/generative-ai');

let client = null;

const getGeminiClient = () => {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return client;
};

module.exports = { getGeminiClient };
