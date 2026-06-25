const { getGeminiClient } = require('../../config/gemini');
const { parsePdf } = require('../pdfParser');
const { downloadFromS3 } = require('../storage/s3Storage');
const { extractionPrompt } = require('./prompts');
const Upload = require('../../models/Upload');
const fs = require('fs').promises;

const getFileBytes = async (upload) => {
  if (upload.storageType === 's3') {
    return downloadFromS3(upload.s3Bucket, upload.s3Key);
  }
  return fs.readFile(upload.localPath);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withTimeout = (promise, ms) =>
  Promise.race([promise, sleep(ms).then(() => { throw new Error(`Gemini API timed out after ${ms / 1000}s`); })]);

const callWithRetry = async (model, parts, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent({ contents: [{ role: 'user', parts }] }),
        60000
      );
      return result.response.text();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503;
      if (isRetryable && attempt < maxRetries) {
        console.warn(`Gemini retry ${attempt + 1}/${maxRetries} after ${err.status}...`);
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }
};

// Strip markdown fences that some models add despite responseMimeType: application/json
const parseJsonResponse = (text) => {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(clean);
};

const extractTripData = async (upload) => {
  await Upload.findByIdAndUpdate(upload._id, { 'extracted.status': 'processing' });

  try {
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    console.log(`[extract] ${upload.originalName} → ${modelName}`);

    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });

    let parts = [{ text: extractionPrompt }];
    const fileBytes = await getFileBytes(upload);

    if (upload.mimeType === 'application/pdf') {
      let pdfText = '';
      try {
        pdfText = await parsePdf(fileBytes);
      } catch {
        // Corrupt or scanned PDF — fall through to Vision
      }

      if (pdfText.trim().length > 50) {
        parts.push({ text: `\n\nDOCUMENT CONTENT:\n${pdfText}` });
      } else {
        parts = [
          { text: extractionPrompt },
          { inlineData: { mimeType: 'application/pdf', data: fileBytes.toString('base64') } },
        ];
      }
    } else {
      parts.push({
        inlineData: { mimeType: upload.mimeType, data: fileBytes.toString('base64') },
      });
    }

    const responseText = await callWithRetry(model, parts);
    console.log(`[extract] raw response (first 200): ${responseText.slice(0, 200)}`);

    let parsedData;
    try {
      parsedData = parseJsonResponse(responseText);
    } catch {
      const errMsg = `Could not parse AI response. Raw: ${responseText.slice(0, 300)}`;
      console.error(`[extract] JSON parse failed for ${upload.originalName}:`, errMsg);
      await Upload.findByIdAndUpdate(upload._id, {
        'extracted.status': 'failed',
        'extracted.error': errMsg,
        'extracted.processedAt': new Date(),
      });
      return;
    }

    console.log(`[extract] success for ${upload.originalName} — docType: ${parsedData.docType}`);
    await Upload.findByIdAndUpdate(upload._id, {
      'extracted.status': 'done',
      'extracted.data': parsedData,
      'extracted.processedAt': new Date(),
    });
  } catch (err) {
    console.error(`[extract] failed for ${upload.originalName}:`, err.message);
    await Upload.findByIdAndUpdate(upload._id, {
      'extracted.status': 'failed',
      'extracted.error': err.message || 'Extraction failed',
      'extracted.processedAt': new Date(),
    });
  }
};

module.exports = { extractTripData };
