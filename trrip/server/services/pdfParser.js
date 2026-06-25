const pdfParse = require('pdf-parse');
const fs = require('fs').promises;

// Accepts either a file path (string) or a Buffer
const parsePdf = async (input) => {
  const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
  const data = await pdfParse(buffer);
  return data.text || '';
};

module.exports = { parsePdf };
