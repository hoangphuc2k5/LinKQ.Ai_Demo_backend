const path = require('path');
const { Worker } = require('worker_threads');
const { DOMParser } = require('@xmldom/xmldom');

let markItDownPromise;
let pdfRuntimePromise;

const MIME_EXTENSION_MAP = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/html': '.html',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
  'application/x-7z-compressed': '.7z',
  'application/x-tar': '.tar',
};

const LIBARCHIVE_EXTENSIONS = new Set(['.rar', '.7z', '.tar', '.tar.gz', '.tgz', '.gz', '.bz2']);

async function getMarkItDown() {
  if (!markItDownPromise) {
    markItDownPromise = ensurePdfRuntime()
      .then(() => import('markitdown-ts'))
      .then(({ MarkItDown }) => new MarkItDown());
  }
  return markItDownPromise;
}

async function ensurePdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import('@napi-rs/canvas'),
      import('pdf-parse'),
      import('pdf-parse/worker'),
    ]).then(([canvas, { PDFParse }, { getData }]) => {
      if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = canvas.DOMMatrix;
      if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = canvas.Path2D;
      if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = canvas.ImageData;
      PDFParse.setWorker(getData());
    });
  }
  return pdfRuntimePromise;
}

async function getImageModel() {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return google(process.env.GEMINI_MODEL || 'gemini-2.0-flash');
}

async function convertLibarchive(file, fileExtension) {
  const { Archive } = await import('libarchive.js/dist/libarchive-node.mjs');
  const workerPath = require.resolve('libarchive.js/dist/worker-bundle-node.mjs');
  Archive.init({
    getWorker: () => createArchiveWorker(workerPath),
  });
  const archive = await Archive.open(new File([file.buffer], file.originalname || `upload${fileExtension}`));
  try {
    const entries = await archive.extractFiles();
    const files = await flattenArchiveEntries(entries);
    const markdownParts = [];

    for (const entry of files) {
      const entryExtension = path.extname(entry.fileName || entry.path || '').toLowerCase();
      if (!entryExtension || entryExtension === fileExtension) continue;

      const result = await convertBufferToMarkdown(
        Buffer.from(entry.fileData),
        entryExtension,
        entry.fileName || entry.path,
      );
      if (result) {
        markdownParts.push(`## ${entry.fileName || entry.path}\n\n${result.markdown}`);
      }
    }

    if (!markdownParts.length) {
      throw new Error('Archive không chứa file tài liệu được hỗ trợ');
    }
    return markdownParts.join('\n\n');
  } finally {
    await archive.close();
  }
}

function createArchiveWorker(workerPath) {
  const worker = new Worker(workerPath);
  const listeners = new Map();
  worker.addEventListener = (type, listener) => {
    if (type !== 'message') return;
    const handler = (data) => listener({ data });
    listeners.set(listener, handler);
    worker.on('message', handler);
  };
  worker.removeEventListener = (type, listener) => {
    const handler = listeners.get(listener);
    if (type === 'message' && handler) {
      worker.off('message', handler);
      listeners.delete(listener);
    }
  };
  worker.start = () => {};
  return worker;
}

async function flattenArchiveEntries(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    for (const item of value) await flattenArchiveEntries(item, output);
    return output;
  }
  if (typeof File !== 'undefined' && value instanceof File) {
    output.push({
      fileData: await value.arrayBuffer(),
      fileName: value.name,
      path: value.name,
    });
    return output;
  }
  if (value.fileData instanceof ArrayBuffer && (value.fileName || value.path)) {
    output.push(value);
    return output;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) await flattenArchiveEntries(item, output);
  }
  return output;
}

async function convertBufferToMarkdown(buffer, fileExtension, originalName) {
  const markItDown = await getMarkItDown();
  const options = { file_extension: fileExtension };
  if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
    options.llmModel = await getImageModel();
    options.llmPrompt = 'Extract all visible text and structure from this document image as Markdown.';
  }
  const result = await markItDown.convertBuffer(buffer, options);
  if (!result || typeof result.markdown !== 'string' || !result.markdown.trim()) return null;
  return { markdown: result.markdown, title: result.title || null, originalName };
}

function convertXmlToMarkdown(buffer, originalName) {
  const document = new DOMParser().parseFromString(buffer.toString('utf8'), 'text/xml');
  const root = document.documentElement;
  if (!root || !root.nodeName) {
    throw new Error('XML không có phần tử gốc hợp lệ');
  }

  const lines = [`# ${root.nodeName}`];
  appendXmlElement(root, lines, 2, true);
  const markdown = lines.join('\n').trim();
  return { markdown, title: root.nodeName, originalName };
}

function appendXmlElement(element, lines, level, isRoot = false) {
  const attributes = Array.from(element.attributes || []);
  const childElements = Array.from(element.childNodes || []).filter((node) => node.nodeType === 1);
  const text = Array.from(element.childNodes || [])
    .filter((node) => node.nodeType === 3 || node.nodeType === 4)
    .map((node) => node.nodeValue.trim())
    .filter(Boolean)
    .join(' ');

  if (!isRoot) {
    lines.push(`${'#'.repeat(Math.min(level, 6))} ${element.nodeName}`);
  }
  for (const attribute of attributes) {
    lines.push(`- **@${attribute.name}:** ${escapeMarkdown(attribute.value)}`);
  }
  if (text) {
    lines.push(`- **Giá trị:** ${escapeMarkdown(text)}`);
  }
  if (attributes.length || text) lines.push('');

  for (const child of childElements) {
    appendXmlElement(child, lines, level + 1);
  }
}

function escapeMarkdown(value) {
  return value.replace(/[\\`*_{}[\]()#+\-.!|>]/g, '\\$&');
}

function getFileExtension(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  return extension || MIME_EXTENSION_MAP[file.mimetype] || '';
}

async function convertToMarkdown(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    const error = new Error('File upload không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const fileExtension = getFileExtension(file);
  if (!fileExtension) {
    const error = new Error('Không xác định được định dạng file để chuyển sang Markdown');
    error.statusCode = 400;
    throw error;
  }

  try {
    if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
      return {
        type: 'image',
        buffer: file.buffer,
        mimeType: file.mimetype || `image/${fileExtension.slice(1)}`,
        markdown: null,
        fileExtension,
        originalName: file.originalname || null,
      };
    }

    if (LIBARCHIVE_EXTENSIONS.has(fileExtension)) {
      const markdown = await convertLibarchive(file, fileExtension);
      return { markdown, title: null, fileExtension, originalName: file.originalname || null };
    }

    if (['.xml', '.rss', '.atom'].includes(fileExtension)) {
      let convertedXml = null;
      try {
        convertedXml = await convertBufferToMarkdown(file.buffer, fileExtension, file.originalname);
      } catch (cause) {
        if (!cause.message.includes('not supported')) throw cause;
      }
      const document = convertedXml || convertXmlToMarkdown(file.buffer, file.originalname);
      return {
        markdown: document.markdown,
        title: document.title || null,
        fileExtension,
        originalName: file.originalname || null,
      };
    }

    const markItDown = await getMarkItDown();
    const options = {
      file_extension: fileExtension,
    };
    const result = await markItDown.convertBuffer(file.buffer, options);

    if (!result || typeof result.markdown !== 'string' || !result.markdown.trim()) {
      throw new Error('MarkItDown không tạo được nội dung Markdown');
    }

    return {
      markdown: result.markdown,
      title: result.title || null,
      fileExtension,
      originalName: file.originalname || null,
    };
  } catch (cause) {
    const error = new Error(`Không thể chuyển file sang Markdown: ${cause.message}`);
    error.statusCode = 400;
    error.cause = cause;
    throw error;
  }
}

module.exports = { convertToMarkdown };