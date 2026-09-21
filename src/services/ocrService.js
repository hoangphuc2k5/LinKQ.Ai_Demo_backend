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
  const content = [
    OCR_PROMPT,
    {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      },
    },
  ];
  const result = await generateWithQuotaRetry(model, content);

  return {
    text: sanitizeOcrText(result.response.text()),
    fileName: file.originalname || null,
  };
}

async function generateWithQuotaRetry(model, content) {
  try {
    return await model.generateContent(content);
  } catch (error) {
    if (!isQuotaError(error)) throw error;

    const retryDelayMs = getRetryDelayMs(error);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    try {
      return await model.generateContent(content);
    } catch (retryError) {
      if (isQuotaError(retryError)) {
        retryError.statusCode = 429;
        retryError.retryAfterSeconds = Math.ceil(getRetryDelayMs(retryError) / 1000);
      }
      throw retryError;
    }
  }
}

function isQuotaError(error) {
  return error?.status === 429
    || error?.statusCode === 429
    || /429|too many requests|quota exceeded/i.test(error?.message || '');
}

function getRetryDelayMs(error) {
  const retryDelay = error?.response?.retryDelay || error?.retryDelay;
  const messageMatch = String(error?.message || '').match(/retry(?:Delay| in)\D+(\d+)/i);
  const seconds = Number.parseInt(String(retryDelay || '').match(/\d+/)?.[0] || messageMatch?.[1] || '30', 10);
  return Math.min(Math.max(seconds, 1), 120) * 1000;
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