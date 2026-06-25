const { getGeminiClient } = require('../../config/gemini');
const { generationPrompt } = require('./prompts');
const Itinerary = require('../../models/Itinerary');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withTimeout = (promise, ms) =>
  Promise.race([promise, sleep(ms).then(() => { throw new Error(`Gemini API timed out after ${ms / 1000}s`); })]);

const callWithRetry = async (model, prompt, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), 90000);
      return result.response.text();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503;
      if (isRetryable && attempt < maxRetries) {
        console.warn(`Gemini generation retry ${attempt + 1}/${maxRetries} after ${err.status}...`);
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }
};

const parseJsonResponse = (text) => {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(clean);
};

const generateItinerary = async (itinerary, customNotes = '') => {
  await Itinerary.findByIdAndUpdate(itinerary._id, { 'itinerary.status': 'generating' });

  try {
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    console.log(`[generate] itinerary ${itinerary._id} → ${modelName}`);
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const mergedJson = JSON.stringify(itinerary.extractedData, null, 2);
    const notesSection = customNotes
      ? `\nADDITIONAL NOTES FROM TRAVELER:\n${customNotes}`
      : '';

    const prompt = generationPrompt
      .replace('{{mergedJson}}', mergedJson)
      .replace('{{customNotes}}', notesSection);

    const responseText = await callWithRetry(model, prompt);

    let parsedData;
    try {
      parsedData = parseJsonResponse(responseText);
    } catch {
      const errMsg = `Could not parse AI response. Raw: ${responseText.slice(0, 300)}`;
      console.error(`[generate] JSON parse failed for itinerary ${itinerary._id}:`, errMsg);
      await Itinerary.findByIdAndUpdate(itinerary._id, {
        'itinerary.status': 'failed',
        'itinerary.error': errMsg,
      });
      return;
    }
    console.log(`[generate] success — ${(parsedData.days || []).length} days generated`);

    const days = (parsedData.days || []).map((day, i) => ({
      ...day,
      dayNumber: day.dayNumber ?? i + 1,
    }));

    await Itinerary.findByIdAndUpdate(itinerary._id, {
      title: parsedData.tripTitle || itinerary.title,
      'itinerary.status': 'done',
      'itinerary.days': days,
      'itinerary.generatedAt': new Date(),
      'itinerary.error': null,
    });
  } catch (err) {
    console.error(`[generate] failed for itinerary ${itinerary._id}:`, err.message);
    await Itinerary.findByIdAndUpdate(itinerary._id, {
      'itinerary.status': 'failed',
      'itinerary.error': err.message || 'Generation failed',
    });
  }
};

module.exports = { generateItinerary };
