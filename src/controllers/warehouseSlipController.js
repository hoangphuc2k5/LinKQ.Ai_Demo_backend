const warehouseSlipService = require('../services/warehouseSlipService');
const documentAdapter = require('../adapters/documentAdapter');
const warehouseSlipRepository = require('../repositories/warehouseSlipRepository');

class WarehouseSlipController {
  list = async (req, res, next) => {
    try {
      res.json(await warehouseSlipRepository.findAll());
    } catch (error) {
      next(error);
    }
  };

  analyze = async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Vui lòng tải lên 1 tài liệu (field "file")' });
      }

      const document = await documentAdapter.convertToMarkdown(req.file);
      const slip = await warehouseSlipService.analyzeWarehouseSlipMarkdown(document);
      const saved = await warehouseSlipRepository.create(slip, req.file.originalname);
      res.status(201).json({ ...slip, ...saved });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new WarehouseSlipController();