const axios = require('axios');

const OCR_API_URL = process.env.OCR_API_URL;

let ocrQueue = Promise.resolve();

function enqueueOcrJob(job) {
  const run = ocrQueue.then(job, job);
  ocrQueue = run.then(() => undefined, () => undefined);
  return run;
}

function validateImageFile(file) {
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
}

function extractText(payload) {
  if (typeof payload === 'string') return payload.trim();

  const text = payload?.text ?? payload?.data?.text ?? payload?.result?.text;
  if (typeof text === 'string') return text.trim();

  const error = new Error('API OCR trả về dữ liệu không chứa trường text');
  error.statusCode = 502;
  throw error;
}

async function readWithOcrApi(file) {
  validateImageFile(file);

  if (!OCR_API_URL) {
    const error = new Error('Chưa cấu hình OCR_API_URL trong file .env');
    error.statusCode = 500;
    throw error;
  }

  return enqueueOcrJob(async () => {
    const form = new FormData();
    form.append(
      'image',
      new Blob([file.buffer], { type: file.mimetype }),
      file.originalname || 'image',
    );

    try {
      const response = await axios.post(OCR_API_URL, form, {
        headers: form.getHeaders?.(),
        timeout: 30_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      return {
        text: extractText(response.data),
        fileName: file.originalname || null,
      };
    } catch (cause) {
      if (cause.statusCode) throw cause;

      const error = new Error(
        cause.response?.data?.error || cause.response?.data?.detail || 'Không thể gọi API OCR',
      );
      error.statusCode = cause.response?.status || 502;
      throw error;
    }
  });
}

async function readTextFromImage(file) {
  return readWithOcrApi(file);
}

async function readCaptchaFromImage(file) {
  return readWithOcrApi(file);
}

module.exports = { readTextFromImage, readCaptchaFromImage };
