const express = require('express');
const multer = require('multer');
const ocrController = require('../controllers/ocrController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      const error = new Error('OCR chỉ hỗ trợ file hình ảnh (JPG, JPEG, PNG, WEBP...)');
      error.statusCode = 400;
      return cb(error, false);
    }
    cb(null, true);
  },
});

router.post('/read', upload.single('file'), ocrController.read);

module.exports = router;