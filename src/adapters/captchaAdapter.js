const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { createWorker } = require('tesseract.js');

let workerPromise;

const CAPCHA_CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function buildWorker(language = 'eng') {
  if (!workerPromise) {
    workerPromise = createWorker(language, 1, {
      logger: () => {},
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: '8',
          tessedit_char_whitelist: CAPCHA_CHAR_WHITELIST,
          tessedit_ocr_engine_mode: '2',
          preserve_interword_spaces: '0',
          textord_heavy_nr: '1',
          textord_min_linesize: '2.5',
          edges_max_children_per_outline: '40',
          edges_max_children_layers: '5',
          edges_children_per_grandchild: '10',
          classify_bln_numeric_mode: '0',
          matcher_avg_cost_threshold: '0.5',
          tessedit_class_metrics: '0',
          language_model_penalty_non_dict_word: '0',
          language_model_penalty_non_freq_dict_word: '0',
          language_model_penalty_punc: '0',
          language_model_penalty_case: '0',
          language_model_penalty_script: '0',
          language_model_penalty_chartype: '0',
          language_model_penalty_capital: '0',
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

function normalizeCaptchaText(rawText = '') {
  return String(rawText || '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function getImageDataFromCanvas(canvas, x, y, width, height) {
  return canvas.getContext('2d').getImageData(x, y, width, height);
}

function luminanceAt(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function isDarkPixel(r, g, b, threshold = 180) {
  return luminanceAt(r, g, b) < threshold;
}

function clamp8(value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value | 0;
}

function applyContrastStretch(data, width, height) {
  let minLum = 255;
  let maxLum = 0;
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    const lum = luminanceAt(data[off], data[off + 1], data[off + 2]);
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum;
  if (range < 30) return data;

  const scale = 255 / range;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    const lum = luminanceAt(data[off], data[off + 1], data[off + 2]);
    const stretched = clamp8((lum - minLum) * scale);
    data[off] = stretched;
    data[off + 1] = stretched;
    data[off + 2] = stretched;
  }
  return data;
}

function applyUnsharpMask(data, width, height, amount = 0.8, radius = 1) {
  const original = new Uint8ClampedArray(data);
  const kSize = radius * 2 + 1;
  const kArea = kSize * kSize;

  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let sum = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        for (let kx = -radius; kx <= radius; kx += 1) {
          const px = x + kx;
          const py = y + ky;
          const off = (py * width + px) * 4;
          sum += luminanceAt(original[off], original[off + 1], original[off + 2]);
        }
      }
      const blurred = sum / kArea;
      const centerOff = (y * width + x) * 4;
      const centerLum = luminanceAt(
        original[centerOff],
        original[centerOff + 1],
        original[centerOff + 2],
      );
      const sharpened = clamp8(centerLum + amount * (centerLum - blurred));
      data[centerOff] = sharpened;
      data[centerOff + 1] = sharpened;
      data[centerOff + 2] = sharpened;
    }
  }
  return data;
}

function applyBinarize(data, width, height, options = {}) {
  const threshold = options.threshold ?? 170;
  const useAdaptive = options.adaptive !== false;
  const adaptiveRadius = options.adaptiveRadius ?? 15;
  const adaptiveC = options.adaptiveC ?? 12;

  const total = width * height;

  if (!useAdaptive) {
    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      const value = luminanceAt(data[off], data[off + 1], data[off + 2]) < threshold ? 0 : 255;
      data[off] = value;
      data[off + 1] = value;
      data[off + 2] = value;
      data[off + 3] = 255;
    }
    return data;
  }

  const integral = new Uint32Array(width * height + 1);
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      rowSum += luminanceAt(data[off], data[off + 1], data[off + 2]);
      integral[y * width + x + 1] = integral[y * width + x] + rowSum;
    }
    if (y > 0) {
      for (let x = 0; x <= width; x += 1) {
        integral[y * width + x] += integral[(y - 1) * width + x];
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - adaptiveRadius);
      const y1 = Math.max(0, y - adaptiveRadius);
      const x2 = Math.min(width - 1, x + adaptiveRadius);
      const y2 = Math.min(height - 1, y + adaptiveRadius);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[y2 * width + x2 + 1] -
        integral[y1 * width + x2 + 1] -
        integral[y2 * width + x1] +
        integral[y1 * width + x1];
      const localMean = sum / count;

      const off = (y * width + x) * 4;
      const lum = luminanceAt(data[off], data[off + 1], data[off + 2]);
      const value = lum < localMean - adaptiveC ? 0 : 255;
      data[off] = value;
      data[off + 1] = value;
      data[off + 2] = value;
      data[off + 3] = 255;
    }
  }
  return data;
}

function removeThinHorizontalAndVerticalLines(data, width, height) {
  const rowDarkCount = new Uint32Array(height);
  const colDarkCount = new Uint32Array(width);

  for (let y = 0; y < height; y += 1) {
    let darkCount = 0;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index] === 0) {
        darkCount += 1;
        colDarkCount[x] += 1;
      }
    }
    rowDarkCount[y] = darkCount;
  }

  const rowThreshold = Math.max(8, Math.floor(width * 0.55));
  const colThreshold = Math.max(8, Math.floor(height * 0.45));

  for (let y = 0; y < height; y += 1) {
    if (rowDarkCount[y] > rowThreshold) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = 255;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    if (colDarkCount[x] > colThreshold) {
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = 255;
      }
    }
  }

  return data;
}

function removeDotsOfSingleColor(data, width, height) {
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      if (data[center] !== 0) continue;
      let darkNeighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const off = ((y + dy) * width + (x + dx)) * 4;
          if (data[off] === 0) darkNeighbors += 1;
        }
      }
      if (darkNeighbors <= 1) {
        data[center] = 255;
        data[center + 1] = 255;
        data[center + 2] = 255;
      }
    }
  }
  return data;
}

function removeSmallNoise(data, width, height, minArea = 12) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const labels = new Int32Array(total);
  labels.fill(-1);
  let labelCount = 0;
  const components = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (visited[index]) continue;
      const offset = index * 4;
      if (data[offset] !== 0) {
        visited[index] = 1;
        continue;
      }

      const stack = [[x, y]];
      visited[index] = 1;
      const comp = {
        area: 0,
        minX: x,
        maxX: x,
        minY: y,
        maxY: y,
        pixels: [],
      };

      while (stack.length) {
        const [cx, cy] = stack.pop();
        const ci = cy * width + cx;
        labels[ci] = labelCount;
        comp.area += 1;
        comp.pixels.push([cx, cy]);
        if (cx < comp.minX) comp.minX = cx;
        if (cx > comp.maxX) comp.maxX = cx;
        if (cy < comp.minY) comp.minY = cy;
        if (cy > comp.maxY) comp.maxY = cy;

        const n8 = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
          [cx + 1, cy + 1],
          [cx - 1, cy - 1],
          [cx + 1, cy - 1],
          [cx - 1, cy + 1],
        ];
        for (const [nx, ny] of n8) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni]) continue;
          const noff = ni * 4;
          if (data[noff] === 0) {
            visited[ni] = 1;
            stack.push([nx, ny]);
          }
        }
      }

      components.push(comp);
      labelCount += 1;
    }
  }

  for (const comp of components) {
    const cw = comp.maxX - comp.minX + 1;
    const ch = comp.maxY - comp.minY + 1;
    const aspect = cw / Math.max(1, ch);
    const areaTooSmall = comp.area < minArea;
    const isTiny = cw < 2 && ch < 2;
    const isNeedle = (cw < 2 || ch < 2) && comp.area < Math.max(minArea, 6) * 2;
    const tooThin = (aspect > 6 || aspect < 1 / 6) && comp.area < minArea * 2;

    if (areaTooSmall || isTiny || isNeedle || tooThin) {
      for (const [cx, cy] of comp.pixels) {
        const pixelIndex = (cy * width + cx) * 4;
        data[pixelIndex] = 255;
        data[pixelIndex + 1] = 255;
        data[pixelIndex + 2] = 255;
        data[pixelIndex + 3] = 255;
      }
    }
  }

  return data;
}

function applyMorphClose(data, width, height, radius = 1) {
  const original = new Uint8ClampedArray(data);
  const kSize = radius * 2 + 1;
  const temp = new Uint8ClampedArray(data);

  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let found = false;
      for (let ky = -radius; ky <= radius && !found; ky += 1) {
        for (let kx = -radius; kx <= radius && !found; kx += 1) {
          const off = ((y + ky) * width + (x + kx)) * 4;
          if (original[off] === 0) {
            const to = (y * width + x) * 4;
            temp[to] = 0;
            temp[to + 1] = 0;
            temp[to + 2] = 0;
            found = true;
          }
        }
      }
    }
  }

  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let allDark = true;
      for (let ky = -radius; ky <= radius && allDark; ky += 1) {
        for (let kx = -radius; kx <= radius && allDark; kx += 1) {
          const off = ((y + ky) * width + (x + kx)) * 4;
          if (temp[off] !== 0) allDark = false;
        }
      }
      const to = (y * width + x) * 4;
      if (allDark) {
        data[to] = 0;
        data[to + 1] = 0;
        data[to + 2] = 0;
        data[to + 3] = 255;
      } else {
        data[to] = 255;
        data[to + 1] = 255;
        data[to + 2] = 255;
        data[to + 3] = 255;
      }
    }
  }

  void kSize;
  return data;
}

function applyMorphOpen(data, width, height, radius = 1) {
  const original = new Uint8ClampedArray(data);
  const kSize = radius * 2 + 1;
  const temp = new Uint8ClampedArray(data);

  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let allDark = true;
      for (let ky = -radius; ky <= radius && allDark; ky += 1) {
        for (let kx = -radius; kx <= radius && allDark; kx += 1) {
          const off = ((y + ky) * width + (x + kx)) * 4;
          if (original[off] !== 0) allDark = false;
        }
      }
      const to = (y * width + x) * 4;
      if (allDark) {
        temp[to] = 0;
        temp[to + 1] = 0;
        temp[to + 2] = 0;
      } else {
        temp[to] = 255;
        temp[to + 1] = 255;
        temp[to + 2] = 255;
      }
    }
  }

  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let found = false;
      for (let ky = -radius; ky <= radius && !found; ky += 1) {
        for (let kx = -radius; kx <= radius && !found; kx += 1) {
          const off = ((y + ky) * width + (x + kx)) * 4;
          if (temp[off] === 0) found = true;
        }
      }
      const to = (y * width + x) * 4;
      if (found) {
        data[to] = 0;
        data[to + 1] = 0;
        data[to + 2] = 0;
        data[to + 3] = 255;
      } else {
        data[to] = 255;
        data[to + 1] = 255;
        data[to + 2] = 255;
        data[to + 3] = 255;
      }
    }
  }

  void kSize;
  return data;
}

function findContentBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let anyDark = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index] !== 0) continue;
      anyDark = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!anyDark) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }

  return { minX, minY, maxX, maxY };
}

function normalizeImage(image, options = {}) {
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  applyContrastStretch(data, width, height);
  applyUnsharpMask(data, width, height, options.sharpen ?? 1.0, 1);
  applyBinarize(data, width, height, {
    threshold: options.threshold ?? 170,
    adaptive: options.adaptive !== false,
    adaptiveRadius: options.adaptiveRadius ?? 11,
    adaptiveC: options.adaptiveC ?? 14,
  });
  removeThinHorizontalAndVerticalLines(data, width, height);
  removeDotsOfSingleColor(data, width, height);
  removeSmallNoise(data, width, height, options.minArea ?? 10);
  applyMorphClose(data, width, height, options.closeRadius ?? 1);
  if (options.openRadius && options.openRadius > 0) {
    applyMorphOpen(data, width, height, options.openRadius);
  }
  removeDotsOfSingleColor(data, width, height);

  ctx.putImageData(imageData, 0, 0);

  const bounds = findContentBounds(data, width, height);
  const pad = options.padding ?? 14;
  const cropX = Math.max(0, bounds.minX - pad);
  const cropY = Math.max(0, bounds.minY - pad);
  const cropWidth = Math.min(width, bounds.maxX - bounds.minX + 1 + pad * 2);
  const cropHeight = Math.min(height, bounds.maxY - bounds.minY + 1 + pad * 2);

  const resultCanvas = createCanvas(cropWidth, cropHeight);
  const resultCtx = resultCanvas.getContext('2d');
  resultCtx.fillStyle = '#ffffff';
  resultCtx.fillRect(0, 0, cropWidth, cropHeight);
  resultCtx.imageSmoothingEnabled = false;
  resultCtx.putImageData(
    getImageDataFromCanvas(canvas, cropX, cropY, cropWidth, cropHeight),
    0,
    0,
  );

  const upscale = options.upscale ?? 1;
  if (upscale > 1) {
    const newW = cropWidth * upscale;
    const newH = cropHeight * upscale;
    const scaledCanvas = createCanvas(newW, newH);
    const scaledCtx = scaledCanvas.getContext('2d');
    scaledCtx.fillStyle = '#ffffff';
    scaledCtx.fillRect(0, 0, newW, newH);
    scaledCtx.imageSmoothingEnabled = false;
    scaledCtx.drawImage(resultCanvas, 0, 0, newW, newH);
    return scaledCanvas;
  }

  return resultCanvas;
}

async function solveCaptchaFromBuffer(fileBuffer, options = {}) {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new TypeError('Captcha buffer must be a Buffer');
  }

  const image = await loadImage(fileBuffer);
  const processedCanvas = normalizeImage(image, options);
  const buffer = processedCanvas.toBuffer('image/png');

  const worker = await buildWorker(options.language || 'eng');

  await worker.setParameters({
    tessedit_pageseg_mode: String(options.psm ?? 8),
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

  const result = await worker.recognize(buffer);
  const text = normalizeCaptchaText(result.data.text);

  return {
    text,
    confidence: Number(result.data.confidence || 0),
    rawText: result.data.text || '',
    buffer,
  };
}

async function solveCaptchaFromPath(filePath, options = {}) {
  const fs = require('fs/promises');
  const buffer = await fs.readFile(filePath);
  return solveCaptchaFromBuffer(buffer, options);
}

module.exports = {
  buildWorker,
  normalizeCaptchaText,
  normalizeImage,
  solveCaptchaFromBuffer,
  solveCaptchaFromPath,
  CAPCHA_CHAR_WHITELIST,
};

if (require.main === module) {
  const fs = require('fs');
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Usage: node captchaAdapter.js <captcha-image-path>');
    process.exit(1);
  }

  (async () => {
    try {
      const data = fs.readFileSync(inputPath);
      const result = await solveCaptchaFromBuffer(data, {
        threshold: 170,
        padding: 14,
        upscale: 3,
        minArea: 10,
        sharpen: 1.0,
        adaptive: true,
        adaptiveRadius: 11,
        adaptiveC: 14,
        closeRadius: 1,
        openRadius: 0,
      });
      console.log(JSON.stringify({
        text: result.text,
        confidence: result.confidence,
      }, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('Captcha solving failed:', error.message);
      process.exit(1);
    }
  })();
}
