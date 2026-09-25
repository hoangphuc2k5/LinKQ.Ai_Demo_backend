const { createWorker } = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { solveCaptchaFromBuffer, normalizeImage, CAPCHA_CHAR_WHITELIST } = require('../adapters/captchaAdapter');
const { loadImage } = require('@napi-rs/canvas');
require('dotenv').config();

const OCR_LANGUAGES = process.env.OCR_LANGUAGES || 'vie+eng';
const AI_FALLBACK_CONFIDENCE = Number(process.env.OCR_AI_FALLBACK_CONFIDENCE || 75);
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const OCR_FALLBACK_PROMPT = [
  'Transcribe exactly the text visible in this image.',
  'For a captcha, return its characters only, in reading order.',
  'Do not add an explanation, markdown, or punctuation that is not visible.',
].join(' ');

const CAPTCHA_PRESETS = [
  {
    name: 'balanced',
    options: {
      threshold: 170,
      padding: 18,
      upscale: 5,
      minArea: 10,
      sharpen: 1.0,
      adaptive: true,
      adaptiveRadius: 11,
      adaptiveC: 14,
      closeRadius: 1,
      openRadius: 0,
      psm: 8,
    },
  },
  {
    name: 'sharp_loose',
    options: {
      threshold: 185,
      padding: 20,
      upscale: 6,
      minArea: 8,
      sharpen: 1.4,
      adaptive: true,
      adaptiveRadius: 13,
      adaptiveC: 18,
      closeRadius: 1,
      openRadius: 1,
      psm: 8,
    },
  },
  {
    name: 'dark_strict',
    options: {
      threshold: 150,
      padding: 16,
      upscale: 5,
      minArea: 14,
      sharpen: 0.7,
      adaptive: true,
      adaptiveRadius: 9,
      adaptiveC: 10,
      closeRadius: 2,
      openRadius: 0,
      psm: 7,
    },
  },
  {
    name: 'adaptive_strong',
    options: {
      threshold: 170,
      padding: 22,
      upscale: 6,
      minArea: 10,
      sharpen: 1.2,
      adaptive: true,
      adaptiveRadius: 17,
      adaptiveC: 22,
      closeRadius: 1,
      openRadius: 0,
      psm: 13,
    },
  },
  {
    name: 'fixed_threshold',
    options: {
      threshold: 175,
      padding: 18,
      upscale: 5,
      minArea: 10,
      sharpen: 1.0,
      adaptive: false,
      closeRadius: 1,
      openRadius: 0,
      psm: 8,
    },
  },
];

let workerPromise;
let recognitionQueue = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGUAGES, 1, {
      logger: () => {},
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_ocr_engine_mode: '2',
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
          textord_heavy_nr: '1',
          textord_min_linesize: '2.0',
          edges_max_children_per_outline: '50',
          edges_max_children_layers: '6',
          edges_children_per_grandchild: '12',
        });
        return worker;
      })
      .catch((error) => {
        workerPromise = undefined;
        throw error;
      });
  }

  return workerPromise;
}

function normalizeCaptchaText(text = '') {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function looksLikeCaptcha(text) {
  return /^[A-Z0-9]{4,8}$/.test(text);
}

function pickBestResult(candidates) {
  const valid = candidates.filter((c) => c && normalizeCaptchaText(c.text).length >= 3);
  if (!valid.length) return candidates[0] || { text: '', confidence: 0 };

  valid.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
  const perfect = valid.find((v) => looksLikeCaptcha(v.text) && Number(v.confidence || 0) >= 85);
  if (perfect) return perfect;

  const length = valid[0].text.length;
  const bucket = valid.filter((v) => v.text.length === length);
  const freq = new Map();
  for (const v of bucket) {
    freq.set(v.text, (freq.get(v.text) || 0) + 1);
  }
  let best = valid[0].text;
  let bestCount = 0;
  for (const [t, c] of freq) {
    if (c > bestCount) {
      bestCount = c;
      best = t;
    }
  }
  const elected = valid.find((v) => v.text === best);
  return elected || valid[0];
}

async function solveCaptchaWithPresets(buffer, presets = CAPTCHA_PRESETS) {
  const worker = await getWorker();
  const image = await loadImage(buffer);
  const candidates = [];

  for (const preset of presets) {
    let processedCanvas;
    try {
      processedCanvas = normalizeImage(image, preset.options);
    } catch (err) {
      continue;
    }
    const imgBuffer = processedCanvas.toBuffer('image/png');

    await worker.setParameters({
      tessedit_pageseg_mode: String(preset.options.psm ?? 8),
      tessedit_char_whitelist: CAPCHA_CHAR_WHITELIST,
      tessedit_ocr_engine_mode: '2',
      preserve_interword_spaces: '0',
      textord_heavy_nr: '1',
      textord_min_linesize: '2.5',
      language_model_penalty_non_dict_word: '0',
      language_model_penalty_non_freq_dict_word: '0',
      language_model_penalty_punc: '0',
      language_model_penalty_case: '0',
      language_model_penalty_script: '0',
      language_model_penalty_chartype: '0',
      language_model_penalty_capital: '0',
    });

    try {
      const res = await worker.recognize(imgBuffer);
      const text = normalizeCaptchaText(res.data.text);
      const confidence = Number(res.data.confidence || 0);
      candidates.push({
        text,
        confidence,
        rawText: res.data.text || '',
        preset: preset.name,
        buffer: imgBuffer,
      });
    } catch (err) {
      // skip failed preset
    }
  }

  return pickBestResult(candidates);
}

function recognize(buffer) {
  const task = recognitionQueue.then(async () => {
    const worker = await getWorker();

    const captchaResult = await solveCaptchaWithPresets(buffer, CAPTCHA_PRESETS.slice(0, 3));
    if (looksLikeCaptcha(captchaResult.text)) {
      return {
        data: {
          text: captchaResult.text,
          confidence: Number(captchaResult.confidence || 0),
        },
      };
    }

    const result = await worker.recognize(buffer);
    return sanitizeOcrText(result.data.text)
      ? result
      : recognizeCaptchaFallback(worker, buffer);
  });

  recognitionQueue = task.catch(() => undefined);
  return task;
}

async function recognizeCaptchaFallback(worker, buffer) {
  const preset = CAPTCHA_PRESETS[0];
  const image = await loadImage(buffer);
  const processedCanvas = normalizeImage(image, preset.options);
  const imgBuffer = processedCanvas.toBuffer('image/png');

  await worker.setParameters({
    tessedit_pageseg_mode: '8',
    tessedit_char_whitelist: CAPCHA_CHAR_WHITELIST,
    tessedit_ocr_engine_mode: '2',
    preserve_interword_spaces: '0',
    textord_heavy_nr: '1',
    textord_min_linesize: '2.5',
    language_model_penalty_non_dict_word: '0',
    language_model_penalty_non_freq_dict_word: '0',
    language_model_penalty_punc: '0',
    language_model_penalty_case: '0',
    language_model_penalty_script: '0',
    language_model_penalty_chartype: '0',
    language_model_penalty_capital: '0',
  });

  try {
    const workerResult = await worker.recognize(imgBuffer);
    return {
      ...workerResult,
      data: {
        ...workerResult.data,
        text: normalizeCaptchaText(workerResult.data.text),
        confidence: Number(workerResult.data.confidence || 0),
      },
    };
  } finally {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '',
    });
  }
}

async function recognizeWithAiFallback(file) {
  if (!genAI) return null;

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  });
  const response = await model.generateContent([
    OCR_FALLBACK_PROMPT,
    {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      },
    },
  ]);

  return sanitizeOcrText(response.response.text());
}

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

  const result = await recognize(file.buffer);
  let text = sanitizeOcrText(result.data.text);
  const confidence = Number(result.data.confidence || 0);

  if (text.length < 3 || confidence < AI_FALLBACK_CONFIDENCE) {
    const aiText = await recognizeWithAiFallback(file);
    if (aiText) text = aiText;
  }

  return {
    text,
    fileName: file.originalname || null,
  };
}

async function readCaptchaFromImage(file) {
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

  const task = recognitionQueue.then(async () => {
    const result = await solveCaptchaWithPresets(file.buffer, CAPTCHA_PRESETS);
    const text = normalizeCaptchaText(result.text);
    const confidence = Number(result.confidence || 0);

    return {
      text,
      confidence,
      looksLikeCaptcha: looksLikeCaptcha(text),
      preset: result.preset || null,
      rawText: result.rawText || '',
      fileName: file.originalname || null,
    };
  });

  recognitionQueue = task.catch(() => undefined);
  return task;
}

function sanitizeOcrText(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

module.exports = { readTextFromImage, readCaptchaFromImage };
