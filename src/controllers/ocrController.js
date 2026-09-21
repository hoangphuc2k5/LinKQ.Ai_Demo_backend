const ocrService = require('../services/ocrService');

class OcrController {
  read = async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Vui lòng tải lên một ảnh (field "file")' });
      }
      res.json(await ocrService.readTextFromImage(req.file));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new OcrController();