const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const OCR_PROMPT = `
Đọc toàn bộ văn bản nhìn thấy trong ảnh.
Chỉ trả về chữ cái, chữ có dấu, chữ số, khoảng trắng và xuống dòng.
Không trả về dấu câu, ký hiệu đặc biệt, markdown hoặc lời giải thích.
Không thêm mô tả, suy luận hoặc lời mở đầu. Chỉ trả về văn bản đã đọc.
`.trim();

async function readTextFromImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    const error = new Error('File ảnh upload không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    const error = new Error('OCR chỉ hỗ trợ file hình ảnh');
    error.statusCode = 400;
    throw error;
  }

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  });
  const result = await model.generateContent([
    OCR_PROMPT,
    {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      },
    },
  ]);

  return {
    text: sanitizeOcrText(result.response.text()),
    fileName: file.originalname || null,
  };
}

function sanitizeOcrText(text) {
  return text
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

module.exports = { readTextFromImage };